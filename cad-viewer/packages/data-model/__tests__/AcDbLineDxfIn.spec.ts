import type { AcGePoint3d } from '@hy/geometry-engine'
import * as geometryEngine from '@hy/geometry-engine'

import { acdbHostApplicationServices, AcDbDxfFiler } from '../src/base'
import { AcDbDatabase } from '../src/database'
import { AcDbDxfDocumentReader } from '../src/dxf'
import { AcDbLine, AcDbTrace } from '../src/entity'
import { ByBlock, ByLayer } from '../src/misc'

/**
 * Counts the geometry objects that the entity `dxfIn` implementations allocate
 * themselves. The allocation-free `...Into` helpers and the +Z OCS shortcut are
 * counted separately, because the `dxfIn` bodies call them explicitly.
 */
jest.mock('@hy/geometry-engine', () => {
  const actual = jest.requireActual<typeof import('@hy/geometry-engine')>(
    '@hy/geometry-engine'
  )
  const counters = { line3d: 0, vector3d: 0, allocatingOcs: 0 }
  class CountingLine3d extends actual.AcGeLine3d {
    constructor(...args: ConstructorParameters<typeof actual.AcGeLine3d>) {
      super(...args)
      counters.line3d += 1
    }
  }
  class CountingVector3d extends actual.AcGeVector3d {
    constructor(...args: ConstructorParameters<typeof actual.AcGeVector3d>) {
      super(...args)
      counters.vector3d += 1
    }
  }
  return {
    ...actual,
    AcGeLine3d: CountingLine3d,
    AcGeVector3d: CountingVector3d,
    acgeTransformOcsPointToWcs: (
      ...args: Parameters<typeof actual.acgeTransformOcsPointToWcs>
    ) => {
      counters.allocatingOcs += 1
      return actual.acgeTransformOcsPointToWcs(...args)
    },
    __geoAllocCounters: counters
  }
})

/** Geometry temporaries allocated by data-model code through the mocked module. */
function alloc() {
  return (
    geometryEngine as unknown as {
      __geoAllocCounters: {
        line3d: number
        vector3d: number
        allocatingOcs: number
      }
    }
  ).__geoAllocCounters
}

/** Expands a whitespace-separated DXF pair list into `[code, value, ...]`. */
function pairs(text: string) {
  return text.trim().split(/\s+/)
}

/** Newline-separated pair text, the form `AcDbDxfFiler.fromString` expects. */
function dxfText(text: string) {
  return pairs(text).join('\n')
}

/** Wraps entity records in a minimal HEADER/TABLES/ENTITIES document. */
function buildDxf(...records: string[]) {
  return [
    ...pairs(`
      0 SECTION 2 HEADER
      9 $ACADVER 1 AC1024
      0 ENDSEC
      0 SECTION 2 TABLES
      0 TABLE 2 LAYER 70 1
      0 LAYER 2 0 70 0 62 7 6 Continuous
      0 ENDTAB
      0 ENDSEC
      0 SECTION 2 ENTITIES
    `),
    ...records.flatMap(pairs),
    ...pairs(`
      0 ENDSEC
      0 EOF
    `)
  ].join('\n')
}

/** `0 LINE` + handle + `100 AcDbEntity` + common pairs + `100 AcDbLine`. */
function lineRecord(handle: string, common: string, subclass: string) {
  return `0 LINE 5 ${handle} 100 AcDbEntity ${common} 100 AcDbLine ${subclass}`
}

/** Same, for SOLID/TRACE whose subclass marker is `AcDbTrace`. */
function traceRecord(
  dxfType: 'SOLID' | 'TRACE',
  handle: string,
  common: string,
  subclass: string
) {
  return `0 ${dxfType} 5 ${handle} 100 AcDbEntity ${common} 100 AcDbTrace ${subclass}`
}

async function loadDxf(records: string[]) {
  const db = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = db
  const filer = AcDbDxfFiler.fromString(buildDxf(...records), { database: db })
  await new AcDbDxfDocumentReader(db).read(filer)
  return [...db.tables.blockTable.modelSpace.newIterator()]
}

function points(trace: AcDbTrace) {
  return [0, 1, 2, 3].map(i => trace.getPointAt(i))
}

describe('AcDbLine/AcDbTrace dxfIn', () => {
  it('parses LINE geometry without touching the lazily materialized _geo', () => {
    const db = new AcDbDatabase()
    acdbHostApplicationServices().workingDatabase = db

    class SpyLine extends AcDbLine {
      override get startPoint(): AcGePoint3d {
        throw new Error('dxfIn must not read startPoint before assigning _geo')
      }
      override get endPoint(): AcGePoint3d {
        throw new Error('dxfIn must not read endPoint before assigning _geo')
      }
    }

    const filer = AcDbDxfFiler.fromString(
      dxfText(
        lineRecord(
          '400',
          '8 0',
          '10 1 20 2 30 3 11 4 21 5 31 6 210 0 220 0 230 1'
        )
      ),
      { database: db }
    )
    expect(filer.readItem()?.value).toBe('LINE')

    const spyLine = new SpyLine()
    spyLine.dxfIn(filer)
    expect(spyLine.normal).toMatchObject({ x: 0, y: 0, z: 1 })
  })

  it('allocates exactly one AcGeLine3d per LINE', () => {
    const db = new AcDbDatabase()
    acdbHostApplicationServices().workingDatabase = db
    const record = dxfText(
      lineRecord('401', '8 0', '10 1 20 2 30 3 11 4 21 5 31 6')
    )

    const before = { ...alloc() }
    for (let i = 0; i < 20; i++) {
      const filer = AcDbDxfFiler.fromString(record, { database: db })
      filer.readItem()
      new AcDbLine().dxfIn(filer)
    }
    const after = alloc()
    expect(after.line3d - before.line3d).toBe(20)
  })

  it('allocates no geometry temporaries per SOLID/TRACE', () => {
    const db = new AcDbDatabase()
    acdbHostApplicationServices().workingDatabase = db
    const record = dxfText(
      traceRecord(
        'SOLID',
        '402',
        '8 0',
        `10 0 20 0 30 1 11 10 21 0 31 1
         12 0 22 5 32 1 13 10 23 5 33 1 210 0 220 0 230 1`
      )
    )

    const traces = Array.from({ length: 20 }, () => new AcDbTrace())
    const before = { ...alloc() }
    for (let i = 0; i < traces.length; i++) {
      const filer = AcDbDxfFiler.fromString(record, { database: db })
      filer.readItem()
      traces[i].dxfIn(filer)
    }
    const after = alloc()
    expect(after.vector3d - before.vector3d).toBe(0)
    expect(after.allocatingOcs - before.allocatingOcs).toBe(0)
    expect(traces[0].getPointAt(0)).toMatchObject({ x: 0, y: 0, z: 1 })
  })

  it('keeps LINE geometry and linetype values identical to the pre-change parser', async () => {
    const entities = await loadDxf([
      // Plain 3D line, no extrusion group 210.
      lineRecord(
        '200',
        '8 0 6 Continuous',
        '10 10.5 20 20.25 30 30 11 40 21 -50 31 60'
      ),
      // Explicit unit +Z normal.
      lineRecord(
        '201',
        '8 0',
        '10 1 20 2 30 3 11 4 21 5 31 6 210 0 220 0 230 1'
      ),
      // Mirrored normal (0,0,-1): the OCS transform is not the identity.
      lineRecord(
        '202',
        '8 0',
        '10 1 20 2 30 3 11 4 21 5 31 6 210 0 220 0 230 -1'
      ),
      // Non-axis normal (0,3,4) normalizes to (0,0.6,0.8) and rotates points.
      lineRecord(
        '203',
        '8 0',
        '10 1 20 2 30 3 11 4 21 5 31 6 210 0 220 3 230 4'
      ),
      // No coordinate pairs: both endpoints keep the (0,0,0) default the former
      // `this.startPoint`/`endPoint` default reads produced.
      lineRecord('204', '8 0', ''),
      // 2D line: missing 30/31 keep z = 0.
      lineRecord('205', '8 0', '10 7 20 8 11 9 21 10')
    ])

    expect(entities).toHaveLength(6)
    const [a, explicitZ, mirrored, tilted, empty, flat] = entities as AcDbLine[]

    expect(a.startPoint).toMatchObject({ x: 10.5, y: 20.25, z: 30 })
    expect(a.endPoint).toMatchObject({ x: 40, y: -50, z: 60 })
    expect(a.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(a.thickness).toBe(0)
    expect(a.lineType).toBe('Continuous')

    expect(explicitZ.startPoint).toMatchObject({ x: 1, y: 2, z: 3 })
    expect(explicitZ.endPoint).toMatchObject({ x: 4, y: 5, z: 6 })
    expect(explicitZ.normal).toMatchObject({ x: 0, y: 0, z: 1 })

    expect(mirrored.startPoint).toMatchObject({ x: -1, y: 2, z: -3 })
    expect(mirrored.endPoint).toMatchObject({ x: -4, y: 5, z: -6 })
    expect(mirrored.normal).toMatchObject({ x: 0, y: 0, z: -1 })
    expect(mirrored.lineType).toBe(ByLayer)

    expect(tilted.startPoint.x).toBe(-1)
    expect(tilted.startPoint.y).toBe(0.20000000000000018)
    expect(tilted.startPoint.z).toBe(3.6000000000000005)
    expect(tilted.endPoint.x).toBe(-4)
    expect(tilted.endPoint.y).toBe(-0.39999999999999947)
    expect(tilted.endPoint.z).toBe(7.800000000000001)
    expect(tilted.normal).toMatchObject({
      x: 0,
      y: 0.6000000000000001,
      z: 0.8
    })

    expect(empty.startPoint).toMatchObject({ x: 0, y: 0, z: 0 })
    expect(empty.endPoint).toMatchObject({ x: 0, y: 0, z: 0 })
    expect(empty.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(empty.lineType).toBe(ByLayer)

    expect(flat.startPoint).toMatchObject({ x: 7, y: 8, z: 0 })
    expect(flat.endPoint).toMatchObject({ x: 9, y: 10, z: 0 })
  })

  it('keeps SOLID/TRACE corner and normal values identical to the pre-change parser', async () => {
    const solidCorners = `10 0 20 0 30 1 11 10 21 0 31 1
      12 0 22 5 32 1 13 10 23 5 33 1`
    const entities = await loadDxf([
      traceRecord('SOLID', '300', '8 0', solidCorners),
      traceRecord(
        'SOLID',
        '301',
        '8 0 6 ByBlock',
        `${solidCorners} 210 0 220 0 230 -1`
      ),
      traceRecord(
        'TRACE',
        '302',
        '8 0',
        `10 0 20 0 30 2 11 3 21 0 31 2
         12 0 22 4 32 2 13 3 23 4 33 2 210 0 220 1 230 0`
      ),
      // No codes at all: corners keep the eager (0,0,0) constructor values.
      traceRecord('SOLID', '303', '8 0', '')
    ])

    expect(entities).toHaveLength(4)
    const [solid, mirrored, tilted, empty] = entities as AcDbTrace[]

    expect(points(solid)).toEqual([
      { x: 0, y: 0, z: 1 },
      { x: 10, y: 0, z: 1 },
      { x: 0, y: 5, z: 1 },
      { x: 10, y: 5, z: 1 }
    ])
    expect(solid.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(solid.lineType).toBe(ByLayer)

    expect(points(mirrored)).toEqual([
      { x: 0, y: 0, z: -1 },
      { x: -10, y: 0, z: -1 },
      { x: 0, y: 5, z: -1 },
      { x: -10, y: 5, z: -1 }
    ])
    expect(mirrored.normal).toMatchObject({ x: 0, y: 0, z: -1 })
    expect(mirrored.lineType).toBe(ByBlock)

    expect(points(tilted)).toEqual([
      { x: 0, y: 2, z: 0 },
      { x: -3, y: 2, z: 0 },
      { x: 0, y: 2, z: 4 },
      { x: -3, y: 2, z: 4 }
    ])
    expect(tilted.normal).toMatchObject({ x: 0, y: 1, z: 0 })

    expect(points(empty)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 }
    ])
    expect(empty.normal).toMatchObject({ x: 0, y: 0, z: 1 })
  })

  it('normalizes linetype keywords case-insensitively from DXF group 6', async () => {
    const keywords = [
      'ByLayer',
      'BYLAYER',
      'bylayer',
      'ByLaYeR',
      'BYBLOCK',
      'ByBlock',
      'byblock',
      'Continuous',
      'CENTER',
      '小虚线'
    ]
    const entities = await loadDxf(
      keywords.map((keyword, index) =>
        lineRecord(String(206 + index), `8 0 6 ${keyword}`, '')
      )
    )

    expect(entities.map(entity => entity.lineType)).toEqual([
      ByLayer,
      ByLayer,
      ByLayer,
      ByLayer,
      ByBlock,
      ByBlock,
      ByBlock,
      'Continuous',
      'CENTER',
      '小虚线'
    ])
  })

  it('keeps the lineType setter semantics for empty and undefined values', () => {
    const line = new AcDbLine()

    line.lineType = ''
    expect(line.lineType).toBe(ByLayer)

    line.lineType = 'BYLAYER'
    expect(line.lineType).toBe(ByLayer)

    line.lineType = 'ByBlock'
    expect(line.lineType).toBe(ByBlock)

    line.lineType = 'DashDot'
    expect(line.lineType).toBe('DashDot')

    line.lineType = undefined as unknown as string
    expect(line.lineType).toBe(ByLayer)
  })
})

/**
 * Reads the private lazy-normal backing without going through the getter,
 * which would materialize the default `+Z` vector.
 */
function rawNormal(entity: AcDbLine | AcDbTrace) {
  const holder = entity as unknown as {
    _normal: { x: number; y: number; z: number } | null
  }
  return holder._normal
}

/** Positions the filer on the record type pair and returns the filer. */
function entityFiler(record: string) {
  const db = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = db
  const filer = AcDbDxfFiler.fromString(dxfText(record), { database: db })
  filer.readItem()
  return filer
}

describe('AcDbLine/AcDbTrace lazily materialized normal', () => {
  it('leaves the default normal unmaterialized for LINE records without 210', () => {
    const filer = entityFiler(
      lineRecord('420', '8 0', '10 10.5 20 20.25 30 30 11 40 21 -50 31 60')
    )
    const line = new AcDbLine()
    line.dxfIn(filer)

    expect(rawNormal(line)).toBeNull()
    expect(line.startPoint).toMatchObject({ x: 10.5, y: 20.25, z: 30 })
    expect(line.endPoint).toMatchObject({ x: 40, y: -50, z: 60 })
    // The first read materializes the default for that instance only.
    expect(line.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(rawNormal(line)).not.toBeNull()
  })

  it('leaves the default normal unmaterialized for SOLID/TRACE records without 210', () => {
    const filer = entityFiler(
      traceRecord(
        'SOLID',
        '421',
        '8 0',
        `10 0 20 0 30 1 11 10 21 0 31 1
         12 0 22 5 32 1 13 10 23 5 33 1`
      )
    )
    const trace = new AcDbTrace()
    trace.dxfIn(filer)

    expect(rawNormal(trace)).toBeNull()
    expect(trace.getPointAt(0)).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(trace.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(rawNormal(trace)).not.toBeNull()
  })

  it('materializes and normalizes a LINE normal only when 210 is present', () => {
    const filer = entityFiler(
      lineRecord(
        '422',
        '8 0',
        '10 1 20 2 30 3 11 4 21 5 31 6 210 0 220 3 230 4'
      )
    )
    const line = new AcDbLine()
    line.dxfIn(filer)

    expect(rawNormal(line)).toMatchObject({
      x: 0,
      y: 0.6000000000000001,
      z: 0.8
    })
    expect(line.normal).toMatchObject({
      x: 0,
      y: 0.6000000000000001,
      z: 0.8
    })
  })

  it('materializes a TRACE normal only when 210 is present', () => {
    const filer = entityFiler(
      traceRecord(
        'SOLID',
        '423',
        '8 0',
        `10 0 20 0 30 1 11 10 21 0 31 1
         12 0 22 5 32 1 13 10 23 5 33 1 210 0 220 0 230 -1`
      )
    )
    const trace = new AcDbTrace()
    trace.dxfIn(filer)

    expect(rawNormal(trace)).toMatchObject({ x: 0, y: 0, z: -1 })
    expect(trace.getPointAt(1)).toMatchObject({ x: -10, y: 0, z: -1 })
  })

  it('never shares the default normal between entities', () => {
    const line = new AcDbLine()
    const otherLine = new AcDbLine()
    line.normal.set(0, 1, 0)
    expect(otherLine.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(line.normal).toMatchObject({ x: 0, y: 1, z: 0 })

    const trace = new AcDbTrace()
    const otherTrace = new AcDbTrace()
    trace.normal = { x: 0, y: 0, z: -1 }
    expect(otherTrace.normal).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(trace.normal).toMatchObject({ x: 0, y: 0, z: -1 })

    // An in-place write on one instance must not leak into a fresh one.
    otherLine.normal = { x: 0, y: 0, z: -1 }
    expect(otherLine.normal).toMatchObject({ x: 0, y: 0, z: -1 })
    expect(line.normal).toMatchObject({ x: 0, y: 1, z: 0 })
    expect(new AcDbLine().normal).toMatchObject({ x: 0, y: 0, z: 1 })
  })
})

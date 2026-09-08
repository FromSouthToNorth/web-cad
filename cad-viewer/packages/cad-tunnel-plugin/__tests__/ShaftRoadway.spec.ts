import {
  AcDbDatabase,
  AcDbDxfFiler,
  acdbDxfInEntity,
  acdbHostApplicationServices
} from '@mlightcad/data-model'
import { AcGeMatrix3d, AcGePoint3d } from '@mlightcad/geometry-engine'

import { CoalBunker } from '../src/entity/CoalBunker'
import { ShaftRoadway } from '../src/entity/ShaftRoadway'

const groupValues = (dxf: string, code: number): string[] => {
  const lines = dxf.trim().split(/\r?\n/)
  const values: string[] = []
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (Number(lines[i]) === code) values.push(lines[i + 1])
  }
  return values
}

const createDb = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  acdbHostApplicationServices().workingDatabase = db
  return db
}

describe('ShaftRoadway', () => {
  beforeAll(() => {
    // Register the DXF factories once; the registry throws on duplicates.
    new ShaftRoadway().rxInit()
    new CoalBunker().rxInit()
  })

  it('defaults to the shaft symbol sizing and name', () => {
    const shaft = new ShaftRoadway()

    expect(shaft.type).toBe('ShaftCircle')
    expect(shaft.dxfTypeName).toBe('SHAFTCIRCLE')
    expect(shaft.name).toBe('立井')
    expect(shaft.id).toBe('')
    expect(shaft.radius).toBe(15)
    expect(shaft.outer).toBe(5)
    expect(shaft.bottom.x).toBe(0)
    expect(shaft.bottom.y).toBe(0)
    expect(shaft.top.z).toBe(0)
    expect(shaft.closed).toBe(true)
    expect(shaft.getOffsetCurves(2)).toEqual([])
  })

  it('stores bottom, top, id, name and sizing from the constructor', () => {
    const shaft = new ShaftRoadway(
      new AcGePoint3d(1, 2, 300),
      new AcGePoint3d(1, 2, 900),
      { id: 'SHAFT-1', name: '主立井', radius: 12, outer: 4 }
    )

    expect(shaft.bottom.z).toBe(300)
    expect(shaft.top.z).toBe(900)
    expect(shaft.id).toBe('SHAFT-1')
    expect(shaft.name).toBe('主立井')
    expect(shaft.radius).toBe(12)
    expect(shaft.outer).toBe(4)
    expect(shaft.area).toBeCloseTo(Math.PI * 16 * 16)

    const extents = shaft.geometricExtents
    expect(extents.min.x).toBeCloseTo(1 - 16)
    expect(extents.max.x).toBeCloseTo(1 + 16)
    expect(extents.min.y).toBeCloseTo(2 - 16)
    expect(extents.max.y).toBeCloseTo(2 + 16)
  })

  it('ignores invalid radius and outer values', () => {
    const shaft = new ShaftRoadway()
    shaft.radius = 0
    expect(shaft.radius).toBe(15)
    shaft.outer = -1
    expect(shaft.outer).toBe(5)
  })

  it('moves and rotates with transformBy', () => {
    const shaft = new ShaftRoadway(
      new AcGePoint3d(10, 0, 0),
      new AcGePoint3d(10, 0, 500)
    )

    shaft.transformBy(new AcGeMatrix3d().makeTranslation(5, -3, 2))
    expect(shaft.bottom.x).toBeCloseTo(15)
    expect(shaft.bottom.y).toBeCloseTo(-3)
    expect(shaft.bottom.z).toBeCloseTo(2)
    expect(shaft.top.z).toBeCloseTo(502)

    shaft.transformBy(new AcGeMatrix3d().makeRotationZ(Math.PI / 2))
    expect(shaft.bottom.x).toBeCloseTo(3)
    expect(shaft.bottom.y).toBeCloseTo(15)
  })

  it('exposes the 立井信息 property group with coordinates', () => {
    const shaft = new ShaftRoadway(
      new AcGePoint3d(11, 22, 33),
      new AcGePoint3d(44, 55, 66),
      { id: 'A-1', name: '副立井' }
    )

    const group = shaft.properties.groups.find(
      g => g.groupName === '立井信息'
    )
    expect(group).toBeDefined()
    expect(group!.properties.map(p => p.name)).toEqual([
      '巷道id',
      '巷道名称',
      '井底坐标X',
      '井底坐标Y',
      '井底坐标Z',
      '井口坐标X',
      '井口坐标Y',
      '井口坐标Z'
    ])
    const bottomZ = group!.properties.find(p => p.name === '井底坐标Z')!
    expect(bottomZ.editable).toBe(false)
    expect(bottomZ.accessor.get()).toBe(33)
    const topY = group!.properties.find(p => p.name === '井口坐标Y')!
    expect(topY.accessor.get()).toBe(55)

    const nameProperty = group!.properties.find(p => p.name === '巷道名称')!
    nameProperty.accessor.set!('新名称')
    expect(shaft.name).toBe('新名称')
  })

  it('writes the shaft fields and metadata XDATA', () => {
    const db = createDb()
    const shaft = new ShaftRoadway(
      new AcGePoint3d(1, 2, 300),
      new AcGePoint3d(1, 2, 900),
      { id: 'S-9', name: '主立井', radius: 15, outer: 5 }
    )
    db.tables.blockTable.modelSpace.appendEntity(shaft)

    const filer = new AcDbDxfFiler()
    shaft.dxfOutFields(filer)
    const dxf = filer.toString()

    expect(groupValues(dxf, 100)).toContain('AcDbShaftCircle')
    expect(groupValues(dxf, 40)).toEqual(['15'])
    expect(groupValues(dxf, 41)).toEqual(['5'])
    expect(groupValues(dxf, 1001)).toEqual(['SHAFT'])
    expect(groupValues(dxf, 1000)).toEqual(['S-9', '主立井'])
  })

  it('reads a SHAFTCIRCLE record back through the custom entity registry', () => {
    const dxf = [
      '0',
      'SHAFTCIRCLE',
      '5',
      '1A',
      '100',
      'AcDbEntity',
      '8',
      '0',
      '100',
      'AcDbShaftCircle',
      '10',
      '5',
      '20',
      '6',
      '30',
      '900',
      '11',
      '5',
      '21',
      '6',
      '31',
      '300',
      '40',
      '15',
      '41',
      '5',
      '1001',
      'SHAFT',
      '1000',
      '09134E1B-FDFE-4432-B55C-F62EFC51E000',
      '1000',
      '主立井',
      '0',
      'ENDSEC'
    ].join('\n')

    const entity = acdbDxfInEntity(AcDbDxfFiler.fromString(dxf))
    expect(entity).toBeInstanceOf(ShaftRoadway)

    const shaft = entity as ShaftRoadway
    expect(shaft.top.x).toBe(5)
    expect(shaft.top.y).toBe(6)
    expect(shaft.top.z).toBe(900)
    expect(shaft.bottom.x).toBe(5)
    expect(shaft.bottom.y).toBe(6)
    expect(shaft.bottom.z).toBe(300)
    expect(shaft.radius).toBe(15)
    expect(shaft.outer).toBe(5)
    expect(shaft.id).toBe('09134E1B-FDFE-4432-B55C-F62EFC51E000')
    expect(shaft.name).toBe('主立井')
  })
})

describe('CoalBunker', () => {
  it('is a shaft variant with bunker identity', () => {
    const bunker = new CoalBunker()

    expect(bunker).toBeInstanceOf(ShaftRoadway)
    expect(bunker.type).toBe('CoalBunker')
    expect(bunker.dxfTypeName).toBe('COALBUNKER')
    expect(bunker.name).toBe('煤仓')

    const group = bunker.properties.groups.find(
      g => g.groupName === '煤仓信息'
    )
    expect(group).toBeDefined()
  })

  it('reads a COALBUNKER record back through the custom entity registry', () => {
    const dxf = [
      '0',
      'COALBUNKER',
      '5',
      '2B',
      '100',
      'AcDbEntity',
      '8',
      '0',
      '100',
      'AcDbCoalBunker',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0',
      '11',
      '8',
      '21',
      '9',
      '31',
      '240',
      '40',
      '15',
      '41',
      '5',
      '1001',
      'BUNKER',
      '1000',
      'B-1',
      '1000',
      '煤仓1',
      '0',
      'ENDSEC'
    ].join('\n')

    const entity = acdbDxfInEntity(AcDbDxfFiler.fromString(dxf))
    expect(entity).toBeInstanceOf(CoalBunker)

    const bunker = entity as CoalBunker
    expect(bunker.bottom.x).toBe(8)
    expect(bunker.bottom.y).toBe(9)
    expect(bunker.bottom.z).toBe(240)
    expect(bunker.id).toBe('B-1')
    expect(bunker.name).toBe('煤仓1')
  })
})

import { AcCmColor } from '@mlightcad/common'
import { AcGePoint3d } from '@mlightcad/geometry-engine'

import { AcDbDxfFiler, acdbHostApplicationServices } from '../src/base'
import { AcDbDatabase } from '../src/database'
import { AcDbDxfDocumentReader } from '../src/dxf'
import { AcDbLine } from '../src/entity'

/**
 * Builds a minimal DXF document whose HEADER sets $CECOLOR to 4 (cyan) and
 * whose ENTITIES section carries lines with and without color group 62.
 */
function buildDxf(entityRecords: string[]) {
  return [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1024',
    '9', '$CECOLOR', '62', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '2',
    '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'Continuous',
    '0', 'LAYER', '2', 'WALLS', '70', '0', '62', '1', '6', 'Continuous',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    ...entityRecords,
    '0', 'ENDSEC',
    '0', 'EOF'
  ].join('\n')
}

const LINE_NO_COLOR = [
  '0', 'LINE', '8', 'WALLS',
  '10', '0', '20', '0', '30', '0',
  '11', '10', '21', '0', '31', '0'
]

async function loadDxf(dxf: string) {
  const db = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = db
  const filer = AcDbDxfFiler.fromString(dxf, { database: db })
  await new AcDbDxfDocumentReader(db).read(filer)
  return db
}

describe('DXF entity color defaults', () => {
  // Regression: drawings whose HEADER sets $CECOLOR to an explicit ACI (e.g.
  // 4) and whose entities omit color group 62 rendered every such entity in
  // the CECOLOR tint instead of ByLayer.
  it('defaults an entity without color group 62 to ByLayer, not CECOLOR', async () => {
    const db = await loadDxf(buildDxf(LINE_NO_COLOR))

    const [line] = [...db.tables.blockTable.modelSpace.newIterator()]
    expect(line.color.isByLayer).toBe(true)
    // ByLayer resolves against the entity's layer (WALLS = ACI 1, red)
    expect(line.resolvedColor.colorIndex).toBe(1)
  })

  it('keeps an explicit color group 62 as-is', async () => {
    const explicit = [
      '0', 'LINE', '8', '0', '62', '30',
      '10', '0', '20', '1', '30', '0',
      '11', '10', '21', '1', '31', '0'
    ]
    const db = await loadDxf(buildDxf(explicit))

    const [line] = [...db.tables.blockTable.modelSpace.newIterator()]
    expect(line.color.colorIndex).toBe(30)
    expect(line.resolvedColor.colorIndex).toBe(30)
  })

  it('still seeds programmatically appended entities from CECOLOR', () => {
    const db = new AcDbDatabase()
    acdbHostApplicationServices().workingDatabase = db
    db.cecolor = new AcCmColor().setRGBValue(0x336699)

    // Mimic API-created entity (no DXF round-trip): resolveEffectiveProperties
    // applies CECOLOR, mirroring AcDbEntity::setDatabaseDefaults.
    const line = new AcDbLine(
      new AcGePoint3d(0, 0, 0),
      new AcGePoint3d(1, 0, 0)
    )
    db.tables.blockTable.modelSpace.appendEntity(line)
    expect(line.color.RGB).toBe(0x336699)
  })
})

import {
  AcDbDatabase,
  AcDbDxfFiler,
  acdbDxfInEntity,
  acdbHostApplicationServices
} from '@mlightcad/data-model'

import { TunnelRoadway } from '../src/entity/TunnelRoadway'

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

describe('TunnelRoadway', () => {
  beforeAll(() => {
    // Register the DXF factory once; the registry throws on duplicates.
    new TunnelRoadway().rxInit()
  })

  it('extends the roadway with tunnel attributes and a property group', () => {
    const roadway = new TunnelRoadway(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      2,
      false,
      { tunnelName: '1105进风巷', tunnelType: '回风', coalbed: 'A1' }
    )

    expect(roadway.width).toBe(2)
    expect(roadway.dxfTypeName).toBe('TUNNELROADWAY')
    expect(roadway.tunnelName).toBe('1105进风巷')

    const group = roadway.properties.groups.find(
      g => g.groupName === '巷道信息'
    )
    expect(group).toBeDefined()
    expect(
      group!.properties.find(p => p.name === '巷道类型')!.accessor.get()
    ).toBe('回风')
    expect(
      group!.properties.find(p => p.name === '煤层')!.accessor.get()
    ).toBe('A1')
  })

  it('writes the tunnel attributes as XDATA after the centerline fields', () => {
    const db = createDb()
    const roadway = new TunnelRoadway(
      [
        { x: 1, y: 2 },
        { x: 5, y: 6 }
      ],
      3.5,
      false,
      { tunnelName: '主水仓', tunnelType: '硐室', coalbed: 'C2' }
    )
    db.tables.blockTable.modelSpace.appendEntity(roadway)

    const filer = new AcDbDxfFiler()
    roadway.dxfOutFields(filer)
    const dxf = filer.toString()

    expect(groupValues(dxf, 100)).toContain('AcDbRoadway')
    expect(groupValues(dxf, 40)).toEqual(['3.5'])
    expect(groupValues(dxf, 1001)).toEqual(['TUNNEL'])
    expect(groupValues(dxf, 1000)).toEqual(['主水仓', '硐室', 'C2'])
  })

  it('reads a TUNNELROADWAY record back through the custom entity registry', () => {
    const dxf = [
      '0',
      'TUNNELROADWAY',
      '5',
      '1A',
      '100',
      'AcDbEntity',
      '8',
      '0',
      '100',
      'AcDbRoadway',
      '40',
      '4.5',
      '90',
      '2',
      '70',
      '0',
      '38',
      '7',
      '10',
      '1',
      '20',
      '2',
      '10',
      '5',
      '20',
      '6',
      '1001',
      'TUNNEL',
      '1000',
      '1105进风巷',
      '1000',
      '回风',
      '1000',
      'A1',
      '0',
      'ENDSEC'
    ].join('\n')

    const entity = acdbDxfInEntity(AcDbDxfFiler.fromString(dxf))
    expect(entity).toBeInstanceOf(TunnelRoadway)

    const roadway = entity as TunnelRoadway
    expect(roadway.width).toBe(4.5)
    expect(roadway.elevation).toBe(7)
    expect(roadway.numberOfVertices).toBe(2)
    expect(roadway.tunnelName).toBe('1105进风巷')
    expect(roadway.tunnelType).toBe('回风')
    expect(roadway.coalbed).toBe('A1')
  })
})

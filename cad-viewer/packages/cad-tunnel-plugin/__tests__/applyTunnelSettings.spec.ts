import {
  AcDbDatabase,
  AcDbEntity,
  acdbHostApplicationServices,
  AcDbRoadway,
  AcDbText} from '@hy/data-model'

import { updateTunnelEntities } from '../src/applyTunnelSettings'
import {
  deriveAutoLabelHeight,
  setTunnelPluginOptions
} from '../src/config'
import { geojsonToEntities } from '../src/geojson/geojsonToEntities'

const createDb = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  acdbHostApplicationServices().workingDatabase = db
  return db
}

const collect = (db: AcDbDatabase): AcDbEntity[] => {
  const entities: AcDbEntity[] = []
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    entities.push(entity)
  }
  return entities
}

/**
 * Two parallel tunnels whose labels (anchored at the midpoints (5, 0) and
 * (5, 0.5)) overlap at label height 1.
 */
const drawTwoOverlappingTunnels = (db: AcDbDatabase): void => {
  const result = geojsonToEntities(
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { tunnelName: 'AA', tunnelType: '回风', coalbed: 'A1' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [10, 0]
            ]
          }
        },
        {
          type: 'Feature',
          properties: { tunnelName: 'BB' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0.5],
              [10, 0.5]
            ]
          }
        }
      ]
    },
    { labelHeight: 1, labelCollision: false }
  )
  db.tables.blockTable.modelSpace.appendEntity(result.entities)
}

describe('updateTunnelEntities', () => {
  beforeEach(() => {
    setTunnelPluginOptions({})
  })

  it('updates the roadway width and the label height', () => {
    const db = createDb()
    drawTwoOverlappingTunnels(db)

    const applied = updateTunnelEntities(db, {
      roadwayWidth: 5,
      labelHeight: 0.5
    })
    expect(applied.widthUpdated).toBe(2)
    expect(applied.heightUpdated).toBe(2)

    const entities = collect(db)
    const roadways = entities.filter(
      entity => entity instanceof AcDbRoadway
    ) as AcDbRoadway[]
    const texts = entities.filter(
      entity => entity instanceof AcDbText
    ) as AcDbText[]
    expect(roadways).toHaveLength(2)
    expect(roadways.every(roadway => roadway.width === 5)).toBe(true)
    expect(texts.every(text => text.height === 0.5)).toBe(true)
  })

  it('re-derives the automatic height when labelHeight is 0', () => {
    const db = createDb()
    drawTwoOverlappingTunnels(db)

    updateTunnelEntities(db, { labelHeight: 0 })

    const texts = collect(db).filter(
      entity => entity instanceof AcDbText
    ) as AcDbText[]
    // The anchors sit at (5, 0) and (5, 0.5), so the automatic height is
    // derived from that diagonal.
    const expected = deriveAutoLabelHeight(0.5)
    expect(texts.length).toBe(2)
    expect(texts.every(text => text.height === expected)).toBe(true)
  })

  it('hides colliding labels and shows them again when disabled', () => {
    const db = createDb()
    drawTwoOverlappingTunnels(db)

    const hidden = updateTunnelEntities(db, { labelCollision: true })
    expect(hidden.labelsShown).toBe(1)
    expect(hidden.labelsHidden).toBe(1)

    const texts = collect(db).filter(
      entity => entity instanceof AcDbText
    ) as AcDbText[]
    expect(texts.filter(text => text.visibility)).toHaveLength(1)

    const shown = updateTunnelEntities(db, { labelCollision: false })
    expect(shown.labelsShown).toBe(2)
    expect(shown.labelsHidden).toBe(0)
    expect(texts.every(text => text.visibility)).toBe(true)
  })

  it('leaves entities untouched when nothing matches', () => {
    const db = createDb()
    const applied = updateTunnelEntities(db, {
      roadwayWidth: 5,
      labelHeight: 0.5,
      labelCollision: true
    })
    expect(applied).toEqual({
      widthUpdated: 0,
      heightUpdated: 0,
      labelsShown: 0,
      labelsHidden: 0
    })
  })
})

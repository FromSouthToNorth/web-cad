import {
  AcCmColorMethod,
  AcDbDatabase,
  AcDbHatch,
  acdbHostApplicationServices,
  AcDbPoint,
  AcDbPolyline,
  AcDbRoadway,
  AcDbText,
  AcDbTextHorizontalMode,
  AcDbTextVerticalMode,
  HATCH_PATTERN_SOLID} from '@mlightcad/data-model'

import { CoalBunker } from '../src/entity/CoalBunker'
import { ShaftRoadway } from '../src/entity/ShaftRoadway'
import { TunnelRoadway } from '../src/entity/TunnelRoadway'
import { geojsonToEntities } from '../src/geojson/geojsonToEntities'
import type { GeoJsonFeature } from '../src/geojson/types'

const feature = (
  geometry: GeoJsonFeature['geometry'],
  properties: Record<string, unknown> = {}
): GeoJsonFeature => ({
  type: 'Feature',
  properties,
  geometry
})

/** A working database for conversions that touch database defaults (hatches). */
const createDb = () => {
  const db = new AcDbDatabase()
  db.createDefaultData()
  acdbHostApplicationServices().workingDatabase = db
  return db
}

const lineGeometry = (coordinates: number[][]) => ({
  type: 'LineString',
  coordinates
})

const polygonGeometry = (ring: number[][]) => ({
  type: 'Polygon',
  coordinates: [ring]
})

describe('geojsonToEntities', () => {
  it('converts tunnel-like LineStrings into AcDbRoadway entities', () => {
    const result = geojsonToEntities({
      type: 'FeatureCollection',
      features: [
        feature(
          lineGeometry([
            [96.61, 41.71, 1670],
            [96.62, 41.72, 1672],
            [96.63, 41.73, 1672]
          ]),
          { tunnelName: '1105进风巷', tunnelType: 0, color: '#808080' }
        )
      ]
    })

    expect(result.entityCount).toBe(2) // roadway + label
    expect(result.counts).toEqual({ point: 0, line: 1, area: 0, shaft: 0, text: 1 })
    expect(result.layers).toEqual(['巷道线', '巷道文字'])

    const roadway = result.entities.find(
      entity => entity instanceof AcDbRoadway
    ) as AcDbRoadway
    expect(roadway).toBeDefined()
    expect(roadway.numberOfVertices).toBe(3)
    expect(roadway.width).toBe(2)
    expect(roadway.closed).toBe(false)
    expect(roadway.layer).toBe('巷道线')
    expect(roadway.color.colorMethod).toBe(AcCmColorMethod.ByColor)
    expect(roadway.elevation).toBe(0) // default elevationMode 'ignore'
  })

  it('converts generic LineStrings into open AcDbPolyline entities', () => {
    const result = geojsonToEntities({
      type: 'FeatureCollection',
      features: [
        feature(
          lineGeometry([
            [0, 0],
            [10, 5]
          ]),
          { name: 'road' }
        )
      ]
    })

    const polyline = result.entities[0] as AcDbPolyline
    expect(polyline).toBeInstanceOf(AcDbPolyline)
    expect(polyline.numberOfVertices).toBe(2)
    expect(polyline.closed).toBe(false)
    expect(result.counts.line).toBe(1)
  })

  it('disables roadway detection with useRoadway: false', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            lineGeometry([
              [0, 0],
              [10, 5]
            ]),
            { tunnelName: '巷道', tunnelType: 0 }
          )
        ]
      },
      { useRoadway: false }
    )
    expect(result.entities[0]).toBeInstanceOf(AcDbPolyline)
  })

  it('converts Polygons into a closed outline plus a solid hatch', () => {
    const db = createDb()
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            polygonGeometry([
              [0, 0],
              [10, 0],
              [10, 5],
              [0, 5],
              [0, 0]
            ]),
            { name: '硐室', color: '#00ffff' }
          )
        ]
      },
      { db }
    )

    const outline = result.entities.find(
      entity => entity instanceof AcDbPolyline
    ) as AcDbPolyline
    const hatch = result.entities.find(
      entity => entity instanceof AcDbHatch
    ) as AcDbHatch

    expect(outline.closed).toBe(true)
    expect(outline.layer).toBe('巷道面')
    expect(hatch).toBeDefined()
    expect(hatch.patternName).toBe(HATCH_PATTERN_SOLID)
    expect(hatch.isSolidFill).toBe(true)
    expect(hatch.layer).toBe('巷道面')
    expect(result.counts.area).toBe(2)
  })

  it('skips the hatch when fillPolygons is false', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            polygonGeometry([
              [0, 0],
              [10, 0],
              [10, 5],
              [0, 5],
              [0, 0]
            ])
          )
        ]
      },
      { fillPolygons: false }
    )
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0]).toBeInstanceOf(AcDbPolyline)
    expect(result.counts.area).toBe(1)
  })

  it('converts Points into AcDbPoint entities', () => {
    const result = geojsonToEntities({
      type: 'FeatureCollection',
      features: [feature({ type: 'Point', coordinates: [96.6, 41.7, 1628] })]
    })

    const point = result.entities[0] as AcDbPoint
    expect(point).toBeInstanceOf(AcDbPoint)
    expect(point.position.x).toBeCloseTo(96.6)
    expect(point.position.y).toBeCloseTo(41.7)
    expect(point.position.z).toBe(0)
    expect(point.layer).toBe('巷道点')
    expect(result.counts.point).toBe(1)
  })

  it('preserves relative elevations with elevationMode: relative', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature({ type: 'Point', coordinates: [96.6, 41.7, 1628] }),
          feature({ type: 'Point', coordinates: [96.6, 41.7, 1728] })
        ]
      },
      { elevationMode: 'relative', labelField: null }
    )
    const points = result.entities as AcDbPoint[]
    expect(points[0].position.z).toBeCloseTo(0)
    expect(points[1].position.z).toBeCloseTo(100)
  })

  it('creates centered text labels from the label property', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            lineGeometry([
              [0, 0],
              [10, 0]
            ]),
            { name: 'test-label' }
          )
        ]
      },
      { labelField: 'name' }
    )

    const text = result.entities.find(
      entity => entity instanceof AcDbText
    ) as AcDbText
    expect(text).toBeDefined()
    expect(text.textString).toBe('test-label')
    expect(text.horizontalMode).toBe(AcDbTextHorizontalMode.CENTER)
    expect(text.verticalMode).toBe(AcDbTextVerticalMode.MIDDLE)
    expect(text.height).toBeGreaterThan(0)
    expect(text.layer).toBe('巷道文字')
  })

  it('supports a custom labelField and disables labels with null', () => {
    const collection = {
      type: 'FeatureCollection' as const,
      features: [
        feature(lineGeometry([[0, 0], [10, 0]]), { code: 'T-01' })
      ]
    }
    const custom = geojsonToEntities(collection, { labelField: 'code' })
    const text = custom.entities.find(
      entity => entity instanceof AcDbText
    ) as AcDbText
    expect(text.textString).toBe('T-01')

    const disabled = geojsonToEntities(collection, { labelField: null })
    expect(disabled.entities.some(entity => entity instanceof AcDbText)).toBe(
      false
    )
  })

  it('applies the fallback color to features without one', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(lineGeometry([[0, 0], [10, 0]]), { name: 'x' })
        ]
      },
      { color: '#123456', labelField: null }
    )
    expect(result.entities[0].color.colorMethod).toBe(AcCmColorMethod.ByColor)
  })

  it('reports empty results for undrawable input', () => {
    const result = geojsonToEntities({
      type: 'FeatureCollection',
      features: [
        feature({ type: 'LineString', coordinates: [[0, 0]] }),
        feature({ type: 'Bogus', coordinates: [[0, 0]] })
      ]
    })
    expect(result.entityCount).toBe(0)
    expect(result.featureCount).toBe(0)
    expect(result.layers).toEqual([])
  })

  it('overrides layer names through options', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature({ type: 'Point', coordinates: [0, 0] })
        ]
      },
      { layerNames: { point: 'MINE_POINT' }, labelField: null }
    )
    expect(result.entities[0].layer).toBe('MINE_POINT')
  })

  it('stores tunnel attributes on the TunnelRoadway entity', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            lineGeometry([
              [96.61, 41.71, 1670],
              [96.62, 41.72, 1672]
            ]),
            {
              tunnelName: '1105进风巷',
              tunnelType: '回风',
              coalbed: 'A1',
              color: '#808080'
            }
          )
        ]
      },
      { labelField: null }
    )

    const roadway = result.entities.find(
      entity => entity instanceof TunnelRoadway
    ) as TunnelRoadway
    expect(roadway).toBeInstanceOf(TunnelRoadway)
    expect(roadway.dxfTypeName).toBe('TUNNELROADWAY')
    expect(roadway.tunnelName).toBe('1105进风巷')
    expect(roadway.tunnelType).toBe('回风')
    expect(roadway.coalbed).toBe('A1')

    const group = roadway.properties.groups.find(
      g => g.groupName === '巷道信息'
    )
    expect(group).toBeDefined()
    expect(group!.properties.map(p => p.name)).toEqual([
      '巷道名称',
      '巷道类型',
      '煤层'
    ])
    const nameProperty = group!.properties.find(p => p.name === '巷道名称')!
    expect(nameProperty.accessor.get()).toBe('1105进风巷')
  })

  it('hides overlapping labels with the default collision pass', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature({ type: 'Point', coordinates: [0, 0] }, { tunnelName: 'AA' }),
          feature(
            { type: 'Point', coordinates: [0.001, 0] },
            { tunnelName: 'BB' }
          )
        ]
      },
      { labelHeight: 1 }
    )

    expect(result.counts.text).toBe(1)
    expect(result.labelsHidden).toBe(1)
    expect(result.entityCount).toBe(3) // 2 points + 1 visible label
  })

  it('draws every label when labelCollision is disabled', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature({ type: 'Point', coordinates: [0, 0] }, { tunnelName: 'AA' }),
          feature(
            { type: 'Point', coordinates: [0.001, 0] },
            { tunnelName: 'BB' }
          )
        ]
      },
      { labelHeight: 1, labelCollision: false }
    )

    expect(result.counts.text).toBe(2)
    expect(result.labelsHidden).toBe(0)
  })

  it('keeps the label of the longer line when labels collide', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            lineGeometry([
              [0, 0],
              [0.01, 0]
            ]),
            { tunnelName: 'AA' }
          ),
          feature(
            lineGeometry([
              [-0.02, 0.005],
              [0.02, 0.005]
            ]),
            { tunnelName: 'BB' }
          )
        ]
      },
      { labelHeight: 1 }
    )

    const texts = result.entities.filter(
      entity => entity instanceof AcDbText
    ) as AcDbText[]
    expect(texts).toHaveLength(1)
    expect(texts[0].textString).toBe('BB')
    expect(result.labelsHidden).toBe(1)
  })

  it('converts tunnelType 2 vertical lines into ShaftRoadway symbols', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            lineGeometry([
              [38443093.428, 4194099.619, 939.5],
              [38443093.428, 4194099.619, 315]
            ]),
            {
              id: '09134E1B-FDFE-4432-B55C-F62EFC51E000',
              tunnelName: '主立井',
              tunnelType: 2
            }
          )
        ]
      },
      { elevationMode: 'relative' }
    )

    expect(result.counts.shaft).toBe(1)
    expect(result.counts.line).toBe(0)
    expect(result.counts.text).toBe(1)
    expect(result.entityCount).toBe(2) // symbol + label

    const shaft = result.entities.find(
      entity => entity instanceof ShaftRoadway
    ) as ShaftRoadway
    expect(shaft).toBeInstanceOf(ShaftRoadway)
    expect(shaft.layer).toBe('巷道点')
    expect(shaft.name).toBe('主立井')
    expect(shaft.id).toBe('09134E1B-FDFE-4432-B55C-F62EFC51E000')
    expect(shaft.radius).toBe(15)
    expect(shaft.outer).toBe(5)
    // The deeper end anchors the symbol; the higher end is the mouth.
    expect(shaft.bottom.x).toBe(38443093.428)
    expect(shaft.bottom.y).toBe(4194099.619)
    expect(shaft.bottom.z).toBeCloseTo(0)
    expect(shaft.top.z).toBeCloseTo(624.5)

    // The label sits just above the outer ring.
    const text = result.entities.find(
      entity => entity instanceof AcDbText
    ) as AcDbText
    expect(text.textString).toBe('主立井')
    expect(text.alignmentPoint.y).toBeGreaterThan(
      shaft.bottom.y + shaft.radius + shaft.outer
    )
  })

  it('converts tunnelType 3 points into CoalBunker symbols', () => {
    const result = geojsonToEntities({
      type: 'FeatureCollection',
      features: [
        feature(
          { type: 'Point', coordinates: [100, 200, 30] },
          { id: 'B-1', tunnelName: '煤仓1', tunnelType: 3 }
        )
      ]
    })

    const bunker = result.entities.find(
      entity => entity instanceof CoalBunker
    ) as CoalBunker
    expect(bunker).toBeInstanceOf(CoalBunker)
    expect(bunker).toBeInstanceOf(ShaftRoadway)
    expect(bunker.name).toBe('煤仓1')
    expect(bunker.id).toBe('B-1')
    expect(result.counts.shaft).toBe(1)
    expect(result.counts.point).toBe(0)
  })

  it('applies the shaft sizing options to the special symbols', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            { type: 'Point', coordinates: [0, 0] },
            { tunnelType: 15 }
          )
        ]
      },
      { shaftRadius: 20, shaftOuter: 3, labelField: null }
    )

    const shaft = result.entities[0] as ShaftRoadway
    expect(shaft).toBeInstanceOf(ShaftRoadway)
    expect(shaft.radius).toBe(20)
    expect(shaft.outer).toBe(3)
  })

  it('keeps numeric tunnelType values on regular roadways', () => {
    const result = geojsonToEntities(
      {
        type: 'FeatureCollection',
        features: [
          feature(
            lineGeometry([
              [0, 0],
              [10, 0]
            ]),
            { tunnelName: '巷道136', tunnelType: 0 }
          ),
          feature(
            lineGeometry([
              [0, 5],
              [10, 5]
            ]),
            { tunnelName: '探巷', tunnelType: 25 }
          )
        ]
      },
      { labelField: null }
    )

    const roadways = result.entities.filter(
      entity => entity instanceof TunnelRoadway
    ) as TunnelRoadway[]
    expect(roadways).toHaveLength(2)
    expect(result.counts.shaft).toBe(0)
    expect(roadways[0].tunnelType).toBe('0')
    expect(roadways[1].tunnelType).toBe('25')
  })
})

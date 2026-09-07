import { parseTunnelGeoJson } from '../src/geojson/parseTunnelGeoJson'

const featureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { tunnelName: '主水仓' },
      geometry: { type: 'Point', coordinates: [96.6, 41.7, 1628] }
    }
  ]
}

describe('parseTunnelGeoJson', () => {
  it('passes a plain FeatureCollection through', () => {
    const result = parseTunnelGeoJson(featureCollection)
    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry?.type).toBe('Point')
  })

  it('wraps a single Feature into a FeatureCollection', () => {
    const result = parseTunnelGeoJson(featureCollection.features[0])
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(1)
  })

  it('wraps a bare geometry into a Feature with null properties', () => {
    const result = parseTunnelGeoJson({
      type: 'LineString',
      coordinates: [
        [96.6, 41.7],
        [96.61, 41.71]
      ]
    })
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties).toBeNull()
  })

  it('accepts an array of features', () => {
    const result = parseTunnelGeoJson([
      featureCollection.features[0],
      featureCollection.features[0]
    ])
    expect(result.features).toHaveLength(2)
  })

  it('unwraps the API envelope data.params.data (tunnel.json shape)', () => {
    const result = parseTunnelGeoJson({
      code: 100,
      mesg: null,
      data: {
        params: { data: featureCollection },
        generalFunc: 'TunnelLineString'
      }
    })
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(1)
  })

  it('unwraps a direct data field', () => {
    const result = parseTunnelGeoJson({ data: featureCollection })
    expect(result.features).toHaveLength(1)
  })

  it('throws for unrecognizable payloads', () => {
    expect(() => parseTunnelGeoJson({ foo: 'bar' })).toThrow()
    expect(() => parseTunnelGeoJson(null)).toThrow()
    expect(() => parseTunnelGeoJson(42)).toThrow()
  })

  it('drops non-feature entries from arrays', () => {
    const result = parseTunnelGeoJson([
      featureCollection.features[0],
      { nope: true }
    ])
    expect(result.features).toHaveLength(1)
  })
})

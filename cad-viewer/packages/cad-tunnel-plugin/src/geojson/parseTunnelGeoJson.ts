import {
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonGeometry
} from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFeature = (value: unknown): value is GeoJsonFeature =>
  isRecord(value) &&
  value.type === 'Feature' &&
  (value.properties == null || isRecord(value.properties))

const isGeometry = (value: unknown): value is GeoJsonGeometry =>
  isRecord(value) && typeof value.type === 'string' && 'coordinates' in value

/**
 * Unwraps common API envelopes around a GeoJSON document.
 *
 * Supported inputs:
 * - a plain GeoJSON FeatureCollection / Feature / geometry
 * - an array of features
 * - `{ data: { params: { data: <geojson> } } }` (the tunnel.json API shape)
 * - `{ data: <geojson> }`
 */
const unwrap = (input: unknown): unknown => {
  if (!isRecord(input)) return input
  if (isRecord(input.data)) {
    if (isRecord(input.data.params) && input.data.params.data != null) {
      return input.data.params.data
    }
    if (
      input.data.type === 'FeatureCollection' ||
      input.data.type === 'Feature' ||
      isGeometry(input.data)
    ) {
      return input.data
    }
  }
  return input
}

/**
 * Normalizes a GeoJSON payload (possibly wrapped in an API envelope) into a
 * FeatureCollection.
 *
 * @param input - Parsed JSON payload (plain GeoJSON or API envelope).
 * @returns The extracted FeatureCollection.
 * @throws When the payload is not a recognizable GeoJSON document.
 */
export function parseTunnelGeoJson(input: unknown): GeoJsonFeatureCollection {
  const payload = unwrap(input)

  if (isRecord(payload) && payload.type === 'FeatureCollection') {
    const features = payload.features
    if (Array.isArray(features)) {
      return {
        type: 'FeatureCollection',
        features: features.filter(isFeature) as GeoJsonFeature[]
      }
    }
    throw new Error('GeoJSON FeatureCollection is missing its features array')
  }

  if (isFeature(payload)) {
    return { type: 'FeatureCollection', features: [payload] }
  }

  if (isGeometry(payload)) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: payload
        }
      ]
    }
  }

  if (Array.isArray(payload)) {
    const features = payload.filter(isFeature) as GeoJsonFeature[]
    if (features.length > 0) {
      return { type: 'FeatureCollection', features }
    }
  }

  throw new Error(
    'Payload is not GeoJSON (expected FeatureCollection, Feature, geometry or a data.params.data envelope)'
  )
}

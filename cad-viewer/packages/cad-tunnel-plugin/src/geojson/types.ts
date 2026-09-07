/** Minimal GeoJSON type definitions (RFC 7946 subset used by this plugin). */

/** A GeoJSON position: [longitude, latitude, elevation?]. */
export type Position = number[]

export type GeoJsonGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection'

export interface GeoJsonGeometry {
  type: GeoJsonGeometryType | string
  /** Position, Position[], Position[][] or Position[][][] depending on `type`. */
  coordinates?: unknown
  geometries?: GeoJsonGeometry[]
}

export interface GeoJsonFeature {
  id?: string
  type: 'Feature'
  /** Feature attributes (tunnelName / tunnelType / color / ...). */
  properties: Record<string, unknown> | null
  geometry: GeoJsonGeometry | null
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

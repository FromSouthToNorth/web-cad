/**
 * Tunnel (巷道) drawing plugin for cad-simple-viewer based applications.
 *
 * @packageDocumentation
 */

export { AcApTunnelPlugin } from './AcApTunnelPlugin'
export { updateTunnelEntities } from './applyTunnelSettings'
export type {
  TunnelSettingsResult,
  TunnelSettingsUpdate
} from './applyTunnelSettings'
export { createTunnelPlugin } from './createTunnelPlugin'
export {
  AUTO_LABEL_HEIGHT_FACTOR,
  deriveAutoLabelHeight,
  DRAWTUNNEL_COMMAND_NAME,
  TUNNELCLEAR_COMMAND_NAME,
  TUNNEL_PLUGIN_NAME,
  TUNNELSETTINGS_COMMAND_NAME
} from './config'
export type {
  GeoJsonToEntitiesOptions,
  TunnelDrawCounts,
  TunnelDrawOptions,
  TunnelDrawResult,
  TunnelElevationMode,
  TunnelLayerNames
} from './config'
export { CoalBunker } from './entity/CoalBunker'
export {
  DEFAULT_SHAFT_OUTER,
  DEFAULT_SHAFT_RADIUS,
  ShaftRoadway
} from './entity/ShaftRoadway'
export type { ShaftRoadwayInfo } from './entity/ShaftRoadway'
export { TunnelRoadway } from './entity/TunnelRoadway'
export type { TunnelRoadwayInfo } from './entity/TunnelRoadway'
export { geojsonToEntities } from './geojson/geojsonToEntities'
export { parseTunnelGeoJson } from './geojson/parseTunnelGeoJson'
export type {
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonGeometry
} from './geojson/types'
export { registerTunnelI18n, tunnelT } from './i18n'
export {
  estimateLabelWidth,
  labelBoxOf,
  labelsOverlap,
  selectNonOverlapping
} from './labelCollision'
export type { LabelBox } from './labelCollision'
export { registerTunnelPlugin } from './register'

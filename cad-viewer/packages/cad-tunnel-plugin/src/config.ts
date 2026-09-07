import type { AcDbEntity } from '@mlightcad/data-model'

import { DEFAULT_SHAFT_OUTER, DEFAULT_SHAFT_RADIUS } from './entity/ShaftRoadway'

/** Plugin name used by {@link AcApTunnelPlugin}. */
export const TUNNEL_PLUGIN_NAME = 'TunnelPlugin'

/** Global name of the draw command. */
export const DRAWTUNNEL_COMMAND_NAME = 'drawtunnel'

/** Global name of the clear command. */
export const TUNNELCLEAR_COMMAND_NAME = 'tunnelclear'

/** Global name of the settings panel toggle command. */
export const TUNNELSETTINGS_COMMAND_NAME = 'tunnelsettings'

/** Per-category layer names used by the plugin. */
export interface TunnelLayerNames {
  /** Layer receiving point entities. */
  point: string
  /** Layer receiving line entities (roadways / polylines). */
  line: string
  /** Layer receiving polygon outlines and hatches. */
  area: string
  /** Layer receiving text labels. */
  text: string
}

export const DEFAULT_TUNNEL_LAYER_NAMES: TunnelLayerNames = {
  point: '巷道点',
  line: '巷道线',
  area: '巷道面',
  text: '巷道文字'
}

/** Diagonal multiplier used to derive the automatic label height from the data extent. */
export const AUTO_LABEL_HEIGHT_FACTOR = 0.0035

/**
 * Derives the automatic label height from the 2D extent diagonal.
 *
 * Kept small enough that a full-width name stays well below ~2% of the
 * viewport width when the drawing is zoomed to fit; `2` is the fallback for
 * datasets without a meaningful extent.
 */
export function deriveAutoLabelHeight(diagonal: number): number {
  return diagonal > 0 ? diagonal * AUTO_LABEL_HEIGHT_FACTOR : 2
}

/**
 * How the elevation (3rd coordinate) of GeoJSON positions is applied to the
 * drawn entities.
 *
 * - `ignore` (default): everything is drawn in the XY plane (z = 0). The
 *   viewer camera only covers a limited depth band, so absolute elevations
 *   (e.g. sea-level mine elevations of 1600–2000) would be clipped.
 * - `relative`: z is shifted so the smallest z in the dataset becomes 0,
 *   preserving relative height differences while staying visible.
 */
export type TunnelElevationMode = 'ignore' | 'relative'

/** Options controlling how GeoJSON data is turned into drawing entities. */
export interface TunnelDrawOptions {
  /**
   * GeoJSON data URL used when the `drawtunnel` command runs without user
   * input. Any HTTP(S) URL or same-origin relative path is accepted.
   */
  url?: string
  /** Per-category layer name overrides (merged over the defaults). */
  layerNames?: Partial<TunnelLayerNames>
  /**
   * Feature property key used as the text label, e.g. `'tunnelName'`
   * (default). Set to `null` to disable labels.
   */
  labelField?: string | null
  /** Text label height in drawing units; `0`/omitted auto-derives from the data extent. */
  labelHeight?: number
  /**
   * When `true` (default), text labels that would overlap each other are
   * hidden (longer/larger features keep their label). When `false` every
   * feature label is drawn.
   */
  labelCollision?: boolean
  /** Width (drawing units) for roadway entities created from tunnel lines. */
  roadwayWidth?: number
  /**
   * Symbol circle radius (drawing units) for the special shaft/bunker
   * entities created from features whose `tunnelType` is 1, 2, 3, 9 or 15.
   * Defaults to {@link DEFAULT_SHAFT_RADIUS}.
   */
  shaftRadius?: number
  /**
   * Extra width of the outer ring of the shaft/bunker symbols, in drawing
   * units. Defaults to {@link DEFAULT_SHAFT_OUTER}.
   */
  shaftOuter?: number
  /**
   * When `true` (default), LineString features that look like tunnels
   * (carry `tunnelType` / `tunnelName` / `coalbed` properties) become
   * `AcDbRoadway` custom entities; other LineStrings become plain polylines.
   */
  useRoadway?: boolean
  /** When `true` (default), Polygon rings get a SOLID hatch fill in addition to the outline. */
  fillPolygons?: boolean
  /** Z handling, see {@link TunnelElevationMode}. */
  elevationMode?: TunnelElevationMode
  /** When `true` (default), zoom to the drawing extents after drawing. */
  fitView?: boolean
  /** Fallback color (CSS hex like `#808080`) for features without `color`. */
  color?: string
}

/** Per-category entity counts produced by one conversion run. */
export interface TunnelDrawCounts {
  point: number
  line: number
  area: number
  /** Special shaft/bunker symbols (tunnelType 1, 2, 3, 9, 15). */
  shaft: number
  text: number
}

/** Result of converting a FeatureCollection into drawing entities. */
export interface TunnelDrawResult {
  /** Number of input features that produced at least one entity. */
  featureCount: number
  /** Total number of entities created. */
  entityCount: number
  /** Per-category entity counts. */
  counts: TunnelDrawCounts
  /** Number of labels suppressed by collision culling. */
  labelsHidden: number
  /** Layer names that were actually used (subset of the configured names). */
  layers: string[]
  /** The created entities, ready to be appended to the model space. */
  entities: AcDbEntity[]
}

/** Options for {@link geojsonToEntities}. */
export interface GeoJsonToEntitiesOptions extends TunnelDrawOptions {
  /**
   * Optional database; when present it is assigned to hatch entities before
   * their boundary loops are added (hatch defaults consult the database).
   */
  db?: import('@mlightcad/data-model').AcDbDatabase
}

/** A fully resolved option set with all defaults applied. */
export interface ResolvedTunnelDrawOptions {
  url?: string
  layerNames: TunnelLayerNames
  labelField: string | null
  labelHeight: number
  labelCollision: boolean
  roadwayWidth: number
  shaftRadius: number
  shaftOuter: number
  useRoadway: boolean
  fillPolygons: boolean
  elevationMode: TunnelElevationMode
  fitView: boolean
  color?: string
}

/** Resolves a full option set against the plugin defaults. */
export function resolveTunnelDrawOptions(
  options?: TunnelDrawOptions
): ResolvedTunnelDrawOptions {
  const layerNames = {
    ...DEFAULT_TUNNEL_LAYER_NAMES,
    ...(options?.layerNames ?? {})
  }
  return {
    url: options?.url,
    layerNames,
    labelField:
      options?.labelField === undefined ? 'tunnelName' : options.labelField,
    labelHeight: options?.labelHeight ?? 0,
    labelCollision: options?.labelCollision ?? true,
    roadwayWidth: options?.roadwayWidth ?? 2,
    shaftRadius: options?.shaftRadius ?? DEFAULT_SHAFT_RADIUS,
    shaftOuter: options?.shaftOuter ?? DEFAULT_SHAFT_OUTER,
    useRoadway: options?.useRoadway ?? true,
    fillPolygons: options?.fillPolygons ?? true,
    elevationMode: options?.elevationMode ?? 'ignore',
    fitView: options?.fitView ?? true,
    color: options?.color
  }
}

let pluginOptions: TunnelDrawOptions = {}

/** Stores the option set used by the draw/clear commands (call before load). */
export function setTunnelPluginOptions(options: TunnelDrawOptions): void {
  pluginOptions = { ...options }
}

/** Returns the option set registered with {@link setTunnelPluginOptions}. */
export function getTunnelPluginOptions(): TunnelDrawOptions {
  return pluginOptions
}

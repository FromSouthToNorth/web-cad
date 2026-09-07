import {
  AcCmColor,
  AcDbEntity,
  AcDbHatch,
  AcDbHatchPatternType,
  AcDbHatchStyle,
  AcDbPoint,
  AcDbPolyline,
  AcDbText,
  AcDbTextHorizontalMode,
  AcDbTextVerticalMode,
  HATCH_PATTERN_SOLID
} from '@mlightcad/data-model'
import {
  AcGeLine2d,
  AcGeLoop2d,
  AcGePoint2d,
  AcGePoint3d
} from '@mlightcad/geometry-engine'

import {
  deriveAutoLabelHeight,
  GeoJsonToEntitiesOptions,
  resolveTunnelDrawOptions,
  TunnelDrawCounts,
  TunnelDrawResult} from '../config'
import { CoalBunker } from '../entity/CoalBunker'
import {
  ShaftRoadway,
  ShaftRoadwayInfo
} from '../entity/ShaftRoadway'
import { TunnelRoadway } from '../entity/TunnelRoadway'
import { labelBoxOf, selectNonOverlapping } from '../labelCollision'
import {
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  Position
} from './types'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const NAMED_COLOR = /^[a-zA-Z]+$/

/** `tunnelType` values drawn as a vertical shaft (立井巷道) symbol. */
const SHAFT_TUNNEL_TYPES = new Set<number>([1, 2, 9, 15])

/** `tunnelType` value drawn as a coal bunker (煤仓) symbol. */
const BUNKER_TUNNEL_TYPES = new Set<number>([3])

type SpecialTunnelKind = 'shaft' | 'bunker'

/**
 * Which special symbol a feature's `tunnelType` selects: `shaft` for
 * 1/2/9/15, `bunker` for 3, undefined for everything else. Numeric and
 * numeric-string values are both accepted.
 */
function specialTunnelKind(
  properties: Record<string, unknown>
): SpecialTunnelKind | undefined {
  const raw = properties.tunnelType
  if (raw == null) return undefined
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : NaN
  if (!Number.isFinite(value)) return undefined
  if (SHAFT_TUNNEL_TYPES.has(value)) return 'shaft'
  if (BUNKER_TUNNEL_TYPES.has(value)) return 'bunker'
  return undefined
}

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number'

/** Calls `visit` for every coordinate position in a geometry tree. */
function walkPositions(
  geometry: GeoJsonGeometry | null | undefined,
  visit: (position: Position) => void
): void {
  if (!geometry) return
  switch (geometry.type) {
    case 'Point': {
      if (isPosition(geometry.coordinates)) visit(geometry.coordinates)
      break
    }
    case 'MultiPoint':
    case 'LineString': {
      const list = geometry.coordinates
      if (Array.isArray(list)) {
        for (const position of list) if (isPosition(position)) visit(position)
      }
      break
    }
    case 'MultiLineString':
    case 'Polygon': {
      const rings = geometry.coordinates
      if (Array.isArray(rings)) {
        for (const ring of rings) {
          if (!Array.isArray(ring)) continue
          for (const position of ring) {
            if (isPosition(position)) visit(position)
          }
        }
      }
      break
    }
    case 'MultiPolygon': {
      const polygons = geometry.coordinates
      if (Array.isArray(polygons)) {
        for (const rings of polygons) {
          if (!Array.isArray(rings)) continue
          for (const ring of rings) {
            if (!Array.isArray(ring)) continue
            for (const position of ring) {
              if (isPosition(position)) visit(position)
            }
          }
        }
      }
      break
    }
    case 'GeometryCollection': {
      const geometries = geometry.geometries
      if (Array.isArray(geometries)) {
        for (const child of geometries) walkPositions(child, visit)
      }
      break
    }
    default:
      break
  }
}

/** Parses a CSS color (hex or named) into an entity color; undefined when unset/invalid. */
function parseColor(css: string | undefined): AcCmColor | undefined {
  if (!css) return undefined
  const value = css.trim()
  if (!HEX_COLOR.test(value) && !NAMED_COLOR.test(value)) return undefined
  const color = new AcCmColor()
  color.setRGBFromCss(value)
  return color
}

/**
 * Whether a feature is tunnel-like. Tunnel features become `AcDbRoadway`
 * custom entities (centerline + width); generic lines become polylines.
 */
function isTunnelFeature(properties: Record<string, unknown>): boolean {
  return (
    properties.tunnelType != null ||
    properties.tunnelName != null ||
    properties.coalbed != null
  )
}

interface ConvertContext {
  layerNames: { point: string; line: string; area: string; text: string }
  labelField: string | null
  labelHeight: number
  labelCollision: boolean
  roadwayWidth: number
  shaftRadius: number
  shaftOuter: number
  useRoadway: boolean
  fillPolygons: boolean
  elevationMode: 'ignore' | 'relative'
  color: string | undefined
  minZ: number
  db?: import('@mlightcad/data-model').AcDbDatabase
  entities: AcDbEntity[]
  counts: TunnelDrawCounts
  usedLayers: Set<string>
  featureCount: number
  pendingLabels: LabelCandidate[]
}

/** A queued label whose visibility is resolved after all features convert. */
interface LabelCandidate {
  label: string
  anchor: AcGePoint3d
  color: AcCmColor | undefined
  /** Larger values keep their label when labels collide. */
  priority: number
  /** Stable tiebreaker: the feature's position in the collection. */
  featureIndex: number
}

const zOf = (ctx: ConvertContext, position: Position): number =>
  ctx.elevationMode === 'relative' ? (position[2] ?? 0) - ctx.minZ : 0

const toPoint3d = (ctx: ConvertContext, position: Position): AcGePoint3d =>
  new AcGePoint3d(position[0], position[1], zOf(ctx, position))

/** Assigns layer (and color, when present) to a freshly built entity. */
function applyCommon(
  ctx: ConvertContext,
  entity: AcDbEntity,
  color: AcCmColor | undefined,
  layer: string
): void {
  entity.layer = layer
  ctx.usedLayers.add(layer)
  if (color) entity.color = color
}

/** Creates a centered text label at the anchor point. */
function createTextLabel(
  ctx: ConvertContext,
  label: string,
  anchor: AcGePoint3d,
  color: AcCmColor | undefined
): void {
  const text = new AcDbText()
  text.textString = label
  text.horizontalMode = AcDbTextHorizontalMode.CENTER
  text.verticalMode = AcDbTextVerticalMode.MIDDLE
  text.alignmentPoint = anchor
  text.height = ctx.labelHeight
  applyCommon(ctx, text, color, ctx.layerNames.text)
  ctx.entities.push(text)
  ctx.counts.text++
}

/**
 * Queues a label candidate instead of creating it directly: the final
 * visibility pass (collision culling) runs after every feature has converted
 * so longer features can keep their label over shorter, overlapping ones.
 */
function queueLabel(
  ctx: ConvertContext,
  label: string,
  anchor: AcGePoint3d,
  color: AcCmColor | undefined,
  priority: number,
  featureIndex: number
): void {
  ctx.pendingLabels.push({ label, anchor, color, priority, featureIndex })
}

/**
 * Resolves which queued labels are drawn. With collision culling enabled the
 * candidates are sorted by priority (longest geometry first) and kept
 * greedily when their boxes do not overlap an already-kept label; otherwise
 * every candidate survives.
 */
function resolveLabelVisibility(ctx: ConvertContext): LabelCandidate[] {
  const candidates = ctx.pendingLabels
  if (candidates.length === 0 || !ctx.labelCollision) return candidates

  const entries = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      box: labelBoxOf(
        candidate.anchor.x,
        candidate.anchor.y,
        candidate.label,
        ctx.labelHeight
      )
    }))
    .sort(
      (a, b) => b.candidate.priority - a.candidate.priority || a.index - b.index
    )

  const keep = selectNonOverlapping(entries.map(entry => entry.box))
  return entries
    .filter((_entry, index) => keep[index])
    .map(entry => entry.candidate)
}

const featureLabel = (
  ctx: ConvertContext,
  properties: Record<string, unknown>
): string | undefined => {
  if (!ctx.labelField) return undefined
  const value = properties[ctx.labelField]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** String (or finite-number) property of a feature, or undefined. */
const stringProp = (
  properties: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = properties[key]
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/**
 * Label priority of a feature: longer lines / bigger polygons keep their
 * name when labels collide. Points rank lowest.
 */
function geometryPriority(geometry: GeoJsonGeometry | null): number {
  if (!geometry) return 0
  switch (geometry.type) {
    case 'LineString': {
      const list = geometry.coordinates
      return Array.isArray(list) ? positionsLength(list.filter(isPosition)) : 0
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates
      if (!Array.isArray(lines)) return 0
      let longest = 0
      for (const line of lines) {
        if (Array.isArray(line)) {
          longest = Math.max(longest, positionsLength(line.filter(isPosition)))
        }
      }
      return longest
    }
    case 'Polygon': {
      const outer = Array.isArray(geometry.coordinates)
        ? geometry.coordinates[0]
        : undefined
      const ring = Array.isArray(outer) ? outer.filter(isPosition) : []
      return ring.length < 3 ? 0 : positionsLength(ring, true)
    }
    default:
      return 0
  }
}

/** Sum of segment lengths, optionally closing the ring (polygon perimeter). */
function positionsLength(positions: Position[], closed = false): number {
  if (positions.length < 2) return 0
  let total = 0
  for (let i = 1; i < positions.length; i++) {
    total += Math.hypot(
      positions[i][0] - positions[i - 1][0],
      positions[i][1] - positions[i - 1][1]
    )
  }
  if (closed) {
    total += Math.hypot(
      positions[0][0] - positions[positions.length - 1][0],
      positions[0][1] - positions[positions.length - 1][1]
    )
  }
  return total
}

function convertPoint(
  ctx: ConvertContext,
  position: Position,
  color: AcCmColor | undefined
): void {
  const point = new AcDbPoint()
  point.position = toPoint3d(ctx, position)
  applyCommon(ctx, point, color, ctx.layerNames.point)
  ctx.entities.push(point)
  ctx.counts.point++
}

/** Builds the shaft/bunker symbol entity for one anchor position. */
function createShaftEntity(
  kind: SpecialTunnelKind,
  bottom: AcGePoint3d,
  top: AcGePoint3d,
  info: ShaftRoadwayInfo
): ShaftRoadway {
  return kind === 'bunker'
    ? new CoalBunker(bottom, top, info)
    : new ShaftRoadway(bottom, top, info)
}

/** Feature metadata + configured sizing for a shaft/bunker symbol. */
const shaftInfoOf = (
  ctx: ConvertContext,
  properties: Record<string, unknown>
): ShaftRoadwayInfo => ({
  id: stringProp(properties, 'id'),
  name: stringProp(properties, 'tunnelName'),
  radius: ctx.shaftRadius,
  outer: ctx.shaftOuter
})

/**
 * A point feature carrying a special `tunnelType` becomes a shaft/bunker
 * symbol at the point; a bare point carries no depth, so mouth and bottom
 * coincide.
 */
function convertShaftPoint(
  ctx: ConvertContext,
  kind: SpecialTunnelKind,
  position: Position,
  properties: Record<string, unknown>,
  color: AcCmColor | undefined
): ShaftRoadway {
  const bottom = toPoint3d(ctx, position)
  const entity = createShaftEntity(
    kind,
    bottom,
    new AcGePoint3d(bottom.x, bottom.y, bottom.z),
    shaftInfoOf(ctx, properties)
  )
  applyCommon(ctx, entity, color, ctx.layerNames.point)
  ctx.entities.push(entity)
  ctx.counts.shaft++
  return entity
}

/**
 * A line feature carrying a special `tunnelType` becomes a shaft/bunker
 * symbol anchored at the deeper end; the higher end is the shaft mouth.
 */
function convertShaftLine(
  ctx: ConvertContext,
  kind: SpecialTunnelKind,
  coordinates: unknown,
  properties: Record<string, unknown>,
  color: AcCmColor | undefined
): ShaftRoadway | undefined {
  if (!Array.isArray(coordinates)) return undefined
  const positions = coordinates.filter(isPosition)
  if (positions.length < 2) return undefined
  const points = positions.map(position => toPoint3d(ctx, position))
  let top = points[0]
  let bottom = points[points.length - 1]
  if (bottom.z > top.z) {
    const swap = top
    top = bottom
    bottom = swap
  }
  const entity = createShaftEntity(kind, bottom, top, shaftInfoOf(ctx, properties))
  applyCommon(ctx, entity, color, ctx.layerNames.point)
  ctx.entities.push(entity)
  ctx.counts.shaft++
  return entity
}

/** Label anchor just above the outer shaft ring. */
function shaftLabelAnchor(ctx: ConvertContext, bottom: AcGePoint3d): AcGePoint3d {
  return new AcGePoint3d(
    bottom.x,
    bottom.y + ctx.shaftRadius + ctx.shaftOuter + ctx.labelHeight * 0.7,
    bottom.z
  )
}

/** Shafts keep their label by the size of their symbol (outer circumference). */
function shaftLabelPriority(ctx: ConvertContext): number {
  return 2 * Math.PI * (ctx.shaftRadius + ctx.shaftOuter)
}

function convertLineString(
  ctx: ConvertContext,
  coordinates: unknown,
  isTunnel: boolean,
  properties: Record<string, unknown>,
  color: AcCmColor | undefined
): AcGePoint3d[] | undefined {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return undefined
  const positions = coordinates.filter(isPosition)
  if (positions.length < 2) return undefined
  const points = positions.map(position => toPoint3d(ctx, position))

  if (isTunnel) {
    const roadway = new TunnelRoadway(
      points.map(p => ({ x: p.x, y: p.y })),
      ctx.roadwayWidth,
      false,
      {
        tunnelName: stringProp(properties, 'tunnelName'),
        tunnelType: stringProp(properties, 'tunnelType'),
        coalbed: stringProp(properties, 'coalbed')
      }
    )
    roadway.elevation = points[0].z
    applyCommon(ctx, roadway, color, ctx.layerNames.line)
    ctx.entities.push(roadway)
  } else {
    const polyline = new AcDbPolyline()
    positions.forEach((position, index) =>
      polyline.addVertexAt(index, new AcGePoint2d(position[0], position[1]))
    )
    polyline.elevation = points[0].z
    applyCommon(ctx, polyline, color, ctx.layerNames.line)
    ctx.entities.push(polyline)
  }
  ctx.counts.line++
  return points
}

function convertPolygon(
  ctx: ConvertContext,
  coordinates: unknown,
  color: AcCmColor | undefined
): AcGePoint3d[] | undefined {
  if (!Array.isArray(coordinates)) return undefined
  const outer = Array.isArray(coordinates[0]) ? coordinates[0] : coordinates
  const ring = Array.isArray(outer) ? outer.filter(isPosition) : []
  if (ring.length < 3) return undefined
  const points = ring.map(position => toPoint3d(ctx, position))

  const outline = new AcDbPolyline()
  ring.forEach((position, index) =>
    outline.addVertexAt(index, new AcGePoint2d(position[0], position[1]))
  )
  outline.closed = true
  outline.elevation = points[0].z
  applyCommon(ctx, outline, color, ctx.layerNames.area)
  ctx.entities.push(outline)
  ctx.counts.area++

  if (ctx.fillPolygons) {
    const hatch = new AcDbHatch()
    hatch.patternName = HATCH_PATTERN_SOLID
    hatch.patternType = AcDbHatchPatternType.Predefined
    hatch.patternScale = 1
    hatch.patternAngle = 0
    hatch.hatchStyle = AcDbHatchStyle.Normal
    hatch.isSolidFill = true
    if (ctx.db) hatch.database = ctx.db
    const loop = new AcGeLoop2d()
    for (let index = 0; index < ring.length; index++) {
      const start = ring[index]
      const end = ring[(index + 1) % ring.length]
      loop.add(
        new AcGeLine2d(
          new AcGePoint2d(start[0], start[1]),
          new AcGePoint2d(end[0], end[1])
        )
      )
    }
    hatch.add(loop)
    applyCommon(ctx, hatch, color, ctx.layerNames.area)
    ctx.entities.push(hatch)
    ctx.counts.area++
  }

  return points
}

/** Average vertex of a point list — cheap centroid approximation for labels. */
function centroidOf(points: AcGePoint3d[]): AcGePoint3d {
  let x = 0
  let y = 0
  let z = 0
  for (const point of points) {
    x += point.x
    y += point.y
    z += point.z
  }
  return new AcGePoint3d(x / points.length, y / points.length, z / points.length)
}

function convertGeometry(
  ctx: ConvertContext,
  geometry: GeoJsonGeometry | null,
  properties: Record<string, unknown>,
  color: AcCmColor | undefined,
  withLabel: boolean,
  priority: number,
  featureIndex: number,
  special: SpecialTunnelKind | undefined
): void {
  if (!geometry) return
  const label = withLabel ? featureLabel(ctx, properties) : undefined
  const isTunnel =
    ctx.useRoadway && isTunnelFeature(properties)

  switch (geometry.type) {
    case 'Point': {
      if (!isPosition(geometry.coordinates)) break
      const position = geometry.coordinates
      if (special) {
        const shaft = convertShaftPoint(
          ctx,
          special,
          position,
          properties,
          color
        )
        if (label) {
          queueLabel(
            ctx,
            label,
            shaftLabelAnchor(ctx, shaft.bottom),
            color,
            priority,
            featureIndex
          )
        }
      } else {
        convertPoint(ctx, position, color)
        if (label) {
          queueLabel(
            ctx,
            label,
            new AcGePoint3d(
              position[0],
              position[1] + ctx.labelHeight * 0.7,
              zOf(ctx, position)
            ),
            color,
            priority,
            featureIndex
          )
        }
      }
      break
    }
    case 'MultiPoint': {
      const list = geometry.coordinates
      if (Array.isArray(list)) {
        for (const position of list) {
          if (!isPosition(position)) continue
          if (special) {
            convertShaftPoint(ctx, special, position, properties, color)
          } else {
            convertPoint(ctx, position, color)
          }
        }
      }
      break
    }
    case 'LineString': {
      if (special) {
        const shaft = convertShaftLine(
          ctx,
          special,
          geometry.coordinates,
          properties,
          color
        )
        if (label && shaft) {
          queueLabel(
            ctx,
            label,
            shaftLabelAnchor(ctx, shaft.bottom),
            color,
            priority,
            featureIndex
          )
        }
      } else {
        const points = convertLineString(
          ctx,
          geometry.coordinates,
          isTunnel,
          properties,
          color
        )
        if (label && points) {
          queueLabel(
            ctx,
            label,
            points[Math.floor(points.length / 2)],
            color,
            priority,
            featureIndex
          )
        }
      }
      break
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates
      if (Array.isArray(lines)) {
        let first: AcGePoint3d[] | undefined
        let firstShaft: ShaftRoadway | undefined
        for (const line of lines) {
          if (special) {
            const shaft = convertShaftLine(ctx, special, line, properties, color)
            if (!firstShaft && shaft) firstShaft = shaft
          } else {
            const points = convertLineString(ctx, line, isTunnel, properties, color)
            if (!first && points) first = points
          }
        }
        if (label) {
          if (firstShaft) {
            queueLabel(
              ctx,
              label,
              shaftLabelAnchor(ctx, firstShaft.bottom),
              color,
              priority,
              featureIndex
            )
          } else if (first) {
            queueLabel(
              ctx,
              label,
              first[Math.floor(first.length / 2)],
              color,
              priority,
              featureIndex
            )
          }
        }
      }
      break
    }
    case 'Polygon': {
      const points = convertPolygon(ctx, geometry.coordinates, color)
      if (label && points) {
        queueLabel(ctx, label, centroidOf(points), color, priority, featureIndex)
      }
      break
    }
    case 'MultiPolygon': {
      const polygons = geometry.coordinates
      if (Array.isArray(polygons)) {
        let first: AcGePoint3d[] | undefined
        for (const polygon of polygons) {
          const points = convertPolygon(ctx, polygon, color)
          if (!first && points) first = points
        }
        if (label && first) {
          queueLabel(
            ctx,
            label,
            centroidOf(first),
            color,
            priority,
            featureIndex
          )
        }
      }
      break
    }
    case 'GeometryCollection': {
      const geometries = geometry.geometries
      if (Array.isArray(geometries)) {
        geometries.forEach((child, index) =>
          convertGeometry(
            ctx,
            child,
            properties,
            color,
            index === 0,
            priority,
            featureIndex,
            special
          )
        )
      }
      break
    }
    default:
      break
  }
}

/**
 * Converts a GeoJSON FeatureCollection into drawing entities:
 * points, lines (roadways for tunnel-like features), polygons (outline +
 * optional solid fill) and text labels.
 *
 * The returned entities are not appended to the database yet; callers append
 * them (typically through `modelSpace.appendEntity(entities)` inside a
 * database edit) so the append is undoable as one step.
 *
 * @param featureCollection - GeoJSON document (already normalized).
 * @param options - Conversion options (merged over the plugin defaults).
 * @returns Conversion result including the created entities.
 */
export function geojsonToEntities(
  featureCollection: GeoJsonFeatureCollection,
  options?: GeoJsonToEntitiesOptions
): TunnelDrawResult {
  const resolved = resolveTunnelDrawOptions(options)

  // Dataset-wide values: relative elevation origin, 2D extent for label size.
  let minZ = Infinity
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const feature of featureCollection.features) {
    walkPositions(feature.geometry, position => {
      const z = position[2] ?? 0
      if (z < minZ) minZ = z
      if (position[0] < minX) minX = position[0]
      if (position[0] > maxX) maxX = position[0]
      if (position[1] < minY) minY = position[1]
      if (position[1] > maxY) maxY = position[1]
    })
  }
  const elevationOrigin = Number.isFinite(minZ) ? minZ : 0
  const hasExtent = Number.isFinite(minX)
  const diagonal = hasExtent ? Math.hypot(maxX - minX, maxY - minY) : 0
  const labelHeight =
    resolved.labelHeight > 0
      ? resolved.labelHeight
      : deriveAutoLabelHeight(diagonal)

  const ctx: ConvertContext = {
    layerNames: resolved.layerNames,
    labelField: resolved.labelField,
    labelHeight,
    labelCollision: resolved.labelCollision,
    roadwayWidth: resolved.roadwayWidth,
    shaftRadius: resolved.shaftRadius,
    shaftOuter: resolved.shaftOuter,
    useRoadway: resolved.useRoadway,
    fillPolygons: resolved.fillPolygons,
    elevationMode: resolved.elevationMode,
    color: resolved.color,
    minZ: elevationOrigin,
    db: options?.db,
    entities: [],
    counts: { point: 0, line: 0, area: 0, shaft: 0, text: 0 },
    usedLayers: new Set(),
    featureCount: 0,
    pendingLabels: []
  }

  featureCollection.features.forEach((feature, featureIndex) => {
    const properties = (feature.properties ?? {}) as Record<string, unknown>
    const color = parseColor(
      typeof properties.color === 'string' ? properties.color : resolved.color
    )
    const special = specialTunnelKind(properties)
    const priority = special
      ? shaftLabelPriority(ctx)
      : geometryPriority(feature.geometry)
    const before = ctx.entities.length
    convertGeometry(
      ctx,
      feature.geometry,
      properties,
      color,
      true,
      priority,
      featureIndex,
      special
    )
    if (ctx.entities.length > before) ctx.featureCount++
  })

  // Labels are created after every feature converted so the collision pass
  // can compare all of them against each other.
  const survivors = resolveLabelVisibility(ctx)
  for (const candidate of survivors) {
    createTextLabel(ctx, candidate.label, candidate.anchor, candidate.color)
  }

  return {
    featureCount: ctx.featureCount,
    entityCount: ctx.entities.length,
    counts: ctx.counts,
    labelsHidden: ctx.pendingLabels.length - survivors.length,
    layers: [...ctx.usedLayers],
    entities: ctx.entities
  }
}

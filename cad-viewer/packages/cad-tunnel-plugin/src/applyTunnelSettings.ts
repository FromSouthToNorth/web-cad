import { AcDbDatabase, AcDbRoadway, AcDbText } from '@mlightcad/data-model'

import {
  deriveAutoLabelHeight,
  getTunnelPluginOptions,
  resolveTunnelDrawOptions
} from './config'
import { labelBoxOf, selectNonOverlapping } from './labelCollision'

/** Settings that can be applied to already-drawn tunnel entities. */
export interface TunnelSettingsUpdate {
  /** New roadway width; ignored when `<= 0`. */
  roadwayWidth?: number
  /**
   * New label height; `<= 0` re-derives the automatic height from the
   * labels' extent.
   */
  labelHeight?: number
  /**
   * Re-runs the label collision pass: `true` hides overlapping labels,
   * `false` shows every label.
   */
  labelCollision?: boolean
}

/** Summary of one applied settings pass. */
export interface TunnelSettingsResult {
  widthUpdated: number
  heightUpdated: number
  labelsShown: number
  labelsHidden: number
}

/**
 * Mutates the tunnel entities of the given database in place.
 *
 * Callers wrap this in a database edit (`acapRunDatabaseEdit`) so the
 * changes are undoable and the view re-renders them as one step. Each
 * mutated entity is opened for write first, which records it for the
 * transaction's modify event.
 *
 * @returns How many entities were touched.
 */
export function updateTunnelEntities(
  db: AcDbDatabase,
  update: TunnelSettingsUpdate
): TunnelSettingsResult {
  const resolved = resolveTunnelDrawOptions(getTunnelPluginOptions())
  const result: TunnelSettingsResult = {
    widthUpdated: 0,
    heightUpdated: 0,
    labelsShown: 0,
    labelsHidden: 0
  }

  const roadways: AcDbRoadway[] = []
  const texts: AcDbText[] = []
  for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
    if (entity.layer === resolved.layerNames.line) {
      if (entity instanceof AcDbRoadway) roadways.push(entity)
    } else if (entity.layer === resolved.layerNames.text) {
      if (entity instanceof AcDbText) texts.push(entity)
    }
  }

  const width = update.roadwayWidth
  if (width != null && width > 0) {
    for (const roadway of roadways) {
      if (roadway.width === width) continue
      const writable = db.openObjectForWrite<AcDbRoadway>(roadway.objectId)
      if (!writable) continue
      writable.width = width
      result.widthUpdated++
    }
  }

  let height = update.labelHeight
  if (height != null && height <= 0) {
    height = deriveAutoLabelHeight(labelExtentDiagonal(texts))
  }
  if (height != null && height > 0) {
    for (const text of texts) {
      if (text.height === height) continue
      const writable = db.openObjectForWrite<AcDbText>(text.objectId)
      if (!writable) continue
      writable.height = height
      result.heightUpdated++
    }
  }

  if (update.labelCollision != null && texts.length > 0) {
    const boxes = texts.map(text =>
      labelBoxOf(
        text.alignmentPoint.x,
        text.alignmentPoint.y,
        text.textString,
        text.height
      )
    )
    const keep = update.labelCollision
      ? selectNonOverlapping(boxes)
      : boxes.map(() => true)
    for (let index = 0; index < texts.length; index++) {
      const visible = keep[index]
      if (visible) {
        result.labelsShown++
      } else {
        result.labelsHidden++
      }
      const text = texts[index]
      if (text.visibility === visible) continue
      const writable = db.openObjectForWrite<AcDbText>(text.objectId)
      if (writable) writable.visibility = visible
    }
  }

  return result
}

/** Diagonal of the 2D extent covered by the given labels' anchors. */
function labelExtentDiagonal(texts: AcDbText[]): number {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const text of texts) {
    const { x, y } = text.alignmentPoint
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 0
}

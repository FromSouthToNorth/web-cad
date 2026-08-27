import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  AcDbBlockReference,
  AcDbDimension,
  AcDbEntity,
  AcDbMLeader,
  AcDbMText,
  AcDbObjectId,
  AcDbText,
  acdbStripMTextControlCodes
} from '@mlightcad/data-model'

/**
 * One searchable text-bearing item found in model space.
 *
 * ATTRIB entities live inside an INSERT and cannot be highlighted on their
 * own, so `selectId` points at the parent block reference while `zoomId`
 * points at the entity whose geometric extents are used for zooming.
 */
export interface SearchTextItem {
  /** Object ID passed to the selection set (highlight target). */
  selectId: AcDbObjectId
  /** Object ID whose extents are used for zoom-to. */
  zoomId: AcDbObjectId
  /** Entity type badge shown in the result list (e.g. `Text`, `MText`). */
  typeName: string
  /** Layer name shown under the text snippet. */
  layer: string
  /** Plain (control-code-free) text content. */
  text: string
}

/** Inclusive start / exclusive end range of matched characters. */
export interface TextMatchRange {
  start: number
  end: number
}

/** One fuzzy-matched search result. */
export interface TextSearchResult {
  item: SearchTextItem
  /** Higher is better; substring hits always outrank subsequence hits. */
  score: number
  /** Matched character ranges in `item.text`, for keyword highlighting. */
  ranges: TextMatchRange[]
}

/**
 * Formats a dimension measurement for search purposes.
 *
 * Real dimension text formatting depends on the dimension style (units,
 * decimals, separators); for content search a rounded plain number is enough.
 */
function formatMeasurement(measurement: number): string {
  return String(Math.round(measurement * 100) / 100)
}

/**
 * Resolves the displayed text of a dimension entity.
 *
 * - `''` — default text: the measurement itself
 * - `'.'` — text suppressed: nothing searchable
 * - `'...<>...'` — user text wrapping the default measurement
 */
function resolveDimensionText(dimension: AcDbDimension): string {
  const raw = (dimension.dimensionText ?? '').trim()
  const measurement = dimension.measurement
  const measText = measurement === undefined ? '' : formatMeasurement(measurement)
  if (raw === '') {
    return measText
  }
  if (raw === '.') {
    return ''
  }
  const resolved = raw.includes('<>') ? raw.replace('<>', measText) : raw
  return acdbStripMTextControlCodes(resolved)
}

function pushItem(
  items: SearchTextItem[],
  entity: AcDbEntity,
  text: string,
  selectId: AcDbObjectId = entity.objectId
): void {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return
  }
  items.push({
    selectId,
    zoomId: entity.objectId,
    typeName: entity.type,
    layer: entity.layer,
    text: normalized
  })
}

function collectEntity(entity: AcDbEntity, items: SearchTextItem[]): void {
  // AcDbAttribute / AcDbAttributeDefinition extend AcDbText, so the MText /
  // dimension / mleader / block-reference branches must run before AcDbText.
  if (entity instanceof AcDbMText) {
    pushItem(items, entity, acdbStripMTextControlCodes(entity.contents))
    return
  }
  if (entity instanceof AcDbDimension) {
    pushItem(items, entity, resolveDimensionText(entity))
    return
  }
  if (entity instanceof AcDbMLeader) {
    pushItem(items, entity, acdbStripMTextControlCodes(entity.contents))
    return
  }
  if (entity instanceof AcDbBlockReference) {
    for (const attrib of entity.attributeIterator()) {
      pushItem(items, attrib, attrib.textString, entity.objectId)
    }
    return
  }
  if (entity instanceof AcDbText) {
    // Covers Text and AttDef (AcDbAttributeDefinition extends AcDbText).
    pushItem(items, entity, entity.textString)
  }
}

/**
 * Collects every searchable text item in model space.
 *
 * @returns Text items in drawing order (unordered with respect to content).
 */
export function collectTextItems(): SearchTextItem[] {
  const doc = AcApDocManager.instance.curDocument
  if (!doc) {
    return []
  }
  const items: SearchTextItem[] = []
  const modelSpace = doc.database.tables.blockTable.modelSpace
  for (const entity of modelSpace.newIterator()) {
    collectEntity(entity, items)
  }
  return items
}

/**
 * Fuzzy-matches `query` against `text`, case-insensitively.
 *
 * A contiguous substring hit scores highest. Otherwise the query must match
 * as a subsequence; tighter spans and longer consecutive runs score better.
 *
 * @returns Score and match ranges, or `null` when the query does not match.
 */
export function fuzzyMatch(
  query: string,
  text: string
): { score: number; ranges: TextMatchRange[] } | null {
  const q = query.trim().toLowerCase()
  if (!q) {
    return null
  }
  const t = text.toLowerCase()

  const hitIndex = t.indexOf(q)
  if (hitIndex >= 0) {
    return {
      // Earlier hits and shorter texts rank slightly higher.
      score: 1000 - hitIndex - (t.length - q.length) * 0.01,
      ranges: [{ start: hitIndex, end: hitIndex + q.length }]
    }
  }

  // Subsequence match: record the position of every matched query char.
  const positions: number[] = []
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      positions.push(ti)
      qi++
    }
  }
  if (qi < q.length) {
    return null
  }

  // Merge consecutive positions into ranges and score the span.
  const ranges: TextMatchRange[] = []
  let gaps = 0
  let runStart = positions[0]
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] !== positions[i - 1] + 1) {
      gaps++
      ranges.push({ start: runStart, end: positions[i - 1] + 1 })
      runStart = positions[i]
    }
  }
  ranges.push({ start: runStart, end: positions[positions.length - 1] + 1 })

  const span = positions[positions.length - 1] - positions[0] + 1
  const score = 100 - (span - q.length) * 2 - gaps - positions[0] * 0.1
  return { score, ranges }
}

/** Maximum number of results returned by {@link searchTextItems}. */
export const SEARCH_RESULT_LIMIT = 200

/**
 * Runs a fuzzy content search over all text items in model space.
 *
 * @param query - Raw user input.
 * @param limit - Maximum number of results (best scores first).
 * @returns Matching results sorted by descending score.
 */
export function searchTextItems(
  query: string,
  limit: number = SEARCH_RESULT_LIMIT
): TextSearchResult[] {
  if (!query.trim()) {
    return []
  }
  const results: TextSearchResult[] = []
  for (const item of collectTextItems()) {
    const match = fuzzyMatch(query, item.text)
    if (match) {
      results.push({ item, score: match.score, ranges: match.ranges })
    }
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

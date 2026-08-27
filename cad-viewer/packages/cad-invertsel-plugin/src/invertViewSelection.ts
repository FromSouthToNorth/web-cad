import { AcApDocManager, type AcTrView2d } from '@mlightcad/cad-simple-viewer'
import type { AcDbObjectId } from '@mlightcad/data-model'

/**
 * Maximum number of entity ids printed per selection log line before the list
 * is truncated with a `…(+N more)` suffix. Mirrors the host viewer's
 * selection logging so console output stays consistent.
 */
const SELECTION_LOG_MAX_IDS = 200

/**
 * Logs one selection mutation with the affected entity ids, using the same
 * `[cad-selection]` format as the host viewer.
 */
const logSelectionResult = (
  action: 'add' | 'remove',
  changedIds: AcDbObjectId[],
  total: number,
  startedAt: number
): void => {
  const elapsedMs = performance.now() - startedAt
  const shown = changedIds.slice(0, SELECTION_LOG_MAX_IDS)
  const suffix =
    changedIds.length > shown.length
      ? ` …(+${changedIds.length - shown.length} more)`
      : ''
  console.log(
    `[cad-selection] action=${action} changed=${changedIds.length}` +
      ` total=${total} ms=${elapsedMs.toFixed(2)}` +
      ` ids=[${shown.join(', ')}${suffix}]`
  )
}

/**
 * Inverts the selection of the given view (defaults to the current view):
 * selected entities become unselected and every other model-space entity
 * becomes selected.
 *
 * The candidate universe mirrors `AcEditor.selectAll`, i.e. every model-space
 * entity regardless of layer state.
 *
 * @param view - View whose selection set is inverted; defaults to
 *   `AcApDocManager.instance.curView`.
 * @returns The number of entities whose selection state changed.
 */
export function invertViewSelection(
  view: AcTrView2d | undefined = AcApDocManager.instance.curView
): number {
  if (!view) return 0

  const startedAt = performance.now()
  const ids = view.editor.selectAll().value?.ids ?? []
  const selectionSet = view.selectionSet

  const added: AcDbObjectId[] = []
  const removed: AcDbObjectId[] = []
  for (const id of ids) {
    if (selectionSet.has(id)) {
      removed.push(id)
    } else {
      added.push(id)
    }
  }

  // Keep the host's event order: selectionAdded fires before selectionRemoved.
  if (added.length > 0) selectionSet.add(added)
  if (removed.length > 0) selectionSet.delete(removed)

  // Keep the host's log order: removals are reported before additions, with
  // the final selection count.
  if (removed.length > 0) {
    logSelectionResult('remove', removed, selectionSet.count, startedAt)
  }
  if (added.length > 0) {
    logSelectionResult('add', added, selectionSet.count, startedAt)
  }

  return added.length + removed.length
}

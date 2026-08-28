import {
  AcApDocManager,
  type AcEdCommandEventArgs,
  AcEdOpenMode
} from '@mlightcad/cad-simple-viewer'
import { type AcDbObjectId } from '@mlightcad/data-model'

import {
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_SCALE
} from './layerCtxCommands'

/**
 * Commands that transform the selection in place: when the host command ends
 * it clears the selection set (AutoCAD legacy behavior), which breaks
 * back-to-back right-click operations (copy → rotate → …). These commands
 * restore the pre-dispatch selection instead, so the user can keep chaining
 * menu operations on the same objects.
 */
const TRANSFORM_COMMANDS: ReadonlySet<string> = new Set([
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_SCALE
])

/** Whether the current document forbids edits (open mode below Write). */
export const isReadOnlyDocument = (): boolean => {
  const doc = AcApDocManager.instance.curDocument
  if (!doc) return true
  return doc.openMode < AcEdOpenMode.Write
}

/** Whether the current view has a non-empty selection set. */
export const hasSelection = (): boolean =>
  (AcApDocManager.instance.curView?.selectionSet.count ?? 0) > 0

interface PendingRestore {
  /** Command name whose end triggers the restore. */
  command: string
  /** Selection ids captured at dispatch time. */
  ids: AcDbObjectId[]
}

let pending: PendingRestore | null = null

/**
 * Dispatches one context-menu command through the host command pipeline and
 * records the current selection so transform commands can restore it when
 * they finish (see {@link startLayerCtxDispatchTracker}).
 *
 * Delete/deselect intentionally keep the post-command state: deleted objects
 * must not reappear in the selection, and deselect exists to clear it.
 */
export function dispatchCtxCommand(command: string): void {
  const ids = AcApDocManager.instance.curView?.selectionSet.ids ?? []
  pending =
    TRANSFORM_COMMANDS.has(command) && ids.length > 0
      ? { command, ids }
      : null
  AcApDocManager.instance.sendStringToExecute(command)
}

/**
 * Invalidates a pending restore when the running command is not the one we
 * dispatched (our dispatch was refused or superseded), so a stale restore can
 * never fire for an unrelated later command with the same name.
 */
const onCommandWillStart = (args: AcEdCommandEventArgs): void => {
  if (!pending) return
  // Command names are normalized to uppercase on registration, while
  // dispatch strings are lowercase.
  if (args.command.globalName.toLowerCase() !== pending.command) {
    pending = null
  }
}

/**
 * Restores the pre-dispatch selection after a transform command ends, unless
 * the user already has a new selection. Ids no longer present in the database
 * (e.g. after a failed partial edit) are dropped.
 */
const onCommandEnded = (args: AcEdCommandEventArgs): void => {
  const restore = pending
  if (!restore) return
  if (args.command.globalName.toLowerCase() !== restore.command) return
  pending = null

  const view = AcApDocManager.instance.curView
  if (!view || view.selectionSet.count > 0) return

  const doc = AcApDocManager.instance.curDocument
  const valid = doc
    ? restore.ids.filter(id =>
        doc.database.tables.blockTable.getEntityById(id)
      )
    : restore.ids
  if (valid.length > 0) {
    view.selectionSet.add(valid)
  }
}

let isTracking = false

/**
 * Attaches the command-lifecycle listeners backing the selection restore.
 * No-op when already attached.
 */
export function startLayerCtxDispatchTracker(): void {
  if (isTracking) return
  const events = AcApDocManager.instance.editor.events
  events.commandWillStart.addEventListener(onCommandWillStart)
  events.commandEnded.addEventListener(onCommandEnded)
  isTracking = true
}

/**
 * Detaches the listeners installed by {@link startLayerCtxDispatchTracker} and
 * drops any pending restore.
 */
export function stopLayerCtxDispatchTracker(): void {
  if (!isTracking) return
  const events = AcApDocManager.instance.editor.events
  events.commandWillStart.removeEventListener(onCommandWillStart)
  events.commandEnded.removeEventListener(onCommandEnded)
  isTracking = false
  pending = null
}

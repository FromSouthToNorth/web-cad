import { AcApDocManager, AcEdMTextEditor } from '@mlightcad/cad-simple-viewer'

import { layerCtxT } from './i18n'
import {
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_DELETE,
  LAYERCTX_CMD_OFFSET,
  LAYERCTX_CMD_SCALE
} from './layerCtxCommands'
import {
  dispatchCtxCommand,
  hasSelection,
  isReadOnlyDocument
} from './layerCtxDispatch'
import { closeLayerCtxMenu } from './layerCtxMenu'

/**
 * Maps physical key codes (`e.code`) to object context-menu commands.
 * Shortcuts are AutoCAD-style bare letter keys (the command-alias first
 * letters: `M` move, `C` copy, `S` scale, `R` rotate, `O` offset, `E` erase)
 * and act on the current selection set — no modifier chord is required,
 * matching how AutoCAD runs aliases straight from the drawing window.
 * Deselect is intentionally absent: the host viewer clears the selection on
 * `Escape` (AutoCAD semantics). Copy/move/rotate dispatch the host's
 * interactive commands (canvas point picking with preview jig); scale is the
 * plugin's own interactive command.
 */
const SHORTCUTS: Readonly<Record<string, string>> = {
  KeyE: LAYERCTX_CMD_DELETE,
  KeyC: HOST_CMD_COPY,
  KeyM: HOST_CMD_MOVE,
  KeyS: LAYERCTX_CMD_SCALE,
  KeyR: HOST_CMD_ROTATE,
  KeyO: LAYERCTX_CMD_OFFSET
}

/**
 * Whether the event is one of the plugin's shortcuts: a bare letter key
 * without any modifier. Modifier chords are left to the host (Ctrl+Z/Y
 * undo/redo) and the browser.
 */
const resolveShortcutCommand = (
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
): string | null => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null
  return SHORTCUTS[e.code] ?? null
}

/**
 * Whether a view-level shortcut may run for this event. Mirrors the host
 * viewer's guards: no IME composition and no editable targets. Every `INPUT`
 * target is rejected (including the command line): a bare letter pressed
 * there must be typed as text — e.g. `M` + Enter in the command line runs
 * MOVE through the normal alias path, exactly like AutoCAD.
 */
const shouldHandleViewShortcut = (
  e: Pick<KeyboardEvent, 'target' | 'isComposing' | 'keyCode'>
): boolean => {
  if (e.isComposing || e.keyCode === 229) {
    return false
  }

  const target = e.target as HTMLElement | null
  if (target?.tagName === 'TEXTAREA') {
    return false
  }
  if (target?.isContentEditable) {
    return false
  }
  if (target?.tagName === 'INPUT') {
    return false
  }

  return true
}

/**
 * Shortcut targets that modify the document: they refuse to run in read-only
 * documents or with an empty selection, mirroring the disabled state of the
 * same items in the context menu.
 */
const WRITE_COMMANDS: ReadonlySet<string> = new Set([
  LAYERCTX_CMD_DELETE,
  LAYERCTX_CMD_SCALE,
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_OFFSET
])

const handleKeyDown = (e: KeyboardEvent): void => {
  const command = resolveShortcutCommand(e)
  if (!command) {
    return
  }
  if (!shouldHandleViewShortcut(e)) {
    return
  }
  // Never steal the shortcut from inline MText editing or an active command
  // that is acquiring input.
  if (AcEdMTextEditor.getActiveInputBox()) {
    return
  }
  const view = AcApDocManager.instance.curView
  if (!view || view.editor.isActive) {
    return
  }

  // Dismiss a visible context menu so the command runs over the canvas.
  closeLayerCtxMenu()

  if (WRITE_COMMANDS.has(command)) {
    if (isReadOnlyDocument()) {
      AcApDocManager.instance.editor.showMessage(
        layerCtxT('msgReadOnlyDocument'),
        'warning'
      )
      e.preventDefault()
      return
    }
    if (!hasSelection()) {
      AcApDocManager.instance.editor.showMessage(
        layerCtxT('msgNoObjectsSelected'),
        'warning'
      )
      e.preventDefault()
      return
    }
  }

  dispatchCtxCommand(command)
  e.preventDefault()
}

let isAttached = false

/**
 * Attaches the plugin's document-level keydown listener. No-op when already
 * attached. The listener reads `AcApDocManager.instance.curView` at event
 * time, so it keeps working across document/view re-creation.
 */
export function startLayerCtxKeyHandler(): void {
  if (isAttached) return
  document.addEventListener('keydown', handleKeyDown)
  isAttached = true
}

/**
 * Detaches the listener installed by {@link startLayerCtxKeyHandler}.
 */
export function stopLayerCtxKeyHandler(): void {
  if (!isAttached) return
  document.removeEventListener('keydown', handleKeyDown)
  isAttached = false
}

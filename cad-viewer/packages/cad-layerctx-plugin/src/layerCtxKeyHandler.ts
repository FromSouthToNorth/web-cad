import { AcApDocManager, AcEdMTextEditor } from '@mlightcad/cad-simple-viewer'

import { layerCtxT } from './i18n'
import {
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_DELETE,
  LAYERCTX_CMD_DESELECT,
  LAYERCTX_CMD_SCALE
} from './layerCtxCommands'
import {
  dispatchCtxCommand,
  hasSelection,
  isReadOnlyDocument
} from './layerCtxDispatch'
import { closeLayerCtxMenu } from './layerCtxMenu'

/** Class of the host viewer's command-line input element. */
const COMMAND_LINE_INPUT_CLASS = 'ml-cli-text'

/**
 * Maps physical key codes (`e.code`) to object context-menu commands. All
 * shortcuts are Ctrl+Shift+<key> (Cmd+Shift+<key> on macOS) and act on the
 * current selection set. Copy/move/rotate dispatch the host's interactive
 * commands (canvas point picking with preview jig); scale is the plugin's
 * own interactive command.
 */
const SHORTCUTS: Readonly<Record<string, string>> = {
  KeyE: LAYERCTX_CMD_DELETE,
  KeyC: HOST_CMD_COPY,
  KeyM: HOST_CMD_MOVE,
  KeyS: LAYERCTX_CMD_SCALE,
  KeyR: HOST_CMD_ROTATE,
  KeyA: LAYERCTX_CMD_DESELECT
}

/**
 * Whether the event is one of the plugin's shortcuts: Ctrl+Shift+<key> on
 * Windows/Linux or Cmd+Shift+<key> on macOS.
 */
const resolveShortcutCommand = (
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
): string | null => {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return null
  return SHORTCUTS[e.code] ?? null
}

/**
 * Whether a view-level shortcut may run for this event. Mirrors the host
 * viewer's guards: no IME composition, no editable targets, and the command
 * line only when it is empty and editable.
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
    const input = target as HTMLInputElement
    if (input.classList.contains(COMMAND_LINE_INPUT_CLASS)) {
      return input.value.trim() === '' && !input.readOnly
    }
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
  HOST_CMD_ROTATE
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

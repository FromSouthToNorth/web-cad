import {
  AcApDocManager,
  AcEdMTextEditor
} from '@mlightcad/cad-simple-viewer'

import { invertViewSelection } from './invertViewSelection'

/** Class of the host viewer's command-line input element. */
const COMMAND_LINE_INPUT_CLASS = 'ml-cli-text'

/**
 * Whether the event is the invert-selection shortcut: Ctrl+Shift+I on
 * Windows/Linux or Cmd+Shift+I on macOS.
 */
const isInvertSelectionShortcut = (
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
): boolean => {
  return (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyI'
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

const handleKeyDown = (e: KeyboardEvent): void => {
  if (!isInvertSelectionShortcut(e)) {
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

  invertViewSelection(view)
  e.preventDefault()
}

let isAttached = false

/**
 * Attaches the plugin's document-level keydown listener. No-op when already
 * attached. The listener reads `AcApDocManager.instance.curView` at event
 * time, so it keeps working across document/view re-creation.
 */
export function startInvertSelKeyHandler(): void {
  if (isAttached) return
  document.addEventListener('keydown', handleKeyDown)
  isAttached = true
}

/**
 * Detaches the listener installed by {@link startInvertSelKeyHandler}.
 */
export function stopInvertSelKeyHandler(): void {
  if (!isAttached) return
  document.removeEventListener('keydown', handleKeyDown)
  isAttached = false
}

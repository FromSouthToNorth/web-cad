import {
  AcApDocManager,
  AcEdMTextEditor,
  AcEdOpenMode
} from '@mlightcad/cad-simple-viewer'

import { type LayerCtxMessageKey, layerCtxT } from './i18n'
import {
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_DELETE,
  LAYERCTX_CMD_DESELECT,
  LAYERCTX_CMD_OFFSET,
  LAYERCTX_CMD_SCALE
} from './layerCtxCommands'
import { dispatchCtxCommand } from './layerCtxDispatch'
import {
  ensureEntitySelected,
  isCanvasEventTarget,
  pickEntityIdAtClientPoint
} from './layerCtxPick'

const MENU_CLASS = 'ml-layerctx-menu'
const STYLE_ID = 'ml-layerctx-menu-style'

/**
 * One entry of the object context menu.
 */
interface LayerCtxMenuItem {
  /** i18n key of the item label. */
  labelKey: LayerCtxMessageKey
  /** Shortcut hint shown on the right (display only). */
  shortcut: string
  /** Command dispatched through the command pipeline on click. */
  command: string
  /** Whether a separator is rendered above this item. */
  separatorBefore?: boolean
  /** Whether the item is styled as destructive (red). */
  danger?: boolean
  /** Runtime disabled state, evaluated when the menu opens. */
  isDisabled?: () => boolean
}

/**
 * Whether the current document forbids edits (open mode below Write). Write
 * operations are greyed out instead of failing inside the command pipeline.
 */
const isReadOnlyDoc = (): boolean => {
  const doc = AcApDocManager.instance.curDocument
  if (!doc) return true
  return doc.openMode < AcEdOpenMode.Write
}

/**
 * Whether the selection set is empty. The menu only opens with a non-empty
 * selection, so this guards keyboard/command-line races (selection cleared
 * between menu open and click).
 */
const isSelectionEmpty = (): boolean =>
  (AcApDocManager.instance.curView?.selectionSet.count ?? 0) === 0

/**
 * Write items need a writable document and a non-empty selection. There are
 * no layer `0` / current-layer restrictions: every item here is entity-scoped
 * and never deletes the layer record itself.
 */
const isWriteItemDisabled = (): boolean => isReadOnlyDoc() || isSelectionEmpty()

/**
 * Whether the current platform uses the macOS Cmd modifier for shortcuts.
 */
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Renders a shortcut hint for the current platform (⌘⇧ on macOS). */
const formatShortcut = (shortcut: string): string =>
  IS_MAC ? shortcut.replace('Ctrl+Shift+', '⌘⇧') : shortcut

/**
 * Menu layout: modify operations first (grouped), then deselect, then delete
 * at the bottom in danger styling so the destructive action is never the
 * first thing a user clicks.
 */
const MENU_ITEMS: readonly LayerCtxMenuItem[] = [
  {
    labelKey: 'menuCopy',
    shortcut: 'Ctrl+Shift+C',
    command: HOST_CMD_COPY,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuMove',
    shortcut: 'Ctrl+Shift+M',
    command: HOST_CMD_MOVE,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuScale',
    shortcut: 'Ctrl+Shift+S',
    command: LAYERCTX_CMD_SCALE,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuRotate',
    shortcut: 'Ctrl+Shift+R',
    command: HOST_CMD_ROTATE,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuOffset',
    shortcut: 'Ctrl+Shift+O',
    command: LAYERCTX_CMD_OFFSET,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuDeselect',
    shortcut: 'Ctrl+Shift+A',
    command: LAYERCTX_CMD_DESELECT,
    separatorBefore: true,
    isDisabled: isSelectionEmpty
  },
  {
    labelKey: 'menuDelete',
    shortcut: 'Del',
    command: LAYERCTX_CMD_DELETE,
    separatorBefore: true,
    danger: true,
    isDisabled: isWriteItemDisabled
  }
]

/**
 * Injects the menu stylesheet once. Colors come from Element Plus CSS
 * variables so the menu follows the host light/dark theme automatically.
 */
function ensureMenuStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.ml-layerctx-menu {
  position: fixed;
  min-width: 200px;
  max-width: 320px;
  padding: 4px;
  background: var(--el-bg-color-overlay, #ffffff);
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 6px;
  box-shadow: var(--el-box-shadow-light, 0 2px 12px rgba(0, 0, 0, 0.12));
  z-index: 3000;
  font-size: 12px;
  color: var(--el-text-color-primary, #303133);
  user-select: none;
}
.ml-layerctx-menu__title {
  padding: 4px 10px 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  color: var(--el-text-color-secondary, #909399);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ml-layerctx-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--el-border-color-lighter, #ebeef5);
}
.ml-layerctx-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  padding: 5px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ml-layerctx-menu__item:hover:not(:disabled),
.ml-layerctx-menu__item:focus:not(:disabled),
.ml-layerctx-menu__item:focus-visible:not(:disabled) {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
  outline: none;
}
.ml-layerctx-menu__item--danger {
  color: var(--el-color-danger, #f56c6c);
}
.ml-layerctx-menu__item--danger:hover:not(:disabled),
.ml-layerctx-menu__item--danger:focus:not(:disabled),
.ml-layerctx-menu__item--danger:focus-visible:not(:disabled) {
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #f56c6c);
}
.ml-layerctx-menu__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ml-layerctx-menu__shortcut {
  color: var(--el-text-color-secondary, #909399);
  font-size: 11px;
  white-space: nowrap;
}
`
  document.head.appendChild(style)
}

let menuEl: HTMLElement | null = null
let isAttached = false

/** Removes the open menu, if any. */
function hideMenu(): void {
  if (menuEl && menuEl.contains(document.activeElement)) {
    ;(document.activeElement as HTMLElement | null)?.blur()
  }
  menuEl?.remove()
  menuEl = null
}

/**
 * Closes the open menu without dispatching anything. Exposed so the shortcut
 * handler can dismiss a visible menu before running a command.
 */
export function closeLayerCtxMenu(): void {
  hideMenu()
}

/**
 * Dispatches a menu command through the host command pipeline. Commands act
 * on the current selection set, so no target needs to be passed along.
 * Transform commands (copy/move/scale/rotate/offset) restore the selection when the
 * command finishes, keeping back-to-back menu operations on the same objects.
 */
function runMenuCommand(item: LayerCtxMenuItem): void {
  hideMenu()
  dispatchCtxCommand(item.command)
}

/**
 * Builds and opens the context menu at viewport coordinates (clamped into the
 * viewport). Call only with a non-empty selection set: the title shows the
 * selected object count and every write item acts on the selection.
 */
function showMenu(clientX: number, clientY: number): void {
  ensureMenuStyle()
  hideMenu()

  const count = AcApDocManager.instance.curView?.selectionSet.count ?? 0

  const menu = document.createElement('div')
  menu.className = MENU_CLASS
  menu.setAttribute('role', 'menu')

  const title = document.createElement('div')
  title.className = `${MENU_CLASS}__title`
  title.textContent = layerCtxT('menuTitleSelected', { count: String(count) })
  menu.appendChild(title)

  const buttons: HTMLButtonElement[] = []

  for (const item of MENU_ITEMS) {
    if (item.separatorBefore) {
      const sep = document.createElement('div')
      sep.className = `${MENU_CLASS}__sep`
      menu.appendChild(sep)
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `${MENU_CLASS}__item`
    if (item.danger) {
      button.classList.add(`${MENU_CLASS}__item--danger`)
    }
    button.setAttribute('role', 'menuitem')
    button.disabled = item.isDisabled?.() ?? false

    const label = document.createElement('span')
    label.textContent = layerCtxT(item.labelKey)
    button.appendChild(label)

    const shortcut = document.createElement('span')
    shortcut.className = `${MENU_CLASS}__shortcut`
    shortcut.textContent = formatShortcut(item.shortcut)
    button.appendChild(shortcut)

    button.addEventListener('click', () => runMenuCommand(item))
    menu.appendChild(button)
    buttons.push(button)
  }

  // Keyboard navigation: arrows cycle through the enabled items (wrap-around),
  // Home/End jump to the first/last one. Enter/Space activate the focused
  // button natively.
  const enabledButtons = (): HTMLButtonElement[] =>
    buttons.filter(button => !button.disabled)
  menu.addEventListener('keydown', (e: KeyboardEvent) => {
    const enabled = enabledButtons()
    if (enabled.length === 0) return
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    let next = -1
    if (e.key === 'ArrowDown') {
      next = current < 0 ? 0 : (current + 1) % enabled.length
    } else if (e.key === 'ArrowUp') {
      next = current <= 0 ? enabled.length - 1 : current - 1
    } else if (e.key === 'Home') {
      next = 0
    } else if (e.key === 'End') {
      next = enabled.length - 1
    }
    if (next >= 0) {
      e.preventDefault()
      e.stopPropagation()
      enabled[next].focus()
    }
  })

  document.body.appendChild(menu)

  const rect = menu.getBoundingClientRect()
  const left = Math.max(
    4,
    Math.min(clientX, window.innerWidth - rect.width - 4)
  )
  const top = Math.max(
    4,
    Math.min(clientY, window.innerHeight - rect.height - 4)
  )
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  menuEl = menu

  // Focus the first enabled item so keyboard navigation works immediately.
  enabledButtons()[0]?.focus()
}

/**
 * Right-click on the drawing canvas: pick the entity under the cursor and
 * select it first (standard CAD right-click semantics), then open the object
 * menu. With no entity under the cursor the menu opens for the existing
 * selection; with an empty selection no menu is shown.
 *
 * While a command is acquiring input (or inline MText editing is active) the
 * event is left untouched so the host's right-click-as-Enter prompt behavior
 * keeps working.
 */
const handleCanvasContextMenu = (e: MouseEvent): void => {
  if (!isCanvasEventTarget(e.target)) return

  const view = AcApDocManager.instance.curView
  if (!view) return
  if (view.editor.isActive || AcEdMTextEditor.getActiveInputBox()) {
    return
  }

  const pickedId = pickEntityIdAtClientPoint(e.clientX, e.clientY)
  if (pickedId !== null) {
    ensureEntitySelected(pickedId)
  }
  if (view.selectionSet.count === 0) return

  e.preventDefault()
  e.stopPropagation()
  showMenu(e.clientX, e.clientY)
}

/**
 * Document-level `contextmenu` handler: opens the object menu for canvas
 * entities; right-clicks on the open menu itself keep it open, and
 * right-clicks anywhere else just close it and are left untouched.
 */
const onContextMenu = (e: MouseEvent): void => {
  if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) {
    e.preventDefault()
    return
  }
  hideMenu()
  handleCanvasContextMenu(e)
}

const onPointerDown = (e: PointerEvent): void => {
  if (!menuEl) return
  if (e.target instanceof Node && menuEl.contains(e.target)) return
  hideMenu()
}

const onKeyDown = (e: KeyboardEvent): void => {
  if (!menuEl) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    e.preventDefault()
    hideMenu()
  }
}

const onWindowChange = (): void => {
  hideMenu()
}

/**
 * Attaches the plugin's context-menu listeners. No-op when already attached.
 * All lookups happen at event time, so the menu keeps working across
 * document/view re-creation.
 */
export function startLayerCtxMenu(): void {
  if (isAttached) return
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', onWindowChange)
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('wheel', onWindowChange, true)
  isAttached = true
}

/**
 * Detaches the listeners installed by {@link startLayerCtxMenu} and removes
 * any open menu.
 */
export function stopLayerCtxMenu(): void {
  if (!isAttached) return
  document.removeEventListener('contextmenu', onContextMenu, true)
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', onWindowChange)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('wheel', onWindowChange, true)
  isAttached = false
  hideMenu()
}

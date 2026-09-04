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
import { getLastCommand } from './layerCtxHistory'
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
  labelKey?: LayerCtxMessageKey
  /** Literal label, when the text is built dynamically (repeat item). */
  label?: string
  /** Single-letter access key, underlined in the label when present. */
  accessKey?: string
  /** Shortcut hint shown on the right (display only). */
  shortcut?: string
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
 * Menu layout: modify operations first (grouped), then deselect, then delete
 * at the bottom in danger styling so the destructive action is never the
 * first thing a user clicks.
 *
 * Shortcut hints follow the AutoCAD standard: bare command-alias letters
 * (`M` move, `C` copy, `S` scale, `R` rotate, `O` offset) plus `Del` for
 * erase and `Esc` for deselect — no Ctrl/Shift chords. While the menu is
 * open the letters also act as access keys (pressing `M` runs Move), like
 * the underlined letters in AutoCAD's shortcut menu.
 */
const MENU_ITEMS: readonly LayerCtxMenuItem[] = [
  {
    labelKey: 'menuCopy',
    accessKey: 'C',
    shortcut: 'C',
    command: HOST_CMD_COPY,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuMove',
    accessKey: 'M',
    shortcut: 'M',
    command: HOST_CMD_MOVE,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuScale',
    accessKey: 'S',
    shortcut: 'S',
    command: LAYERCTX_CMD_SCALE,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuRotate',
    accessKey: 'R',
    shortcut: 'R',
    command: HOST_CMD_ROTATE,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuOffset',
    accessKey: 'O',
    shortcut: 'O',
    command: LAYERCTX_CMD_OFFSET,
    isDisabled: isWriteItemDisabled
  },
  {
    labelKey: 'menuDeselect',
    shortcut: 'Esc',
    command: LAYERCTX_CMD_DESELECT,
    separatorBefore: true,
    isDisabled: isSelectionEmpty
  },
  {
    labelKey: 'menuDelete',
    accessKey: 'E',
    shortcut: 'Del',
    command: LAYERCTX_CMD_DELETE,
    separatorBefore: true,
    danger: true,
    isDisabled: isWriteItemDisabled
  }
]

/**
 * Menu shown when nothing is selected: AutoCAD still opens its shortcut menu
 * on an empty canvas right-click, with Repeat/Clipboard/Pan/Zoom items. Here
 * the navigation subset is offered — pan and the host's keyword-driven ZOOM
 * (Enter = extents, two corners = window).
 */
const NO_SELECTION_ITEMS: readonly LayerCtxMenuItem[] = [
  {
    labelKey: 'menuPan',
    command: 'pan'
  },
  {
    labelKey: 'menuZoom',
    command: 'zoom'
  }
]

/**
 * The repeat item from the last executed command, when one exists. Mirrors
 * AutoCAD's "Repeat <COMMAND>" entry at the top of the shortcut menu; write
 * commands apply the same read-only/empty-selection disabled rules as the
 * other write items.
 */
const buildRepeatItem = (): LayerCtxMenuItem | null => {
  const last = getLastCommand()
  if (!last) return null
  const display = last.displayKey
    ? layerCtxT(last.displayKey)
    : last.name.toUpperCase()
  return {
    label: layerCtxT('menuRepeat', { command: display }),
    shortcut: '',
    command: last.name,
    isDisabled: last.isWrite ? isWriteItemDisabled : undefined
  }
}

/**
 * Builds the item list for a menu open, in AutoCAD order: Repeat (if any) on
 * top followed by a separator, then the object or navigation items.
 */
const buildMenuItems = (hasSelection: boolean): LayerCtxMenuItem[] => {
  const repeat = buildRepeatItem()
  const base = hasSelection ? MENU_ITEMS : NO_SELECTION_ITEMS
  const items = base.map(item => ({ ...item }))
  if (repeat) {
    items.unshift(repeat)
    items[1].separatorBefore = true
  }
  return items
}

/**
 * Injects the menu stylesheet once. Colors come from the viewer's `--ml-ui-*`
 * theme tokens (set on `documentElement` by `acedApplyUiTheme` on every theme
 * switch), so the menu follows the host light/dark theme automatically. The
 * fallbacks after each token keep the menu usable in hosts that never apply
 * the tokens; the `html.dark` block swaps those fallbacks for dark ones.
 */
function ensureMenuStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.ml-layerctx-menu {
  --mlctx-bg: var(--ml-ui-bg, #ffffff);
  --mlctx-text: var(--ml-ui-text, #303133);
  --mlctx-text-muted: var(--ml-ui-text-muted, #909399);
  --mlctx-border: var(--ml-ui-border, #e4e7ed);
  --mlctx-shadow: var(--ml-ui-shadow, 0 2px 12px rgba(0, 0, 0, 0.12));
  --mlctx-accent: var(--ml-ui-accent, #409eff);
  --mlctx-accent-soft: var(--ml-ui-canvas-fill, rgba(64, 158, 255, 0.15));
  --mlctx-danger: var(--ml-ui-danger, #f56c6c);
  --mlctx-danger-soft: color-mix(in srgb, var(--mlctx-danger) 12%, transparent);

  position: fixed;
  min-width: 200px;
  max-width: 320px;
  padding: 4px;
  background: var(--mlctx-bg);
  border: 1px solid var(--mlctx-border);
  border-radius: 6px;
  box-shadow: var(--mlctx-shadow);
  z-index: 3000;
  font-size: 12px;
  color: var(--mlctx-text);
  user-select: none;
}
html.dark .ml-layerctx-menu {
  --mlctx-bg: var(--ml-ui-bg, #1d1e1f);
  --mlctx-text: var(--ml-ui-text, #e5eaf3);
  --mlctx-text-muted: var(--ml-ui-text-muted, #a3a6ad);
  --mlctx-border: var(--ml-ui-border, #4c4d4f);
  --mlctx-shadow: var(--ml-ui-shadow, 0 6px 18px rgba(0, 0, 0, 0.35));
}
.ml-layerctx-menu__title {
  padding: 4px 10px 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--mlctx-border);
  color: var(--mlctx-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ml-layerctx-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--mlctx-border);
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
  background: var(--mlctx-accent-soft);
  color: var(--mlctx-accent);
  outline: none;
}
.ml-layerctx-menu__item--danger {
  color: var(--mlctx-danger);
}
.ml-layerctx-menu__item--danger:hover:not(:disabled),
.ml-layerctx-menu__item--danger:focus:not(:disabled),
.ml-layerctx-menu__item--danger:focus-visible:not(:disabled) {
  background: var(--mlctx-danger-soft);
  color: var(--mlctx-danger);
}
.ml-layerctx-menu__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ml-layerctx-menu__shortcut {
  color: var(--mlctx-text-muted);
  font-size: 11px;
  white-space: nowrap;
}
.ml-layerctx-menu__item u {
  text-underline-offset: 2px;
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

/** Escapes label fragments interpolated as HTML (repeat display names). */
const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })

/**
 * Renders an item label, underlining the first occurrence of the access key
 * (case-insensitive) AutoCAD-mnemonic style. Labels without the letter (e.g.
 * CJK translations) fall back to the plain text; the shortcut hint on the
 * right still shows the key.
 */
const renderLabel = (item: LayerCtxMenuItem): HTMLSpanElement => {
  const text = item.label ?? layerCtxT(item.labelKey!)
  const label = document.createElement('span')
  if (!item.accessKey) {
    label.textContent = text
    return label
  }
  const idx = text.toLowerCase().indexOf(item.accessKey.toLowerCase())
  if (idx < 0) {
    label.textContent = text
    return label
  }
  label.innerHTML = `${escapeHtml(text.slice(0, idx))}<u>${escapeHtml(
    text[idx]
  )}</u>${escapeHtml(text.slice(idx + 1))}`
  return label
}

/**
 * Builds and opens the context menu at viewport coordinates (clamped into the
 * viewport). The item list and optional title are prepared by the caller:
 * right-clicks on an entity open the object menu, right-clicks on empty
 * canvas open the navigation menu (no title).
 */
function showMenu(
  clientX: number,
  clientY: number,
  items: readonly LayerCtxMenuItem[],
  titleText?: string
): void {
  ensureMenuStyle()
  hideMenu()

  const menu = document.createElement('div')
  menu.className = MENU_CLASS
  menu.setAttribute('role', 'menu')

  if (titleText) {
    const title = document.createElement('div')
    title.className = `${MENU_CLASS}__title`
    title.textContent = titleText
    menu.appendChild(title)
  }

  const buttons: HTMLButtonElement[] = []

  for (const item of items) {
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

    button.appendChild(renderLabel(item))

    if (item.shortcut) {
      const shortcut = document.createElement('span')
      shortcut.className = `${MENU_CLASS}__shortcut`
      shortcut.textContent = item.shortcut
      button.appendChild(shortcut)
    }

    button.addEventListener('click', () => runMenuCommand(item))
    // Hovering with the mouse moves focus too, so the keyboard highlight and
    // the hover highlight never point at different items.
    button.addEventListener('pointerenter', () => button.focus())
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
 * selection; with an empty selection the navigation menu (repeat/pan/zoom)
 * is shown, matching AutoCAD's empty-canvas shortcut menu.
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

  e.preventDefault()
  e.stopPropagation()

  if (view.selectionSet.count === 0) {
    showMenu(e.clientX, e.clientY, buildMenuItems(false))
    return
  }

  const title = layerCtxT('menuTitleSelected', {
    count: String(view.selectionSet.count)
  })
  showMenu(e.clientX, e.clientY, buildMenuItems(true), title)
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

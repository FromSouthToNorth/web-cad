import {
  AcApDocManager,
  acapRunDatabaseEdit
} from '@hy/cad-simple-viewer'
import { log } from '@hy/data-model'

import {
  TunnelSettingsResult,
  updateTunnelEntities
} from './applyTunnelSettings'
import {
  getTunnelPluginOptions,
  resolveTunnelDrawOptions,
  setTunnelPluginOptions
} from './config'
import { startTunnelLocaleSync, TunnelMessageKey,tunnelT } from './i18n'

/**
 * Floating settings panel for the tunnel plugin.
 *
 * The host has no generic palette/dialog extension API, so the panel is a
 * self-contained DOM element appended to `document.body` (same injection
 * approach as the ribbon button). It controls:
 *
 * - 巷道线宽: roadway width of the tunnel entities
 * - 名称大小: text height of the labels (`0` = automatic)
 * - 名称碰撞避让: hide labels that would overlap each other
 *
 * Every control change is applied live: the edits are debounced, then the
 * current values mutate the already-drawn entities inside one undoable
 * database edit and are stored as the plugin defaults for the next draw.
 */

const WIDTH_MIN = 0.1
const WIDTH_MAX = 20
const WIDTH_STEP = 0.1

const HEIGHT_MIN = 0
const HEIGHT_MAX = 20
const HEIGHT_STEP = 0.5

/** Debounce window that merges rapid control edits into one transaction. */
const APPLY_DEBOUNCE_MS = 300

const PANEL_STYLE = `
.tunnel-panel {
  /* Follows the host UI theme: --ml-ui-* tokens applied by the viewer,
     then the Element Plus palette, then static defaults. */
  --tp-bg: var(--ml-ui-bg, var(--el-bg-color-overlay, #ffffff));
  --tp-fg: var(--ml-ui-text, var(--el-text-color-primary, #303133));
  --tp-muted: var(--ml-ui-text-muted, var(--el-text-color-regular, #606266));
  --tp-border: var(--ml-ui-border, var(--el-border-color, #dcdfe6));
  --tp-accent: var(--ml-ui-accent, var(--el-color-primary, #409eff));
  --tp-shadow: var(
    --ml-ui-shadow,
    var(--el-box-shadow, 0 2px 6px rgba(0, 0, 0, 0.12))
  );
  color-scheme: light;
  position: fixed;
  top: 132px;
  right: 16px;
  z-index: 3000;
  width: 264px;
  padding: 12px 14px;
  background: var(--tp-bg);
  color: var(--tp-fg);
  border: 1px solid var(--tp-border);
  border-radius: 8px;
  box-shadow: var(--tp-shadow);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
}
/* Hosts that only flip html.dark / data-ml-ui-theme without applying the
   --ml-ui-* or Element Plus dark variables still get the dark palette
   (same values as AcEdUiTheme's dark tokens). */
html.dark .tunnel-panel,
:root[data-ml-ui-theme='dark'] .tunnel-panel {
  --tp-bg: var(--ml-ui-bg, var(--el-bg-color-overlay, #1d1e1f));
  --tp-fg: var(--ml-ui-text, var(--el-text-color-primary, #e5eaf3));
  --tp-muted: var(--ml-ui-text-muted, var(--el-text-color-regular, #cfd3dc));
  --tp-border: var(--ml-ui-border, var(--el-border-color, #4c4d4f));
  --tp-accent: var(--ml-ui-accent, var(--el-color-primary, #409eff));
  --tp-shadow: var(
    --ml-ui-shadow,
    var(--el-box-shadow, 0 6px 18px rgba(0, 0, 0, 0.35))
  );
  color-scheme: dark;
}
.tunnel-panel--hidden {
  display: none;
}
.tunnel-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.tunnel-panel__title {
  font-size: 13px;
  font-weight: 600;
}
.tunnel-panel__close {
  border: none;
  background: none;
  color: var(--tp-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
}
.tunnel-panel__close:hover {
  color: var(--tp-fg);
}
.tunnel-panel__row {
  display: block;
  margin-bottom: 10px;
}
.tunnel-panel__label {
  display: block;
  margin-bottom: 4px;
  color: var(--tp-muted);
}
.tunnel-panel__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tunnel-panel__controls input[type='range'] {
  flex: 1;
  margin: 0;
  accent-color: var(--tp-accent);
}
.tunnel-panel__controls input[type='number'] {
  width: 64px;
  padding: 2px 4px;
  background: var(--tp-bg);
  color: var(--tp-fg);
  border: 1px solid var(--tp-border);
  border-radius: 4px;
}
.tunnel-panel__controls input[type='number']:focus {
  border-color: var(--tp-accent);
  box-shadow: 0 0 0 1px var(--tp-accent) inset;
  outline: none;
}
.tunnel-panel__check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--tp-fg);
}
.tunnel-panel__check input[type='checkbox'] {
  margin: 0;
  accent-color: var(--tp-accent);
}
`

let panel: HTMLElement | null = null
let stopLocaleSync: (() => void) | null = null
let applyTimer: number | null = null

const ensureStyle = (): void => {
  if (document.querySelector('style[data-tunnel-panel-style]')) return
  const style = document.createElement('style')
  style.setAttribute('data-tunnel-panel-style', '')
  style.textContent = PANEL_STYLE
  document.head.appendChild(style)
}

const buildPanel = (): HTMLElement => {
  const root = document.createElement('div')
  root.id = 'tunnel-settings-panel'
  root.className = 'tunnel-panel tunnel-panel--hidden'
  root.innerHTML = `
    <div class="tunnel-panel__header">
      <span class="tunnel-panel__title" data-i18n="panel.title"></span>
      <button type="button" class="tunnel-panel__close" data-action="close"
        title=""></button>
    </div>
    <label class="tunnel-panel__row">
      <span class="tunnel-panel__label" data-i18n="panel.width"
        data-i18n-title="panel.widthTip"></span>
      <span class="tunnel-panel__controls">
        <input type="range" data-field="width-range"
          min="${WIDTH_MIN}" max="${WIDTH_MAX}" step="${WIDTH_STEP}" />
        <input type="number" data-field="width-number"
          min="${WIDTH_MIN}" max="${WIDTH_MAX}" step="${WIDTH_STEP}" />
      </span>
    </label>
    <label class="tunnel-panel__row">
      <span class="tunnel-panel__label" data-i18n="panel.labelHeight"
        data-i18n-title="panel.labelHeightTip"></span>
      <span class="tunnel-panel__controls">
        <input type="range" data-field="height-range"
          min="${HEIGHT_MIN}" max="${HEIGHT_MAX}" step="${HEIGHT_STEP}" />
        <input type="number" data-field="height-number"
          min="${HEIGHT_MIN}" max="${HEIGHT_MAX}" step="${HEIGHT_STEP}" />
        <span class="tunnel-panel__auto" data-i18n="panel.labelAuto"
          hidden></span>
      </span>
    </label>
    <label class="tunnel-panel__check" data-i18n-title="panel.collisionTip">
      <input type="checkbox" data-field="collision" />
      <span data-i18n="panel.collision"></span>
    </label>
  `
  document.body.appendChild(root)
  return root
}

const q = <T extends HTMLElement>(root: HTMLElement, selector: string): T => {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`[cad-tunnel] missing panel element ${selector}`)
  return element
}

/** Applies the current locale's strings to the panel's text nodes. */
const applyPanelStrings = (): void => {
  if (!panel) return
  panel.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n as TunnelMessageKey
    if (key) element.textContent = tunnelT(key)
  })
  panel
    .querySelectorAll<HTMLElement>('[data-i18n-title]')
    .forEach(element => {
      const key = element.dataset.i18nTitle as TunnelMessageKey
      if (key) element.title = tunnelT(key)
    })
  panel
    .querySelectorAll<HTMLElement>('[data-action="close"]')
    .forEach(element => {
      element.title = tunnelT('panel.close')
    })
}

/** Copies the current plugin options into the panel inputs. */
const syncInputsFromOptions = (): void => {
  if (!panel) return
  const resolved = resolveTunnelDrawOptions(getTunnelPluginOptions())
  setWidthInputs(resolved.roadwayWidth)
  setHeightInputs(resolved.labelHeight)
  q<HTMLInputElement>(panel, '[data-field="collision"]').checked =
    resolved.labelCollision
}

const setWidthInputs = (value: number): void => {
  if (!panel) return
  const clamped = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, value))
  q<HTMLInputElement>(panel, '[data-field="width-range"]').value =
    String(clamped)
  q<HTMLInputElement>(panel, '[data-field="width-number"]').value =
    String(clamped)
}

const setHeightInputs = (value: number): void => {
  if (!panel) return
  const clamped = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, value))
  q<HTMLInputElement>(panel, '[data-field="height-range"]').value =
    String(clamped)
  q<HTMLInputElement>(panel, '[data-field="height-number"]').value =
    String(clamped)
  q<HTMLElement>(panel, '.tunnel-panel__auto').hidden = clamped > 0
}

const readInputs = (): {
  roadwayWidth: number
  labelHeight: number
  labelCollision: boolean
} => {
  if (!panel) throw new Error('[cad-tunnel] panel not mounted')
  return {
    roadwayWidth: Number(
      q<HTMLInputElement>(panel, '[data-field="width-number"]').value
    ),
    labelHeight: Number(
      q<HTMLInputElement>(panel, '[data-field="height-number"]').value
    ),
    labelCollision: q<HTMLInputElement>(panel, '[data-field="collision"]').checked
  }
}

const onApply = (): void => {
  const doc = AcApDocManager.instance.curDocument
  if (!doc) {
    log.warn(`[cad-tunnel] ${tunnelT('panel.noDocument')}`)
    return
  }
  const db = doc.database
  const update = readInputs()

  let result: TunnelSettingsResult | undefined
  acapRunDatabaseEdit(db, 'tunnelsettings', () => {
    result = updateTunnelEntities(db, update)
  })

  // Persist as defaults for the next drawtunnel run (0 height keeps the
  // automatic mode).
  const options = getTunnelPluginOptions()
  setTunnelPluginOptions({
    ...options,
    roadwayWidth: update.roadwayWidth,
    labelHeight: update.labelHeight,
    labelCollision: update.labelCollision
  })

  if (result) {
    log.info(
      `[cad-tunnel] ${tunnelT('panel.applyDone', {
        width: update.roadwayWidth,
        height: update.labelHeight,
        collision: update.labelCollision ? 1 : 0,
        updated:
          result.widthUpdated + result.heightUpdated + result.labelsHidden,
        shown: result.labelsShown,
        hidden: result.labelsHidden
      })}`
    )
  }
}

/**
 * Schedules the debounced live apply. Rapid edits (slider drags, repeated
 * keystrokes) restart the timer, so the batch lands as one undoable
 * transaction once the user stops changing the controls.
 */
const scheduleApply = (): void => {
  if (applyTimer != null) window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => {
    applyTimer = null
    onApply()
  }, APPLY_DEBOUNCE_MS)
}

/**
 * Mounts the panel once (hidden) and starts the locale sync. Safe to call
 * multiple times.
 */
export function startTunnelSettingsPanel(): void {
  if (panel) return
  ensureStyle()
  panel = buildPanel()
  applyPanelStrings()
  syncInputsFromOptions()

  q<HTMLElement>(panel, '[data-action="close"]').addEventListener('click', () => {
    panel?.classList.add('tunnel-panel--hidden')
  })

  const widthRange = q<HTMLInputElement>(panel, '[data-field="width-range"]')
  const widthNumber = q<HTMLInputElement>(panel, '[data-field="width-number"]')
  widthRange.addEventListener('input', () => {
    setWidthInputs(Number(widthRange.value))
    scheduleApply()
  })
  widthNumber.addEventListener('input', () => {
    setWidthInputs(Number(widthNumber.value))
    scheduleApply()
  })

  const heightRange = q<HTMLInputElement>(panel, '[data-field="height-range"]')
  const heightNumber = q<HTMLInputElement>(panel, '[data-field="height-number"]')
  heightRange.addEventListener('input', () => {
    setHeightInputs(Number(heightRange.value))
    scheduleApply()
  })
  heightNumber.addEventListener('input', () => {
    setHeightInputs(Number(heightNumber.value))
    scheduleApply()
  })

  q<HTMLInputElement>(panel, '[data-field="collision"]').addEventListener(
    'change',
    scheduleApply
  )

  stopLocaleSync = startTunnelLocaleSync(applyPanelStrings)
}

/** Shows the panel (refreshing inputs) when hidden, hides it otherwise. */
export function toggleTunnelSettingsPanel(): void {
  if (!panel) return
  if (panel.classList.contains('tunnel-panel--hidden')) {
    syncInputsFromOptions()
    panel.classList.remove('tunnel-panel--hidden')
  } else {
    panel.classList.add('tunnel-panel--hidden')
  }
}

/** Removes the panel and its locale subscription. */
export function stopTunnelSettingsPanel(): void {
  stopLocaleSync?.()
  stopLocaleSync = null
  if (applyTimer != null) {
    window.clearTimeout(applyTimer)
    applyTimer = null
  }
  panel?.remove()
  panel = null
}

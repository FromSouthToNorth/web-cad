import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

import { DRAWTUNNEL_COMMAND_NAME } from './config'
import { startTunnelLocaleSync, TunnelMessageKey,tunnelT } from './i18n'
import { toggleTunnelSettingsPanel } from './settingsPanel'

/**
 * Ribbon integration without touching host source code.
 *
 * The host ribbon (`@mlightcad/ribbon` inside `@mlightcad/cad-viewer`) has no
 * extension API, so this module injects two buttons into the rendered DOM of
 * the Home tab's Utilities group (实用工具): "Draw Tunnel" and "Tunnel
 * Settings".
 *
 * - A `MutationObserver` watches for the group element
 *   (`[data-group-id="home-utilities"]`) to appear or re-render.
 * - Each button is built by deep-cloning an existing large ribbon button
 *   (Quick Select) so it inherits every ribbon/element-plus style hook, then
 *   swapping id, label, icon and wiring our own click handler.
 * - If a host re-render drops an injected node, the next mutation batch
 *   re-injects it.
 *
 * Known limitation: the injected buttons do not participate in the ribbon's
 * responsive collapse (priority-based hiding at narrow widths) and show a
 * native `title` tooltip instead of the host's el-tooltip popover.
 */

/** Ribbon group that hosts the buttons (Home tab → Utilities). */
const GROUP_SELECTOR = '[data-group-id="home-utilities"]'

/** Existing large buttons used as the clone template, in preference order. */
const REFERENCE_ITEM_IDS = ['cmd-qselect', 'cmd-countlist'] as const

/** One injected ribbon button. */
interface RibbonItemSpec {
  itemId: string
  iconSvg: string
  labelKey: TunnelMessageKey
  tooltipKey: TunnelMessageKey
  onActivate: () => void
}

/** Tunnel portal glyph: arch + floor line. */
const ICON_TUNNEL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20">' +
  '<path fill="currentColor" d="M2.5 15.5v-3.6a7.5 7.5 0 0 1 15 0v3.6Z"/>' +
  '<path fill="currentColor" d="M2 16.5h16v1.5H2z"/>' +
  '</svg>'

/** Sliders glyph for the settings button. */
const ICON_SETTINGS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20">' +
  '<path fill="currentColor" d="M1.5 5h6v2h-6zM12.5 5h6v2h-6z"/>' +
  '<path fill="currentColor" d="M1.5 13h2v2h-2zM8.5 13h10v2h-10z"/>' +
  '<rect fill="currentColor" x="6.5" y="4" width="7" height="4" rx="1"/>' +
  '<rect fill="currentColor" x="2.5" y="12" width="7" height="4" rx="1"/>' +
  '</svg>'

const ITEMS: readonly RibbonItemSpec[] = [
  {
    itemId: 'cmd-drawtunnel',
    iconSvg: ICON_TUNNEL_SVG,
    labelKey: 'ribbonLabel',
    tooltipKey: 'ribbonTooltip',
    onActivate: () =>
      AcApDocManager.instance.sendStringToExecute(DRAWTUNNEL_COMMAND_NAME)
  },
  {
    itemId: 'cmd-tunnelsettings',
    iconSvg: ICON_SETTINGS_SVG,
    labelKey: 'ribbonSettingsLabel',
    tooltipKey: 'ribbonSettingsTooltip',
    onActivate: () => toggleTunnelSettingsPanel()
  }
]

let observer: MutationObserver | null = null
let stopLocaleSync: (() => void) | null = null

const containsElement = (nodes: NodeList): boolean => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].nodeType === Node.ELEMENT_NODE) return true
  }
  return false
}

const findReferenceHost = (group: HTMLElement): HTMLElement | null => {
  for (const id of REFERENCE_ITEM_IDS) {
    const host = group.querySelector<HTMLElement>(`[data-item-id="${id}"]`)
    if (host) return host
  }
  return null
}

const handleClick = (spec: RibbonItemSpec, event: MouseEvent): void => {
  event.preventDefault()
  event.stopPropagation()

  // The host disables every ribbon command while a document is opening. The
  // injected node cannot receive that state through the ribbon model, so the
  // click is ignored whenever the reference button is currently disabled.
  const referenceButton = document.querySelector<HTMLButtonElement>(
    `[data-item-id="${REFERENCE_ITEM_IDS[0]}"] button`
  )
  if (referenceButton?.disabled) return

  spec.onActivate()
}

const applyStrings = (spec: RibbonItemSpec, item: HTMLElement): void => {
  const label = tunnelT(spec.labelKey)
  const tooltip = tunnelT(spec.tooltipKey)

  const button = item.querySelector('button')
  if (button) {
    button.setAttribute('aria-label', label.replace(/\s+/g, ' ').trim())
    button.setAttribute('title', tooltip)
  }

  const labelElement = item.querySelector('.ml-ribbon-button__label')
  if (labelElement) {
    labelElement.textContent = label
  }
}

/**
 * Mirrors the reference button's disabled state onto an injected button.
 * Runs at injection time; the click handler re-checks the live state, so a
 * stale visual state can never trigger the command.
 */
const syncDisabledState = (
  group: HTMLElement,
  itemId: string,
  item?: Element
): void => {
  const host = item ?? group.querySelector(`[data-item-id="${itemId}"]`)
  const referenceButton = findReferenceHost(group)?.querySelector('button')
  const button = host?.querySelector('button')
  if (!button || !referenceButton) return

  const disabled =
    referenceButton.disabled || referenceButton.classList.contains('is-disabled')
  button.disabled = disabled
  button.classList.toggle('is-disabled', disabled)
}

const buildItem = (
  referenceHost: HTMLElement,
  spec: RibbonItemSpec
): HTMLElement => {
  const item = referenceHost.cloneNode(true) as HTMLElement
  item.setAttribute('data-item-id', spec.itemId)

  const button = item.querySelector('button')
  if (button) {
    button.setAttribute('data-ribbon-button-id', spec.itemId)
    button.addEventListener('click', event => handleClick(spec, event))
  }

  const icon = item.querySelector('.ml-ribbon-item-host__icon')
  if (icon) {
    icon.innerHTML = spec.iconSvg
  }

  applyStrings(spec, item)
  return item
}

const ensureItem = (group: HTMLElement, spec: RibbonItemSpec): void => {
  const selector = `[data-item-id="${spec.itemId}"]`
  const existing = group.querySelector(selector)
  if (existing) {
    syncDisabledState(group, spec.itemId, existing)
    return
  }

  const referenceHost = findReferenceHost(group)
  if (!referenceHost) return

  const item = buildItem(referenceHost, spec)
  referenceHost.insertAdjacentElement('afterend', item)
  syncDisabledState(group, spec.itemId, item)
}

const ensureAll = (): void => {
  const group = document.querySelector<HTMLElement>(GROUP_SELECTOR)
  if (!group) return
  for (const spec of ITEMS) ensureItem(group, spec)
}

/**
 * Starts ribbon integration: injects the buttons when possible and keeps
 * them alive across ribbon re-renders and locale switches.
 */
export function startTunnelRibbonButton(): void {
  if (observer) return

  ensureAll()

  stopLocaleSync = startTunnelLocaleSync(() => {
    const group = document.querySelector<HTMLElement>(GROUP_SELECTOR)
    if (!group) return
    for (const spec of ITEMS) {
      const item = group.querySelector<HTMLElement>(
        `[data-item-id="${spec.itemId}"]`
      )
      if (item) applyStrings(spec, item)
    }
  })

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (
        containsElement(mutation.addedNodes) ||
        containsElement(mutation.removedNodes)
      ) {
        ensureAll()
        break
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * Stops ribbon integration: disconnects the observer, unsubscribes the locale
 * sync and removes the injected buttons.
 */
export function stopTunnelRibbonButton(): void {
  observer?.disconnect()
  observer = null
  stopLocaleSync?.()
  stopLocaleSync = null
  for (const spec of ITEMS) {
    document.querySelector(`[data-item-id="${spec.itemId}"]`)?.remove()
  }
}

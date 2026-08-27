import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

import { invertSelT, startInvertSelLocaleSync } from './i18n'

/**
 * Ribbon integration without touching host source code.
 *
 * The host ribbon (`@mlightcad/ribbon` inside `@mlightcad/cad-viewer`) has no
 * extension API, so this module injects an "Invert Select" button into the
 * rendered DOM of the Home tab's Utilities group:
 *
 * - A `MutationObserver` watches for the group element
 *   (`[data-group-id="home-utilities"]`) to appear or re-render.
 * - The button is built by deep-cloning an existing large ribbon button
 *   (Quick Select) so it inherits every ribbon/element-plus style hook, then
 *   swapping id, label, icon and wiring our own click handler.
 * - If a host re-render drops the injected node, the next mutation batch
 *   re-injects it.
 *
 * Known limitation: the injected button does not participate in the ribbon's
 * responsive collapse (priority-based hiding at narrow widths) and shows a
 * native `title` tooltip instead of the host's el-tooltip popover.
 */

/** Ribbon group that hosts the button (Home tab → Utilities). */
const GROUP_SELECTOR = '[data-group-id="home-utilities"]'

/** Item id of the injected button. */
const ITEM_ID = 'cmd-invertsel'

/** Existing large buttons used as the clone template, in preference order. */
const REFERENCE_ITEM_IDS = ['cmd-qselect', 'cmd-countlist'] as const

const ITEM_SELECTOR = `[data-item-id="${ITEM_ID}"]`

/** Same artwork as the feature's original ribbon icon (invertSelection.svg). */
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 20 20">' +
  '<path fill="currentColor" fill-rule="evenodd" d="M3 2.5h14v15H3v-15Zm2 2v11h10v-11H5Z"/>' +
  '<path fill="currentColor" d="M10 5 13.4 9H11v2H9V9H6.6L10 5Zm0 10L6.6 11H9V9h2v2h2.4L10 15Z"/>' +
  '</svg>'

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

const handleClick = (event: MouseEvent): void => {
  event.preventDefault()
  event.stopPropagation()

  // The host disables every ribbon command while a document is opening. The
  // injected node cannot receive that state through the ribbon model, so the
  // click is ignored whenever the reference button is currently disabled.
  const referenceButton = document.querySelector<HTMLButtonElement>(
    `[data-item-id="${REFERENCE_ITEM_IDS[0]}"] button`
  )
  if (referenceButton?.disabled) return

  AcApDocManager.instance.sendStringToExecute('invertsel')
}

const applyStrings = (item: HTMLElement): void => {
  const label = invertSelT('ribbonLabel')
  const tooltip = invertSelT('ribbonTooltip')

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
 * Mirrors the reference button's disabled state onto the injected button.
 * Runs at injection time; the click handler re-checks the live state, so a
 * stale visual state can never trigger the command.
 */
const syncDisabledState = (group: HTMLElement, item?: Element): void => {
  const host = item ?? group.querySelector(ITEM_SELECTOR)
  const referenceButton = findReferenceHost(group)?.querySelector('button')
  const button = host?.querySelector('button')
  if (!button || !referenceButton) return

  const disabled =
    referenceButton.disabled || referenceButton.classList.contains('is-disabled')
  button.disabled = disabled
  button.classList.toggle('is-disabled', disabled)
}

const buildItem = (referenceHost: HTMLElement): HTMLElement => {
  const item = referenceHost.cloneNode(true) as HTMLElement
  item.setAttribute('data-item-id', ITEM_ID)

  const button = item.querySelector('button')
  if (button) {
    button.setAttribute('data-ribbon-button-id', ITEM_ID)
    button.addEventListener('click', handleClick)
  }

  const icon = item.querySelector('.ml-ribbon-item-host__icon')
  if (icon) {
    icon.innerHTML = ICON_SVG
  }

  applyStrings(item)
  return item
}

const ensureButton = (): void => {
  const group = document.querySelector<HTMLElement>(GROUP_SELECTOR)
  if (!group) return

  const existing = group.querySelector(ITEM_SELECTOR)
  if (existing) {
    syncDisabledState(group, existing)
    return
  }

  const referenceHost = findReferenceHost(group)
  if (!referenceHost) return

  const item = buildItem(referenceHost)
  referenceHost.insertAdjacentElement('afterend', item)
  syncDisabledState(group, item)
}

/**
 * Starts ribbon integration: injects the button when possible and keeps it
 * alive across ribbon re-renders and locale switches.
 */
export function startInvertSelRibbonButton(): void {
  if (observer) return

  ensureButton()

  stopLocaleSync = startInvertSelLocaleSync(() => {
    const item = document.querySelector<HTMLElement>(ITEM_SELECTOR)
    if (item) applyStrings(item)
  })

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (
        containsElement(mutation.addedNodes) ||
        containsElement(mutation.removedNodes)
      ) {
        ensureButton()
        break
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * Stops ribbon integration: disconnects the observer, unsubscribes the locale
 * sync and removes the injected button.
 */
export function stopInvertSelRibbonButton(): void {
  observer?.disconnect()
  observer = null
  stopLocaleSync?.()
  stopLocaleSync = null
  document.querySelector(ITEM_SELECTOR)?.remove()
}

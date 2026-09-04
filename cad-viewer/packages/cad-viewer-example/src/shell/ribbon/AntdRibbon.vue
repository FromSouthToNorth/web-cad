<template>
  <div class="antd-ribbon" :class="{ 'is-collapsed': isCollapsed }">
    <!-- QAT + tabs + locale share the header row -->
    <div class="antd-ribbon-qat-row">
      <AntdQat
        :items="qatItems"
        :file-items="fileItems"
        :disabled="disabled"
      />
      <div
        class="antd-ribbon-tabs"
        role="tablist"
        :aria-label="t('shell.ribbon.tablist')"
      >
        <button
          v-for="(tab, index) in visibleTabs"
          :id="`antd-ribbon-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="antd-ribbon-tab"
          :class="{
            'is-active': tab.id === activeTabId,
            'is-contextual': !!tab.contextual
          }"
          :style="tab.contextual ? { '--tab-context-color': tab.contextual.color } : {}"
          :aria-selected="tab.id === activeTabId"
          :aria-controls="`antd-ribbon-panel-${tab.id}`"
          :aria-keyshortcuts="tab.keyTip ? `Alt+${tab.keyTip}` : undefined"
          :tabindex="tab.id === activeTabId ? 0 : -1"
          :ref="el => setTabButtonRef(tab.id, el)"
          @click="activateTab(tab.id)"
          @keydown="onTabKeydown($event, index)"
          @dblclick="toggleCollapse"
        >
          <span class="antd-ribbon-tab-label">
            {{ t(`shell.ribbon.tab.${tab.id}`) }}
          </span>
          <span
            v-if="tabKeytipsVisible && tab.keyTip"
            class="antd-ribbon-keytip"
            :class="{ 'is-pending': keytipPending(tab.keyTip) }"
            aria-hidden="true"
          >
            {{ tab.keyTip }}
          </span>
        </button>
      </div>
      <div class="antd-ribbon-qat-right">
        <a-select
          v-model:value="activeLocale"
          size="small"
          class="antd-ribbon-locale"
          :options="localeOptions"
          :aria-label="t('shell.ribbon.locale')"
          @change="onLocaleChange"
        />
        <a-tooltip
          :title="isCollapsed ? t('shell.ribbon.expand') : t('shell.ribbon.collapse')"
          placement="bottom"
        >
          <button
            type="button"
            class="antd-qat-btn"
            :aria-label="isCollapsed ? t('shell.ribbon.expand') : t('shell.ribbon.collapse')"
            :aria-expanded="!isCollapsed"
            @click="toggleCollapse"
          >
            <UpOutlined v-if="isCollapsed" />
            <DownOutlined v-else />
          </button>
        </a-tooltip>
      </div>
    </div>

    <!-- Panel area; quick property controls live in the Properties panel.
         Kept mounted while collapsed (height animation) but inert so the
         hidden controls are unreachable for keyboard/screen readers. -->
    <div
      ref="panelsRegion"
      class="antd-ribbon-panels"
      role="tabpanel"
      :id="`antd-ribbon-panel-${activeTabId}`"
      :aria-labelledby="`antd-ribbon-tab-${activeTabId}`"
      :inert="isCollapsed || undefined"
    >
      <div class="antd-ribbon-panels-inner">
        <AntdRibbonPanel
          v-for="panel in activeTab?.panels ?? []"
          :key="panel.id"
          :title="t(`shell.ribbon.group.${panel.id}`)"
          :items="panel.items"
          :disabled="disabled"
          :keytip-active="panelKeytipsVisible"
          :keytip-buffer="keytipBuffer"
          @execute="run"
        >
          <AntdLayerSelect
            v-if="panel.id === 'layer'"
            :disabled="disabled"
          />
          <AntdPropertyBar
            v-if="panel.id === 'properties'"
            :disabled="disabled"
          />
        </AntdRibbonPanel>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DownOutlined, UpOutlined } from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  LOCALE_OPTIONS,
  useDocument,
  useLocale
} from '@mlightcad/cad-viewer'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AntdLayerSelect from './AntdLayerSelect.vue'
import AntdPropertyBar from './AntdPropertyBar.vue'
import AntdQat from './AntdQat.vue'
import AntdRibbonPanel from './AntdRibbonPanel.vue'
import { fileItems, qatItems, ribbonTabs } from './ribbonModel'
import type { RibbonItemDef } from './ribbonTypes'

const { t } = useI18n()

const props = defineProps<{
  disabled?: boolean
}>()

// ── tabs ─────────────────────────────────────────────────────────────

const activeTabId = ref(ribbonTabs[0]?.id ?? '')
const activeTab = computed(() =>
  ribbonTabs.find(tab => tab.id === activeTabId.value)
)
const visibleTabs = computed(() => ribbonTabs)

function activateTab(tabId: string) {
  activeTabId.value = tabId
  if (isCollapsed.value) {
    setCollapsed(false)
  }
}

// ── tablist keyboard navigation (WAI-ARIA roving tabindex) ──────────

const tabButtons = new Map<string, HTMLButtonElement>()

function setTabButtonRef(id: string, el: unknown) {
  if (el instanceof HTMLButtonElement) {
    tabButtons.set(id, el)
  } else {
    tabButtons.delete(id)
  }
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  const ids = visibleTabs.value.map(tab => tab.id)
  if (!ids.length) return
  let next = -1
  switch (event.key) {
    case 'ArrowRight':
      next = (index + 1) % ids.length
      break
    case 'ArrowLeft':
      next = (index - 1 + ids.length) % ids.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = ids.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  activateTab(ids[next])
  resetKeytips()
  tabButtons.get(ids[next])?.focus()
}

// ── collapse (double-click to minimize) ──────────────────────────────
//
// Height is animated between 0 and the natural content height via inline
// styles plus the CSS height transition; the panels stay mounted so the
// quick property controls keep their state.

const isCollapsed = ref(false)
const panelsRegion = ref<HTMLElement | null>(null)
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
)

/** Removes listeners left behind by an interrupted expand animation. */
let clearExpandListeners: (() => void) | undefined

/**
 * Commit pending inline styles before flipping to the transition target.
 * A forced reflow (instead of requestAnimationFrame) also works while the
 * document is hidden, where animation frames are paused.
 */
function commitStyle(element: HTMLElement) {
  void element.offsetHeight
}

function setCollapsed(collapsed: boolean) {
  if (isCollapsed.value === collapsed) return
  isCollapsed.value = collapsed

  const region = panelsRegion.value
  if (!region) return

  clearExpandListeners?.()
  clearExpandListeners = undefined

  if (prefersReducedMotion.matches) {
    // Snap without animating. The transition is disabled while the height
    // change is committed, so no animation starts.
    region.style.transition = 'none'
    region.style.height = collapsed ? '0px' : ''
    commitStyle(region)
    region.style.transition = ''
    return
  }

  if (collapsed) {
    region.style.height = `${region.offsetHeight}px`
    commitStyle(region)
    region.style.height = '0px'
  } else {
    region.style.height = '0px'
    commitStyle(region)
    region.style.height = `${region.scrollHeight}px`
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName !== 'height') return
      region.style.height = ''
      clearExpandListeners?.()
      clearExpandListeners = undefined
    }
    clearExpandListeners = () => {
      region.removeEventListener('transitionend', onEnd)
    }
    region.addEventListener('transitionend', onEnd)
  }
}

function toggleCollapse() {
  setCollapsed(!isCollapsed.value)
}

// ── keytips (Alt-key navigation, AutoCAD style) ──────────────────────
//
// Press Alt to reveal keytip badges, then type the letters shown on a tab
// to open it (level 1) and on a button to run its command (level 2).
// Matching is prefix-based, so multi-letter tips such as "REC" resolve as
// soon as the full tip is typed. Esc or any pointer press cancels.

const keytipActive = ref(false)
/** 1 = choosing a tab, 2 = choosing a command inside the active tab. */
const keytipLevel = ref<1 | 2>(1)
const keytipBuffer = ref('')

const tabKeytipsVisible = computed(
  () => keytipActive.value && keytipLevel.value === 1
)
const panelKeytipsVisible = computed(
  () => keytipActive.value && keytipLevel.value === 2
)

/** Level-2 targets: large (visible) tools of the active tab that have a keytip. */
const keytipTargets = computed(() =>
  (activeTab.value?.panels ?? [])
    .flatMap(panel => panel.items)
    .filter(
      (item): item is RibbonItemDef & { keyTip: string } =>
        (item.size ?? 'large') === 'large' && item.keyTip !== undefined
    )
)

function keytipPending(keyTip: string): boolean {
  if (!keytipBuffer.value) return false
  return keyTip.toLowerCase().startsWith(keytipBuffer.value)
}

function exitKeytips() {
  keytipActive.value = false
  keytipLevel.value = 1
  keytipBuffer.value = ''
}

/** Keep keytips live but return to tab selection (manual tab change). */
function resetKeytips() {
  keytipLevel.value = 1
  keytipBuffer.value = ''
}

function handleKeytipKey(char: string) {
  const buffer = keytipBuffer.value + char
  if (keytipLevel.value === 1) {
    const exact = visibleTabs.value.find(
      tab => (tab.keyTip ?? '').toLowerCase() === buffer
    )
    if (exact) {
      activateTab(exact.id)
      keytipLevel.value = 2
      keytipBuffer.value = ''
      return
    }
    const pending = visibleTabs.value.filter(tab =>
      (tab.keyTip ?? '').toLowerCase().startsWith(buffer)
    )
    if (pending.length) {
      keytipBuffer.value = buffer
      return
    }
  } else {
    const exact = keytipTargets.value.find(
      item => item.keyTip.toLowerCase() === buffer
    )
    if (exact) {
      exitKeytips()
      run(exact.command)
      return
    }
    const pending = keytipTargets.value.filter(item =>
      item.keyTip.toLowerCase().startsWith(buffer)
    )
    if (pending.length) {
      keytipBuffer.value = buffer
      return
    }
  }
  exitKeytips()
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (keytipActive.value) {
      event.preventDefault()
      exitKeytips()
    }
    return
  }
  if (event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.repeat) return
    event.preventDefault()
    keytipActive.value = !keytipActive.value
    resetKeytips()
    return
  }
  if (!keytipActive.value) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Backspace') {
    event.preventDefault()
    keytipBuffer.value = keytipBuffer.value.slice(0, -1)
    return
  }
  if (event.key.length === 1) {
    event.preventDefault()
    handleKeytipKey(event.key.toLowerCase())
  }
}

/** Any pointer press cancels keytip mode before the click acts. */
function onPointerDown() {
  if (keytipActive.value) {
    exitKeytips()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
  window.addEventListener('pointerdown', onPointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
  window.removeEventListener('pointerdown', onPointerDown, true)
})

// ── document state ───────────────────────────────────────────────────

const { isDocumentOpening } = useDocument()
const disabled = computed(
  () => props.disabled === true || isDocumentOpening.value
)

// ── locale ───────────────────────────────────────────────────────────

const { effectiveLocale, setLocale } = useLocale()

const activeLocale = ref<string>(String(effectiveLocale.value))
watch(effectiveLocale, value => {
  activeLocale.value = String(value)
})

const localeOptions = LOCALE_OPTIONS.map(option => ({
  value: option.locale,
  label: option.label
}))

function onLocaleChange(value: string) {
  setLocale(value as 'en' | 'zh' | 'tr' | 'cs')
}

// ── command execution ────────────────────────────────────────────────

function run(command: string) {
  if (disabled.value) return
  AcApDocManager.instance.sendStringToExecute(command)
}
</script>

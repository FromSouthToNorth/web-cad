<template>
  <div class="antd-ribbon" :class="{ 'is-collapsed': isCollapsed }">
    <!-- QAT + tabs + locale share the header row -->
    <div class="antd-ribbon-qat-row">
      <AntdQat
        :items="qatItems"
        :file-items="fileItems"
        :disabled="disabled"
      />
      <div class="antd-ribbon-tabs" role="tablist">
        <button
          v-for="(tab, index) in visibleTabs"
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
          :tabindex="tab.id === activeTabId ? 0 : -1"
          :ref="el => setTabButtonRef(tab.id, el)"
          @click="activateTab(tab.id)"
          @keydown="onTabKeydown($event, index)"
          @dblclick="toggleCollapse"
        >
          {{ t(`shell.ribbon.tab.${tab.id}`) }}
        </button>
      </div>
      <div class="antd-ribbon-qat-right">
        <a-select
          v-model:value="activeLocale"
          size="small"
          class="antd-ribbon-locale"
          :options="localeOptions"
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

    <!-- Panel area; quick property controls live in the Properties panel -->
    <div v-if="!isCollapsed" class="antd-ribbon-panels">
      <AntdRibbonPanel
        v-for="panel in activeTab?.panels ?? []"
        :key="panel.id"
        :title="t(`shell.ribbon.group.${panel.id}`)"
        :items="panel.items"
        :disabled="disabled"
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
</template>

<script setup lang="ts">
import { DownOutlined, UpOutlined } from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  LOCALE_OPTIONS,
  useDocument,
  useLocale
} from '@mlightcad/cad-viewer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AntdLayerSelect from './AntdLayerSelect.vue'
import AntdPropertyBar from './AntdPropertyBar.vue'
import AntdQat from './AntdQat.vue'
import AntdRibbonPanel from './AntdRibbonPanel.vue'
import { fileItems, qatItems, ribbonTabs } from './ribbonModel'

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
    isCollapsed.value = false
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
  tabButtons.get(ids[next])?.focus()
}

// ── collapse (double-click to minimize) ──────────────────────────────

const isCollapsed = ref(false)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

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

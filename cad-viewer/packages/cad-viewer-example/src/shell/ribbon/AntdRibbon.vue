<template>
  <div class="antd-ribbon" :class="{ 'is-collapsed': isCollapsed }">
    <!-- Row 1: QAT + locale -->
    <div class="antd-ribbon-qat-row">
      <AntdQat
        :items="qatItems"
        :file-items="fileItems"
        :disabled="disabled"
      />
      <div class="antd-ribbon-qat-right">
        <a-select
          v-model:value="activeLocale"
          size="small"
          class="antd-ribbon-locale"
          :options="localeOptions"
          @change="onLocaleChange"
        />
      </div>
    </div>

    <!-- Row 2: Tab bar -->
    <div class="antd-ribbon-tab-bar">
      <div class="antd-ribbon-tabs" role="tablist">
        <button
          v-for="tab in visibleTabs"
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
          @click="activateTab(tab.id)"
          @dblclick="toggleCollapse"
        >
          {{ t(`shell.ribbon.tab.${tab.id}`) }}
        </button>
      </div>
    </div>

    <!-- Property bar (Home tab only) -->
    <AntdPropertyBar
      v-if="activeTabId === 'home' && !isCollapsed"
      :disabled="disabled"
    />

    <!-- Row 3: Panel area -->
    <div v-if="!isCollapsed" class="antd-ribbon-panels">
      <AntdRibbonPanel
        v-for="panel in activeTab?.panels ?? []"
        :key="panel.id"
        :title="t(`shell.ribbon.group.${panel.id}`)"
        :items="panel.items"
        :disabled="disabled"
        @execute="run"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  LOCALE_OPTIONS,
  useDocument,
  useLocale
} from '@mlightcad/cad-viewer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AntdRibbonPanel from './AntdRibbonPanel.vue'
import AntdPropertyBar from './AntdPropertyBar.vue'
import AntdQat from './AntdQat.vue'
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

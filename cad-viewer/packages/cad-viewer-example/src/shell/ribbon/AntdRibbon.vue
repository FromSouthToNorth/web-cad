<template>
  <div class="antd-ribbon">
    <div class="antd-ribbon-top">
      <a-dropdown :trigger="['click']" placement="bottomLeft">
        <a-button type="text" size="small" class="antd-ribbon-file">
          {{ t('shell.ribbon.fileMenu') }}
        </a-button>
        <template #overlay>
          <a-menu class="antd-ribbon-file-menu" @click="handleFileMenu">
            <a-menu-item
              v-for="item in ribbonFileItems"
              :key="item.id"
              :class="{ 'antd-ribbon-file-menu-item': true }"
            >
              {{ t(`shell.ribbon.file.${item.id}`) }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>

      <div class="antd-ribbon-tabs" role="tablist">
        <button
          v-for="tab in ribbonTabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="antd-ribbon-tab"
          :class="{ 'is-active': tab.id === activeTabId }"
          :aria-selected="tab.id === activeTabId"
          @click="activeTabId = tab.id"
        >
          {{ t(`shell.ribbon.tab.${tab.id}`) }}
        </button>
      </div>

      <div class="antd-ribbon-right">
        <a-tooltip :title="t('shell.ribbon.undo')" placement="bottom">
          <a-button
            type="text"
            size="small"
            class="antd-ribbon-quick"
            :disabled="disabled || !canUndo"
            aria-label="Undo"
            @click="run('undo')"
          >
            <template #icon><UndoOutlined /></template>
          </a-button>
        </a-tooltip>
        <a-tooltip :title="t('shell.ribbon.redo')" placement="bottom">
          <a-button
            type="text"
            size="small"
            class="antd-ribbon-quick"
            :disabled="disabled || !canRedo"
            aria-label="Redo"
            @click="run('redo')"
          >
            <template #icon><RedoOutlined /></template>
          </a-button>
        </a-tooltip>
        <a-select
          v-model:value="activeLocale"
          size="small"
          class="antd-ribbon-locale"
          :options="localeOptions"
          @change="onLocaleChange"
        />
      </div>
    </div>

    <div class="antd-ribbon-panels">
      <div
        v-for="group in activeTab?.groups ?? []"
        :key="group.id"
        class="antd-ribbon-group"
      >
        <span class="antd-ribbon-group-title">
          {{ t(`shell.ribbon.group.${group.id}`) }}
        </span>
        <div class="antd-ribbon-group-buttons">
          <a-tooltip
            v-for="btn in group.buttons"
            :key="btn.id"
            :title="t(`shell.ribbon.button.${btn.id}`)"
            placement="bottom"
          >
            <a-button
              type="text"
              size="small"
              class="antd-ribbon-button"
              :disabled="disabled"
              @click="run(btn.command)"
            >
              <span class="antd-ribbon-button-icon">
                <component :is="btn.icon" />
              </span>
              <span class="antd-ribbon-button-label">
                {{ t(`shell.ribbon.button.${btn.id}`) }}
              </span>
            </a-button>
          </a-tooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RedoOutlined, UndoOutlined } from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  LOCALE_OPTIONS,
  useDocument,
  useLocale,
  useUndoRedo
} from '@mlightcad/cad-viewer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { ribbonFileItems, ribbonTabs } from './ribbonModel'

const { t } = useI18n()

const props = defineProps<{
  /** Disable every ribbon control (used until the CAD core is ready). */
  disabled?: boolean
}>()

const activeTabId = ref(ribbonTabs[0]?.id ?? '')
const activeTab = computed(() =>
  ribbonTabs.find(tab => tab.id === activeTabId.value)
)

const { isDocumentOpening } = useDocument()
const disabled = computed(
  () => props.disabled === true || isDocumentOpening.value
)

const { canUndo, canRedo } = useUndoRedo()
const { effectiveLocale, setLocale } = useLocale()

const activeLocale = ref<string>(String(effectiveLocale.value))
watch(effectiveLocale, value => {
  activeLocale.value = String(value)
})

const localeOptions = LOCALE_OPTIONS.map(option => ({
  value: option.locale,
  label: option.label
}))

const onLocaleChange = (value: string) => {
  setLocale(value as 'en' | 'zh' | 'tr' | 'cs')
}

const run = (command: string) => {
  if (disabled.value) return
  AcApDocManager.instance.sendStringToExecute(command)
}

const handleFileMenu = ({ key }: { key: string | number }) => {
  run(String(key))
}
</script>

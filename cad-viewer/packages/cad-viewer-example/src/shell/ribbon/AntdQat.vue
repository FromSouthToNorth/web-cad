<template>
  <div class="antd-qat">
    <a-dropdown :trigger="['click']" placement="bottomLeft">
      <button
        type="button"
        class="antd-qat-app-btn"
        :aria-label="t('shell.ribbon.fileMenu')"
      >
        <span class="antd-qat-app-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </span>
      </button>
      <template #overlay>
        <div class="antd-qat-file-menu">
          <button
            v-for="item in props.fileItems"
            :key="item.id"
            type="button"
            class="antd-qat-file-item"
            @click="execute(item.command)"
          >
            {{ t(`shell.ribbon.file.${item.id}`) }}
          </button>
        </div>
      </template>
    </a-dropdown>

    <div class="antd-qat-divider" />

    <a-tooltip
      v-for="item in props.items"
      :key="item.id"
      :title="labelFor(item)"
      placement="bottom"
    >
      <!-- span host keeps the tooltip working while the button is disabled.
           Rendered disabled through is-disabled/aria-disabled only: the
           native attribute would swallow the click, and clicks arriving
           while a document is opening are queued by the ribbon instead. -->
      <span class="antd-ribbon-tooltip-host">
        <button
          type="button"
          class="antd-qat-btn"
          :class="{ 'is-disabled': props.disabled }"
          :aria-disabled="props.disabled"
          @click="execute(item.command)"
        >
          <component :is="item.icon" />
        </button>
      </span>
    </a-tooltip>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { QatItemDef, RibbonFileItemDef } from './ribbonTypes'

const { t, te } = useI18n()

const props = defineProps<{
  items: QatItemDef[]
  fileItems: RibbonFileItemDef[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  execute: [command: string]
}>()

/** Look up a localised label via `shell.ribbon.qat.<id>`. */
function labelFor(item: QatItemDef): string {
  const key = `shell.ribbon.qat.${item.id}`
  return te(key) ? t(key) : item.label
}

/**
 * Forwards the command to the ribbon, which queues it when a document is
 * still opening instead of rejecting the click.
 */
function execute(command: string) {
  emit('execute', command)
}
</script>

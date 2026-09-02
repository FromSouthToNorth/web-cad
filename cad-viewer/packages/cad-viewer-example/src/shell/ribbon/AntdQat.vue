<template>
  <div class="antd-qat">
    <a-dropdown :trigger="['click']" placement="bottomLeft">
      <button type="button" class="antd-qat-app-btn" aria-label="Application menu">
        <span class="antd-qat-app-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
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
      :title="item.label"
      placement="bottom"
    >
      <button
        type="button"
        class="antd-qat-btn"
        :disabled="props.disabled"
        @click="execute(item.command)"
      >
        <component :is="item.icon" />
      </button>
    </a-tooltip>
  </div>
</template>

<script setup lang="ts">
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { useI18n } from 'vue-i18n'

import type { QatItemDef, RibbonFileItemDef } from './ribbonTypes'

const { t } = useI18n()

const props = defineProps<{
  items: QatItemDef[]
  fileItems: RibbonFileItemDef[]
  disabled?: boolean
}>()

function execute(command: string) {
  if (props.disabled) return
  AcApDocManager.instance.sendStringToExecute(command)
}
</script>

<template>
  <div class="antd-ribbon-panel">
    <div class="antd-ribbon-panel-items">
      <!-- Leading content, e.g. quick property controls on the Properties panel -->
      <slot />
      <template v-for="item in mainItems" :key="item.id">
        <!-- Dropdown button -->
        <AntdDropdownButton
          v-if="item.type === 'dropdown'"
          :command="item.command"
          :icon="item.icon"
          :label="labelFor(item.id, item.label)"
          :options="item.options"
          :disabled="props.disabled"
          @execute="handleExecute"
        />

        <!-- Simple button -->
        <a-tooltip
          v-else
          placement="bottom"
          :destroy-tooltip-on-hide="true"
        >
          <template #title>
            <div class="antd-ribbon-tooltip">
              <span class="antd-ribbon-tooltip-title">
                {{ labelFor(item.id, item.label) }}
              </span>
              <span v-if="item.keyTip" class="antd-ribbon-tooltip-shortcut">
                ({{ item.keyTip }})
              </span>
            </div>
          </template>
          <button
            type="button"
            :class="[
              'antd-ribbon-button',
              `antd-ribbon-button--${item.size ?? 'large'}`
            ]"
            :disabled="props.disabled"
            @click="handleExecute(item.command)"
          >
            <span class="antd-ribbon-button-icon">
              <component :is="item.icon" />
            </span>
            <span
              v-if="(item.size ?? 'large') === 'large'"
              class="antd-ribbon-button-label"
            >
              {{ labelFor(item.id, item.label) }}
            </span>
          </button>
        </a-tooltip>
      </template>
    </div>

    <!-- Panel title; small secondary tools collapse into its dropdown -->
    <a-dropdown
      v-if="overflowItems.length"
      :trigger="['click']"
      placement="bottom"
      :disabled="props.disabled"
    >
      <button
        type="button"
        class="antd-ribbon-panel-title antd-ribbon-panel-title--dropdown"
        :disabled="props.disabled"
      >
        <span>{{ props.title }}</span>
        <span class="antd-ribbon-panel-title-arrow">
          <DownOutlined />
        </span>
      </button>
      <template #overlay>
        <div class="antd-ribbon-dropdown-menu">
          <button
            v-for="item in overflowItems"
            :key="item.id"
            type="button"
            class="antd-ribbon-dropdown-option"
            @click="handleOverflowClick(item)"
          >
            <span v-if="item.icon" class="antd-ribbon-dropdown-option-icon">
              <component :is="item.icon" />
            </span>
            <span class="antd-ribbon-dropdown-option-label">
              {{ labelFor(item.id, item.label) }}
            </span>
            <span v-if="item.keyTip" class="antd-ribbon-dropdown-option-keytip">
              {{ item.keyTip }}
            </span>
          </button>
        </div>
      </template>
    </a-dropdown>
    <span v-else class="antd-ribbon-panel-title">
      {{ props.title }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { DownOutlined } from '@ant-design/icons-vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RibbonItemDef } from './ribbonTypes'
import AntdDropdownButton from './AntdDropdownButton.vue'

const props = defineProps<{
  title: string
  items: RibbonItemDef[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  execute: [command: string]
}>()

const { t, te } = useI18n()

/** Large primary tools stay in the panel body. */
const mainItems = computed(() =>
  props.items.filter(item => (item.size ?? 'large') === 'large')
)

/** Small secondary tools collapse into the panel-title dropdown. */
const overflowItems = computed(() =>
  props.items.filter(item => item.size === 'small')
)

/**
 * Look up a localised label via `shell.ribbon.button.<id>`.
 * Falls back to the English label baked into the data model.
 */
function labelFor(id: string, fallback: string): string {
  const key = `shell.ribbon.button.${id}`
  return te(key) ? t(key) : fallback
}

function handleExecute(command: string) {
  if (props.disabled) return
  emit('execute', command)
}

function handleOverflowClick(item: RibbonItemDef) {
  handleExecute(item.command)
}
</script>

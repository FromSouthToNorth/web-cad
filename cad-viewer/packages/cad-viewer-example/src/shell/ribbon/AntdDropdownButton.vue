<template>
  <a-dropdown
    v-model:open="dropdownOpen"
    :trigger="['click']"
    placement="bottomLeft"
  >
    <button
      type="button"
      class="antd-ribbon-dropdown"
      :class="{ 'is-disabled': props.disabled }"
      :aria-label="props.label"
    >
      <!-- Main click area: executes default command -->
      <div class="antd-ribbon-dropdown-main" @click.stop="handleMainClick">
        <span class="antd-ribbon-dropdown-icon">
          <component :is="props.icon" />
        </span>
        <span class="antd-ribbon-dropdown-label">
          {{ props.label }}
        </span>
      </div>
      <!-- Arrow: opens the variant menu -->
      <span
        class="antd-ribbon-dropdown-arrow"
        @click.stop="dropdownOpen = !dropdownOpen"
      >
        <DownOutlined />
      </span>
    </button>
    <template #overlay>
      <div class="antd-ribbon-dropdown-menu">
        <button
          v-for="opt in props.options"
          :key="opt.id"
          type="button"
          class="antd-ribbon-dropdown-option"
          @click="handleOptionClick(opt)"
        >
          <span v-if="opt.icon" class="antd-ribbon-dropdown-option-icon">
            <component :is="opt.icon" />
          </span>
          <span class="antd-ribbon-dropdown-option-label">
            {{ optLabel(opt.id, opt.label) }}
          </span>
        </button>
      </div>
    </template>
  </a-dropdown>
</template>

<script setup lang="ts">
import { DownOutlined } from '@ant-design/icons-vue'
import type { Component } from 'vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RibbonDropdownDef } from './ribbonTypes'

const props = defineProps<{
  /** Default command executed when clicking the main body. */
  command: string
  icon?: Component
  label: string
  options: RibbonDropdownDef['options']
  disabled?: boolean
}>()

const emit = defineEmits<{
  execute: [command: string]
}>()

const dropdownOpen = ref(false)
const { t, te } = useI18n()

/** Look up a localised label; falls back to the English label in the data model. */
function optLabel(id: string, fallback: string): string {
  const key = `shell.ribbon.option.${id}`
  return te(key) ? t(key) : fallback
}

function handleMainClick() {
  if (props.disabled) return
  emit('execute', props.command)
}

function handleOptionClick(opt: { id: string; command: string }) {
  dropdownOpen.value = false
  emit('execute', opt.command)
}
</script>

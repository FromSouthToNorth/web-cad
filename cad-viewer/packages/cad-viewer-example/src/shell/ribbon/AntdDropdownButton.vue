<template>
  <a-dropdown
    v-model:open="dropdownOpen"
    :trigger="['click']"
    placement="bottomLeft"
    :disabled="props.disabled"
  >
    <button
      type="button"
      class="antd-ribbon-dropdown"
      :class="{ 'is-disabled': props.disabled }"
      :aria-label="props.label"
      :disabled="props.disabled"
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
        @click.stop="toggleMenu"
      >
        <DownOutlined />
      </span>
      <span
        v-if="keytipShown"
        class="antd-ribbon-keytip"
        :class="{ 'is-pending': keytipPending }"
        aria-hidden="true"
      >
        {{ props.keyTip }}
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RibbonDropdownDef } from './ribbonTypes'

const props = defineProps<{
  /** Default command executed when clicking the main body. */
  command: string
  icon?: Component
  label: string
  options: RibbonDropdownDef['options']
  disabled?: boolean
  keyTip?: string
  /** Keytip badges visible (ribbon keytip mode, level 2). */
  keytipActive?: boolean
  /** Partial keytip typed so far, for prefix highlighting. */
  keytipBuffer?: string
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

const keytipShown = computed(
  () => props.keytipActive === true && props.keyTip !== undefined
)

const keytipPending = computed(() => {
  if (!props.keytipBuffer || !props.keyTip) return false
  return props.keyTip.toLowerCase().startsWith(props.keytipBuffer)
})

function handleMainClick() {
  if (props.disabled) return
  emit('execute', props.command)
}

function toggleMenu() {
  if (props.disabled) return
  dropdownOpen.value = !dropdownOpen.value
}

function handleOptionClick(opt: { id: string; command: string }) {
  if (props.disabled) return
  dropdownOpen.value = false
  emit('execute', opt.command)
}
</script>

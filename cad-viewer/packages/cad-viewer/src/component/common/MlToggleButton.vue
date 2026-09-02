<template>
  <a-tooltip :title="tooltip">
    <a-button
      class="ml-toggle-button"
      :style="{ color: iconColor }"
      @click="handleClicked"
    >
      <component :is="icon" />
    </a-button>
  </a-tooltip>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { Component, DefineComponent } from 'vue'

export type MlIconType = (() => DefineComponent) | Component

/**
 * Data to descibe toggle button
 */
export interface MlToggleButtonData {
  /**
   * Icon used when button is 'on'
   */
  onIcon: MlIconType
  /**
   * Icon used when button is 'off'.
   */
  offIcon: MlIconType
  /**
   * Tooltip when button is 'on'
   */
  onTooltip: string
  /**
   * Tooltip when button is 'off'
   */
  offTooltip: string
  /**
   * Icon color when button is 'on'
   */
  onColor?: string
  /**
   * Icon color when button is 'off'
   */
  offColor?: string
}

/**
 * Properties of MlToggleButton component
 */
interface Props {
  /**
   * Button size
   */
  size?: number | string
  /**
   * Data to descibe toggle button
   */
  data: MlToggleButtonData
}

interface Events {
  /**
   * Trigger this event when toggle button is clicked.
   * @param state New state of toggle button
   */
  (e: 'click', state: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  size: 30
})
const on = defineModel({ default: false })
const emit = defineEmits<Events>()

const icon = computed(() => {
  return on.value ? props.data.onIcon : props.data.offIcon
})

const size = computed(() => {
  return props.size + 'px'
})

const tooltip = computed(() => {
  return on.value ? props.data.onTooltip : props.data.offTooltip
})

const iconColor = computed(() => {
  if (on.value) {
    return props.data.onColor ?? 'var(--ml-theme-primary)'
  }
  return props.data.offColor ?? 'var(--ml-theme-text-primary)'
})

const handleClicked = () => {
  emit('click', on.value)
}
</script>

<style scoped>
.ml-toggle-button {
  border: none;
  padding: 0px;
  cursor: pointer;
  width: v-bind(size);
  height: v-bind(size);
  color: var(--ml-theme-text-primary);
}
</style>

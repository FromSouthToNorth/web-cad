<template>
  <ml-ribbon-property-field
    v-if="variant === 'property'"
    :icon="fontIcon"
    :disabled="disabled"
    :control-width="controlWidth"
  >
    <a-select
      :value="modelValue"
      :disabled="disabled"
      :placeholder="placeholder"
      show-search
      size="small"
      class="ml-ribbon-font-select__control"
      @change="emit('update:modelValue', $event as string)"
    >
      <a-select-option
        v-for="name in options"
        :key="name"
        :label="name"
        :value="name"
      />
    </a-select>
  </ml-ribbon-property-field>
  <a-select
    v-else
    :value="modelValue"
    :disabled="disabled"
    :placeholder="placeholder"
    show-search
    size="default"
    class="ml-ribbon-font-select--plain"
    @change="emit('update:modelValue', $event as string)"
  >
    <a-select-option
      v-for="name in options"
      :key="name"
      :label="name"
      :value="name"
    />
  </a-select>
</template>

<script setup lang="ts">
import { h } from 'vue'

import MlRibbonPropertyField from './MlRibbonPropertyField.vue'

const fontIcon = () =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      fill: 'currentColor',
      'aria-hidden': 'true'
    },
    [
      h('path', {
        d: 'M5 18h2.2l1.1-3.2h5.4l1.1 3.2H17l-4.8-13h-2.4L5 18Zm3.9-5 2-5.8 2 5.8H8.9Z'
      })
    ]
  )

interface RibbonFontSelectProps {
  modelValue?: string
  options?: string[]
  disabled?: boolean
  placeholder?: string
  controlWidth?: string
  /** Ribbon property shell vs standalone control (e.g. character map dialog). */
  variant?: 'property' | 'plain'
}

withDefaults(defineProps<RibbonFontSelectProps>(), {
  modelValue: '',
  options: () => [],
  disabled: false,
  placeholder: '',
  controlWidth: '154px',
  variant: 'property'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<style scoped>
.ml-ribbon-font-select--plain {
  width: 100%;
}
</style>

<template>
  <div class="ml-layer-select">
    <a-select
      :value="resolvedModelValue"
      :disabled="props.disabled || !props.options.length"
      :placeholder="props.placeholder ?? t('main.ribbonProperty.layer')"
      class="ml-layer-select__control"
      :popup-class-name="popperClass"
      style="width: 100%"
      @change="onSelect"
      @dropdownVisibleChange="onVisibleChange"
    >
      <template #optionLabel>
        <div
          v-if="selectedOption"
          class="ml-layer-select-trigger"
          :title="selectedOptionTooltip"
        >
          <button
            type="button"
            class="ml-layer-select-state-button"
            :title="
              selectedOption.isOn
                ? t('main.layerSelect.tooltip.hidden')
                : t('main.layerSelect.tooltip.visible')
            "
            @mousedown.stop.prevent
            @click.stop="onStateIconClick(selectedOption, 'on')"
          >
            <span
              class="ml-layer-select-state-icon"
              :class="selectedOption.isOn ? 'is-on' : 'is-off'"
              aria-hidden="true"
            >
              <component :is="layerLight" />
            </span>
          </button>
          <button
            type="button"
            class="ml-layer-select-state-button"
            :title="
              selectedOption.isFrozen
                ? t('main.layerSelect.tooltip.thawed')
                : t('main.layerSelect.tooltip.frozen')
            "
            @mousedown.stop.prevent
            @click.stop="onStateIconClick(selectedOption, 'frozen')"
          >
            <span
              class="ml-layer-select-state-icon"
              :class="selectedOption.isFrozen ? 'is-frozen' : 'is-unfrozen'"
              aria-hidden="true"
            >
              <component :is="layerSnow" v-if="selectedOption.isFrozen" />
              <component :is="layerThawed" v-else />
            </span>
          </button>
          <button
            type="button"
            class="ml-layer-select-state-button"
            :title="
              selectedOption.isLocked
                ? t('main.layerSelect.tooltip.unlocked')
                : t('main.layerSelect.tooltip.locked')
            "
            @mousedown.stop.prevent
            @click.stop="onStateIconClick(selectedOption, 'locked')"
          >
            <span
              class="ml-layer-select-state-icon"
              :class="selectedOption.isLocked ? 'is-locked' : 'is-unlocked'"
              aria-hidden="true"
            >
              <component :is="layerLocker" v-if="selectedOption.isLocked" />
              <component :is="layerUnlocked" v-else />
            </span>
          </button>
          <span
            class="ml-layer-select-color"
            :style="{ backgroundColor: selectedOption.cssColor || '#8a8a8a' }"
          />
          <span class="ml-layer-select-trigger-text">
            {{ selectedOption.name }}
          </span>
        </div>
      </template>

      <template #header>
        <div class="ml-layer-select-header">
          <a-input
            ref="searchInputRef"
            v-model:value="searchQuery"
            allow-clear
            :placeholder="
              props.searchPlaceholder ?? t('main.layerSelect.searchPlaceholder')
            "
            class="ml-layer-select-search"
            @keydown.stop
          >
            <template #prefix>
              <SearchOutlined />
            </template>
          </a-input>
        </div>
      </template>

      <a-select-option
        v-for="item in filteredOptions"
        :key="item.value"
        :value="item.value"
      >
        <div class="ml-layer-select-option" :title="buildLayerTooltip(item)">
          <button
            type="button"
            class="ml-layer-select-state-button"
            :title="
              item.isOn
                ? t('main.layerSelect.tooltip.hidden')
                : t('main.layerSelect.tooltip.visible')
            "
            @mousedown.stop.prevent
            @click.stop="onStateIconClick(item, 'on')"
          >
            <span
              class="ml-layer-select-state-icon"
              :class="item.isOn ? 'is-on' : 'is-off'"
              aria-hidden="true"
            >
              <component :is="layerLight" />
            </span>
          </button>
          <button
            type="button"
            class="ml-layer-select-state-button"
            :title="
              item.isFrozen
                ? t('main.layerSelect.tooltip.thawed')
                : t('main.layerSelect.tooltip.frozen')
            "
            @mousedown.stop.prevent
            @click.stop="onStateIconClick(item, 'frozen')"
          >
            <span
              class="ml-layer-select-state-icon"
              :class="item.isFrozen ? 'is-frozen' : 'is-unfrozen'"
              aria-hidden="true"
            >
              <component :is="layerSnow" v-if="item.isFrozen" />
              <component :is="layerThawed" v-else />
            </span>
          </button>
          <button
            type="button"
            class="ml-layer-select-state-button"
            :title="
              item.isLocked
                ? t('main.layerSelect.tooltip.unlocked')
                : t('main.layerSelect.tooltip.locked')
            "
            @mousedown.stop.prevent
            @click.stop="onStateIconClick(item, 'locked')"
          >
            <span
              class="ml-layer-select-state-icon"
              :class="item.isLocked ? 'is-locked' : 'is-unlocked'"
              aria-hidden="true"
            >
              <component :is="layerLocker" v-if="item.isLocked" />
              <component :is="layerUnlocked" v-else />
            </span>
          </button>
          <span
            class="ml-layer-select-line-preview"
            :style="resolvePreviewStyle(item)"
          />
          <span
            class="ml-layer-select-color"
            :style="{ backgroundColor: item.cssColor || '#8a8a8a' }"
          />
          <span class="ml-layer-select-text">{{ item.name }}</span>
        </div>
      </a-select-option>

      <template #notFoundContent>
        <div class="ml-layer-select-empty">
          {{ emptyText }}
        </div>
      </template>
    </a-select>
  </div>
</template>

<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { layerLight, layerLocker, layerSnow, layerThawed, layerUnlocked } from '../../svg'

defineOptions({
  inheritAttrs: false
})

/**
 * Render-ready layer entry shown by the select control.
 */
interface LayerSelectOption {
  value: string
  name: string
  cssColor: string
  isOn: boolean
  isLocked: boolean
  isFrozen: boolean
  lineType?: string
}
type LayerStateKey = 'on' | 'frozen' | 'locked'

interface LayerSelectProps {
  modelValue?: string
  options: LayerSelectOption[]
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
}

const props = defineProps<LayerSelectProps>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
  (
    e: 'layer-state-toggle',
    payload: { layerName: string; state: LayerStateKey }
  ): void
}>()

const { t } = useI18n()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement>()

/** Ribbon / UI size (`small` | `default` | `large`). */
const ribbonUiSize = computed(() => 'default')

/**
 * Match built-in ribbon selects: attach ribbon popper size classes so teleported
 * dropdown typography follows `ml-ribbon--size-*` / `--ml-rb-popper-scale`.
 */
const popperClass = computed(
  () =>
    `ml-layer-select-popper ml-ribbon-select-dropdown ml-ribbon-popper ml-ribbon-popper--size-${ribbonUiSize.value}`
)

const selectedOption = computed(() =>
  props.options.find(item => item.value === props.modelValue)
)
const resolvedModelValue = computed(() => selectedOption.value?.value)
const selectedOptionTooltip = computed(() => {
  if (!selectedOption.value) return ''
  return buildLayerTooltip(selectedOption.value)
})

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter(item => item.name.toLowerCase().includes(q))
})

const emptyText = computed(() => {
  if (!props.options.length) return t('main.layerSelect.noLayerAvailable')
  return t('main.layerSelect.noMatchedLayer')
})

function resolvePreviewStyle(item: LayerSelectOption) {
  const color = item.cssColor || '#8a8a8a'
  const lineType = item.lineType?.toLowerCase() ?? ''

  if (lineType.includes('dot')) {
    return {
      background: `repeating-linear-gradient(to right, ${color} 0 2px, transparent 2px 6px)`
    }
  }

  if (lineType.includes('dash') || lineType.includes('hidden')) {
    return {
      background: `repeating-linear-gradient(to right, ${color} 0 10px, transparent 10px 14px)`
    }
  }

  if (lineType.includes('center') || lineType.includes('phantom')) {
    return {
      background: `repeating-linear-gradient(to right, ${color} 0 12px, transparent 12px 16px, ${color} 16px 19px, transparent 19px 24px)`
    }
  }

  return { backgroundColor: color }
}

function buildLayerTooltip(item: LayerSelectOption) {
  const lineType = item.lineType || t('main.ribbonProperty.lineType')
  const color = item.cssColor || '#8a8a8a'
  const visibility = item.isOn
    ? t('main.layerSelect.tooltip.visible')
    : t('main.layerSelect.tooltip.hidden')
  const frozen = item.isFrozen
    ? t('main.layerSelect.tooltip.frozen')
    : t('main.layerSelect.tooltip.thawed')
  const locked = item.isLocked
    ? t('main.layerSelect.tooltip.locked')
    : t('main.layerSelect.tooltip.unlocked')

  return [
    `${t('main.layerSelect.tooltip.layer')}: ${item.name}`,
    `${t('main.layerSelect.tooltip.visibility')}: ${visibility}`,
    `${t('main.layerSelect.tooltip.freeze')}: ${frozen}`,
    `${t('main.layerSelect.tooltip.lock')}: ${locked}`,
    `${t('main.layerSelect.tooltip.lineType')}: ${lineType}`,
    `${t('main.layerSelect.tooltip.color')}: ${color}`
  ].join('\n')
}

function onVisibleChange(visible: boolean) {
  if (!visible) {
    searchQuery.value = ''
    return
  }

  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function onSelect(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
}

function onStateIconClick(item: LayerSelectOption, state: LayerStateKey) {
  emit('layer-state-toggle', {
    layerName: item.value,
    state
  })
}
</script>

<style scoped>
.ml-layer-select {
  display: flex;
  width: 100%;
  min-width: 0;
  font-family: inherit;
  font-size: var(
    --ml-rb-font-sm,
    calc(12px * var(--ml-rb-scale, 1))
  );
}

.ml-layer-select__control {
  width: 100%;
  min-width: 0;
}

.ml-layer-select :deep(.ant-select),
.ml-layer-select :deep(.ant-select-selector),
.ml-layer-select :deep(.ant-select-selection-item),
.ml-layer-select :deep(.ant-select-selection-placeholder) {
  width: 100%;
  min-width: 0;
  font-family: inherit;
  font-size: inherit;
}

.ml-layer-select-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.ml-layer-select-trigger-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: inherit;
  font-family: inherit;
}

.ml-layer-select-option {
  display: grid;
  grid-template-columns: 16px 16px 16px 84px 12px 1fr;
  align-items: center;
  column-gap: 8px;
  width: 100%;
  min-width: 0;
}

.ml-layer-select-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: inherit;
  font-family: inherit;
}

.ml-layer-select-state-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: var(--ml-theme-text-primary);
}

.ml-layer-select-state-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.ml-layer-select-state-icon.is-on {
  color: var(--ml-theme-primary);
}

.ml-layer-select-state-icon.is-off {
  color: var(--ml-theme-text-muted);
}

.ml-layer-select-state-icon.is-frozen,
.ml-layer-select-state-icon.is-locked {
  color: var(--ml-theme-text-heading);
}

.ml-layer-select-state-icon.is-unfrozen,
.ml-layer-select-state-icon.is-unlocked {
  color: var(--ml-theme-text-primary);
}

.ml-layer-select-state-icon :deep(svg) {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.ml-layer-select-state-icon :deep(path),
.ml-layer-select-state-icon :deep(rect),
.ml-layer-select-state-icon :deep(polygon),
.ml-layer-select-state-icon :deep(ellipse),
.ml-layer-select-state-icon :deep(circle) {
  fill: currentColor;
  stroke: currentColor;
}

.ml-layer-select-line-preview {
  height: 3px;
  border-radius: 2px;
}

.ml-layer-select-color {
  display: inline-flex;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid var(--ml-theme-border);
  box-sizing: border-box;
}

.ml-layer-select-empty {
  padding: 8px 12px;
  color: var(--ml-theme-text-secondary);
}

:global(.ml-layer-select-popper) {
  /*
   * Teleported dropdown is outside `.ml-ribbon`, so use `--ml-rb-popper-scale`
   * from `ml-ribbon-popper--size-*` (same as built-in ribbon selects).
   */
  --ml-layer-select-font-size: calc(
    12px * var(--ml-rb-popper-scale, 1)
  );
  width: 340px;
  font-family: inherit;
  font-size: var(--ml-layer-select-font-size);
}

:global(.ml-layer-select-popper .ant-select-dropdown) {
  max-height: 360px;
}

:global(.ml-layer-select-popper .ant-select-item) {
  height: calc(36px * var(--ml-rb-popper-scale, 1));
  line-height: calc(36px * var(--ml-rb-popper-scale, 1));
  font-family: inherit;
  font-size: var(--ml-layer-select-font-size);
}

:global(.ml-layer-select-popper .ant-input),
:global(.ml-layer-select-popper .ml-layer-select-text),
:global(.ml-layer-select-popper .ml-layer-select-empty) {
  font-family: inherit;
  font-size: var(--ml-layer-select-font-size);
}

.ml-layer-select-header {
  padding: 6px 8px 8px;
  border-bottom: 1px solid var(--ml-theme-border);
}

.ml-layer-select-search :deep(.ant-input-affix-wrapper) {
  border-radius: 8px;
}
</style>

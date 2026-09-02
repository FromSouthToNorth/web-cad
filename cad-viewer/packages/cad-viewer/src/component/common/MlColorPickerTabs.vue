<template>
  <div class="ml-color-picker-tabs">
    <a-tabs v-model:activeKey="activeTabKey">
      <a-tab-pane key="aci" :tab="t('dialog.colorPickerDlg.aciTabTitle')">
        <div class="ml-color-picker-tabs-panel-body">
          <MlColorIndexPicker
            :model-value="aciIndex"
            @update:modelValue="onAciChange"
          />
        </div>
      </a-tab-pane>
      <a-tab-pane key="rgb" :tab="t('dialog.colorPickerDlg.rgbTabTitle')">
        <div class="ml-color-picker-tabs-panel-body">
          <a-color-picker v-model:value="hexColor" />
        </div>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { AcCmColor } from '@mlightcad/data-model'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MlColorIndexPicker from './MlColorIndexPicker.vue'

type TabName = 'aci' | 'rgb'

const props = withDefaults(
  defineProps<{
    modelValue?: AcCmColor
  }>(),
  {
    modelValue: undefined
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: AcCmColor | undefined]
  change: [value: AcCmColor | undefined]
}>()

const { t } = useI18n()

const activeTab = ref<TabName>('aci')
/** antdv `<a-tabs>` uses a string `activeKey`; bridge to {@link activeTab}. */
const activeTabKey = computed({
  get: () => activeTab.value,
  set: (key: string) => {
    if (key === 'aci' || key === 'rgb') activeTab.value = key
  }
})
const aciIndex = ref<number>(256)
const hexColor = ref('#ffffff')
const syncingFromProps = ref(false)

watch(
  () => props.modelValue,
  value => {
    syncingFromProps.value = true
    updateFromColor(value)
    syncingFromProps.value = false
  },
  { immediate: true }
)

watch(hexColor, nextHexRaw => {
  if (syncingFromProps.value || activeTab.value !== 'rgb') return
  const color = new AcCmColor()
  color.setRGBFromCss(nextHexRaw)
  emitColor(color)
})

function onAciChange(value: number | null) {
  const index = value ?? 256
  aciIndex.value = index
  activeTab.value = 'aci'
  const color = new AcCmColor()
  if (index === 256) color.setByLayer()
  else if (index === 0) color.setByBlock()
  else color.colorIndex = index
  emitColor(color)
}

function emitColor(color: AcCmColor | undefined) {
  emit('update:modelValue', color)
  emit('change', color)
}

function updateFromColor(color: AcCmColor | undefined) {
  if (!color) {
    activeTab.value = 'aci'
    aciIndex.value = 256
    return
  }

  activeTab.value = color.isByColor ? 'rgb' : 'aci'
  if (color.isByLayer) aciIndex.value = 256
  else if (color.isByBlock) aciIndex.value = 0
  else if (color.isByACI) aciIndex.value = color.colorIndex ?? 256
  else aciIndex.value = 256

  // Do not let ACI selection overwrite the true-color gamut.
  if (color.isByColor) {
    hexColor.value = color.cssColor ?? '#ffffff'
  }
}
</script>

<style scoped>
.ml-color-picker-tabs-panel-body {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}
</style>

<template>
  <div class="antd-property-bar">
    <!-- Color selector -->
    <a-dropdown
      :trigger="['click']"
      :disabled="props.disabled"
      placement="bottomLeft"
    >
      <button
        type="button"
        class="antd-property-bar-swatch"
        :style="{ '--swatch-color': currentColorDisplay }"
        :aria-label="t('shell.propertyBar.color')"
      >
        <span class="antd-property-bar-swatch-fill" />
        <span class="antd-property-bar-swatch-label">
          {{ t('shell.propertyBar.color') }}
        </span>
        <span class="antd-property-bar-swatch-arrow">▾</span>
      </button>
      <template #overlay>
        <div class="antd-property-bar-color-menu">
          <button
            v-for="c in colorOptions"
            :key="c.value"
            type="button"
            class="antd-property-bar-color-item"
            :class="{ 'is-active': c.value === currentColorKey }"
            @click="onColorChange(c.value)"
          >
            <span
              class="antd-property-bar-color-dot"
              :style="{ background: c.swatch }"
            />
            <span>{{ c.label }}</span>
          </button>
        </div>
      </template>
    </a-dropdown>

    <!-- Linetype selector -->
    <a-select
      v-model:value="currentLinetype"
      class="antd-ribbon-select antd-property-bar-linetype"
      :options="linetypeOptions"
      :placeholder="t('shell.propertyBar.linetype')"
      :disabled="props.disabled"
      @change="onLinetypeChange"
    >
      <template #optionLabel="option">
        <span v-if="option" class="antd-property-bar-linetype-option">
          <span class="antd-property-bar-linetype-preview" :class="`lt-${option.value}`" />
          <span>{{ option.value }}</span>
        </span>
      </template>
      <template #option="option">
        <span class="antd-property-bar-linetype-option">
          <span class="antd-property-bar-linetype-preview" :class="`lt-${option.value}`" />
          <span>{{ option.label ?? option.value }}</span>
        </span>
      </template>
    </a-select>

    <!-- Lineweight selector -->
    <a-select
      v-model:value="currentLineweight"
      class="antd-ribbon-select antd-property-bar-lineweight"
      :options="lineweightOptions"
      :placeholder="t('shell.propertyBar.lineweight')"
      :disabled="props.disabled"
      @change="onLineweightChange"
    />
  </div>
</template>

<script setup lang="ts">
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  AcCmColor,
  type AcDbDatabase,
  AcGiLineWeight} from '@mlightcad/data-model'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  disabled?: boolean
}>()

const { t } = useI18n()

// Access editor lazily — singleton is not available until engine bootstraps.
let _editor: AcApDocManager | undefined
function editor(): AcApDocManager {
  if (!_editor) _editor = AcApDocManager.instance
  return _editor
}

function db(): AcDbDatabase | undefined {
  try {
    return editor().curDocument?.database
  } catch {
    return undefined
  }
}

// ── Colors ─────────────────────────────────────────────────────────

const currentColorKey = ref<string>('ByLayer')
const currentColorDisplay = ref('#888888')

const colorOptions = [
  { value: 'ByLayer', label: 'ByLayer', swatch: '#888888' },
  { value: 'ByBlock', label: 'ByBlock', swatch: '#a0a8b8' },
  { value: 'red', label: 'Red', swatch: '#ff0000' },
  { value: 'yellow', label: 'Yellow', swatch: '#ffff00' },
  { value: 'green', label: 'Green', swatch: '#00ff00' },
  { value: 'cyan', label: 'Cyan', swatch: '#00ffff' },
  { value: 'blue', label: 'Blue', swatch: '#0000ff' },
  { value: 'magenta', label: 'Magenta', swatch: '#ff00ff' },
  { value: 'white', label: 'White / Black', swatch: '#ffffff' }
]

function resolveColorDisplay(key: string): string {
  const opt = colorOptions.find(c => c.value === key)
  return opt?.swatch ?? '#888888'
}

watch(
  () => {
    try { return db()?.cecolor?.toString() ?? '' } catch { return '' }
  },
  val => {
    if (val) {
      currentColorKey.value = val
      currentColorDisplay.value = resolveColorDisplay(val)
    }
  },
  { immediate: true }
)

function onColorChange(key: string) {
  if (props.disabled) return
  const d = db()
  if (!d) return
  currentColorKey.value = key
  currentColorDisplay.value = resolveColorDisplay(key)
  const color = AcCmColor.fromString(key) ?? new AcCmColor()
  if (key === 'ByLayer') color.setByLayer()
  else if (key === 'ByBlock') color.setByBlock()
  d.cecolor = color
}

// ── Linetypes ─────────────────────────────────────────────────────

const currentLinetype = ref<string>('ByLayer')

const linetypeOptions = [
  { value: 'ByLayer', label: 'ByLayer' },
  { value: 'ByBlock', label: 'ByBlock' },
  { value: 'Continuous', label: 'Continuous' },
  { value: 'ACAD_ISO02W100', label: 'Dashed' },
  { value: 'ACAD_ISO03W100', label: 'Dotted' },
  { value: 'ACAD_ISO04W100', label: 'Dash Dot' },
  { value: 'ACAD_ISO05W100', label: 'Dash Dot Dot' }
]

watch(
  () => {
    try { return db()?.celtype ?? '' } catch { return '' }
  },
  val => {
    if (val) currentLinetype.value = val
  },
  { immediate: true }
)

function onLinetypeChange(value: string) {
  if (props.disabled) return
  const d = db()
  if (!d) return
  currentLinetype.value = value
  d.celtype = value
}

// ── Lineweights ───────────────────────────────────────────────────

const currentLineweight = ref<number>(AcGiLineWeight.ByLayer)

const specialLw = [
  { value: AcGiLineWeight.ByLayer, label: 'ByLayer' },
  { value: AcGiLineWeight.ByBlock, label: 'ByBlock' }
]

const numericLw = (Object.values(AcGiLineWeight) as number[])
  .filter(v => typeof v === 'number' && v > 0 && v !== 0xFFFF)
  .sort((a, b) => a - b)
  .map(v => ({
    value: v,
    label: `${(v / 100).toFixed(2)} mm`
  }))

const lineweightOptions = [...specialLw, ...numericLw]

watch(
  () => {
    try { return db()?.celweight ?? AcGiLineWeight.ByLayer } catch { return AcGiLineWeight.ByLayer }
  },
  val => {
    if (val != null) currentLineweight.value = Number(val)
  },
  { immediate: true }
)

function onLineweightChange(value: number) {
  if (props.disabled) return
  const d = db()
  if (!d) return
  currentLineweight.value = value
  d.celweight = value as AcGiLineWeight
}
</script>

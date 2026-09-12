<template>
  <div
    class="antd-mtext-format"
    :class="{ 'is-disabled': !state.active }"
    role="group"
    :aria-label="t('main.ribbon.mtext.group.format')"
  >
    <!-- Text style, font, color, height: AutoCAD's "Format" column. -->
    <div class="antd-mtext-format-fields">
      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.textStyle') }}
        </span>
        <a-select
          class="antd-mtext-control"
          size="small"
          :value="currentTextStyle || undefined"
          :options="textStyleSelectOptions"
          :disabled="!state.active"
          :placeholder="t('main.ribbon.mtext.field.textStyle')"
          @change="onTextStyleChange"
        />
      </label>

      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.font') }}
        </span>
        <a-select
          class="antd-mtext-control"
          size="small"
          show-search
          :value="state.format.fontFamily"
          :options="fontSelectOptions"
          :disabled="!state.active"
          :filter-option="filterByLabel"
          :placeholder="t('main.ribbon.mtext.field.font')"
          @change="onFontChange"
        />
      </label>

      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.color') }}
        </span>
        <a-dropdown
          :trigger="['click']"
          :disabled="!state.active"
          placement="bottomLeft"
        >
          <button
            type="button"
            class="antd-mtext-color-trigger"
            :style="{ '--swatch-color': formatColorDisplay }"
            :aria-label="t('main.ribbon.mtext.field.color')"
          >
            <span class="antd-mtext-color-fill" />
            <span class="antd-mtext-color-arrow" aria-hidden="true">
              <DownOutlined />
            </span>
          </button>
          <template #overlay>
            <div class="antd-mtext-color-menu">
              <button
                v-for="option in formatColorOptions"
                :key="option.value"
                type="button"
                class="antd-mtext-color-item"
                :class="{ 'is-active': option.value === activeColorKey }"
                @click="onColorChange(option.value)"
              >
                <span
                  class="antd-mtext-color-dot"
                  :style="{ background: option.swatch }"
                />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </template>
        </a-dropdown>
      </label>

      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.height') }}
        </span>
        <a-auto-complete
          class="antd-mtext-control"
          size="small"
          :value="heightText"
          :options="heightSelectOptions"
          :disabled="!state.active"
          :placeholder="t('main.ribbon.mtext.field.height')"
          @update:value="onHeightInput"
          @select="onHeightCommit"
          @blur="onHeightBlur"
          @press-enter="onHeightBlur"
        />
      </label>

      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.obliqueAngle') }}
        </span>
        <a-input-number
          class="antd-mtext-control"
          size="small"
          :value="state.format.obliqueAngle"
          :min="-85"
          :max="85"
          :step="1"
          :precision="0"
          :disabled="!state.active"
          @change="onObliqueChange"
        />
      </label>

      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.tracking') }}
        </span>
        <a-input-number
          class="antd-mtext-control"
          size="small"
          :value="state.format.tracking"
          :min="0.1"
          :max="10"
          :step="0.05"
          :precision="2"
          :disabled="!state.active"
          @change="onTrackingChange"
        />
      </label>

      <label class="antd-mtext-field">
        <span class="antd-mtext-field-label">
          {{ t('main.ribbon.mtext.field.widthFactor') }}
        </span>
        <a-input-number
          class="antd-mtext-control"
          size="small"
          :value="state.format.widthFactor"
          :min="0.1"
          :max="5"
          :step="0.05"
          :precision="2"
          :disabled="!state.active"
          @change="onWidthFactorChange"
        />
      </label>
    </div>

    <!-- Character effect toggles, three per column like AutoCAD. -->
    <div class="antd-mtext-toggles">
      <button
        v-for="toggle in toggles"
        :key="toggle.id"
        type="button"
        class="antd-mtext-toggle"
        :class="{ 'is-active': toggle.active }"
        :disabled="!state.active"
        :aria-pressed="toggle.active"
        :title="toggle.title"
        :aria-label="toggle.title"
        @click="toggle.run()"
      >
        <component :is="toggle.icon" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DownOutlined } from '@ant-design/icons-vue'
import { AcCmColor } from '@hy/data-model'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { mtextIcons } from './mtextRibbonIcons'
import { normalizeMTextNumber } from './mtextRibbonTypes'
import { useMTextRibbon } from './useMTextRibbon'

const { t } = useI18n()

const {
  state,
  textStyleNames,
  currentTextStyle,
  fontOptions,
  heightOptions,
  formatColorDisplay,
  applyTextStyle,
  setFontFamily,
  setFontHeight,
  setFormatColor,
  applyFormat,
  setFormatToggle,
  setScript,
  toggleStack,
  toggleCase
} = useMTextRibbon()

// ── text style / font ────────────────────────────────────────────────

const textStyleSelectOptions = computed(() =>
  textStyleNames.value.map(name => ({ value: name, label: name }))
)

const fontSelectOptions = computed(() =>
  fontOptions.value.map(name => ({ value: name, label: name }))
)

/** antdv `show-search` filter: match the option label, case-insensitively. */
function filterByLabel(input: string, option: { label?: string }) {
  return String(option?.label ?? '')
    .toLowerCase()
    .includes(input.toLowerCase())
}

function onTextStyleChange(value: unknown) {
  if (typeof value === 'string') applyTextStyle(value)
}

function onFontChange(value: unknown) {
  if (typeof value === 'string') setFontFamily(value)
}

// ── height (presets + free numeric entry) ────────────────────────────

/**
 * Text shown in the height box.
 *
 * Kept local so a partially typed value is not pushed into the editor on every
 * keystroke; it is committed on Enter, on blur, or when a preset is picked.
 */
const heightText = ref(String(state.format.fontSize))

watch(
  () => state.format.fontSize,
  value => {
    heightText.value = String(value)
  }
)

const heightSelectOptions = computed(() =>
  heightOptions.value.map(height => ({ value: String(height) }))
)

function onHeightInput(value: string) {
  heightText.value = value
}

function onHeightCommit(value: string) {
  heightText.value = value
  setFontHeight(Number(value))
}

function onHeightBlur(event: FocusEvent) {
  const raw =
    (event.target as HTMLInputElement | null)?.value ?? heightText.value
  const height = normalizeMTextNumber(raw)
  if (height == null || height <= 0) {
    heightText.value = String(state.format.fontSize)
    return
  }
  if (height !== state.format.fontSize) setFontHeight(height)
}

// ── color ────────────────────────────────────────────────────────────

/** Palette offered by the character color dropdown. */
const formatColorOptions = [
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

/** Palette entry matching the current character color, if any. */
const activeColorKey = computed(() => {
  const { aci, rgb } = state.format
  if (aci === 256) return 'ByLayer'
  if (aci === 0) return 'ByBlock'
  const match = formatColorOptions.find(option => {
    if (aci != null) {
      const color = AcCmColor.fromString(option.value)
      return color?.isByACI === true && color.colorIndex === aci
    }
    if (rgb != null) {
      const color = AcCmColor.fromString(option.value)
      return (
        color != null &&
        !color.isByLayer &&
        !color.isByBlock &&
        color.RGB === rgb
      )
    }
    return false
  })
  return match?.value ?? ''
})

function onColorChange(key: string) {
  const color = AcCmColor.fromString(key) ?? new AcCmColor()
  if (key === 'ByLayer') color.setByLayer()
  else if (key === 'ByBlock') color.setByBlock()
  setFormatColor(color)
}

// ── numeric format fields ────────────────────────────────────────────

function onObliqueChange(value: number | string | null) {
  const angle = normalizeMTextNumber(value)
  if (angle == null) return
  applyFormat({ obliqueAngle: Math.min(85, Math.max(-85, angle)) })
}

function onTrackingChange(value: number | string | null) {
  const tracking = normalizeMTextNumber(value)
  if (tracking == null || tracking < 0.1) return
  applyFormat({ tracking })
}

function onWidthFactorChange(value: number | string | null) {
  const widthFactor = normalizeMTextNumber(value)
  if (widthFactor == null || widthFactor < 0.1) return
  applyFormat({ widthFactor })
}

// ── character effect toggles ─────────────────────────────────────────

/** Icon-only toggle descriptor rendered in the 3×3 effect grid. */
interface MTextToggle {
  id: string
  title: string
  icon: unknown
  active: boolean
  run: () => void
}

const toggles = computed<MTextToggle[]>(() => [
  {
    id: 'bold',
    title: t('main.ribbon.mtext.tooltip.bold'),
    icon: mtextIcons.bold,
    active: state.format.bold,
    run: () => setFormatToggle('bold', !state.format.bold)
  },
  {
    id: 'italic',
    title: t('main.ribbon.mtext.tooltip.italic'),
    icon: mtextIcons.italic,
    active: state.format.italic,
    run: () => setFormatToggle('italic', !state.format.italic)
  },
  {
    id: 'strike',
    title: t('main.ribbon.mtext.tooltip.strikethrough'),
    icon: mtextIcons.strike,
    active: state.format.strike,
    run: () => setFormatToggle('strike', !state.format.strike)
  },
  {
    id: 'underline',
    title: t('main.ribbon.mtext.tooltip.underline'),
    icon: mtextIcons.underline,
    active: state.format.underline,
    run: () => setFormatToggle('underline', !state.format.underline)
  },
  {
    id: 'overline',
    title: t('main.ribbon.mtext.tooltip.overline'),
    icon: mtextIcons.overline,
    active: state.format.overline,
    run: () => setFormatToggle('overline', !state.format.overline)
  },
  {
    id: 'superscript',
    title: t('main.ribbon.mtext.tooltip.superscript'),
    icon: mtextIcons.superscript,
    active: state.format.script === 'superscript',
    run: () => setScript('superscript', state.format.script !== 'superscript')
  },
  {
    id: 'subscript',
    title: t('main.ribbon.mtext.tooltip.subscript'),
    icon: mtextIcons.subscript,
    active: state.format.script === 'subscript',
    run: () => setScript('subscript', state.format.script !== 'subscript')
  },
  {
    id: 'stack',
    title: t('main.ribbon.mtext.tooltip.stack'),
    icon: mtextIcons.stack,
    active: state.stackActive,
    run: () => toggleStack()
  },
  {
    id: 'case',
    title: t('main.ribbon.mtext.tooltip.toggleCase'),
    icon: mtextIcons.case,
    active: false,
    run: () => toggleCase()
  }
])

// The panel outlives a single editor session: when an editor opens, resync the
// height box from the editor rather than showing the previous session's value.
watch(
  () => state.active,
  active => {
    if (active) heightText.value = String(state.format.fontSize)
  }
)
</script>

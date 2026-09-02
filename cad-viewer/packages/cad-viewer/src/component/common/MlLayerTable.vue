<template>
  <div class="ml-layer-table-wrap">
    <a-table
      :data-source="layers"
      :columns="tableColumns"
      class="ml-layer-table"
      :bordered="true"
      :row-key="getRowKey"
      :row-class-name="getRowClassName"
      :custom-row="customRowHandlers"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <!-- Name column -->
        <template v-if="column.key === 'name'">
          <input
            v-if="record.isDraft"
            ref="draftInputRef"
            :value="draftLayerName"
            class="ml-layer-table-name-input"
            :disabled="readonly"
            :placeholder="
              t('main.toolPalette.layerManager.layerList.newLayerPlaceholder')
            "
            @click.stop
            @input="emit('update:draftLayerName', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="emit('draft-commit')"
            @keydown.escape.prevent="emit('draft-cancel')"
            @blur="emit('draft-commit')"
          />
          <span v-else class="ml-layer-table-name">
            {{ record.name }}
            <span
              v-if="record.name === currentLayerName"
              class="ml-layer-table-current-marker"
              :title="t('main.toolPalette.layerManager.layerList.currentLayer')"
              aria-hidden="true"
            >
              *
            </span>
          </span>
        </template>

        <!-- isOn column -->
        <template v-else-if="column.key === 'isOn'">
          <div class="ml-layer-table-cell">
            <button
              type="button"
              class="ml-layer-table-state-button"
              :disabled="readonly || record.isDraft"
              :title="t('main.toolPalette.layerManager.layerList.on')"
              :aria-label="t('main.toolPalette.layerManager.layerList.on')"
              @click.stop="emitChange(record, 'on', !record.isOn)"
            >
              <span
                class="ml-layer-table-state-icon"
                :class="record.isOn ? 'is-on' : 'is-off'"
                aria-hidden="true"
              >
                <component :is="layerLight" />
              </span>
            </button>
          </div>
        </template>

        <!-- isFrozen column -->
        <template v-else-if="column.key === 'isFrozen'">
          <div class="ml-layer-table-cell">
            <button
              type="button"
              class="ml-layer-table-state-button"
              :disabled="readonly || record.isDraft"
              :title="t('main.toolPalette.layerManager.layerList.freeze')"
              :aria-label="t('main.toolPalette.layerManager.layerList.freeze')"
              @click.stop="emitChange(record, 'frozen', !record.isFrozen)"
            >
              <span
                class="ml-layer-table-state-icon"
                :class="record.isFrozen ? 'is-frozen' : 'is-unfrozen'"
                aria-hidden="true"
              >
                <component :is="layerSnow" v-if="record.isFrozen" />
                <component :is="layerThawed" v-else />
              </span>
            </button>
          </div>
        </template>

        <!-- isLocked column -->
        <template v-else-if="column.key === 'isLocked'">
          <div class="ml-layer-table-cell">
            <button
              type="button"
              class="ml-layer-table-state-button"
              :disabled="readonly || record.isDraft"
              :title="t('main.toolPalette.layerManager.layerList.lock')"
              :aria-label="t('main.toolPalette.layerManager.layerList.lock')"
              @click.stop="emitChange(record, 'locked', !record.isLocked)"
            >
              <span
                class="ml-layer-table-state-icon"
                :class="record.isLocked ? 'is-locked' : 'is-unlocked'"
                aria-hidden="true"
              >
                <component :is="layerLocker" v-if="record.isLocked" />
                <component :is="layerUnlocked" v-else />
              </span>
            </button>
          </div>
        </template>

        <!-- isPlottable column -->
        <template v-else-if="column.key === 'isPlottable'">
          <div class="ml-layer-table-cell">
            <button
              type="button"
              class="ml-layer-table-state-button"
              :disabled="readonly || record.isDraft"
              :title="t('main.toolPalette.layerManager.layerList.plot')"
              :aria-label="t('main.toolPalette.layerManager.layerList.plot')"
              @click.stop="
                emitChange(record, 'plottable', !record.isPlottable)
              "
            >
              <span
                class="ml-layer-table-state-icon ml-layer-table-plot-icon"
                :class="record.isPlottable ? 'is-plottable' : 'is-no-plot'"
                aria-hidden="true"
              >
                <component :is="layerPlot" v-if="record.isPlottable" />
                <component :is="layerNoPlot" v-else />
              </span>
            </button>
          </div>
        </template>

        <!-- color column -->
        <template v-else-if="column.key === 'color'">
          <div
            class="ml-layer-table-cell ml-layer-table-color-cell"
            :class="{
              'ml-layer-table-color-cell--disabled':
                readonly || record.isDraft
            }"
            @click.stop="openColorPicker(record)"
          >
            <span
              class="ml-layer-table-color-swatch"
              :style="{ backgroundColor: record.cssColor }"
            />
            <span class="ml-layer-table-color-name">
              {{ formatLayerColorName(record) }}
            </span>
          </div>
        </template>

        <!-- linetype column -->
        <template v-else-if="column.key === 'linetype'">
          <div
            v-if="readonly || record.isDraft"
            class="ml-layer-table-cell ml-layer-table-text-cell"
          >
            {{ record.linetype }}
          </div>
          <div
            v-else
            class="ml-layer-table-cell ml-layer-table-select-cell"
            @click.stop
          >
            <MlLineTypeSelect
              :model-value="record.linetype"
              @change="emitChange(record, 'linetype', $event)"
            />
          </div>
        </template>

        <!-- lineWeight column -->
        <template v-else-if="column.key === 'lineWeight'">
          <div
            v-if="readonly || record.isDraft"
            class="ml-layer-table-cell ml-layer-table-text-cell"
          >
            {{ formatLineWeightLabel(record.lineWeight) }}
          </div>
          <div
            v-else
            class="ml-layer-table-cell ml-layer-table-select-cell"
            @click.stop
          >
            <MlLineWeightSelect
              :model-value="record.lineWeight"
              :placeholder="
                t('main.toolPalette.layerManager.layerList.lineWeightDefault')
              "
              @change="emitChange(record, 'lineWeight', $event)"
            />
          </div>
        </template>

        <!-- transparency column -->
        <template v-else-if="column.key === 'transparency'">
          <div class="ml-layer-table-cell">
            <span
              v-if="readonly || record.isDraft"
              class="ml-layer-table-text-value"
            >
              {{ record.transparency }}
            </span>
            <input
              v-else
              class="ml-layer-table-text-input"
              :value="record.transparency"
              @click.stop
              @change="
                emitChange(record, 'transparency', inputEventValue($event))
              "
            />
          </div>
        </template>

        <!-- description column -->
        <template v-else-if="column.key === 'description'">
          <div class="ml-layer-table-cell">
            <span
              v-if="readonly || record.isDraft"
              class="ml-layer-table-text-value"
            >
              {{ record.description }}
            </span>
            <input
              v-else
              class="ml-layer-table-text-input"
              :value="record.description"
              @click.stop
              @change="
                emitChange(record, 'description', inputEventValue($event))
              "
            />
          </div>
        </template>
      </template>

      <template #headerCell="{ column }">
        <template v-if="column.key === 'isOn'">
          <div class="ml-layer-table-header-toggle">
            <a-checkbox
              :checked="isAllOn"
              :indeterminate="isSomeOn"
              :disabled="readonly"
              :aria-label="t('main.toolPalette.layerManager.layerList.on')"
              @change="handleToggleAll"
            />
          </div>
        </template>
        <template v-else>
          {{ column.title }}
        </template>
      </template>
    </a-table>

    <ml-color-picker-dlg
      v-if="!readonly"
      v-model="colorDialogVisible"
      :title="t('dialog.colorPickerDlg.title')"
      :color="oldColor"
      @ok="handleColorDialogOk"
      @cancel="handleColorDialogCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { AcCmColor, AcGiLineWeight } from '@mlightcad/data-model'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { colorName } from '../../locale'
import {
  layerLight,
  layerLocker,
  layerNoPlot,
  layerPlot,
  layerSnow,
  layerThawed,
  layerUnlocked
} from '../../svg'
import { MlColorPickerDlg } from '../dialog'
import type { MlLayerTableChangeField, MlLayerTableRow } from './MlLayerTable'
import MlLineTypeSelect from './MlLineTypeSelect.vue'
import MlLineWeightSelect from './MlLineWeightSelect.vue'

export type { MlLayerTableChangeField, MlLayerTableRow } from './MlLayerTable'

const DRAFT_ROW_KEY = '__ml_draft_new_layer__'

const props = withDefaults(
  defineProps<{
    /** Rows to display in the table. */
    layers: MlLayerTableRow[]
    /** Current layer name (`CLAYER`), used for the `*` marker. */
    currentLayerName?: string
    /** Selected layer name (stable across row identity refreshes). */
    selectedLayerName?: string | null
    /** Draft layer name while creating a new layer inline. */
    draftLayerName?: string
    /**
     * When `true`, state icons and property editors are display-only.
     * Suitable for layer-filter previews.
     */
    readonly?: boolean
  }>(),
  {
    currentLayerName: '',
    selectedLayerName: null,
    draftLayerName: '',
    readonly: false
  }
)

const emit = defineEmits<{
  (e: 'update:selectedLayerName', value: string | null): void
  (e: 'update:draftLayerName', value: string): void
  (e: 'row-click', row: MlLayerTableRow): void
  (e: 'row-dblclick', row: MlLayerTableRow): void
  (e: 'draft-commit'): void
  (e: 'draft-cancel'): void
  (e: 'toggle-all-on', isOn: boolean): void
  (
    e: 'change',
    payload: {
      layerName: string
      field: MlLayerTableChangeField
      value: boolean | string | number
    }
  ): void
  (e: 'change-color', payload: { layerName: string; color: AcCmColor }): void
}>()

const { t } = useI18n()
const draftInputRef = ref<HTMLInputElement | null>(null)
const colorDialogVisible = ref(false)
const colorTargetLayer = ref<MlLayerTableRow | null>(null)
const oldColor = ref<string | undefined>(undefined)

const editableLayers = computed(() =>
  props.layers.filter(layer => !layer.isDraft)
)

const isAllOn = computed(() => {
  const rows = editableLayers.value
  if (!rows.length) return false
  return rows.every(layer => layer.isOn)
})

const isSomeOn = computed(() => {
  const rows = editableLayers.value
  if (!rows.length) return false
  const anyOn = rows.some(layer => layer.isOn)
  return anyOn && !isAllOn.value
})

const getRowKey = (row: MlLayerTableRow) =>
  row.isDraft ? DRAFT_ROW_KEY : row.name

const getRowClassName = ({ row }: { row: MlLayerTableRow }) => {
  const classes: string[] = []
  if (row.isDraft) classes.push('ml-layer-table-row--draft')
  if (!row.isDraft && row.name === props.currentLayerName) {
    classes.push('ml-layer-table-row--current')
  }
  return classes.join(' ')
}

const handleToggleAll = (e: { target: { checked: boolean } }) => {
  if (props.readonly) return
  emit('toggle-all-on', e.target.checked)
}

const handleRowClick = (row: MlLayerTableRow) => {
  if (row.isDraft) return
  emit('update:selectedLayerName', row.name)
  emit('row-click', row)
}

const handleRowDbClick = (row: MlLayerTableRow) => {
  if (row.isDraft) return
  emit('update:selectedLayerName', row.name)
  emit('row-dblclick', row)
}

const customRowHandlers = (record: MlLayerTableRow) => ({
  onClick: () => handleRowClick(record),
  onDblclick: () => handleRowDbClick(record)
})

const tableColumns = computed(() => [
  {
    key: 'name',
    dataIndex: 'name',
    title: t('main.toolPalette.layerManager.layerList.name'),
    ellipsis: { showTitle: true },
    sorter: true,
    width: 140,
    resizable: true
  },
  {
    key: 'isOn',
    dataIndex: 'isOn',
    title: t('main.toolPalette.layerManager.layerList.on'),
    width: 40,
    align: 'center' as const,
    resizable: true
  },
  {
    key: 'isFrozen',
    dataIndex: 'isFrozen',
    title: t('main.toolPalette.layerManager.layerList.freeze'),
    width: 48,
    align: 'center' as const,
    resizable: true
  },
  {
    key: 'isLocked',
    dataIndex: 'isLocked',
    title: t('main.toolPalette.layerManager.layerList.lock'),
    width: 48,
    align: 'center' as const,
    resizable: true
  },
  {
    key: 'isPlottable',
    dataIndex: 'isPlottable',
    title: t('main.toolPalette.layerManager.layerList.plot'),
    width: 48,
    align: 'center' as const,
    resizable: true
  },
  {
    key: 'color',
    dataIndex: 'color',
    title: t('main.toolPalette.layerManager.layerList.color'),
    ellipsis: { showTitle: true },
    width: 75,
    resizable: true
  },
  {
    key: 'linetype',
    dataIndex: 'linetype',
    title: t('main.toolPalette.layerManager.layerList.linetype'),
    ellipsis: { showTitle: true },
    width: 130,
    resizable: true
  },
  {
    key: 'lineWeight',
    dataIndex: 'lineWeight',
    title: t('main.toolPalette.layerManager.layerList.lineweight'),
    ellipsis: { showTitle: true },
    width: 120,
    resizable: true
  },
  {
    key: 'transparency',
    dataIndex: 'transparency',
    title: t('main.toolPalette.layerManager.layerList.transparency'),
    width: 90,
    align: 'center' as const,
    resizable: true
  },
  {
    key: 'description',
    dataIndex: 'description',
    title: t('main.toolPalette.layerManager.layerList.description'),
    ellipsis: { showTitle: true },
    width: 140,
    resizable: true
  }
])

const emitChange = (
  row: MlLayerTableRow,
  field: MlLayerTableChangeField,
  value: boolean | string | number
) => {
  if (props.readonly || row.isDraft) return
  emit('change', { layerName: row.name, field, value })
}

const formatLayerColorName = (row: MlLayerTableRow) => {
  const color = AcCmColor.fromString(row.color)
  const name = color?.colorName || color?.toString() || row.color
  return colorName(name)
}

const formatLineWeightLabel = (value: number) => {
  switch (value) {
    case AcGiLineWeight.ByLayer:
      return 'ByLayer'
    case AcGiLineWeight.ByBlock:
      return 'ByBlock'
    case AcGiLineWeight.ByLineWeightDefault:
      return t('main.toolPalette.layerManager.layerList.lineWeightDefault')
    default:
      return `${(value / 100).toFixed(2)} mm`
  }
}

const inputEventValue = (event: Event) =>
  (event.target as HTMLInputElement).value

const openColorPicker = (row: MlLayerTableRow) => {
  if (props.readonly || row.isDraft) return
  colorTargetLayer.value = row
  oldColor.value = row.color
  colorDialogVisible.value = true
}

const handleColorDialogOk = (color: AcCmColor) => {
  if (!colorTargetLayer.value) return
  emit('change-color', {
    layerName: colorTargetLayer.value.name,
    color
  })
}

const handleColorDialogCancel = () => {
  // Discard temporary selection
}

const focusDraftInput = async () => {
  await nextTick()
  draftInputRef.value?.focus()
  draftInputRef.value?.select?.()
}

defineExpose({
  focusDraftInput
})
</script>

<style>
.ml-layer-table-wrap {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.ml-layer-table {
  width: 100%;
  font-size: 12px;
  min-width: 100%;
}

.ml-layer-table .ant-table-cell {
  padding-top: 0;
  padding-bottom: 0;
  font-size: 12px;
}

.ml-layer-table .ant-table-thead .ant-table-cell {
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 12px;
}

.ml-layer-table .ant-table-thead .ant-table-cell,
.ml-layer-table .ant-table-tbody .ant-table-cell {
  font-size: 12px;
  line-height: 20px;
  min-height: 20px;
}

.ml-layer-table .ant-table-thead .ant-table-cell {
  white-space: nowrap;
}

/*
 * Antdv only sets `th.style.cursor = col-resize` for sortable columns.
 * Non-sortable headers rely on `document.body.style.cursor`, which is easy to
 * miss under table cells. Mirror the 8px resize handle so the cursor appears
 * consistently on every column edge (except the last, which is not resizable).
 */
.ml-layer-table.ant-table-bordered .ant-table-thead th.ant-table-cell {
  position: relative;
}

.ml-layer-table.ant-table-bordered
  .ant-table-thead
  th.ant-table-cell:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
}

.ml-layer-table .ant-table-thead,
.ml-layer-table .ant-table-tbody {
  border-bottom: 1px solid var(--ml-theme-border);
}

.ml-layer-table-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.ml-layer-table-text-cell {
  justify-content: flex-start;
}

.ml-layer-table-text-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  text-align: left;
}

.ml-layer-table-header-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ml-layer-table-state-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.ml-layer-table-state-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ml-layer-table-state-icon {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: var(--ml-theme-text-primary);
}

.ml-layer-table-state-icon.is-on,
.ml-layer-table-state-icon.is-plottable {
  color: var(--ml-theme-primary);
}

.ml-layer-table-state-icon.is-off,
.ml-layer-table-state-icon.is-no-plot {
  color: var(--ml-theme-text-muted);
}

.ml-layer-table-state-icon.is-frozen,
.ml-layer-table-state-icon.is-locked {
  color: var(--ml-theme-text-heading);
}

.ml-layer-table-state-icon.is-unfrozen,
.ml-layer-table-state-icon.is-unlocked {
  color: var(--ml-theme-text-primary);
}

.ml-layer-table-state-icon :deep(svg) {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.ml-layer-table-state-icon :deep(path),
.ml-layer-table-state-icon :deep(rect),
.ml-layer-table-state-icon :deep(polygon),
.ml-layer-table-state-icon :deep(ellipse),
.ml-layer-table-state-icon :deep(circle) {
  fill: currentColor;
  stroke: currentColor;
}

.ml-layer-table-plot-icon.is-no-plot {
  opacity: 0.55;
}

.ml-layer-table-color-cell {
  justify-content: flex-start;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
}

.ml-layer-table-color-cell--disabled {
  opacity: 0.45;
  pointer-events: none;
  cursor: default;
}

.ml-layer-table-color-swatch {
  display: inline-flex;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid var(--ml-theme-border);
  box-sizing: border-box;
}

.ml-layer-table-color-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ml-layer-table-select-cell {
  justify-content: stretch;
}

.ml-layer-table-select-cell :deep(.ml-linetype-select),
.ml-layer-table-select-cell :deep(.ml-lineweight-select) {
  min-height: 20px;
  font-size: 12px;
}

.ml-layer-table-select-cell :deep(.ant-select-selector),
.ml-layer-table-select-cell :deep(.ml-lineweight-select__trigger) {
  min-height: 20px;
  height: 20px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 12px;
}

.ml-layer-table-select-cell :deep(.ml-linetype-text),
.ml-layer-table-select-cell :deep(.ml-lineweight-label) {
  font-size: 12px;
}

.ml-layer-table-select-cell :deep(.ant-input),
.ml-layer-table-select-cell :deep(.ant-input-affix-wrapper) {
  font-size: 12px;
  height: 20px;
  line-height: 20px;
}

.ml-layer-table-name-input {
  font-size: 12px;
  height: 20px;
  line-height: 20px;
  padding: 0 6px;
  border: 1px solid var(--ml-theme-border);
  border-radius: 4px;
  box-sizing: border-box;
}

.ml-layer-table-text-input {
  width: 100%;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--ml-theme-text-primary);
  font-size: inherit;
  line-height: 20px;
  outline: none;
  box-sizing: border-box;
}

.ml-layer-table-text-input:hover:not(:disabled),
.ml-layer-table-text-input:focus:not(:disabled) {
  border-color: var(--ml-theme-border);
  background: var(--ml-theme-bg-surface);
}

.ml-layer-table-text-input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ml-layer-table-name {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ml-layer-table-name-input {
  width: 100%;
}

.ml-layer-table-current-marker {
  color: var(--ml-theme-primary);
  font-weight: 600;
}

.ml-layer-table .ml-layer-table-row--current > td.ant-table-cell {
  font-weight: 600;
}

.ml-layer-table .ant-table-tbody tr.current-row > td.ant-table-cell {
  background-color: var(--ml-theme-bg-active) !important;
  color: var(--ml-theme-text-heading);
}

.ml-layer-table .ant-table-tbody tr.current-row:hover > td.ant-table-cell {
  background-color: var(--ml-theme-bg-active) !important;
}

html.dark .ml-layer-table .ant-table-tbody tr.current-row > td.ant-table-cell {
  background-color: var(--ml-theme-primary-active) !important;
  color: #ffffff;
}

html.dark
  .ml-layer-table
  .ant-table-tbody
  tr.current-row:hover
  > td.ant-table-cell {
  background-color: var(--ml-theme-primary) !important;
}

.ml-layer-table .ml-layer-table-row--draft > td.ant-table-cell {
  background-color: var(--ml-theme-bg-hover);
}
</style>

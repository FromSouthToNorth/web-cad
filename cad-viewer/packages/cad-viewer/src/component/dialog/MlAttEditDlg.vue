<template>
  <ml-base-dialog
    v-model:modelValue="visible"
    :title="t('dialog.attEditDlg.title')"
    :width="520"
    :show-apply="true"
    :apply-disabled="!isDirty"
    :auto-close="false"
    @open="handleOpen"
    @ok="handleOk"
    @apply="handleApply"
    @cancel="handleCancel"
  >
    <div class="ml-att-edit-dlg">
      <div class="ml-att-edit-dlg__header">
        <div class="ml-att-edit-dlg__meta">
          <div class="ml-att-edit-dlg__meta-row">
            <span class="ml-att-edit-dlg__meta-label">
              {{ t('dialog.attEditDlg.block') }}
            </span>
            <span class="ml-att-edit-dlg__meta-value">{{ blockName }}</span>
          </div>
          <div class="ml-att-edit-dlg__meta-row">
            <span class="ml-att-edit-dlg__meta-label">
              {{ t('dialog.attEditDlg.tag') }}
            </span>
            <span class="ml-att-edit-dlg__meta-value">
              {{ currentRow?.tag || '—' }}
            </span>
          </div>
        </div>
        <a-button
          class="ml-att-edit-dlg__select-block"
          :disabled="isSelectingBlock"
          @click="handleSelectBlock"
        >
          <template #icon>
            <component :is="selectIcon" class="ml-att-edit-dlg__select-icon" />
          </template>
          {{ t('dialog.attEditDlg.selectBlock') }}
        </a-button>
      </div>

      <a-tabs v-model:activeKey="activeTab" class="ml-att-edit-dlg__tabs">
        <a-tab-pane
          :tab="t('dialog.attEditDlg.tabAttribute')"
          key="attribute"
        >
          <a-table
            :data-source="rows"
            :columns="attributeColumns"
            :scroll="{ y: 120 }"
            :row-key="(r: AttributeRow) => r.objectId"
            :custom-row="attributeCustomRow"
            :pagination="false"
            size="small"
            class="ml-att-edit-dlg__table"
          />

          <a-form
            layout="horizontal"
            :label-col="{ style: { width: '72px' } }"
            class="ml-att-edit-dlg__value-form"
          >
            <a-form-item :label="t('dialog.attEditDlg.value')">
              <a-input
                v-model:value="valueDraft"
                :disabled="!currentRow || currentRow.isConst"
                @input="markDirty"
              />
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <a-tab-pane
          :tab="t('dialog.attEditDlg.tabTextOptions')"
          key="text"
        >
          <a-form
            layout="horizontal"
            :label-col="{ style: { width: '120px' } }"
            class="ml-att-edit-dlg__form"
            :disabled="!currentRow || currentRow.isConst"
          >
            <a-form-item :label="t('dialog.attEditDlg.textStyle')">
              <a-select
                v-model:value="textForm.styleName"
                show-search
                :filter-option="filterOptionByLabel"
                class="ml-att-edit-dlg__control"
                @change="markDirty"
              >
                <a-select-option
                  v-for="name in textStyleNames"
                  :key="name"
                  :value="name"
                >
                  {{ name }}
                </a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item
              :label="t('dialog.attEditDlg.justification')"
              class="ml-att-edit-dlg__justify-row"
            >
              <div class="ml-att-edit-dlg__inline-row">
                <a-select
                  v-model:value="textForm.justification"
                  class="ml-att-edit-dlg__justify-select"
                  @change="markDirty"
                >
                  <a-select-option
                    v-for="opt in justificationOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </a-select-option>
                </a-select>
                <a-checkbox v-model:checked="textForm.backwards" disabled>
                  {{ t('dialog.attEditDlg.backwards') }}
                </a-checkbox>
                <a-checkbox v-model:checked="textForm.upsideDown" disabled>
                  {{ t('dialog.attEditDlg.upsideDown') }}
                </a-checkbox>
              </div>
            </a-form-item>

            <div class="ml-att-edit-dlg__pair-grid">
              <a-form-item :label="t('dialog.attEditDlg.height')">
                <a-input-number
                  v-model:value="textForm.height"
                  :min="0"
                  :step="0.1"
                  class="ml-att-edit-dlg__control"
                  @change="markDirty"
                />
              </a-form-item>
              <a-form-item :label="t('dialog.attEditDlg.widthFactor')">
                <a-input-number
                  v-model:value="textForm.widthFactor"
                  :min="0.01"
                  :step="0.1"
                  class="ml-att-edit-dlg__control"
                  @change="markDirty"
                />
              </a-form-item>
              <a-form-item :label="t('dialog.attEditDlg.rotation')">
                <a-input-number
                  v-model:value="textForm.rotationDeg"
                  :step="1"
                  class="ml-att-edit-dlg__control"
                  @change="markDirty"
                />
              </a-form-item>
              <a-form-item :label="t('dialog.attEditDlg.obliqueAngle')">
                <a-input-number
                  v-model:value="textForm.obliqueDeg"
                  :step="1"
                  class="ml-att-edit-dlg__control"
                  @change="markDirty"
                />
              </a-form-item>
            </div>

            <div class="ml-att-edit-dlg__annotative-row">
              <div class="ml-att-edit-dlg__annotative-check-wrap">
                <a-checkbox v-model:checked="textForm.annotative" disabled>
                  {{ t('dialog.attEditDlg.annotative') }}
                </a-checkbox>
              </div>
              <a-form-item
                :label="t('dialog.attEditDlg.boundaryWidth')"
                class="ml-att-edit-dlg__boundary-item"
              >
                <a-input
                  :value="''"
                  disabled
                  class="ml-att-edit-dlg__control"
                />
              </a-form-item>
            </div>
          </a-form>
        </a-tab-pane>

        <a-tab-pane
          :tab="t('dialog.attEditDlg.tabProperties')"
          key="properties"
        >
          <a-form
            layout="horizontal"
            :label-col="{ style: { width: '120px' } }"
            class="ml-att-edit-dlg__form"
            :disabled="!currentRow || currentRow.isConst"
          >
            <a-form-item :label="t('dialog.attEditDlg.layer')">
              <a-select
                v-model:value="propForm.layer"
                show-search
                :filter-option="filterOptionByLabel"
                class="ml-att-edit-dlg__control"
                @change="markDirty"
              >
                <a-select-option
                  v-for="layer in layerOptions"
                  :key="layer.value"
                  :value="layer.value"
                >
                  {{ layer.name }}
                </a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item :label="t('dialog.attEditDlg.linetype')">
              <ml-line-type-select
                v-model="propForm.lineType"
                :options="lineTypeOptions"
                class="ml-att-edit-dlg__control"
                @change="markDirty"
              />
            </a-form-item>
            <div class="ml-att-edit-dlg__pair-grid">
              <a-form-item :label="t('dialog.attEditDlg.color')">
                <ml-color-dropdown
                  :model-value="propColor"
                  :display-color="colorDisplay"
                  class="ml-att-edit-dlg__control"
                  @update:model-value="handleColorChange"
                />
              </a-form-item>
              <a-form-item :label="t('dialog.attEditDlg.lineweight')">
                <ml-line-weight-select
                  v-model="propForm.lineWeight"
                  class="ml-att-edit-dlg__control"
                  @change="markDirty"
                />
              </a-form-item>
            </div>
            <a-form-item :label="t('dialog.attEditDlg.plotStyle')">
              <a-select
                :value="'ByLayer'"
                disabled
                class="ml-att-edit-dlg__control"
              >
                <a-select-option value="ByLayer">ByLayer</a-select-option>
              </a-select>
            </a-form-item>
          </a-form>
        </a-tab-pane>
      </a-tabs>
    </div>
  </ml-base-dialog>
</template>

<script setup lang="ts">
import {
  AcApDocManager,
  acapRunDatabaseEdit
} from '@mlightcad/cad-simple-viewer'
import {
  AcCmColor,
  AcDbAttribute,
  AcDbTextHorizontalMode,
  AcDbTextVerticalMode,
  AcGiLineWeight
} from '@mlightcad/data-model'
import {
  Button as AButton,
  Checkbox as ACheckbox,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputNumber as AInputNumber,
  Select as ASelect,
  SelectOption as ASelectOption,
  Table as ATable,
  Tabs as ATabs,
  TabPane as ATabPane
} from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  findAttributePrompt,
  listBlockAttributes,
  promptAttributedBlockReference,
  useAttEdit,
  useDialogManager,
  useLayers
} from '../../composable'
import { select as selectIcon } from '../../svg'
import {
  buildLineTypeOptions,
  type LineTypeOption
} from '../common/lineTypeOptions'
import MlBaseDialog from '../common/MlBaseDialog.vue'
import MlColorDropdown from '../common/MlColorDropdown.vue'
import MlLineTypeSelect from '../common/MlLineTypeSelect.vue'
import MlLineWeightSelect from '../common/MlLineWeightSelect.vue'

interface AttributeRow {
  objectId: string
  tag: string
  prompt: string
  value: string
  isConst: boolean
  isMTextAttribute: boolean
  styleName: string
  height: number
  widthFactor: number
  rotationDeg: number
  obliqueDeg: number
  justification: string
  layer: string
  lineType: string
  colorKey: string
  lineWeight: AcGiLineWeight
}

interface TextFormState {
  styleName: string
  justification: string
  backwards: boolean
  upsideDown: boolean
  height: number
  widthFactor: number
  rotationDeg: number
  obliqueDeg: number
  annotative: boolean
}

interface PropFormState {
  layer: string
  lineType: string
  lineWeight: AcGiLineWeight
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()
const { toggleDialog } = useDialogManager()
const { setTargetObjectId, getTargetBlockReference, clearTarget } = useAttEdit()
const { layers } = useLayers(AcApDocManager.instance)

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const activeTab = ref('attribute')
const rows = ref<AttributeRow[]>([])
const selectedObjectId = ref<string | null>(null)
const valueDraft = ref('')
const isDirty = ref(false)
const isSelectingBlock = ref(false)
/** When true, the next `@open` keeps in-memory edits instead of reloading. */
const preserveEditsOnOpen = ref(false)
const blockName = ref('—')
const textStyleNames = ref<string[]>([])
const suppressSync = ref(false)
const propColor = shallowRef<AcCmColor>(createByLayerColor())

const textForm = reactive<TextFormState>({
  styleName: 'Standard',
  justification: justificationKey(
    AcDbTextHorizontalMode.LEFT,
    AcDbTextVerticalMode.BASELINE
  ),
  backwards: false,
  upsideDown: false,
  height: 2.5,
  widthFactor: 1,
  rotationDeg: 0,
  obliqueDeg: 0,
  annotative: false
})

const propForm = reactive<PropFormState>({
  layer: '0',
  lineType: 'ByLayer',
  lineWeight: AcGiLineWeight.ByLayer
})

const currentRow = computed(
  () => rows.value.find(row => row.objectId === selectedObjectId.value) ?? null
)

const layerOptions = computed(() =>
  layers.map(layer => ({
    value: layer.name,
    name: layer.name,
    cssColor: layer.cssColor || '#7b8794',
    isOn: layer.isOn,
    isLocked: layer.isLocked,
    isFrozen: layer.isFrozen,
    lineType: layer.linetype
  }))
)

const lineTypeOptions = computed<LineTypeOption[]>(() => {
  const db = AcApDocManager.instance?.curDocument?.database
  const options = buildLineTypeOptions(db)
  const specials: LineTypeOption[] = [
    { value: 'ByLayer', label: 'ByLayer' },
    { value: 'ByBlock', label: 'ByBlock' }
  ]
  const existing = new Set(options.map(o => o.value.toLowerCase()))
  return [
    ...specials.filter(s => !existing.has(s.value.toLowerCase())),
    ...options
  ]
})

const justificationOptions = computed(() => [
  {
    value: justificationKey(
      AcDbTextHorizontalMode.LEFT,
      AcDbTextVerticalMode.BASELINE
    ),
    label: t('dialog.attEditDlg.justify.left')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.CENTER,
      AcDbTextVerticalMode.BASELINE
    ),
    label: t('dialog.attEditDlg.justify.center')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.RIGHT,
      AcDbTextVerticalMode.BASELINE
    ),
    label: t('dialog.attEditDlg.justify.right')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.ALIGNED,
      AcDbTextVerticalMode.BASELINE
    ),
    label: t('dialog.attEditDlg.justify.align')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.MIDDLE,
      AcDbTextVerticalMode.BASELINE
    ),
    label: t('dialog.attEditDlg.justify.middle')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.FIT,
      AcDbTextVerticalMode.BASELINE
    ),
    label: t('dialog.attEditDlg.justify.fit')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.LEFT,
      AcDbTextVerticalMode.TOP
    ),
    label: t('dialog.attEditDlg.justify.topLeft')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.CENTER,
      AcDbTextVerticalMode.TOP
    ),
    label: t('dialog.attEditDlg.justify.topCenter')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.RIGHT,
      AcDbTextVerticalMode.TOP
    ),
    label: t('dialog.attEditDlg.justify.topRight')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.LEFT,
      AcDbTextVerticalMode.MIDDLE
    ),
    label: t('dialog.attEditDlg.justify.middleLeft')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.CENTER,
      AcDbTextVerticalMode.MIDDLE
    ),
    label: t('dialog.attEditDlg.justify.middleCenter')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.RIGHT,
      AcDbTextVerticalMode.MIDDLE
    ),
    label: t('dialog.attEditDlg.justify.middleRight')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.LEFT,
      AcDbTextVerticalMode.BOTTOM
    ),
    label: t('dialog.attEditDlg.justify.bottomLeft')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.CENTER,
      AcDbTextVerticalMode.BOTTOM
    ),
    label: t('dialog.attEditDlg.justify.bottomCenter')
  },
  {
    value: justificationKey(
      AcDbTextHorizontalMode.RIGHT,
      AcDbTextVerticalMode.BOTTOM
    ),
    label: t('dialog.attEditDlg.justify.bottomRight')
  }
])

const colorDisplay = computed(() => {
  const color = propColor.value
  if (!color) return '#8a8a8a'
  if (color.isByLayer) {
    const layer = layers.find(item => item.name === propForm.layer)
    return layer?.cssColor || color.cssColor || '#8a8a8a'
  }
  return color.cssColor || '#8a8a8a'
})

/** antdv table column definitions for the attribute list. */
const attributeColumns: TableColumnsType<AttributeRow> = [
  {
    title: () => t('dialog.attEditDlg.colTag'),
    dataIndex: 'tag',
    width: 100,
    ellipsis: true
  },
  {
    title: () => t('dialog.attEditDlg.colPrompt'),
    dataIndex: 'prompt',
    width: 120,
    ellipsis: true
  },
  {
    title: () => t('dialog.attEditDlg.colValue'),
    dataIndex: 'value',
    width: 100,
    ellipsis: true
  }
]

/** antdv `customRow`: highlight selected + emit click. */
function attributeCustomRow(record: AttributeRow) {
  const isSelected = record.objectId === selectedObjectId.value
  return {
    onClick: () => handleRowChange(record),
    class: { 'ml-att-edit-dlg__table-row--active': isSelected }
  }
}

/** antdv `show-search` filter: match label against the typed input. */
function filterOptionByLabel(input: string, option: { label?: string }) {
  const label = option?.label ?? ''
  return String(label).toLowerCase().includes(input.toLowerCase())
}

watch(valueDraft, value => {
  if (suppressSync.value) return
  const row = currentRow.value
  if (!row || row.isConst) return
  row.value = value
  isDirty.value = true
})

watch(
  () => [
    textForm.styleName,
    textForm.justification,
    textForm.height,
    textForm.widthFactor,
    textForm.rotationDeg,
    textForm.obliqueDeg
  ],
  () => {
    if (suppressSync.value) return
    commitTextFormToRow()
  }
)

watch(
  () => [
    propForm.layer,
    propForm.lineType,
    propColor.value?.toString(),
    propForm.lineWeight
  ],
  () => {
    if (suppressSync.value) return
    commitPropFormToRow()
  }
)

function createByLayerColor() {
  const color = new AcCmColor()
  color.setByLayer()
  return color
}

function radToDeg(radians: number) {
  return (Number(radians) * 180) / Math.PI
}

function degToRad(degrees: number) {
  return (Number(degrees) * Math.PI) / 180
}

function justificationKey(
  horizontal: AcDbTextHorizontalMode,
  vertical: AcDbTextVerticalMode
) {
  return `${horizontal}:${vertical}`
}

function parseJustification(key: string): {
  horizontal: AcDbTextHorizontalMode
  vertical: AcDbTextVerticalMode
} {
  const [h, v] = key.split(':').map(Number)
  return {
    horizontal: (Number.isFinite(h)
      ? h
      : AcDbTextHorizontalMode.LEFT) as AcDbTextHorizontalMode,
    vertical: (Number.isFinite(v)
      ? v
      : AcDbTextVerticalMode.BASELINE) as AcDbTextVerticalMode
  }
}

function cloneColor(color: AcCmColor | undefined) {
  if (!color) return createByLayerColor()
  return AcCmColor.fromString(color.toString()) ?? createByLayerColor()
}

function readAttributeValue(attr: AcDbAttribute) {
  if (attr.isMTextAttribute && attr.mtext) {
    return attr.mtext.contents ?? attr.textString ?? ''
  }
  return attr.textString ?? ''
}

function attributeToRow(attr: AcDbAttribute, prompt: string): AttributeRow {
  return {
    objectId: attr.objectId,
    tag: attr.tag || '',
    prompt,
    value: readAttributeValue(attr),
    isConst: !!attr.isConst,
    isMTextAttribute: !!attr.isMTextAttribute,
    styleName: attr.styleName || 'Standard',
    height: Number(attr.height) || 0,
    widthFactor: Number(attr.widthFactor) || 1,
    rotationDeg: radToDeg(attr.rotation || 0),
    obliqueDeg: radToDeg(attr.oblique || 0),
    justification: justificationKey(attr.horizontalMode, attr.verticalMode),
    layer: attr.layer || '0',
    lineType: attr.lineType || 'ByLayer',
    colorKey: attr.color?.toString() ?? createByLayerColor().toString(),
    lineWeight: attr.lineWeight ?? AcGiLineWeight.ByLayer
  }
}

function loadTextStyleNames() {
  const db = AcApDocManager.instance?.curDocument?.database
  if (!db) {
    textStyleNames.value = []
    return
  }
  const names: string[] = []
  const seen = new Set<string>()
  for (const record of db.tables.textStyleTable.newIterator()) {
    const raw = record.name ?? record.textStyle.name
    const name = typeof raw === 'string' ? raw.trim() : ''
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  textStyleNames.value = names
}

function loadFromTarget() {
  const blockRef = getTargetBlockReference()
  if (!blockRef) {
    rows.value = []
    selectedObjectId.value = null
    blockName.value = '—'
    isDirty.value = false
    return
  }

  blockName.value = blockRef.blockName || '—'
  loadTextStyleNames()

  const attrs = listBlockAttributes(blockRef)
  rows.value = attrs.map(attr =>
    attributeToRow(attr, findAttributePrompt(blockRef, attr.tag || ''))
  )
  selectedObjectId.value = rows.value[0]?.objectId ?? null
  isDirty.value = false
  syncFormsFromRow(currentRow.value)
}

function syncFormsFromRow(row: AttributeRow | null) {
  suppressSync.value = true
  if (!row) {
    valueDraft.value = ''
    suppressSync.value = false
    return
  }

  valueDraft.value = row.value
  textForm.styleName = row.styleName
  textForm.justification = row.justification
  textForm.height = row.height
  textForm.widthFactor = row.widthFactor
  textForm.rotationDeg = row.rotationDeg
  textForm.obliqueDeg = row.obliqueDeg
  textForm.backwards = false
  textForm.upsideDown = false
  textForm.annotative = false

  propForm.layer = row.layer
  propForm.lineType = row.lineType
  propColor.value =
    AcCmColor.fromString(row.colorKey) ?? createByLayerColor()
  propForm.lineWeight = row.lineWeight
  nextTick(() => {
    suppressSync.value = false
  })
}

function commitTextFormToRow() {
  const row = currentRow.value
  if (!row || row.isConst) return
  row.styleName = textForm.styleName
  row.justification = textForm.justification
  row.height = Number(textForm.height) || 0
  row.widthFactor = Number(textForm.widthFactor) || 1
  row.rotationDeg = Number(textForm.rotationDeg) || 0
  row.obliqueDeg = Number(textForm.obliqueDeg) || 0
  isDirty.value = true
}

function commitPropFormToRow() {
  const row = currentRow.value
  if (!row || row.isConst) return
  row.layer = propForm.layer
  row.lineType = propForm.lineType
  row.colorKey =
    propColor.value?.toString() ?? createByLayerColor().toString()
  row.lineWeight = propForm.lineWeight
  isDirty.value = true
}

function markDirty() {
  if (suppressSync.value) return
  isDirty.value = true
}

function handleColorChange(color: AcCmColor | undefined) {
  propColor.value = cloneColor(color)
  markDirty()
}

function handleRowChange(row: AttributeRow | undefined) {
  if (!row) return
  if (row.objectId === selectedObjectId.value) return
  commitTextFormToRow()
  commitPropFormToRow()
  if (currentRow.value && !currentRow.value.isConst) {
    currentRow.value.value = valueDraft.value
  }
  selectedObjectId.value = row.objectId
  syncFormsFromRow(row)
}

function applyRowsToDatabase() {
  const db = AcApDocManager.instance?.curDocument?.database
  const blockRef = getTargetBlockReference()
  if (!db || !blockRef || !rows.value.length) return false

  // Flush the active editors into the selected row before writing.
  commitTextFormToRow()
  commitPropFormToRow()
  if (currentRow.value && !currentRow.value.isConst) {
    currentRow.value.value = valueDraft.value
  }

  const rowById = new Map(rows.value.map(row => [row.objectId, row]))

  acapRunDatabaseEdit(db, 'Edit Attributes', () => {
    for (const attr of listBlockAttributes(blockRef)) {
      const row = rowById.get(attr.objectId)
      if (!row || attr.isConst) continue

      const opened = db.openEntityForWrite(attr)
      if (!(opened instanceof AcDbAttribute)) continue

      opened.textString = row.value
      if (opened.isMTextAttribute && opened.mtext) {
        opened.mtext.contents = row.value
      }

      opened.styleName = row.styleName
      opened.height = row.height
      opened.widthFactor = row.widthFactor
      opened.rotation = degToRad(row.rotationDeg)
      opened.oblique = degToRad(row.obliqueDeg)

      const justify = parseJustification(row.justification)
      opened.horizontalMode = justify.horizontal
      opened.verticalMode = justify.vertical

      opened.layer = row.layer
      opened.lineType = row.lineType
      opened.color =
        AcCmColor.fromString(row.colorKey) ?? createByLayerColor()
      opened.lineWeight = row.lineWeight
    }
  })

  // Attributes are drawn inside the INSERT; rebuild the owning block reference.
  AcApDocManager.instance?.curView?.updateEntity(blockRef)

  isDirty.value = false
  return true
}

function handleOpen() {
  activeTab.value = 'attribute'
  if (preserveEditsOnOpen.value) {
    preserveEditsOnOpen.value = false
    return
  }
  loadFromTarget()
}

function handleApply() {
  applyRowsToDatabase()
}

function handleOk() {
  applyRowsToDatabase()
  clearTarget()
  visible.value = false
}

function handleCancel() {
  clearTarget()
  visible.value = false
}

async function handleSelectBlock() {
  if (isSelectingBlock.value) return
  isSelectingBlock.value = true
  const previousId = getTargetBlockReference()?.objectId ?? null
  preserveEditsOnOpen.value = false
  visible.value = false
  await nextTick()

  try {
    const blockRef = await promptAttributedBlockReference(
      t('dialog.attEditDlg.promptSelectBlock'),
      t('dialog.attEditDlg.rejectSelectBlock'),
      t('dialog.attEditDlg.noAttributes')
    )
    if (blockRef) {
      setTargetObjectId(blockRef.objectId)
      const selectionSet = AcApDocManager.instance?.curView?.selectionSet
      selectionSet?.clear()
      selectionSet?.add(blockRef.objectId)
      // Same INSERT: keep pending edits; only reload when the target changes.
      preserveEditsOnOpen.value = blockRef.objectId === previousId
    } else if (previousId) {
      setTargetObjectId(previousId)
      // Pick cancelled — reopen without wiping unapplied edits.
      preserveEditsOnOpen.value = true
    }
  } finally {
    isSelectingBlock.value = false
    toggleDialog('AttEditDlg', true)
  }
}
</script>

<style scoped>
.ml-att-edit-dlg {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ml-att-edit-dlg__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ml-att-edit-dlg__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ml-att-edit-dlg__meta-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.ml-att-edit-dlg__meta-label {
  color: var(--ml-theme-text-secondary, #64748b);
  flex: 0 0 auto;
}

.ml-att-edit-dlg__meta-value {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-att-edit-dlg__select-block {
  flex: 0 0 auto;
}

.ml-att-edit-dlg__select-icon {
  margin-right: 4px;
}

.ml-att-edit-dlg__tabs {
  flex: 1;
}

.ml-att-edit-dlg__table {
  width: 100%;
  margin-bottom: 10px;
}

.ml-att-edit-dlg__table :deep(.ml-att-edit-dlg__table-row--active) {
  background: var(--ml-theme-bg-active, #dbeafe) !important;
}

.ml-att-edit-dlg__table :deep(.ml-att-edit-dlg__table-row--active > td) {
  background: var(--ml-theme-bg-active, #dbeafe) !important;
}

.ml-att-edit-dlg__value-form,
.ml-att-edit-dlg__form {
  width: 100%;
}

.ml-att-edit-dlg__control {
  width: 100%;
}

.ml-att-edit-dlg__pair-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.ml-att-edit-dlg__inline-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.ml-att-edit-dlg__justify-select {
  flex: 1 1 auto;
  min-width: 0;
}

.ml-att-edit-dlg__annotative-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
  align-items: center;
}

.ml-att-edit-dlg__annotative-check-wrap {
  padding-left: 120px;
  box-sizing: border-box;
}

.ml-att-edit-dlg__boundary-item {
  margin-bottom: 0 !important;
}

.ml-att-edit-dlg :deep(.ant-form-item) {
  margin-bottom: 4px;
}

.ml-att-edit-dlg :deep(.ant-tabs-tabs) {
  margin-bottom: 0;
}

.ml-att-edit-dlg :deep(.ant-tabs-content) {
  padding-top: 6px;
}
</style>

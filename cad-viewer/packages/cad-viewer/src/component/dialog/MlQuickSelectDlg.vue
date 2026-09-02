<template>
  <ml-base-dialog
    :title="t('dialog.quickSelectDlg.title')"
    :width="460"
    v-model="dialogVisible"
    name="QuickSelectDlg"
    @open="handleOpen"
    @ok="handleConfirm"
  >
    <a-form layout="horizontal" class="ml-quick-select-form">
      <a-form-item :label="t('dialog.quickSelectDlg.applyTo')">
        <a-select v-model:value="form.applyTo" style="width: 100%">
          <a-select-option
            v-for="item in applyToOptions"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('dialog.quickSelectDlg.objectType')">
        <a-select v-model:value="form.objectType" style="width: 100%">
          <a-select-option
            :label="t('dialog.quickSelectDlg.allObjectTypes')"
            value="*"
          >
            {{ t('dialog.quickSelectDlg.allObjectTypes') }}
          </a-select-option>
          <a-select-option
            v-for="type in objectTypeOptions"
            :key="type"
            :value="type"
          >
            {{ entityTypeName(type) }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('dialog.quickSelectDlg.property')">
        <a-select v-model:value="form.property" style="width: 100%">
          <a-select-option
            v-for="item in propertyOptions"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('dialog.quickSelectDlg.operator')">
        <a-select v-model:value="form.operator" style="width: 100%">
          <a-select-option
            v-for="item in operatorOptions"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('dialog.quickSelectDlg.value')">
        <a-select
          v-model:value="form.value"
          show-search
          mode="tags"
          :max-tag-count="1"
          style="width: 100%"
        >
          <a-select-option
            v-for="item in valueOptions"
            :key="item"
            :value="item"
          >
            {{ valueLabel(item) }}
          </a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('dialog.quickSelectDlg.howToApply')">
        <a-select v-model:value="form.selectionMode" style="width: 100%">
          <a-select-option
            v-for="item in selectionModeOptions"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </a-select-option>
        </a-select>
      </a-form-item>
    </a-form>

    <div class="ml-quick-select-result">
      {{
        t('dialog.quickSelectDlg.previewResult', {
          count: matchedCount,
          total: sourceCount
        })
      }}
    </div>
  </ml-base-dialog>
</template>

<script setup lang="ts">
import { AcDbEntity } from '@mlightcad/data-model'
import {
  Form as AForm,
  FormItem as AFormItem,
  message,
  Select as ASelect,
  SelectOption as ASelectOption
} from 'ant-design-vue'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  applyQuickSelect,
  getQuickSelectMatchedCount,
  getQuickSelectObjectTypes,
  getQuickSelectPropertyValues,
  getQuickSelectSourceCount,
  MlQuickSelectApplyTo,
  MlQuickSelectOperator,
  MlQuickSelectProperty,
  MlQuickSelectSelectionMode
} from '../../composable'
import { entityName } from '../../locale'
import MlBaseDialog from '../common/MlBaseDialog.vue'

const { t } = useI18n()
const dialogVisible = ref(true)

const DEFAULT_FORM = {
  applyTo: 'entireDrawing' as MlQuickSelectApplyTo,
  objectType: '*',
  property: 'layer' as MlQuickSelectProperty,
  operator: 'equals' as MlQuickSelectOperator,
  value: '',
  selectionMode: 'set' as MlQuickSelectSelectionMode
}

const form = reactive<{
  applyTo: MlQuickSelectApplyTo
  objectType: string
  property: MlQuickSelectProperty
  operator: MlQuickSelectOperator
  value: string
  selectionMode: MlQuickSelectSelectionMode
}>({ ...DEFAULT_FORM })

const resetForm = () => {
  form.applyTo = DEFAULT_FORM.applyTo
  form.objectType = DEFAULT_FORM.objectType
  form.property = DEFAULT_FORM.property
  form.operator = DEFAULT_FORM.operator
  form.value = DEFAULT_FORM.value
  form.selectionMode = DEFAULT_FORM.selectionMode
}

const applyToOptions = computed(() => [
  {
    value: 'entireDrawing',
    label: t('dialog.quickSelectDlg.applyToEntireDrawing')
  },
  {
    value: 'currentSelection',
    label: t('dialog.quickSelectDlg.applyToCurrentSelection')
  }
])

const propertyOptions = computed(() => [
  { value: 'objectType', label: t('dialog.quickSelectDlg.propObjectType') },
  { value: 'layer', label: t('dialog.quickSelectDlg.propLayer') },
  { value: 'color', label: t('dialog.quickSelectDlg.propColor') },
  { value: 'lineType', label: t('dialog.quickSelectDlg.propLineType') },
  { value: 'lineWeight', label: t('dialog.quickSelectDlg.propLineWeight') }
])

const stringOperators = computed(() => [
  { value: 'equals', label: t('dialog.quickSelectDlg.opEquals') },
  { value: 'notEquals', label: t('dialog.quickSelectDlg.opNotEquals') }
])

const numberOperators = computed(() => [
  { value: 'equals', label: t('dialog.quickSelectDlg.opEquals') },
  { value: 'notEquals', label: t('dialog.quickSelectDlg.opNotEquals') },
  { value: 'greaterThan', label: t('dialog.quickSelectDlg.opGreaterThan') },
  {
    value: 'greaterThanOrEqual',
    label: t('dialog.quickSelectDlg.opGreaterThanOrEqual')
  },
  { value: 'lessThan', label: t('dialog.quickSelectDlg.opLessThan') },
  {
    value: 'lessThanOrEqual',
    label: t('dialog.quickSelectDlg.opLessThanOrEqual')
  }
])

const selectionModeOptions = computed(() => [
  {
    value: 'set',
    label: t('dialog.quickSelectDlg.modeSet')
  },
  {
    value: 'add',
    label: t('dialog.quickSelectDlg.modeAdd')
  },
  {
    value: 'remove',
    label: t('dialog.quickSelectDlg.modeRemove')
  }
])

const objectTypeOptions = computed(() =>
  getQuickSelectObjectTypes(form.applyTo)
)

const operatorOptions = computed(() =>
  form.property === 'lineWeight' ? numberOperators.value : stringOperators.value
)

const valueOptions = computed(() =>
  getQuickSelectPropertyValues(
    form.applyTo,
    form.property,
    form.objectType === '*' ? undefined : form.objectType
  )
)

const sourceCount = computed(() =>
  getQuickSelectSourceCount(
    form.applyTo,
    form.objectType === '*' ? undefined : form.objectType
  )
)

const matchedCount = computed(() => {
  if (!form.value) {
    return 0
  }
  return getQuickSelectMatchedCount({
    applyTo: form.applyTo,
    objectType: form.objectType === '*' ? undefined : form.objectType,
    property: form.property,
    operator: form.operator,
    value: form.value,
    selectionMode: form.selectionMode
  })
})

watch(
  () => form.property,
  () => {
    const allowed = new Set(operatorOptions.value.map(item => item.value))
    if (!allowed.has(form.operator)) {
      form.operator = operatorOptions.value[0].value as MlQuickSelectOperator
    }
  },
  { immediate: true }
)

watch(
  valueOptions,
  options => {
    if (options.length === 0) {
      form.value = ''
      return
    }
    if (!options.includes(form.value)) {
      form.value = options[0]
    }
  },
  { immediate: true }
)

const entityTypeName = (type: string) => {
  return entityName({ type } as AcDbEntity)
}

const valueLabel = (value: string) => {
  if (form.property === 'objectType') {
    return entityTypeName(value)
  }
  return value
}

const handleConfirm = () => {
  if (!form.value) {
    message.warning(t('dialog.quickSelectDlg.valueRequired'))
    return
  }

  const result = applyQuickSelect({
    applyTo: form.applyTo,
    objectType: form.objectType === '*' ? undefined : form.objectType,
    property: form.property,
    operator: form.operator,
    value: form.value,
    selectionMode: form.selectionMode
  })

  message.success(
    t('dialog.quickSelectDlg.selectionResult', {
      count: result.matchedCount
    })
  )
}

const handleOpen = () => {
  resetForm()
}
</script>

<style scoped>
.ml-quick-select-form :deep(.ant-form-item) {
  margin-bottom: 8px;
}

.ml-quick-select-form :deep(.ant-form-item:last-child) {
  margin-bottom: 0;
}

.ml-quick-select-result {
  margin-top: 6px;
  color: var(--ml-theme-text-secondary, #64748b);
}
</style>

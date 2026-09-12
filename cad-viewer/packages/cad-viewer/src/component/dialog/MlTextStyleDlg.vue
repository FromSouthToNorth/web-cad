<template>
  <ml-base-dialog
    v-model:modelValue="visible"
    :title="t('dialog.textStyleDlg.title')"
    :width="600"
    @open="handleOpen"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="ml-text-style-dlg">
      <div class="ml-text-style-dlg__current">
        {{
          t('dialog.textStyleDlg.currentStyle', {
            name: currentStyleName || '—'
          })
        }}
      </div>

      <div class="ml-text-style-dlg__layout">
        <div class="ml-text-style-dlg__left">
          <div class="ml-text-style-dlg__list-label">
            {{ t('dialog.textStyleDlg.styles') }}
          </div>
          <div class="ml-text-style-dlg__left-stack">
            <div class="ml-text-style-dlg__list-box">
              <div class="ml-text-style-dlg__list-scroll">
                <ul class="ml-text-style-dlg__list" role="listbox">
                  <li
                    v-for="name in styleNames"
                    :key="name"
                    class="ml-text-style-dlg__list-item"
                    :class="{
                      'ml-text-style-dlg__list-item--active':
                        name === selectedName
                    }"
                    role="option"
                    :aria-selected="name === selectedName"
                    @click="selectStyle(name)"
                  >
                    {{ name }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="ml-text-style-dlg__preview" aria-hidden="true">
              <span
                class="ml-text-style-dlg__preview-text"
                :style="previewStyle"
              >
                {{ previewText }}
              </span>
            </div>
          </div>
        </div>

        <div class="ml-text-style-dlg__center">
          <div class="ml-text-style-dlg__settings">
            <div class="ml-text-style-dlg__settings-row">
              <ml-fieldset-group
                :title="t('dialog.textStyleDlg.fontSection')"
                class="ml-text-style-dlg__fieldset"
              >
                <div class="ml-text-style-dlg__pair-grid">
                  <div class="ml-text-style-dlg__pair-col">
                    <a-form layout="vertical" class="ml-text-style-dlg__form">
                      <a-form-item :label="t('dialog.textStyleDlg.fontName')">
                        <a-select
                          v-model:value="form.font"
                          show-search
                          :filter-option="filterOptionByLabel"
                          class="ml-text-style-dlg__control"
                          @search="handleFontSearch"
                          @change="handleFontChange"
                        >
                          <a-select-option
                            v-for="opt in fontOptions"
                            :key="opt.value"
                            :value="opt.value"
                          >
                            {{ opt.label
                            }}{{
                              opt.custom
                                ? ` (${t('dialog.textStyleDlg.customFont')})`
                                : ''
                            }}
                          </a-select-option>
                        </a-select>
                      </a-form-item>
                      <a-form-item class="ml-text-style-dlg__form-item--plain">
                        <a-checkbox
                          v-model:checked="form.useBigFont"
                          :disabled="!bigFontSupported"
                        >
                          {{ t('dialog.textStyleDlg.useBigFont') }}
                        </a-checkbox>
                      </a-form-item>
                    </a-form>
                  </div>
                  <div class="ml-text-style-dlg__pair-col">
                    <a-form
                      v-if="form.useBigFont"
                      layout="vertical"
                      class="ml-text-style-dlg__form"
                    >
                      <a-form-item
                        :label="t('dialog.textStyleDlg.bigFontName')"
                      >
                        <a-select
                          v-model:value="form.bigFont"
                          show-search
                          :filter-option="filterOptionByLabel"
                          class="ml-text-style-dlg__control"
                        >
                          <a-select-option
                            v-for="opt in bigFontOptions"
                            :key="opt.value"
                            :value="opt.value"
                          >
                            {{ opt.label }}
                          </a-select-option>
                        </a-select>
                      </a-form-item>
                    </a-form>
                    <a-form
                      v-else
                      layout="vertical"
                      class="ml-text-style-dlg__form"
                    >
                      <a-form-item :label="t('dialog.textStyleDlg.fontStyle')">
                        <a-select
                          v-model:value="form.fontStyle"
                          :disabled="!fontStyleEnabled"
                          class="ml-text-style-dlg__control"
                          @change="handleFontStyleChange"
                        >
                          <a-select-option
                            v-for="style in fontStyleOptions"
                            :key="style"
                            :value="style"
                          >
                            {{ style }}
                          </a-select-option>
                        </a-select>
                      </a-form-item>
                    </a-form>
                  </div>
                </div>
              </ml-fieldset-group>
            </div>

            <div class="ml-text-style-dlg__settings-row">
              <ml-fieldset-group
                :title="t('dialog.textStyleDlg.sizeSection')"
                class="ml-text-style-dlg__fieldset"
              >
                <div class="ml-text-style-dlg__pair-grid">
                  <div class="ml-text-style-dlg__pair-col">
                    <a-form layout="vertical" class="ml-text-style-dlg__form">
                      <a-form-item
                        :label="t('dialog.textStyleDlg.textHeight')"
                      >
                        <a-input-number
                          :key="`${selectedName}-height`"
                          v-model:value="form.textHeight"
                          :min="0"
                          :step="0.1"
                          :precision="4"
                          class="ml-text-style-dlg__control"
                        />
                      </a-form-item>
                    </a-form>
                  </div>
                  <div
                    class="ml-text-style-dlg__pair-col ml-text-style-dlg__pair-col--spacer"
                  />
                </div>
              </ml-fieldset-group>
            </div>

            <div class="ml-text-style-dlg__settings-row">
              <ml-fieldset-group
                :title="t('dialog.textStyleDlg.effectsSection')"
                class="ml-text-style-dlg__fieldset"
              >
                <div
                  class="ml-text-style-dlg__pair-grid ml-text-style-dlg__pair-grid--effects"
                >
                  <div
                    class="ml-text-style-dlg__pair-col ml-text-style-dlg__effects-checks"
                  >
                    <a-checkbox v-model:checked="form.upsideDown">
                      {{ t('dialog.textStyleDlg.upsideDown') }}
                    </a-checkbox>
                    <a-checkbox v-model:checked="form.backwards">
                      {{ t('dialog.textStyleDlg.backwards') }}
                    </a-checkbox>
                    <a-checkbox v-model:checked="form.vertical">
                      {{ t('dialog.textStyleDlg.vertical') }}
                    </a-checkbox>
                  </div>
                  <div class="ml-text-style-dlg__pair-col">
                    <a-form layout="vertical" class="ml-text-style-dlg__form">
                      <a-form-item
                        :label="t('dialog.textStyleDlg.widthFactor')"
                      >
                        <a-input-number
                          :key="`${selectedName}-width`"
                          v-model:value="form.widthFactor"
                          :min="0.01"
                          :step="0.1"
                          :precision="4"
                          class="ml-text-style-dlg__control"
                        />
                      </a-form-item>
                      <a-form-item
                        :label="t('dialog.textStyleDlg.obliqueAngle')"
                      >
                        <a-input-number
                          :key="`${selectedName}-oblique`"
                          v-model:value="form.obliqueAngle"
                          :min="TEXT_STYLE_OBLIQUE_MIN"
                          :max="TEXT_STYLE_OBLIQUE_MAX"
                          :step="1"
                          :precision="0"
                          class="ml-text-style-dlg__control"
                        />
                      </a-form-item>
                    </a-form>
                  </div>
                </div>
              </ml-fieldset-group>
            </div>
          </div>
        </div>

        <div class="ml-text-style-dlg__actions">
          <a-button
            class="ml-text-style-dlg__action-btn"
            :disabled="!canSetCurrent"
            @click="handleSetCurrent"
          >
            {{ t('dialog.textStyleDlg.setCurrent') }}
          </a-button>
          <a-button class="ml-text-style-dlg__action-btn" @click="handleNew">
            {{ t('dialog.textStyleDlg.new') }}
          </a-button>
          <a-button
            class="ml-text-style-dlg__action-btn"
            :disabled="!canDelete"
            @click="handleDelete"
          >
            {{ t('dialog.textStyleDlg.delete') }}
          </a-button>
          <a-button
            class="ml-text-style-dlg__action-btn"
            type="primary"
            :disabled="!selectedName"
            @click="handleApply"
          >
            {{ t('dialog.textStyleDlg.apply') }}
          </a-button>
        </div>
      </div>
    </div>
  </ml-base-dialog>

  <ml-base-dialog
    v-model:modelValue="newStyleVisible"
    :title="t('dialog.textStyleDlg.newTitle')"
    :width="360"
    :z-index="2200"
    :auto-close="false"
    @open="handleNewDialogOpen"
    @ok="handleNewOk"
    @cancel="handleNewCancel"
  >
    <a-form layout="vertical" class="ml-text-style-dlg__new-form">
      <a-form-item :label="t('dialog.textStyleDlg.newStyleName')">
        <a-input
          ref="newStyleInputRef"
          v-model:value="newStyleName"
          class="ml-text-style-dlg__control"
          @keyup.enter="handleNewOk"
        />
      </a-form-item>
      <div v-if="newStyleError" class="ml-text-style-dlg__new-error">
        {{ newStyleError }}
      </div>
    </a-form>
  </ml-base-dialog>
</template>

<script setup lang="ts">
import {
  Button as AButton,
  Checkbox as ACheckbox,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputNumber as AInputNumber,
  message,
  Modal,
  Select as ASelect,
  SelectOption as ASelectOption
} from 'ant-design-vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTextStyle } from '../../composable'
import {
  clampTextStyleObliqueAngle,
  TEXT_STYLE_OBLIQUE_MAX,
  TEXT_STYLE_OBLIQUE_MIN
} from '../../composable/useTextStyle'
import MlBaseDialog from '../common/MlBaseDialog.vue'
import MlFieldsetGroup from '../common/MlFieldsetGroup.vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const { t } = useI18n()

const {
  TEXT_STYLE_PREVIEW: previewText,
  styleNames,
  selectedName,
  currentStyleName,
  form,
  fontOptions,
  bigFontOptions,
  fontStyleEnabled,
  fontStyleOptions,
  bigFontSupported,
  canDelete,
  canSetCurrent,
  previewStyle,
  openDialog,
  revertForm,
  selectStyle,
  handleFontChange,
  handleFontSearch,
  handleFontStyleChange,
  saveSelectedStyle,
  setCurrentStyle,
  addStyle,
  deleteSelectedStyle,
  isValidNewTextStyleName
} = useTextStyle()

const visible = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const newStyleVisible = ref(false)
const newStyleName = ref('')
const newStyleError = ref('')
const newStyleInputRef = ref<InstanceType<typeof AInput> | null>(null)

/**
 * antdv `show-search` filter for the font dropdowns.
 *
 * The comparison deliberately uses the option `value` as well as its `label`:
 * options rendered from an `a-select-option` slot carry a VNode in `label`
 * (which stringifies to `"[object Object]"`), so a label-only filter matched
 * nothing and typing in the font box emptied the dropdown — including the
 * custom entry this dialog offers for names the drawing does not reference yet.
 */
function filterOptionByLabel(
  input: string,
  option: { label?: unknown; value?: unknown }
) {
  const needle = input.trim().toLowerCase()
  if (!needle) return true
  return [option?.label, option?.value].some(candidate => {
    if (typeof candidate === 'string') {
      return candidate.toLowerCase().includes(needle)
    }
    return (
      typeof candidate === 'number' && String(candidate).includes(needle)
    )
  })
}

function handleOpen() {
  openDialog()
}

function handleCancel() {
  revertForm()
}

function handleOk() {
  saveSelectedStyle()
}

/**
 * AutoCAD's "Apply" semantics: persist the edits without closing the dialog so
 * the user can keep tuning the same style.
 */
function handleApply() {
  // The number field already clamps, but a value typed and applied in one
  // gesture can still arrive out of range: clamp it here and say so once.
  const clamped = clampTextStyleObliqueAngle(form.obliqueAngle)
  if (clamped !== form.obliqueAngle) {
    form.obliqueAngle = clamped
    message.warning(t('dialog.textStyleDlg.obliqueRange'))
  }
  if (!saveSelectedStyle()) return
  message.success(
    t('dialog.textStyleDlg.applied', { name: selectedName.value })
  )
}

function handleSetCurrent() {
  if (setCurrentStyle()) {
    message.success(
      t('dialog.textStyleDlg.setCurrentDone', { name: selectedName.value })
    )
  }
}

function handleNew() {
  newStyleName.value = ''
  newStyleError.value = ''
  newStyleVisible.value = true
}

function handleNewDialogOpen() {
  void nextTick(() => {
    ;(newStyleInputRef.value as HTMLInputElement | null)?.focus?.()
  })
}

function handleNewCancel() {
  newStyleName.value = ''
  newStyleError.value = ''
}

function handleNewOk() {
  const name = newStyleName.value.trim()
  newStyleError.value = ''

  if (!name) {
    newStyleError.value = t('dialog.textStyleDlg.newNameRequired')
    return
  }
  if (/[;=<>`\\/,]/.test(name)) {
    newStyleError.value = t('dialog.textStyleDlg.invalidName')
    return
  }
  if (!isValidNewTextStyleName(name)) {
    newStyleError.value = t('dialog.textStyleDlg.duplicateName')
    return
  }

  if (addStyle(name)) {
    newStyleVisible.value = false
    newStyleName.value = ''
    message.success(t('dialog.textStyleDlg.created', { name }))
  }
}

function handleDelete() {
  const name = selectedName.value
  if (!canDelete.value) return

  Modal.confirm({
    title: t('dialog.textStyleDlg.deleteTitle'),
    content: t('dialog.textStyleDlg.deleteConfirm', { name }),
    okText: t('dialog.textStyleDlg.delete'),
    cancelText: t('dialog.baseDialog.cancel'),
    onOk() {
      if (deleteSelectedStyle()) {
        message.success(t('dialog.textStyleDlg.deleted', { name }))
      }
    }
  })
}
</script>

<style scoped>
.ml-text-style-dlg__current {
  margin-bottom: 8px;
  color: var(--ml-theme-text-secondary, #64748b);
}

.ml-text-style-dlg__layout {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) 100px;
  gap: 10px;
  align-items: stretch;
}

.ml-text-style-dlg__left {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  width: 100%;
}

.ml-text-style-dlg__list-label {
  margin-bottom: 4px;
  font-weight: 600;
  flex: 0 0 auto;
}

.ml-text-style-dlg__left-stack {
  flex: 1 1 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(140px, 1fr) auto;
  gap: 8px;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.ml-text-style-dlg__list-box,
.ml-text-style-dlg__preview {
  grid-column: 1;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ml-theme-border, #e2e8f0);
  border-radius: 2px;
}

.ml-text-style-dlg__list-box {
  min-height: 0;
  overflow: hidden;
}

.ml-text-style-dlg__list-scroll {
  height: 100%;
  width: 100%;
  overflow: auto;
}

.ml-text-style-dlg__list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  box-sizing: border-box;
}

.ml-text-style-dlg__list-item {
  padding: 2px 8px;
  cursor: pointer;
  user-select: none;
}

.ml-text-style-dlg__list-item:hover {
  background: var(--ml-theme-bg-hover, #f1f5f9);
}

.ml-text-style-dlg__list-item--active {
  background: var(--ml-theme-primary, #3b82f6);
  color: #fff;
}

.ml-text-style-dlg__preview {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  overflow: hidden;
}

.ml-text-style-dlg__preview-text {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  font-size: 16px;
  line-height: 1.2;
  text-align: center;
  word-break: break-all;
}

.ml-text-style-dlg__center {
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ml-text-style-dlg__settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  min-height: 0;
}

.ml-text-style-dlg__settings-row {
  min-width: 0;
}

.ml-text-style-dlg__fieldset {
  min-width: 0;
  height: 100%;
}

.ml-text-style-dlg__settings :deep(.ml-fieldset-group) {
  overflow: hidden;
}

.ml-text-style-dlg__settings :deep(.ml-fieldset-group__body) {
  min-width: 0;
  overflow: hidden;
}

/** Two-column body inside each group box (AutoCAD-style). */
.ml-text-style-dlg__pair-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 10px;
  align-items: start;
  min-width: 0;
}

.ml-text-style-dlg__pair-col {
  min-width: 0;
}

.ml-text-style-dlg__pair-col--spacer {
  min-height: 0;
}

.ml-text-style-dlg__pair-grid--effects {
  align-items: stretch;
}

.ml-text-style-dlg__effects-checks {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-self: stretch;
  min-height: 72px;
  padding: 2px 0;
}

.ml-text-style-dlg__effects-checks :deep(.ant-checkbox-wrapper) {
  height: auto;
  margin-inline-end: 0;
  line-height: 1.2;
}

.ml-text-style-dlg__new-form :deep(.ant-form-item) {
  margin-bottom: 0;
}

.ml-text-style-dlg__new-error {
  margin-top: 6px;
  color: var(--ml-theme-color-danger, #ef4444);
  font-size: var(--ml-dialog-font-size, 12px);
}

.ml-text-style-dlg__form :deep(.ant-form-item) {
  margin-bottom: 6px;
}

.ml-text-style-dlg__form :deep(.ant-form-item:last-child) {
  margin-bottom: 0;
}

.ml-text-style-dlg__form-item--plain :deep(.ant-form-item-control-input) {
  min-height: auto;
}

.ml-text-style-dlg__control {
  width: 100%;
  max-width: 100%;
}

.ml-text-style-dlg__form :deep(.ant-input-number) {
  width: 100%;
  max-width: 100%;
}

.ml-text-style-dlg__form :deep(.ant-select) {
  width: 100%;
  max-width: 100%;
}

.ml-text-style-dlg__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: start;
  width: 100%;
  min-width: 0;
}

.ml-text-style-dlg__action-btn {
  width: 100%;
}

.ml-text-style-dlg__actions :deep(.ant-btn) {
  width: 100%;
  margin: 0 !important;
  padding-left: 6px;
  padding-right: 6px;
  justify-content: center;
}

.ml-text-style-dlg__actions :deep(.ant-btn > span) {
  width: 100%;
  justify-content: center;
}
</style>

<template>
  <div
    v-if="modelValue"
    class="ml-base-dialog"
    role="dialog"
    aria-modal="true"
    :style="{ zIndex }"
  >
    <!-- Overlay -->
    <div class="ml-base-dialog-overlay" @click="handleCancel"></div>

    <div class="ml-base-dialog-container" :style="{ width: widthStyle }">
      <!-- Header -->
      <div class="ml-base-dialog-header">
        <div class="ml-base-dialog-title">
          <span v-if="computedIcon" class="ml-base-dialog-icon-wrapper">
            <component :is="computedIcon" class="ml-base-dialog-icon" />
          </span>
          <span>{{ title }}</span>
        </div>
        <div class="ml-base-dialog-actions">
          <a-button type="text" size="small" class="ml-base-dialog-close" @click="handleCancel">
            <template #icon>
              <CloseOutlined />
            </template>
          </a-button>
        </div>
      </div>

      <!-- Body -->
      <div class="ml-base-dialog-body">
        <slot />
      </div>

      <!-- Footer -->
      <div class="ml-base-dialog-footer">
        <div class="ml-base-dialog-footer-actions">
          <a-button
            v-if="showApply"
            :disabled="applyDisabled"
            @click="handleApply"
          >
            {{ t('dialog.baseDialog.apply') }}
          </a-button>
          <a-button @click="handleCancel">
            {{ t('dialog.baseDialog.cancel') }}
          </a-button>
          <a-button type="primary" @click="handleOk">
            {{ t('dialog.baseDialog.ok') }}
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'
import { type Component, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { mlightcad } from '../../svg'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, required: true },
  width: { type: [Number, String], default: 400 },
  icon: { type: Object as () => Component | null, default: null },
  /** When false, OK emits but leaves the dialog open (caller closes on success). */
  autoClose: { type: Boolean, default: true },
  /** Shows an Apply button before OK/Cancel (AutoCAD-style dialogs). */
  showApply: { type: Boolean, default: false },
  /** Disables Apply when there are no pending changes. */
  applyDisabled: { type: Boolean, default: false },
  zIndex: { type: Number, default: 2100 }
})

const emits = defineEmits([
  'update:modelValue',
  'ok',
  'cancel',
  'apply',
  'open',
  'opened'
])

const computedIcon = computed<Component>(() => props.icon ?? mlightcad)

const widthStyle = computed(() =>
  typeof props.width === 'number' ? `${props.width}px` : props.width
)

watch(
  () => props.modelValue,
  async (newVal, oldVal) => {
    if (newVal && !oldVal) {
      emits('open')
      await nextTick()
      emits('opened')
    }
  }
)

function handleOk() {
  emits('ok')
  if (props.autoClose) {
    emits('update:modelValue', false)
  }
}

function handleApply() {
  emits('apply')
}

function handleCancel() {
  emits('cancel')
  emits('update:modelValue', false)
}
</script>

<style scoped>
/* Base Layout */
.ml-base-dialog {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Overlay */
.ml-base-dialog-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.4);
}

/* Dialog container */
.ml-base-dialog-container {
  position: relative;
  z-index: 1;
  --ml-dialog-font-size: 12px;
  --ml-dialog-body-padding-x: 16px;
  --ml-dialog-body-padding-y: 16px;
  background: var(--ml-theme-bg-surface, #ffffff);
  border: 1px solid var(--ml-theme-border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
  color: var(--ml-theme-text-primary, #18181b);
}

/* Header */
.ml-base-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px;
  height: 24px;
  border-bottom: 1px solid var(--ml-theme-border, #e2e8f0);
  background: var(--ml-theme-bg-subtle, #f1f5f9);
  position: relative;
}

.ml-base-dialog-title {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  gap: 8px;
  font-weight: 600;
  font-size: var(--ml-dialog-font-size);
  color: var(--ml-theme-text-primary, #18181b);
  min-width: 0;
}

.ml-base-dialog-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.ml-base-dialog-icon {
  width: 20px;
  height: 20px;
  color: var(--ml-theme-primary, #3b82f6);
}

.ml-base-dialog-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.ml-base-dialog-actions {
  display: flex;
  align-items: center;
}

.ml-base-dialog-close {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
}

/* Body */
.ml-base-dialog-body {
  padding: var(--ml-dialog-body-padding-y) var(--ml-dialog-body-padding-x);
  overflow-y: auto;
  flex: 1;
  font-size: var(--ml-dialog-font-size);
}

/* Footer */
.ml-base-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--ml-theme-border, #e2e8f0);
  background: var(--ml-theme-bg-surface, #ffffff);
  padding: 4px 8px;
}

.ml-base-dialog-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

.ml-base-dialog-footer-actions :deep(.ant-btn) {
  min-width: 72px;
  display: inline-flex;
  justify-content: center !important;
  text-align: center !important;
  font-size: var(--ml-dialog-font-size, 12px);
}

.ml-base-dialog-footer-actions :deep(.ant-btn > span) {
  width: 100%;
  justify-content: center !important;
  text-align: center !important;
}
</style>

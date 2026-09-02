<template>
  <div class="file-upload-container">
    <div class="upload-panel">
      <div class="upload-main">
        <section class="upload-hero">
          <div class="upload-icon">
            <inbox-outlined />
          </div>
          <div class="upload-hero-text">
            <h1 class="upload-title">{{ $t('fileUpload.title') }}</h1>
            <p class="upload-subtitle">
              {{ $t('fileUpload.subtitle') }}
            </p>
          </div>
        </section>

        <div class="upload-actions">
          <a-button
            type="primary"
            size="large"
            block
            class="new-drawing-button"
            @click="handleNewDrawing"
          >
            <template #icon><file-add-outlined /></template>
            {{ $t('fileUpload.newDrawing') }}
          </a-button>

          <p class="upload-divider" aria-hidden="true">
            <span>{{ $t('fileUpload.or') }}</span>
          </p>

          <a-upload-dragger
            class="upload-dropzone"
            accept=".dxf"
            :show-upload-list="false"
            :before-upload="beforeUpload"
          >
            <p class="dropzone-title">
              {{ $t('fileUpload.dropFile') }}
              <span class="dropzone-link">{{ $t('fileUpload.browse') }}</span>
            </p>
            <div class="format-tags">
              <span class="format-tag">DXF</span>
            </div>
          </a-upload-dragger>
        </div>
      </div>

      <section class="settings-section">
        <header class="settings-header">
          <h2 class="settings-title">{{ $t('fileUpload.openOptions') }}</h2>
        </header>

        <div class="settings-grid">
          <div class="setting-block setting-block--full">
            <h3 class="setting-label">{{ $t('fileUpload.initialView') }}</h3>
            <a-radio-group
              v-model:value="selectedOpenViewMode"
              size="small"
              button-style="solid"
              class="pill-segment"
              :aria-label="$t('fileUpload.initialView')"
            >
              <a-radio-button
                v-for="option in openViewModes"
                :key="option.value"
                :value="option.value"
                :title="option.description"
              >
                {{ option.label }}
              </a-radio-button>
            </a-radio-group>
          </div>

          <div class="setting-block setting-block--full">
            <h3 class="setting-label">{{ $t('fileUpload.accessMode') }}</h3>
            <a-radio-group
              v-model:value="selectedMode"
              size="small"
              button-style="solid"
              class="pill-segment"
              :aria-label="$t('fileUpload.accessMode')"
            >
              <a-radio-button
                v-for="mode in accessModes"
                :key="mode.value"
                :value="mode.value"
                :title="mode.description"
              >
                {{ mode.label }}
              </a-radio-button>
            </a-radio-group>
          </div>

          <div class="setting-block">
            <h3 class="setting-label">{{ $t('fileUpload.textRendering') }}</h3>
            <a-radio-group
              v-model:value="textRenderingChoice"
              size="small"
              button-style="solid"
              class="pill-segment"
              :aria-label="$t('fileUpload.textRendering')"
            >
              <a-radio-button
                value="worker"
                :title="$t('fileUpload.textRenderingModes.workerDesc')"
              >
                {{ $t('fileUpload.textRenderingModes.worker') }}
              </a-radio-button>
              <a-radio-button
                value="mainThread"
                :title="$t('fileUpload.textRenderingModes.mainThreadDesc')"
              >
                {{ $t('fileUpload.textRenderingModes.mainThread') }}
              </a-radio-button>
            </a-radio-group>
          </div>

          <div class="setting-block">
            <h3 class="setting-label">{{ $t('fileUpload.progressive') }}</h3>
            <a-radio-group
              v-model:value="progressiveChoice"
              size="small"
              button-style="solid"
              class="pill-segment"
              :aria-label="$t('fileUpload.progressive')"
            >
              <a-radio-button
                value="on"
                :title="$t('fileUpload.progressiveModes.onDesc')"
              >
                {{ $t('fileUpload.progressiveModes.on') }}
              </a-radio-button>
              <a-radio-button
                value="off"
                :title="$t('fileUpload.progressiveModes.offDesc')"
              >
                {{ $t('fileUpload.progressiveModes.off') }}
              </a-radio-button>
            </a-radio-group>
          </div>

          <div class="setting-block">
            <h3 class="setting-label">{{ $t('fileUpload.nonPlottable') }}</h3>
            <a-radio-group
              v-model:value="nonPlottableChoice"
              size="small"
              button-style="solid"
              class="pill-segment"
              :aria-label="$t('fileUpload.nonPlottable')"
            >
              <a-radio-button
                value="hide"
                :title="$t('fileUpload.nonPlottableModes.hideDesc')"
              >
                {{ $t('fileUpload.nonPlottableModes.hide') }}
              </a-radio-button>
              <a-radio-button
                value="show"
                :title="$t('fileUpload.nonPlottableModes.showDesc')"
              >
                {{ $t('fileUpload.nonPlottableModes.show') }}
              </a-radio-button>
            </a-radio-group>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileAddOutlined, InboxOutlined } from '@ant-design/icons-vue'
import { AcApOpenViewMode, AcEdOpenMode } from '@mlightcad/cad-simple-viewer'
import { log } from '@mlightcad/data-model'
import type { UploadProps } from 'ant-design-vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  onFileSelect: (
    file: File,
    mode: AcEdOpenMode,
    useMainThreadDraw: boolean,
    drawNoPlotLayers: boolean,
    progressiveRendering: boolean,
    openViewMode: AcApOpenViewMode | undefined
  ) => void
  onNewDrawing?: (
    mode: AcEdOpenMode,
    useMainThreadDraw: boolean,
    drawNoPlotLayers: boolean,
    progressiveRendering: boolean,
    openViewMode: AcApOpenViewMode | undefined
  ) => void
}

const props = defineProps<Props>()

const { t } = useI18n()

type OpenViewModeChoice = 'auto' | AcApOpenViewMode

const selectedMode = ref<AcEdOpenMode>(AcEdOpenMode.Write)
const selectedOpenViewMode = ref<OpenViewModeChoice>('auto')
const useMainThreadDraw = ref(false)
const drawNoPlotLayers = ref(false)
const progressiveRendering = ref(false)

const openViewModes = computed(() => [
  {
    value: 'auto' as const,
    label: t('fileUpload.viewModes.auto'),
    description: t('fileUpload.viewModes.autoDesc')
  },
  {
    value: AcApOpenViewMode.Extents,
    label: t('fileUpload.viewModes.extents'),
    description: t('fileUpload.viewModes.extentsDesc')
  },
  {
    value: AcApOpenViewMode.Saved,
    label: t('fileUpload.viewModes.saved'),
    description: t('fileUpload.viewModes.savedDesc')
  }
])

const resolveOpenViewMode = (): AcApOpenViewMode | undefined =>
  selectedOpenViewMode.value === 'auto' ? undefined : selectedOpenViewMode.value

const accessModes = computed(() => [
  {
    value: AcEdOpenMode.Read,
    label: t('fileUpload.accessModes.read'),
    description: t('fileUpload.accessModes.readDesc')
  },
  {
    value: AcEdOpenMode.Review,
    label: t('fileUpload.accessModes.review'),
    description: t('fileUpload.accessModes.reviewDesc')
  },
  {
    value: AcEdOpenMode.Write,
    label: t('fileUpload.accessModes.write'),
    description: t('fileUpload.accessModes.writeDesc')
  }
])

const textRenderingChoice = computed({
  get: () => (useMainThreadDraw.value ? 'mainThread' : 'worker'),
  set: value => {
    useMainThreadDraw.value = value === 'mainThread'
  }
})

const progressiveChoice = computed({
  get: () => (progressiveRendering.value ? 'on' : 'off'),
  set: value => {
    progressiveRendering.value = value === 'on'
  }
})

const nonPlottableChoice = computed({
  get: () => (drawNoPlotLayers.value ? 'show' : 'hide'),
  set: value => {
    drawNoPlotLayers.value = value === 'show'
  }
})

const isValidFile = (file: File): boolean => {
  const validExtensions = ['.dxf']
  const fileName = file.name.toLowerCase()
  return validExtensions.some(ext => fileName.endsWith(ext))
}

const beforeUpload: UploadProps['beforeUpload'] = file => {
  if (!isValidFile(file as File)) {
    log.warn('Invalid file type. Please upload DXF files.')
    return false
  }
  props.onFileSelect(
    file as File,
    selectedMode.value,
    useMainThreadDraw.value,
    drawNoPlotLayers.value,
    progressiveRendering.value,
    resolveOpenViewMode()
  )
  // Selection is handled by the app (switches to the viewer); never upload.
  return false
}

const handleNewDrawing = () => {
  props.onNewDrawing?.(
    selectedMode.value,
    useMainThreadDraw.value,
    drawNoPlotLayers.value,
    progressiveRendering.value,
    resolveOpenViewMode()
  )
}
</script>

<style scoped>
.file-upload-container {
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 820px;
  padding: 12px 16px;
  box-sizing: border-box;
}

.upload-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto;
  width: 100%;
  border-radius: 14px;
  background: var(--ml-theme-bg-surface);
  overflow: hidden;
}

.upload-main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px 20px;
}

.upload-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.upload-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--ml-theme-primary);
  color: var(--ml-theme-on-primary);
  font-size: 18px;
}

.upload-hero-text {
  min-width: 0;
}

.upload-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ml-theme-text-primary);
  line-height: 1.25;
}

.upload-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ml-theme-text-secondary);
  line-height: 1.35;
}

.upload-actions {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.new-drawing-button {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.upload-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--ml-theme-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.upload-divider::before,
.upload-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ml-theme-border);
}

.upload-dropzone {
  width: 100%;
  box-sizing: border-box;
}

.upload-dropzone :deep(.ant-upload-dragger) {
  padding: 14px 12px;
  border-radius: 10px;
  background: var(--ml-theme-bg-input);
}

.dropzone-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ml-theme-text-primary);
}

.dropzone-link {
  color: var(--ml-theme-primary);
  font-weight: 600;
}

.format-tags {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.format-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--ml-theme-bg-tag);
  color: var(--ml-theme-primary-hover);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.settings-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px 20px;
  background: var(--ml-theme-bg-subtle);
  border-left: 1px solid var(--ml-theme-border);
}

.settings-header {
  margin-bottom: 10px;
}

.settings-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--ml-theme-text-heading);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
}

.setting-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-block--full {
  grid-column: 1 / -1;
}

.setting-label {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ml-theme-text-muted);
}

.pill-segment {
  display: flex;
  gap: 0;
  border: 1.5px solid var(--ml-theme-border);
  border-radius: 7px;
  background: var(--ml-theme-bg-surface);
  overflow: hidden;
}

.pill-segment :deep(.ant-radio-button-wrapper) {
  flex: 1;
  padding-inline: 8px;
  text-align: center;
  white-space: nowrap;
  border: none;
  box-shadow: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--ml-theme-text-secondary);
  background: transparent;
  line-height: 26px;
}

.pill-segment :deep(.ant-radio-button-wrapper:not(:first-child)::before) {
  display: none;
}

.pill-segment :deep(.ant-radio-button-wrapper:not(:last-child)) {
  border-right: 1px solid var(--ml-theme-border);
}

.pill-segment :deep(.ant-radio-button-wrapper:hover) {
  color: var(--ml-theme-text-primary);
}

.pill-segment :deep(.ant-radio-button-wrapper-checked) {
  background: var(--ml-theme-bg-active);
  color: var(--ml-theme-primary-hover);
  box-shadow: none;
}

/* Narrow viewports: stack upload + settings as two vertical rows */
@media (max-width: 768px) {
  .file-upload-container {
    max-width: 100%;
    padding: 12px;
  }

  .upload-panel {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }

  .settings-section {
    border-left: none;
    border-top: 1px solid var(--ml-theme-border);
  }

  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .setting-block--full {
    grid-column: 1 / -1;
  }
}

@media (max-width: 400px) {
  .upload-main,
  .settings-section {
    padding-left: 14px;
    padding-right: 14px;
  }

  .settings-grid {
    grid-template-columns: 1fr;
  }

  .setting-block--full {
    grid-column: auto;
  }
}
</style>

<template>
  <div class="ml-open-file-profile">
    <div class="ml-open-file-profile-toolbar">
      <div class="ml-open-file-profile-meta">
        <span v-if="collectedAtLabel">
          {{
            t('main.toolPalette.openFileProfile.collectedAt', {
              time: collectedAtLabel
            })
          }}
        </span>
      </div>
      <div class="ml-open-file-profile-actions">
        <a-button size="small" type="primary" @click="refreshFromLast">
          {{ t('main.toolPalette.openFileProfile.refresh') }}
        </a-button>
        <a-tooltip
          :title="t('main.toolPalette.openFileProfile.copy')"
          placement="bottomRight"
        >
          <a-button
            size="small"
            :disabled="!snapshot"
            :aria-label="t('main.toolPalette.openFileProfile.copy')"
            @click="copyProfile"
          >
            <CopyOutlined />
          </a-button>
        </a-tooltip>
      </div>
    </div>

    <a-tooltip
      :title="t('main.toolPalette.openFileProfile.hint')"
      placement="bottom"
    >
      <div class="ml-open-file-profile-hint" role="note">
        <InfoCircleFilled class="ml-open-file-profile-hint-icon" />
        <span class="ml-open-file-profile-hint-text">
          {{ t('main.toolPalette.openFileProfile.hint') }}
        </span>
      </div>
    </a-tooltip>

    <template v-if="snapshot">
      <div class="ml-open-file-profile-section">
        <button
          type="button"
          class="ml-open-file-profile-section-title"
          @click="timingExpanded = !timingExpanded"
        >
          <RightOutlined
            class="ml-open-file-profile-caret"
            :class="{ 'is-expanded': timingExpanded }"
          />
          {{ t('main.toolPalette.openFileProfile.timing') }}
        </button>
        <a-table
          v-show="timingExpanded"
          :data-source="timingRows"
          :columns="timingColumns"
          size="small"
          :pagination="false"
          class="ml-open-file-profile-table"
        />
      </div>

      <div
        v-if="progressiveRows.length > 0"
        class="ml-open-file-profile-section"
      >
        <button
          type="button"
          class="ml-open-file-profile-section-title"
          @click="progressiveExpanded = !progressiveExpanded"
        >
          <RightOutlined
            class="ml-open-file-profile-caret"
            :class="{ 'is-expanded': progressiveExpanded }"
          />
          {{ t('main.toolPalette.openFileProfile.progressive') }}
        </button>
        <a-table
          v-show="progressiveExpanded"
          :data-source="progressiveRows"
          :columns="progressiveColumns"
          size="small"
          :pagination="false"
          class="ml-open-file-profile-table"
        />
      </div>

      <div class="ml-open-file-profile-section">
        <button
          type="button"
          class="ml-open-file-profile-section-title"
          @click="cacheExpanded = !cacheExpanded"
        >
          <RightOutlined
            class="ml-open-file-profile-caret"
            :class="{ 'is-expanded': cacheExpanded }"
          />
          {{ t('main.toolPalette.openFileProfile.cache') }}
        </button>
        <a-table
          v-show="cacheExpanded"
          :data-source="cacheRows"
          :columns="cacheColumns"
          size="small"
          :pagination="false"
          class="ml-open-file-profile-table"
        />
      </div>

      <div class="ml-open-file-profile-section">
        <button
          type="button"
          class="ml-open-file-profile-section-title"
          @click="slowBlocksExpanded = !slowBlocksExpanded"
        >
          <RightOutlined
            class="ml-open-file-profile-caret"
            :class="{ 'is-expanded': slowBlocksExpanded }"
          />
          {{ t('main.toolPalette.openFileProfile.slowBlocks') }}
        </button>
        <a-table
          v-show="slowBlocksExpanded"
          :data-source="slowBlocks"
          :columns="slowBlockColumns"
          size="small"
          :pagination="false"
          class="ml-open-file-profile-table"
          :locale="{ emptyText: t('main.toolPalette.openFileProfile.empty') }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'buildMs'">
              {{ formatMs(record.buildMs) }}
            </template>
            <template v-else-if="column.dataIndex === 'compactMs'">
              {{ formatMs(record.compactMs) }}
            </template>
          </template>
        </a-table>
      </div>
    </template>

    <a-empty
      v-else
      :description="t('main.toolPalette.openFileProfile.noData')"
    />
  </div>
</template>

<script setup lang="ts">
import {
  CopyOutlined,
  InfoCircleFilled,
  RightOutlined
} from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useOpenFileProfile } from '../../composable/useOpenFileProfile'

const { t } = useI18n()
const {
  snapshot,
  collectedAtLabel,
  timingRows,
  progressiveRows,
  cacheRows,
  slowBlocks,
  adoptPublishedSnapshot,
  refreshFromLast,
  copyText,
  formatMs
} = useOpenFileProfile()

const timingExpanded = ref(true)
const progressiveExpanded = ref(true)
const cacheExpanded = ref(true)
const slowBlocksExpanded = ref(true)

const timingColumns = [
  { title: t('main.toolPalette.openFileProfile.columns.stage'), dataIndex: 'label', width: 140 },
  { title: t('main.toolPalette.openFileProfile.columns.duration'), dataIndex: 'value', width: 100, align: 'right' as const },
  { title: t('main.toolPalette.openFileProfile.columns.share'), dataIndex: 'pct', width: 80, align: 'right' as const }
]

const progressiveColumns = [
  { title: t('main.toolPalette.openFileProfile.columns.metric'), dataIndex: 'label', width: 160 },
  { title: t('main.toolPalette.openFileProfile.columns.value'), dataIndex: 'value', width: 120, align: 'right' as const }
]

const cacheColumns = [
  { title: t('main.toolPalette.openFileProfile.columns.metric'), dataIndex: 'label', width: 160 },
  { title: t('main.toolPalette.openFileProfile.columns.value'), dataIndex: 'value', width: 120, align: 'right' as const }
]

const slowBlockColumns = [
  { title: t('main.toolPalette.openFileProfile.columns.block'), dataIndex: 'blockName', width: 140, ellipsis: true },
  { title: t('main.toolPalette.openFileProfile.columns.build'), dataIndex: 'buildMs', width: 88, align: 'right' as const },
  { title: t('main.toolPalette.openFileProfile.columns.compact'), dataIndex: 'compactMs', width: 88, align: 'right' as const }
]

async function copyProfile() {
  const text = copyText()
  if (text == null) return

  try {
    await navigator.clipboard.writeText(text)
    message.success(t('main.toolPalette.openFileProfile.copied'))
  } catch {
    message.error(t('main.toolPalette.openFileProfile.copyFailed'))
  }
}

onMounted(() => {
  if (!adoptPublishedSnapshot()) {
    refreshFromLast()
  }
})
</script>

<style scoped>
.ml-open-file-profile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 4px 2px 8px;
}

.ml-open-file-profile-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.ml-open-file-profile-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ml-open-file-profile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--ml-theme-text-secondary);
  min-width: 0;
}

.ml-open-file-profile-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--ml-theme-bg-hover);
  color: var(--ml-theme-text-primary);
  font-size: 12px;
  line-height: 1.4;
  flex-shrink: 0;
  cursor: default;
}

.ml-open-file-profile-hint-icon {
  flex-shrink: 0;
  color: #06b6d4;
  font-size: 14px;
}

.ml-open-file-profile-hint-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ml-open-file-profile-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex-shrink: 0;
}

.ml-open-file-profile-section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.ml-open-file-profile-section-title:hover {
  color: var(--ml-theme-primary);
}

.ml-open-file-profile-caret {
  transition: transform 0.15s ease;
  font-size: 12px;
}

.ml-open-file-profile-caret.is-expanded {
  transform: rotate(90deg);
}

.ml-open-file-profile-table {
  width: 100%;
  flex: 0 0 auto;
}
</style>

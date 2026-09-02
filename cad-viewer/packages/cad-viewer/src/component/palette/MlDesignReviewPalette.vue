<template>
  <div class="ml-design-review">
    <div class="ml-design-review-toolbar">
      <a-input
        v-model:value="search"
        allow-clear
        size="small"
        class="ml-design-review-search"
        :placeholder="t('main.toolPalette.designReview.searchPlaceholder')"
      />
      <a-button
        size="small"
        :disabled="markups.length === 0"
        @click="clearAll"
      >
        {{ t('main.toolPalette.designReview.clear') }}
      </a-button>
    </div>

    <a-table
      :columns="tableColumns"
      :data-source="filtered"
      class="ml-design-review-table"
      size="small"
      :pagination="false"
      table-layout="fixed"
      :row-key="(record: any) => record.id"
      :locale="{ emptyText: t('main.toolPalette.designReview.empty') }"
      :custom-row="customRow"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'summary'">
          <a-tooltip :title="record.text || record.comment || '—'" placement="topLeft">
            <span class="ml-design-review-ellipsis">{{ record.text || record.comment || '—' }}</span>
          </a-tooltip>
        </template>
      </template>
    </a-table>

    <div v-if="selected && detailsOpen" class="ml-design-review-detail">
      <div class="ml-design-review-detail-header">
        <div class="ml-design-review-detail-title">
          {{ t('main.toolPalette.designReview.details') }}
        </div>
        <a-button
          type="text"
          shape="circle"
          size="small"
          class="ml-design-review-detail-close"
          :title="t('main.toolPalette.designReview.closeDetails')"
          :aria-label="t('main.toolPalette.designReview.closeDetails')"
          @click="closeDetails"
        >
          <CloseOutlined />
        </a-button>
      </div>
      <a-form layout="vertical" size="small" class="ml-design-review-detail-form">
        <a-form-item :label="t('main.toolPalette.designReview.status')">
          <a-select
            :value="selected.status"
            @change="(v: string) => patchStatus(v)"
          >
            <a-select-option
              v-for="s in statuses"
              :key="s"
              :value="s"
            >
              {{ statusLabel(s) }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item :label="t('main.toolPalette.designReview.author')">
          <a-input :value="selected.author" disabled />
        </a-form-item>
        <a-form-item :label="t('main.toolPalette.designReview.label')">
          <a-input
            v-model:value="draftText"
            @blur="commitText"
            @keydown.enter="onLabelEnter"
          />
        </a-form-item>
        <a-form-item :label="t('main.toolPalette.designReview.comment')">
          <a-textarea
            v-model:value="draftComment"
            :rows="2"
            @blur="commitComment"
          />
        </a-form-item>
        <div class="ml-design-review-detail-actions">
          <a-button size="small" @click="focus(selected!)">
            {{ t('main.toolPalette.designReview.zoomTo') }}
          </a-button>
          <a-button size="small" danger @click="remove(selected!.id)">
            {{ t('main.toolPalette.designReview.delete') }}
          </a-button>
        </div>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'
import type { AcApMarkupStatus } from '@mlightcad/cad-simple-viewer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMarkup } from '../../composable/useMarkup'

const { t } = useI18n()
const search = ref('')
const draftText = ref('')
const draftComment = ref('')
const detailsOpen = ref(true)
const {
  markups,
  selectedId,
  statuses,
  select,
  focus,
  updateMeta,
  remove,
  clearAll
} = useMarkup()

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return markups.value
  return markups.value.filter(m => {
    const hay = `${m.type} ${m.status} ${m.author} ${m.text ?? ''} ${m.comment}`
    return hay.toLowerCase().includes(q)
  })
})

const tableColumns = [
  {
    title: () => t('main.toolPalette.designReview.type'),
    dataIndex: 'type',
    key: 'type',
    width: 88
  },
  {
    title: () => t('main.toolPalette.designReview.status'),
    dataIndex: 'status',
    key: 'status',
    width: 96
  },
  {
    title: () => t('main.toolPalette.designReview.author'),
    dataIndex: 'author',
    key: 'author',
    ellipsis: { showTitle: true }
  },
  {
    title: () => t('main.toolPalette.designReview.summary'),
    dataIndex: 'summary',
    key: 'summary',
    ellipsis: { showTitle: false }
  }
]

const customRow = (record: { id: string }) => ({
  onClick: () => handleRowClick(record)
})

const selected = computed(
  () => markups.value.find(m => m.id === selectedId.value) ?? null
)

watch(
  selectedId,
  (id, prevId) => {
    if (prevId && prevId !== id) {
      const prevRow = markups.value.find(m => m.id === prevId)
      if (prevRow) {
        if (draftText.value !== (prevRow.text ?? '')) {
          updateMeta(prevId, { text: draftText.value })
        }
        if (draftComment.value !== (prevRow.comment ?? '')) {
          updateMeta(prevId, { comment: draftComment.value })
        }
      }
    }
    const row = markups.value.find(m => m.id === id)
    draftText.value = row?.text ?? ''
    draftComment.value = row?.comment ?? ''
    if (id) detailsOpen.value = true
  },
  { immediate: true }
)

const handleRowClick = (row: { id: string }) => {
  detailsOpen.value = true
  select(row.id)
}

const closeDetails = () => {
  commitText()
  commitComment()
  detailsOpen.value = false
}

const commitText = () => {
  const id = selectedId.value
  if (!id) return
  const current = markups.value.find(m => m.id === id)
  const next = draftText.value
  const prev = current?.text ?? ''
  if (next === prev) return
  updateMeta(id, { text: next })
}

const commitComment = () => {
  const id = selectedId.value
  if (!id) return
  const current = markups.value.find(m => m.id === id)
  const next = draftComment.value
  const prev = current?.comment ?? ''
  if (next === prev) return
  updateMeta(id, { comment: next })
}

const onLabelEnter = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  commitText()
  ;(event.target as HTMLInputElement | null)?.blur()
}

const patchStatus = (value: string) => {
  if (!selected.value) return
  updateMeta(selected.value.id, { status: value as AcApMarkupStatus })
}

const statusLabel = (status: AcApMarkupStatus) => {
  switch (status) {
    case 'open':
      return t('main.toolPalette.designReview.statusValues.open')
    case 'question':
      return t('main.toolPalette.designReview.statusValues.question')
    case 'answered':
      return t('main.toolPalette.designReview.statusValues.answered')
    case 'closed':
      return t('main.toolPalette.designReview.statusValues.closed')
  }
}
</script>

<style scoped>
.ml-design-review {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
}

.ml-design-review-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ml-design-review-search {
  flex: 1;
}

.ml-design-review-table {
  flex: 1;
  min-height: 120px;
}

.ml-design-review-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-design-review-detail {
  border-top: 1px solid var(--ml-theme-border);
  padding-top: 6px;
  max-height: 46%;
  overflow: auto;
}

.ml-design-review-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 4px;
}

.ml-design-review-detail-title {
  font-weight: 600;
}

.ml-design-review-detail-close {
  flex-shrink: 0;
  margin-left: auto;
}

.ml-design-review-detail-form :deep(.ant-form-item) {
  margin-bottom: 4px;
}

.ml-design-review-detail-form :deep(.ant-form-item .ant-form-item-label) {
  margin-bottom: 2px;
  line-height: 1.2;
}

.ml-design-review-detail-form :deep(.ant-form-item .ant-form-item-label > label) {
  height: auto;
}

.ml-design-review-detail-form :deep(.ant-select),
.ml-design-review-detail-form :deep(.ant-input) {
  width: 100%;
}

.ml-design-review-detail-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>

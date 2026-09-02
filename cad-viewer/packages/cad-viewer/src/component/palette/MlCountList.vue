<template>
  <div class="ml-count-list">
    <div class="ml-count-list-toolbar">
      <div class="ml-count-list-search-row">
        <a-input
          v-model:value="search"
          allow-clear
          size="small"
          class="ml-count-list-search"
          :placeholder="t('main.toolPalette.countList.searchPlaceholder')"
        />
        <a-button
          size="small"
          :type="hasCountArea ? 'primary' : 'default'"
          :title="t('main.toolPalette.countList.countInArea')"
          :aria-label="t('main.toolPalette.countList.countInArea')"
          @click="handleCountArea"
        >
          <ScissorOutlined />
        </a-button>
      </div>
    </div>

    <a-table
      :columns="tableColumns"
      :data-source="groups"
      class="ml-count-list-table"
      size="small"
      :pagination="false"
      table-layout="fixed"
      :locale="{ emptyText: t('main.toolPalette.countList.empty') }"
      :custom-row="customRow"
    />
  </div>
</template>

<script setup lang="ts">
import { ScissorOutlined } from '@ant-design/icons-vue'
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcGeBox2d } from '@mlightcad/data-model'
import { message } from 'ant-design-vue'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  buildCountListGroups,
  collectCountListInstances,
  type MlCountListGroup,
  promptCountListArea,
  selectCountListInstances,
  zoomToCountListInstances
} from '../../composable/useCountList'
import { useDocument } from '../../composable/useDocument'

const { t } = useI18n()
const { fileName, docTitle } = useDocument()

const search = ref('')
const countArea = ref<AcGeBox2d | null>(null)
const hasCountArea = ref(false)
const groups = ref<MlCountListGroup[]>([])
let refreshTimer: ReturnType<typeof setTimeout> | null = null

const tableColumns = [
  {
    title: () => t('main.toolPalette.countList.blockName'),
    dataIndex: 'label',
    key: 'label',
    sorter: (a: MlCountListGroup, b: MlCountListGroup) =>
      a.label.localeCompare(b.label),
    ellipsis: { showTitle: true }
  },
  {
    title: () => t('main.toolPalette.countList.count'),
    dataIndex: 'count',
    key: 'count',
    width: 88,
    align: 'right' as const,
    sorter: (a: MlCountListGroup, b: MlCountListGroup) => a.count - b.count
  }
]

const customRow = (record: MlCountListGroup) => ({
  onClick: () => handleRowClick(record)
})

const refresh = () => {
  const instances = collectCountListInstances(
    hasCountArea.value ? countArea.value : null
  )
  groups.value = buildCountListGroups(instances, search.value)
}

const scheduleRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refresh()
    refreshTimer = null
  }, 50)
}

const handleRowClick = (row: MlCountListGroup) => {
  const ids = row.instances.map(item => item.id)
  selectCountListInstances(ids)
  zoomToCountListInstances(
    ids,
    row.instances.map(item => ({ x: item.position.x, y: item.position.y }))
  )
}

const handleCountArea = async () => {
  const area = await promptCountListArea(
    t('main.toolPalette.countList.prompt.firstCorner'),
    t('main.toolPalette.countList.prompt.secondCorner')
  )
  if (area === undefined) return

  if (area === null) {
    countArea.value = null
    hasCountArea.value = false
  } else {
    countArea.value = area
    hasCountArea.value = true
  }
  refresh()
  message.success(
    hasCountArea.value
      ? t('main.toolPalette.countList.areaSet')
      : t('main.toolPalette.countList.areaCleared')
  )
}

watch(search, () => {
  scheduleRefresh()
})

watch([fileName, docTitle], () => {
  hasCountArea.value = false
  countArea.value = null
  scheduleRefresh()
})

onMounted(() => {
  refresh()
  const events = AcApDocManager.instance.events
  events.documentActivated.addEventListener(scheduleRefresh)
})

onUnmounted(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  const events = AcApDocManager.instance.events
  events.documentActivated.removeEventListener(scheduleRefresh)
})
</script>

<style scoped>
.ml-count-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
}

.ml-count-list-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.ml-count-list-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ml-count-list-search {
  flex: 1;
  min-width: 0;
}

.ml-count-list-table {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.ml-count-list-table :deep(.ant-table-wrapper),
.ml-count-list-table :deep(.ant-spin-nested-loading),
.ml-count-list-table :deep(.ant-spin-container),
.ml-count-list-table :deep(.ant-table),
.ml-count-list-table :deep(.ant-table-container) {
  height: 100%;
}

.ml-count-list-table :deep(.ant-table-header .ant-table-cell) {
  white-space: nowrap;
  line-height: 1.2;
}

/* Keep Count column visible; Block absorbs width reduction. */
.ml-count-list-table :deep(.ant-table-body .ant-table-cell:first-child) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

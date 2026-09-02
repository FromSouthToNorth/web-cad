<template>
  <div class="ml-memory-profile">
    <div class="ml-memory-profile-toolbar">
      <div class="ml-memory-profile-meta">
        <span v-if="collectedAtLabel">
          {{ t('main.toolPalette.memoryProfile.collectedAt', { time: collectedAtLabel }) }}
        </span>
        <span v-if="snapshot?.heap" class="ml-memory-profile-heap">
          {{
            t('main.toolPalette.memoryProfile.heapUsed', {
              used: formatMemoryBytes(snapshot.heap.usedJSHeapSize),
              total: formatMemoryBytes(snapshot.heap.totalJSHeapSize)
            })
          }}
        </span>
      </div>
      <div class="ml-memory-profile-actions">
        <a-tooltip
          :title="t('main.toolPalette.memoryProfile.estimateNote')"
          placement="bottomRight"
        >
          <InfoCircleFilled
            class="ml-memory-profile-info"
            :aria-label="t('main.toolPalette.memoryProfile.estimateNote')"
          />
        </a-tooltip>
        <a-tooltip
          :title="
            showPie
              ? t('main.toolPalette.memoryProfile.hidePie')
              : t('main.toolPalette.memoryProfile.showPie')
          "
          placement="bottomRight"
        >
          <a-button
            size="small"
            :type="showPie ? 'primary' : 'default'"
            :aria-label="
              showPie
                ? t('main.toolPalette.memoryProfile.hidePie')
                : t('main.toolPalette.memoryProfile.showPie')
            "
            @click="showPie = !showPie"
          >
            <PieChartOutlined />
          </a-button>
        </a-tooltip>
        <a-button
          size="small"
          type="primary"
          :loading="loading"
          @click="refresh"
        >
          {{ t('main.toolPalette.memoryProfile.refresh') }}
        </a-button>
      </div>
    </div>

    <a-alert
      v-if="error"
      type="error"
      :message="error"
      show-icon
      :closable="false"
      class="ml-memory-profile-alert"
    />

    <div
      v-if="showPie && pieSlices.length > 0"
      class="ml-memory-profile-summary"
    >
      <div class="ml-memory-profile-pie">
        <svg
          class="ml-memory-profile-pie-chart"
          viewBox="0 0 100 100"
          role="img"
          :aria-label="t('main.toolPalette.memoryProfile.pieAriaLabel')"
        >
          <circle
            class="ml-memory-profile-pie-track"
            cx="50"
            cy="50"
            :r="PIE_RADIUS"
            fill="none"
            :stroke-width="PIE_STROKE"
          />
          <circle
            v-for="slice in pieSlices"
            :key="slice.id"
            class="ml-memory-profile-pie-slice"
            cx="50"
            cy="50"
            :r="PIE_RADIUS"
            fill="none"
            :stroke="slice.color"
            :stroke-width="PIE_STROKE"
            :stroke-dasharray="slice.dashArray"
            :stroke-dashoffset="slice.dashOffset"
            transform="rotate(-90 50 50)"
          >
            <title>
              {{ slice.label }}: {{ formatMemoryBytes(slice.bytes) }} ({{
                slice.percentLabel
              }})
            </title>
          </circle>
          <text
            class="ml-memory-profile-pie-center-value"
            x="50"
            y="48"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ formatMemoryBytes(pieTotalBytes) }}
          </text>
          <text
            class="ml-memory-profile-pie-center-label"
            x="50"
            y="60"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ t('main.toolPalette.memoryProfile.pieTotal') }}
          </text>
        </svg>

        <ul class="ml-memory-profile-pie-legend">
          <li
            v-for="slice in pieSlices"
            :key="slice.id"
            class="ml-memory-profile-pie-legend-item"
          >
            <span
              class="ml-memory-profile-pie-swatch"
              :style="{ background: slice.color }"
            />
            <span class="ml-memory-profile-pie-legend-text">
              <span class="ml-memory-profile-pie-legend-name">
                {{ slice.label }}
                <span v-if="slice.isEstimated" class="ml-est">
                  {{ t('main.toolPalette.memoryProfile.estimated') }}
                </span>
              </span>
              <span
                v-if="slice.detail"
                class="ml-memory-profile-pie-legend-detail"
              >
                {{ slice.detail }}
              </span>
            </span>
            <span class="ml-memory-profile-pie-legend-bytes">
              {{ formatMemoryBytes(slice.bytes) }}
              <span class="ml-memory-profile-pie-legend-pct">
                {{ slice.percentLabel }}
              </span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <ml-overflow-tabs
      v-model="activeTab"
      :tabs="detailTabs"
      :more-tabs-label="t('main.toolPalette.moreTabs')"
      class="ml-memory-profile-tabs"
    >
      <div
        v-if="activeTab === 'geometry'"
        class="ml-memory-profile-pane"
      >
        <a-table
          :data-source="snapshot?.geometry.layers ?? []"
          :columns="geometryColumns"
          size="small"
          :pagination="false"
          class="ml-memory-profile-table"
          :locale="{ emptyText: t('main.toolPalette.memoryProfile.empty') }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'geometryBytes'">
              {{ formatMemoryBytes(record.geometryBytes) }}
            </template>
            <template v-else-if="column.dataIndex === 'mappingBytes'">
              {{ formatMemoryBytes(record.mappingBytes) }}
            </template>
          </template>
        </a-table>
      </div>

      <div
        v-else-if="activeTab === 'spatial'"
        class="ml-memory-profile-pane"
      >
        <a-table
          :data-source="snapshot?.spatial.layouts ?? []"
          :columns="spatialColumns"
          size="small"
          :pagination="false"
          class="ml-memory-profile-table"
          :locale="{ emptyText: t('main.toolPalette.memoryProfile.empty') }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'rootItems'">
              {{ record.stats.rootItemCount ?? record.stats.itemCount }}
            </template>
            <template v-else-if="column.dataIndex === 'childItems'">
              {{ record.stats.childItemCount ?? 0 }}
            </template>
            <template v-else-if="column.dataIndex === 'estimatedBytes'">
              {{ formatMemoryBytes(record.stats.estimatedBytes) }}
            </template>
          </template>
        </a-table>
      </div>

      <div
        v-else-if="activeTab === 'dataModel'"
        class="ml-memory-profile-pane ml-memory-profile-pane-data-model"
      >
        <div class="ml-memory-profile-dm-section">
          <button
            type="button"
            class="ml-memory-profile-dm-section-title"
            @click="dmCategoriesExpanded = !dmCategoriesExpanded"
          >
            <RightOutlined
              class="ml-memory-profile-dm-caret"
              :class="{ 'is-expanded': dmCategoriesExpanded }"
            />
            {{ t('main.toolPalette.memoryProfile.dataModelCategories') }}
          </button>
          <a-table
            v-show="dmCategoriesExpanded"
            :data-source="snapshot?.dataModel.categories ?? []"
            :columns="dmCategoryColumns"
            size="small"
            :pagination="false"
            class="ml-memory-profile-table ml-memory-profile-table-compact"
            :scroll="{ y: 160 }"
            :locale="{ emptyText: t('main.toolPalette.memoryProfile.empty') }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'estimatedBytes'">
                {{ formatMemoryBytes(record.estimatedBytes) }}
              </template>
            </template>
          </a-table>
        </div>
        <div
          class="ml-memory-profile-dm-section"
          :class="{ 'ml-memory-profile-dm-section-grow': dmEntityTypesExpanded }"
        >
          <button
            type="button"
            class="ml-memory-profile-dm-section-title"
            @click="dmEntityTypesExpanded = !dmEntityTypesExpanded"
          >
            <RightOutlined
              class="ml-memory-profile-dm-caret"
              :class="{ 'is-expanded': dmEntityTypesExpanded }"
            />
            {{ t('main.toolPalette.memoryProfile.dataModelEntityTypes') }}
          </button>
          <a-table
            v-show="dmEntityTypesExpanded"
            :data-source="snapshot?.dataModel.entitiesByType ?? []"
            :columns="dmEntityTypeColumns"
            size="small"
            :pagination="false"
            class="ml-memory-profile-table"
            :locale="{ emptyText: t('main.toolPalette.memoryProfile.empty') }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'estimatedBytes'">
                {{ formatMemoryBytes(record.estimatedBytes) }}
              </template>
            </template>
          </a-table>
        </div>
      </div>

      <div
        v-else-if="activeTab === 'materials'"
        class="ml-memory-profile-pane"
      >
        <a-table
          :data-source="materialRows"
          :columns="materialColumns"
          size="small"
          :pagination="false"
          class="ml-memory-profile-table"
          :locale="{ emptyText: t('main.toolPalette.memoryProfile.empty') }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'estimatedBytes'">
              {{ formatMemoryBytes(record.estimatedBytes) }}
            </template>
          </template>
        </a-table>
      </div>

      <div
        v-else-if="activeTab === 'fonts'"
        class="ml-memory-profile-pane"
      >
        <div class="ml-memory-profile-fonts" v-if="snapshot">
          <div class="ml-memory-profile-fonts-meta">
            {{
              t('main.toolPalette.memoryProfile.fontMemorySummary', {
                live: formatMemoryBytes(snapshot.fonts.estimatedBytes),
                main: formatMemoryBytes(snapshot.fonts.mainThreadBytes),
                workers: formatMemoryBytes(snapshot.fonts.workerBytes)
              })
            }}
          </div>
          <a-table
            :data-source="snapshot.fonts.fonts"
            :columns="fontColumns"
            size="small"
            :pagination="false"
            class="ml-memory-profile-table"
            :locale="{ emptyText: t('main.toolPalette.memoryProfile.empty') }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'estimatedBytes'">
                {{ formatMemoryBytes(record.estimatedBytes) }}
              </template>
            </template>
          </a-table>
          <div
            v-if="snapshot.fonts.missedNames.length > 0"
            class="ml-memory-profile-fonts-missed"
          >
            <div class="ml-memory-profile-fonts-title">
              {{ t('main.toolPalette.memoryProfile.missedFonts') }}
            </div>
            <div class="ml-memory-profile-fonts-list">
              {{ snapshot.fonts.missedNames.join(', ') }}
            </div>
          </div>
          <div
            v-if="snapshot.fonts.indexedDbFontCount > 0"
            class="ml-memory-profile-fonts-storage"
          >
            <div class="ml-memory-profile-fonts-title">
              {{ t('main.toolPalette.memoryProfile.fontStorage') }}
            </div>
            <div class="ml-memory-profile-fonts-meta">
              {{
                t('main.toolPalette.memoryProfile.fontStorageSummary', {
                  count: snapshot.fonts.indexedDbFontCount,
                  size: formatMemoryBytes(snapshot.fonts.indexedDbBytes)
                })
              }}
            </div>
          </div>
        </div>
      </div>
    </ml-overflow-tabs>
  </div>
</template>

<script setup lang="ts">
import {
  InfoCircleFilled,
  PieChartOutlined,
  RightOutlined
} from '@ant-design/icons-vue'
import {
  type MlOverflowTab,
  MlOverflowTabs
} from '@mlightcad/ui-components'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { store } from '../../app'
import {
  formatMemoryBytes,
  useMemoryProfile
} from '../../composable/useMemoryProfile'

const { t } = useI18n()
const {
  snapshot,
  loading,
  error,
  collectedAtLabel,
  summaryRows,
  fileName,
  docTitle,
  refresh,
  adoptPublishedSnapshot,
  hydrateOrRefresh
} = useMemoryProfile()

const activeTab = ref('geometry')
const showPie = ref(true)
const dmCategoriesExpanded = ref(true)
const dmEntityTypesExpanded = ref(true)

const detailTabs = computed<MlOverflowTab[]>(() => [
  {
    name: 'geometry',
    label: t('main.toolPalette.memoryProfile.tabs.geometry')
  },
  {
    name: 'spatial',
    label: t('main.toolPalette.memoryProfile.tabs.spatial')
  },
  {
    name: 'dataModel',
    label: t('main.toolPalette.memoryProfile.tabs.dataModel')
  },
  {
    name: 'materials',
    label: t('main.toolPalette.memoryProfile.tabs.materials')
  },
  {
    name: 'fonts',
    label: t('main.toolPalette.memoryProfile.tabs.fonts')
  }
])

const geometryColumns = [
  { title: t('main.toolPalette.memoryProfile.columns.layout'), dataIndex: 'layoutKey', width: 90, ellipsis: true },
  { title: t('main.toolPalette.memoryProfile.columns.layer'), dataIndex: 'layerName', width: 80, ellipsis: true },
  { title: t('main.toolPalette.memoryProfile.columns.geometry'), dataIndex: 'geometryBytes', width: 88, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.mapping'), dataIndex: 'mappingBytes', width: 88, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.entities'), dataIndex: 'entityCount', width: 72, align: 'right' as const }
]

const spatialColumns = [
  { title: t('main.toolPalette.memoryProfile.columns.layout'), dataIndex: 'layoutKey', width: 100, ellipsis: true },
  { title: t('main.toolPalette.memoryProfile.columns.rootItems'), dataIndex: 'rootItems', width: 80, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.childItems'), dataIndex: 'childItems', width: 88, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.estimated'), dataIndex: 'estimatedBytes', width: 96, align: 'right' as const }
]

const dmCategoryColumns = [
  { title: t('main.toolPalette.memoryProfile.columns.category'), dataIndex: 'name', width: 100, ellipsis: true },
  { title: t('main.toolPalette.memoryProfile.columns.count'), dataIndex: 'count', width: 72, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.estimated'), dataIndex: 'estimatedBytes', width: 96, align: 'right' as const }
]

const dmEntityTypeColumns = [
  { title: t('main.toolPalette.memoryProfile.columns.type'), dataIndex: 'name', width: 100, ellipsis: true },
  { title: t('main.toolPalette.memoryProfile.columns.count'), dataIndex: 'count', width: 72, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.estimated'), dataIndex: 'estimatedBytes', width: 96, align: 'right' as const }
]

const materialColumns = [
  { title: t('main.toolPalette.memoryProfile.columns.category'), dataIndex: 'name', width: 80 },
  { title: t('main.toolPalette.memoryProfile.columns.count'), dataIndex: 'count', width: 72, align: 'right' as const },
  { title: t('main.toolPalette.memoryProfile.columns.estimated'), dataIndex: 'estimatedBytes', width: 96, align: 'right' as const }
]

const fontColumns = [
  { title: t('main.toolPalette.memoryProfile.columns.font'), dataIndex: 'name', width: 100, ellipsis: true },
  { title: t('main.toolPalette.memoryProfile.columns.type'), dataIndex: 'type', width: 64 },
  { title: t('main.toolPalette.memoryProfile.columns.estimated'), dataIndex: 'estimatedBytes', width: 96, align: 'right' as const }
]

/** Donut geometry in viewBox units. */
const PIE_RADIUS = 34
const PIE_STROKE = 14
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_RADIUS

const PIE_COLORS: Record<string, string> = {
  geometry: 'var(--ml-theme-primary)',
  mapping: 'var(--ml-theme-primary)',
  spatial: '#f59e0b',
  dataModel: '#ef4444',
  materials: '#06b6d4',
  fonts: '#b37feb'
}

interface PieSlice {
  id: string
  label: string
  detail?: string
  bytes: number
  isEstimated: boolean
  color: string
  dashArray: string
  dashOffset: number
  percentLabel: string
}

const pieSlices = computed((): PieSlice[] => {
  const rows = summaryRows.value.filter(
    row => row.id !== 'heap' && row.bytes > 0
  )
  const total = rows.reduce((sum, row) => sum + row.bytes, 0)
  if (total <= 0) return []

  let offset = 0
  return rows.map(row => {
    const length = (row.bytes / total) * PIE_CIRCUMFERENCE
    const slice: PieSlice = {
      id: row.id,
      label: categoryLabel(row.id),
      detail: row.detail,
      bytes: row.bytes,
      isEstimated: row.isEstimated,
      color: PIE_COLORS[row.id] ?? 'var(--ml-theme-text-secondary)',
      dashArray: `${length} ${PIE_CIRCUMFERENCE}`,
      dashOffset: -offset,
      percentLabel: `${((row.bytes / total) * 100).toFixed(1)}%`
    }
    offset += length
    return slice
  })
})

const pieTotalBytes = computed(() =>
  pieSlices.value.reduce((sum, slice) => sum + slice.bytes, 0)
)

const materialRows = computed(() => {
  const materials = snapshot.value?.materials
  if (!materials) return []
  return [
    {
      name: t('main.toolPalette.memoryProfile.materialPoint'),
      count: materials.point.count,
      estimatedBytes: materials.point.estimatedBytes
    },
    {
      name: t('main.toolPalette.memoryProfile.materialLine'),
      count: materials.line.count,
      estimatedBytes: materials.line.estimatedBytes
    },
    {
      name: t('main.toolPalette.memoryProfile.materialFill'),
      count: materials.fill.count,
      estimatedBytes: materials.fill.estimatedBytes
    },
    {
      name: t('main.toolPalette.memoryProfile.materialTotal'),
      count: materials.totalCount,
      estimatedBytes: materials.totalEstimatedBytes
    }
  ]
})

const categoryLabel = (id: string) => {
  switch (id) {
    case 'heap':
      return t('main.toolPalette.memoryProfile.categories.heap')
    case 'geometry':
      return t('main.toolPalette.memoryProfile.categories.geometry')
    case 'mapping':
      return t('main.toolPalette.memoryProfile.categories.mapping')
    case 'spatial':
      return t('main.toolPalette.memoryProfile.categories.spatial')
    case 'dataModel':
      return t('main.toolPalette.memoryProfile.categories.dataModel')
    case 'materials':
      return t('main.toolPalette.memoryProfile.categories.materials')
    case 'fonts':
      return t('main.toolPalette.memoryProfile.categories.fonts')
    default:
      return id
  }
}

watch([fileName, docTitle], () => {
  void refresh()
})

watch(
  () => store.memoryProfileTick,
  () => {
    // MEM already collected under the busy overlay; only adopt the pending
    // snapshot so we do not kick off a second collect.
    adoptPublishedSnapshot()
  }
)

onMounted(() => {
  void hydrateOrRefresh()
})
</script>

<style scoped>
.ml-memory-profile {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  gap: 8px;
  padding: 8px;
  box-sizing: border-box;
}

.ml-memory-profile-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.ml-memory-profile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  opacity: 0.85;
  min-width: 0;
}

.ml-memory-profile-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ml-memory-profile-info {
  color: #06b6d4;
  cursor: help;
  font-size: 16px;
}

.ml-memory-profile-alert {
  flex-shrink: 0;
}

.ml-memory-profile-summary {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  max-height: 42%;
  overflow: auto;
}

.ml-memory-profile-pie {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ml-memory-profile-pie-chart {
  width: 132px;
  height: 132px;
  flex-shrink: 0;
}

.ml-memory-profile-pie-track {
  stroke: var(--ml-theme-bg-subtle);
}

.ml-memory-profile-pie-slice {
  stroke-linecap: butt;
}

.ml-memory-profile-pie-center-value {
  fill: var(--ml-theme-text-heading);
  font-size: 9px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ml-memory-profile-pie-center-label {
  fill: var(--ml-theme-text-secondary);
  font-size: 6px;
}

.ml-memory-profile-pie-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.ml-memory-profile-pie-legend-item {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  gap: 6px;
  align-items: start;
  font-size: 12px;
}

.ml-memory-profile-pie-legend-meta {
  opacity: 0.8;
  margin-top: 2px;
}

.ml-memory-profile-pie-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-top: 3px;
  flex-shrink: 0;
}

.ml-memory-profile-pie-swatch.is-empty {
  background: transparent;
  border: 1px solid var(--ml-theme-border);
}

.ml-memory-profile-pie-legend-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ml-memory-profile-pie-legend-name {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
}

.ml-memory-profile-pie-legend-detail {
  font-size: 11px;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-memory-profile-pie-legend-bytes {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.2;
}

.ml-memory-profile-pie-legend-pct {
  display: block;
  font-size: 11px;
  opacity: 0.7;
}

.ml-est {
  font-size: 10px;
  opacity: 0.7;
}

.ml-memory-profile-tabs {
  flex: 1;
  min-height: 0;
}

.ml-memory-profile-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.ml-memory-profile-pane-data-model {
  overflow: hidden;
}

.ml-memory-profile-table {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.ml-memory-profile-table :deep(.ant-table-wrapper) {
  height: 100%;
}

.ml-memory-profile-dm-meta {
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.ml-memory-profile-dm-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.ml-memory-profile-dm-section-grow {
  flex: 1;
  margin-bottom: 0;
}

.ml-memory-profile-dm-section-title {
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

.ml-memory-profile-dm-section-title:hover {
  color: var(--ml-theme-primary);
}

.ml-memory-profile-dm-caret {
  transition: transform 0.15s ease;
  font-size: 12px;
}

.ml-memory-profile-dm-caret.is-expanded {
  transform: rotate(90deg);
}

.ml-memory-profile-table-compact {
  flex: 0 0 auto;
}

.ml-memory-profile-fonts {
  font-size: 12px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ml-memory-profile-fonts-title {
  font-weight: 600;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.ml-memory-profile-fonts-meta {
  font-size: 11px;
  opacity: 0.85;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.ml-memory-profile-fonts-missed {
  margin-top: 8px;
  flex-shrink: 0;
}

.ml-memory-profile-fonts-storage {
  margin-top: 8px;
  flex-shrink: 0;
  opacity: 0.85;
}

.ml-memory-profile-fonts-list {
  word-break: break-all;
  opacity: 0.85;
}
</style>

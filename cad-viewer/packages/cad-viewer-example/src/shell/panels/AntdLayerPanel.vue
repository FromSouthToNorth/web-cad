<template>
  <div class="antd-layer-panel">
    <div class="antd-layer-panel-toolbar">
      <a-input
        v-model:value="searchText"
        size="small"
        allow-clear
        :placeholder="t('shell.layerPanel.searchPlaceholder')"
      >
        <template #prefix><SearchOutlined /></template>
      </a-input>
      <a-tooltip :title="t('shell.layerPanel.newLayer')" placement="bottom">
        <a-button
          size="small"
          type="text"
          aria-label="New layer"
          @click="openNewLayerDialog"
        >
          <template #icon><PlusOutlined /></template>
        </a-button>
      </a-tooltip>
      <a-popconfirm
        :title="t('shell.layerPanel.deleteConfirm', { name: selectedLayerName ?? '' })"
        placement="bottom"
        @confirm="deleteSelectedLayer"
      >
        <a-tooltip :title="t('shell.layerPanel.deleteLayer')" placement="bottom">
          <a-button
            size="small"
            type="text"
            :disabled="!selectedLayer"
            aria-label="Delete layer"
          >
            <template #icon><DeleteOutlined /></template>
          </a-button>
        </a-tooltip>
      </a-popconfirm>
      <a-tooltip :title="t('shell.layerPanel.setCurrent')" placement="bottom">
        <a-button
          size="small"
          type="text"
          :disabled="!selectedLayer"
          aria-label="Set current layer"
          @click="handleSetCurrent"
        >
          <template #icon><AimOutlined /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip :title="t('shell.layerPanel.allOn')" placement="bottom">
        <a-button
          size="small"
          type="text"
          aria-label="Turn all layers on"
          @click="setAllLayersOn"
        >
          <template #icon><BulbOutlined /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip :title="t('shell.layerPanel.isolate')" placement="bottom">
        <a-button
          size="small"
          type="text"
          :disabled="!selectedLayer"
          aria-label="Isolate layer"
          @click="handleIsolate"
        >
          <template #icon><EyeOutlined /></template>
        </a-button>
      </a-tooltip>
    </div>

    <div class="antd-layer-panel-current">
      {{ t('shell.layerPanel.currentLayer', { name: currentLayerName || '—' }) }}
    </div>

    <div ref="wrapRef" class="antd-layer-table-wrap">
      <a-table
        size="small"
        class="antd-layer-table"
        :data-source="displayedLayers"
        :columns="columns"
        :pagination="false"
        :scroll="{ y: scrollY }"
        :row-key="(record: LayerInfo) => record.name"
        :row-class-name="layerRowClassName"
        :custom-row="layerRowEvents"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'on'">
            <a-switch
              size="small"
              :checked="record.isOn"
              :aria-label="`${record.name} on`"
              @change="(checked: boolean) => setLayerOn(record.name, checked)"
            />
          </template>
          <template v-else-if="column.key === 'frozen'">
            <a-switch
              size="small"
              :checked="record.isFrozen"
              :aria-label="`${record.name} frozen`"
              @change="(checked: boolean) => setLayerFrozen(record.name, checked)"
            />
          </template>
          <template v-else-if="column.key === 'locked'">
            <a-switch
              size="small"
              :checked="record.isLocked"
              :aria-label="`${record.name} locked`"
              @change="(checked: boolean) => setLayerLocked(record.name, checked)"
            />
          </template>
          <template v-else-if="column.key === 'name'">
            <span class="antd-layer-name">
              <span
                class="antd-layer-color"
                :style="{ backgroundColor: record.cssColor }"
                aria-hidden="true"
              />
              {{ record.name }}
            </span>
          </template>
          <template v-else-if="column.key === 'color'">
            <a-popover
              trigger="click"
              placement="left"
              @open-change="(open: boolean) => onColorPopoverOpen(open, record)"
            >
              <template #content>
                <div class="antd-layer-color-picker">
                  <input
                    type="color"
                    class="antd-layer-native-color"
                    :value="hexFromCss(record.cssColor)"
                    @input="onNativeColorChange(record, $event)"
                  />
                </div>
              </template>
              <button
                type="button"
                class="antd-layer-color-swatch"
                :style="{ backgroundColor: record.cssColor }"
                :aria-label="`${record.name} color`"
              />
            </a-popover>
          </template>
          <template v-else-if="column.key === 'linetype'">
            <span class="antd-layer-linetype">{{ record.linetype }}</span>
          </template>
        </template>
        <template #emptyText>
          <a-empty
            :description="t('shell.layerPanel.noLayers')"
            :image-style="{ height: '48px' }"
          />
        </template>
      </a-table>
    </div>

    <a-modal
      v-model:open="newLayerDialogOpen"
      :title="t('shell.layerPanel.newLayer')"
      :ok-text="t('shell.layerPanel.confirm')"
      :cancel-text="t('shell.layerPanel.cancel')"
      @ok="commitNewLayer"
    >
      <a-input
        v-model:value="newLayerName"
        :placeholder="t('shell.layerPanel.newLayerPlaceholder')"
        @press-enter="commitNewLayer"
      />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import {
  AimOutlined,
  BulbOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined
} from '@ant-design/icons-vue'
import { App as AntdApp } from 'ant-design-vue'
import { AcApDocManager, AcApLayerService } from '@mlightcad/cad-simple-viewer'
import { AcCmColor, AcCmColorMethod } from '@mlightcad/data-model'
import {
  type LayerInfo,
  useLayers
} from '@mlightcad/cad-viewer'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { message } = AntdApp.useApp()

const editor = AcApDocManager.instance

const {
  layers,
  currentLayerName,
  setLayerOn,
  setLayerFrozen,
  setLayerLocked,
  setAllLayersOn,
  setCurrentLayer,
  isolateLayer,
  setLayerColor
} = useLayers(editor)

const columns = computed(() => [
  { title: t('shell.layerPanel.colOn'), key: 'on', width: 36 },
  { title: t('shell.layerPanel.colFrozen'), key: 'frozen', width: 36 },
  { title: t('shell.layerPanel.colLocked'), key: 'locked', width: 36 },
  { title: t('shell.layerPanel.colName'), key: 'name', ellipsis: true },
  { title: t('shell.layerPanel.colColor'), key: 'color', width: 34 },
  { title: t('shell.layerPanel.colLinetype'), key: 'linetype', width: 84 }
])

const searchText = ref('')
const selectedLayerName = ref<string | null>(null)
const newLayerDialogOpen = ref(false)
const newLayerName = ref('')

const displayedLayers = computed<LayerInfo[]>(() => {
  const query = searchText.value.trim().toLowerCase()
  if (!query) return [...layers]
  return layers.filter(layer => layer.name.toLowerCase().includes(query))
})

// ── table scroll height ─────────────────────────────────────────────
// The layer table fills the remaining panel height. scroll.y is measured
// from the wrapper instead of a `calc(100vh - …)` magic number, so it
// stays correct when the ribbon collapses or the sider is resized.

const wrapRef = ref<HTMLElement>()
const scrollY = ref(240)

function measureScrollY() {
  const wrap = wrapRef.value
  if (!wrap) return
  const header =
    wrap.querySelector<HTMLElement>('.ant-table-header') ??
    wrap.querySelector<HTMLElement>('.ant-table-thead')
  const headerHeight = header?.offsetHeight ?? 0
  const next = wrap.clientHeight - headerHeight
  if (next > 0) scrollY.value = next
}

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  measureScrollY()
  resizeObserver = new ResizeObserver(measureScrollY)
  if (wrapRef.value) resizeObserver.observe(wrapRef.value)
})

onUnmounted(() => resizeObserver?.disconnect())

// The split header/body layout only exists once the first rows render.
watch(displayedLayers, () => nextTick(measureScrollY))

const selectedLayer = computed<LayerInfo | null>(
  () =>
    displayedLayers.value.find(layer => layer.name === selectedLayerName.value) ??
    null
)

const layerRowClassName = ({ name }: LayerInfo) =>
  name === currentLayerName.value ? 'antd-layer-row-current' : ''

const layerRowEvents = (record: LayerInfo) => ({
  onClick: () => {
    selectedLayerName.value = record.name
  },
  onDblclick: () => {
    const ok = editor.curView.zoomToFitLayer(record.name)
    if (ok) {
      message.success(
        t('shell.layerPanel.zoomToLayer', { name: record.name })
      )
    }
  }
})

const suggestNewLayerName = () => {
  const existing = new Set(layers.map(layer => layer.name.toLowerCase()))
  let index = 1
  while (existing.has(`layer${index}`)) {
    index++
  }
  return `Layer${index}`
}

const openNewLayerDialog = () => {
  if (!editor.curDocument?.database) {
    message.error(t('shell.layerPanel.createFailed'))
    return
  }
  newLayerName.value = suggestNewLayerName()
  newLayerDialogOpen.value = true
}

const commitNewLayer = () => {
  const name = newLayerName.value.trim()
  const db = editor.curDocument?.database
  if (!name) {
    newLayerDialogOpen.value = false
    return
  }
  if (!db) {
    newLayerDialogOpen.value = false
    message.error(t('shell.layerPanel.createFailed'))
    return
  }
  const result = new AcApLayerService(db).createLayers([name])
  newLayerDialogOpen.value = false
  if (result.existed.includes(name)) {
    message.warning(t('shell.layerPanel.layerExists', { name }))
    return
  }
  if (result.created <= 0) {
    message.error(t('shell.layerPanel.createFailed'))
    return
  }
  selectedLayerName.value = name
  message.success(t('shell.layerPanel.layerCreated', { name }))
}

const deleteSelectedLayer = () => {
  const layer = selectedLayer.value
  const db = editor.curDocument?.database
  if (!layer || !db) {
    message.warning(t('shell.layerPanel.selectLayerFirst'))
    return
  }
  const result = new AcApLayerService(db).deleteLayer(layer.name)
  if (!result.ok) {
    let text = t('shell.layerPanel.deleteFailed', { name: layer.name })
    if (result.reason === 'layer_0') {
      text = t('shell.layerPanel.cannotDeleteLayer0')
    } else if (result.reason === 'current_layer') {
      text = t('shell.layerPanel.cannotDeleteCurrent')
    }
    message.warning(text)
    return
  }
  selectedLayerName.value = null
  message.success(t('shell.layerPanel.layerDeleted', { name: layer.name }))
}

const handleSetCurrent = () => {
  const layerName = selectedLayerName.value
  if (!layerName) {
    message.warning(t('shell.layerPanel.selectLayerFirst'))
    return
  }
  const ok = setCurrentLayer(layerName)
  if (ok) {
    message.success(t('shell.layerPanel.setCurrentSuccess', { name: layerName }))
  } else {
    message.error(t('shell.layerPanel.setCurrentFailed', { name: layerName }))
  }
}

const handleIsolate = () => {
  const layerName = selectedLayerName.value
  if (!layerName) {
    message.warning(t('shell.layerPanel.selectLayerFirst'))
    return
  }
  isolateLayer(layerName)
}

const hexFromCss = (css: string): string => {
  const normalized = css.startsWith('#') ? css : `#${css}`
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '#ffffff'
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const normalized = hex.replace('#', '')
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map(char => char + char)
          .join('')
      : normalized
  const value = Number.parseInt(expanded, 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

const onNativeColorChange = (record: LayerInfo, event: Event) => {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const rgb = hexToRgb(input.value)
  const colorValue = new AcCmColor(AcCmColorMethod.ByColor)
  colorValue.setRGB(rgb.r, rgb.g, rgb.b)
  setLayerColor(record.name, colorValue)
}

const onColorPopoverOpen = (open: boolean, record: LayerInfo) => {
  if (open) {
    selectedLayerName.value = record.name
  }
}
</script>

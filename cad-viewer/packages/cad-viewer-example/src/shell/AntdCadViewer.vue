<template>
  <a-config-provider
    :locale="antdLocale"
    :theme="antdThemeConfig"
    class="antd-cad-provider"
  >
    <a-app>
      <div class="antd-cad-shell" :class="themeClass">
        <!-- Plain div hosts the engine busy indicator (a component ref would
             hand AcApProgress a Vue instance instead of a DOM element). -->
        <div ref="layoutRef" class="antd-cad-layout-host">
          <a-layout class="antd-cad-layout">
            <a-layout-header class="antd-cad-header">
              <AntdRibbon :disabled="!editorReady" />
            </a-layout-header>
  
            <a-layout class="antd-cad-body">
              <div class="antd-cad-sider-wrapper antd-cad-sider-wrapper-left">
                <a-layout-sider
                  :collapsed="leftCollapsed"
                  :collapsed-width="0"
                  :width="leftWidth"
                  :trigger="null"
                  :zero-width-trigger-style="{ display: 'none' }"
                  class="antd-cad-sider antd-cad-sider-left"
                >
                <template v-if="editorReady">
                  <a-tabs
                    v-model:active-key="leftActiveTab"
                    size="small"
                    class="antd-cad-panel-tabs"
                    @change="onLeftTabChange"
                  >
                    <a-tab-pane key="layers" :tab="t('shell.panels.layers')" />
                    <a-tab-pane key="blocks" :tab="t('shell.panels.blocks')" />
                    <a-tab-pane
                      v-if="store.features.searchPlugin"
                      key="search"
                      :tab="t('shell.panels.search')"
                    />
                    <a-tab-pane
                      v-if="store.features.agentPlugin"
                      key="agent"
                      :tab="t('shell.panels.agent')"
                    />
                    <template #rightExtra>
                      <a-button
                        type="text"
                        size="small"
                        aria-label="Close panel"
                        @click="closeLeftPanel"
                      >
                        <template #icon><CloseOutlined /></template>
                      </a-button>
                    </template>
                  </a-tabs>
                  <div class="antd-cad-panel-body">
                    <AntdLayerPanel v-if="leftActiveTab === 'layers'" />
                    <AntdBlocksPanel v-else-if="leftActiveTab === 'blocks'" />
                    <SearchPanel
                      v-else-if="leftActiveTab === 'search' && store.features.searchPlugin"
                    />
                    <AgentChatPanel
                      v-else-if="leftActiveTab === 'agent' && store.features.agentPlugin"
                      @close="closeAgentPanel"
                    />
                  </div>
                </template>
              </a-layout-sider>
              <div
                v-if="!leftCollapsed"
                class="antd-cad-sider-resizer antd-cad-sider-resizer-left"
                @mousedown="onResizerMouseDown($event, 'left')"
              ></div>
              </div>

              <a-layout-content class="antd-cad-content">
                <div
                  ref="containerRef"
                  :class="themeClass"
                  class="ml-cad-container antd-cad-canvas-host"
                ></div>
                <MlDialogManager v-if="editorReady" />
                <MlFontFileReader v-if="editorReady" />
              </a-layout-content>
  
              <div class="antd-cad-sider-wrapper antd-cad-sider-wrapper-right">
                <div
                  v-if="!rightCollapsed"
                  class="antd-cad-sider-resizer antd-cad-sider-resizer-right"
                  @mousedown="onResizerMouseDown($event, 'right')"
                ></div>
                <a-layout-sider
                  :collapsed="rightCollapsed"
                  :collapsed-width="0"
                  :width="rightWidth"
                  :trigger="null"
                  :zero-width-trigger-style="{ display: 'none' }"
                  class="antd-cad-sider antd-cad-sider-right"
                >
                  <template v-if="editorReady">
                    <div class="antd-cad-panel-header">
                      <span>{{ t('shell.panels.properties') }}</span>
                      <a-button
                        type="text"
                        size="small"
                        aria-label="Close properties panel"
                        @click="closeRightPanel"
                      >
                        <template #icon><CloseOutlined /></template>
                      </a-button>
                    </div>
                    <div class="antd-cad-panel-body">
                      <AntdPropertiesPanel />
                    </div>
                  </template>
                </a-layout-sider>
              </div>
            </a-layout>
  
            <a-layout-footer class="antd-cad-footer">
              <AntdStatusBar
                v-if="editorReady"
                :disabled="isDocumentOpening"
                @toggle-theme="emit('toggle-theme')"
              />
            </a-layout-footer>
            </a-layout>
        </div>
      </div>
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { CloseOutlined } from '@ant-design/icons-vue'
import { AcApOpenViewMode, AcEdOpenMode } from '@mlightcad/cad-simple-viewer'
import {
  MlDialogManager,
  MlFontFileReader,
  store,
  useDocument,
  useLocale
} from '@mlightcad/cad-viewer'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { antdLocaleFor, buildAntdTheme } from '../theme'
import AntdRibbon from './ribbon/AntdRibbon.vue'
import AntdBlocksPanel from './panels/AntdBlocksPanel.vue'
import AntdLayerPanel from './panels/AntdLayerPanel.vue'
import AntdPropertiesPanel from './panels/AntdPropertiesPanel.vue'
import AntdStatusBar from './status/AntdStatusBar.vue'
import { useAntdCadShell } from './useAntdCadShell'
import './shell.css'

const AgentChatPanel = defineAsyncComponent(() =>
  import('@mlightcad/cad-agent-plugin').then(module => module.AgentChatPanel)
)

const SearchPanel = defineAsyncComponent(() =>
  Promise.all([
    import('@mlightcad/cad-search-plugin/style.css'),
    import('@mlightcad/cad-search-plugin')
  ]).then(([, module]) => module.SearchPanel)
)

interface Props {
  localFile?: File
  isNewDrawing?: boolean
  mode: AcEdOpenMode
  useMainThreadDraw?: boolean
  drawNoPlotLayers?: boolean
  progressiveRendering?: boolean
  openViewMode?: AcApOpenViewMode
  theme: 'light' | 'dark'
  baseUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  localFile: undefined,
  isNewDrawing: false,
  useMainThreadDraw: true,
  drawNoPlotLayers: false,
  progressiveRendering: true,
  openViewMode: undefined,
  baseUrl: undefined
})

const emit = defineEmits<{
  create: []
  destroy: []
  'toggle-theme': []
}>()

const { t } = useI18n()
const { effectiveLocale } = useLocale()
const { isDocumentOpening } = useDocument()

const antdLocale = computed(() => antdLocaleFor(String(effectiveLocale.value)))
const antdThemeConfig = computed(() => buildAntdTheme(props.theme))
const themeClass = computed(() =>
  props.theme === 'dark' ? 'ml-theme-dark' : 'ml-theme-light'
)

const containerRef = ref<HTMLElement>()
const layoutRef = ref<HTMLElement>()

const { editorReady } = useAntdCadShell({
  container: containerRef,
  busyIndicatorHost: layoutRef,
  baseUrl: props.baseUrl,
  useMainThreadDraw: props.useMainThreadDraw,
  mode: computed(() => props.mode),
  drawNoPlotLayers: computed(() => props.drawNoPlotLayers),
  progressiveRendering: computed(() => props.progressiveRendering),
  openViewMode: computed(() => props.openViewMode),
  theme: computed(() => props.theme),
  localFile: computed(() => props.localFile),
  isNewDrawing: computed(() => props.isNewDrawing),
  onCreated: () => emit('create')
})

// ── panel visibility, single source of truth: store.dialogs ──────────

const leftCollapsed = computed(
  () =>
    !store.dialogs.layerManager ||
    store.dialogs.activePaletteTab === 'entityProperties'
)

const rightCollapsed = computed(
  () =>
    !store.dialogs.layerManager ||
    store.dialogs.activePaletteTab !== 'entityProperties'
)

const leftActiveTab = ref<'layers' | 'blocks' | 'search' | 'agent'>('layers')

// ── resizable siders ──────────────────────────────────────────────
const LEFT_WIDTH_MIN = 180
const LEFT_WIDTH_MAX = 480
const RIGHT_WIDTH_MIN = 220
const RIGHT_WIDTH_MAX = 520

const leftWidth = ref(272)
const rightWidth = ref(300)

type Side = 'left' | 'right'

const onResizerMouseDown = (e: MouseEvent, side: Side) => {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = side === 'left' ? leftWidth.value : rightWidth.value
  const min = side === 'left' ? LEFT_WIDTH_MIN : RIGHT_WIDTH_MIN
  const max = side === 'left' ? LEFT_WIDTH_MAX : RIGHT_WIDTH_MAX

  const onMouseMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    // left sider grows when dragging right; right sider grows when dragging left
    const delta = side === 'left' ? dx : -dx
    const next = Math.min(max, Math.max(min, startWidth + delta))
    if (side === 'left') {
      leftWidth.value = next
    } else {
      rightWidth.value = next
    }
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

watch(
  () => store.dialogs.activePaletteTab,
  tab => {
    switch (tab) {
      case 'blocks':
        leftActiveTab.value = 'blocks'
        break
      case 'search':
        leftActiveTab.value = 'search'
        break
      case 'agent':
        leftActiveTab.value = 'agent'
        break
      default:
        leftActiveTab.value = 'layers'
        break
    }
  }
)

const onLeftTabChange = (key: string | number) => {
  if (key === 'layers') {
    store.dialogs.activePaletteTab = 'layerManager'
  } else if (key === 'blocks' || key === 'search' || key === 'agent') {
    store.dialogs.activePaletteTab = key as 'blocks' | 'search' | 'agent'
    store.dialogs.layerManager = true
  }
}

const closeLeftPanel = () => {
  store.dialogs.layerManager = false
}

const closeAgentPanel = () => {
  leftActiveTab.value = 'layers'
  store.dialogs.activePaletteTab = 'layerManager'
}

const closeRightPanel = () => {
  store.dialogs.layerManager = false
}
</script>

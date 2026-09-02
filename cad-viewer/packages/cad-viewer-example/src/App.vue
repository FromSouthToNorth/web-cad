<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-app>
      <div id="app-root">
        <!-- Upload screen when no drawing is open -->
        <div v-if="!showViewer" class="upload-screen">
          <button
            type="button"
            class="theme-toggle"
            :aria-label="
              theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            "
            @click="toggleTheme"
          >
            {{ theme === 'dark' ? '🌙 Dark' : '☀️ Light' }}
          </button>
          <FileUpload
            @file-select="handleFileSelect"
            @new-drawing="handleNewDrawing"
          />
        </div>

        <!-- Ant Design Vue AutoCAD-style shell when a file is selected
             or a new drawing is created -->
        <AntdCadViewer
          v-else
          :local-file="store.selectedFile ?? undefined"
          :is-new-drawing="store.isNewDrawing"
          :mode="selectedMode"
          :use-main-thread-draw="useMainThreadDraw"
          :draw-no-plot-layers="drawNoPlotLayers"
          :progressive-rendering="progressiveRendering"
          :open-view-mode="openViewMode"
          :theme="theme"
          :base-url="BASE_URL"
          @create="onViewerCreate"
          @toggle-theme="toggleTheme"
        />
      </div>
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { FontManager } from '@mlightcad/mtext-renderer'
import {
  AcApDocManager,
  AcApOpenViewMode,
  AcEdCommandStack,
  AcEdOpenMode
} from '@mlightcad/cad-simple-viewer'
import { registerInvertSelPlugin } from '@mlightcad/cad-invertsel-plugin/register'
import { registerLayerCtxPlugin } from '@mlightcad/cad-layerctx-plugin/register'
import { computed, ref, watch } from 'vue'

import { AcApQuitCmd } from './commands'
import FileUpload from './components/FileUpload.vue'
import AntdCadViewer from './shell/AntdCadViewer.vue'
import { store } from './store'
import { buildAntdTheme } from './theme'

type UiTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'cad-viewer-example:ui-theme'

const readStoredTheme = (): UiTheme => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (privacy mode) — fall through to the default
  }
  return 'dark'
}

const theme = ref<UiTheme>(readStoredTheme())

// Applies the example-shell theme. The viewer itself receives the same value
// through the `theme` prop, which writes the COLORTHEME sysvar.
const applyThemeToPage = (value: UiTheme) => {
  document.documentElement.classList.toggle('dark', value === 'dark')
  document.documentElement.setAttribute('data-ml-ui-theme', value)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value)
  } catch {
    // best effort only
  }
}

watch(theme, applyThemeToPage, { immediate: true })

const antdThemeConfig = computed(() => buildAntdTheme(theme.value))

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

const initialize = () => {
  if (import.meta.env.DEV) {
    ;(
      window as Window & { AcApDocManager?: typeof AcApDocManager }
    ).AcApDocManager = AcApDocManager
  }
  const register = AcApDocManager.instance.commandManager
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'quit',
    'quit',
    new AcApQuitCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'exit',
    'exit',
    new AcApQuitCmd()
  )

  // Invert selection ships as a plugin so the viewer libraries stay
  // unmodified; dropping this one call removes the feature completely.
  void registerInvertSelPlugin(AcApDocManager.instance.pluginManager)

  // Layer-manager right-click context menu (delete/copy/cut/move-scale/
  // rotate/deselect) also ships as a plugin with zero host modifications.
  void registerLayerCtxPlugin(AcApDocManager.instance.pluginManager)
}

const BASE_URL = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/'

const showViewer = computed(
  () => store.selectedFile != null || store.isNewDrawing
)

const selectedMode = ref<AcEdOpenMode>(AcEdOpenMode.Write)
const useMainThreadDraw = ref(false)
const drawNoPlotLayers = ref(false)
const progressiveRendering = ref(true)
const openViewMode = ref<AcApOpenViewMode | undefined>(undefined)

const onViewerCreate = async () => {
  initialize()

  // Load local hztxt.shx font for Chinese text rendering
  try {
    const fontResponse = await fetch('./fonts/hztxt.shx')
    const fontData = await fontResponse.arrayBuffer()
    await FontManager.instance.cacheFont(fontData, 'hztxt.shx')

    // Set hztxt as the primary default font to avoid simsun fallback warnings
    FontManager.instance.setDefaultFonts(['hztxt'])
  } catch (error) {
    console.warn('Failed to load hztxt.shx font:', error)
  }
}

const applyOpenOptions = (
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  selectedMode.value = mode
  useMainThreadDraw.value = mainThreadDraw
  drawNoPlotLayers.value = showNoPlotLayers
  progressiveRendering.value = enableProgressiveRendering
  openViewMode.value = viewMode
}

// Handle file selection from upload component
const handleFileSelect = (
  file: File,
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  store.isNewDrawing = false
  store.selectedFile = file
  applyOpenOptions(
    mode,
    mainThreadDraw,
    showNoPlotLayers,
    enableProgressiveRendering,
    viewMode
  )
}

const handleNewDrawing = (
  mode: AcEdOpenMode,
  mainThreadDraw: boolean,
  showNoPlotLayers: boolean,
  enableProgressiveRendering: boolean,
  viewMode: AcApOpenViewMode | undefined
) => {
  store.selectedFile = null
  store.isNewDrawing = true
  applyOpenOptions(
    mode,
    mainThreadDraw,
    showNoPlotLayers,
    enableProgressiveRendering,
    viewMode
  )
}
</script>

<style scoped>
#app-root {
  height: 100vh;
  position: fixed;
}

.upload-screen {
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: safe center;
  overflow-y: auto;
  background: var(--ml-theme-bg-base);
  margin: 0;
  padding: 16px;
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1000;
  pointer-events: auto;
}

.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  padding: 6px 12px;
  border: 1px solid var(--ml-theme-border-subtle);
  border-radius: 999px;
  background: var(--ml-theme-bg-surface);
  color: var(--ml-theme-text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.theme-toggle:hover {
  background: var(--ml-theme-bg-hover);
}
</style>

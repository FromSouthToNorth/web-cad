<template>
  <a-config-provider :theme="antdThemeConfig" :locale="antdLocale">
    <a-app>
      <div id="app-root">
        <!-- Upload screen when no drawing is open -->
        <div v-if="!showViewer" class="upload-screen">
          <a-tooltip
            :title="
              theme === 'dark'
                ? t('fileUpload.switchToLight')
                : t('fileUpload.switchToDark')
            "
            placement="bottom"
          >
            <a-button
              type="text"
              shape="circle"
              class="theme-toggle"
              :aria-label="
                theme === 'dark'
                  ? t('fileUpload.switchToLight')
                  : t('fileUpload.switchToDark')
              "
              @click="toggleTheme"
            >
              <template #icon>
                <!-- Same palette glyph as the shell status bar theme toggle. -->
                <BgColorsOutlined />
              </template>
            </a-button>
          </a-tooltip>
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
          :base-url="cadDataBaseUrl"
          @create="onViewerCreate"
          @toggle-theme="toggleTheme"
        />
      </div>
    </a-app>
  </a-config-provider>
</template>

<script setup lang="ts">
import { BgColorsOutlined } from '@ant-design/icons-vue'
import { registerInvertSelPlugin } from '@hy/cad-invertsel-plugin/register'
import { registerLayerCtxPlugin } from '@hy/cad-layerctx-plugin/register'
import {
  AcApDocManager,
  AcApOpenViewMode,
  AcEdCommandStack,
  AcEdOpenMode,
  CAD_DATA_CDN_BASE_URL,
  resolveCadDataBaseUrl
} from '@hy/cad-simple-viewer'
import { registerTunnelPlugin } from '@hy/cad-tunnel-plugin/register'
import { useLocale } from '@hy/cad-viewer'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { AcApQuitCmd } from './commands'
import FileUpload from './components/FileUpload.vue'
import AntdCadViewer from './shell/AntdCadViewer.vue'
import { store } from './store'
import { antdLocaleFor, buildAntdTheme } from './theme'

type UiTheme = 'light' | 'dark'

const { t } = useI18n()

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

// Root ConfigProvider also carries the locale, so antd components on the
// upload screen (dragger, modals) follow the same i18n as the viewer shell.
const { effectiveLocale } = useLocale()
const antdLocale = computed(() => antdLocaleFor(String(effectiveLocale.value)))

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

  // Tunnel (巷道) drawing plugin: fetches GeoJSON tunnel data and draws the
  // points / lines / areas / labels without parsing any DWG/DXF file. The
  // sample dataset is served from the app's public/geojson/ folder.
  void registerTunnelPlugin(AcApDocManager.instance.pluginManager, {
    url: `${import.meta.env.BASE_URL}geojson/tunnel.json`
  })
}

/**
 * Asset repository root handed to the viewer.
 *
 * Starts on the jsDelivr fallback and switches to the local `cad-data` mirror
 * as soon as the one-shot probe confirms it is served (`pnpm sync:cad-data`
 * copies `packages/cad-data/fonts/` into `dist/cad-data/fonts/`). The probe
 * resolves in milliseconds on the same origin, long before a user can pick a
 * drawing, so in practice the local mirror is always used when present — and
 * a machine that has not synced still behaves exactly as before.
 *
 * `resolveCadDataBaseUrl` returns an absolute URL on purpose: the MTEXT worker
 * resolves relative URLs against its own script (`dist/assets/…`).
 */
const cadDataBaseUrl = ref(CAD_DATA_CDN_BASE_URL)
void resolveCadDataBaseUrl({ appBaseUrl: import.meta.env.BASE_URL }).then(
  url => {
    cadDataBaseUrl.value = url
  }
)

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

  // Font preloading is owned by the engine now (`preloadDefaultFonts` /
  // `preloadDrawingFonts`, enabled in `useAntdCadShell`): it loads through the
  // same font loader the MTEXT worker pool reads from and therefore also fills
  // the shared IndexedDB cache. Two things this hook used to do are gone on
  // purpose:
  //
  // 1. Fetching `hztxt.shx` by hand — the engine loads it from the canonical
  //    `<base>/fonts/` root (aliases and GBK encoding come from `fonts.json`),
  //    so the manual fetch only duplicated the download.
  // 2. Narrowing the default chain to `['hztxt']`. That was meant to keep
  //    Chinese text off the SimSun *CDN* download, but SimSun ships in the
  //    local cad-data mirror now, and `FontManager.findAndReplaceFont` warns
  //    that a BIGFONT SHX as the primary substitute stretches Latin runs and
  //    triggers false MTEXT wrapping. The engine preset (`modern`: simsun,
  //    then hztxt) is restored.
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
  height: 100dvh;
  position: fixed;
}

.upload-screen {
  height: 100vh;
  height: 100dvh;
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

.theme-toggle.ant-btn {
  position: absolute;
  top: var(--ml-space-4);
  right: var(--ml-space-4);
  z-index: 1;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--ml-theme-border-subtle);
  background: var(--ml-theme-bg-surface);
  color: var(--ml-theme-text-primary);
  font-size: 14px;
  transition:
    background-color var(--ml-motion-base) ease,
    border-color var(--ml-motion-base) ease;
}

.theme-toggle.ant-btn:hover {
  background: var(--ml-theme-bg-hover);
  color: var(--ml-theme-text-primary);
  border-color: var(--ml-theme-border);
}
</style>

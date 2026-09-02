import {
  AcApDocManager,
  AcApFontUtil,
  AcApOpenViewMode,
  AcApSettingManager,
  AcEdMessageType,
  AcEdMTextEditor,
  AcEdOpenMode,
  acedApplyUiTheme,
  eventBus
} from '@mlightcad/cad-simple-viewer'
import {
  ensureColorThemeSync,
  initializeCadViewer,
  setColorTheme,
  store
} from '@mlightcad/cad-viewer'
import {
  AcDbSystemVariables,
  AcDbSysVarManager,
  log
} from '@mlightcad/data-model'
import { App as AntdApp } from 'ant-design-vue'
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref
} from 'vue'
import { useI18n } from 'vue-i18n'

/** Options driving the antd CAD shell lifecycle. */
export interface AntdCadShellOptions {
  container: Ref<HTMLElement | undefined>
  busyIndicatorHost: Ref<HTMLElement | undefined>
  baseUrl?: string
  htmlViewerRuntimeUrl?: string | URL
  useMainThreadDraw?: boolean
  mode: Ref<AcEdOpenMode>
  drawNoPlotLayers: Ref<boolean>
  progressiveRendering: Ref<boolean>
  openViewMode: Ref<AcApOpenViewMode | undefined>
  theme: Ref<'light' | 'dark'>
  localFile: Ref<File | undefined>
  isNewDrawing: Ref<boolean>
  onCreated?: () => void
}

/**
 * Boots the CAD core (canvas, commands, dialogs, lazy plugins) into an
 * arbitrary container and wires global engine events to antd toast
 * notifications. Mirrors the lifecycle previously owned by MlCadViewer.
 */
export function useAntdCadShell(options: AntdCadShellOptions) {
  const { t } = useI18n()
  const { message, notification } = AntdApp.useApp()

  const editorReady = ref(false)
  const editor = computed(() => AcApDocManager.instance as AcApDocManager)

  const buildOpenOptions = () => ({
    minimumChunkSize: 1000,
    mode: options.mode.value,
    drawNoPlotLayers: options.drawNoPlotLayers.value,
    progressiveRendering: options.progressiveRendering.value,
    ...(options.openViewMode.value != null
      ? { openViewMode: options.openViewMode.value }
      : {})
  })

  const openLocalFile = async (file: File) => {
    let fileContent: ArrayBuffer | null = null
    try {
      const reader = new FileReader()
      reader.readAsArrayBuffer(file)
      fileContent = await new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onload = event => {
          const result = event.target?.result
          if (result) resolve(result as ArrayBuffer)
          else reject(new Error('Failed to read file content'))
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
      })

      const success = await AcApDocManager.instance.openDocument(
        file.name,
        fileContent,
        buildOpenOptions()
      )
      if (!success) return
    } catch (error) {
      log.error('Failed to open local file:', error)
      message.error(t('shell.errors.openFailed', { fileName: file.name }))
    } finally {
      fileContent = null
    }
  }

  const createNewDrawing = async () => {
    const success = await AcApDocManager.instance.newDocument(
      buildOpenOptions()
    )
    if (!success) {
      log.error('Failed to create new drawing')
    }
  }

  // ── global engine events → antd feedback ────────────────────────────

  const showEngineMessage = (params: {
    message: string
    type: AcEdMessageType
  }) => {
    switch (params.type) {
      case 'success':
        message.success(params.message)
        break
      case 'warning':
        message.warning(params.message)
        break
      case 'error':
        message.error(params.message)
        break
      default:
        message.info(params.message)
        break
    }
  }

  const formatFontsWithReplacement = (fontNames: string[]) =>
    fontNames
      .map(
        fontName =>
          `${fontName} → ${AcApFontUtil.getReplacementFontName(fontName)}`
      )
      .join(', ')

  const onFontsNotLoaded = (params: {
    fonts: { fontName: string }[]
  }) => {
    notification.error({
      message: t('shell.notifications.fontNotFound'),
      description: t('shell.notifications.fontsNotLoaded', {
        fonts: formatFontsWithReplacement(params.fonts.map(f => f.fontName))
      }),
      duration: 0
    })
  }

  const onFontsNotFound = (params: { fonts: string[] }) => {
    notification.warning({
      message: t('shell.notifications.fontNotFound'),
      description: t('shell.notifications.fontsNotFound', {
        fonts: formatFontsWithReplacement(params.fonts)
      })
    })
  }

  const onFontNotFound = (params: { fontName: string; count: number }) => {
    const fontName = params.fontName.trim()
    if (!fontName) return
    notification.warning({
      message: t('shell.notifications.fontNotFound'),
      description: t('shell.notifications.fontMissedInDrawing', {
        font: fontName,
        count: params.count,
        replacementFont: AcApFontUtil.getReplacementFontName(fontName)
      })
    })
  }

  const onFailedToGetAvailableFonts = (params: { url: string }) => {
    message.error(
      t('shell.errors.failedToGetAvaiableFonts', { url: params.url })
    )
  }

  const onFailedToOpenFile = (params: { fileName: string }) => {
    const text = t('shell.errors.openFailed', { fileName: params.fileName })
    message.error(text)
    notification.error({
      message: t('shell.notifications.openFailedTitle'),
      description: text
    })
  }

  const onCloseLayerManager = () => {
    if (!store.dialogs.layerManager) return
    if (store.dialogs.activePaletteTab !== 'layerManager') return
    store.dialogs.layerManager = false
  }

  const bindEvents = () => {
    eventBus.on('message', showEngineMessage)
    eventBus.on('fonts-not-loaded', onFontsNotLoaded)
    eventBus.on('fonts-not-found', onFontsNotFound)
    eventBus.on('font-not-found', onFontNotFound)
    eventBus.on('failed-to-get-avaiable-fonts', onFailedToGetAvailableFonts)
    eventBus.on('failed-to-open-file', onFailedToOpenFile)
    eventBus.on('close-layer-manager', onCloseLayerManager)

    // Re-initialize dynamic input sysvars when document changes
    AcApDocManager.instance.events.documentActivated.addEventListener(
      initializeDynamicInputSysvars
    )
  }

  const unbindEvents = () => {
    eventBus.off('message', showEngineMessage)
    eventBus.off('fonts-not-loaded', onFontsNotLoaded)
    eventBus.off('fonts-not-found', onFontsNotFound)
    eventBus.off('font-not-found', onFontNotFound)
    eventBus.off('failed-to-get-avaiable-fonts', onFailedToGetAvailableFonts)
    eventBus.off('failed-to-open-file', onFailedToOpenFile)
    eventBus.off('close-layer-manager', onCloseLayerManager)

    AcApDocManager.instance.events.documentActivated.removeEventListener(
      initializeDynamicInputSysvars
    )
  }

  const applyTheme = (theme: 'light' | 'dark') => {
    setColorTheme(theme)
    acedApplyUiTheme(theme)
  }

  // ── sysvar initialization ─────────────────────────────────────────────

  /**
   * Ensures dynamic input sysvars are set to AutoCAD-compatible defaults.
   * The floating input (used by scale, offset, etc.) depends on DYNMODE and
   * DYNPROMPT being non-zero.
   */
  const initializeDynamicInputSysvars = () => {
    try {
      const editor = AcApDocManager.instance
      const database = editor.curDocument?.database
      if (!database) {
        log.warn('initializeDynamicInputSysvars: no database available')
        return
      }

      const sysVarMgr = AcDbSysVarManager.instance()

      // DYNMODE: 0=off, 1=dimension input, 2=pointer input, 3=both
      // Default to 3 (both enabled) for AutoCAD-like behavior
      sysVarMgr.setVar(AcDbSystemVariables.DYNMODE, 3, database)

      // DYNPROMPT: 0=off, 1=on
      // Default to 1 (enabled) so prompts show in floating input
      sysVarMgr.setVar(AcDbSystemVariables.DYNPROMPT, 1, database)
    } catch (error) {
      log.error('Failed to initialize dynamic input sysvars:', error)
    }
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  onMounted(async () => {
    const container = options.container.value
    const busyIndicatorHost = options.busyIndicatorHost.value
    if (!container || !busyIndicatorHost) {
      log.warn('AntdCadViewer: container is unavailable on mount')
      return
    }

    // The antd shell docks the engine command line at the bottom of the
    // viewport; keep it visible regardless of settings persisted by the
    // old Element Plus shell.
    AcApSettingManager.instance.isShowCommandLine = true

    initializeCadViewer({
      container,
      busyIndicatorHost,
      baseUrl: options.baseUrl,
      htmlViewerRuntimeUrl: options.htmlViewerRuntimeUrl,
      autoResize: true,
      useMainThreadDraw: options.useMainThreadDraw,
      openDocumentDefaults: buildOpenOptions
    })

    ensureColorThemeSync()
    applyTheme(options.theme.value)
    bindEvents()

    editorReady.value = true

    options.onCreated?.()

    if (options.localFile.value) {
      await openLocalFile(options.localFile.value)
    } else if (options.isNewDrawing.value) {
      await createNewDrawing()
    }

    // Set sysvars after document is opened
    initializeDynamicInputSysvars()
  })

  onUnmounted(() => {
    unbindEvents()
    AcEdMTextEditor.setDefaultToolbarEnabled(true)
    AcApDocManager.instance.destroy()
  })

  watch(
    () => options.theme.value,
    newTheme => {
      applyTheme(newTheme)
    }
  )

  // The MText editor shows its own toolbar only outside write mode.
  watch(
    () => options.mode.value,
    mode => {
      AcEdMTextEditor.setDefaultToolbarEnabled(mode !== AcEdOpenMode.Write)
    },
    { immediate: true }
  )

  watch(
    () => [
      options.mode.value,
      options.drawNoPlotLayers.value,
      options.progressiveRendering.value,
      options.openViewMode.value
    ],
    () => {
      if (editorReady.value) {
        AcApDocManager.instance.setOpenDocumentDefaults(buildOpenOptions)
      }
    }
  )

  return { editorReady, editor }
}

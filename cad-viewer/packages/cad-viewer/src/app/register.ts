import {
  type AcApHtmlPluginOptions,
  registerLazyHtmlPlugin
} from '@hy/cad-html-plugin/register'
import { registerLazyPdfPlugin } from '@hy/cad-pdf-plugin/register'
import {
  AcApDocManager,
  type AcApPluginManager,
  AcEdCommandStack,
  AcEdMTextEditor
} from '@hy/cad-simple-viewer'
import { registerLazySvgPlugin } from '@hy/cad-svg-plugin/register'
import { markRaw } from 'vue'

import {
  AcApAttDefCmd,
  AcApAttEditCmd,
  AcApDrawingUnitsCmd,
  AcApExportHtmlDlgCmd,
  AcApInsertPaletteCmd,
  AcApLayerStateCmd,
  AcApPointStyleCmd,
  AcApPropertiesCmd,
  AcApQSelectCmd,
  AcApTextStyleCmd
} from '../command'
import {
  createMlColorIndexPickerToolbarFactory,
  MlAttDefDlg,
  MlAttEditDlg,
  MlDrawingUnitsDlg,
  MlExportHtmlDlg,
  MlPointStyleDlg,
  MlQuickSelectDlg,
  MlTextStyleDlg
} from '../component'
import { useDialogManager } from '../composable'
import { i18n } from '../locale'
import { store } from './store'

/**
 * Command stack the viewer commands were last registered into.
 *
 * `AcApDocManager.destroy()` — called by the shell when the viewer unmounts —
 * drops the singleton, so the next mount builds a fresh, empty command stack.
 * Keying idempotency on that stack instead of a module-level boolean makes the
 * registration survive every remount. With the old flag, visiting the upload
 * screen (or any viewer unmount/remount) left `STYLE`, `UNITS`, `QSELECT`,
 * `ATTDEF`, `ATTEDIT`, `INSERT`, `PROPERTIES`, `PTTYPE` and `CHTML`
 * unregistered, so the ribbon buttons for them silently did nothing.
 */
let registeredCommandStack: AcEdCommandStack | null = null

export const registerCmds = () => {
  const register = AcApDocManager.instance.commandManager
  if (registeredCommandStack === register) {
    return
  }
  registeredCommandStack = register
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'layer',
    'layer',
    new AcApLayerStateCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'pttype',
    'pttype',
    new AcApPointStyleCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'qselect',
    'qselect',
    new AcApQSelectCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'chtml',
    'chtml',
    new AcApExportHtmlDlgCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'units',
    'units',
    new AcApDrawingUnitsCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'properties',
    'properties',
    new AcApPropertiesCmd()
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'insert',
    'insert',
    new AcApInsertPaletteCmd(),
    'blockspalette'
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'style',
    'style',
    new AcApTextStyleCmd(),
    'st'
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'attedit',
    'attedit',
    new AcApAttEditCmd(),
    ['eattedit', 'ate']
  )
  register.addCommand(
    AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
    'attdef',
    'attdef',
    new AcApAttDefCmd(),
    'ddattdef'
  )
}

let isDialogRegistered = false
export const registerDialogs = () => {
  if (!isDialogRegistered) {
    const { registerDialog } = useDialogManager()
    registerDialog({
      name: 'PointStyleDlg',
      component: markRaw(MlPointStyleDlg),
      props: {}
    })
    registerDialog({
      name: 'QuickSelectDlg',
      component: markRaw(MlQuickSelectDlg),
      props: {}
    })
    registerDialog({
      name: 'ExportHtmlDlg',
      component: markRaw(MlExportHtmlDlg),
      props: {}
    })
    registerDialog({
      name: 'DrawingUnitsDlg',
      component: markRaw(MlDrawingUnitsDlg),
      props: {}
    })
    registerDialog({
      name: 'TextStyleDlg',
      component: markRaw(MlTextStyleDlg),
      props: {}
    })
    registerDialog({
      name: 'AttEditDlg',
      component: markRaw(MlAttEditDlg),
      props: {}
    })
    registerDialog({
      name: 'AttDefDlg',
      component: markRaw(MlAttDefDlg),
      props: {}
    })
    isDialogRegistered = true
  }
}

let isMTextColorPickerRegistered = false
export const registerMTextColorPicker = () => {
  if (!isMTextColorPickerRegistered) {
    AcEdMTextEditor.setDefaultColorPicker(
      createMlColorIndexPickerToolbarFactory()
    )
    isMTextColorPickerRegistered = true
  }
}

/**
 * Plugin manager the lazy plugins were last registered into.
 *
 * Same remount hazard as {@link registerCmds}: the plugin manager lives on the
 * `AcApDocManager` singleton, which `destroy()` drops. The previous
 * module-level flag therefore left `cpdf`, `csvg`, `chtml`, `agent` and
 * `search` unregistered (and their ribbon buttons dead) after any viewer
 * unmount, e.g. after opening a drawing from the upload screen.
 */
let registeredPluginManager: AcApPluginManager | null = null

/**
 * Cached optional-plugin registrars.
 *
 * Loading them once keeps the one-time UI wiring (palette openers, i18n) from
 * running again, while the per-manager `registerLazy*Plugin` call below still
 * happens for every new plugin manager.
 */
let agentRegistrar: typeof import('@hy/cad-agent-plugin/register') | null = null
let searchRegistrar: typeof import('@hy/cad-search-plugin/register') | null =
  null

const registerAgentIntegration = async (pluginManager: AcApPluginManager) => {
  try {
    if (!agentRegistrar) {
      await import('@hy/cad-agent-plugin/style.css')
      const agentRegister = await import('@hy/cad-agent-plugin/register')

      agentRegister.setAgentPaletteOpener(() => {
        if (
          store.dialogs.layerManager &&
          store.dialogs.activePaletteTab === 'agent'
        ) {
          store.dialogs.layerManager = false
          return
        }

        store.dialogs.activePaletteTab = 'agent'
        store.dialogs.layerManager = true
      })

      agentRegister.mergeAgentI18nIntoVueI18n((locale, messages) => {
        i18n.global.mergeLocaleMessage(locale, messages)
      })

      agentRegistrar = agentRegister
      store.features.agentPlugin = true
    }

    agentRegistrar.registerLazyAgentPlugin(pluginManager)
  } catch {
    // Optional peer `@hy/cad-agent-plugin` is not installed.
  }
}

const registerSearchIntegration = async (pluginManager: AcApPluginManager) => {
  try {
    if (!searchRegistrar) {
      await import('@hy/cad-search-plugin/style.css')
      const searchRegister = await import('@hy/cad-search-plugin/register')

      searchRegister.setSearchPaletteOpener(() => {
        if (
          store.dialogs.layerManager &&
          store.dialogs.activePaletteTab === 'search'
        ) {
          store.dialogs.layerManager = false
          return
        }

        store.dialogs.activePaletteTab = 'search'
        store.dialogs.layerManager = true
      })

      searchRegister.mergeSearchI18nIntoVueI18n((locale, messages) => {
        i18n.global.mergeLocaleMessage(locale, messages)
      })

      searchRegistrar = searchRegister
      store.features.searchPlugin = true
    }

    searchRegistrar.registerLazySearchPlugin(pluginManager)
  } catch {
    // Optional peer `@hy/cad-search-plugin` is not installed.
  }
}

/**
 * Options for {@link registerLazyPlugins}.
 */
export interface RegisterLazyPluginsOptions {
  /** Options passed to {@link registerLazyHtmlPlugin} (HTML export only). */
  htmlPlugin?: AcApHtmlPluginOptions
}

/**
 * Registers lazy plugins that load on first use of their trigger commands.
 *
 * Currently registers the PDF plugin (`cpdf`, `ipdf`), the HTML export
 * plugin (`-chtml`), the SVG export plugin (`csvg`), and optionally the CAD
 * Agent plugin (`agent`) when `@hy/cad-agent-plugin` is installed.
 *
 * Safe to call multiple times: registration is skipped only for a plugin
 * manager that already received it, so a viewer remount re-registers into the
 * rebuilt manager.
 *
 * @param options - Optional HTML plugin settings such as `viewerRuntimeUrl`
 */
export const registerLazyPlugins = (
  options: RegisterLazyPluginsOptions = {}
) => {
  const pluginManager = AcApDocManager.instance.pluginManager
  if (registeredPluginManager === pluginManager) {
    return
  }
  registeredPluginManager = pluginManager

  registerLazyPdfPlugin(pluginManager)
  registerLazyHtmlPlugin(pluginManager, options.htmlPlugin)
  registerLazySvgPlugin(pluginManager)

  void registerAgentIntegration(pluginManager)
  void registerSearchIntegration(pluginManager)
}

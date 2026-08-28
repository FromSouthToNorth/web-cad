import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@mlightcad/cad-simple-viewer'

import packageJson from '../package.json'
import { registerLayerCtxI18n, startLayerCtxLocaleSync } from './i18n'
import {
  AcApLayerCtxDelCmd,
  AcApLayerCtxDeselectCmd,
  AcApLayerCtxScaleCmd,
  LAYERCTX_CMD_DELETE,
  LAYERCTX_CMD_DESELECT,
  LAYERCTX_CMD_SCALE
} from './layerCtxCommands'
import {
  startLayerCtxDispatchTracker,
  stopLayerCtxDispatchTracker
} from './layerCtxDispatch'
import {
  startLayerCtxKeyHandler,
  stopLayerCtxKeyHandler
} from './layerCtxKeyHandler'
import { startLayerCtxMenu, stopLayerCtxMenu } from './layerCtxMenu'

/**
 * Object context-menu plugin for cad-simple-viewer based applications.
 *
 * Bundles the complete feature with zero host source intrusion:
 * - right-click context menu on canvas entities (delete / copy / move /
 *   scale / rotate / deselect), acting on the current selection set; copy,
 *   move and rotate dispatch the host's interactive commands, scale is the
 *   plugin's own interactive command (base point → drag distance = factor,
 *   with live preview jig)
 * - three own system commands (`layctxdel`, `layctxscale`, `layctxdsel`)
 *   executable from the command line
 * - Ctrl/Cmd+Shift+E/C/M/S/R/A keyboard shortcuts
 * - en/zh/tr/cs UI strings
 *
 * Register it eagerly at application startup via
 * {@link registerLayerCtxPlugin} (the shortcut listener and context menu must
 * be in place before the user first interacts, so lazy trigger-based loading
 * does not fit).
 */
export class AcApLayerCtxPlugin implements AcApPlugin {
  /** @inheritdoc */
  name = 'LayerCtxPlugin'
  /** @inheritdoc */
  version = packageJson.version
  /** @inheritdoc */
  description =
    'Canvas object context menu: delete/copy/move/scale/rotate selected objects and deselect, with commands and keyboard shortcuts'

  /** Unsubscribe function for the host locale-change listener. */
  private stopLocaleSync: (() => void) | undefined

  /**
   * Registers the commands, keyboard shortcuts, context menu and UI strings.
   *
   * @param _context - Application context (unused; the view and document are
   *   resolved at event time via `AcApDocManager.instance`)
   * @param commandManager - Command stack used to register the three commands
   */
  onLoad(_context: AcApContext, commandManager: AcEdCommandStack): void {
    registerLayerCtxI18n()
    this.stopLocaleSync = startLayerCtxLocaleSync()

    const group = AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME
    commandManager.addCommand(
      group,
      LAYERCTX_CMD_DELETE,
      LAYERCTX_CMD_DELETE,
      new AcApLayerCtxDelCmd()
    )
    commandManager.addCommand(
      group,
      LAYERCTX_CMD_SCALE,
      LAYERCTX_CMD_SCALE,
      new AcApLayerCtxScaleCmd()
    )
    commandManager.addCommand(
      group,
      LAYERCTX_CMD_DESELECT,
      LAYERCTX_CMD_DESELECT,
      new AcApLayerCtxDeselectCmd()
    )

    startLayerCtxKeyHandler()
    startLayerCtxMenu()
    startLayerCtxDispatchTracker()
  }

  /**
   * Removes everything registered in {@link onLoad}.
   *
   * @param _context - Application context (unused)
   * @param commandManager - Command stack used to unregister the commands
   */
  onUnload(_context: AcApContext, commandManager: AcEdCommandStack): void {
    stopLayerCtxMenu()
    stopLayerCtxKeyHandler()
    stopLayerCtxDispatchTracker()

    const group = AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME
    commandManager.removeCmd(group, LAYERCTX_CMD_DELETE)
    commandManager.removeCmd(group, LAYERCTX_CMD_SCALE)
    commandManager.removeCmd(group, LAYERCTX_CMD_DESELECT)

    this.stopLocaleSync?.()
    this.stopLocaleSync = undefined
  }
}

import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@hy/cad-simple-viewer'

import packageJson from '../package.json'
import { AcApDrawTunnelCmd } from './command/AcApDrawTunnelCmd'
import { AcApTunnelClearCmd } from './command/AcApTunnelClearCmd'
import { AcApTunnelSettingsCmd } from './command/AcApTunnelSettingsCmd'
import {
  DRAWTUNNEL_COMMAND_NAME,
  setTunnelPluginOptions,
  TUNNELCLEAR_COMMAND_NAME,
  TunnelDrawOptions,  TUNNELSETTINGS_COMMAND_NAME} from './config'
import { CoalBunker } from './entity/CoalBunker'
import { ShaftRoadway } from './entity/ShaftRoadway'
import { TunnelRoadway } from './entity/TunnelRoadway'
import { registerTunnelI18n } from './i18n'
import { startTunnelRibbonButton, stopTunnelRibbonButton } from './ribbonButton'
import {
  startTunnelSettingsPanel,
  stopTunnelSettingsPanel
} from './settingsPanel'

/**
 * Tunnel (巷道) drawing plugin for cad-simple-viewer based applications.
 *
 * Bundles the complete feature with zero host source intrusion:
 * - `drawtunnel` command: fetch a GeoJSON document (plain or wrapped in an
 *   API envelope) and draw its points, lines, areas and text labels
 * - `tunnelclear` command: remove everything previously drawn by the plugin
 * - ribbon buttons injected into Home → Utilities (实用工具): draw + settings
 * - floating settings panel (line width, label size, label collision)
 * - en/zh/tr/cs UI strings
 *
 * Register it eagerly at application startup via
 * {@link registerTunnelPlugin} (the ribbon buttons must be available before
 * the command is first invoked, so lazy trigger-based loading does not fit).
 */
export class AcApTunnelPlugin implements AcApPlugin {
  /** @inheritdoc */
  name = 'TunnelPlugin'
  /** @inheritdoc */
  version = packageJson.version
  /** @inheritdoc */
  description =
    'Draw tunnel planning objects (points, lines, areas, text) from GeoJSON data'

  private readonly options: TunnelDrawOptions

  private entityRegistered = false

  /**
   * Creates the plugin.
   *
   * @param options - Defaults for the `drawtunnel` command (e.g. data URL).
   */
  constructor(options?: TunnelDrawOptions) {
    this.options = options ?? {}
  }

  /**
   * Registers the commands, ribbon buttons, settings panel and UI strings.
   *
   * @param _context - Application context (unused; the document is resolved
   *   at event time via `AcApDocManager.instance.curDocument`)
   * @param commandManager - Command stack used to register the commands
   */
  onLoad(_context: AcApContext, commandManager: AcEdCommandStack): void {
    setTunnelPluginOptions(this.options)
    if (!this.entityRegistered) {
      // Register once per plugin instance: the DXF registry keeps the factory
      // for the whole session and throws on duplicate registration.
      this.entityRegistered = true
      new TunnelRoadway().rxInit()
      new ShaftRoadway().rxInit()
      new CoalBunker().rxInit()
    }
    registerTunnelI18n()
    commandManager.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      DRAWTUNNEL_COMMAND_NAME,
      DRAWTUNNEL_COMMAND_NAME,
      new AcApDrawTunnelCmd(),
      'tunnel'
    )
    commandManager.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      TUNNELCLEAR_COMMAND_NAME,
      TUNNELCLEAR_COMMAND_NAME,
      new AcApTunnelClearCmd()
    )
    commandManager.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      TUNNELSETTINGS_COMMAND_NAME,
      TUNNELSETTINGS_COMMAND_NAME,
      new AcApTunnelSettingsCmd()
    )
    startTunnelRibbonButton()
    startTunnelSettingsPanel()
  }

  /**
   * Removes everything registered in {@link onLoad}.
   *
   * @param _context - Application context (unused)
   * @param commandManager - Command stack used to unregister the commands
   */
  onUnload(_context: AcApContext, commandManager: AcEdCommandStack): void {
    stopTunnelRibbonButton()
    stopTunnelSettingsPanel()
    commandManager.removeCmd(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      TUNNELSETTINGS_COMMAND_NAME
    )
    commandManager.removeCmd(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      TUNNELCLEAR_COMMAND_NAME
    )
    commandManager.removeCmd(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      DRAWTUNNEL_COMMAND_NAME
    )
  }
}

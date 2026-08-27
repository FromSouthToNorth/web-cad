import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@mlightcad/cad-simple-viewer'

import packageJson from '../package.json'
import { AcApSearchCmd } from './command/AcApSearchCmd'

/** Registered name of the content search plugin in the plugin manager. */
export const SEARCH_PLUGIN_NAME = 'SearchPlugin'

/**
 * Content search plugin: fuzzy text search over drawing entities.
 *
 * Registers the `search` (alias `find`) command, which opens the search
 * panel in the host tool palette.
 */
export class AcApSearchPlugin implements AcApPlugin {
  /** Plugin identifier used by {@link AcApPluginManager}. */
  name = SEARCH_PLUGIN_NAME
  /** Semantic version from `package.json`. */
  version = packageJson.version
  /** Short human-readable description shown in plugin listings. */
  description = 'Fuzzy content search over drawing text entities'

  /** Commands registered in {@link onLoad} for removal in {@link onUnload}. */
  private registeredCommands: Array<{ group: string; name: string }> = []

  /**
   * Registers the `search` system command that opens the search palette tab.
   *
   * @param _context - Application context (unused).
   * @param commandManager - Command stack used to register {@link AcApSearchCmd}.
   */
  onLoad(_context: AcApContext, commandManager: AcEdCommandStack): void {
    const group = AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME
    commandManager.addCommand(group, 'search', 'search', new AcApSearchCmd(), 'find')
    this.registeredCommands.push({ group, name: 'search' })
  }

  /**
   * Removes commands registered during {@link onLoad}.
   *
   * @param _context - Application context (unused).
   * @param commandManager - Command stack used to unregister search commands.
   */
  onUnload(_context: AcApContext, commandManager: AcEdCommandStack): void {
    for (const cmd of this.registeredCommands) {
      commandManager.removeCmd(cmd.group, cmd.name)
    }
    this.registeredCommands = []
  }
}

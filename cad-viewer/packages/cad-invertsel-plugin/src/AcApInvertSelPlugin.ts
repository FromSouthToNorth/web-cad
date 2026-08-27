import {
  AcApContext,
  AcApPlugin,
  AcEdCommandStack
} from '@mlightcad/cad-simple-viewer'

import packageJson from '../package.json'
import { AcApInvertSelCmd } from './AcApInvertSelCmd'
import { registerInvertSelI18n } from './i18n'
import {
  startInvertSelKeyHandler,
  stopInvertSelKeyHandler
} from './invertSelKeyHandler'
import {
  startInvertSelRibbonButton,
  stopInvertSelRibbonButton
} from './ribbonButton'

/**
 * Invert-selection plugin for cad-simple-viewer based applications.
 *
 * Bundles the complete feature with zero host source intrusion:
 * - `invertsel` system command (command line)
 * - ribbon button injected into Home → Utilities
 * - Ctrl+Shift+I / Cmd+Shift+I keyboard shortcut
 * - en/zh/tr/cs UI strings
 *
 * Register it eagerly at application startup via
 * {@link registerInvertSelPlugin} (the shortcut and ribbon button must be
 * available before the command is first invoked, so lazy trigger-based
 * loading does not fit).
 */
export class AcApInvertSelPlugin implements AcApPlugin {
  /** @inheritdoc */
  name = 'InvertSelPlugin'
  /** @inheritdoc */
  version = packageJson.version
  /** @inheritdoc */
  description =
    'Invert selection (invertsel) command with ribbon button and Ctrl/Cmd+Shift+I shortcut'

  /**
   * Registers the command, keyboard shortcut, ribbon button and UI strings.
   *
   * @param _context - Application context (unused; the view is resolved at
   *   event time via `AcApDocManager.instance.curView`)
   * @param commandManager - Command stack used to register `invertsel`
   */
  onLoad(_context: AcApContext, commandManager: AcEdCommandStack): void {
    registerInvertSelI18n()
    commandManager.addCommand(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      'invertsel',
      'invertsel',
      new AcApInvertSelCmd()
    )
    startInvertSelKeyHandler()
    startInvertSelRibbonButton()
  }

  /**
   * Removes everything registered in {@link onLoad}.
   *
   * @param _context - Application context (unused)
   * @param commandManager - Command stack used to unregister `invertsel`
   */
  onUnload(_context: AcApContext, commandManager: AcEdCommandStack): void {
    stopInvertSelRibbonButton()
    stopInvertSelKeyHandler()
    commandManager.removeCmd(
      AcEdCommandStack.SYSTEMT_COMMAND_GROUP_NAME,
      'invertsel'
    )
  }
}

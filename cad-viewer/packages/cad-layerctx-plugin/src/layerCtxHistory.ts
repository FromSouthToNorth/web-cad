import {
  AcApDocManager,
  type AcEdCommandEventArgs,
  AcEdOpenMode
} from '@mlightcad/cad-simple-viewer'

import type { LayerCtxMessageKey } from './i18n'

/**
 * Menu commands whose display name is a localized UI label instead of the raw
 * command name (`copy` → "Copy" / "复制" / …). Other commands repeat under
 * their registered command name.
 */
const DISPLAY_KEY_BY_COMMAND: Readonly<Record<string, LayerCtxMessageKey>> = {
  copy: 'menuCopy',
  move: 'menuMove',
  rotate: 'menuRotate',
  layctxscale: 'menuScale',
  layctxoffset: 'menuOffset',
  layctxdel: 'menuDelete',
  erase: 'menuDelete',
  layctxdsel: 'menuDeselect'
}

/**
 * Commands that end with no meaningful result to repeat: pure view
 * navigation, undo/redo bookkeeping and document/UI housekeeping.
 */
const NON_REPEATABLE_COMMANDS: ReadonlySet<string> = new Set([
  'pan',
  'zoom',
  'undo',
  'redo',
  'regen',
  'switchbg',
  'open',
  'qnew',
  'log',
  // Host-app UI commands (e.g. the example shell's upload-screen switch).
  'quit',
  'exit'
])

/** Last executed repeatable command, resolved lazily by the menu. */
export interface LayerCtxLastCommand {
  /** Lowercase command name for re-dispatch. */
  name: string
  /** i18n label key, when the command has a localized menu name. */
  displayKey?: LayerCtxMessageKey
  /**
   * Whether the command requires more than read access, i.e. the repeat item
   * must apply the same disabled rules as the other write items.
   */
  isWrite: boolean
}

let lastCommand: LayerCtxLastCommand | null = null

const onCommandEnded = (args: AcEdCommandEventArgs): void => {
  const command = args.command
  const name = command.globalName.toLowerCase()
  if (NON_REPEATABLE_COMMANDS.has(name)) return
  lastCommand = {
    name,
    displayKey: DISPLAY_KEY_BY_COMMAND[name],
    // Review and Write commands both modify the database, so a read-only
    // document must grey out their repeat item like any other write item.
    isWrite: command.mode >= AcEdOpenMode.Review
  }
}

/**
 * The last repeatable command, or `null` before any command has finished.
 */
export const getLastCommand = (): LayerCtxLastCommand | null => lastCommand

let isTracking = false

/**
 * Attaches the command-lifecycle listener backing the repeat item. No-op when
 * already attached.
 */
export function startLayerCtxHistory(): void {
  if (isTracking) return
  AcApDocManager.instance.editor.events.commandEnded.addEventListener(
    onCommandEnded
  )
  isTracking = true
}

/**
 * Detaches the listener installed by {@link startLayerCtxHistory}.
 */
export function stopLayerCtxHistory(): void {
  if (!isTracking) return
  AcApDocManager.instance.editor.events.commandEnded.removeEventListener(
    onCommandEnded
  )
  isTracking = false
  lastCommand = null
}

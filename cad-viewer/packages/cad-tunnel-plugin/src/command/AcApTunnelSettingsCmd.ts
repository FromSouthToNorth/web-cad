import {
  AcApContext,
  AcEdCommand
} from '@mlightcad/cad-simple-viewer'

import { toggleTunnelSettingsPanel } from '../settingsPanel'

/**
 * tunnelsettings command:
 * toggles the floating tunnel settings panel.
 *
 * The host ribbon of cad-viewer-example is declarative — every button
 * dispatches a command string — so the settings button needs this command
 * wrapper around the DOM panel toggle. It also makes the panel reachable
 * from the command line.
 */
export class AcApTunnelSettingsCmd extends AcEdCommand {
  async execute(_context: AcApContext): Promise<void> {
    toggleTunnelSettingsPanel()
  }
}

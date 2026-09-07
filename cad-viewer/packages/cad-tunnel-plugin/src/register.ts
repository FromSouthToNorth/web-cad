import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

import type { TunnelDrawOptions } from './config'

/** Plugin name used by {@link AcApTunnelPlugin}. */
export const TUNNEL_PLUGIN_NAME = 'TunnelPlugin'

/** Global name of the draw command. */
export const DRAWTUNNEL_COMMAND_NAME = 'drawtunnel'

/** Global name of the clear command. */
export const TUNNELCLEAR_COMMAND_NAME = 'tunnelclear'

/** Global name of the settings panel toggle command. */
export const TUNNELSETTINGS_COMMAND_NAME = 'tunnelsettings'

export type { TunnelDrawOptions }

/**
 * Loads the tunnel drawing plugin on the given plugin manager.
 *
 * Import from `@mlightcad/cad-tunnel-plugin/register` so the main plugin
 * bundle is not pulled into the application entry chunk.
 *
 * Like the invert-selection plugin this loads eagerly rather than on a
 * trigger command: the ribbon button must be in place before the user first
 * interacts.
 *
 * Safe to call multiple times; an already-loaded plugin is left untouched.
 *
 * @param pluginManager - Target plugin manager instance.
 * @param options - Optional defaults for the `drawtunnel` command (e.g. the
 *   GeoJSON data URL).
 */
export async function registerTunnelPlugin(
  pluginManager: AcApPluginManager,
  options?: TunnelDrawOptions
): Promise<void> {
  if (pluginManager.isPluginLoaded(TUNNEL_PLUGIN_NAME)) {
    return
  }
  const { createTunnelPlugin } = await import('@mlightcad/cad-tunnel-plugin')
  await pluginManager.loadPlugin(await createTunnelPlugin(options))
}

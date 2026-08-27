import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

/** Plugin name used by {@link AcApInvertSelPlugin}. */
export const INVERTSEL_PLUGIN_NAME = 'InvertSelPlugin'

/** Global name of the registered command. */
export const INVERTSEL_COMMAND_NAME = 'invertsel'

/**
 * Loads the invert-selection plugin on the given plugin manager.
 *
 * Import from `@mlightcad/cad-invertsel-plugin/register` so the main plugin
 * bundle is not pulled into the application entry chunk.
 *
 * Unlike the export plugins (pdf/html/svg) this plugin loads eagerly rather
 * than on a trigger command: its keyboard shortcut listener and ribbon button
 * must be in place before the user first interacts.
 *
 * Safe to call multiple times; an already-loaded plugin is left untouched.
 *
 * @param pluginManager - Target plugin manager instance.
 */
export async function registerInvertSelPlugin(
  pluginManager: AcApPluginManager
): Promise<void> {
  if (pluginManager.isPluginLoaded(INVERTSEL_PLUGIN_NAME)) {
    return
  }
  const { createInvertSelPlugin } = await import(
    '@mlightcad/cad-invertsel-plugin'
  )
  await pluginManager.loadPlugin(await createInvertSelPlugin())
}

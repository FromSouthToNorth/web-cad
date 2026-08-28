import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

/** Plugin name used by {@link AcApLayerCtxPlugin}. */
export const LAYERCTX_PLUGIN_NAME = 'LayerCtxPlugin'

/**
 * Loads the object context-menu plugin on the given plugin manager.
 *
 * Import from `@mlightcad/cad-layerctx-plugin/register` so the main plugin
 * bundle is not pulled into the application entry chunk.
 *
 * Unlike the export plugins (pdf/html/svg) this plugin loads eagerly rather
 * than on a trigger command: its keyboard shortcut listener and context menu
 * must be in place before the user first interacts.
 *
 * Safe to call multiple times; an already-loaded plugin is left untouched.
 *
 * @param pluginManager - Target plugin manager instance.
 */
export async function registerLayerCtxPlugin(
  pluginManager: AcApPluginManager
): Promise<void> {
  if (pluginManager.isPluginLoaded(LAYERCTX_PLUGIN_NAME)) {
    return
  }
  const { createLayerCtxPlugin } =
    await import('@mlightcad/cad-layerctx-plugin')
  await pluginManager.loadPlugin(await createLayerCtxPlugin())
}

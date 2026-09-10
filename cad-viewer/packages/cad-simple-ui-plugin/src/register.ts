import type { AcApPluginManager } from '@hy/cad-simple-viewer'

import type { AcExSimpleUiPluginOptions } from './config/types'

/**
 * Loads the simple UI plugin on the given plugin manager.
 *
 * Import from `@hy/cad-simple-ui-plugin/register` so the main plugin
 * bundle is not pulled into the application entry chunk.
 *
 * @param pluginManager - Target plugin manager instance.
 * @param options - Passed through to {@link createSimpleUiPlugin}.
 */
export async function registerSimpleUiPlugin(
  pluginManager: AcApPluginManager,
  options: AcExSimpleUiPluginOptions = {}
): Promise<void> {
  const { createSimpleUiPlugin } =
    await import('@hy/cad-simple-ui-plugin')
  await pluginManager.loadPlugin(createSimpleUiPlugin(options))
}

import type { AcApPluginManager } from '@mlightcad/cad-simple-viewer'

import { SEARCH_PLUGIN_NAME } from './AcApSearchPlugin'
import { registerSearchI18n } from './i18n'

/** Trigger commands handled by {@link SEARCH_PLUGIN_NAME}. */
export const SEARCH_PLUGIN_TRIGGERS = ['search', 'find'] as const

/**
 * Registers the content search plugin for lazy loading.
 *
 * Import from `@mlightcad/cad-search-plugin/register` so the main bundle
 * is not pulled into the application entry chunk.
 */
export function registerLazySearchPlugin(
  pluginManager: AcApPluginManager
): void {
  registerSearchI18n()

  pluginManager.registerLazyPlugin({
    name: SEARCH_PLUGIN_NAME,
    triggers: [...SEARCH_PLUGIN_TRIGGERS],
    loader: async () => {
      const { createSearchPlugin } = await import('@mlightcad/cad-search-plugin')
      return createSearchPlugin()
    }
  })
}

export { SEARCH_PLUGIN_NAME }
export { mergeSearchI18nIntoVueI18n, registerSearchI18n } from './i18n'
export {
  openSearchPalette,
  setSearchPaletteOpener
} from './palette/searchPaletteIntegration'
export type { SearchPaletteOpener } from './palette/searchPaletteIntegration'

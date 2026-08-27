/**
 * Public API types for `@mlightcad/cad-search-plugin/register`.
 * Copied to `lib/` by `pnpm build:types`; keep in sync with `src/register.ts`.
 */
import type {
  AcApLocale,
  AcApPluginManager
} from '@mlightcad/cad-simple-viewer'

/** Registered name of the content search plugin in the plugin manager. */
export declare const SEARCH_PLUGIN_NAME: 'SearchPlugin'

/** Trigger commands handled by {@link SEARCH_PLUGIN_NAME}. */
export declare const SEARCH_PLUGIN_TRIGGERS: readonly ['search', 'find']

/**
 * Registers the content search plugin for lazy loading.
 *
 * Import from `@mlightcad/cad-search-plugin/register` so the main bundle
 * is not pulled into the application entry chunk.
 */
export declare function registerLazySearchPlugin(
  pluginManager: AcApPluginManager
): void

export declare function registerSearchI18n(): void

/**
 * Merges search panel UI strings into a vue-i18n instance (e.g. cad-viewer).
 */
export declare function mergeSearchI18nIntoVueI18n(
  mergeLocaleMessage: (locale: AcApLocale, message: object) => void
): void

/** Callback that opens or focuses the search tab in the host tool palette. */
export type SearchPaletteOpener = () => void

export declare function setSearchPaletteOpener(
  opener: SearchPaletteOpener | undefined
): void

export declare function openSearchPalette(): boolean

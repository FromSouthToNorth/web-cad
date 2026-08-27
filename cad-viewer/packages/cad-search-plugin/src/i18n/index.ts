import { AcApI18n, type AcApLocale } from '@mlightcad/cad-simple-viewer'

import { searchCs } from './cs'
import { searchEn } from './en'
import { searchTr } from './tr'
import { searchZh } from './zh'

/** Vue i18n key prefix for all search panel strings (`main.toolPalette.search`). */
export const SEARCH_I18N_PREFIX = 'main.toolPalette.search'

/** Union of keys in {@link searchEn} used for type-safe translations. */
export type SearchPanelLabelKey = keyof typeof searchEn

/** Map of every search panel label key to its translated string. */
export type SearchPanelLabels = Record<SearchPanelLabelKey, string>

/** Locale-specific flat message tables before nesting under `main.toolPalette.search`. */
const searchMessagesByLocale = {
  en: searchEn,
  zh: searchZh,
  tr: searchTr,
  cs: searchCs
} as const satisfies Record<AcApLocale, SearchPanelLabels>

/** Guards {@link registerSearchI18n} against duplicate merges. */
let isRegistered = false

/**
 * Builds the nested vue-i18n message object for one locale.
 *
 * @param locale - Target locale.
 * @returns Messages shaped for `mergeLocaleMessage`.
 */
function buildVueMessages(locale: AcApLocale) {
  return {
    main: {
      toolPalette: {
        search: searchMessagesByLocale[locale]
      }
    }
  }
}

/**
 * Registers content search UI strings into {@link AcApI18n}.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function registerSearchI18n(): void {
  if (isRegistered) return

  AcApI18n.mergeLocaleMessage('en', buildVueMessages('en'))
  AcApI18n.mergeLocaleMessage('zh', buildVueMessages('zh'))
  AcApI18n.mergeLocaleMessage('tr', buildVueMessages('tr'))
  AcApI18n.mergeLocaleMessage('cs', buildVueMessages('cs'))
  isRegistered = true
}

/**
 * Merges search panel UI strings into a vue-i18n instance (e.g. cad-viewer).
 *
 * @param mergeLocaleMessage - Host app's `mergeLocaleMessage` callback.
 */
export function mergeSearchI18nIntoVueI18n(
  mergeLocaleMessage: (locale: AcApLocale, message: object) => void
): void {
  registerSearchI18n()
  mergeLocaleMessage('en', buildVueMessages('en'))
  mergeLocaleMessage('zh', buildVueMessages('zh'))
  mergeLocaleMessage('tr', buildVueMessages('tr'))
  mergeLocaleMessage('cs', buildVueMessages('cs'))
}

/**
 * Translates a single search panel label via {@link AcApI18n}.
 *
 * @param key - Label key from {@link searchEn}.
 * @param args - Optional interpolation values (e.g. `{ count }`).
 * @returns Localized string, or the key as fallback.
 */
export function searchT(
  key: SearchPanelLabelKey,
  args?: Record<string, unknown>
): string {
  const template = AcApI18n.t(`${SEARCH_I18N_PREFIX}.${key}`, {
    fallback: key
  })
  if (!args) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in args ? String(args[name]) : placeholder
  )
}

/**
 * Builds a reactive-friendly map of all search panel labels for the current locale.
 *
 * All label keys are derived from {@link searchEn} — add new strings in en.ts/zh.ts only.
 *
 * @returns Every {@link SearchPanelLabelKey} mapped to its translation.
 */
export function buildSearchLabels(): SearchPanelLabels {
  return Object.fromEntries(
    (Object.keys(searchEn) as SearchPanelLabelKey[]).map(key => [
      key,
      searchT(key)
    ])
  ) as SearchPanelLabels
}

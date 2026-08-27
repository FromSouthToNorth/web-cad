import { AcApI18n, type AcApLocale } from '@mlightcad/cad-simple-viewer'

/**
 * UI string keys provided by the invert-selection plugin.
 */
export type InvertSelMessageKey = 'ribbonLabel' | 'ribbonTooltip'

const MESSAGES: Record<AcApLocale, Record<InvertSelMessageKey, string>> = {
  en: {
    ribbonLabel: 'Invert\nSelect',
    ribbonTooltip:
      'Invert the current selection set: selected entities are deselected and all others are selected (Ctrl+Shift+I).'
  },
  zh: {
    ribbonLabel: '反选',
    ribbonTooltip:
      '反选当前选择集：已选图元取消选择，未选图元全部选中（Ctrl+Shift+I）。'
  },
  tr: {
    ribbonLabel: 'Ters\nSeçim',
    ribbonTooltip:
      'Geçerli seçim kümesini tersine çevirir: seçili nesnelerin seçimi kaldırılır ve diğerleri seçilir (Ctrl+Shift+I).'
  },
  cs: {
    ribbonLabel: 'Obrátit\nvýběr',
    ribbonTooltip:
      'Obrátí aktuální výběr: vybrané objekty se zruší a všechny ostatní se vyberou (Ctrl+Shift+I).'
  }
}

const SUPPORTED_LOCALES: readonly AcApLocale[] = ['en', 'zh', 'tr', 'cs']

/**
 * Resolves the initial UI locale with the same priority as the host viewer
 * (`useLocale`): stored user choice > browser language (tr/cs) > default zh.
 *
 * `AcApI18n.currentLocale` cannot be used for this because the host does not
 * synchronize the stored locale into `AcApI18n` on startup; it only calls
 * `AcApI18n.setCurrentLocale` when the user switches language at runtime.
 */
const resolveInitialLocale = (): AcApLocale => {
  try {
    const stored = window.localStorage.getItem('preferred_lang')
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as AcApLocale
    }
    const browserPrefix = navigator.language.toLowerCase().substring(0, 2)
    if (browserPrefix === 'tr' || browserPrefix === 'cs') return browserPrefix
  } catch {
    // No DOM (tests/SSR) or localStorage unavailable — use the default.
  }
  return 'zh'
}

let currentLocale: AcApLocale | undefined

/**
 * Registers the plugin's messages into {@link AcApI18n} so they are reachable
 * through `AcApI18n.t('invertsel.<key>')`. Safe to call multiple times.
 */
export function registerInvertSelI18n(): void {
  for (const locale of SUPPORTED_LOCALES) {
    AcApI18n.registerMessage(locale, { invertsel: MESSAGES[locale] })
  }
}

/**
 * Translates one plugin UI string for the currently active locale.
 */
export function invertSelT(key: InvertSelMessageKey): string {
  currentLocale ??= resolveInitialLocale()
  return MESSAGES[currentLocale][key]
}

/**
 * Starts tracking host locale switches broadcast through
 * {@link AcApI18n.events.localeChanged}. `onChange` runs after every switch so
 * injected UI can re-apply its strings.
 *
 * @returns Unsubscribe function.
 */
export function startInvertSelLocaleSync(onChange: () => void): () => void {
  const listener = (args: { old: AcApLocale; new: AcApLocale }) => {
    currentLocale = args.new
    onChange()
  }
  AcApI18n.events.localeChanged.addEventListener(listener)
  return () => AcApI18n.events.localeChanged.removeEventListener(listener)
}

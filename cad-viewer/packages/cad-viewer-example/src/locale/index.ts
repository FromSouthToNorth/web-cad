import { AcApI18n } from '@mlightcad/cad-simple-viewer'

import en from './en'
import zh from './zh'

export const initializeLocale = () => {
  AcApI18n.mergeLocaleMessage('en', en)
  AcApI18n.mergeLocaleMessage('zh', zh)

  // Keep engine-owned UI (command line, prompts) in sync with the Vue i18n
  // locale. The viewer core itself does not apply `preferred_lang` unless
  // the language selector is used; apply the stored choice up front.
  const stored = localStorage.getItem('preferred_lang')
  if (stored === 'en' || stored === 'zh' || stored === 'tr' || stored === 'cs') {
    AcApI18n.setCurrentLocale(stored)
  }
}

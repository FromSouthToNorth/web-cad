import { AcApI18n } from '@mlightcad/cad-simple-viewer'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { type SearchPanelLabelKey, buildSearchLabels, searchT } from './index'

/**
 * Reactive search panel UI strings that follow {@link AcApI18n} locale changes.
 *
 * @returns `labels` — computed map of all panel strings; `t` — translate one key.
 */
export function useSearchI18n() {
  /** Bumped on locale change to invalidate computed labels. */
  const localeVersion = ref(0)

  /** Invalidates cached labels when {@link AcApI18n} fires `localeChanged`. */
  const handleLocaleChanged = () => {
    localeVersion.value++
  }

  onMounted(() => {
    AcApI18n.events.localeChanged.addEventListener(handleLocaleChanged)
  })

  onUnmounted(() => {
    AcApI18n.events.localeChanged.removeEventListener(handleLocaleChanged)
  })

  const labels = computed(() => {
    void localeVersion.value
    return buildSearchLabels()
  })

  /**
   * Translates one search panel label, re-evaluating when the locale changes.
   *
   * @param key - Label key from {@link searchEn}.
   * @param args - Optional interpolation values (e.g. `{ count }`).
   */
  const t = (key: SearchPanelLabelKey, args?: Record<string, unknown>) => {
    void localeVersion.value
    return searchT(key, args)
  }

  return { labels, t }
}

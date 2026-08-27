/**
 * Turkish UI strings for the content search panel.
 *
 * Flat keys under `main.toolPalette.search` (merged into {@link AcApI18n}).
 * Keys must stay in sync with {@link searchEn}.
 */
export const searchTr = {
  tab: 'Ara',
  title: 'İçerik Arama',
  searchPlaceholder: 'Metin içeriği ara…',
  clear: 'Temizle',
  emptyHint:
    'Çizim metinlerinde aramak için anahtar kelime girin (TEXT / MTEXT / ATTRIB / MLEADER / DIMENSION).',
  noResults: 'Eşleşen metin bulunamadı',
  resultCount: '{count} sonuç',
  locateTooltip: 'Bu varlığı seç ve yakınlaştır',
  locateNextTooltip: 'Sonraki eşleşmeyi bul (Enter)'
} as const

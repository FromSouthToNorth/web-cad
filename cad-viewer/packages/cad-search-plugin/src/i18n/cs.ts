/**
 * Czech UI strings for the content search panel.
 *
 * Flat keys under `main.toolPalette.search` (merged into {@link AcApI18n}).
 * Keys must stay in sync with {@link searchEn}.
 */
export const searchCs = {
  tab: 'Hledat',
  title: 'Vyhledávání obsahu',
  searchPlaceholder: 'Hledat textový obsah…',
  clear: 'Vymazat',
  emptyHint:
    'Zadejte klíčové slovo pro hledání textu ve výkresu (TEXT / MTEXT / ATTRIB / MLEADER / DIMENSION).',
  noResults: 'Nebyl nalezen žádný odpovídající text',
  resultCount: '{count} výsledků',
  locateTooltip: 'Vybrat a přiblížit tento prvek',
  locateNextTooltip: 'Najít další shodu (Enter)'
} as const

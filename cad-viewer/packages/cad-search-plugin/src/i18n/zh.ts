/**
 * Chinese UI strings for the content search panel.
 *
 * Flat keys under `main.toolPalette.search` (merged into {@link AcApI18n}).
 * Keys must stay in sync with {@link searchEn}.
 */
export const searchZh = {
  tab: '搜索',
  title: '内容搜索',
  searchPlaceholder: '搜索文字内容…',
  clear: '清空',
  emptyHint:
    '输入关键词以搜索图纸中的文字（TEXT / MTEXT / 属性 / 引线 / 标注）。',
  noResults: '未找到匹配的文字',
  resultCount: '{count} 个结果',
  locateTooltip: '选中并缩放到该图元',
  locateNextTooltip: '定位下一个匹配项 (Enter)'
} as const

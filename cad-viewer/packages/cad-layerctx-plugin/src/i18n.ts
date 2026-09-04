import { AcApI18n, type AcApLocale } from '@mlightcad/cad-simple-viewer'

/**
 * UI string keys provided by the object context-menu plugin.
 */
export type LayerCtxMessageKey =
  | 'menuDelete'
  | 'menuCopy'
  | 'menuMove'
  | 'menuScale'
  | 'menuRotate'
  | 'menuOffset'
  | 'menuDeselect'
  | 'menuPan'
  | 'menuZoom'
  | 'menuRepeat'
  | 'menuTitleSelected'
  | 'jigScaleBasePoint'
  | 'jigScaleReferencePoint'
  | 'jigScaleSecondPoint'
  | 'jigOffsetDistance'
  | 'jigOffsetSidePoint'
  | 'msgNoObjectsSelected'
  | 'msgObjectsDeleted'
  | 'msgNoOffsettableObjects'
  | 'msgInvalidOffsetDistance'
  | 'msgReadOnlyDocument'

type LayerCtxMessages = Record<LayerCtxMessageKey, string>

const MESSAGES: Record<AcApLocale, LayerCtxMessages> = {
  en: {
    menuDelete: 'Delete',
    menuCopy: 'Copy',
    menuMove: 'Move',
    menuScale: 'Scale',
    menuRotate: 'Rotate',
    menuOffset: 'Offset',
    menuDeselect: 'Deselect All',
    menuPan: 'Pan',
    menuZoom: 'Zoom',
    menuRepeat: 'Repeat {command}',
    menuTitleSelected: 'Selected: {count} object(s)',
    jigScaleBasePoint: 'Specify base point for scale',
    jigScaleReferencePoint: 'Specify reference length (first point)',
    jigScaleSecondPoint: 'Specify new length (second point) or type scale factor',
    jigOffsetDistance: 'Specify offset distance',
    jigOffsetSidePoint: 'Specify side to offset',
    msgNoObjectsSelected: 'Select objects on the canvas first.',
    msgObjectsDeleted: 'Deleted {count} object(s).',
    msgNoOffsettableObjects: 'None of the selected objects can be offset.',
    msgInvalidOffsetDistance: 'Offset distance must be greater than 0.',
    msgReadOnlyDocument: 'The current document is read-only.'
  },
  zh: {
    menuDelete: '删除',
    menuCopy: '复制',
    menuMove: '移动',
    menuScale: '缩放',
    menuRotate: '旋转',
    menuOffset: '偏移',
    menuDeselect: '取消选择',
    menuPan: '平移',
    menuZoom: '视图缩放',
    menuRepeat: '重复 {command}',
    menuTitleSelected: '已选中 {count} 个对象',
    jigScaleBasePoint: '指定缩放基点',
    jigScaleReferencePoint: '指定参考长度（第一点）',
    jigScaleSecondPoint: '指定新长度（第二点）或输入缩放比例',
    jigOffsetDistance: '指定偏移距离',
    jigOffsetSidePoint: '指定要偏移到的那一侧',
    msgNoObjectsSelected: '请先在画布上选中对象。',
    msgObjectsDeleted: '已删除 {count} 个对象。',
    msgNoOffsettableObjects: '所选对象中没有可偏移的对象。',
    msgInvalidOffsetDistance: '偏移距离必须大于 0。',
    msgReadOnlyDocument: '当前文档为只读，无法执行写操作。'
  },
  tr: {
    menuDelete: 'Sil',
    menuCopy: 'Kopyala',
    menuMove: 'Taşı',
    menuScale: 'Ölçekle',
    menuRotate: 'Döndür',
    menuOffset: 'Ofsetle',
    menuDeselect: 'Seçimi Kaldır',
    menuPan: 'Kaydır',
    menuZoom: 'Yakınlaştır',
    menuRepeat: '{command} komutunu tekrarla',
    menuTitleSelected: 'Seçili: {count} nesne',
    jigScaleBasePoint: 'Ölçek için taban noktası belirtin',
    jigScaleReferencePoint: 'Referans uzunluğu belirtin (ilk nokta)',
    jigScaleSecondPoint: 'Yeni uzunluğu belirtin (ikinci nokta) veya ölçek faktörü girin',
    jigOffsetDistance: 'Ofset mesafesini belirtin',
    jigOffsetSidePoint: 'Ofsetlenecek tarafı belirtin',
    msgNoObjectsSelected: 'Önce tuvalde nesne seçin.',
    msgObjectsDeleted: '{count} nesne silindi.',
    msgNoOffsettableObjects: 'Seçili nesneler arasında ofsetlenebilecek nesne yok.',
    msgInvalidOffsetDistance: 'Ofset mesafesi 0\'dan büyük olmalıdır.',
    msgReadOnlyDocument: 'Geçerli belge salt okunur.'
  },
  cs: {
    menuDelete: 'Smazat',
    menuCopy: 'Kopírovat',
    menuMove: 'Přesunout',
    menuScale: 'Změnit měřítko',
    menuRotate: 'Otočit',
    menuOffset: 'Odsadit',
    menuDeselect: 'Zrušit výběr',
    menuPan: 'Posun',
    menuZoom: 'Zoom',
    menuRepeat: 'Opakovat {command}',
    menuTitleSelected: 'Vybráno: {count} objektů',
    jigScaleBasePoint: 'Zadejte základní bod měřítka',
    jigScaleReferencePoint: 'Zadejte referenční délku (první bod)',
    jigScaleSecondPoint: 'Zadejte novou délku (druhý bod) nebo zadejte měřítko',
    jigOffsetDistance: 'Zadejte vzdálenost odsazení',
    jigOffsetSidePoint: 'Zadejte stranu odsazení',
    msgNoObjectsSelected: 'Nejprve vyberte objekty na plátně.',
    msgObjectsDeleted: 'Smazáno objektů: {count}.',
    msgNoOffsettableObjects: 'Mezi vybranými objekty není žádný, který lze odsadit.',
    msgInvalidOffsetDistance: 'Vzdálenost odsazení musí být větší než 0.',
    msgReadOnlyDocument: 'Aktuální dokument je jen pro čtení.'
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
 * through `AcApI18n.t('layerctx.<key>')`. Safe to call multiple times.
 */
export function registerLayerCtxI18n(): void {
  for (const locale of SUPPORTED_LOCALES) {
    AcApI18n.registerMessage(locale, { layerctx: MESSAGES[locale] })
  }
}

/**
 * Translates one plugin UI string for the currently active locale and applies
 * `{param}` interpolation.
 */
export function layerCtxT(
  key: LayerCtxMessageKey,
  params?: Record<string, string>
): string {
  currentLocale ??= resolveInitialLocale()
  let text: string = MESSAGES[currentLocale][key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(value)
    }
  }
  return text
}

/**
 * Starts tracking host locale switches broadcast through
 * {@link AcApI18n.events.localeChanged} so subsequently opened menus and
 * dialogs use the new language.
 *
 * @returns Unsubscribe function.
 */
export function startLayerCtxLocaleSync(): () => void {
  const listener = (args: { old: AcApLocale; new: AcApLocale }) => {
    currentLocale = args.new
  }
  AcApI18n.events.localeChanged.addEventListener(listener)
  return () => AcApI18n.events.localeChanged.removeEventListener(listener)
}

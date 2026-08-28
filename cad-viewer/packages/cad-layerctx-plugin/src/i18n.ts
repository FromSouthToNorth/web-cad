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
  | 'menuDeselect'
  | 'menuTitleSelected'
  | 'jigScaleBasePoint'
  | 'jigScaleReferencePoint'
  | 'jigScaleSecondPoint'
  | 'msgNoObjectsSelected'
  | 'msgObjectsDeleted'
  | 'msgReadOnlyDocument'

type LayerCtxMessages = Record<LayerCtxMessageKey, string>

const MESSAGES: Record<AcApLocale, LayerCtxMessages> = {
  en: {
    menuDelete: 'Delete',
    menuCopy: 'Copy',
    menuMove: 'Move',
    menuScale: 'Scale',
    menuRotate: 'Rotate',
    menuDeselect: 'Deselect All',
    menuTitleSelected: 'Selected: {count} object(s)',
    jigScaleBasePoint: 'Specify base point for scale',
    jigScaleReferencePoint: 'Specify reference length (first point)',
    jigScaleSecondPoint: 'Specify new length (second point) or type scale factor',
    msgNoObjectsSelected: 'Select objects on the canvas first.',
    msgObjectsDeleted: 'Deleted {count} object(s).',
    msgReadOnlyDocument: 'The current document is read-only.'
  },
  zh: {
    menuDelete: '删除',
    menuCopy: '复制',
    menuMove: '移动',
    menuScale: '缩放',
    menuRotate: '旋转',
    menuDeselect: '取消选择',
    menuTitleSelected: '已选中 {count} 个对象',
    jigScaleBasePoint: '指定缩放基点',
    jigScaleReferencePoint: '指定参考长度（第一点）',
    jigScaleSecondPoint: '指定新长度（第二点）或输入缩放比例',
    msgNoObjectsSelected: '请先在画布上选中对象。',
    msgObjectsDeleted: '已删除 {count} 个对象。',
    msgReadOnlyDocument: '当前文档为只读，无法执行写操作。'
  },
  tr: {
    menuDelete: 'Sil',
    menuCopy: 'Kopyala',
    menuMove: 'Taşı',
    menuScale: 'Ölçekle',
    menuRotate: 'Döndür',
    menuDeselect: 'Seçimi Kaldır',
    menuTitleSelected: 'Seçili: {count} nesne',
    jigScaleBasePoint: 'Ölçek için taban noktası belirtin',
    jigScaleReferencePoint: 'Referans uzunluğu belirtin (ilk nokta)',
    jigScaleSecondPoint: 'Yeni uzunluğu belirtin (ikinci nokta) veya ölçek faktörü girin',
    msgNoObjectsSelected: 'Önce tuvalde nesne seçin.',
    msgObjectsDeleted: '{count} nesne silindi.',
    msgReadOnlyDocument: 'Geçerli belge salt okunur.'
  },
  cs: {
    menuDelete: 'Smazat',
    menuCopy: 'Kopírovat',
    menuMove: 'Přesunout',
    menuScale: 'Změnit měřítko',
    menuRotate: 'Otočit',
    menuDeselect: 'Zrušit výběr',
    menuTitleSelected: 'Vybráno: {count} objektů',
    jigScaleBasePoint: 'Zadejte základní bod měřítka',
    jigScaleReferencePoint: 'Zadejte referenční délku (první bod)',
    jigScaleSecondPoint: 'Zadejte novou délku (druhý bod) nebo zadejte měřítko',
    msgNoObjectsSelected: 'Nejprve vyberte objekty na plátně.',
    msgObjectsDeleted: 'Smazáno objektů: {count}.',
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

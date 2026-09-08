import { AcApI18n, type AcApLocale } from '@mlightcad/cad-simple-viewer'

/**
 * UI string keys provided by the tunnel plugin.
 */
export type TunnelMessageKey =
  | 'ribbonLabel'
  | 'ribbonTooltip'
  | 'ribbonSettingsLabel'
  | 'ribbonSettingsTooltip'
  | 'draw.urlPrompt'
  | 'draw.noUrl'
  | 'draw.loading'
  | 'draw.noDocument'
  | 'draw.fetchFailed'
  | 'draw.parseFailed'
  | 'draw.noData'
  | 'draw.done'
  | 'draw.labelsHidden'
  | 'clear.none'
  | 'clear.done'
  | 'panel.title'
  | 'panel.width'
  | 'panel.widthTip'
  | 'panel.labelHeight'
  | 'panel.labelHeightTip'
  | 'panel.labelAuto'
  | 'panel.collision'
  | 'panel.collisionTip'
  | 'panel.close'
  | 'panel.noDocument'
  | 'panel.applyDone'

const MESSAGES: Record<AcApLocale, Record<TunnelMessageKey, string>> = {
  en: {
    ribbonLabel: 'Read\nTunnel',
    ribbonTooltip:
      'Read tunnel planning objects (points, lines, areas, text) from a GeoJSON data source.',
    ribbonSettingsLabel: 'Tunnel\nSettings',
    ribbonSettingsTooltip:
      'Open the tunnel settings panel (line width, label size, label collision avoidance).',
    'draw.urlPrompt': 'GeoJSON data URL:',
    'draw.noUrl': 'No data URL provided, cancelled.',
    'draw.loading': 'Reading tunnel data…',
    'draw.noDocument': 'No drawing document is open.',
    'draw.fetchFailed': 'Failed to fetch GeoJSON data:',
    'draw.parseFailed': 'Failed to parse GeoJSON data:',
    'draw.noData': 'The data contains no drawable objects.',
    'draw.done':
      'Drew {total} objects (points {point}, lines {line}, areas {area}, shafts {shaft}, texts {text}).',
    'draw.labelsHidden': '({count} names hidden by collision avoidance)',
    'clear.none': 'No tunnel objects found on the tunnel layers.',
    'clear.done': 'Cleared {count} tunnel objects.',
    'panel.title': 'Tunnel Settings',
    'panel.width': 'Tunnel line width',
    'panel.widthTip': 'Width of the roadway entities, in drawing units.',
    'panel.labelHeight': 'Label size',
    'panel.labelHeightTip':
      'Text height of the tunnel names in drawing units; 0 derives it from the drawing extent.',
    'panel.labelAuto': 'auto',
    'panel.collision': 'Avoid overlapping labels',
    'panel.collisionTip': 'Hide tunnel names that would overlap each other.',
    'panel.close': 'Close',
    'panel.noDocument': 'No drawing document is open.',
    'panel.applyDone':
      'Applied: width {width}, label size {height}, collision avoidance {collision} ({updated} objects updated, {shown} labels shown, {hidden} hidden).'
  },
  zh: {
    ribbonLabel: '读取\n巷道',
    ribbonTooltip:
      '从 GeoJSON 数据源读取巷道数据并绘制规划对象（点、线、面、文字）。',
    ribbonSettingsLabel: '巷道\n设置',
    ribbonSettingsTooltip:
      '打开巷道设置面板（线宽、名称大小、名称碰撞避让）。',
    'draw.urlPrompt': 'GeoJSON 数据地址（URL）：',
    'draw.noUrl': '未提供数据地址，已取消。',
    'draw.loading': '正在读取巷道数据…',
    'draw.noDocument': '当前没有打开的图纸文档。',
    'draw.fetchFailed': '获取 GeoJSON 数据失败：',
    'draw.parseFailed': '解析 GeoJSON 数据失败：',
    'draw.noData': '数据中没有可绘制的对象。',
    'draw.done': '已绘制 {total} 个对象（点 {point}、线 {line}、面 {area}、立井/煤仓 {shaft}、文字 {text}）。',
    'draw.labelsHidden': '（{count} 个名称因碰撞被隐藏）',
    'clear.none': '巷道图层上没有找到对象。',
    'clear.done': '已清除 {count} 个巷道对象。',
    'panel.title': '巷道设置',
    'panel.width': '巷道线宽',
    'panel.widthTip': '巷道（Roadway）实体宽度，单位与图纸一致。',
    'panel.labelHeight': '名称大小',
    'panel.labelHeightTip': '巷道名称文字高度（图纸单位）；0 表示按图纸范围自动计算。',
    'panel.labelAuto': '自动',
    'panel.collision': '名称碰撞避让',
    'panel.collisionTip': '隐藏相互重叠的巷道名称。',
    'panel.close': '关闭',
    'panel.noDocument': '当前没有打开的图纸文档。',
    'panel.applyDone':
      '已应用：线宽 {width}、名称大小 {height}、碰撞避让 {collision}（更新 {updated} 个对象，显示 {shown} 个名称，隐藏 {hidden} 个）。'
  },
  tr: {
    ribbonLabel: 'Tünel\nÇiz',
    ribbonTooltip:
      'GeoJSON veri kaynağından tünel planlama nesneleri (nokta, çizgi, alan, yazı) çizer.',
    ribbonSettingsLabel: 'Tünel\nAyarları',
    ribbonSettingsTooltip:
      'Tünel ayarları panelini açar (çizgi kalınlığı, yazı boyutu, çakışma önleme).',
    'draw.urlPrompt': 'GeoJSON veri URL:',
    'draw.noUrl': 'Veri URL verilmedi, iptal edildi.',
    'draw.loading': 'Tünel verisi okunuyor…',
    'draw.noDocument': 'Açık bir çizim belgesi yok.',
    'draw.fetchFailed': 'GeoJSON verisi alınamadı:',
    'draw.parseFailed': 'GeoJSON verisi çözümlenemedi:',
    'draw.noData': 'Veride çizilebilir nesne yok.',
    'draw.done':
      '{total} nesne çizildi (nokta {point}, çizgi {line}, alan {area}, kuyu {shaft}, yazı {text}).',
    'draw.labelsHidden': '({count} ad çakışma önleme nedeniyle gizlendi)',
    'clear.none': 'Tünel katmanlarında nesne bulunamadı.',
    'clear.done': '{count} tünel nesnesi temizlendi.',
    'panel.title': 'Tünel Ayarları',
    'panel.width': 'Tünel çizgi kalınlığı',
    'panel.widthTip': 'Yol (Roadway) nesnelerinin genişliği, çizim birimi cinsinden.',
    'panel.labelHeight': 'Yazı boyutu',
    'panel.labelHeightTip':
      'Tünel adı yazı yüksekliği (çizim birimi); 0 çizim kapsamına göre otomatik hesaplanır.',
    'panel.labelAuto': 'otomatik',
    'panel.collision': 'Çakışan adları gizle',
    'panel.collisionTip': 'Birbiriyle çakışacak tünel adlarını gizler.',
    'panel.close': 'Kapat',
    'panel.noDocument': 'Açık bir çizim belgesi yok.',
    'panel.applyDone':
      'Uygulandı: genişlik {width}, yazı boyutu {height}, çakışma önleme {collision} ({updated} nesne güncellendi, {shown} ad gösteriliyor, {hidden} gizli).'
  },
  cs: {
    ribbonLabel: 'Kreslit\nštolu',
    ribbonTooltip:
      'Vykreslí objekty plánování štol (body, čáry, plochy, text) ze zdroje GeoJSON.',
    ribbonSettingsLabel: 'Nastavení\nštol',
    ribbonSettingsTooltip:
      'Otevře panel nastavení štol (tloušťka čáry, velikost popisku, předcházení kolizím).',
    'draw.urlPrompt': 'URL dat GeoJSON:',
    'draw.noUrl': 'Nebyla zadána adresa dat, zrušeno.',
    'draw.loading': 'Načítání dat štol…',
    'draw.noDocument': 'Není otevřen žádný výkresový dokument.',
    'draw.fetchFailed': 'Nepodařilo se načíst data GeoJSON:',
    'draw.parseFailed': 'Nepodařilo se analyzovat data GeoJSON:',
    'draw.noData': 'Data neobsahují žádné kreslitelné objekty.',
    'draw.done':
      'Vykresleno {total} objektů (body {point}, čáry {line}, plochy {area}, jámy {shaft}, texty {text}).',
    'draw.labelsHidden': '({count} popisků skryto kvůli kolizi)',
    'clear.none': 'Na vrstvách štol nebyly nalezeny žádné objekty.',
    'clear.done': 'Odstraněno {count} objektů štol.',
    'panel.title': 'Nastavení štol',
    'panel.width': 'Tloušťka čáry štoly',
    'panel.widthTip': 'Šířka objektů štol v jednotkách výkresu.',
    'panel.labelHeight': 'Velikost popisku',
    'panel.labelHeightTip':
      'Výška textu názvů štol v jednotkách výkresu; 0 odvodí velikost z rozsahu výkresu.',
    'panel.labelAuto': 'auto',
    'panel.collision': 'Skrýt překrývající se popisky',
    'panel.collisionTip': 'Skryje názvy štol, které by se navzájem překrývaly.',
    'panel.close': 'Zavřít',
    'panel.noDocument': 'Není otevřen žádný výkresový dokument.',
    'panel.applyDone':
      'Použito: šířka {width}, velikost popisku {height}, předcházení kolizím {collision} ({updated} objektů aktualizováno, {shown} popisků zobrazeno, {hidden} skryto).'
  }
}

const SUPPORTED_LOCALES: readonly AcApLocale[] = ['en', 'zh', 'tr', 'cs']

/**
 * Resolves the initial UI locale with the same priority as the host viewer
 * (`useLocale`): stored user choice > browser language (tr/cs) > default zh.
 *
 * `AcApI18n.currentLocale` cannot be used for this because the host does not
 * synchronize the stored locale into `AcApI18n` on startup.
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
 * through `AcApI18n.t('tunnel.<key>')`. Safe to call multiple times.
 */
export function registerTunnelI18n(): void {
  for (const locale of SUPPORTED_LOCALES) {
    AcApI18n.registerMessage(locale, { tunnel: MESSAGES[locale] })
  }
}

/**
 * Translates one plugin UI string for the currently active locale, replacing
 * `{name}` placeholders from `params`.
 */
export function tunnelT(
  key: TunnelMessageKey,
  params?: Record<string, string | number>
): string {
  currentLocale ??= resolveInitialLocale()
  let message = MESSAGES[currentLocale][key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.split(`{${name}}`).join(String(value))
    }
  }
  return message
}

/**
 * Starts tracking host locale switches broadcast through
 * {@link AcApI18n.events.localeChanged}. `onChange` runs after every switch so
 * injected UI can re-apply its strings.
 *
 * @returns Unsubscribe function.
 */
export function startTunnelLocaleSync(onChange: () => void): () => void {
  const listener = (args: { old: AcApLocale; new: AcApLocale }) => {
    currentLocale = args.new
    onChange()
  }
  AcApI18n.events.localeChanged.addEventListener(listener)
  return () => AcApI18n.events.localeChanged.removeEventListener(listener)
}

import { AcCmEventManager } from '@hy/data-model'
import {
  ColorSettings,
  createDefaultColorSettings,
  DefaultFontsPreset,
  FontLoadStatus,
  FontManager,
  type MemoryUsageReport,
  MTextData,
  MTextObject,
  RenderMode,
  ShapeData,
  StyleManager,
  TextStyle,
  UnifiedRenderer
} from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

import { AcTrStyleManager } from '../style/AcTrStyleManager'
import { AcTrSubEntityTraitsUtil } from '../util'
import {
  AcTrMTextGlyphCache,
  AcTrMTextGlyphCacheStats,
  clonePlacedMTextTemplate
} from './AcTrMTextGlyphCache'

/** Maximum number of missing characters reported for one font. */
const MAX_REPORTED_MISSING_CHARS = 256

/**
 * Maximum number of distinct font names allowed in {@link AcTrMTextRenderer.missedFonts}.
 *
 * Mirror counts are display/reporting data, not functional state, so a bounded
 * map is enough: no real drawing declares more text faces than this.
 */
const MAX_MISSED_FONT_ENTRIES = 256

/**
 * Maximum number of keys tracked in {@link AcTrMTextRenderer._pendingGlyphKeys}.
 *
 * That map remembers content rendered exactly once so a second occurrence can
 * be promoted into the glyph cache. A drawing whose labels are mostly unique
 * (380k-entity plans) would otherwise retain one key per MTEXT entity for the
 * whole session, and each key embeds the full text plus its style and colour
 * JSON.
 */
const MAX_PENDING_GLYPH_KEYS = 4096

/**
 * Minimum interval between font-resolution probes.
 *
 * A probe is one synchronous shape lookup, but it runs on the MTEXT draw path,
 * so entity bursts (a document open, a redraw) must not turn it into per-entity
 * work. Each face is reported at most once anyway, so throttling only delays
 * the single diagnostic.
 */
const FONT_PROBE_INTERVAL_MS = 1000

/**
 * Matches printable characters that need a glyph.
 *
 * Whitespace and MTEXT formatting syntax (`\`, `%`, `{}`, `;`) render without a
 * font glyph, so they must not be counted as misses.
 *
 * @remarks
 * The `u` flag is unavailable (the package targets ES5 module output), so the
 * pattern is iterated per UTF-16 code unit. An astral character can therefore
 * be counted as two misses; that only affects the reported character list, and
 * MTEXT bodies are overwhelmingly BMP text.
 */
const PRINTABLE_CHAR_PATTERN = /[^\s\\%{};]/

/**
 * Matches the MTEXT/RTEXT inline formatting codes that carry no glyph.
 *
 * Paragraph (`\P`), stacking, toggles (`\L` `\O` `\K`), alignment, colour,
 * height, width and font overrides, and the `%%d` style symbol escapes. Font,
 * height and width codes take their parameter greedily, which is also how the
 * parser reads them, so the parameter text is removed as well.
 */
const MTEXT_CONTROL_CODE_PATTERN =
  /\\[LlOoKkXxPp~]|\\[ACFHQWafhq]\d[^;]*;|\\[ACFHQWafhq][^;\\]*;|%\d{2,3}|%%./g

/** Fallback glyph size used when neither the entity nor the style sets one. */
const DEFAULT_PROBE_SIZE = 1

/**
 * One listener channel of the main-thread `FontManager` event hub.
 *
 * `removeEventListener` is optional because unit tests replace the whole
 * `@mlightcad/mtext-renderer` module with mocks that only expose
 * `addEventListener`.
 */
interface FontManagerEventChannel<TListener> {
  addEventListener: (listener: TListener) => void
  removeEventListener?: (listener: TListener) => void
}

/** Accessor shape used to read the mocked/singleton FontManager event hub. */
interface FontManagerEventHub {
  events?: {
    fontLoaded?: FontManagerEventChannel<() => void>
    fontNotFound?: FontManagerEventChannel<
      (args: { fontName?: string; count?: number }) => void
    >
  }
}

/**
 * Reads the main-thread `FontManager` event hub defensively.
 *
 * Unit tests replace the whole `@mlightcad/mtext-renderer` module with mocks
 * that only provide `UnifiedRenderer`, so every access is optional.
 */
function getFontManagerEvents(): FontManagerEventHub['events'] | undefined {
  const manager = FontManager as unknown as
    | { instance?: FontManagerEventHub }
    | undefined
  return manager?.instance?.events
}

/** Picks the primary face name out of a text style. */
function resolveStyleFontName(textStyle: TextStyle): string | undefined {
  const primary = textStyle?.font
  if (typeof primary === 'string' && primary.length > 0) return primary
  const bigFont = textStyle?.bigFont
  if (typeof bigFont === 'string' && bigFont.length > 0) return bigFont
  return undefined
}

/**
 * Picks the glyph size used for probing.
 *
 * MTEXT `height` is the authoritative em (DXF group 40); `lastHeight` is the
 * text-style fallback used when an entity carries no explicit height.
 */
function resolveProbeSize(mtextContent: MTextData, textStyle: TextStyle) {
  const height = mtextContent.height
  if (typeof height === 'number' && height > 0) return height
  const styleHeight = textStyle.lastHeight
  if (typeof styleHeight === 'number' && styleHeight > 0) return styleHeight
  return DEFAULT_PROBE_SIZE
}

/**
 * Collects the unique printable characters of an MTEXT body, capped at `limit`.
 *
 * Formatting codes are removed first: `\H2.5x;中文` must probe `中文` only, not
 * the code's own letters and digits.
 */
function collectPrintableChars(text: string, limit: number): string[] {
  const body = text.includes('\\')
    ? text.replace(MTEXT_CONTROL_CODE_PATTERN, ' ')
    : text
  const chars: string[] = []
  const seen = new Set<string>()
  for (const char of body) {
    if (chars.length >= limit) break
    if (!PRINTABLE_CHAR_PATTERN.test(char)) continue
    if (seen.has(char)) continue
    seen.add(char)
    chars.push(char)
  }
  return chars
}

/**
 * Returns whether `char` resolves against any face the worker pool can load.
 *
 * Follows the same precedence as the draw path: named font, then default font
 * chain, then symbol fonts.
 */
function canResolveChar(
  manager: unknown,
  char: string,
  fontName: string,
  size: number
): boolean {
  const lookup = manager as {
    getCharShape?: (char: string, fontName: string, size: number) => unknown
    getCharShapeFromDefaults?: (char: string, size: number) => unknown
    getCodeShapeFromSymbolFonts?: (code: number, size: number) => unknown
  }
  if (typeof lookup?.getCharShape !== 'function') return true
  if (lookup.getCharShape(char, fontName, size)) return true
  if (lookup.getCharShapeFromDefaults?.(char, size)) return true
  const code = char.codePointAt(0)
  if (code != null && lookup.getCodeShapeFromSymbolFonts?.(code, size)) {
    return true
  }
  return false
}

/** Shortens long MTEXT bodies for log output. */
function truncateForLog(text: string, maxLength = 40): string {
  const singleLine = text.replace(/\s+/g, ' ')
  return singleLine.length > maxLength
    ? `${singleLine.slice(0, maxLength)}...`
    : singleLine
}

/**
 * Event payload when a font referenced by text cannot render its characters.
 *
 * @remarks
 * Extends the main-thread `FontManager` payload shape (`fontName` / `count`) so
 * listeners registered for {@link AcTrRenderer.events.fontNotFound} can consume
 * both without branching.
 */
export interface AcTrMTextFontNotFoundEventArgs {
  /** Name of the font that could not be resolved for at least one glyph. */
  fontName: string
  /** Number of printable characters of the trigger text which cannot render. */
  count?: number
  /**
   * Where the miss was observed.
   *
   * - `'worker'`: detected for a render delegated to the MText web worker. The
   *   upstream worker protocol never reports font resolution failures, so the
   *   host probes the same text against the main-thread {@link FontManager}
   *   state and reports what the worker cannot resolve either.
   * - `'worker-error'`: the worker render call itself failed.
   * - `'main-thread'`: mirrored from `FontManager.events.fontNotFound`, which
   *   already covers the main-thread draw path.
   */
  source: 'main-thread' | 'worker' | 'worker-error'
  /** Up to {@link MAX_REPORTED_MISSING_CHARS} offending characters. */
  chars?: string[]
}

class AcTrMTextStyleManager implements StyleManager {
  public unsupportedTextStyles: Record<string, number> = {}
  private _styleManager: AcTrStyleManager

  constructor(styeManager: AcTrStyleManager) {
    this._styleManager = styeManager
  }

  getMeshBasicMaterial(traits: ColorSettings): THREE.Material {
    const entityTraits = AcTrSubEntityTraitsUtil.createTraitsForMText(
      traits,
      this._styleManager.currentBackgroundColor
    )
    // Route MText glyph fills through the dedicated helper so their
    // linework-tier `drawOrder` semantics stay explicit even though
    // they are rasterized as meshes.
    return this._styleManager.getMTextFillMaterial(entityTraits)
  }

  getLineBasicMaterial(traits: ColorSettings): THREE.Material {
    const entityTraits = AcTrSubEntityTraitsUtil.createTraitsForMText(
      traits,
      this._styleManager.currentBackgroundColor
    )
    return this._styleManager.getLineMaterial(entityTraits, true)
  }
}

/**
 * Singleton class for managing MText rendering using WebWorkerRenderer
 */
export class AcTrMTextRenderer {
  private static _instance: AcTrMTextRenderer | null = null
  private _workerUrl?: string | URL
  private _renderer?: UnifiedRenderer
  private _fontUrl?: string
  private _renderMode?: RenderMode
  private _styleManager?: AcTrStyleManager
  private _defaultFonts?: DefaultFontsPreset | string | readonly string[]
  private _lazyFontLoading?: boolean
  private _awaitFontsBeforeDraw?: boolean
  /**
   * Content-level glyph template cache. Lazy so render-free unit tests and
   * cache-disabled configurations never pay for it.
   */
  private _glyphCache?: AcTrMTextGlyphCache
  /**
   * Key occurrence counts for keys not yet promoted into {@link _glyphCache}.
   * Templates are only cached once a key repeats, so unique labels never pay
   * the deep-clone cost of a cached template. Capped at
   * {@link MAX_PENDING_GLYPH_KEYS} entries so a mostly-unique drawing cannot
   * grow it without bound.
   */
  private _pendingGlyphKeys = new Map<string, number>()
  /**
   * In-flight async glyph renders keyed by cache key. Concurrent requests for
   * the same content (the common burst pattern during document open) share
   * one worker round trip; late joiners await the shared render and receive
   * positioned clones instead of each posting a layout request.
   */
  private _inFlightGlyphRenders = new Map<
    string,
    { promise: Promise<MTextObject>; joined: boolean }
  >()
  /** Feature switch for the content-level glyph cache (default on). */
  private _contentGlyphCacheEnabled = true
  /**
   * Font-loaded listener installed by {@link installFontLoadedInvalidation}.
   *
   * Held so {@link releaseFontManagerSubscriptions} can detach it: the event
   * hub belongs to the page-lifetime `FontManager`, while this renderer is
   * replaced on every document switch.
   */
  private _fontLoadedListener?: () => void
  /**
   * Printable-character counts per font name for characters that cannot be
   * rendered at all. Mirrors `FontManager.missedFonts` for the worker render
   * path, which never reaches the main-thread font manager.
   */
  private _missedFonts: Record<string, number> = {}
  /**
   * Font names already reported through {@link events.fontNotFound}.
   *
   * One report per face per session keeps the diagnostic from turning into a
   * per-entity (or per-open) console flood on large drawings.
   */
  private _reportedFonts = new Set<string>()
  /**
   * The same faces as {@link _reportedFonts}, keyed by their original spelling.
   *
   * {@link _reportedFonts} is keyed by the lower-cased name, so asking it costs
   * a string allocation per call. This set lets the per-entity hot path
   * recognize an already reported face without allocating.
   */
  private _reportedFontNames = new Set<string>()
  /**
   * Minimum `Date.now()` timestamp for the next font-resolution probe.
   *
   * Probing is pure main-thread work on a hot path, so it is throttled to one
   * probe per window; the reported result is unchanged because
   * {@link _reportedFonts} already limits each face to a single report.
   */
  private _probeNotBefore = 0
  /** Guards the one-shot `worker-error` report. */
  private _workerErrorReported = false
  /**
   * Main-thread font-miss listener installed by
   * {@link installFontNotFoundMirror}, held so it can be detached again.
   */
  private _fontNotFoundListener?: (args: {
    fontName?: string
    count?: number
  }) => void
  /** Font name of the most recent render request, used for failure reporting. */
  private _lastRequestedFont?: string

  /** Font-resolution diagnostics for callers that cannot import FontManager. */
  public readonly events: {
    fontNotFound: AcCmEventManager<AcTrMTextFontNotFoundEventArgs>
  } = {
    fontNotFound: new AcCmEventManager<AcTrMTextFontNotFoundEventArgs>()
  }

  private constructor() {
    // Do nothing for now
  }

  /**
   * Get the singleton instance of AcTrMTextRenderer
   */
  public static getInstance(): AcTrMTextRenderer {
    if (!AcTrMTextRenderer._instance) {
      AcTrMTextRenderer._instance = new AcTrMTextRenderer()
    }
    return AcTrMTextRenderer._instance
  }

  /**
   * Override text renderer's default style manager with cad-viewer's style manager so
   * that cad-viewer's style manager can manage materials used by texts too.
   * @param value - New style manager
   */
  overrideStyleManager(value: AcTrStyleManager) {
    this._styleManager = value
    // Apply immediately when the unified renderer already exists (e.g. re-init
    // or late override). Otherwise reconstruct would keep DefaultStyleManager
    // materials without `isForeground` tracking.
    if (this._renderer) {
      const styleManager = new AcTrMTextStyleManager(value)
      this._renderer.setStyleManager(styleManager)
    }
  }

  /**
   * Set URL to load fonts
   * @param value - URL to load fonts
   */
  setFontUrl(value: string) {
    this._fontUrl = value
    this.invalidateGlyphCache()
    this.applyFontUrl()
  }

  /**
   * Set render mode to use by mtext renderer
   * @param mode - Render mode
   */
  setRenderMode(mode: RenderMode) {
    this._renderMode = mode
    if (this._renderer) {
      this._renderer.setDefaultMode(mode)
      this.applyFontUrl()
    }
  }

  /**
   * Sets the default text and symbol font fallback chains on the active renderer
   * and syncs them to Web Workers.
   *
   * @param fonts - A preset name, a single font name, or an ordered list of font names
   */
  async setDefaultFonts(
    fonts: DefaultFontsPreset | string | readonly string[]
  ): Promise<void> {
    this._defaultFonts = fonts
    this.invalidateGlyphCache()
    await this.applyDefaultFonts()
  }

  /**
   * Mirrors {@link FontManager.lazyFontLoading} onto the main thread and worker pool.
   */
  async setLazyFontLoading(enabled: boolean): Promise<void> {
    this._lazyFontLoading = enabled
    FontManager.instance.lazyFontLoading = enabled
    await this.applyLazyFontLoading()
  }

  /**
   * When true with lazy loading, {@link asyncRenderMText} / {@link asyncRenderShape}
   * wait for referenced fonts before building glyph geometry.
   */
  async setAwaitFontsBeforeDraw(enabled: boolean): Promise<void> {
    this._awaitFontsBeforeDraw = enabled
    FontManager.instance.awaitFontsBeforeDraw = enabled
    await this.applyAwaitFontsBeforeDraw()
  }

  /**
   * Render MText using the current mode asynchronously.
   */
  async asyncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): Promise<MTextObject> {
    if (!this._renderer) {
      throw new Error('AcTrMTextRenderer not initialized!')
    }
    this._lastRequestedFont = resolveStyleFontName(textStyle)
    if (!this._contentGlyphCacheEnabled) {
      const rendered = await this._renderer.asyncRenderMText(
        mtextContent,
        textStyle,
        colorSettings
      )
      this.recordPrintableCharMisses(mtextContent, textStyle)
      return rendered
    }

    const cache = this.getGlyphCache()
    const key = cache.buildKey(mtextContent, textStyle, colorSettings)
    const template = cache.get(key)
    if (template) {
      this.recordPrintableCharMisses(mtextContent, textStyle)
      return clonePlacedMTextTemplate(template, mtextContent.position)
    }

    const inFlight = this._inFlightGlyphRenders.get(key)
    if (inFlight) {
      // A layout for this content is already underway: share its round trip.
      inFlight.joined = true
      const rendered = await inFlight.promise
      return clonePlacedMTextTemplate(rendered, mtextContent.position)
    }

    const promise = this._renderer.asyncRenderMText(
      mtextContent,
      textStyle,
      colorSettings
    )
    const entry = { promise, joined: false }
    this._inFlightGlyphRenders.set(key, entry)
    try {
      const rendered = await promise
      const occurrences = this.countGlyphKeyOccurrence(key)
      this.recordPrintableCharMisses(mtextContent, textStyle)
      if (entry.joined || occurrences > 1) {
        this._pendingGlyphKeys.delete(key)
        cache.set(key, rendered)
        return clonePlacedMTextTemplate(rendered, mtextContent.position)
      }
      return rendered
    } catch (error) {
      this.reportWorkerRenderError(error)
      throw error
    } finally {
      if (this._inFlightGlyphRenders.get(key) === entry) {
        this._inFlightGlyphRenders.delete(key)
      }
    }
  }

  /**
   * Render MText using the current mode synchronously
   */
  syncRenderMText(
    mtextContent: MTextData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): MTextObject {
    this.ensureRendererCreated()
    if (!this._renderer) {
      throw new Error('AcTrMTextRenderer not initialized!')
    }
    this._lastRequestedFont = resolveStyleFontName(textStyle)
    if (!this._contentGlyphCacheEnabled) {
      const rendered = this._renderer.syncRenderMText(
        mtextContent,
        textStyle,
        colorSettings
      )
      this.recordPrintableCharMisses(mtextContent, textStyle)
      return rendered
    }

    const cache = this.getGlyphCache()
    const key = cache.buildKey(mtextContent, textStyle, colorSettings)
    const template = cache.get(key)
    if (template) {
      this.recordPrintableCharMisses(mtextContent, textStyle)
      return clonePlacedMTextTemplate(template, mtextContent.position)
    }

    const mtext = this._renderer.syncRenderMText(
      mtextContent,
      textStyle,
      colorSettings
    )
    this.recordPrintableCharMisses(mtextContent, textStyle)
    return this.recordGlyphRender(key, mtext, mtextContent.position)
  }

  async asyncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): Promise<MTextObject> {
    if (!this._renderer) {
      throw new Error('AcTrMTextRenderer not initialized!')
    }
    return this._renderer.asyncRenderShape(
      shapeContent,
      textStyle,
      colorSettings
    )
  }

  syncRenderShape(
    shapeContent: ShapeData,
    textStyle: TextStyle,
    colorSettings: ColorSettings = createDefaultColorSettings()
  ): MTextObject {
    this.ensureRendererCreated()
    if (!this._renderer) {
      throw new Error('AcTrMTextRenderer not initialized!')
    }
    return this._renderer.syncRenderShape(
      shapeContent,
      textStyle,
      colorSettings
    )
  }

  /**
   * Enables or disables the content-level glyph template cache.
   *
   * Disabling drops all cached templates and pending key counts. The cache is
   * enabled by default.
   *
   * @param enabled - Desired cache state.
   */
  setContentGlyphCacheEnabled(enabled: boolean): void {
    this._contentGlyphCacheEnabled = enabled
    if (!enabled) {
      this.invalidateGlyphCache()
    }
  }

  /**
   * Returns cache cardinality and estimated footprint for diagnostics.
   */
  getContentGlyphCacheStats(): AcTrMTextGlyphCacheStats {
    if (!this._glyphCache) {
      return { count: 0, estimatedBytes: 0 }
    }
    return this._glyphCache.getStats()
  }

  /**
   * Drops all glyph state carried over from the previously opened document.
   *
   * Glyph keys contain content, style and colour but no document identity, so a
   * template rendered for the previous drawing would be served for identical
   * text in the new one while still carrying the old document's materials on
   * its meshes. Pending keys and in-flight renders are dropped for the same
   * reason: an in-flight promise resolves to a glyph tree laid out against the
   * previous document's loaded fonts.
   *
   * Call this from the document-open path, before the first entity draws.
   */
  clearDocumentState(): void {
    this.invalidateGlyphCache()
  }

  /**
   * Printable-character miss counts per font name for the worker render path.
   *
   * @remarks
   * `FontManager.instance.missedFonts` only ever sees main-thread font
   * resolution. Worker renders resolve fonts inside the worker isolate, so
   * their misses are mirrored here instead. Same shape as
   * {@link FontManager.missedFonts} (`{ fontName: count }`) so callers can
   * render one combined table.
   */
  get missedFonts(): Record<string, number> {
    return this._missedFonts
  }

  /**
   * Clears the mirrored worker-path miss counts.
   */
  clearMissedFonts() {
    this._missedFonts = {}
  }

  /**
   * Registers one font file for both the main thread and the worker pool.
   *
   * @remarks
   * `UnifiedRenderer.cacheFont` parses the face on the main thread and stores
   * the binary in IndexedDB. IndexedDB is shared with the MText web worker
   * (same origin), which is the only font channel the upstream worker protocol
   * exposes: the worker messages are `render` / `loadFonts` /
   * `setDefaultFonts` / `setFontUrl` / `setLazyFontLoading` /
   * `setAwaitFontsBeforeDraw` / `getAvailableFonts` / `getMemoryStats`, and
   * every one of them addresses a face by name only.
   *
   * @param data - Font file contents.
   * @param fileName - File name used as the primary face name (`hztxt.shx`).
   * @param aliases - Optional alias names (AutoCAD text style names).
   * @param encoding - Optional encoding for SHX big fonts (`gb2312`).
   * @returns The upstream load status; `FailedToLoad` when the renderer is not
   *   initialized yet or the face could not be parsed.
   */
  async cacheFont(
    data: ArrayBuffer,
    fileName: string,
    aliases?: string[],
    encoding?: string
  ): Promise<FontLoadStatus> {
    if (!this._renderer) {
      return { fontName: fileName, url: '', status: 'FailedToLoad' }
    }
    this.invalidateGlyphCache()
    return this._renderer.cacheFont(data, fileName, aliases, encoding)
  }

  /**
   * Initialize the renderer.
   *
   * When render mode is `main`, the unified renderer is created without
   * eagerly spawning web workers. The worker URL is still stored so worker
   * mode can be enabled later if needed.
   *
   * @param workerUrl - URL to the worker script used when render mode is `worker`
   */
  initialize(workerUrl?: string | URL): void {
    if (workerUrl !== undefined) {
      this._workerUrl = workerUrl
    }

    if (this._renderer) {
      this._renderer.destroy()
      this._renderer = undefined
    }

    const mode = this._renderMode ?? 'worker'
    const workerConfig = this._workerUrl ? { workerUrl: this._workerUrl } : {}

    if (mode === 'worker') {
      if (!this._workerUrl) {
        throw new Error(
          'AcTrMTextRenderer worker URL is required for worker render mode'
        )
      }
      this._renderer = new UnifiedRenderer('worker', workerConfig)
    } else {
      this._renderer = new UnifiedRenderer('main', workerConfig)
    }

    if (this._renderMode) {
      this._renderer.setDefaultMode(this._renderMode)
    }

    this.applyFontUrl()
    void this.applyDefaultFonts()
    void this.applyLazyFontLoading()
    void this.applyAwaitFontsBeforeDraw()
    if (this._styleManager) {
      const styleManager = new AcTrMTextStyleManager(this._styleManager)
      this._renderer.setStyleManager(styleManager)
    }

    this.installFontLoadedInvalidation()
    this.installFontNotFoundMirror()
  }

  /**
   * Estimates memory used by mtext-renderer (loaded fonts, caches, workers).
   *
   * Prefers {@link UnifiedRenderer.estimateMemoryUsage} when the renderer is
   * initialized; otherwise falls back to the main-thread {@link FontManager}.
   */
  async estimateMemoryUsage(): Promise<MemoryUsageReport> {
    if (this._renderer) {
      return this._renderer.estimateMemoryUsage()
    }

    const mainThread = FontManager.instance.estimateMemoryUsage({ id: 'main' })
    return {
      collectedAt: Date.now(),
      totalEstimatedBytes: mainThread.totalEstimatedBytes,
      mainThread,
      workers: [],
      indexedDbFontCache: {
        fontCount: 0,
        totalBytes: 0,
        fonts: []
      }
    }
  }

  /**
   * Dispose of the renderer and reset cached configuration.
   */
  dispose(): void {
    if (this._renderer) {
      this._renderer.destroy()
      this._renderer = undefined
    }
    this._workerUrl = undefined
    this._renderMode = undefined
    this._defaultFonts = undefined
    this._lazyFontLoading = undefined
    this._awaitFontsBeforeDraw = undefined
    this._missedFonts = {}
    this._reportedFonts.clear()
    this._reportedFontNames.clear()
    this._probeNotBefore = 0
    this._workerErrorReported = false
    this.releaseFontManagerSubscriptions()
    this.invalidateGlyphCache()
  }

  /**
   * Dispose and discard the singleton instance.
   */
  public static resetInstance(): void {
    AcTrMTextRenderer.getInstance().dispose()
    AcTrMTextRenderer._instance = null
  }

  private ensureRendererCreated() {
    if (!this._renderer && this._workerUrl) {
      this.initialize(this._workerUrl)
    }
  }

  private getGlyphCache(): AcTrMTextGlyphCache {
    if (!this._glyphCache) {
      this._glyphCache = new AcTrMTextGlyphCache()
    }
    return this._glyphCache
  }

  /**
   * Feeds one fresh render result into the content-level cache.
   *
   * Templates are only cached once a key repeats, so unique labels return the
   * raw render and never pay the deep-clone cost of a cached template. From
   * the second occurrence on, every consumer receives a repositioned clone so
   * consumer mutation (flattening, rebasing, disposal) cannot corrupt the
   * pristine template.
   *
   * @param key - Cache key produced by {@link AcTrMTextGlyphCache.buildKey}.
   * @param rendered - Freshly rendered glyph tree.
   * @param position - Insertion point requested by the current consumer.
   * @returns The raw render for first-time keys, otherwise its clone.
   */
  private recordGlyphRender(
    key: string,
    rendered: MTextObject,
    position: MTextData['position']
  ): MTextObject {
    if (this.countGlyphKeyOccurrence(key) === 1) {
      return rendered
    }
    this.getGlyphCache().set(key, rendered)
    return clonePlacedMTextTemplate(rendered, position)
  }

  /**
   * Counts one occurrence of `key` in {@link _pendingGlyphKeys}.
   *
   * Shared by the synchronous and asynchronous render paths so both apply the
   * same "cache on second use" promotion policy and the same bound on the map.
   *
   * @param key - Cache key produced by {@link AcTrMTextGlyphCache.buildKey}.
   * @returns Occurrence count since the key was last promoted; a result above
   *   `1` means the caller must promote the key into {@link _glyphCache}.
   */
  private countGlyphKeyOccurrence(key: string): number {
    const occurrences = (this._pendingGlyphKeys.get(key) ?? 0) + 1
    if (occurrences > 1) {
      // The key moved into the template cache; its pending slot is obsolete.
      this._pendingGlyphKeys.delete(key)
      return occurrences
    }
    this._pendingGlyphKeys.set(key, 1)
    this.trimPendingGlyphKeys()
    return occurrences
  }

  /**
   * Trims {@link _pendingGlyphKeys} once it grows past
   * {@link MAX_PENDING_GLYPH_KEYS}, down to half of that cap.
   *
   * The declared cap is the trigger and half of it the target: trimming at the
   * target instead would pin the map at half of the promised promotion window
   * for the whole session, so half of the repeats the window exists for would
   * re-render forever.
   *
   * Entries are dropped in insertion order, so the oldest keys leave first and
   * the newest half survives: that is exactly the window in which a repeat of a
   * recently drawn label arrives, which keeps promotion on second use working.
   * Clearing the whole map (or the newest entries) would make every repeated
   * label look new again and render forever without ever being cached.
   */
  private trimPendingGlyphKeys() {
    if (this._pendingGlyphKeys.size <= MAX_PENDING_GLYPH_KEYS) return
    const keepCount = MAX_PENDING_GLYPH_KEYS / 2
    while (this._pendingGlyphKeys.size > keepCount) {
      const oldestKey = this._pendingGlyphKeys.keys().next().value as string
      this._pendingGlyphKeys.delete(oldestKey)
    }
  }

  /**
   * Drops every cached glyph template and pending key count.
   *
   * Also the implementation behind {@link clearDocumentState}: nothing in the
   * cache is document-scoped, so an in-document invalidation and a document
   * switch have to discard exactly the same state.
   */
  private invalidateGlyphCache() {
    this._glyphCache?.clear()
    this._pendingGlyphKeys.clear()
    // In-flight renders were started against fallback fonts; let new callers
    // start fresh layouts once the real font arrives.
    this._inFlightGlyphRenders.clear()
  }

  /**
   * Subscribes to font-loaded events so cached templates built against
   * fallback fonts are dropped when the real font arrives.
   *
   * The subscription is guarded because unit tests mock the whole
   * mtext-renderer module and only provide `UnifiedRenderer`.
   */
  private installFontLoadedInvalidation() {
    if (this._fontLoadedListener) {
      return
    }
    const onFontLoaded = () => this.invalidateGlyphCache()
    this._fontLoadedListener = onFontLoaded
    getFontManagerEvents()?.fontLoaded?.addEventListener(onFontLoaded)
  }

  /**
   * Mirrors main-thread `fontNotFound` events into {@link events.fontNotFound}.
   *
   * The main thread fires this event for two different reasons: a font name is
   * genuinely absent, or a face exists but lacks the requested glyph. Either
   * way the worker path can fail the same way while the worker protocol stays
   * silent, so both are surfaced through one payload shape.
   */
  private installFontNotFoundMirror() {
    if (this._fontNotFoundListener) {
      return
    }
    const onFontNotFound = (args: { fontName?: string; count?: number }) => {
      if (!args?.fontName) return
      this.events.fontNotFound.dispatch({
        fontName: args.fontName,
        count: args.count,
        source: 'main-thread'
      })
    }
    this._fontNotFoundListener = onFontNotFound
    getFontManagerEvents()?.fontNotFound?.addEventListener(onFontNotFound)
  }

  /**
   * Detaches the main-thread `FontManager` listeners installed during
   * {@link initialize}.
   *
   * `FontManager.instance` lives for the whole page while this renderer is a
   * singleton that {@link resetInstance} replaces on every document switch, so
   * without this every opened document leaves two more listeners on the global
   * hubs and keeps two retired renderers reachable through them (including the
   * style managers of the drawings they were bound to).
   */
  private releaseFontManagerSubscriptions() {
    const events = getFontManagerEvents()
    if (this._fontLoadedListener) {
      events?.fontLoaded?.removeEventListener?.(this._fontLoadedListener)
      this._fontLoadedListener = undefined
    }
    if (this._fontNotFoundListener) {
      events?.fontNotFound?.removeEventListener?.(this._fontNotFoundListener)
      this._fontNotFoundListener = undefined
    }
  }

  /**
   * Reports printable characters of `mtextContent` which cannot render at all.
   *
   * @remarks
   * The upstream worker protocol exposes no font-resolution feedback: the
   * worker answers a render request with serialized geometry only, so a face it
   * failed to load degrades silently into placeholder glyphs. The host probes
   * the same text against the shared {@link FontManager} state, which is the
   * same face set the pool loads from (CDN metadata plus the IndexedDB cache),
   * and reports characters that resolve against no primary, default or symbol
   * font.
   *
   * Cost control (this runs for every MTEXT entity, including 380k-entity
   * drawings):
   * - skips immediately in main render mode, where `FontManager` already
   *   reports misses itself;
   * - skips fonts already reported, so each face is probed at most once;
   * - probes at most one text per throttle window;
   * - probes at most {@link MAX_REPORTED_MISSING_CHARS} distinct characters.
   */
  private recordPrintableCharMisses(
    mtextContent: MTextData,
    textStyle: TextStyle
  ) {
    if (this.currentRenderMode() !== 'worker') return

    const text = mtextContent?.text
    if (!text) return

    const fontName = resolveStyleFontName(textStyle)
    if (!fontName) return

    // The cheap exits run first: this method is called once per MTEXT entity
    // (cache hits included), while the lower-cased key and the clock read below
    // are only needed when a probe can actually run.
    if (this._reportedFonts.size >= MAX_MISSED_FONT_ENTRIES) return
    if (this._reportedFontNames.has(fontName)) return

    const now = Date.now()
    if (now < this._probeNotBefore) return

    const key = fontName.toLowerCase()
    if (this._reportedFonts.has(key)) {
      // The same face spelled differently; remember this spelling too so later
      // entities using it also take the allocation-free exit above.
      this.rememberReportedFontName(fontName)
      return
    }
    this._probeNotBefore = now + FONT_PROBE_INTERVAL_MS

    const chars = collectPrintableChars(text, MAX_REPORTED_MISSING_CHARS)
    if (chars.length === 0) return

    const manager = FontManager.instance
    const size = resolveProbeSize(mtextContent, textStyle)
    const missing: string[] = []
    for (const char of chars) {
      if (!canResolveChar(manager, char, fontName, size)) {
        missing.push(char)
      }
    }
    if (missing.length === 0) return

    this._reportedFonts.add(key)
    this.rememberReportedFontName(fontName)
    this._missedFonts[fontName] = missing.length
    const args: AcTrMTextFontNotFoundEventArgs = {
      fontName,
      count: missing.length,
      source: 'worker',
      chars: missing
    }
    console.warn(
      `[AcTrMTextRenderer] Font '${fontName}' cannot render ${missing.length} ` +
        `character(s) of '${truncateForLog(text)}'; the worker path will ` +
        'draw placeholder or empty glyphs. Register the face for the worker ' +
        'pool or add a fallback default font.'
    )
    this.events.fontNotFound.dispatch(args)
  }

  /**
   * Remembers one spelling of an already reported face.
   *
   * The set only ever grows with spellings of faces that {@link _reportedFonts}
   * already holds, and it is capped like that set so a drawing carrying many
   * spellings of one missing face cannot grow it without bound.
   */
  private rememberReportedFontName(fontName: string) {
    if (this._reportedFontNames.size < MAX_MISSED_FONT_ENTRIES) {
      this._reportedFontNames.add(fontName)
    }
  }

  /**
   * Reports a worker render call that failed outright.
   *
   * @remarks
   * `CharBox` layout still reports every character while every glyph fails to
   * resolve, so an empty or placeholder-only render is not distinguishable
   * from legitimate whitespace by geometry alone. A rejected worker request is
   * the one unambiguous cross-thread failure signal, and it is reported once
   * per session.
   */
  private reportWorkerRenderError(error: unknown) {
    if (this._workerErrorReported) return
    this._workerErrorReported = true
    const fontName = this._lastRequestedFont ?? 'unknown'
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `[AcTrMTextRenderer] Worker text render failed (${message}); ` +
        `text using font '${fontName}' may be missing from the drawing.`
    )
    this.events.fontNotFound.dispatch({
      fontName,
      source: 'worker-error'
    })
  }

  /** Render mode actually used for the next draw call. */
  private currentRenderMode(): RenderMode {
    return this._renderMode ?? 'worker'
  }

  private applyFontUrl() {
    if (this._renderer && this._fontUrl) {
      this._renderer.setFontUrl(this._fontUrl)
    }
  }

  private async applyDefaultFonts() {
    if (this._renderer && this._defaultFonts !== undefined) {
      await this._renderer.setDefaultFonts(this._defaultFonts)
    }
  }

  private async applyLazyFontLoading() {
    if (this._renderer && this._lazyFontLoading !== undefined) {
      await this._renderer.setLazyFontLoading(this._lazyFontLoading)
    }
  }

  private async applyAwaitFontsBeforeDraw() {
    if (this._renderer && this._awaitFontsBeforeDraw !== undefined) {
      await this._renderer.setAwaitFontsBeforeDraw(this._awaitFontsBeforeDraw)
    }
  }
}

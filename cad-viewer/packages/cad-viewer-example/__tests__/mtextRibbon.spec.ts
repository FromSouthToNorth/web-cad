import type { AcEdMTextEditorActiveInputBox } from '@hy/cad-simple-viewer'

/**
 * Tests for the MTEXT contextual ribbon.
 *
 * `@hy/cad-simple-viewer` is mocked so the ribbon can be driven against a
 * scripted fake input box: the real editor needs a Three.js scene and a
 * document, while the ribbon only ever talks to the box through
 * `AcEdMTextEditor.getActiveInputBox()`.
 */

/** Handlers the ribbon registers through `AcEdMTextEditor`'s static listener. */
type ActiveInputBoxListener = (
  inputBox: AcEdMTextEditorActiveInputBox | null
) => void

const activeInputBoxListeners = new Set<ActiveInputBoxListener>()
let activeInputBox: unknown = null

jest.mock('@hy/cad-simple-viewer', () => ({
  // Numeric mirror of the renderer's paragraph alignment enum. The real enum
  // lives in the package's UMD bundle, which Jest cannot execute, and the
  // ribbon only compares these values.
  AcGiTextParagraphAlignment: {
    DEFAULT: 0,
    LEFT: 1,
    RIGHT: 2,
    CENTER: 3,
    JUSTIFIED: 4,
    DISTRIBUTED: 5
  },
  AcApDocManager: { instance: undefined },
  AcApFontUtil: {
    ensureDrawingFontLoaded: jest.fn(async () => undefined)
  },
  AcEdMTextEditor: {
    defaultLineSpacingFactor: 1,
    getActiveInputBox: () => activeInputBox,
    addActiveInputBoxChangeListener: (listener: ActiveInputBoxListener) => {
      activeInputBoxListeners.add(listener)
    },
    removeActiveInputBoxChangeListener: (listener: ActiveInputBoxListener) => {
      activeInputBoxListeners.delete(listener)
    }
  }
}))

// Imported after the mock so the module picks up the fake editor.
import {
  DEFAULT_MTEXT_FORMAT,
  mtextParagraphAlignToSlug,
  mtextSymbolPayloadToString,
  sameMTextRibbonFormat,
  uniqueMTextStrings
} from '../src/shell/ribbon/mtext/mtextRibbonTypes'
import { useMTextRibbon } from '../src/shell/ribbon/mtext/useMTextRibbon'

/** Records every call the ribbon makes on the editor. */
class FakeMTextEditor {
  readonly calls: Array<{ method: string; args: unknown[] }> = []
  private readonly handlers = new Map<string, Set<() => void>>()

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args })
  }

  /** Every argument list recorded for one method. */
  argsFor(method: string): unknown[][] {
    return this.calls
      .filter(call => call.method === method)
      .map(call => call.args)
  }

  // ── state reported to the ribbon ───────────────────────────────────
  formatState = {
    ...DEFAULT_MTEXT_FORMAT,
    fontFamily: 'simplex',
    fontSize: 2.5
  }
  attachmentCode = 'TL'
  stackSelection = false
  lineSpacing = 1

  getCurrentFormat = () => ({ ...this.formatState })
  getAttachmentPointCode = () => this.attachmentCode
  isStackSelectionActive = () => this.stackSelection
  getLineSpacingFactor = () => this.lineSpacing

  // ── commands ───────────────────────────────────────────────────────
  setCurrentFormat = (format: unknown) =>
    this.record('setCurrentFormat', [format])
  setAttachmentPoint = (code: string) =>
    this.record('setAttachmentPoint', [code])
  setParagraphAlignment = (alignment: string) =>
    this.record('setParagraphAlignment', [alignment])
  setLineSpacingFactor = (factor: number) =>
    this.record('setLineSpacingFactor', [factor])
  clearLineSpacing = () => this.record('clearLineSpacing', [])
  toggleCase = () => this.record('toggleCase', [])
  insertText = (text: string) => this.record('insertText', [text])
  closeEditor = () => this.record('closeEditor', [])
  focusEditor = () => this.record('focusEditor', [])
  toggleStackSelection = () => {
    this.record('toggleStackSelection', [])
    return true
  }
  toggleScriptSelection = (script: string) => {
    this.record('toggleScriptSelection', [script])
    return true
  }

  // ── events ─────────────────────────────────────────────────────────
  on = (event: string, handler: () => void) => {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler)
    this.handlers.set(event, set)
  }

  off = (event: string, handler: () => void) => {
    this.handlers.get(event)?.delete(handler)
  }

  addCurrentFormatChangeListener = (handler: () => void) => {
    this.on('formatChange', handler)
  }

  removeCurrentFormatChangeListener = (handler: () => void) => {
    this.off('formatChange', handler)
  }

  /** Number of live listeners for one event, for leak assertions. */
  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0
  }

  /** Simulates an editor-side change that must reach the ribbon. */
  emitChange() {
    this.handlers.get('change')?.forEach(handler => handler())
  }
}

/** Ribbons mounted by the current test, disposed again in `afterEach`. */
const mountedRibbons: Array<ReturnType<typeof useMTextRibbon>> = []

/**
 * Simulates the ribbon mounting while `editor` is already open.
 *
 * `initMTextRibbon()` binds whatever editor is active at that moment, which is
 * the same path a double-click edit takes when the ribbon is already mounted.
 *
 * @param editor - Fake input box the ribbon should talk to.
 * @returns The ribbon API under test.
 */
function openEditor(editor: FakeMTextEditor) {
  activeInputBox = editor
  const ribbon = useMTextRibbon()
  ribbon.initMTextRibbon()
  mountedRibbons.push(ribbon)
  return ribbon
}

describe('mtextSymbolPayloadToString', () => {
  it('decodes a single AutoCAD unicode escape', () => {
    expect(mtextSymbolPayloadToString('\\U+00B2')).toBe('\u00b2')
    expect(mtextSymbolPayloadToString('\\U+2248')).toBe('\u2248')
  })

  it('leaves control codes the editor expands itself untouched', () => {
    expect(mtextSymbolPayloadToString('%%d')).toBe('%%d')
    expect(mtextSymbolPayloadToString('%%c')).toBe('%%c')
    expect(mtextSymbolPayloadToString('\\~')).toBe('\\~')
  })

  it('keeps malformed or out-of-range escapes verbatim', () => {
    expect(mtextSymbolPayloadToString('\\U+ZZZZ')).toBe('\\U+ZZZZ')
    expect(mtextSymbolPayloadToString('\\U+110000')).toBe('\\U+110000')
  })
})

describe('sameMTextRibbonFormat', () => {
  it('reports equality for identical snapshots', () => {
    expect(
      sameMTextRibbonFormat(DEFAULT_MTEXT_FORMAT, { ...DEFAULT_MTEXT_FORMAT })
    ).toBe(true)
  })

  it('detects a difference in any tracked field', () => {
    expect(
      sameMTextRibbonFormat(DEFAULT_MTEXT_FORMAT, {
        ...DEFAULT_MTEXT_FORMAT,
        bold: true
      })
    ).toBe(false)
    expect(
      sameMTextRibbonFormat(DEFAULT_MTEXT_FORMAT, {
        ...DEFAULT_MTEXT_FORMAT,
        attachmentPoint: 'BR'
      })
    ).toBe(false)
  })
})

describe('mtextParagraphAlignToSlug', () => {
  it('maps editor alignment values to ribbon ids', () => {
    expect(mtextParagraphAlignToSlug(1)).toBe('left')
    expect(mtextParagraphAlignToSlug(3)).toBe('center')
    expect(mtextParagraphAlignToSlug(5)).toBe('distributed')
    expect(mtextParagraphAlignToSlug(0)).toBe('default')
  })
})

describe('uniqueMTextStrings', () => {
  it('trims, drops empties, and preserves first-seen order', () => {
    expect(uniqueMTextStrings([' Arial ', 'Arial', '', 'simplex'])).toEqual([
      'Arial',
      'simplex'
    ])
  })
})

describe('useMTextRibbon', () => {
  afterEach(() => {
    mountedRibbons.forEach(ribbon => ribbon.disposeMTextRibbon())
    mountedRibbons.length = 0
    activeInputBox = null
    activeInputBoxListeners.clear()
  })

  it('reports the editor format and attachment point once an editor opens', () => {
    const editor = new FakeMTextEditor()
    editor.attachmentCode = 'MC'
    const ribbon = openEditor(editor)

    expect(ribbon.state.active).toBe(true)
    expect(ribbon.state.format.fontFamily).toBe('simplex')
    expect(ribbon.state.format.fontSize).toBe(2.5)
    expect(ribbon.state.format.attachmentPoint).toBe('MC')
  })

  it('toggles a character effect on the selection', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    ribbon.setFormatToggle('bold', true)

    expect(editor.argsFor('setCurrentFormat')).toEqual([[{ bold: true }]])
  })

  it('prefers the in-place script toggle and falls back to the insertion format', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    ribbon.setScript('superscript', true)
    expect(editor.argsFor('toggleScriptSelection')).toEqual([['superscript']])
    expect(editor.argsFor('setCurrentFormat')).toEqual([])

    // An editor that cannot transform the selection falls back to the format
    // applied to newly typed characters.
    editor.toggleScriptSelection = () => false
    ribbon.setScript('subscript', true)
    expect(editor.argsFor('setCurrentFormat')).toEqual([
      [{ script: 'subscript' }]
    ])
  })

  it('routes stack, case, attachment, alignment and spacing commands', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    ribbon.toggleStack()
    ribbon.toggleCase()
    ribbon.setAttachment('BR')
    ribbon.setParagraphAlignment('center')
    ribbon.setLineSpacing(2)
    ribbon.clearLineSpacing()

    expect(editor.argsFor('toggleStackSelection')).toHaveLength(1)
    expect(editor.argsFor('toggleCase')).toHaveLength(1)
    expect(editor.argsFor('setAttachmentPoint')).toEqual([['BR']])
    expect(editor.argsFor('setParagraphAlignment')).toEqual([['center']])
    expect(editor.argsFor('setLineSpacingFactor')).toEqual([[2]])
    expect(editor.argsFor('clearLineSpacing')).toHaveLength(1)
  })

  it('expands unicode symbol payloads before inserting them', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    ribbon.insertText('\\U+00B2')
    ribbon.insertText('%%d')

    expect(editor.argsFor('insertText')).toEqual([['\u00b2'], ['%%d']])
  })

  it('ignores non-positive heights and out-of-range widths', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    ribbon.setFontHeight(0)
    ribbon.setFontHeight(Number.NaN)
    expect(editor.argsFor('setCurrentFormat')).toEqual([])

    ribbon.setFontHeight(4)
    expect(editor.argsFor('setCurrentFormat')).toEqual([[{ fontSize: 4 }]])
  })

  it('reports an inactive state and defaults once the editor closes', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)
    expect(ribbon.state.active).toBe(true)

    activeInputBox = null
    activeInputBoxListeners.forEach(listener => listener(null))

    expect(ribbon.state.active).toBe(false)
    expect(ribbon.state.stackActive).toBe(false)
    expect(ribbon.state.format).toMatchObject({
      fontFamily: DEFAULT_MTEXT_FORMAT.fontFamily,
      bold: false,
      attachmentPoint: DEFAULT_MTEXT_FORMAT.attachmentPoint
    })
  })
  it('refreshes the panel when the editor reports a change', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    editor.formatState = { ...editor.formatState, italic: true }
    editor.emitChange()

    expect(ribbon.state.format.italic).toBe(true)
  })

  it('detaches every listener it attached when disposed', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)

    expect(editor.listenerCount('change')).toBe(1)
    expect(editor.listenerCount('formatChange')).toBe(1)
    expect(activeInputBoxListeners.size).toBe(1)

    ribbon.disposeMTextRibbon()

    expect(editor.listenerCount('change')).toBe(0)
    expect(editor.listenerCount('formatChange')).toBe(0)
    expect(activeInputBoxListeners.size).toBe(0)
  })

  it('keeps one listener per editor while several ribbons are mounted', () => {
    const editor = new FakeMTextEditor()
    const ribbon = openEditor(editor)
    // A second ribbon mount must not double-bind the same input box.
    ribbon.initMTextRibbon()

    expect(activeInputBoxListeners.size).toBe(1)
    expect(editor.listenerCount('change')).toBe(1)

    ribbon.disposeMTextRibbon()
    // The second mount is still alive, so the bridge must stay attached.
    expect(editor.listenerCount('change')).toBe(1)

    ribbon.disposeMTextRibbon()
    expect(editor.listenerCount('change')).toBe(0)
    expect(activeInputBoxListeners.size).toBe(0)
  })
})

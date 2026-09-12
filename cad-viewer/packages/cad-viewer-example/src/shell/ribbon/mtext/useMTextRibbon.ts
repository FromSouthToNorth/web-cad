import {
  AcApDocManager,
  AcApFontUtil,
  AcEdMTextEditor,
  type AcEdMTextEditorActiveInputBox
} from '@hy/cad-simple-viewer'
import { AcCmColor, type AcDbDatabase } from '@hy/data-model'
import { computed, reactive, readonly } from 'vue'

import {
  DEFAULT_MTEXT_FORMAT,
  type MTextParagraphAlignmentId,
  type MTextRibbonFormat,
  type MTextRibbonScript,
  mtextSymbolPayloadToString,
  normalizeMTextNumber,
  sameMTextRibbonFormat,
  uniqueMTextStrings
} from './mtextRibbonTypes'

/**
 * Character format payload accepted by the editor's `setCurrentFormat`.
 *
 * Derived from the public editor type instead of importing `CharFormat` from
 * `@mlightcad/mtext-input-box`, which is a transitive (not direct) dependency
 * of this package.
 */
type MTextCharFormat = ReturnType<
  AcEdMTextEditorActiveInputBox['getCurrentFormat']
>

/**
 * Structural view of the inline MTEXT editor used by the ribbon.
 *
 * Declared as a standalone interface (rather than intersecting
 * `AcEdMTextEditorActiveInputBox`) because `MTextInputBox` declares
 * `toggleStackSelection` / `toggleScriptSelection` as *private*: intersecting a
 * class with private members collapses the whole type to `never`.
 */
interface MTextEditorRuntime {
  /** Format at the caret / selection. */
  getCurrentFormat: () => MTextCharFormat
  /** Applies a partial character format to the selection. */
  setCurrentFormat: (format: Partial<MTextCharFormat>) => void
  /** Two-letter attachment code reported by the editor. */
  getAttachmentPointCode?: () => string
  /** Current paragraph line spacing factor. */
  getLineSpacingFactor: () => number
  /** Whether the selection can be stacked as a fraction. */
  isStackSelectionActive?: () => boolean
  /** Sets superscript / subscript for the selection; `false` when unhandled. */
  toggleScriptSelection?: (script: MTextRibbonScript) => boolean
  /** Stacks / unstacks the selected fraction. */
  toggleStackSelection?: () => void
  /** Switches the selected text between upper and lower case. */
  toggleCase: () => void
  /** Sets the MTEXT attachment point. */
  setAttachmentPoint: (code: string) => void
  /** Sets the horizontal alignment of the active paragraphs. */
  setParagraphAlignment: (alignment: string) => void
  /** Applies a paragraph line spacing multiple. */
  setLineSpacingFactor: (factor: number) => void
  /** Drops the explicit line spacing override. */
  clearLineSpacing: () => void
  /** Inserts text at the caret. */
  insertText: (text: string) => void
  /** Closes the inline editor. */
  closeEditor: () => void
  /** Returns keyboard focus to the editor, when supported. */
  focusEditor?: () => void
  /** Subscribes to editor lifecycle events. */
  on: (event: string, handler: () => void) => void
  /** Unsubscribes from editor lifecycle events. */
  off: (event: string, handler: () => void) => void
  /** Subscribes to current-format changes (added by the editor's bridge). */
  addCurrentFormatChangeListener?: (listener: () => void) => void
  /** Unsubscribes from current-format changes. */
  removeCurrentFormatChangeListener?: (listener: () => void) => void
}

/** Reactive state shared by the MTEXT contextual tab and its panels. */
interface MTextRibbonState {
  /** Whether an inline MTEXT editor is currently open. */
  active: boolean
  /** Whether the current selection is a stackable (non-script) fraction. */
  stackActive: boolean
  /** Formatting at the cursor / selection reported by the editor. */
  format: MTextRibbonFormat
  /** Line spacing factor currently applied to the edited MTEXT. */
  lineSpacing: number
}

const state = reactive<MTextRibbonState>({
  active: false,
  stackActive: false,
  format: { ...DEFAULT_MTEXT_FORMAT },
  lineSpacing: AcEdMTextEditor.defaultLineSpacingFactor
})

/** Editor instance whose events are currently bound, if any. */
let boundEditor: MTextEditorRuntime | null = null

/** Number of mounted ribbons relying on the shared bridge. */
let initCount = 0

/**
 * Returns the inline MTEXT editor that is open, if any.
 *
 * @returns Runtime view of the active input box, or `null`.
 */
function activeInputBox(): MTextEditorRuntime | null {
  const inputBox = AcEdMTextEditor.getActiveInputBox()
  return (inputBox as unknown as MTextEditorRuntime | null) ?? null
}

/**
 * Returns the active drawing database, if a document is open.
 *
 * @returns Current database or `undefined`.
 */
function currentDatabase(): AcDbDatabase | undefined {
  try {
    return AcApDocManager.instance?.curDocument?.database
  } catch {
    return undefined
  }
}

/**
 * Pulls the editor's current format, stack state and line spacing into
 * {@link state}.
 *
 * Called on every editor notification (change, selection, cursor move, close)
 * and after each ribbon command, so the panel always mirrors the editor.
 */
function syncFromEditor(): void {
  const editor = activeInputBox()
  if (!editor) {
    state.active = false
    state.stackActive = false
    state.lineSpacing = AcEdMTextEditor.defaultLineSpacingFactor
    if (!sameMTextRibbonFormat(state.format, DEFAULT_MTEXT_FORMAT)) {
      Object.assign(state.format, DEFAULT_MTEXT_FORMAT)
    }
    return
  }

  state.active = true
  const next: MTextRibbonFormat = {
    ...DEFAULT_MTEXT_FORMAT,
    ...editor.getCurrentFormat(),
    attachmentPoint:
      editor.getAttachmentPointCode?.() ?? DEFAULT_MTEXT_FORMAT.attachmentPoint
  }
  if (!sameMTextRibbonFormat(state.format, next)) {
    Object.assign(state.format, next)
  }

  const stackActive = editor.isStackSelectionActive?.() ?? false
  if (state.stackActive !== stackActive) {
    state.stackActive = stackActive
  }

  const lineSpacing = normalizeMTextNumber(editor.getLineSpacingFactor())
  if (lineSpacing != null && state.lineSpacing !== lineSpacing) {
    state.lineSpacing = lineSpacing
  }
}

/**
 * Binds or unbinds the editor events that drive {@link syncFromEditor}.
 *
 * @param editor - Editor to observe, or `null` to detach the current one.
 */
function bindEditor(editor: MTextEditorRuntime | null): void {
  if (boundEditor === editor) return
  if (boundEditor) {
    boundEditor.off('change', syncFromEditor)
    boundEditor.off('selectionChange', syncFromEditor)
    boundEditor.off('cursorMove', syncFromEditor)
    boundEditor.off('close', syncFromEditor)
    boundEditor.removeCurrentFormatChangeListener?.(syncFromEditor)
  }
  boundEditor = editor
  if (boundEditor) {
    boundEditor.on('change', syncFromEditor)
    boundEditor.on('selectionChange', syncFromEditor)
    boundEditor.on('cursorMove', syncFromEditor)
    boundEditor.on('close', syncFromEditor)
    boundEditor.addCurrentFormatChangeListener?.(syncFromEditor)
  }
  syncFromEditor()
}

/** Bridges the editor's static active-input-box notification into the panel. */
function onActiveInputBoxChanged(
  inputBox: AcEdMTextEditorActiveInputBox | null
): void {
  bindEditor(inputBox as unknown as MTextEditorRuntime | null)
}

/**
 * Applies a partial character format to the active editor selection.
 *
 * @param format - Format fields to change.
 */
function applyFormat(format: Partial<MTextRibbonFormat>): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.setCurrentFormat(format)
  editor.focusEditor?.()
  syncFromEditor()
}

/**
 * Toggles one boolean character effect on the selection.
 *
 * @param field - Effect to toggle.
 * @param value - Whether the effect should be enabled.
 */
function setFormatToggle(
  field: 'bold' | 'italic' | 'underline' | 'overline' | 'strike',
  value: boolean
): void {
  applyFormat({ [field]: value })
}

/**
 * Toggles superscript / subscript for the selection.
 *
 * The editor's in-place selection toggle is preferred so existing characters
 * are converted; when the editor cannot handle it the effect becomes the
 * insertion format for subsequent typing.
 *
 * @param script - Script mode selected by the ribbon.
 * @param active - Whether the button was switched on.
 */
function setScript(
  script: Exclude<MTextRibbonScript, 'normal'>,
  active: boolean
): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.focusEditor?.()
  const handled = editor.toggleScriptSelection?.(active ? script : 'normal')
  if (!handled) {
    editor.setCurrentFormat({ script: active ? script : 'normal' })
  }
  editor.focusEditor?.()
  syncFromEditor()
}

/** Toggles stacked-fraction formatting for the current selection. */
function toggleStack(): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.focusEditor?.()
  editor.toggleStackSelection?.()
  editor.focusEditor?.()
  syncFromEditor()
}

/** Switches the selected text between upper and lower case. */
function toggleCase(): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.toggleCase()
  editor.focusEditor?.()
  syncFromEditor()
}

/**
 * Sets the MTEXT attachment point.
 *
 * @param code - Two-letter attachment code (`TL`, `MC`, `BR`, ...).
 */
function setAttachment(code: string): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.setAttachmentPoint(code)
  editor.focusEditor?.()
  syncFromEditor()
}

/**
 * Sets the horizontal alignment of the paragraphs under the cursor / selection.
 *
 * @param alignment - Paragraph alignment id.
 */
function setParagraphAlignment(alignment: MTextParagraphAlignmentId): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.setParagraphAlignment(alignment)
  editor.focusEditor?.()
  syncFromEditor()
}

/**
 * Applies a paragraph line spacing factor.
 *
 * @param factor - Spacing multiple (`1` = single spacing).
 */
function setLineSpacing(factor: number): void {
  const editor = activeInputBox()
  if (!editor || !Number.isFinite(factor)) return
  editor.setLineSpacingFactor(factor)
  editor.focusEditor?.()
  syncFromEditor()
}

/** Clears the explicit line spacing override. */
function clearLineSpacing(): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.clearLineSpacing()
  editor.focusEditor?.()
  syncFromEditor()
}

/**
 * Inserts raw content at the editor caret.
 *
 * @param text - Character, MTEXT control code, or escape sequence to insert.
 */
function insertText(text: string): void {
  const editor = activeInputBox()
  if (!editor) return
  editor.insertText(mtextSymbolPayloadToString(text))
  editor.focusEditor?.()
  syncFromEditor()
}

/**
 * Applies a drawing text style to the MTEXT editor and to `$TEXTSTYLE`.
 *
 * The style's font and usable height are mirrored into the current character
 * format so the editor reflects the choice immediately.
 *
 * @param styleName - Text style name selected in the ribbon.
 */
function applyTextStyle(styleName: string): void {
  const db = currentDatabase()
  if (!db || !styleName) return
  const record = db.tables.textStyleTable.getAt(styleName)
  if (!record) return

  db.textstyle = styleName
  const textStyle = record.textStyle
  const next: Partial<MTextRibbonFormat> = {}
  if (textStyle.font) {
    void AcApFontUtil.ensureDrawingFontLoaded(textStyle.font)
    next.fontFamily = textStyle.font
  }
  const height =
    normalizeMTextNumber(textStyle.fixedTextHeight) ??
    normalizeMTextNumber(textStyle.lastHeight)
  if (height != null && height > 0) next.fontSize = height
  applyFormat(next)
}

/**
 * Sets the character font family, loading the font first.
 *
 * @param fontFamily - Font family name.
 */
function setFontFamily(fontFamily: string): void {
  const name = fontFamily.trim()
  if (!name) return
  void AcApFontUtil.ensureDrawingFontLoaded(name)
  applyFormat({ fontFamily: name })
}

/**
 * Sets the character height.
 *
 * @param height - Height in drawing units; non-positive values are ignored.
 */
function setFontHeight(height: number): void {
  if (!Number.isFinite(height) || height <= 0) return
  applyFormat({ fontSize: height })
}

/**
 * Applies an AutoCAD color to the character format.
 *
 * @param color - Color chosen from the ribbon dropdown.
 */
function setFormatColor(color: AcCmColor | undefined): void {
  if (!color) return
  if (color.isByLayer) {
    applyFormat({ aci: 256, rgb: null })
    return
  }
  if (color.isByBlock) {
    applyFormat({ aci: 0, rgb: null })
    return
  }
  if (color.isByACI && typeof color.colorIndex === 'number') {
    applyFormat({ aci: color.colorIndex, rgb: null })
    return
  }
  applyFormat({ aci: null, rgb: color.RGB ?? null })
}

/**
 * Closes the inline editor, which commits the MTEXT the same way its own
 * Close button does.
 */
function closeEditor(): void {
  activeInputBox()?.closeEditor()
}

/** Text style names available in the active drawing. */
const textStyleNames = computed<string[]>(() => {
  const db = currentDatabase()
  if (!db) return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const record of db.tables.textStyleTable.newIterator()) {
    const name = record.name?.trim()
    if (!name || record.isShapeFile || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
})

/** Text style currently assigned to `$TEXTSTYLE`, if any. */
const currentTextStyle = computed<string>(
  () => currentDatabase()?.textstyle ?? ''
)

/**
 * Builds the font dropdown options for the active editor.
 *
 * @returns Unique font names from the current format, drawing styles, the
 * editor font catalog, and the default fallback.
 */
const fontOptions = computed<string[]>(() => {
  const db = currentDatabase()
  const styleFonts: string[] = []
  if (db) {
    for (const record of db.tables.textStyleTable.newIterator()) {
      const font = record.textStyle.font
      if (font) styleFonts.push(font)
    }
  }
  const catalogFonts = (AcApDocManager.instance?.avaiableFonts ?? []).flatMap(
    info => info.name
  )
  return uniqueMTextStrings([
    state.format.fontFamily,
    ...styleFonts,
    ...catalogFonts,
    DEFAULT_MTEXT_FORMAT.fontFamily
  ])
})

/**
 * Builds the character height shortcuts offered by the ribbon.
 *
 * @returns Unique positive heights from the current format, the drawing text
 * styles, and common drafting values.
 */
const heightOptions = computed<number[]>(() => {
  const db = currentDatabase()
  const styleHeights: number[] = []
  if (db) {
    for (const record of db.tables.textStyleTable.newIterator()) {
      for (const candidate of [
        record.textStyle.fixedTextHeight,
        record.textStyle.lastHeight
      ]) {
        const height = normalizeMTextNumber(candidate)
        if (height != null && height > 0) styleHeights.push(height)
      }
    }
  }
  return Array.from(
    new Set([
      state.format.fontSize,
      ...styleHeights,
      1,
      2.5,
      3.5,
      5,
      7,
      10,
      12,
      24
    ])
  ).sort((a, b) => a - b)
})

/**
 * Converts the format color fields into an {@link AcCmColor}.
 *
 * ACI values win when present so ByLayer, ByBlock, and indexed colors keep
 * their semantics; RGB is used only when no ACI applies.
 *
 * @returns CAD color equivalent to the current format color.
 */
const formatColor = computed<AcCmColor>(() => {
  const color = new AcCmColor()
  const { aci, rgb } = state.format
  if (aci === 256) {
    color.setByLayer()
    return color
  }
  if (aci === 0) {
    color.setByBlock()
    return color
  }
  if (aci != null) {
    color.colorIndex = aci
    return color
  }
  if (rgb != null) {
    color.setRGBValue(rgb)
    return color
  }
  color.setByLayer()
  return color
})

/** CSS swatch color displayed next to the ribbon color button. */
const formatColorDisplay = computed<string>(() => {
  const color = formatColor.value
  if (color.isByLayer) {
    const db = currentDatabase()
    const layerName = db?.clayer
    const layerColor = layerName
      ? db?.tables.layerTable.getAt(layerName)?.color.cssColor
      : undefined
    return layerColor || '#7b8794'
  }
  if (color.isByBlock) return '#a0a8b8'
  return color.cssColor || '#7b8794'
})

/**
 * Installs the shared editor bridge.
 *
 * Idempotent and reference counted: the ribbon calls this on mount, so extra
 * mounts (for example a second viewer) neither duplicate listeners nor drop
 * them early.
 */
function initMTextRibbon(): void {
  initCount += 1
  if (initCount > 1) return
  AcEdMTextEditor.addActiveInputBoxChangeListener(onActiveInputBoxChanged)
  bindEditor(activeInputBox())
}

/** Releases the shared editor bridge once the last ribbon unmounts. */
function disposeMTextRibbon(): void {
  if (initCount === 0) return
  initCount -= 1
  if (initCount > 0) return
  AcEdMTextEditor.removeActiveInputBoxChangeListener(onActiveInputBoxChanged)
  bindEditor(null)
}

/**
 * Access to the MTEXT contextual ribbon state and commands.
 *
 * A module-level singleton is intentional: only one inline MTEXT editor can be
 * open at a time, and the ribbon panels are siblings rather than a
 * parent/child chain, so prop drilling would add noise without adding safety.
 *
 * @returns The shared reactive state (read-only) plus the editor commands.
 */
export function useMTextRibbon() {
  return {
    state: readonly(state),
    textStyleNames,
    currentTextStyle,
    fontOptions,
    heightOptions,
    formatColor,
    formatColorDisplay,
    initMTextRibbon,
    disposeMTextRibbon,
    syncFromEditor,
    applyTextStyle,
    setFontFamily,
    setFontHeight,
    setFormatColor,
    applyFormat,
    setFormatToggle,
    setScript,
    toggleStack,
    toggleCase,
    setAttachment,
    setParagraphAlignment,
    setLineSpacing,
    clearLineSpacing,
    insertText,
    closeEditor
  }
}

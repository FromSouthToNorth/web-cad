import { AcGiTextParagraphAlignment } from '@hy/cad-simple-viewer'

/**
 * Vertical script style for a character run, as used by the MTEXT editor.
 */
export type MTextRibbonScript = 'normal' | 'superscript' | 'subscript'

/**
 * Snapshot of the character / paragraph formatting shown by the MTEXT
 * contextual ribbon.
 *
 * Mirrors the `CharFormat` contract of `@mlightcad/mtext-input-box` and adds the
 * object-level attachment point, which the input box tracks separately from the
 * per-character format.
 */
export interface MTextRibbonFormat {
  /** Font family name (for example `Arial` or `simplex`). */
  fontFamily: string
  /** Character height in world units. */
  fontSize: number
  /** Bold character effect. */
  bold: boolean
  /** Italic character effect. */
  italic: boolean
  /** Underline decoration. */
  underline: boolean
  /** Overline decoration. */
  overline: boolean
  /** Superscript / subscript / normal baseline. */
  script: MTextRibbonScript
  /** Strike-through decoration. */
  strike: boolean
  /** AutoCAD ACI index; `256` is ByLayer and `0` is ByBlock. */
  aci: number | null
  /** Explicit RGB color packed as `0xRRGGBB` when no ACI applies. */
  rgb: number | null
  /** Character slant in degrees (MTEXT `\Q`). */
  obliqueAngle: number
  /** Horizontal character scale (MTEXT `\W`). */
  widthFactor: number
  /** Inter-character spacing factor (MTEXT `\T`); `1` is default spacing. */
  tracking: number
  /** Paragraph horizontal alignment for the active paragraph. */
  paragraphAlignment: AcGiTextParagraphAlignment
  /** MTEXT attachment point as a two-letter code (`TL`, `MC`, `BR`, ...). */
  attachmentPoint: string
}

/** Formatting shown when no editor is active or the editor reports nothing. */
export const DEFAULT_MTEXT_FORMAT: MTextRibbonFormat = {
  fontFamily: 'Arial',
  fontSize: 1,
  bold: false,
  italic: false,
  underline: false,
  overline: false,
  script: 'normal',
  strike: false,
  aci: null,
  rgb: null,
  obliqueAngle: 0,
  widthFactor: 1,
  tracking: 1,
  paragraphAlignment: AcGiTextParagraphAlignment.DEFAULT,
  attachmentPoint: 'TL'
}

/** MTEXT attachment codes in AutoCAD display order (top row first). */
export const MTEXT_ATTACHMENT_CODES = [
  'TL',
  'TC',
  'TR',
  'ML',
  'MC',
  'MR',
  'BL',
  'BC',
  'BR'
] as const

/** Paragraph alignment ids accepted by the editor's `setParagraphAlignment`. */
export const MTEXT_PARAGRAPH_ALIGNMENTS = [
  'default',
  'left',
  'center',
  'right',
  'justified',
  'distributed'
] as const

/** Paragraph alignment id accepted by {@link MTEXT_PARAGRAPH_ALIGNMENTS}. */
export type MTextParagraphAlignmentId =
  (typeof MTEXT_PARAGRAPH_ALIGNMENTS)[number]

/** Masks the MTEXT `%%d` / `\U+hhhh` payloads carried by the symbol dropdown. */
const MTEXT_UNICODE_ESCAPE = /^\\U\+([0-9A-Fa-f]{1,6})$/i

/**
 * Compares two ribbon format snapshots field by field.
 *
 * Used to avoid re-rendering the panel (and re-writing the editor format) when
 * a cursor move reports an unchanged format.
 *
 * @param a - First snapshot.
 * @param b - Second snapshot.
 * @returns `true` when every tracked field is equal.
 */
export function sameMTextRibbonFormat(
  a: MTextRibbonFormat,
  b: MTextRibbonFormat
): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.overline === b.overline &&
    a.script === b.script &&
    a.strike === b.strike &&
    a.aci === b.aci &&
    a.rgb === b.rgb &&
    a.obliqueAngle === b.obliqueAngle &&
    a.widthFactor === b.widthFactor &&
    a.tracking === b.tracking &&
    a.paragraphAlignment === b.paragraphAlignment &&
    a.attachmentPoint === b.attachmentPoint
  )
}

/**
 * Maps a paragraph alignment value to its ribbon id suffix.
 *
 * @param align - Alignment reported by the editor format.
 * @returns Alignment id used by {@link MTEXT_PARAGRAPH_ALIGNMENTS}.
 */
export function mtextParagraphAlignToSlug(
  align: AcGiTextParagraphAlignment
): MTextParagraphAlignmentId {
  switch (align) {
    case AcGiTextParagraphAlignment.LEFT:
      return 'left'
    case AcGiTextParagraphAlignment.RIGHT:
      return 'right'
    case AcGiTextParagraphAlignment.CENTER:
      return 'center'
    case AcGiTextParagraphAlignment.JUSTIFIED:
      return 'justified'
    case AcGiTextParagraphAlignment.DISTRIBUTED:
      return 'distributed'
    default:
      return 'default'
  }
}

/**
 * Turns a symbol payload into the string handed to the inline editor.
 *
 * AutoCAD stores symbols as `\U+hhhh` escapes, which the editor would otherwise
 * show literally, so a single escape is expanded to its character. Sequences
 * such as `%%d` and `\~` are left untouched for the editor to interpret.
 *
 * @param payload - Text after the `mtext-symbol:` prefix.
 * @returns The decoded character, or the original payload.
 */
export function mtextSymbolPayloadToString(payload: string): string {
  const match = MTEXT_UNICODE_ESCAPE.exec(payload)
  if (!match) return payload
  const codePoint = Number.parseInt(match[1], 16)
  if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
    return payload
  }
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return payload
  }
}

/**
 * Converts unknown input into a finite number.
 *
 * @param value - Raw value from a text style record or a UI control.
 * @returns Parsed finite number, or `undefined` for invalid input.
 */
export function normalizeMTextNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Trims, filters, and de-duplicates strings while preserving first-seen order.
 *
 * @param values - Candidate strings collected from editor state and styles.
 * @returns Unique, non-empty strings in display order.
 */
export function uniqueMTextStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  values.forEach(raw => {
    const value = raw.trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    unique.push(value)
  })
  return unique
}

import { AcGiMTextAttachmentPoint } from '@hy/graphic-interface'

import { AcDbDxfFiler, acdbHostApplicationServices } from '../src/base'
import { AcDbDatabase } from '../src/database'
import { AcDbMText } from '../src/entity'

/** Number of world units of text per line, per the renderer line model. */
const BASELINE_SPACING_RATIO = 5 / 3

/** Creates a working database so entity handles and styles resolve. */
function createWorkingDatabase(): AcDbDatabase {
  const db = new AcDbDatabase()
  db.createDefaultData()
  acdbHostApplicationServices().workingDatabase = db
  return db
}

/**
 * Appends the entity to the working database model space so owner/handle are
 * assigned, then writes its DXF fields and returns the DXF text.
 */
function writeMTextDxf(mtext: AcDbMText): string {
  const db = acdbHostApplicationServices().workingDatabase
  db.tables.blockTable.modelSpace.appendEntity(mtext)
  const filer = new AcDbDxfFiler()
  mtext.dxfOutFields(filer)
  return filer.toString()
}

/** Reads a DXF fragment back into a fresh mtext entity. */
function readMTextDxf(dxf: string): AcDbMText {
  const mtext = new AcDbMText()
  mtext.dxfIn(AcDbDxfFiler.fromString(dxf))
  return mtext
}

/** Returns the first value written for `code`, as a string. */
function dxfValueOf(dxf: string, code: number): string | undefined {
  const match = new RegExp(`(?:^|\\n)${code}\\n([^\\n]*)`).exec(dxf)
  return match?.[1]
}

/**
 * Same as {@link dxfValueOf} but matches the group code line exactly, so code 1
 * never matches inside `100` / `10`. Returns true when the group is absent.
 */
function dxfHasLineGroup(dxf: string, code: number): boolean {
  const lines = dxf.split('\n')
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (Number(lines[i]) === code) return true
  }
  return false
}

/** Writes then reads an mtext entity through the DXF group codes. */
function roundTrip(mtext: AcDbMText): {
  dxf: string
  restored: AcDbMText
} {
  const dxf = writeMTextDxf(mtext)
  return { dxf, restored: readMTextDxf(dxf) }
}

/**
 * Vertical extent (world units) the entity reserves for its text body.
 */
function verticalTextExtent(mtext: AcDbMText): number {
  const extents = mtext.geometricExtents
  return extents.max.y - extents.min.y
}

/**
 * Given the *stated* text height (DXF group 40), the vertical extent one line
 * of text should occupy when the entity is drawn. Multi-line text stacks
 * `lineCount` baselines at `height * 5/3` each.
 */
function expectedTextExtent(
  height: number,
  lineCount: number,
  lineSpacingFactor = 1
): number {
  const lineAdvance = height * BASELINE_SPACING_RATIO * lineSpacingFactor
  return height + (lineCount - 1) * lineAdvance
}

describe('AcDbMText DXF round trip', () => {
  beforeEach(() => {
    createWorkingDatabase()
  })

  it('round-trips Chinese contents without loss', () => {
    const contents = '第一行巷道名称\\P第二行煤层厚度：3.5m'
    const mtext = new AcDbMText()
    mtext.contents = contents
    mtext.location = { x: 0, y: 0, z: 0 }

    const { dxf, restored } = roundTrip(mtext)

    // Paragraph breaks must be encoded as `\P`, never as raw newlines.
    expect(dxf).toContain('1\n第一行巷道名称\\P第二行煤层厚度：3.5m')
    expect(dxf).not.toContain('第一行巷道名称\n')
    expect(restored.contents).toBe(contents)
    // Byte-exact comparison guards against silent re-encoding.
    expect(restored.contents).toEqual(contents)
    expect(
      Buffer.from(restored.contents, 'utf8').equals(
        Buffer.from(contents, 'utf8')
      )
    ).toBe(true)
  })

  it('round-trips inline format codes verbatim', () => {
    const contents =
      '{\\fSimSun|b0|i0|c134|p2;中文}\\H2.5x;大字{\\C1;红色}\\P\\A1;对齐'
    const mtext = new AcDbMText()
    mtext.contents = contents
    mtext.location = { x: 0, y: 0, z: 0 }

    const { restored } = roundTrip(mtext)

    expect(restored.contents).toBe(contents)
    expect(restored.contents).toContain('\\fSimSun')
    expect(restored.contents).toContain('\\H2.5x;')
    expect(restored.contents).toContain('\\C1;')
    expect(restored.contents).toContain('\\P')
  })

  it('round-trips height, width, attachment point and rotation', () => {
    const mtext = new AcDbMText()
    mtext.contents = '巷道'
    mtext.location = { x: 12.5, y: -3.25, z: 0 }
    mtext.height = 2.5
    mtext.width = 60
    mtext.attachmentPoint = AcGiMTextAttachmentPoint.MiddleCenter
    mtext.rotation = Math.PI / 6

    const { dxf, restored } = roundTrip(mtext)

    // Group 40 is the text height, group 41 the reference width.
    expect(dxf).toContain('40\n2.5')
    expect(dxf).toContain('41\n60')
    expect(dxf).toContain(`71\n${AcGiMTextAttachmentPoint.MiddleCenter}`)
    // Group 50 is written in degrees (rotation 30 deg). The writer keeps full
    // double precision, so compare numerically.
    expect(Number(dxfValueOf(dxf, 50))).toBeCloseTo(30, 6)

    expect(restored.height).toBeCloseTo(2.5, 6)
    expect(restored.width).toBeCloseTo(60, 6)
    expect(restored.attachmentPoint).toBe(AcGiMTextAttachmentPoint.MiddleCenter)
    expect(restored.rotation).toBeCloseTo(Math.PI / 6, 6)
    expect(restored.location.x).toBeCloseTo(12.5, 6)
    expect(restored.location.y).toBeCloseTo(-3.25, 6)
  })

  it('keeps group 40 as the per-line text height, not the block height', () => {
    // Two lines of text, spacing factor 1.
    const mtext = new AcDbMText()
    mtext.contents = '第一行\\P第二行'
    mtext.height = 2.5
    mtext.width = 40
    mtext.lineSpacingFactor = 1
    mtext.location = { x: 0, y: 0, z: 0 }

    const { dxf, restored } = roundTrip(mtext)

    expect(dxf).toContain('40\n2.5')
    // The block is taller than one line; the stored value must stay the
    // per-line height.
    const blockHeight = verticalTextExtent(restored)
    expect(blockHeight).toBeCloseTo(expectedTextExtent(2.5, 2), 6)
    expect(blockHeight).toBeGreaterThan(restored.height)
    expect(restored.height).toBeCloseTo(2.5, 6)
  })

  it('omits empty contents and an empty style name instead of writing "0"', () => {
    // Regression: an empty string value used to be written as the placeholder
    // '0', so a default `new AcDbMText()` serialized as `1\n0` + `7\n0` and came
    // back with contents === '0' and styleName === '0' (a non-existent style).
    const mtext = new AcDbMText()
    mtext.location = { x: 0, y: 0, z: 0 }
    expect(mtext.contents).toBe('')
    expect(mtext.styleName).toBe('')

    const { dxf, restored } = roundTrip(mtext)

    // No group 1 / group 3 (contents) and no group 7 (style name) at all.
    expect(dxfHasLineGroup(dxf, 1)).toBe(false)
    expect(dxfHasLineGroup(dxf, 3)).toBe(false)
    expect(dxfHasLineGroup(dxf, 7)).toBe(false)

    expect(restored.contents).toBe('')
    expect(restored.contents).not.toBe('0')
    expect(restored.styleName).toBe('')
    expect(restored.styleName).not.toBe('0')
  })

  it('round-trips a non-empty style name unchanged', () => {
    const mtext = new AcDbMText()
    mtext.contents = 'text'
    mtext.styleName = 'MyTextStyle'
    mtext.location = { x: 0, y: 0, z: 0 }

    const { dxf, restored } = roundTrip(mtext)

    expect(dxfHasLineGroup(dxf, 1)).toBe(true)
    expect(dxfValueOf(dxf, 7)).toBe('MyTextStyle')
    expect(restored.styleName).toBe('MyTextStyle')
  })

  /**
   * EXPECTED-FAIL - the creating command writes an editor value that is not the
   * text height it asked for.
   *
   * `AcEdMTextEditor.open()` reports `Math.max(1, textHeight)` and
   * `AcApMTextCmd` stores that verbatim in DXF group 40. Below the 1-unit
   * floor the stored height therefore exceeds the world height the user's pick
   * implies: a pick whose height is 0.192 world units persists as 1 and the
   * round trip faithfully reproduces the wrong value.
   *
   * `AcDbMText` itself is only the carrier here: the loss happens upstream in
   * the editor + command handshake.
   */
  it.failing(
    'preserves a sub-unit text height as authored (no silent clamp)',
    async () => {
      const authoredHeight = 0.192
      // Value the real editor would have handed over: Math.max(1, 0.192).
      const editorReturnedHeight = Math.max(1, authoredHeight)
      const mtext = new AcDbMText()
      mtext.contents = '单行文字'
      mtext.height = editorReturnedHeight
      mtext.location = { x: 0, y: 0, z: 0 }

      const { restored } = roundTrip(mtext)

      // The entity must still describe the authored text height.
      expect(restored.height).toBeCloseTo(authoredHeight, 6)
      expect(verticalTextExtent(restored)).toBeCloseTo(
        expectedTextExtent(authoredHeight, 1),
        6
      )
    }
  )
})

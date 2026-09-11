/**
 * Geometric assertions for real MTEXT rendering output.
 *
 * @remarks
 * Unlike the other `AcTrMText*` suites, this spec does NOT mock
 * `@mlightcad/mtext-renderer`. It builds a real {@link MText} over the real
 * singleton `FontManager`, feeds it the offline CJK big font
 * `cad-viewer/assets/hztxt.shx`, and asserts on the produced geometry:
 * character boxes, per-line layout rows and the anchored bounding box.
 *
 * The point is to assert "what the renderer actually drew", so a regression in
 * glyph advance, line metrics or attachment anchoring fails here instead of only
 * being visible on screen.
 *
 * Jest maps `three` to the CJS build (see `jest.config.ts`) and no
 * `three/examples/jsm` mock is involved in the SHX path (SHX glyphs become
 * `BufferGeometry` line strips), so the real renderer runs unchanged under Node.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  FontManager,
  MText,
  MTextAttachmentPoint,
  type MTextData,
  type MTextLayout,
  type TextStyle
} from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

/**
 * Big-font SHX shipped with the repo; it carries simplified-Chinese glyphs and
 * ASCII glyphs, so it can render both the CJK and the mixed CJK/Latin cases
 * without any network access (the CDN font catalog is not reachable in CI).
 */
const FONT_PATH = resolve(__dirname, '../../../assets/hztxt.shx')

/** Font name/alias used by both the text style and the cached font. */
const FONT_NAME = 'hztxt'

/** Baseline file for the layout regression snapshot. */
const BASELINE_PATH = resolve(__dirname, 'fixtures/mtext-layout-baseline.json')

/** Text height (drawing units) used by most assertions; acts as the "em". */
const EM = 10

/** Fixed decimal places used to make snapshots byte-stable across runs. */
const DECIMALS = 6

/**
 * AutoCAD single-spacing rule: `lineSpaceFactor` is a multiple of
 * `5/3 * textHeight`. Mirrors the exported `LINE_SPACING_SCALE_FACTOR`.
 */
const LINE_SPACING_SCALE_FACTOR = 5 / 3

const TEXT_STYLE: TextStyle = {
  name: 'ac-tr-mtext-geometry-spec',
  standardFlag: 0,
  fixedTextHeight: 0,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: EM,
  font: `${FONT_NAME}.shx`,
  bigFont: `${FONT_NAME}.shx`
}

/**
 * Minimal {@link StyleManager}.
 *
 * @remarks
 * The real viewer caches materials per color, but MTEXT always asks for one
 * before it knows whether the segment produced mesh or line geometry, so both
 * factories are called on every run. Plain THREE materials are enough here
 * because this spec never renders - it only reads geometry.
 */
const STYLE_MANAGER = {
  unsupportedTextStyles: {} as Record<string, number>,
  getMeshBasicMaterial: () => new THREE.MeshBasicMaterial(),
  getLineBasicMaterial: () => new THREE.LineBasicMaterial()
}

function round(value: number): number {
  return Number(value.toFixed(DECIMALS))
}

/** Renders one MTEXT run through the real renderer and returns its geometry. */
function renderMText(data: Partial<MTextData>): {
  mtext: MText
  layout: MTextLayout
} {
  const mtext = new MText(
    {
      text: '',
      height: EM,
      width: 0,
      position: { x: 0, y: 0, z: 0 },
      attachmentPoint: MTextAttachmentPoint.TopLeft,
      collectCharBoxes: true,
      ...data
    },
    TEXT_STYLE,
    STYLE_MANAGER,
    FontManager.instance
  )
  mtext.syncDraw()
  return { mtext, layout: mtext.createLayoutData() }
}

/** Left edge of every char box, which is where the layout pen actually put it. */
function leftEdges(data: Partial<MTextData>): number[] {
  return renderMText(data).layout.chars.map(char => round(char.box.min.x))
}

/** Ink width (bbox width) of every char box, in drawing units. */
function inkWidths(text: string): number[] {
  return renderMText({ text }).layout.chars.map(char =>
    round(char.box.max.x - char.box.min.x)
  )
}

beforeAll(async () => {
  const data = readFileSync(FONT_PATH)
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer
  // gb2312 matches the encoding declared by hztxt.shx's BIGFONT header.
  await FontManager.instance.cacheFont(
    buffer,
    `${FONT_NAME}.shx`,
    [FONT_NAME],
    'gb2312'
  )
})

describe('AcTrMText geometry accuracy (real MTEXT renderer)', () => {
  it('caches the offline CJK font used by every assertion', () => {
    expect(existsSync(FONT_PATH)).toBe(true)
    expect(FontManager.instance.isFontLoaded(FONT_NAME)).toBe(true)
  })

  /**
   * Layout invariant 1 - char count.
   *
   * @remarks
   * Verified rules of the underlying parser/layout for the strings below:
   * - A plain space (`' '`) is one normal character; it produces its own
   *   `CHAR` box placed on the current line, so it counts.
   * - A literal newline inside the string is a normal printable character here
   *   (the parser does not treat `\n` as a paragraph break); only the MTEXT
   *   control sequence `\P` breaks a line.
   * - `\P` itself has no box, and trailing (or doubled) `\P` yields an extra
   *   empty layout row with no characters.
   * - Characters the loaded font cannot resolve degrade to the "not found"
   *   glyph or a space; they still emit a `CHAR` box, so a missing glyph is NOT
   *   detectable through the count.
   */
  it('emits one CHAR box per visible character and none for control codes', () => {
    expect(renderMText({ text: '中文标注测试' }).layout.chars).toHaveLength(6)
    expect(renderMText({ text: '中文AB测试' }).layout.chars).toHaveLength(6)
    expect(renderMText({ text: '中 A' }).layout.chars).toHaveLength(3)
    expect(renderMText({ text: '中  A' }).layout.chars).toHaveLength(4)
    expect(renderMText({ text: '中文\\PAB' }).layout.chars).toHaveLength(4)
    expect(renderMText({ text: '中文\\PAB' }).layout.lines).toHaveLength(2)
    // Doubled `\P` adds an empty row but no character.
    expect(renderMText({ text: 'A\\P\\PB' }).layout.chars).toHaveLength(2)
    expect(renderMText({ text: 'A\\P\\PB' }).layout.lines).toHaveLength(3)
  })

  it('produces finite, non-degenerate boxes for every char', () => {
    for (const text of ['中文标注测试', '中文AB测试', '中 A', 'A\\P中文\\PB']) {
      const { mtext, layout } = renderMText({ text })
      expect(layout.chars.length).toBeGreaterThan(0)

      for (const char of layout.chars) {
        expect(char.type).toBe('CHAR')
        expect(char.char.length).toBeGreaterThan(0)
        expect(Number.isFinite(char.box.min.x)).toBe(true)
        expect(Number.isFinite(char.box.min.y)).toBe(true)
        expect(Number.isFinite(char.box.max.x)).toBe(true)
        expect(Number.isFinite(char.box.max.y)).toBe(true)
        // Ink may be flat in Z, but it must never be zero/inverted in X or Y.
        expect(char.box.max.x).toBeGreaterThan(char.box.min.x)
        expect(char.box.max.y).toBeGreaterThan(char.box.min.y)
        // A single glyph must never be able to be taller than the whole run.
        expect(char.box.max.y - char.box.min.y).toBeLessThanOrEqual(
          mtext.box.max.y - mtext.box.min.y + 1e-6
        )
      }
    }
  })

  /**
   * Layout invariant 2 - line metrics.
   *
   * @remarks
   * `LineLayout.y` is the vertical CENTER of the row and `height` is the full
   * row height (`lineSpaceFactor * 5/3 * textHeight`). The first rendered row
   * sits above `y = 0` because the MTEXT insertion origin is the top-left of the
   * frame; subsequent rows decrease in Y (text flows downward). The last
   * rendered row has `breakIndex === undefined`; earlier rows carry the index in
   * `layout.chars` where the visual break happens (duplicates mean empty rows).
   */
  it('scales line height with text height and lineSpaceFactor', () => {
    for (const factor of [0.5, 1, 2, 3]) {
      for (const height of [5, 10, 20]) {
        const { layout } = renderMText({
          text: 'A\\PB\\PC',
          height,
          lineSpaceFactor: factor
        })
        expect(layout.lines).toHaveLength(3)
        for (const line of layout.lines) {
          expect(round(line.height)).toBe(
            round(factor * LINE_SPACING_SCALE_FACTOR * height)
          )
        }
      }
    }
  })

  it('separates rows by exactly one line height downward', () => {
    const { layout } = renderMText({ text: 'A\\PB\\PC' })
    const [first, second, third] = layout.lines
    expect(second.y - first.y).toBeCloseTo(-first.height, 6)
    expect(third.y - second.y).toBeCloseTo(-second.height, 6)
    expect(layout.lines.map(line => line.breakIndex)).toEqual([1, 2, undefined])
  })

  it('keeps empty rows the same height and pitch as filled rows', () => {
    const { layout } = renderMText({ text: 'A\\P\\PB' })
    expect(layout.lines).toHaveLength(3)
    const heights = layout.lines.map(line => round(line.height))
    expect(heights[0]).toBe(heights[1])
    expect(heights[1]).toBe(heights[2])
    expect(round(layout.lines[1].y - layout.lines[0].y)).toBe(-heights[0])
    expect(layout.lines.map(line => line.breakIndex)).toEqual([1, 1, undefined])
  })

  /**
   * Layout invariant 3 - CJK width characteristics.
   *
   * @remarks
   * `hztxt.shx` is an AutoCAD BIGFONT: its header declares a fixed 127-unit
   * cell, and every glyph it resolves (CJK and ASCII alike) comes back with the
   * same pen advance. The observed advance is
   * `10.23622 / 10 = 1.0236` of the requested text height, i.e. very close to
   * 1em. `1em` here means the drawing-space MTEXT height passed in
   * `MTextData.height`, which is also the value AutoCAD treats as the character
   * cell height for a fixed-cell SHX font.
   *
   * Advance is measured between the left edges of two identical glyphs, because
   * that difference is the pen advance and is not affected by where the glyph's
   * ink starts inside its cell.
   *
   * Tolerance: `+/- 0.15em` around 1em. The cell factor is
   * `DEFAULT_INK_WIDTH_CELL_FACTOR = 0.2` applied to the auto-scaled glyph size,
   * so a legitimate font/scale change moves this by a few percent, while a real
   * "Chinese glyphs render at half width" or "at double width" regression moves
   * it by 50% or 100%.
   */
  it('advances a full-width CJK glyph by about 1em', () => {
    for (const glyph of ['中', '文', '测']) {
      const edges = leftEdges({ text: glyph + glyph })
      expect(edges).toHaveLength(2)
      const advance = edges[1] - edges[0]
      expect(advance).toBeGreaterThan(0.85 * EM)
      expect(advance).toBeLessThan(1.15 * EM)
    }
  })

  it('renders Latin lowercase narrower than full-width CJK glyphs', () => {
    const [cjkInk] = inkWidths('中')
    const [iInk] = inkWidths('i')
    const [lInk] = inkWidths('l')
    const [wInk] = inkWidths('W')

    // Ink widths are font data, not guesses: 中 = 0.685em, i = 0.260em,
    // l = 0.260em, W = 0.795em with hztxt at height 10.
    expect(cjkInk).toBeGreaterThan(0.55 * EM)
    expect(cjkInk).toBeLessThan(0.8 * EM)
    expect(iInk).toBeLessThan(0.4 * EM)
    expect(lInk).toBeLessThan(0.4 * EM)
    expect(iInk).toBeLessThan(cjkInk)
    expect(lInk).toBeLessThan(cjkInk)
    // A wide Latin capital is the widest ASCII glyph here (0.795em) but still
    // stays inside the 1.0236em cell the font reserves for every glyph.
    expect(wInk).toBeGreaterThan(iInk)
    expect(wInk).toBeGreaterThan(0.7 * EM)
    expect(wInk).toBeLessThan(1.0 * EM)
  })

  it('lays out a mixed CJK/Latin run without overlap and keeps it monotonic in X', () => {
    const { layout } = renderMText({ text: '中文AB测试' })
    const boxes = layout.chars.map(char => char.box)
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].min.x).toBeGreaterThan(boxes[i - 1].min.x)
      expect(boxes[i].min.x).toBeGreaterThan(boxes[i - 1].max.x)
    }
    // 6 glyphs: 4 CJK cells plus 2 Latin cells, all in one row.
    expect(layout.lines).toHaveLength(1)
    const total = boxes[boxes.length - 1].max.x - boxes[0].min.x
    expect(total).toBeGreaterThan(5 * EM)
    expect(total).toBeLessThan(8 * EM)
  })

  it('scales the run with widthFactor', () => {
    const single = inkWidths('中')
    const half = renderMText({ text: '中', widthFactor: 0.5 }).layout.chars
    const twice = renderMText({ text: '中', widthFactor: 2 }).layout.chars
    expect(half[0].box.max.x).toBeCloseTo(single[0] / 2, 5)
    expect(twice[0].box.max.x).toBeCloseTo(single[0] * 2, 5)
  })

  /**
   * Layout invariant 4 - attachment point anchoring.
   *
   * @remarks
   * Semantics read off `MText.calculateAnchorPoint` (mtext-renderer 0.12.4) and
   * confirmed by measurement. The translation is applied to the laid-out frame
   * so that the frame's anchor coincides with the insertion origin; the frame is
   * the visible geometry box and Y grows upward while text flows downward:
   * - `TopLeft = 1`      -> `translate(-minX, -maxY)`: the frame's LEFT edge
   *   sits at the origin X and its TOP edge at the origin Y, so the whole body
   *   hangs below the insertion point (`box.max.y ~= 0`, `box.min.y < 0`).
   * - `MiddleCenter = 5` -> `translate(-centerX, -centerY)`: the frame centre is
   *   the insertion point (box is symmetric about both axes).
   * - `BottomRight = 9`  -> `translate(-maxX, -minY)`: the frame's RIGHT edge
   *   sits at the origin X and its BOTTOM edge at the origin Y, so the body sits
   *   above the insertion point (`box.min.y ~= 0`, `box.max.y > 0`).
   * The same content therefore yields an identical box SIZE for every
   * attachment point; only the offset relative to the origin changes.
   */
  it('anchors TopLeft, MiddleCenter and BottomRight per AutoCAD semantics', () => {
    const cases = [
      MTextAttachmentPoint.TopLeft,
      MTextAttachmentPoint.MiddleCenter,
      MTextAttachmentPoint.BottomRight
    ]
    const sizes = cases.map(point => {
      const { mtext } = renderMText({ text: '中A', attachmentPoint: point })
      return mtext.box.getSize(new THREE.Vector3())
    })

    const [topLeftSize, middleSize, bottomRightSize] = sizes
    expect(round(middleSize.x)).toBe(round(topLeftSize.x))
    expect(round(middleSize.y)).toBe(round(topLeftSize.y))
    expect(round(bottomRightSize.x)).toBe(round(topLeftSize.x))
    expect(round(bottomRightSize.y)).toBe(round(topLeftSize.y))

    const topLeft = renderMText({
      text: '中A',
      attachmentPoint: MTextAttachmentPoint.TopLeft
    }).mtext.box
    expect(round(topLeft.min.x)).toBe(0)
    expect(round(topLeft.max.y)).toBe(0)
    expect(topLeft.min.y).toBeLessThan(0)
    expect(topLeft.max.x).toBeGreaterThan(0)

    const middle = renderMText({
      text: '中A',
      attachmentPoint: MTextAttachmentPoint.MiddleCenter
    }).mtext.box
    // Compare against 0 with a tolerance because the anchoring translation can
    // produce -0 for an exactly symmetric frame.
    expect(round(middle.min.x + middle.max.x)).toBeCloseTo(0, 6)
    expect(round(middle.min.y + middle.max.y)).toBeCloseTo(0, 6)

    const bottomRight = renderMText({
      text: '中A',
      attachmentPoint: MTextAttachmentPoint.BottomRight
    }).mtext.box
    expect(round(bottomRight.max.x)).toBe(0)
    // -0 is a valid representation of an exactly-anchored edge.
    expect(round(bottomRight.min.y)).toBeCloseTo(0, 6)
    expect(bottomRight.max.y).toBeGreaterThan(0)
    expect(bottomRight.min.x).toBeLessThan(0)
  })

  /**
   * Layout invariant 5 - lineSpaceFactor.
   *
   * @remarks
   * Row pitch (and therefore row height) is
   * `lineSpaceFactor * 5/3 * textHeight`, and per-row layout metadata, the
   * anchored frame and the rendered glyph boxes all stay mutually consistent
   * when the factor changes. Measured for text height 10 and `A\PB\PC`:
   *
   * | factor | height  | pitch   | row0 ink top | row2 ink bottom | frame height |
   * | ------ | ------- | ------- | ------------ | --------------- | ------------ |
   * | 1      | 16.6667 | 16.6667 | 0.0          | -41.129         | 41.129       |
   * | 2      | 33.3333 | 33.3334 | 0.0          | -74.462         | 74.462       |
   *
   * The first row stays pinned at the frame top (AutoCAD top-anchored MTEXT
   * semantics) and the extra leading pushes the later rows down, so the frame
   * grows by `(factor - 1) * 5/3 * textHeight` per additional row.
   */
  it('scales row pitch proportionally with lineSpaceFactor', () => {
    const single = renderMText({ text: 'A\\PB\\PC', lineSpaceFactor: 1 })
    const double = renderMText({ text: 'A\\PB\\PC', lineSpaceFactor: 2 })

    const singlePitch = single.layout.lines[0].y - single.layout.lines[1].y
    const doublePitch = double.layout.lines[0].y - double.layout.lines[1].y
    expect(doublePitch).toBeCloseTo(singlePitch * 2, 5)
    expect(double.layout.lines[0].height).toBeCloseTo(
      single.layout.lines[0].height * 2,
      6
    )
    expect(double.layout.lines[1].height).toBeCloseTo(singlePitch * 2, 5)

    const singleHeight = single.mtext.box.max.y - single.mtext.box.min.y
    const doubleHeight = double.mtext.box.max.y - double.mtext.box.min.y
    // 5 decimals: the frame height accumulates ~1e-15 sampling differences from
    // the SHX glyph outlines, so the last ULP of the sum is not stable.
    expect(doubleHeight).toBeCloseTo(singleHeight + 2 * singlePitch, 5)
  })

  it('keeps the first row pinned at the frame top for any lineSpaceFactor', () => {
    for (const lineSpaceFactor of [0.5, 1, 2, 3]) {
      const { mtext, layout } = renderMText({
        text: 'A\\PB\\PC',
        lineSpaceFactor
      })
      const firstRow = layout.chars[0].box
      // SHX 'A' ink stops 0.0787 below the cap line, which is what pins the
      // frame top; anything larger would mean the first row slid down.
      expect(round(mtext.box.max.y)).toBe(0)
      expect(mtext.box.max.y - firstRow.max.y).toBeLessThan(0.01 * EM)
      expect(firstRow.max.y - firstRow.min.y).toBeGreaterThan(0.7 * EM)
    }
  })

  it('scales the whole layout linearly with text height', () => {
    const base = renderMText({ text: '中A\\PB', height: 10 })
    const twice = renderMText({ text: '中A\\PB', height: 20 })
    expect(round(twice.mtext.box.max.x)).toBe(round(base.mtext.box.max.x * 2))
    expect(round(twice.mtext.box.min.y)).toBe(round(base.mtext.box.min.y * 2))
    expect(round(twice.layout.lines[0].y)).toBe(
      round(base.layout.lines[0].y * 2)
    )
  })
})

/**
 * Layout regression snapshot.
 *
 * @remarks
 * The snapshot records only stable, rounded numbers: char count, per-row
 * `y`/`height`/`breakIndex` and the overall box min/max. It deliberately does
 * NOT record char-box ink extents or any `Map`/`Set` iteration order, so two
 * runs on the same Node version must produce byte-identical JSON.
 *
 * Stability measures: every value goes through {@link round} (fixed 6 decimals),
 * which also collapses `-0` to `0` because `JSON.stringify(-0)` is `"0"`;
 * `breakIndex` is normalised from `undefined` to `null`; and the case list is an
 * ordered array so object key order is fixed by construction.
 *
 * IMPORTANT: if the baseline and the implementation disagree, decide which side
 * is wrong before editing the file - a mismatch usually means the renderer
 * regressed (glyph advance, line metrics or anchoring). Only regenerate the
 * baseline after confirming the new numbers are the intended AutoCAD semantics,
 * and say so in the commit message.
 */
describe('AcTrMText layout regression baseline', () => {
  it('matches fixtures/mtext-layout-baseline.json', () => {
    const snapshot = collectBaseline()
    const serialized = `${JSON.stringify(snapshot, null, 2)}\n`

    if (!existsSync(BASELINE_PATH)) {
      mkdirSync(dirname(BASELINE_PATH), { recursive: true })
      writeFileSync(BASELINE_PATH, serialized, 'utf8')
    }

    const baseline = readFileSync(BASELINE_PATH, 'utf8')
    expect(serialized).toBe(baseline)
  })
})

type LayoutSnapshot = {
  text: string
  height: number
  lineSpaceFactor: number
  widthFactor: number
  attachmentPoint: MTextAttachmentPoint
  charCount: number
  lineCount: number
  lines: Array<{ y: number; height: number; breakIndex: number | null }>
  box: { min: [number, number]; max: [number, number] }
}

/**
 * Case list for the regression baseline. Kept small on purpose: every entry is
 * a distinct layout behaviour (single row, CJK/Latin mix, wrapping, soft breaks,
 * empty rows, anchoring, line spacing, text height).
 */
const BASELINE_CASES: Array<Partial<MTextData> & { text: string }> = [
  { text: '中文标注测试' },
  { text: '中文AB测试' },
  { text: '中 A' },
  { text: '中文\\PAB' },
  { text: 'A\\P\\PB' },
  { text: 'A\\PB\\PC', lineSpaceFactor: 2 },
  { text: '中A', attachmentPoint: MTextAttachmentPoint.MiddleCenter },
  { text: '中A', attachmentPoint: MTextAttachmentPoint.BottomRight },
  { text: 'A\\PB\\PC', height: 20 },
  { text: 'AB中', widthFactor: 0.5 }
]

function collectBaseline(): LayoutSnapshot[] {
  return BASELINE_CASES.map(testCase => {
    const { mtext, layout } = renderMText(testCase)
    const lines = layout.lines.map(line => ({
      y: round(line.y),
      height: round(line.height),
      breakIndex: line.breakIndex ?? null
    }))
    const attachmentPoint =
      testCase.attachmentPoint ?? MTextAttachmentPoint.TopLeft
    return {
      text: testCase.text,
      height: testCase.height ?? EM,
      lineSpaceFactor: testCase.lineSpaceFactor ?? 1,
      widthFactor: testCase.widthFactor ?? 1,
      attachmentPoint,
      charCount: layout.chars.length,
      lineCount: lines.length,
      lines,
      box: {
        min: [round(mtext.box.min.x), round(mtext.box.min.y)],
        max: [round(mtext.box.max.x), round(mtext.box.max.y)]
      }
    }
  })
}

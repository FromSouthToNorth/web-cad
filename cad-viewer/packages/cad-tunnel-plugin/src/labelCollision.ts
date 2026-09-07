/**
 * Label collision helpers shared by the GeoJSON conversion (draw time) and
 * the settings panel (re-culling after a size change).
 *
 * Text width is estimated from the default font's glyph metrics: a CJK
 * (full-width) glyph advances roughly one text height, Latin glyphs about
 * 0.55. The estimate only has to keep labels from visually overlapping, it
 * does not need to be pixel-exact.
 */

const CJK_CHAR =
  /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** Horizontal padding added to each side of a label box, in text heights. */
const BOX_PADDING = 0.2

/** Vertical half-height of a label box, in text heights. */
const BOX_HALF_HEIGHT = 0.75

/** Estimated drawn width of `label` at the given text height. */
export function estimateLabelWidth(label: string, height: number): number {
  let width = 0
  for (const char of label) {
    width += CJK_CHAR.test(char) ? height : height * 0.55
  }
  return width
}

/** Axis-aligned collision box of a horizontally centered label at (x, y). */
export interface LabelBox {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
}

/** Builds the collision box of a centered label anchored at (x, y). */
export function labelBoxOf(
  x: number,
  y: number,
  label: string,
  height: number
): LabelBox {
  return {
    x,
    y,
    halfWidth: estimateLabelWidth(label, height) / 2 + height * BOX_PADDING,
    halfHeight: height * BOX_HALF_HEIGHT
  }
}

/** True when two label boxes overlap in the XY plane. */
export function labelsOverlap(a: LabelBox, b: LabelBox): boolean {
  return (
    Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth &&
    Math.abs(a.y - b.y) < a.halfHeight + b.halfHeight
  )
}

/**
 * Greedy collision filter: keeps every box that does not overlap an earlier
 * kept box. Sort boxes by priority first — earlier boxes win ties.
 *
 * @returns One boolean per input box, in input order.
 */
export function selectNonOverlapping(boxes: readonly LabelBox[]): boolean[] {
  const keep: boolean[] = []
  for (let i = 0; i < boxes.length; i++) {
    let visible = true
    for (let j = 0; j < i; j++) {
      if (keep[j] && labelsOverlap(boxes[j], boxes[i])) {
        visible = false
        break
      }
    }
    keep.push(visible)
  }
  return keep
}

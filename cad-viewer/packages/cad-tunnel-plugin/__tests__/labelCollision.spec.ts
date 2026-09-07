import {
  estimateLabelWidth,
  LabelBox,
  labelBoxOf,
  labelsOverlap,
  selectNonOverlapping
} from '../src/labelCollision'

const box = (x: number, y: number): LabelBox => ({
  x,
  y,
  halfWidth: 1,
  halfHeight: 1
})

describe('estimateLabelWidth', () => {
  it('measures CJK glyphs at full height and ASCII glyphs at 0.55', () => {
    expect(estimateLabelWidth('巷', 2)).toBeCloseTo(2)
    expect(estimateLabelWidth('AB', 2)).toBeCloseTo(2.2)
    expect(estimateLabelWidth('1105进风巷', 2)).toBeCloseTo(10.4)
  })

  it('returns 0 for an empty label', () => {
    expect(estimateLabelWidth('', 2)).toBe(0)
  })
})

describe('labelBoxOf', () => {
  it('adds horizontal padding and a vertical half-height', () => {
    const result = labelBoxOf(3, 4, 'AB', 2)
    expect(result.x).toBe(3)
    expect(result.y).toBe(4)
    expect(result.halfWidth).toBeCloseTo(2.2 / 2 + 2 * 0.2)
    expect(result.halfHeight).toBeCloseTo(2 * 0.75)
  })
})

describe('labelsOverlap', () => {
  it('detects overlap in both axes and rejects separated boxes', () => {
    expect(labelsOverlap(box(0, 0), box(1.9, 0))).toBe(true)
    expect(labelsOverlap(box(0, 0), box(2.1, 0))).toBe(false)
    expect(labelsOverlap(box(0, 0), box(0.9, 0.9))).toBe(true)
    expect(labelsOverlap(box(0, 0), box(3, 3))).toBe(false)
  })
})

describe('selectNonOverlapping', () => {
  it('greedily keeps non-overlapping boxes in input order', () => {
    expect(
      selectNonOverlapping([box(0, 0), box(1, 0), box(10, 0), box(11, 0)])
    ).toEqual([true, false, true, false])
  })

  it('keeps everything when nothing overlaps', () => {
    expect(selectNonOverlapping([box(0, 0), box(10, 0)])).toEqual([
      true,
      true
    ])
  })

  it('handles an empty input', () => {
    expect(selectNonOverlapping([])).toEqual([])
  })
})

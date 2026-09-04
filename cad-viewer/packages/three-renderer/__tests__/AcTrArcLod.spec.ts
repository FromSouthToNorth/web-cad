import {
  acTrComputeArcSegmentCount,
  acTrIsArcLodEnabled,
  acTrSetArcLodEnabled
} from '../src/draw/AcTrArcLod'

const FULL = 100
const TIER1 = 48
const TIER0 = 16
const DIAG = 1e6

describe('acTrComputeArcSegmentCount', () => {
  afterEach(() => {
    acTrSetArcLodEnabled(true)
  })

  it('uses the legacy 100 segments when the feature flag is off', () => {
    acTrSetArcLodEnabled(false)
    expect(acTrComputeArcSegmentCount(1, 1, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(1, 0.25, DIAG)).toBe(FULL)
  })

  it('reports the global flag state', () => {
    expect(acTrIsArcLodEnabled()).toBe(true)
    acTrSetArcLodEnabled(false)
    expect(acTrIsArcLodEnabled()).toBe(false)
  })

  it('reduces full circles below the tier0 boundary (r/diag < 1e-4)', () => {
    expect(acTrComputeArcSegmentCount(50, 1, DIAG)).toBe(TIER0)
    expect(acTrComputeArcSegmentCount(99.999, 1, DIAG)).toBe(TIER0)
  })

  it('uses tier1 segments between the boundaries (1e-4 <= r/diag < 1e-2)', () => {
    // Exactly at the tier0 boundary the next tier applies.
    expect(acTrComputeArcSegmentCount(100, 1, DIAG)).toBe(TIER1)
    expect(acTrComputeArcSegmentCount(9999.9, 1, DIAG)).toBe(TIER1)
  })

  it('keeps 100 segments at or above the tier1 boundary', () => {
    expect(acTrComputeArcSegmentCount(10000, 1, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(1e6, 1, DIAG)).toBe(FULL)
  })

  it('scales partial arcs by their sweep ratio with a floor of 8', () => {
    // tier0 full = 16; a quarter circle wants 4 segments but floors at 8.
    expect(acTrComputeArcSegmentCount(50, 0.25, DIAG)).toBe(8)
    // A half circle halves the tier1 count exactly.
    expect(acTrComputeArcSegmentCount(1000, 0.5, DIAG)).toBe(24)
    // A three-quarter tier1 arc rounds up.
    expect(acTrComputeArcSegmentCount(1000, 0.75, DIAG)).toBe(36)
  })

  it('treats a sweepRatio of at least 1 as a full circle', () => {
    expect(acTrComputeArcSegmentCount(50, 1, DIAG)).toBe(TIER0)
    expect(acTrComputeArcSegmentCount(50, 1.5, DIAG)).toBe(TIER0)
    // Ratio just under 1 rounds up to the full count anyway.
    expect(acTrComputeArcSegmentCount(50, 0.999, DIAG)).toBe(TIER0)
  })

  it('falls back to 100 segments for degenerate inputs', () => {
    expect(acTrComputeArcSegmentCount(0, 1, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(-5, 1, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(NaN, 1, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(Infinity, 1, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(50, 1, 0)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(50, 1, -1)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(50, 1, NaN)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(50, 0, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(50, -0.5, DIAG)).toBe(FULL)
    expect(acTrComputeArcSegmentCount(50, NaN, DIAG)).toBe(FULL)
  })
})

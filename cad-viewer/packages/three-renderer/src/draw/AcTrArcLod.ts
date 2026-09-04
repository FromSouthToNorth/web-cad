/**
 * Arc tessellation LOD (M6-1).
 *
 * Circles, arcs and ellipses are densified into polylines at draw time.
 * Every primitive used to pay a fixed 100-segment tessellation even when it
 * is far below screen resolution at fit view (borehole symbols in mine
 * drawings), inflating the shared batch buffers, the conversion drain and
 * the first GPU upload.
 *
 * The segment count scales with `radius / diagonal`, the same scale-free
 * ratio the zoom-to-fit uses. The diagonal comes from the scene's packed
 * batch bounds (maintained by the view per conversion chunk, see
 * `AcTrRenderContext.arcLodDiagonal`), so the ratio is a faithful proxy for
 * on-screen size at fit view and can only over-estimate while the scene box
 * is still growing — the LOD therefore never under-tessellates a visible
 * primitive.
 *
 * Callers fall back to the legacy fixed 100 segments whenever the diagonal
 * is unknown or degenerate, or when the feature flag is off.
 */

/** Legacy fixed tessellation, unchanged for large primitives. */
const ARC_LOD_FULL_SEGMENTS = 100
/** Segments for primitives whose radius is below 1e-2 of the drawing diagonal. */
const ARC_LOD_TIER1_SEGMENTS = 48
/** Segments for primitives whose radius is below 1e-4 of the drawing diagonal. */
const ARC_LOD_TIER0_SEGMENTS = 16
/** Tier 1 boundary, as radius / diagonal. */
const ARC_LOD_TIER1_RATIO = 1e-2
/** Tier 0 boundary, as radius / diagonal. */
const ARC_LOD_TIER0_RATIO = 1e-4
/** Floor for partial arcs; a tiny sweep must not collapse to a degenerate strip. */
const ARC_LOD_MIN_SEGMENTS = 8

let _arcLodEnabled = true

/**
 * Global kill switch for arc tessellation LOD (A/B benchmarks and rollback).
 * When disabled, circles, arcs and ellipses always use the legacy 100-segment
 * tessellation.
 */
export function acTrSetArcLodEnabled(enabled: boolean): void {
  _arcLodEnabled = enabled
}

/**
 * Returns whether arc tessellation LOD is currently enabled.
 */
export function acTrIsArcLodEnabled(): boolean {
  return _arcLodEnabled
}

/**
 * Computes the segment count used to densify a circle/arc/ellipse.
 *
 * @param radius - Circle radius, or the larger of the two ellipse radii.
 * @param sweepRatio - Sweep angle as a fraction of a full circle (1 = full).
 * @param diagonal - Drawing extent diagonal used as the scale reference.
 * @param enabled - Overrides the global flag for testing; defaults to it.
 * @returns Segment count in `[8, 100]`; degenerate inputs return the legacy 100.
 */
export function acTrComputeArcSegmentCount(
  radius: number,
  sweepRatio: number,
  diagonal: number,
  enabled: boolean = acTrIsArcLodEnabled()
): number {
  if (!enabled) return ARC_LOD_FULL_SEGMENTS
  if (
    !Number.isFinite(radius) ||
    !Number.isFinite(sweepRatio) ||
    !Number.isFinite(diagonal) ||
    radius <= 0 ||
    diagonal <= 0 ||
    sweepRatio <= 0
  ) {
    return ARC_LOD_FULL_SEGMENTS
  }

  const ratio = radius / diagonal
  let full = ARC_LOD_FULL_SEGMENTS
  if (ratio < ARC_LOD_TIER0_RATIO) {
    full = ARC_LOD_TIER0_SEGMENTS
  } else if (ratio < ARC_LOD_TIER1_RATIO) {
    full = ARC_LOD_TIER1_SEGMENTS
  }

  if (sweepRatio >= 1) return full
  return Math.min(
    ARC_LOD_FULL_SEGMENTS,
    Math.max(ARC_LOD_MIN_SEGMENTS, Math.ceil(full * sweepRatio))
  )
}

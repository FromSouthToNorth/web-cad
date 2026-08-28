import {
  AcEdBaseView,
  AcEdSelectionPreviewTransform,
  AcEdSelectionStaticPreviewJig,
  AcEdSelectionTransformPreviewJig
} from '@mlightcad/cad-simple-viewer'
import {
  AcDbEntity,
  AcGeMatrix3d,
  AcGePoint3d,
  AcGePoint3dLike
} from '@mlightcad/data-model'

/**
 * Builds a world-space uniform scale matrix around the given base point:
 * `M = T(c) · S(s) · T(-c)`.
 *
 * @param basePoint - Scale base point.
 * @param scale - Uniform scale factor.
 */
export function createScaleMatrixAboutPoint(
  basePoint: AcGePoint3dLike,
  scale: number
): AcGeMatrix3d {
  const z = basePoint.z ?? 0
  return new AcGeMatrix3d()
    .makeTranslation(basePoint.x, basePoint.y, z)
    .multiply(new AcGeMatrix3d().makeScale(scale, scale, scale))
    .multiply(new AcGeMatrix3d().makeTranslation(-basePoint.x, -basePoint.y, -z))
}

/**
 * Static preview jig shown while SCALE asks for the base point or reference
 * point. Keeps cloned source entities visible without mutating database
 * entities.
 */
export class AcApLayerCtxScaleStaticJig<
  T
> extends AcEdSelectionStaticPreviewJig<T> {}

/**
 * SCALE preview jig used while the user picks the second (target) point.
 *
 * The cursor position defines the "new length" measured from the reference
 * point. The scale factor is `newDist / refDist`, so the preview shows the
 * selection scaled by that ratio around the base point.
 */
export class AcApLayerCtxScalePreviewJig extends AcEdSelectionTransformPreviewJig<number> {
  private _basePoint: AcGePoint3d
  private _referencePoint: AcGePoint3d
  private _referenceDistance: number

  /**
   * Creates a dynamic SCALE preview jig.
   *
   * @param view - Active editor view that renders transient entities.
   * @param sourceEntities - Original entities cloned for preview display.
   * @param basePoint - Scale base point (centre of scaling).
   * @param referencePoint - First distance point (defines reference length).
   */
  constructor(
    view: AcEdBaseView,
    sourceEntities: AcDbEntity[],
    basePoint: AcGePoint3dLike,
    referencePoint: AcGePoint3dLike
  ) {
    super(view, sourceEntities)
    this._basePoint = new AcGePoint3d(basePoint)
    this._referencePoint = new AcGePoint3d(referencePoint)
    this._referenceDistance = this._basePoint.distanceTo(this._referencePoint)
  }

  /**
   * Computes the scale factor from the cursor-to-reference-point distance and
   * applies the resulting scale matrix to the GPU batch overlay (or falls back
   * to the base class transient-clone path).
   *
   * @param newDistance - Cursor-to-reference-point distance (new length).
   */
  override update(newDistance: number) {
    const scale =
      this._referenceDistance > 0 ? newDistance / this._referenceDistance : 1
    if (this.batchPreview.useBatchPreview) {
      this.batchPreview.updateMatrix(
        this._view,
        createScaleMatrixAboutPoint(this._basePoint, scale)
      )
      return
    }
    super.update(scale)
  }

  protected buildTransforms(newDistance: number): AcEdSelectionPreviewTransform[] {
    const scale =
      this._referenceDistance > 0 ? newDistance / this._referenceDistance : 1
    const matrix = createScaleMatrixAboutPoint(this._basePoint, scale)
    return this.previewEntries.map(entry => ({
      objectId: entry.entity.objectId,
      matrix
    }))
  }
}

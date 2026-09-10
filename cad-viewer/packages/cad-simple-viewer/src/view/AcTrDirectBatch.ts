import { AcDbEntity, AcDbRay, AcDbXline } from '@hy/data-model'
import {
  type AcTrDirectEntityMeta,
  type AcTrRenderer,
  buildAreaGeometry,
  buildLineGeometryMulti,
  buildLineSegmentsGeometryMulti,
  buildPointGeometry,
  isDirectBatchRejectedMaterial,
  resolveAnchorFromBox
} from '@hy/three-renderer'

/**
 * Whether the entity advertises a single batchable draw primitive.
 * Prefer this over hard-coded `instanceof` lists.
 */
export function isDirectBatchCandidate(entity: AcDbEntity): boolean {
  return entity.directBatchPrimitive != null
}

/**
 * Builds direct-batch payloads by running the entity's normal
 * {@link AcDbEntity.worldDraw} path so tessellation stays in `subWorldDraw`.
 *
 * Returns `null` when the entity does not declare a direct primitive, capture
 * misses, materials are unbatchable, or large-coordinate policy forces unbatch.
 *
 * Entities whose geometry spans beyond the precision-safe extent are split
 * into several metas — one per rebased run — so every run lands in a batch
 * container whose origin is close enough for precise float32 storage.
 *
 * The drawable returned by `worldDraw` during capture is never used: every
 * captured primitive is rebuilt from the payload. The renderer therefore hands
 * back a shared, dispose-immune placeholder instead of a real entity, which
 * removes one `AcTrEntity` allocation per direct-batch entity.
 */
export function tryBuildDirectEntityMetas(
  entity: AcDbEntity,
  renderer: AcTrRenderer
): AcTrDirectEntityMeta[] | null {
  if (entity.directBatchPrimitive == null) {
    return null
  }

  renderer.beginDirectCapture()
  try {
    // Placeholder so worldDraw can attach objectId / layer metadata.
    entity.worldDraw(renderer)
    const payload = renderer.takeDirectCapture()
    if (!payload) {
      return null
    }

    const built = buildFromCapture(payload, renderer)
    if (!built || built.length === 0) {
      return null
    }

    const metas: AcTrDirectEntityMeta[] = []
    for (const item of built) {
      if (item.wcsBbox.isEmpty()) {
        item.geometry.dispose()
        continue
      }

      const drawMode = renderer.batchDrawPolicy.resolveDrawMode({
        anchor: resolveAnchorFromBox(item.wcsBbox),
        position: item.position
      })
      if (drawMode === 'unbatch') {
        item.geometry.dispose()
        continue
      }

      metas.push({
        ...item,
        objectId: entity.objectId,
        ownerId: entity.ownerId,
        layerName: entity.layer,
        visible: entity.visibility !== false
      })
    }
    return metas.length > 0 ? metas : null
  } catch (error) {
    renderer.cancelDirectCapture()
    throw error
  }
}

/** RAY / XLINE still use direct batch but must not extend layout extents. */
export function shouldExtendBboxForDirectEntity(entity: AcDbEntity): boolean {
  return !(entity instanceof AcDbRay || entity instanceof AcDbXline)
}

function buildFromCapture(
  payload: NonNullable<ReturnType<AcTrRenderer['takeDirectCapture']>>,
  renderer: AcTrRenderer
): Array<
  Omit<AcTrDirectEntityMeta, 'objectId' | 'ownerId' | 'layerName' | 'visible'>
> | null {
  const traits = renderer.subEntityTraits

  if (payload.kind === 'lineStrip') {
    const material = renderer.styleManager.getLineMaterial(traits, false)
    if (isDirectBatchRejectedMaterial(material)) {
      return null
    }
    return buildLineGeometryMulti(payload.points, material).map(line => ({
      kind: line.kind === 'fat' ? 'lineFat' : 'lineBasic',
      geometry: line.geometry,
      worldOffset: line.worldOffset,
      wcsBbox: line.wcsBbox,
      material: line.material
    }))
  }

  if (payload.kind === 'lineSegments') {
    const material = renderer.styleManager.getLineMaterial(traits, false)
    return buildLineSegmentsGeometryMulti(
      payload.array,
      payload.itemSize,
      payload.indices,
      material
    )
  }

  if (payload.kind === 'point') {
    const material = renderer.styleManager.getPointsMaterial(traits)
    if (isDirectBatchRejectedMaterial(material)) {
      return null
    }
    return [buildPointGeometry(payload.point, material)]
  }

  if (payload.kind === 'area') {
    const built = buildAreaGeometry(payload.area, traits, renderer.context)
    if (!built) {
      return null
    }
    if (isDirectBatchRejectedMaterial(built.material)) {
      built.geometry.dispose()
      return null
    }
    return [built]
  }

  return null
}

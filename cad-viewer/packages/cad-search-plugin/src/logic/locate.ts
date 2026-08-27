import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcDbObjectId, AcGeBox2d } from '@mlightcad/data-model'

/**
 * Selects (and thereby highlights) an entity and zooms the view to it.
 *
 * Selection events are already wired to view highlighting by the viewer, so
 * adding to the selection set is enough to mark the entity as selected.
 * `zoomId` may differ from `selectId` for ATTRIB results, whose parent
 * INSERT is selected while the attribute's own extents drive the zoom.
 *
 * @param selectId - Object ID added to the current selection set.
 * @param zoomId - Object ID whose geometric extents the view zooms to.
 * @returns `true` when the view zoomed to a non-empty extents box.
 */
export function locateEntity(
  selectId: AcDbObjectId,
  zoomId: AcDbObjectId
): boolean {
  const doc = AcApDocManager.instance.curDocument
  const view = AcApDocManager.instance.curView
  if (!doc || !view) {
    return false
  }

  const selectionSet = view.selectionSet
  selectionSet.clear()
  selectionSet.add(selectId)

  const entity = doc.database.tables.blockTable.getEntityById(zoomId)
  if (!entity) {
    return false
  }
  try {
    const extents = entity.geometricExtents
    if (extents && !extents.isEmpty()) {
      const box = new AcGeBox2d()
      box.expandByPoint({ x: extents.min.x, y: extents.min.y })
      box.expandByPoint({ x: extents.max.x, y: extents.max.y })
      view.zoomTo(box, 1.5)
      return true
    }
  } catch {
    // Some entities may not provide extents; selection still succeeded.
  }
  return false
}

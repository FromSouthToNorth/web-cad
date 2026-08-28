import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { AcDbObjectId } from '@mlightcad/data-model'

/** Class of the host's grip-handle overlay (see `AcEdGripHandle`). */
const GRIP_HANDLE_CLASS = 'ml-grip-handle'

/**
 * Whether a mouse event target lands on the current view's canvas element.
 *
 * The canvas is the Three.js `renderer.domElement` (a plain `<canvas>` child
 * of `.ml-cad-container`); it is re-created whenever a document opens, so it
 * is resolved at event time and never cached.
 *
 * Selected entities render grip handles as sibling overlay elements above the
 * canvas; a right-click on a grip must behave like a right-click on the canvas
 * underneath it, so grip handles are accepted as canvas events too.
 *
 * @param target - Event target from a mouse event.
 * @returns `true` when the event originates from the drawing canvas.
 */
export function isCanvasEventTarget(target: unknown): boolean {
  const canvas = AcApDocManager.instance.curView?.canvas
  if (!canvas || !(target instanceof Element)) return false
  if (canvas === target || canvas.contains(target)) return true
  return !!target.closest(`.${GRIP_HANDLE_CLASS}`)
}

/**
 * Picks the entity under a viewport point.
 *
 * Uses the view's public picking pipeline:
 * `viewportToCanvas(clientX/Y)` → `screenToWorld(...)` → `pick(world, ...)`.
 *
 * @param clientX - Viewport X coordinate of the mouse event.
 * @param clientY - Viewport Y coordinate of the mouse event.
 * @returns Picked entity object id, or `null` when nothing was hit or no
 *   view is available.
 */
export function pickEntityIdAtClientPoint(
  clientX: number,
  clientY: number
): AcDbObjectId | null {
  const view = AcApDocManager.instance.curView
  if (!view) return null

  const worldPoint = view.screenToWorld(
    view.viewportToCanvas({ x: clientX, y: clientY })
  )
  const picked = view.pick(worldPoint, undefined, true)
  return picked.length === 0 ? null : picked[0].id
}

/**
 * Selects the picked entity when it is not already selected, mirroring the
 * standard CAD right-click behavior (replace selection with the clicked
 * object; keep an existing multi-selection when the object is part of it).
 *
 * @param entityId - Picked entity object id.
 */
export function ensureEntitySelected(entityId: AcDbObjectId): void {
  const selectionSet = AcApDocManager.instance.curView?.selectionSet
  if (!selectionSet || selectionSet.has(entityId)) return
  selectionSet.clear()
  selectionSet.add(entityId)
}

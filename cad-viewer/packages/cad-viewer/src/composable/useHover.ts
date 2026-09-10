import { AcApDocManager } from '@hy/cad-simple-viewer'
import type { AcDbEntity, AcDbObjectId } from '@hy/data-model'
import { onMounted, onUnmounted, type Ref, ref, shallowRef } from 'vue'

/**
 * Reactive state produced by {@link useHover}.
 *
 * `hovered` becomes true only after the view confirms that the pointer has
 * paused over an entity long enough to be considered an intentional hover.
 */
export interface UseHoverReturn {
  /** Whether the pointer is currently hovering over an entity. */
  hovered: Ref<boolean>
  /** The currently hovered entity, or `null` when nothing is hovered. */
  entity: Ref<AcDbEntity | null>
  /** Object id of the currently hovered entity, or `null`. */
  id: Ref<AcDbObjectId | null>
  /** Hover position in viewport/client coordinates (for DOM tooltips). */
  mouse: Ref<{ x: number; y: number }>
}

/**
 * Tracks the entity currently hovered by the mouse in the active CAD view.
 *
 * The view emits `hover`/`unhover` in canvas-local screen coordinates after
 * its built-in pause detection confirms an intentional hover. This composable
 * converts that position to viewport/client coordinates and resolves the
 * entity from the drawing database so Vue templates can render
 * tooltips or other hover UI.
 */
export function useHover(): UseHoverReturn {
  const hovered = ref(false)
  const entity = shallowRef<AcDbEntity | null>(null)
  const id = ref<AcDbObjectId | null>(null)
  const mouse = ref({ x: 0, y: 0 })

  const onHover = (args: { id: AcDbObjectId; x: number; y: number }) => {
    const blockTable =
      AcApDocManager.instance.curDocument?.database.tables.blockTable
    entity.value =
      blockTable?.modelSpace.getIdAt(args.id) ??
      blockTable?.getEntityById(args.id) ??
      null
    id.value = args.id
    mouse.value = AcApDocManager.instance.curView.canvasToViewport({
      x: args.x,
      y: args.y
    })
    hovered.value = true
  }

  const onUnhover = (args: { id: AcDbObjectId; x: number; y: number }) => {
    hovered.value = false
    entity.value = null
    id.value = null
    mouse.value = AcApDocManager.instance.curView.canvasToViewport({
      x: args.x,
      y: args.y
    })
  }

  /** Register event listeners when the component mounts. */
  onMounted(() => {
    const events = AcApDocManager.instance.curView.events
    events.hover.addEventListener(onHover)
    events.unhover.addEventListener(onUnhover)
  })

  /** Unregister event listeners when the component unmounts. */
  onUnmounted(() => {
    const events = AcApDocManager.instance.curView.events
    events.hover.removeEventListener(onHover)
    events.unhover.removeEventListener(onUnhover)
  })

  return {
    hovered,
    entity,
    id,
    mouse
  }
}

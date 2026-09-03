import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

/**
 * Snapshot of the active drawing passed to the LLM via `get_drawing_context`.
 */
export interface DrawingContextSnapshot {
  /** Name of the current layer (CLAYER). */
  currentLayer: string
  /** All layer names in the document. */
  layers: string[]
  /** Drawing units code (INSUNITS). */
  insunits: number
  /** Axis-aligned bounding box of the database. */
  extents: {
    min: { x: number; y: number; z: number }
    max: { x: number; y: number; z: number }
    isEmpty: boolean
  }
  /** Human-readable document title. */
  documentTitle: string
}

/**
 * Replaces non-finite numbers with `0`.
 *
 * An empty drawing's extents are ±Infinity (`AcGeBox3d` initial state), which
 * is not valid JSON and later breaks AI SDK model-message validation when the
 * context is replayed as conversation history.
 */
function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * Collects layer, unit, and extent metadata from the active document.
 *
 * @returns A JSON-serializable context object for agent tool calls.
 */
export function getDrawingContext(): DrawingContextSnapshot {
  const doc = AcApDocManager.instance.curDocument
  const db = doc.database

  const layers = doc.layerStore.getLayers().map(layer => layer.name)
  const extents = db.extents

  return {
    currentLayer: doc.layerStore.getCurrentLayerName(),
    layers,
    insunits: db.insunits,
    extents: {
      min: {
        x: finiteOrZero(extents.min.x),
        y: finiteOrZero(extents.min.y),
        z: finiteOrZero(extents.min.z)
      },
      max: {
        x: finiteOrZero(extents.max.x),
        y: finiteOrZero(extents.max.y),
        z: finiteOrZero(extents.max.z)
      },
      isEmpty: extents.isEmpty()
    },
    documentTitle: doc.docTitle
  }
}

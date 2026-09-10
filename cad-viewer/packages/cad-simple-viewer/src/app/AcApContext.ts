import {
  type AcCmEventManager,
  AcDbEntity,
  AcDbLayout,
  AcDbSystemVariables,
  AcDbSysVarManager
} from '@hy/data-model'

import { AcEdBaseView } from '../editor/view/AcEdBaseView'
import { AcTrView2d } from '../view'
import { AcApDocument } from './AcApDocument'
import {
  type AcDbEntityModifiedEventArgs,
  canApplyVisibilityOnlySceneUpdate
} from './AcApEntityUpdate'

function asEntityList(entity: AcDbEntity | AcDbEntity[]): AcDbEntity[] {
  return Array.isArray(entity) ? entity : [entity]
}

/**
 * Application context that binds a CAD document with its associated view.
 *
 * This class establishes the connection between a CAD document (containing the drawing database)
 * and its visual representation (the view). It handles event forwarding between the document
 * and view to keep them synchronized.
 *
 * The context manages:
 * - Entity lifecycle events (add, modify, remove)
 * - Layer visibility changes
 * - System variable changes (like point display mode)
 * - Entity selection and highlighting
 *
 * @example
 * ```typescript
 * const document = new AcApDocument();
 * const view = new AcTrView2d();
 * const context = new AcApContext(view, document);
 *
 * // The context will automatically sync changes between document and view
 * // For example, when entities are added to the document, they appear in the view
 * ```
 */
export class AcApContext {
  /** The view component that renders the CAD drawing */
  private _view: AcEdBaseView
  /** The document containing the CAD database */
  private _doc: AcApDocument
  /**
   * Removers for every listener the constructor registered.
   *
   * Several of them live on hubs that outlive this context — above all the
   * module-level singleton `AcDbSysVarManager.instance().events` — so a context
   * dropped without {@link destroy} keeps reacting to events raised by the next
   * document. The `LWDISPLAY` branch below makes that expensive: it would
   * `clear()` a stale view and replay a full `regen()` of the *current*
   * database.
   */
  private _disposers: Array<() => void> = []
  /** True once {@link destroy} ran; makes teardown idempotent. */
  private _destroyed = false

  /**
   * Creates a new application context that binds a document with its view.
   *
   * The constructor sets up event listeners to synchronize the document and view:
   * - Entity additions/modifications are reflected in the view
   * - Layer visibility changes update the view
   * - System variable changes (like point display mode) update rendering
   * - Entity selections show/hide grip points
   *
   * @param view - The view used to display the drawing
   * @param doc - The document containing the drawing database
   */
  constructor(view: AcEdBaseView, doc: AcApDocument) {
    this._view = view
    this._doc = doc

    // Add entity to scene
    this.bindEvent(doc.database.events.entityAppended, args => {
      const pending = asEntityList(args.entity).filter(
        entity => !this.view.hasEntity(entity.objectId)
      )
      if (pending.length === 0) {
        return
      }
      this.view.addEntity(pending.length === 1 ? pending[0] : pending)
    })

    // Update entity
    this.bindEvent(doc.database.events.entityModified, args => {
      const eventArgs = args as AcDbEntityModifiedEventArgs
      const view = this.view
      if (
        view instanceof AcTrView2d &&
        canApplyVisibilityOnlySceneUpdate(
          eventArgs,
          objectId => view.hasEntity(objectId),
          objectId => view.getEntityVisible(objectId)
        ) &&
        view.updateEntityVisibility(eventArgs.entity)
      ) {
        return
      }
      this.view.updateEntity(eventArgs.entity)
    })

    // Erase entity
    this.bindEvent(doc.database.events.entityErased, args => {
      const pending = asEntityList(args.entity).filter(entity =>
        this.view.hasEntity(entity.objectId)
      )
      if (pending.length === 0) {
        return
      }
      this.view.removeEntity(pending.length === 1 ? pending[0] : pending)
    })

    // Set layer visibility
    this.bindEvent(doc.database.events.layerAppended, args => {
      this._view.addLayer(args.layer)
    })

    // Update layer information such as visibility
    this.bindEvent(doc.database.events.layerModified, args => {
      this._view.updateLayer(args.layer, args.changes)
    })

    // Set point display mode
    this.bindEvent(AcDbSysVarManager.instance().events.sysVarChanged, args => {
      // The hub is a process-wide singleton, so only react to variables set on
      // the database this context owns. A stale context (one whose owner never
      // called `destroy()` — e.g. a previous document manager after
      // quit → reopen) would otherwise act on the *current* drawing while
      // driving its own dead view: the LWDISPLAY branch below would `clear()`
      // that stale view and replay a full `regen()` of the new database.
      if (args.database !== this._doc.database) {
        return
      }
      if (args.name == AcDbSystemVariables.PDMODE.toLowerCase()) {
        ;(this._view as AcTrView2d).rerenderPoints(args.database.pdmode)
      } else if (args.name == AcDbSystemVariables.LWDISPLAY.toLowerCase()) {
        const view = this._view as AcTrView2d
        const showLineWeight = !!args.database.lwdisplay
        if (view.renderer.showLineWeight !== showLineWeight) {
          view.renderer.showLineWeight = showLineWeight
          // Existing line objects may need different geometry/material classes.
          // Regenerate to rebuild scene content using the new display mode.
          // Skip the rebuild while the scene is still empty (e.g. the drawing
          // header sets LWDISPLAY mid-open, before any entity converts):
          // everything converted afterwards already uses the new flag, and a
          // clear()+regen() here would replay a full conversion-progress
          // sequence (the open-file bar restarts from ~20-40% after reaching
          // 100%) and re-dispatch every already-parsed entity for nothing.
          if (view.hasSceneContent) {
            view.clear()
            args.database.regen()
          }
        }
      }
    })

    this.bindEvent(doc.database.events.dictObjetSet, args => {
      if (args.object instanceof AcDbLayout) {
        this._view.addLayout(args.object as AcDbLayout)
      }
    })

    // Show their grip points when entities are selected
    this.bindEvent(view.selectionSet.events.selectionAdded, args => {
      view.highlight(args.ids)
    })

    // Hide their grip points when entities are deselected
    this.bindEvent(view.selectionSet.events.selectionRemoved, args => {
      view.unhighlight(args.ids)
    })
  }

  /**
   * Gets the view component that renders the CAD drawing.
   *
   * @returns The associated view instance
   */
  get view() {
    return this._view
  }

  /**
   * Gets the document containing the CAD database.
   *
   * @returns The associated document instance
   */
  get doc(): AcApDocument {
    return this._doc
  }

  /**
   * Removes every listener this context registered.
   *
   * The context subscribes to hubs that outlive it — above all the module-level
   * singleton `AcDbSysVarManager.instance().events` — so without this teardown a
   * discarded context (quit → reopen creates a new document manager) keeps
   * receiving `sysVarChanged` and reacting with the *next* document's database.
   * Owners must call it from their teardown, e.g. `AcApDocManager.destroy()`.
   *
   * Idempotent: calling it more than once is a no-op.
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    const disposers = this._disposers
    this._disposers = []
    for (const unbind of disposers) {
      unbind()
    }
  }

  /**
   * Subscribes to one event hub and records how to unsubscribe.
   *
   * Keeping registration and removal paired here is what makes {@link destroy}
   * a single loop; the wrapper additionally ignores any callback already in
   * flight when the context is destroyed.
   *
   * @param emitter - Event hub to subscribe to
   * @param listener - Callback invoked while the context is alive
   */
  private bindEvent<T>(
    emitter: AcCmEventManager<T>,
    listener: (args: T) => void
  ): void {
    const guarded = (args: T) => {
      if (this._destroyed) return
      listener(args)
    }
    emitter.addEventListener(guarded)
    this._disposers.push(() => emitter.removeEventListener(guarded))
  }
}

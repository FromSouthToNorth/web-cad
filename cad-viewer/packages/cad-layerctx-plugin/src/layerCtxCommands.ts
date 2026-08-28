import {
  AcApContext,
  AcApDocManager,
  AcEdCommand,
  AcEdOpenMode,
  AcEdPromptDistanceOptions,
  AcEdPromptPointOptions,
  AcEdPromptStatus,
  resolveSelectedEntities
} from '@mlightcad/cad-simple-viewer'
import { AcGePoint3d, AcGeTol } from '@mlightcad/data-model'

import { layerCtxT } from './i18n'
import { deleteSelectedEntitiesCtx, deselectAllCtx } from './layerCtxOps'
import {
  AcApLayerCtxScalePreviewJig,
  AcApLayerCtxScaleStaticJig,
  createScaleMatrixAboutPoint
} from './layerCtxScaleJig'

/** Command name: delete the selected objects. */
export const LAYERCTX_CMD_DELETE = 'layctxdel'
/** Command name: interactively scale the selected objects. */
export const LAYERCTX_CMD_SCALE = 'layctxscale'
/** Command name: clear the current selection set. */
export const LAYERCTX_CMD_DESELECT = 'layctxdsel'

/**
 * Host-registered interactive commands dispatched by the menu/shortcuts for
 * copy, move and rotate: they reuse the active selection as preselection and
 * acquire points/angles on the canvas with a live preview jig.
 */
export const HOST_CMD_COPY = 'copy'
export const HOST_CMD_MOVE = 'move'
export const HOST_CMD_ROTATE = 'rotate'

/**
 * Base class for the object context-menu commands: requires a non-empty
 * selection set so command-line / shortcut invocation with nothing selected
 * warns instead of silently doing nothing.
 */
abstract class AcApLayerCtxCmdBase extends AcEdCommand {
  /**
   * Whether the selection set is usable for an object-scoped command.
   *
   * @returns `false` (after showing a warning) when nothing is selected.
   */
  protected requireSelection(): boolean {
    const count = AcApDocManager.instance.curView?.selectionSet.count ?? 0
    if (count > 0) return true
    this.showMessage(layerCtxT('msgNoObjectsSelected'), 'warning')
    return false
  }
}

/**
 * `layctxdel` command: erases the selected objects (mirrors the host `ERASE`
 * command / Delete key; entity-scoped, so layer `0` and current-layer
 * entities delete fine).
 */
export class AcApLayerCtxDelCmd extends AcApLayerCtxCmdBase {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  async execute(_context: AcApContext) {
    if (this.requireSelection()) deleteSelectedEntitiesCtx()
  }
}

/**
 * `layctxscale` command: interactively scales the selected objects.
 *
 * Workflow (AutoCAD SCALE semantics):
 * 1) reuse the current selection (guaranteed non-empty by the base class),
 * 2) specify the base point (static preview of the selection),
 * 3) drag the mouse — the live cursor-to-base-point distance is the scale
 *    factor — or type a number; the preview jig scales the selection live.
 *
 * Enter at either prompt cancels without scaling.
 */
export class AcApLayerCtxScaleCmd extends AcApLayerCtxCmdBase {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  async execute(context: AcApContext) {
    if (!this.requireSelection()) return

    const selectionSet = context.view.selectionSet
    const resolved = await resolveSelectedEntities(context)
    if (!resolved) return
    const sourceEntities = resolved.entities

    const basePrompt = new AcEdPromptPointOptions(layerCtxT('jigScaleBasePoint'))
    basePrompt.allowNone = true
    basePrompt.jig = new AcApLayerCtxScaleStaticJig<AcGePoint3d>(
      context.view,
      sourceEntities
    )
    const baseResult = await AcApDocManager.instance.editor.getPoint(basePrompt)
    if (baseResult.status !== AcEdPromptStatus.OK || !baseResult.value) {
      selectionSet.clear()
      return
    }

    const basePoint = new AcGePoint3d(baseResult.value)
    const factorPrompt = new AcEdPromptDistanceOptions(
      layerCtxT('jigScaleFactor')
    )
    factorPrompt.useBasePoint = true
    factorPrompt.useDashedLine = true
    factorPrompt.basePoint = basePoint
    factorPrompt.allowNone = true
    factorPrompt.jig = new AcApLayerCtxScalePreviewJig(
      context.view,
      sourceEntities,
      basePoint
    )
    const factorResult =
      await AcApDocManager.instance.editor.getDistance(factorPrompt)
    if (factorResult.status !== AcEdPromptStatus.OK) {
      selectionSet.clear()
      return
    }

    const scale = factorResult.value ?? 1
    if (!(scale > 0) || scale === 1) {
      selectionSet.clear()
      return
    }

    context.doc.entityService.transformEntities(
      sourceEntities,
      createScaleMatrixAboutPoint(basePoint, scale)
    )
    selectionSet.clear()
  }
}

/**
 * `layctxdsel` command: clears the current selection set (取消选择).
 */
export class AcApLayerCtxDeselectCmd extends AcApLayerCtxCmdBase {
  async execute(_context: AcApContext) {
    deselectAllCtx()
  }
}

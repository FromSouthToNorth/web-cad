import {
  AcApContext,
  AcApDocManager,
  AcApEntityService,
  AcEdCommand,
  AcEdOpenMode,
  AcEdPreviewJig,
  AcEdPromptDistanceOptions,
  AcEdPromptPointOptions,
  AcEdPromptStatus,
  resolveSelectedEntities
} from '@mlightcad/cad-simple-viewer'
import { AcDbCurve, AcGePoint3d, AcGePoint3dLike, AcGeTol } from '@mlightcad/data-model'

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
export const HOST_CMD_OFFSET = 'offset'

/** Command name: offset the selected offsettable objects. */
export const LAYERCTX_CMD_OFFSET = 'layctxoffset'

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
 * Computes the signed offset distance so the result appears on the side of
 * `curve` closest to `sidePoint`, then generates offset curve copies with
 * display traits inherited from the source.
 *
 * @returns Offset curve instances ready for preview or commit; empty on failure.
 */
function buildOffsetCurvesForCtx(
  curve: AcDbCurve,
  distance: number,
  sidePoint: AcGePoint3dLike
): AcDbCurve[] {
  try {
    const side = curve.getOffsetSideAtPoint(sidePoint)
    const offsetCurves = curve.getOffsetCurves(distance * side)
    offsetCurves.forEach(offsetCurve =>
      AcApEntityService.copyDisplayTraits(curve, offsetCurve)
    )
    return offsetCurves
  } catch {
    return []
  }
}

/**
 * OFFSET preview jig for the context-menu offset command.
 *
 * Rebuilds transient offset curves for every selected curve on each update.
 * When the cursor crosses a curve the offset side flips automatically.
 */
class AcApLayerCtxOffsetPreviewJig extends AcEdPreviewJig<AcGePoint3dLike> {
  private _view = AcApDocManager.instance.curView!
  private _curves: AcDbCurve[]
  private _distance: number
  private _previewCurves: AcDbCurve[] = []
  private _renderedIds: string[] = []

  constructor(curves: AcDbCurve[], distance: number) {
    super(AcApDocManager.instance.curView!)
    this._curves = curves
    this._distance = distance
  }

  update(point: AcGePoint3dLike) {
    this.clearRendered()
    this._previewCurves = []
    for (const curve of this._curves) {
      const offsetCurves = buildOffsetCurvesForCtx(curve, this._distance, point)
      this._previewCurves.push(...offsetCurves)
    }
  }

  override render() {
    if (this._previewCurves.length === 0) return
    this._view.addTransientEntity(this._previewCurves)
    this._renderedIds = this._previewCurves.map(entity => entity.objectId)
  }

  override end() {
    this.clearRendered()
  }

  private clearRendered() {
    this._renderedIds.forEach(id => this._view.removeTransientEntity(id))
    this._renderedIds = []
  }
}

/**
 * `layctxoffset` command: creates parallel offset copies of the selected
 * offsettable curves.
 *
 * Workflow:
 * 1) reuse the current selection (non-curves are silently skipped; if none of
 *    the selected objects can be offset, a warning is shown),
 * 2) specify the offset distance,
 * 3) pick the offset side for each curve (with live preview); after one curve
 *    is offset, the next curve is prompted for its side; pressing Enter or
 *    Escape skips the remaining curves.
 *
 * The pre-dispatch selection is restored by the dispatch tracker after the
 * command ends so back-to-back menu operations keep working.
 */
export class AcApLayerCtxOffsetCmd extends AcApLayerCtxCmdBase {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  async execute(context: AcApContext) {
    if (!this.requireSelection()) return

    const selectionSet = context.view.selectionSet
    const resolved = await resolveSelectedEntities(context)
    if (!resolved) return

    const curves = resolved.entities.filter(
      (e): e is AcDbCurve => e instanceof AcDbCurve
    )
    if (curves.length === 0) {
      this.showMessage(layerCtxT('msgNoOffsettableObjects'), 'warning')
      selectionSet.clear()
      return
    }

    // Step 1: 获取偏移距离
    const distPrompt = new AcEdPromptDistanceOptions(
      layerCtxT('jigOffsetDistance')
    )
    distPrompt.useBasePoint = false
    distPrompt.useDashedLine = true
    distPrompt.allowZero = false
    distPrompt.allowNegative = false

    const distResult =
      await AcApDocManager.instance.editor.getDistance(distPrompt)
    if (distResult.status !== AcEdPromptStatus.OK || distResult.value == null) {
      selectionSet.clear()
      return
    }
    if (!Number.isFinite(distResult.value) || AcGeTol.isNonPositive(distResult.value)) {
      this.showMessage(layerCtxT('msgInvalidOffsetDistance'), 'warning')
      selectionSet.clear()
      return
    }
    const distance = distResult.value

    const blockTable = context.doc.database.tables.blockTable

    // Step 2: 逐条曲线指定偏移方向并创建偏移副本
    for (const curve of curves) {
      const jig = new AcApLayerCtxOffsetPreviewJig([curve], distance)
      jig.update({ ...context.view.curPos, z: 0 })
      jig.render()

      const sidePrompt = new AcEdPromptPointOptions(
        layerCtxT('jigOffsetSidePoint')
      )
      sidePrompt.allowNone = true
      sidePrompt.disableOSnap = true
      sidePrompt.jig = jig

      const sideResult =
        await AcApDocManager.instance.editor.getPoint(sidePrompt)
      if (sideResult.status !== AcEdPromptStatus.OK || !sideResult.value) break

      const offsetCurves = buildOffsetCurvesForCtx(
        curve,
        distance,
        new AcGePoint3d(sideResult.value)
      )
      if (offsetCurves.length > 0) {
        blockTable.modelSpace.appendEntity(offsetCurves)
      }
    }

    selectionSet.clear()
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
 * Workflow (AutoCAD SCALE Reference semantics):
 * 1) reuse the current selection (guaranteed non-empty by the base class),
 * 2) specify the base point (static preview of the selection),
 * 3) specify the reference point — the distance from the base point to this
 *    point defines the *reference length* (original size),
 * 4) drag the mouse or type a number — the distance from the reference point
 *    to the cursor is the *new length*; scale = newLength / refLength.
 *
 * Escape / Enter at any prompt cancels without scaling.
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

    // Step 1: 获取基点
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

    // Step 2: 获取参考点（定义参考长度）
    const refPrompt = new AcEdPromptPointOptions(layerCtxT('jigScaleReferencePoint'))
    refPrompt.allowNone = true
    refPrompt.useBasePoint = true
    refPrompt.basePoint = basePoint
    refPrompt.useDashedLine = true
    refPrompt.jig = new AcApLayerCtxScaleStaticJig<AcGePoint3d>(
      context.view,
      sourceEntities
    )
    const refResult = await AcApDocManager.instance.editor.getPoint(refPrompt)
    if (refResult.status !== AcEdPromptStatus.OK || !refResult.value) {
      selectionSet.clear()
      return
    }

    const referencePoint = new AcGePoint3d(refResult.value)
    const referenceDistance = basePoint.distanceTo(referencePoint)

    // Guard: reference points must not coincide (zero reference length).
    if (!AcGeTol.isPositive(referenceDistance)) {
      selectionSet.clear()
      return
    }

    // Step 3: 获取新长度（光标到参考点的距离），计算缩放比例
    const factorPrompt = new AcEdPromptDistanceOptions(
      layerCtxT('jigScaleSecondPoint')
    )
    factorPrompt.useBasePoint = true
    factorPrompt.useDashedLine = true
    factorPrompt.basePoint = referencePoint
    factorPrompt.allowNone = true
    factorPrompt.jig = new AcApLayerCtxScalePreviewJig(
      context.view,
      sourceEntities,
      basePoint,
      referencePoint
    )
    const factorResult =
      await AcApDocManager.instance.editor.getDistance(factorPrompt)
    if (factorResult.status !== AcEdPromptStatus.OK) {
      selectionSet.clear()
      return
    }

    const newDistance = factorResult.value ?? referenceDistance
    const scale = newDistance / referenceDistance
    if (!(scale > 0) || scale === 1) {
      selectionSet.clear()
      return
    }

    // Step 4: 应用缩放变换
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

/**
 * Object context-menu plugin for cad-simple-viewer based applications.
 *
 * @packageDocumentation
 */

export { AcApLayerCtxPlugin } from './AcApLayerCtxPlugin'
export { createLayerCtxPlugin } from './createLayerCtxPlugin'
export { registerLayerCtxI18n, layerCtxT } from './i18n'
export {
  dispatchCtxCommand,
  hasSelection,
  isReadOnlyDocument,
  startLayerCtxDispatchTracker,
  stopLayerCtxDispatchTracker
} from './layerCtxDispatch'
export {
  AcApLayerCtxDelCmd,
  AcApLayerCtxDeselectCmd,
  AcApLayerCtxOffsetCmd,
  AcApLayerCtxScaleCmd,
  HOST_CMD_COPY,
  HOST_CMD_MOVE,
  HOST_CMD_OFFSET,
  HOST_CMD_ROTATE,
  LAYERCTX_CMD_DELETE,
  LAYERCTX_CMD_DESELECT,
  LAYERCTX_CMD_OFFSET,
  LAYERCTX_CMD_SCALE
} from './layerCtxCommands'
export { deleteSelectedEntitiesCtx, deselectAllCtx } from './layerCtxOps'
export {
  AcApLayerCtxScalePreviewJig,
  AcApLayerCtxScaleStaticJig,
  createScaleMatrixAboutPoint
} from './layerCtxScaleJig'
export { LAYERCTX_PLUGIN_NAME, registerLayerCtxPlugin } from './register'

import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

import { layerCtxT } from './i18n'

/**
 * Shows a transient message in the host command-line/message area.
 */
const showMessage = (
  message: string,
  type: 'success' | 'warning' | 'info' | 'error' = 'info'
): void => {
  AcApDocManager.instance.editor.showMessage(message, type)
}

/**
 * 删除 (delete): erases the selected entities, mirroring the host `ERASE`
 * command / Delete key. Entity-scoped: it never touches the layer table, so
 * entities on layer `0` or the current layer erase fine.
 *
 * @returns Whether anything was erased.
 */
export function deleteSelectedEntitiesCtx(): boolean {
  const doc = AcApDocManager.instance.curDocument
  const view = AcApDocManager.instance.curView
  if (!doc || !view) return false

  const ids = view.selectionSet.ids
  if (ids.length === 0) return false

  let count = 0
  doc.entityService.runEdit('Delete', () => {
    count = doc.entityService.eraseEntities(ids)
  })
  view.selectionSet.clear()
  if (count > 0) {
    showMessage(
      layerCtxT('msgObjectsDeleted', { count: String(count) }),
      'success'
    )
  }
  return count > 0
}

/**
 * 取消选择 (deselect): clears the current selection set.
 */
export function deselectAllCtx(): void {
  AcApDocManager.instance.curView?.selectionSet.clear()
}

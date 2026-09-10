import {
  AcApContext,
  acapRunDatabaseEdit,
  AcEdCommand,
  AcEdOpenMode} from '@mlightcad/cad-simple-viewer'
import { log } from '@mlightcad/data-model'

import {
  getTunnelPluginOptions,
  resolveTunnelDrawOptions
} from '../config'
import { tunnelT } from '../i18n'
import { waitForCurrentDocument } from './waitForDocument'

/**
 * tunnelclear command:
 * removes every model-space entity that lives on one of the plugin's tunnel
 * layers, so the drawing can be refreshed from updated data without leaving
 * stale leftovers.
 */
export class AcApTunnelClearCmd extends AcEdCommand {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  async execute(_context: AcApContext): Promise<void> {
    const doc = await waitForCurrentDocument()
    if (!doc) {
      log.error(`[cad-tunnel] ${tunnelT('draw.noDocument')}`)
      return
    }
    const db = doc.database

    const resolved = resolveTunnelDrawOptions(getTunnelPluginOptions())
    const layerSet = new Set(Object.values(resolved.layerNames))

    const ids: string[] = []
    for (const entity of db.tables.blockTable.modelSpace.newIterator()) {
      if (layerSet.has(entity.layer)) ids.push(entity.objectId)
    }

    if (ids.length === 0) {
      log.warn(`[cad-tunnel] ${tunnelT('clear.none')}`)
      return
    }

    acapRunDatabaseEdit(db, 'tunnelclear', () => {
      doc.entityService.eraseEntities(ids)
    })

    log.info(`[cad-tunnel] ${tunnelT('clear.done', { count: ids.length })}`)
  }
}

import {
  AcApContext,
  acapRunDatabaseEdit,
  AcEdCommand,
  AcEdOpenMode,
  AcEdPromptStatus,
  AcEdPromptStringOptions} from '@mlightcad/cad-simple-viewer'
import {
  AcCmColor,
  AcCmColorMethod,
  AcDbDatabase,
  AcDbLayerTableRecord,
  log
} from '@mlightcad/data-model'

import { getTunnelPluginOptions,TunnelDrawOptions } from '../config'
import { geojsonToEntities } from '../geojson/geojsonToEntities'
import { parseTunnelGeoJson } from '../geojson/parseTunnelGeoJson'
import { tunnelT } from '../i18n'
import { waitForCurrentDocument } from './waitForDocument'

const ensureLayer = (db: AcDbDatabase, name: string): void => {
  if (db.tables.layerTable.has(name)) return
  db.tables.layerTable.add(
    new AcDbLayerTableRecord({
      name,
      isOff: false,
      isPlottable: true,
      color: new AcCmColor(AcCmColorMethod.ByACI, 7),
      linetype: 'Continuous'
    })
  )
}

/**
 * drawtunnel command:
 * loads a GeoJSON document (plain or wrapped in an API envelope such as
 * `data.params.data`) from a URL and draws its points, lines, areas and text
 * labels as entities in the model space.
 *
 * The URL comes from the plugin options (set by the application at
 * registration time) or, when none is configured, from a command-line prompt.
 */
export class AcApDrawTunnelCmd extends AcEdCommand {
  constructor() {
    super()
    this.mode = AcEdOpenMode.Write
  }

  async execute(context: AcApContext): Promise<void> {
    const options = getTunnelPluginOptions()
    const url = await this.resolveUrl(context, options)
    if (url == null) return

    // The fetch/conversion/append runs under the host busy overlay (same
    // spinner the DXF export uses), so reading slow data sources stays
    // visible to the user.
    await this.withBusyIndicator(async () => {
      let featureCollection
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText}`.trim()
          )
        }
        featureCollection = parseTunnelGeoJson(await response.json())
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        log.error(`[cad-tunnel] ${tunnelT('draw.fetchFailed')} ${detail}`)
        return
      }

      // The click may have been queued while the document was still opening
      // (or the command was typed early on the command line). Wait for the
      // document instead of failing once: only a `null` result (open failed
      // or timed out) is a real "no document" error.
      const doc = await waitForCurrentDocument()
      if (!doc) {
        log.error(`[cad-tunnel] ${tunnelT('draw.noDocument')}`)
        return
      }
      const db = doc.database

      let result
      try {
        result = geojsonToEntities(featureCollection, { ...options, db })
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        log.error(`[cad-tunnel] ${tunnelT('draw.parseFailed')} ${detail}`)
        return
      }

      if (result.entityCount === 0) {
        log.warn(`[cad-tunnel] ${tunnelT('draw.noData')}`)
        return
      }

      acapRunDatabaseEdit(db, 'drawtunnel', () => {
        for (const layer of result.layers) ensureLayer(db, layer)
        db.tables.blockTable.modelSpace.appendEntity(result.entities)
      })

      log.info(
        `[cad-tunnel] ${tunnelT('draw.done', {
          total: result.entityCount,
          ...result.counts
        })}`
      )

      if (result.labelsHidden > 0) {
        log.info(
          `[cad-tunnel] ${tunnelT('draw.labelsHidden', {
            count: result.labelsHidden
          })}`
        )
      }

      if (options.fitView !== false) {
        context.view.zoomToFitDrawing()
      }
    }, tunnelT('draw.loading'))
  }

  private async resolveUrl(
    context: AcApContext,
    options: TunnelDrawOptions
  ): Promise<string | null> {
    if (options.url) return options.url

    const prompt = new AcEdPromptStringOptions(tunnelT('draw.urlPrompt'))
    prompt.allowEmpty = true
    prompt.allowSpaces = false
    const result = await context.view.editor.getString(prompt)
    if (result.status !== AcEdPromptStatus.OK) return null

    const url = (result.stringResult ?? '').trim()
    if (!url) {
      log.warn(`[cad-tunnel] ${tunnelT('draw.noUrl')}`)
      return null
    }
    return url
  }
}

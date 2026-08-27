import { AcApContext, AcEdCommand } from '@mlightcad/cad-simple-viewer'
import { log } from '@mlightcad/data-model'

import { openSearchPalette } from '../palette/searchPaletteIntegration'

/**
 * Opens or toggles the content search tab in the tool palette.
 */
export class AcApSearchCmd extends AcEdCommand {
  /**
   * Invokes the registered palette opener, if cad-viewer has wired one in.
   *
   * @param _context - Application context (unused).
   */
  async execute(_context: AcApContext) {
    if (!openSearchPalette()) {
      log.warn('Content search palette is not available.')
    }
  }
}

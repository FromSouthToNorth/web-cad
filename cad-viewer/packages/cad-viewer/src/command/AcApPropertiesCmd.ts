import { AcApContext, AcEdCommand } from '@hy/cad-simple-viewer'

import { store } from '../app'

export class AcApPropertiesCmd extends AcEdCommand {
  async execute(_context: AcApContext) {
    store.dialogs.activePaletteTab = 'entityProperties'
    store.dialogs.layerManager = true
  }
}

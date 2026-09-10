import { AcApContext, AcEdCommand } from '@hy/cad-simple-viewer'

import { store } from '../app'

export class AcApLayerStateCmd extends AcEdCommand {
  async execute(_context: AcApContext) {
    store.dialogs.activePaletteTab = 'layerManager'
    store.dialogs.layerManager = true
  }
}

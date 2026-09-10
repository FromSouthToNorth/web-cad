import { AcApContext, AcEdCommand } from '@hy/cad-simple-viewer'

import { useDialogManager } from '../composable'

export class AcApDrawingUnitsCmd extends AcEdCommand {
  async execute(_context: AcApContext) {
    const { toggleDialog } = useDialogManager()
    toggleDialog('DrawingUnitsDlg', true)
  }
}

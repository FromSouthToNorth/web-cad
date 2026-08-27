import {
  AcApContext,
  AcEdCommand
} from '@mlightcad/cad-simple-viewer'

import { invertViewSelection } from './invertViewSelection'

/**
 * invertsel command:
 * inverts the active selection set — selected entities are deselected and
 * every other model-space entity is selected.
 */
export class AcApInvertSelCmd extends AcEdCommand {
  async execute(_context: AcApContext) {
    invertViewSelection()
  }
}

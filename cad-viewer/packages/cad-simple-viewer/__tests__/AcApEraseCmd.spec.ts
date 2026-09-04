import { AcDbDatabase, AcDbLine } from '@mlightcad/data-model'

// The erase command pulls the app / editor / service barrels, which
// transitively load DOM-heavy input UI that cannot run in the Node Jest
// environment. Replace them with the light real modules the command actually
// needs so the genuine AcEdCommand.trigger undo-mark logic runs in this test.
jest.mock('../src/app', () => ({
  AcApDocManager: {
    instance: {
      editor: {
        showMessage: jest.fn(),
        getSelection: jest.fn()
      }
    }
  }
}))

jest.mock('../src/editor', () => ({
  ...jest.requireActual('../src/editor/command/AcEdCommand'),
  ...jest.requireActual('../src/editor/command/AcEdCommandStack'),
  ...jest.requireActual('../src/editor/view/AcEdOpenMode'),
  AcEdPromptSelectionOptions: class {
    constructor(public message: string) {}
  },
  AcEdPromptStatus: { OK: 'OK', Cancel: 'Cancel' }
}))

jest.mock('../src/service', () =>
  jest.requireActual('../src/service/AcApEntitySelection')
)

import type { AcApContext } from '../src/app/AcApContext'
import { AcApEraseCmd } from '../src/command/modify/AcApEraseCmd'
import { AcEdOpenMode } from '../src/editor/view/AcEdOpenMode'
import { AcApEntityService } from '../src/service/AcApEntityService'

/**
 * Builds the minimal context slice reached by AcEdCommand.trigger +
 * AcApEraseCmd.execute when the selection set is non-empty (no prompt path).
 */
function makeContext(db: AcDbDatabase, selectedIds: string[]) {
  const selectionSet = {
    count: selectedIds.length,
    ids: selectedIds,
    clear: jest.fn()
  }
  const dispatch = jest.fn()
  const context = {
    doc: {
      database: db,
      openMode: AcEdOpenMode.Write,
      entityService: new AcApEntityService(db)
    },
    view: {
      selectionSet,
      editor: {
        events: {
          commandWillStart: { dispatch },
          commandEnded: { dispatch }
        }
      }
    }
  } as unknown as AcApContext
  return { context, selectionSet }
}

describe('AcApEraseCmd', () => {
  test('requires Write mode so trigger() records an undo mark', () => {
    // Regression: erase previously kept the default Read mode, so trigger()
    // skipped the undo mark/transaction and the delete was not undoable.
    expect(new AcApEraseCmd().mode).toBe(AcEdOpenMode.Write)
  })

  test('erasing selected entities is undoable', async () => {
    const db = new AcDbDatabase()
    const line = new AcDbLine({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })
    db.tables.blockTable.modelSpace.appendEntity(line)
    const id = line.objectId

    const { context, selectionSet } = makeContext(db, [id])
    await new AcApEraseCmd().trigger(context)

    expect(db.tables.blockTable.getEntityById(id)).toBeUndefined()
    expect(selectionSet.clear).toHaveBeenCalled()
    expect(db.transactionManager.canUndo()).toBe(true)

    expect(db.transactionManager.undo()).toBe(true)
    expect(db.tables.blockTable.getEntityById(id)).toBeDefined()

    expect(db.transactionManager.redo()).toBe(true)
    expect(db.tables.blockTable.getEntityById(id)).toBeUndefined()
  })
})

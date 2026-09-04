/** @jest-environment node */

// Cut the heavy view/editor module barrels: AcApContext only uses AcTrView2d
// as a type, and AcApDocument only needs eventBus + the AcEdOpenMode enum.
// Loading the real barrels would drag in WebGL / mtext-input-box chains that
// are not resolvable under the node test environment.
jest.mock('../src/view', () => ({}))
jest.mock('../src/editor', () => ({
  eventBus: { emit: jest.fn(), on: jest.fn() }
}))
jest.mock('../src/editor/view', () => ({
  AcEdOpenMode: { Read: 0, Review: 4, Write: 8 }
}))

import { AcApContext } from '../src/app/AcApContext'
import { AcApDocument } from '../src/app/AcApDocument'
import type { AcEdBaseView } from '../src/editor/view/AcEdBaseView'

/**
 * The LWDISPLAY sysvar listener must rebuild the scene only when content was
 * already converted. While a document is opening, header sysvars are applied
 * before any entity converts (entity events are batched until the final
 * flush), so clear()+regen() would replay a full conversion-progress sequence
 * mid-open — the open-file bar restarts from ~20-40% after reaching 100% —
 * and re-dispatch every already-parsed entity for nothing.
 */
function mockView(hasSceneContent: boolean) {
  const calls = { clear: 0 }
  const view = {
    renderer: { showLineWeight: false },
    get hasSceneContent() {
      return hasSceneContent
    },
    clear: () => {
      calls.clear++
    },
    selectionSet: {
      events: {
        selectionAdded: { addEventListener: () => undefined },
        selectionRemoved: { addEventListener: () => undefined }
      }
    }
  }
  return {
    view: view as unknown as AcEdBaseView & {
      renderer: { showLineWeight: boolean }
    },
    calls
  }
}

describe('AcApContext LWDISPLAY handling', () => {
  it('flips the renderer flag without clear+regen while the scene is empty', () => {
    const doc = new AcApDocument()
    const { view, calls } = mockView(false)
    const regenSpy = jest
      .spyOn(doc.database, 'regen')
      .mockResolvedValue(undefined)
    new AcApContext(view, doc)

    doc.database.lwdisplay = true

    expect(view.renderer.showLineWeight).toBe(true)
    expect(calls.clear).toBe(0)
    expect(regenSpy).not.toHaveBeenCalled()
  })

  it('clears and regenerates when scene content already exists', () => {
    const doc = new AcApDocument()
    const { view, calls } = mockView(true)
    const regenSpy = jest
      .spyOn(doc.database, 'regen')
      .mockResolvedValue(undefined)
    new AcApContext(view, doc)

    doc.database.lwdisplay = true

    expect(view.renderer.showLineWeight).toBe(true)
    expect(calls.clear).toBe(1)
    expect(regenSpy).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the renderer flag already matches', () => {
    const doc = new AcApDocument()
    const { view, calls } = mockView(true)
    view.renderer.showLineWeight = true
    const regenSpy = jest
      .spyOn(doc.database, 'regen')
      .mockResolvedValue(undefined)
    new AcApContext(view, doc)

    doc.database.lwdisplay = true

    expect(calls.clear).toBe(0)
    expect(regenSpy).not.toHaveBeenCalled()
  })
})

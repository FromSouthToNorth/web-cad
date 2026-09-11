/**
 * Commit-contract tests for {@link AcApMTextCmd}.
 *
 * `AcApMTextCmd.spec.ts` mocks the editor away, so it can only verify what the
 * command does with a result object it invented itself. These tests instead let
 * the *real* editor produce the result that is persisted, which is exactly where
 * the DXF group 41 (`0` means no wrap), group 40 (authored height, never
 * clamped) and group 71 (attachment 1..9) regressions live.
 */

const mockMTextInputBoxInstances: MockMTextInputBox[] = []
const mockGetBox = jest.fn()
const mockShowMessage = jest.fn()
const mockSysVarChanged = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}

class MockMTextInputBox {
  readonly handlers = new Map<string, Set<() => void>>()
  readonly update = jest.fn()
  readonly dispose = jest.fn()
  closed = false
  /**
   * Faithful to the real `MTextInputBox.closeEditor()`: it marks the box closed
   * and emits `close` synchronously, on the same call. A mock that stays silent
   * lets a cancel path look like it resolved `null` when the editor's own
   * `close` handler has already produced a full result.
   */
  readonly closeEditor = jest.fn(() => {
    if (this.closed) return
    this.closed = true
    this.emit('close')
  })
  readonly off = jest.fn((event: string, handler: () => void) => {
    this.handlers.get(event)?.delete(handler)
  })
  readonly setToolbarTheme = jest.fn()
  text = 'Hello'
  attachmentPoint = 1
  lineSpacingFactor: number | undefined = 1
  insertionPoint = { x: 10, y: 70, z: 0 }
  readonly getText = jest.fn(() => this.text)
  readonly getMTextInsertionPoint = jest.fn(() => this.insertionPoint)
  readonly getMTextAttachmentPoint = jest.fn(() => this.attachmentPoint)
  readonly getLineSpacingFactor = jest.fn(() => this.lineSpacingFactor)

  constructor(readonly options: Record<string, unknown>) {
    mockMTextInputBoxInstances.push(this)
  }

  on(event: string, handler: () => void) {
    const handlers = this.handlers.get(event) ?? new Set<() => void>()
    handlers.add(handler)
    this.handlers.set(event, handlers)
  }

  emit(event: string) {
    this.handlers.get(event)?.forEach(handler => handler())
  }
}

jest.mock(
  '@mlightcad/mtext-input-box',
  () => ({
    MTextInputBox: MockMTextInputBox
  }),
  { virtual: true }
)

jest.mock('@mlightcad/mtext-renderer', () => ({
  MTextColor: class MTextColor {},
  MTextAttachmentPoint: { TopLeft: 1 }
}))

jest.mock('@hy/data-model', () => {
  class AcDbMText {
    location: unknown
    contents = ''
    width = 0
    height = 0
    lineSpacingFactor = 1
    attachmentPoint = 1
    styleName: string | undefined
    layer = '0'
  }

  return {
    AcDbMText,
    AcDbSystemVariables: {
      COLORTHEME: 'COLORTHEME',
      // Loaded through the real `../src/editor` barrel by the grip module.
      GRIPSIZE: 'GRIPSIZE',
      GRIPCOLOR: 'GRIPCOLOR',
      GRIPHOT: 'GRIPHOT'
    },
    AcGiMTextAttachmentPoint: {
      TopLeft: 1
    },
    AcDbSysVarManager: {
      instance: jest.fn(() => ({
        getVar: jest.fn(() => 0),
        events: {
          sysVarChanged: mockSysVarChanged
        }
      }))
    },
    acgiIsLightBackground: () => false
  }
})

jest.mock('../src/app', () => ({
  AcApDocManager: {
    instance: {
      avaiableFonts: [],
      editor: {
        getBox: mockGetBox
      },
      curDocument: {
        database: {
          clayer: '0',
          textstyle: 'Standard',
          tables: {
            textStyleTable: {
              resolveAt: jest.fn(() => undefined)
            }
          }
        }
      },
      resolveColors: jest.fn(() => ({ layerColor: 0xffffff }))
    }
  }
}))

// The editor module is kept real (`AcEdMTextEditor`, `AcEdPromptBoxOptions`,
// `AcEdOpenMode`) so the command drives the real session lifecycle; only the
// base command is replaced, to observe the user-facing messages, and the prompt
// status is pinned to the value the fake `getBox` below resolves with.
jest.mock('../src/editor', () => {
  const actual = jest.requireActual('../src/editor')
  return {
    ...actual,
    AcEdCommand: class AcEdCommand {
      mode: unknown
      showMessage = mockShowMessage
    },
    AcEdPromptStatus: {
      OK: 'OK',
      Cancel: 'Cancel'
    }
  }
})

jest.mock('../src/i18n', () => ({
  AcApI18n: {
    t: (key: string) => key
  }
}))

jest.mock('../src/view', () => ({
  AcTrView2d: class AcTrView2d {}
}))

import {
  AcEdMTextEditor,
  type AcEdMTextEditorOptions,
  type AcEdMTextEditorResult
} from '../src/editor/input/ui/AcEdMTextEditor'
import { AcApMTextCmd } from '../src/command/draw/AcApMTextCmd'
interface FakeElement {
  ownerDocument: {
    createElement: jest.Mock
  }
  appendChild: jest.Mock
  remove: jest.Mock
  setAttribute: jest.Mock
  style: Record<string, string>
}

function createFakeElement(ownerDocument?: FakeElement['ownerDocument']) {
  const documentRef =
    ownerDocument ??
    ({
      createElement: jest.fn()
    } as FakeElement['ownerDocument'])
  const element: FakeElement = {
    ownerDocument: documentRef,
    appendChild: jest.fn(),
    remove: jest.fn(),
    setAttribute: jest.fn(),
    style: {}
  }
  if (!ownerDocument) {
    documentRef.createElement.mockImplementation(() =>
      createFakeElement(documentRef)
    )
  }
  return element
}

function createView() {
  return {
    internalScene: {},
    internalCamera: {},
    backgroundColor: 0,
    canvas: createFakeElement(),
    container: createFakeElement(),
    events: {
      renderFrame: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }
    },
    // Identity mapping keeps the expected heights readable: 1 px = 1 unit.
    screenToWorld: ({ y }: { y: number }) => ({ x: 0, y }),
    isDirty: false,
    isHtmlDirty: false
  }
}

function createContext(appendEntity: jest.Mock) {
  return {
    view: createView(),
    doc: {
      database: {
        clayer: '0',
        textstyle: 'Standard',
        tables: {
          textStyleTable: {
            // Zero-height style: a positive picked box owns the height.
            resolveAt: () => ({ name: 'Standard', textSize: 0, priorSize: 0 })
          },
          blockTable: {
            modelSpace: {
              appendEntity
            }
          }
        }
      }
    }
  }
}

function pickBox(min: { x: number; y: number }, max: { x: number; y: number }) {
  mockGetBox.mockResolvedValue({ status: 'OK', value: { min, max } })
}

/** Lets the command's `await getBox` continuation run. */
async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Runs the command to completion with the *real* editor session.
 *
 * The editor's promise is wrapped, so `mutateResult` edits the result after the
 * real close path produced it but before the command reads it. A `then` chained
 * from the test would be too late: the command attached its own continuation
 * first and would already have persisted the unmodified result.
 */
async function runWithEditor(
  appendEntity: jest.Mock,
  configure: (inputBox: MockMTextInputBox) => void,
  mutateResult?: (result: AcEdMTextEditorResult) => void,
  onOpen?: (options: AcEdMTextEditorOptions) => void
) {
  const context = createContext(appendEntity)
  const openSpy = jest.spyOn(AcEdMTextEditor.prototype, 'open')
  const realOpen = openSpy.getMockImplementation() as unknown as (
    this: AcEdMTextEditor,
    options: AcEdMTextEditorOptions
  ) => Promise<AcEdMTextEditorResult | null>
  openSpy.mockImplementation(function (
    this: AcEdMTextEditor,
    options: AcEdMTextEditorOptions
  ) {
    if (onOpen) onOpen(options)
    const opened = realOpen.call(this, options)
    if (!mutateResult) return opened
    return new Promise<AcEdMTextEditorResult | null>(resolve => {
      void opened.then(result => {
        if (result) mutateResult(result)
        resolve(result)
      })
    })
  })

  try {
    const execution = new AcApMTextCmd().execute(context as never)
    await flushPromises()
    const inputBox =
      mockMTextInputBoxInstances[mockMTextInputBoxInstances.length - 1]
    if (!inputBox) {
      throw new Error('the command did not open an MTEXT editor')
    }
    configure(inputBox)
    inputBox.emit('close')
    await execution
  } finally {
    openSpy.mockRestore()
  }
  return context
}

describe('AcApMTextCmd commit contract', () => {
  beforeEach(() => {
    mockMTextInputBoxInstances.length = 0
    mockGetBox.mockReset()
    mockShowMessage.mockReset()
  })

  afterEach(() => {
    AcEdMTextEditor.closeActive()
  })

  it('persists the picked box height as DXF group 40', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 10, y: 20 }, { x: 110, y: 80 })

    await runWithEditor(appendEntity, inputBox => {
      inputBox.text = 'Hello'
    })

    expect(appendEntity).toHaveBeenCalledTimes(1)
    const entity = appendEntity.mock.calls[0][0]
    // The box is 60 units tall; neither the on-screen fallback nor a clamp to 1
    // may replace it.
    expect(entity.height).toBe(60)
    expect(entity.contents).toBe('Hello')
  })

  it('keeps an authored sub-unit height verbatim', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 50, y: 0.5 })

    await runWithEditor(appendEntity, () => undefined)

    expect(appendEntity).toHaveBeenCalledTimes(1)
    expect(appendEntity.mock.calls[0][0].height).toBe(0.5)
  })

  it('rejects empty and whitespace-only contents with the shared i18n key', async () => {
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })

    const emptyAppend = jest.fn()
    await runWithEditor(emptyAppend, inputBox => {
      inputBox.text = ''
    })
    expect(emptyAppend).not.toHaveBeenCalled()
    expect(mockShowMessage).toHaveBeenCalledWith(
      'jig.mtext.emptyContents',
      'warning'
    )

    mockShowMessage.mockReset()
    const blankAppend = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })
    await runWithEditor(blankAppend, inputBox => {
      inputBox.text = '   \n\t '
    })
    expect(blankAppend).not.toHaveBeenCalled()
    expect(mockShowMessage).toHaveBeenCalledWith(
      'jig.mtext.emptyContents',
      'warning'
    )
  })

  it('forwards the layout width and writes it as DXF group 41', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })

    await runWithEditor(appendEntity, inputBox => {
      inputBox.text = 'wrapped label'
    })

    const entity = appendEntity.mock.calls[0][0]
    expect(entity.width).toBe(100)
    // Group 44 keeps the editor's factor; the command does not re-derive it.
    expect(entity.lineSpacingFactor).toBe(1)
  })

  it('writes a sub-unit picked width as DXF group 41', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 0.25, y: 30 })

    await runWithEditor(appendEntity, inputBox => {
      inputBox.text = 'narrow'
    })

    expect(appendEntity).toHaveBeenCalledTimes(1)
    const entity = appendEntity.mock.calls[0][0]
    // The input box needs at least 1 world unit to lay text out, but that
    // layout floor is not the width the user picked and must not be persisted.
    expect(entity.width).toBe(0.25)
  })

  it('writes a degenerate picked width as the no-wrap width 0', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 0, y: 30 })

    await runWithEditor(appendEntity, inputBox => {
      inputBox.text = 'no wrap'
    })

    expect(appendEntity).toHaveBeenCalledTimes(1)
    // A zero-width pick means "no wrap" (DXF group 41 = 0); the editor's
    // `Math.max(1, width)` layout floor must not turn it into a 1-unit width.
    expect(appendEntity.mock.calls[0][0].width).toBe(0)
  })

  it('persists a no-wrap committed width of 0 instead of the layout width', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })
    let openOptions: AcEdMTextEditorOptions | undefined

    await runWithEditor(
      appendEntity,
      inputBox => {
        inputBox.text = 'no wrap'
      },
      result => {
        // An editing session passes the entity's own width, which is `0` for a
        // "no wrap" MTEXT, so the layout width must not replace it.
        result.committedWidth = 0
      },
      options => {
        openOptions = options
      }
    )

    // The picked width is still the width the editor lays text out with.
    // Whether the command forwards it as `committedWidth` or leaves the editor
    // to default it is an implementation choice; group 41 is asserted below.
    expect(openOptions?.width).toBe(100)
    expect(appendEntity).toHaveBeenCalledTimes(1)
    expect(appendEntity.mock.calls[0][0].width).toBe(0)
  })

  it('clamps an out-of-range attachment point to TopLeft (DXF group 71)', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })
    await runWithEditor(appendEntity, inputBox => {
      // The AcGi enum extends to 12 for TEXT/ATTRIB baselines, but DXF group 71
      // is only valid in 1..9.
      inputBox.attachmentPoint = 11
    })
    expect(appendEntity.mock.calls[0][0].attachmentPoint).toBe(1)

    const validAppend = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })
    await runWithEditor(validAppend, inputBox => {
      inputBox.attachmentPoint = 9
    })
    expect(validAppend.mock.calls[0][0].attachmentPoint).toBe(9)
  })

  it('writes nothing when the editor is cancelled', async () => {
    const appendEntity = jest.fn()
    pickBox({ x: 0, y: 0 }, { x: 100, y: 30 })
    const context = createContext(appendEntity)
    const execution = new AcApMTextCmd().execute(context as never)
    await flushPromises()

    expect(mockMTextInputBoxInstances).toHaveLength(1)
    const inputBox = mockMTextInputBoxInstances[0]
    // The real editor's own `Esc` path: the input box emits `close`
    // synchronously from `closeEditor()`, so the editor's result handler runs
    // before `closeActive()` gets to settle the session as cancelled.
    inputBox.closeEditor()
    // Esc, a document switch or a second `open()` all settle the editor with
    // `null`; the command must treat that as a cancel and write nothing.
    AcEdMTextEditor.closeActive()
    await execution

    expect(appendEntity).not.toHaveBeenCalled()
    expect(mockShowMessage).not.toHaveBeenCalled()
    expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
  })

  it('writes nothing when the box prompt itself is cancelled', async () => {
    const appendEntity = jest.fn()
    mockGetBox.mockResolvedValue({ status: 'Cancel', value: undefined })

    await new AcApMTextCmd().execute(createContext(appendEntity) as never)

    expect(mockMTextInputBoxInstances).toHaveLength(0)
    expect(appendEntity).not.toHaveBeenCalled()
  })
})

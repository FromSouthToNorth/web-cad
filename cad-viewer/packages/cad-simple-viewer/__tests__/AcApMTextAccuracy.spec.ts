/**
 * Accuracy / contract assertions for the MTEXT creation command.
 *
 * Scope (unit B1 - literals layer: "command attributes read back"):
 * - box corners given in reverse order (user drags bottom-right -> top-left)
 * - pixel -> world conversion of the default text height
 * - what the editor handshake does with the height it reports back (the
 *   suspected defect)
 * - empty / whitespace-only input must not create an entity
 * - attachment point pass-through and out-of-range fallback
 * - raw contents (inline format codes + leading/trailing blanks) preservation
 * - the appended entity is `AcDbMText` and mirrors every editor field
 *
 * The real `AcApMTextCmd` and the real `AcEdMTextEditor` run here. Only the
 * unavoidable browser-side collaborators are replaced:
 * `@mlightcad/mtext-input-box` (DOM/WebGL widget), `../src/app` (document
 * manager singleton) and `../src/view`.
 *
 * The fake input box is a *faithful* editor: unless a test overrides it, it
 * echoes back the location / width / text height it was constructed with, so a
 * field mismatch can only come from the command itself.
 */

const mockGetBox = jest.fn()
const mockResolveColors = jest.fn(() => ({ layerColor: 0xffffff }))

/** Options bag handed to `MTextInputBox` by `AcEdMTextEditor.open()`. */
interface MockInputBoxOptions {
  width: number
  position: { x: number; y: number; z: number }
  textStyle?: { fixedTextHeight: number; lastHeight: number }
  [key: string]: unknown
}

/** Values the fake input box reports back to the editor on close. */
const mockEditorState = {
  /** Text typed by the user (inline codes included). */
  contents: '',
  /**
   * Insertion point override. `null` means "echo the editor position", which
   * mimics a user who did not drag the text box around.
   */
  location: null as { x: number; y: number; z: number } | null,
  /**
   * `getLineSpacingFactor()` result. `undefined` makes the editor fall back to
   * `AcEdMTextEditor.defaultLineSpacingFactor`, which is `1` (single spacing) —
   * not the `0.3` an older comment here claimed.
   */
  lineSpacingFactor: 0.25 as number | undefined,
  /** `getMTextAttachmentPoint()` result. */
  attachmentPoint: 1
}

const mockInputBoxInstances: MockMTextInputBox[] = []

class MockMTextInputBox {
  private readonly handlers = new Map<string, Set<() => void>>()

  readonly update = jest.fn()
  readonly dispose = jest.fn()
  readonly setToolbarTheme = jest.fn()

  constructor(readonly options: MockInputBoxOptions) {
    mockInputBoxInstances.push(this)
  }

  on(event: string, handler: () => void) {
    const handlers = this.handlers.get(event) ?? new Set<() => void>()
    handlers.add(handler)
    this.handlers.set(event, handlers)
  }

  off(event: string, handler: () => void) {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event: string) {
    this.handlers.get(event)?.forEach(handler => handler())
  }

  getText() {
    return mockEditorState.contents
  }

  getMTextInsertionPoint() {
    const override = mockEditorState.location
    return override ? { ...override } : { ...this.options.position }
  }

  getLineSpacingFactor() {
    return mockEditorState.lineSpacingFactor
  }

  getMTextAttachmentPoint() {
    return mockEditorState.attachmentPoint
  }
}

jest.mock(
  '@mlightcad/mtext-input-box',
  () => ({ MTextInputBox: MockMTextInputBox }),
  { virtual: true }
)

jest.mock('@mlightcad/mtext-renderer', () => ({
  MTextColor: class MTextColor {},
  MTextAttachmentPoint: {
    TopLeft: 1,
    TopCenter: 2,
    TopRight: 3,
    MiddleLeft: 4,
    MiddleCenter: 5,
    MiddleRight: 6,
    BottomLeft: 7,
    BottomCenter: 8,
    BottomRight: 9
  }
}))

/** Database used by the editor and the command (installed by the helpers below). */
let mockWorkingDatabase: {
  clayer: string
  textstyle: string
  tables: {
    textStyleTable: { resolveAt: (name?: string) => unknown }
    blockTable: { modelSpace: { appendEntity: (entity: unknown) => unknown } }
  }
} = {
  clayer: '0',
  textstyle: 'Standard',
  tables: {
    textStyleTable: { resolveAt: () => undefined },
    blockTable: { modelSpace: { appendEntity: () => undefined } }
  }
}

const mockDocManager = {
  avaiableFonts: [{ name: ['  SimSun  ', '', 'SimSun'] }],
  editor: {
    getBox: mockGetBox
  },
  get curDocument() {
    return { database: mockWorkingDatabase }
  },
  resolveColors: mockResolveColors
}

jest.mock('../src/app', () => ({
  AcApDocManager: { instance: mockDocManager }
}))

jest.mock('../src/editor', () => {
  class AcEdCommand {
    mode: unknown
    /** Command-line feedback sink used by the warning paths. */
    showMessage = jest.fn()
  }

  class AcEdPromptBoxOptions {
    useBasePoint = true
    useDashedLine = true

    constructor(
      readonly firstCornerMessage: string,
      readonly secondCornerMessage: string
    ) {}
  }

  return {
    AcEdCommand,
    AcEdMTextEditor: jest.requireActual(
      '../src/editor/input/ui/AcEdMTextEditor'
    ).AcEdMTextEditor,
    AcEdOpenMode: { Write: 'Write' },
    AcEdPromptBoxOptions,
    AcEdPromptStatus: { OK: 'OK', Cancel: 'Cancel' }
  }
})

jest.mock('../src/i18n', () => ({
  AcApI18n: { t: (key: string) => key }
}))

jest.mock('../src/view', () => ({
  AcTrView2d: class AcTrView2d {}
}))

import { AcDbDatabase, AcDbMText } from '@hy/data-model'

import { AcApMTextCmd } from '../src/command/draw/AcApMTextCmd'

/** Scale (world units per screen pixel) used by the fake view. */
let mockWorldUnitsPerPixel = 0.5

/** Minimal DOM stand-in used to host the hidden MTEXT toolbar. */
function createFakeElement() {
  const element = {
    ownerDocument: { createElement: () => createFakeElement() },
    appendChild: jest.fn(),
    remove: jest.fn(),
    setAttribute: jest.fn(),
    style: {} as Record<string, string>
  }
  return element
}

/** Fake 2D view exposing the members the command and editor touch. */
const mockView = {
  screenToWorld: ({ y }: { x: number; y: number }) => ({
    x: 0,
    y: y * mockWorldUnitsPerPixel
  }),
  backgroundColor: 0,
  internalScene: {},
  internalCamera: {},
  container: createFakeElement(),
  canvas: createFakeElement(),
  isHtmlDirty: false,
  events: {
    renderFrame: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }
  }
}

interface MockContext {
  view: typeof mockView
  doc: {
    database: {
      tables: {
        blockTable: { modelSpace: { appendEntity: jest.Mock } }
      }
    }
  }
}

function createContext(appendEntity: jest.Mock): MockContext {
  void appendEntity
  return {
    view: mockView,
    doc: {
      // Use the working database installed by `createWorkingDatabase` so the
      // command sees a real text style table (it resolves the current style to
      // derive the text height and the persisted style name).
      database: mockWorkingDatabase as never
    }
  }
}

/** Result configured for the next editor interaction. */
interface EditorAnswer {
  contents: string
  location?: { x: number; y: number; z: number }
  lineSpacingFactor?: number
  attachmentPoint?: number
}

/** Configures the next box pick: reverse order = bottom-right then top-left. */
function givenBoxPick(
  min: { x: number; y: number },
  max: { x: number; y: number }
) {
  mockGetBox.mockResolvedValue({ status: 'OK', value: { min, max } })
}

function givenReverseBoxPick() {
  // First corner is the bottom-right one; the user dragged to the top-left.
  givenBoxPick({ x: 10, y: 20 }, { x: 110, y: 80 })
}

/** Configures what the next editor interaction returns. */
function givenEditorAnswer(answer: EditorAnswer) {
  mockEditorState.contents = answer.contents
  mockEditorState.location = answer.location ?? null
  // `0.3` is only the default *input* of this fake box: it is deliberately far
  // from the editor's own fallback (`defaultLineSpacingFactor`, i.e. `1`) so a
  // copied value cannot be mistaken for a re-derived one.
  mockEditorState.lineSpacingFactor = answer.lineSpacingFactor ?? 0.3
  mockEditorState.attachmentPoint = answer.attachmentPoint ?? 1
}

/** Returns the input box created by the last editor `open()` call. */
function lastInputBox(): MockMTextInputBox {
  const inputBox = mockInputBoxInstances[mockInputBoxInstances.length - 1]
  if (!inputBox) throw new Error('MText input box was never created')
  return inputBox
}

/** Options bag captured by the last `MTextInputBox` construction. */
function lastEditorOptions(): MockInputBoxOptions {
  return lastInputBox().options
}

/** Text height in world units requested from the editor, as a number. */
function requestedTextHeight(): number {
  const fixedTextHeight = lastEditorOptions().textStyle?.fixedTextHeight
  if (typeof fixedTextHeight !== 'number') {
    throw new Error('Editor text height was not forwarded to the input box')
  }
  return fixedTextHeight
}

/**
 * Runs the command, closes the editor and resolves after execution finished.
 *
 * The append spy wraps the real model space of the working database, so the
 * command exercises the real append path while the test observes each entity.
 */
async function runCommand(options: { appendEntity?: jest.Mock } = {}) {
  const modelSpace = mockWorkingDatabase.tables.blockTable.modelSpace
  const realAppend = modelSpace.appendEntity
  const appendEntity =
    options.appendEntity ??
    jest.fn((entity: unknown) => {
      if (typeof realAppend === 'function') {
        realAppend.call(modelSpace, entity)
      }
    })
  modelSpace.appendEntity = appendEntity
  try {
    const commandPromise = new AcApMTextCmd().execute(
      createContext(appendEntity) as never
    )
    // The command awaits `getBox`; drain the microtask queue until the editor
    // has constructed its input box.
    await Promise.resolve()
    await Promise.resolve()
    lastInputBox().emit('close')
    await commandPromise
  } finally {
    modelSpace.appendEntity = realAppend
  }
  return { appendEntity, inputBox: lastInputBox() }
}

/**
 * Builds the working database and pins the current text style height.
 *
 * `AcDbDatabase.createDefaultData()` seeds `priorSize = 0.2`, which would
 * otherwise win over the picked box in the height priority chain. Tests that
 * exercise the box / on-screen fallbacks reset it to 0.
 */
const createWorkingDatabase = (styleTextSize = 0, stylePriorSize = 0) => {
  const database = new AcDbDatabase()
  database.createDefaultData()
  const record = database.tables.textStyleTable.getAt(database.textstyle)
  if (record) {
    record.textSize = styleTextSize
    record.priorSize = stylePriorSize
  }
  mockWorkingDatabase = database as unknown as typeof mockWorkingDatabase
  return database
}

describe('AcApMTextCmd attribute accuracy (B1 literals layer)', () => {
  beforeEach(() => {
    mockGetBox.mockReset()
    mockResolveColors.mockClear()
    mockInputBoxInstances.length = 0
    mockWorldUnitsPerPixel = 0.5
    givenEditorAnswer({
      contents: 'Hello',
      lineSpacingFactor: 0.25,
      attachmentPoint: 1
    })
    createWorkingDatabase()
  })

  it('normalizes a reverse box pick into min/max location and width', async () => {
    givenReverseBoxPick()
    givenEditorAnswer({ contents: 'Hello' })

    const { appendEntity } = await runCommand()

    // `box.min` is the normalized top-left corner, regardless of which corner
    // the user picked first.
    expect(mockGetBox).toHaveBeenCalledTimes(1)
    expect(lastEditorOptions().position).toEqual({ x: 10, y: 80, z: 0 })
    expect(lastEditorOptions().width).toBe(100)

    // The faithful editor echoes both values back.
    const entity = appendEntity.mock.calls[0][0]
    expect(entity.location).toEqual({ x: 10, y: 80, z: 0 })
    expect(entity.width).toBe(100)
  })

  it('converts 24 screen pixels into world units when no style or box height exists', async () => {
    mockWorldUnitsPerPixel = 0.08
    givenReverseBoxPick()
    givenEditorAnswer({ contents: 'Hello' })

    // A degenerate pick (zero height) plus a zero-height style is the only case
    // that may fall back to a readable on-screen height.
    mockGetBox.mockResolvedValue({
      status: 'OK',
      value: { min: { x: 10, y: 80 }, max: { x: 110, y: 80 } }
    })

    const { appendEntity } = await runCommand()

    // 24 px * 0.08 world/px = 1.92 world units.
    expect(requestedTextHeight()).toBeCloseTo(1.92, 10)
    const entity = appendEntity.mock.calls[0][0]
    expect(entity.height).toBeCloseTo(1.92, 10)
    expect(entity.height).toBeCloseTo(requestedTextHeight(), 10)
  })

  it('prefers the picked box height over the on-screen fallback', async () => {
    mockWorldUnitsPerPixel = 0.08
    givenReverseBoxPick()
    givenEditorAnswer({ contents: 'Hello' })

    const { appendEntity } = await runCommand()

    // The box the user picked is 60 world units tall, so it wins over the
    // 24-pixel (1.92) fallback.
    expect(requestedTextHeight()).toBeCloseTo(60, 10)
    const entity = appendEntity.mock.calls[0][0]
    expect(entity.height).toBeCloseTo(60, 10)
  })

  it('prefers the picked box over a style that only has a prior height', async () => {
    // AutoCAD default drawings carry priorSize = 0.2 (the $TEXTSIZE default).
    // last height used, not a fixed height, so it must not win over the box the
    // user just picked - otherwise a 200x30 pixel pick renders 0.2 units of text.
    createWorkingDatabase(0, 0.2)
    givenReverseBoxPick()
    givenEditorAnswer({ contents: 'Hello' })

    const { appendEntity } = await runCommand()

    expect(requestedTextHeight()).toBeCloseTo(60, 10)
    const entity = appendEntity.mock.calls[0][0]
    expect(entity.height).toBeCloseTo(60, 10)
    expect(entity.styleName).toBe('Standard')
  })

  it('uses a fixed style height when the pick has no height', async () => {
    createWorkingDatabase(2.5, 0)
    mockGetBox.mockResolvedValue({
      status: 'OK',
      value: { min: { x: 10, y: 80 }, max: { x: 110, y: 80 } }
    })
    givenEditorAnswer({ contents: 'Hello' })

    const { appendEntity } = await runCommand()

    expect(requestedTextHeight()).toBeCloseTo(2.5, 10)
    expect(appendEntity.mock.calls[0][0].height).toBeCloseTo(2.5, 10)
  })

  it('keeps sub-unit text heights instead of clamping them to 1', async () => {
    mockWorldUnitsPerPixel = 0.008
    // Give the pick a sub-unit height so the priority chain reaches it.
    mockGetBox.mockResolvedValue({
      status: 'OK',
      value: { min: { x: 10, y: 80 }, max: { x: 110, y: 80.192 } }
    })
    givenEditorAnswer({ contents: 'Hello' })
    const { appendEntity } = await runCommand()

    // 24 px * 0.008 world/px = 0.192 world units.
    const entity = appendEntity.mock.calls[0][0]
    expect(entity.height).toBeCloseTo(0.192, 10)
    expect(requestedTextHeight()).toBeCloseTo(0.192, 10)
  })

  it('does not append an entity for empty contents', async () => {
    givenReverseBoxPick()
    givenEditorAnswer({ contents: '' })

    const { appendEntity } = await runCommand()

    expect(mockInputBoxInstances).toHaveLength(1)
    expect(appendEntity).not.toHaveBeenCalled()
  })
  it('does not append an entity for whitespace-only contents', async () => {
    givenReverseBoxPick()
    givenEditorAnswer({ contents: '  \t\n \r\n  ' })

    const { appendEntity } = await runCommand()

    expect(appendEntity).not.toHaveBeenCalled()
  })

  it('passes valid attachment points through', async () => {
    for (const attachmentPoint of [1, 5, 9]) {
      mockInputBoxInstances.length = 0
      givenReverseBoxPick()
      givenEditorAnswer({ contents: 'Hello', attachmentPoint })
      const { appendEntity } = await runCommand()
      expect(appendEntity.mock.calls[0][0].attachmentPoint).toBe(
        attachmentPoint
      )
    }
  })

  it('falls back to the default attachment point for an invalid editor value', async () => {
    givenReverseBoxPick()
    givenEditorAnswer({ contents: 'Hello', attachmentPoint: 12 })
    const { appendEntity } = await runCommand()

    expect(appendEntity.mock.calls[0][0].attachmentPoint).toBe(1)
  })

  it('keeps raw contents with inline format codes and surrounding blanks', async () => {
    const raw = '  {\\fSimSun|b0|i0|c134|p2;中文\\H2.5x;大字}\\P\\C1;红色  '
    givenReverseBoxPick()
    givenEditorAnswer({ contents: raw })

    const { appendEntity } = await runCommand()

    const entity = appendEntity.mock.calls[0][0]
    expect(entity.contents).toBe(raw)
    expect(entity.contents).toContain('\\fSimSun')
    expect(entity.contents).toContain('\\H2.5x;')
    expect(entity.contents).toContain('\\C1;')
    expect(entity.contents).toContain('\\P')
    // Leading/trailing blanks are part of the literal payload.
    expect(entity.contents.startsWith('  ')).toBe(true)
    expect(entity.contents.endsWith('  ')).toBe(true)
  })

  it('appends an AcDbMText mirroring every editor field', async () => {
    const contents = '第一行\\P第二行'
    givenReverseBoxPick()
    givenEditorAnswer({
      contents,
      location: { x: 3.5, y: -7.25, z: 0 },
      lineSpacingFactor: 1.25,
      attachmentPoint: 5
    })

    const { appendEntity } = await runCommand()

    expect(appendEntity).toHaveBeenCalledTimes(1)
    const entity = appendEntity.mock.calls[0][0]
    expect(entity).toBeInstanceOf(AcDbMText)
    expect(entity.contents).toBe(contents)
    expect(entity.location).toEqual({ x: 3.5, y: -7.25, z: 0 })
    expect(entity.width).toBe(100)
    expect(entity.lineSpacingFactor).toBe(1.25)
    expect(entity.attachmentPoint).toBe(5)
    // The height field is called out explicitly and compared across two
    // independent sources: the world-space height the command handed to the
    // editor (the input box's text style) and the height persisted on the
    // entity. A struct literal built from one of them on both sides would be
    // true by construction and would hide any re-derivation or clamp.
    const requestedHeight = requestedTextHeight()
    expect(entity.height).toBeCloseTo(requestedHeight, 10)
    // A third source pins the pair: the picked box is 60 world units tall, so
    // both sides agreeing on a shared *fallback* (the 24 px screen estimate)
    // cannot pass either.
    expect(requestedHeight).toBeCloseTo(60, 10)
  })
})

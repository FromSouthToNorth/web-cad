/**
 * Lifecycle and result-contract tests for {@link AcEdMTextEditor}.
 *
 * These cover the regressions the editor enhancement fixed and that the older
 * `AcEdMTextEditor.spec.ts` never asserted:
 * - a second `open()` must settle the previous promise (the `mtext` command
 *   used to park on it forever);
 * - every cancel path resolves `null`, writes nothing and releases state;
 * - the result carries the caller's width/height semantics, including the
 *   "no wrap" committed width of `0`;
 * - repeated `open()` calls must not stack view/sysvar listeners.
 *
 * Assertions target observable state (`getActiveInputBox`, the fake view's
 * listener registry, the input box's own handler registry) rather than just
 * "some function was called".
 */

const mockMTextInputBoxInstances: MockMTextInputBox[] = []
const mockSysVarChanged = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}
/** Sink for the warnings the view's MTEXT edit path reports. */
const mockShowMessage = jest.fn()

class MockMTextInputBox {
  readonly handlers = new Map<string, Set<() => void>>()
  readonly update = jest.fn()
  readonly dispose = jest.fn()
  closed = false
  /**
   * Faithful to the real `MTextInputBox.closeEditor()`: it marks the box closed
   * and emits `close` synchronously, on the same call. A mock that stays silent
   * hides the cancel-path race the editor has to survive, because the editor's
   * own `close` handler runs before the caller settles the session.
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
  readonly getText = jest.fn(() => 'lifecycle text')
  readonly getMTextInsertionPoint = jest.fn(() => ({ x: 7, y: 8, z: 9 }))
  readonly getMTextAttachmentPoint = jest.fn(() => 5)
  getLineSpacingFactor = jest.fn((): number | undefined => 1.25)
  // Writable on purpose: `attachFormatBridge` replaces these while the editor
  // is open and restores them on dispose.
  setCurrentFormat = jest.fn()
  /**
   * The library's hidden IME `<textarea>`, which is the element a key event
   * really targets while the editor is open (`attachImeBridge` in the shipped
   * viewer).
   *
   * Absent by default because the field is private in the shipped types; a test
   * that needs the editor to recognise its own keyboard focus installs a
   * stand-in here, exactly as the runtime object would carry it.
   */
  imeInput: unknown = undefined

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

  /** Number of handlers still registered for one event. */
  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0
  }
}

jest.mock(
  '@mlightcad/mtext-input-box',
  () => ({
    MTextInputBox: MockMTextInputBox
  }),
  { virtual: true }
)

jest.mock('@mlightcad/mtext-renderer', () => {
  // Same reason as `@hy/data-model` above: the three-renderer bundle extends
  // `DefaultFontLoader` from this package, so the real exports have to survive.
  const actual = jest.requireActual('@mlightcad/mtext-renderer') as Record<
    string,
    unknown
  >
  return {
    ...actual,
    MTextColor: class MTextColor {},
    MTextAttachmentPoint: { TopLeft: 1 }
  }
})

jest.mock('@hy/data-model', () => {
  // The real catalogue is kept and only the controllable pieces are replaced:
  // `@hy/three-renderer` is loaded through `AcTrView2d` below and extends its
  // base classes while the bundle initializes, so a hand-written subset makes
  // that bundle throw "Class extends value undefined".
  const actual = jest.requireActual('@hy/data-model') as Record<string, unknown>

  /**
   * Stand-in for the entity class the view narrows its write result with
   * `instanceof`. Only the fields the view writes back are modelled.
   */
  class AcDbMText {
    location = { x: 0, y: 0, z: 0 }
    contents = ''
    width = 0
    height = 0
    lineSpacingFactor = 1
    attachmentPoint = 1
  }

  return {
    ...actual,
    AcDbMText,
    AcDbSystemVariables: {
      // The catalogue is spread rather than replaced: the editor barrel the
      // view pulls in reads grip sysvar names at module load.
      ...(actual.AcDbSystemVariables as Record<string, string>),
      COLORTHEME: 'COLORTHEME'
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
        // Consumed by the view's empty-contents branch.
        showMessage: mockShowMessage
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

// The MTEXT edit path reports through i18n keys; resolving them for real would
// load every locale table into this suite.
jest.mock('../src/i18n', () => ({
  AcApI18n: {
    t: (key: string) => key
  }
}))

// `AcTrView2d` (imported below for its MTEXT edit path) pulls in the FPS stats
// widget, which ships as an ES module that Jest does not transform inside
// `node_modules`. Only the constructor uses it, so a stub class is enough.
jest.mock('three/examples/jsm/libs/stats.module.js', () => ({
  __esModule: true,
  default: class Stats {}
}))

jest.mock('../src/view', () => ({
  AcTrView2d: class AcTrView2d {}
}))

import {
  AcEdMTextEditor,
  type AcEdMTextEditorResult
} from '../src/editor/input/ui/AcEdMTextEditor'
import { AcTrView2d } from '../src/view/AcTrView2d'

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

interface FakeRenderFrameEvents {
  addEventListener: jest.Mock
  removeEventListener: jest.Mock
}

interface FakeView {
  internalScene: Record<string, never>
  internalCamera: Record<string, never>
  backgroundColor: number
  canvas: FakeElement
  container: FakeElement
  events: { renderFrame: FakeRenderFrameEvents }
  isDirty: boolean
  isHtmlDirty: boolean
}

function createView(): FakeView {
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
    isDirty: false,
    isHtmlDirty: false
  }
}

/**
 * Awaits `promise` and fails when it does not settle within `ms`.
 *
 * Used instead of a fixed `await` because the bug under test is a promise that
 * never settles: a hanging test would otherwise time out the whole suite with
 * an unhelpful stack.
 */
async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`promise did not settle within ${ms}ms`)),
      ms
    )
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function renderFrameOf(view: FakeView): FakeRenderFrameEvents {
  return view.events.renderFrame
}

/**
 * The canvas of the session's own view, as a key-event target.
 *
 * Passed as the `pressKey` `target` marker so the case resolves the canvas of
 * the view that session was actually opened against.
 */
function canvasOfView(view: FakeView): FakeElement {
  return view.canvas
}

/**
 * The `keydown` event shape the editor's capture listener reads.
 *
 * Declared here instead of reusing the DOM lib's `KeyboardEvent` because the
 * suite runs in the jest `node` environment, where that type has no runtime
 * counterpart. Every field the listener branches on is present so a case can
 * drive one guard at a time.
 *
 * No `preventDefault()`: the implementation only reads `defaultPrevented` and
 * never claims the event, because suppressing the default would also stop the
 * library's own teardown for the same key press.
 */
interface FakeKeyEvent {
  key: string
  isComposing?: boolean
  keyCode?: number
  target?: unknown
  defaultPrevented?: boolean
}

/** Guards a dispatch can set; each stays untouched unless a case names it. */
interface KeyEventOptions {
  isComposing?: boolean
  keyCode?: number
  target?: unknown
  defaultPrevented?: boolean
}

interface FakeWindow {
  addEventListener: jest.Mock
  removeEventListener: jest.Mock
  dispatchEvent: (event: FakeKeyEvent) => boolean
}

/**
 * Installs a `window` keydown registry for the duration of one test.
 *
 * The editor claims Escape in the *capture* phase on `window`. A stand-in that
 * ignored the third `addEventListener` argument would still run the listener and
 * leave the suite unable to tell capture from bubble, so the phase is modelled
 * explicitly and dispatch runs the capture listeners first, then the bubble
 * ones, exactly as a browser does.
 */
function installWindowKeyListeners() {
  const listeners: Record<
    'capture' | 'bubble',
    Set<(event: FakeKeyEvent) => void>
  > = {
    capture: new Set(),
    bubble: new Set()
  }
  const phaseOf = (capture?: boolean) => (capture ? 'capture' : 'bubble')
  // The suite runs in the jest `node` environment, where `window` does not
  // exist at all. A stand-in global surface is installed instead of spying, so
  // the editor sees the same capture-phase keyboard channel a browser gives it.
  const fakeWindow: FakeWindow = {
    addEventListener: jest.fn(
      (
        eventName: string,
        handler: (event: FakeKeyEvent) => void,
        capture?: boolean
      ) => {
        if (eventName !== 'keydown') return
        listeners[phaseOf(capture)].add(handler)
      }
    ),
    removeEventListener: jest.fn(
      (
        eventName: string,
        handler: (event: FakeKeyEvent) => void,
        capture?: boolean
      ) => {
        if (eventName !== 'keydown') return
        listeners[phaseOf(capture)].delete(handler)
      }
    ),
    dispatchEvent: (event: FakeKeyEvent) => {
      // Snapshot the sets first: a listener may unbind itself (or another one)
      // while the event is being delivered, and the DOM would still call it.
      for (const handler of [...listeners.capture]) handler(event)
      for (const handler of [...listeners.bubble]) handler(event)
      return true
    }
  }
  ;(globalThis as Record<string, unknown>).window = fakeWindow
  return {
    captureCount: () => listeners.capture.size,
    /** Every keydown listener still bound, whatever phase it was bound in. */
    count: () => listeners.capture.size + listeners.bubble.size,
    addEventListener: fakeWindow.addEventListener,
    removeEventListener: fakeWindow.removeEventListener,
    restore: () => {
      delete (globalThis as Record<string, unknown>).window
    }
  }
}

type WindowKeyListeners = ReturnType<typeof installWindowKeyListeners>

/**
 * Dispatches one `keydown` through the fake `window`.
 *
 * @param key - Value of `event.key`.
 * @param options - Guards to set for this key press.
 */
function dispatchWindowKeyDown(key: string, options: KeyEventOptions = {}) {
  const fakeWindow = (globalThis as Record<string, unknown>).window as
    | FakeWindow
    | undefined
  if (!fakeWindow) throw new Error('the fake window is not installed')
  // `KeyboardEvent` is absent in the jest node environment, so the event is a
  // plain object carrying the fields the listener reads.
  fakeWindow.dispatchEvent({
    key,
    isComposing: options.isComposing,
    keyCode: options.keyCode,
    target: options.target,
    defaultPrevented: options.defaultPrevented
  })
}

/** Reported instead of a result when a promise is still pending. */
const PENDING = Symbol('pending')

/**
 * Which of "settled" and "still pending" happened first.
 *
 * A guarded Escape never settles the session, so awaiting the promise itself
 * would hang the suite; racing a real timer keeps both outcomes observable
 * without any timeout being mistaken for a settlement.
 */
async function settleStateWithin<T>(
  promise: Promise<T>,
  ms: number
): Promise<T | typeof PENDING> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof PENDING>(resolve => {
    timer = setTimeout(() => resolve(PENDING), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

describe('AcEdMTextEditor lifecycle', () => {
  afterEach(() => {
    // The editor owns process-wide static state; release it so a failure in one
    // test cannot leak an active session into the next one.
    AcEdMTextEditor.closeActive()
  })

  beforeEach(() => {
    mockMTextInputBoxInstances.length = 0
    mockSysVarChanged.addEventListener.mockClear()
    mockSysVarChanged.removeEventListener.mockClear()
    AcEdMTextEditor.setDefaultToolbarEnabled(true)
  })

  it('settles the first open() promise as cancelled when open() runs again', async () => {
    const view = createView()
    const frameEvents = renderFrameOf(view)
    const firstPromise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const firstBox = mockMTextInputBoxInstances[0]
    expect(AcEdMTextEditor.getActiveInputBox()).toBe(firstBox)

    const firstSettled = settleWithin(firstPromise, 500)
    const secondPromise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 5, y: 5, z: 0 },
      width: 20,
      textHeight: 3
    })
    const secondBox = mockMTextInputBoxInstances[1]

    // The retired session must resolve `null` without waiting for a `close`
    // event its disposed input box will never deliver.
    await expect(firstSettled).resolves.toBeNull()
    expect(firstBox.dispose).toHaveBeenCalledTimes(1)
    // Its own listeners are gone: the retired box can no longer drive the view.
    expect(firstBox.listenerCount('close')).toBe(0)
    expect(firstBox.listenerCount('change')).toBe(0)
    expect(firstBox.listenerCount('cursorMove')).toBe(0)
    expect(firstBox.listenerCount('selectionChange')).toBe(0)
    // One add + one remove per retired session; the live session still holds one.
    expect(frameEvents.addEventListener).toHaveBeenCalledTimes(2)
    expect(frameEvents.removeEventListener).toHaveBeenCalledTimes(1)
    // The new session owns the active slot and the stale handle cannot kill it.
    expect(AcEdMTextEditor.getActiveInputBox()).toBe(secondBox)
    expect(secondBox.dispose).not.toHaveBeenCalled()

    secondBox.emit('close')
    await expect(secondPromise).resolves.toEqual(
      expect.objectContaining({ contents: 'lifecycle text' })
    )
  })

  it('resolves null and clears active state on closeActive()', async () => {
    const view = createView()
    const frameEvents = renderFrameOf(view)
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const inputBox = mockMTextInputBoxInstances[0]

    expect(AcEdMTextEditor.closeActive()).toBe(true)
    await expect(settleWithin(promise, 500)).resolves.toBeNull()

    expect(inputBox.closeEditor).toHaveBeenCalledTimes(1)
    expect(inputBox.dispose).toHaveBeenCalledTimes(1)
    expect(inputBox.listenerCount('close')).toBe(0)
    expect(inputBox.listenerCount('change')).toBe(0)
    expect(inputBox.listenerCount('cursorMove')).toBe(0)
    expect(inputBox.listenerCount('selectionChange')).toBe(0)
    expect(frameEvents.addEventListener).toHaveBeenCalledTimes(1)
    expect(frameEvents.removeEventListener).toHaveBeenCalledTimes(1)
    expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
    // Nothing is registered any more, so a repeated call is a no-op.
    expect(AcEdMTextEditor.closeActive()).toBe(false)

    // Released handlers stay released: the disposed box cannot dirty the view.
    view.isDirty = false
    inputBox.emit('change')
    expect(view.isDirty).toBe(false)
  })

  it('resolves null when the caller cancels through the active editor handle', async () => {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const handle = AcEdMTextEditor.getActiveEditor()
    const inputBox = mockMTextInputBoxInstances[0]

    expect(handle).not.toBeNull()
    handle?.forceClose()
    await expect(settleWithin(promise, 500)).resolves.toBeNull()

    expect(inputBox.dispose).toHaveBeenCalledTimes(1)
    expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
    // The session is gone, so no new handle is handed out.
    expect(AcEdMTextEditor.getActiveEditor()).toBeNull()
  })

  it('keeps a stale handle from closing the session that replaced it', async () => {
    const view = createView()
    const firstPromise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const staleHandle = AcEdMTextEditor.getActiveEditor()
    const secondPromise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 1, y: 1, z: 0 },
      width: 10,
      textHeight: 2
    })
    const secondBox = mockMTextInputBoxInstances[1]

    await expect(settleWithin(firstPromise, 500)).resolves.toBeNull()
    staleHandle?.forceClose()

    // Cancelling the finished session must leave the live one untouched.
    expect(AcEdMTextEditor.getActiveInputBox()).toBe(secondBox)
    expect(secondBox.dispose).not.toHaveBeenCalled()

    secondBox.emit('close')
    await expect(secondPromise).resolves.toEqual(
      expect.objectContaining({ contents: 'lifecycle text' })
    )
  })

  it('reports the layout width and the caller-owned committed width', async () => {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      // Sub-unit pick: the input box must lay out with at least 1 world unit.
      width: 0.25,
      // DXF group 41 belongs to the caller: the layout floor must never leak
      // into the persisted width.
      committedWidth: 4,
      textHeight: 2.5,
      initialAttachmentPoint: 5 as never,
      heightSource: 'box'
    })
    const inputBox = mockMTextInputBoxInstances[0]

    expect(inputBox.options.width).toBe(1)
    inputBox.emit('close')

    await expect(settleWithin(promise, 500)).resolves.toEqual({
      contents: 'lifecycle text',
      location: { x: 7, y: 8, z: 9 },
      width: 1,
      // The layout width and the persisted width are independent values.
      committedWidth: 4,
      height: 2.5,
      lineSpacingFactor: 1.25,
      attachmentPoint: 5,
      heightSource: 'box',
      committedHeight: 2.5
    })
  })

  it('keeps a committed width of 0 (no wrap) and the caller height verbatim', async () => {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 12,
      committedWidth: 0,
      textHeight: 0.5,
      heightSource: 'style'
    })
    mockMTextInputBoxInstances[0].emit('close')

    const result = await settleWithin(promise, 500)
    // `0` is DXF group 41 "no wrap" and must survive; the layout width does not
    // replace it.
    expect(result?.committedWidth).toBe(0)
    expect(result?.width).toBe(12)
    // A height below 1 world unit is authored data, not a mistake to fix up.
    expect(result?.height).toBe(0.5)
    expect(result?.committedHeight).toBe(0.5)
    expect(result?.heightSource).toBe('style')
  })

  it('falls back to the documented single-spacing factor when the box reports none', async () => {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const inputBox = mockMTextInputBoxInstances[0]
    // The editor reads the factor only while building the result, so the runtime
    // getter is the only way to observe the fallback. Both reads report no
    // factor, which is what an input box without line-spacing support does.
    inputBox.getLineSpacingFactor.mockReturnValueOnce(undefined)
    inputBox.getLineSpacingFactor.mockReturnValueOnce(undefined)

    inputBox.emit('close')

    const result = await settleWithin(promise, 500)
    expect(result?.lineSpacingFactor).toBe(
      AcEdMTextEditor.defaultLineSpacingFactor
    )
    // DXF group 44 is expressed relative to single spacing.
    expect(AcEdMTextEditor.defaultLineSpacingFactor).toBe(1)
  })

  it('omits the optional height fields when the caller did not state an origin', async () => {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    mockMTextInputBoxInstances[0].emit('close')

    const result = await settleWithin(promise, 500)
    expect(result).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(result, 'heightSource')).toBe(
      false
    )
    expect(
      Object.prototype.hasOwnProperty.call(result, 'committedHeight')
    ).toBe(false)
  })

  it('does not stack view or sysvar listeners across repeated opens', async () => {
    const view = createView()
    const frameEvents = renderFrameOf(view)

    for (let i = 0; i < 3; i++) {
      const promise = new AcEdMTextEditor().open({
        view: view as never,
        location: { x: i, y: i, z: 0 },
        width: 10,
        textHeight: 2
      })
      mockMTextInputBoxInstances[i].emit('close')
      await settleWithin(promise, 500)
    }

    // One add and one remove per open: listeners never accumulate, so after
    // three full sessions nothing is left registered.
    expect(frameEvents.addEventListener).toHaveBeenCalledTimes(3)
    expect(frameEvents.removeEventListener).toHaveBeenCalledTimes(3)
    expect(mockSysVarChanged.addEventListener).toHaveBeenCalledTimes(3)
    expect(mockSysVarChanged.removeEventListener).toHaveBeenCalledTimes(3)

    const added = mockSysVarChanged.addEventListener.mock.calls.map(
      call => call[0]
    )
    const removed = mockSysVarChanged.removeEventListener.mock.calls.map(
      call => call[0]
    )
    // Each session registered its own handler exactly once and removed that
    // same handler on close.
    expect(new Set(added).size).toBe(3)
    expect(removed).toEqual(added)
    expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
  })

  it('releases the render frame subscription of the live session on close', async () => {
    const view = createView()
    const frameEvents = renderFrameOf(view)
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const inputBox = mockMTextInputBoxInstances[0]
    const onRenderFrame = frameEvents.addEventListener.mock.calls[0][0]

    mockMTextInputBoxInstances[0].emit('close')
    await settleWithin(promise, 500)

    expect(frameEvents.removeEventListener).toHaveBeenCalledWith(onRenderFrame)
    // The detached frame callback must not keep updating the disposed box.
    inputBox.update.mockClear()
    onRenderFrame()
    expect(inputBox.update).not.toHaveBeenCalled()
  })
})

describe('AcEdMTextEditor Escape handling', () => {
  let windowKeyListeners: WindowKeyListeners

  beforeEach(() => {
    mockMTextInputBoxInstances.length = 0
    windowKeyListeners = installWindowKeyListeners()
  })

  afterEach(() => {
    AcEdMTextEditor.closeActive()
    windowKeyListeners.restore()
  })

  it('cancels for Escape from the editor own IME textarea', async () => {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const inputBox = mockMTextInputBoxInstances[0]

    // The library focuses a hidden `<textarea>` it appends to the document body
    // (`attachImeBridge`), so that element - not the canvas - is the target of a
    // real key event. It is `TEXTAREA`-tagged, so the foreign-control exemption
    // must not treat the editor's own keyboard focus as somebody else's; the
    // canvas target is covered by its own case below.
    inputBox.imeInput = { tagName: 'TEXTAREA' }

    // The library funnels its Escape handling and a click outside the box
    // through one `closeEditor()`/`close` pair, so Escape reaches the editor as
    // a plain `close`. The editor therefore has to claim the key itself in the
    // capture phase; without that, Escape resolves a full result and the mtext
    // command commits text the user just tried to discard.
    // A non-Escape key must not touch the session.
    dispatchWindowKeyDown('a', { target: inputBox.imeInput })
    expect(AcEdMTextEditor.getActiveInputBox()).toBe(inputBox)

    dispatchWindowKeyDown('Escape', { target: inputBox.imeInput })
    await expect(settleWithin(promise, 500)).resolves.toBeNull()
    expect(inputBox.dispose).toHaveBeenCalledTimes(1)
    expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
    // The session's own Escape claim is released with it. Asserted on the
    // registry rather than on a second close attempt: a leaked listener would
    // find the session already finished and be a no-op, which hides the leak.
    expect(windowKeyListeners.count()).toBe(0)

    // A later Escape cannot reach the disposed box either.
    dispatchWindowKeyDown('Escape', { target: inputBox.imeInput })
    expect(inputBox.closeEditor).toHaveBeenCalledTimes(1)
  })

  /**
   * Opens a session against the fake window and reports what a key press did.
   *
   * `settled` is sampled with a real timer after the dispatch, so "did not
   * settle" is a positive observation instead of an assertion that never ran.
   *
   * @param key - Value of `event.key` for the press.
   * @param options - Guards to set; `target` may be {@link canvasOfView}, which
   * resolves the session's own canvas element.
   */
  async function pressKey(
    key: string,
    options: KeyEventOptions & { target?: unknown | typeof canvasOfView } = {}
  ): Promise<{
    inputBox: MockMTextInputBox
    settled: AcEdMTextEditorResult | null | typeof PENDING
  }> {
    const view = createView()
    const promise = new AcEdMTextEditor().open({
      view: view as never,
      location: { x: 0, y: 0, z: 0 },
      width: 10,
      textHeight: 2
    })
    const inputBox = mockMTextInputBoxInstances[0]
    const target =
      options.target === canvasOfView ? canvasOfView(view) : options.target
    expect(windowKeyListeners.captureCount()).toBe(1)
    dispatchWindowKeyDown(key, { ...options, target })
    return {
      inputBox,
      settled: await settleStateWithin(promise, 20)
    }
  }

  /**
   * Asserts that a key press left the session open.
   *
   * The listener count is part of the assertion: the guard has to skip the key
   * without disturbing the binding it lives on.
   */
  function expectStillEditing(
    outcome: Awaited<ReturnType<typeof pressKey>>
  ): void {
    expect(outcome.settled).toBe(PENDING)
    expect(outcome.inputBox.closeEditor).not.toHaveBeenCalled()
    expect(outcome.inputBox.dispose).not.toHaveBeenCalled()
    expect(AcEdMTextEditor.getActiveInputBox()).toBe(outcome.inputBox)
    expect(windowKeyListeners.count()).toBe(1)
  }

  it('cancels when Escape targets the editor canvas', async () => {
    // The canvas is the editor's own `imeTarget`, so it is not a foreign
    // editable element even though it belongs to the host view.
    const outcome = await pressKey('Escape', {
      target: canvasOfView
    })

    expect(outcome.settled).toBeNull()
    expect(outcome.inputBox.dispose).toHaveBeenCalledTimes(1)
    expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
    expect(windowKeyListeners.count()).toBe(0)
  })

  it('leaves the session open while an IME is composing', async () => {
    // Escape while composing means "dismiss the candidate window"; the text is
    // still being typed, so settling here would discard the whole MTEXT.
    expectStillEditing(await pressKey('Escape', { isComposing: true }))
  })

  it('leaves the session open for the IME key code 229', async () => {
    // Browsers report composition through `keyCode 229` without always setting
    // `isComposing`, which is the shape the library guards for.
    expectStillEditing(await pressKey('Escape', { keyCode: 229 }))
  })

  it('leaves the session open for Escape in a foreign form control', async () => {
    // Reachable while the editor is open: the input box toolbar's font family
    // `<select>` and font size `<input>`, or a host's command line `<input>`.
    // Escape there belongs to that control, not to the MTEXT session.
    expectStillEditing(
      await pressKey('Escape', { target: { tagName: 'SELECT' } })
    )
  })

  it.each(['INPUT', 'TEXTAREA'])(
    'leaves the session open for Escape in a foreign %s',
    async tagName => {
      expectStillEditing(await pressKey('Escape', { target: { tagName } }))
    }
  )

  it('leaves the session open for Escape in a contenteditable host', async () => {
    expectStillEditing(
      await pressKey('Escape', { target: { isContentEditable: true } })
    )
  })

  it('leaves the session open when another handler already claimed Escape', async () => {
    // A capture listener runs before the control that owns the key, so it must
    // honour the flag the same way the library's own window handler does.
    expectStillEditing(await pressKey('Escape', { defaultPrevented: true }))
  })

  it('leaves the session open for a non-Escape key', async () => {
    // Every guard is untouched here: the key simply is not the one the capture
    // listener claims, so the session must stay open and stay bound.
    expectStillEditing(await pressKey('Enter'))
  })

  it('binds and releases its Escape claim in the capture phase only', async () => {
    const outcome = await pressKey('Escape')
    expect(outcome.settled).toBeNull()

    const captureAdds = windowKeyListeners.addEventListener.mock.calls.filter(
      call => call[0] === 'keydown' && call[2] === true
    )
    const captureRemoves =
      windowKeyListeners.removeEventListener.mock.calls.filter(
        call => call[0] === 'keydown' && call[2] === true
      )
    expect(captureAdds).toHaveLength(1)
    // Removing the same handler with the same phase is what actually unbinds
    // it; a mismatch would leave the listener registered forever.
    expect(captureRemoves).toEqual(captureAdds)
    expect(windowKeyListeners.count()).toBe(0)
  })
})

describe('AcEdMTextEditor session error handling', () => {
  afterEach(() => {
    AcEdMTextEditor.closeActive()
  })

  it('resolves null instead of rejecting when the input box cannot be built', async () => {
    const view = createView()
    const module = jest.requireMock('@mlightcad/mtext-input-box') as {
      MTextInputBox: new (options: Record<string, unknown>) => unknown
    }
    const original = module.MTextInputBox
    module.MTextInputBox = function ThrowingInputBox() {
      throw new Error('no canvas')
    } as unknown as new (options: Record<string, unknown>) => unknown

    try {
      await expect(
        settleWithin(
          new AcEdMTextEditor().open({
            view: view as never,
            location: { x: 0, y: 0, z: 0 },
            width: 10,
            textHeight: 2,
            // The hidden host is created before the input box throws, so this
            // also covers releasing it on a failed setup.
            toolbarEnabled: false
          }),
          500
        )
      ).resolves.toBeNull()
      // A failed setup leaves no half-open session behind.
      expect(AcEdMTextEditor.getActiveInputBox()).toBeNull()
      expect(AcEdMTextEditor.getActiveEditor()).toBeNull()
      // The hidden host is created before the input box throws, so this also
      // covers releasing it when the setup fails.
      const toolbarContainer = view.container.appendChild.mock.calls[0]?.[0] as
        | FakeElement
        | undefined
      expect(toolbarContainer?.remove).toHaveBeenCalledTimes(1)
    } finally {
      module.MTextInputBox = original
    }
  })
})

/** Fields the view's MTEXT edit path reads from and writes to the entity. */
interface FakeMTextFields {
  location: { x: number; y: number; z: number }
  contents: string
  width: number
  height: number
  lineSpacingFactor: number
  attachmentPoint: number
  styleName?: string
}

/** Entity shape `editMTextEntity` needs, including its write-transaction host. */
interface FakeMTextEntity extends FakeMTextFields {
  database: {
    isUndoRecording(): boolean
    runDatabaseEdit(label: string, fn: () => void): void
    openEntityForWrite(entity: FakeMTextEntity): FakeMTextEntity
    /** `$TEXTSTYLE` of the fake drawing. */
    textstyle: string
    tables: {
      textStyleTable: { resolveAt(name?: string): { name: string } | undefined }
    }
  }
}

/**
 * The `AcTrView2d` members a hand-built receiver has to provide.
 *
 * The scene hooks are mocks while the width/height/font resolution keeps
 * running for real, because those are inherited from the prototype.
 */
interface MTextEditTarget {
  removeEntity: jest.Mock
  addEntity: jest.Mock
  updateEntity: jest.Mock
  screenToWorld(point: { x: number; y: number }): { x: number; y: number }
  _isDirty: boolean
}

/**
 * Builds a receiver for the real `editMTextEntity` body.
 *
 * `Object.create` keeps the real prototype, so the editor width, text height
 * and toolbar-font resolution inside the method all run for real. Only the
 * scene-facing members are replaced: their real implementations need a WebGL
 * renderer, and `jest.config.ts` runs this suite in the `node` environment.
 */
function createMTextEditTarget(): MTextEditTarget {
  const target = Object.create(AcTrView2d.prototype) as MTextEditTarget
  target.removeEntity = jest.fn()
  target.addEntity = jest.fn()
  target.updateEntity = jest.fn()
  // Identity mapping: the screen-space fallback height passes through
  // unchanged, so a mismatch can never come from the fake camera.
  target.screenToWorld = ({ y }) => ({ x: 0, y })
  target._isDirty = false
  return target
}

/**
 * A `AcDbMText` stand-in the view's write path accepts.
 *
 * `editMTextEntity` narrows its write result with `instanceof AcDbMText`, so
 * this has to be an instance of the mocked class rather than a struct literal.
 */
function createEditedMText(): FakeMTextEntity {
  const { AcDbMText: MockAcDbMText } = jest.requireMock('@hy/data-model') as {
    AcDbMText: new () => FakeMTextFields
  }
  // Mirrors the real table's "name of the current style" lookup, so a test can
  // simulate the Format panel repointing `$TEXTSTYLE` mid-edit.
  const database: FakeMTextEntity['database'] = {
    // The real helper only needs the entity transaction to run the callback.
    isUndoRecording: () => false,
    runDatabaseEdit: (_label: string, fn: () => void) => fn(),
    openEntityForWrite: (entity: FakeMTextEntity) => entity,
    textstyle: 'Standard',
    tables: {
      textStyleTable: {
        resolveAt: () => ({ name: database.textstyle })
      }
    }
  }
  return Object.assign(new MockAcDbMText(), {
    database,
    location: { x: 1, y: 2, z: 0 },
    contents: 'before edit',
    width: 30,
    height: 2.5,
    lineSpacingFactor: 1,
    attachmentPoint: 1
  })
}

/** A successful editor result, as the real editor would hand it back. */
function createEditorResult(
  overrides: Partial<AcEdMTextEditorResult> = {}
): AcEdMTextEditorResult {
  return {
    contents: 'after edit',
    location: { x: 1, y: 2, z: 0 },
    width: 30,
    committedWidth: 30,
    height: 2.5,
    lineSpacingFactor: 1,
    attachmentPoint: 1 as AcEdMTextEditorResult['attachmentPoint'],
    ...overrides
  }
}

/**
 * Runs the real `editMTextEntity` body against a hand-built receiver.
 *
 * The method is reached through the prototype because no public entry point
 * exists without a constructed view: the double-click listener that calls it is
 * installed by the constructor.
 */
function runEditMTextEntity(
  target: MTextEditTarget,
  mtext: FakeMTextEntity
): Promise<void> {
  const method = (
    AcTrView2d.prototype as unknown as {
      editMTextEntity(
        this: MTextEditTarget,
        entity: FakeMTextEntity
      ): Promise<void>
    }
  ).editMTextEntity
  return method.call(target, mtext)
}

/**
 * Regression guard for the MTEXT double-click edit path of `AcTrView2d`.
 *
 * `editMTextEntity` hides the in-scene MTEXT while the inline editor owns the
 * text and restores it in a `finally`. The two restore entries are not
 * interchangeable: `addEntity` is fire-and-forget (it queues the entity for
 * conversion and leaves the current scene entry alone) while `updateEntity`
 * removes the scene entry first and then starts its own conversion, and
 * `AcTrBatchedGroup.addEntity` *accumulates* geometry for one objectId instead
 * of replacing it. Running both therefore renders the restored MTEXT - and its
 * selection box - twice, which is what a cancelled edit used to do.
 *
 * Both cancel-shaped outcomes (`null` result and empty contents) are the paths
 * that actually reach the buggy branch, so each gets its own case.
 *
 * Negative control: the pre-fix `finally` ran `this.addEntity(mtext)`
 * unconditionally and only then added `updateEntity` for `!applied`, so both
 * `expect(target.addEntity).not.toHaveBeenCalled()` assertions below fail on it.
 */
describe('AcTrView2d MTEXT edit restore path', () => {
  let openSpy: jest.SpyInstance

  beforeEach(() => {
    // The editor session itself is covered above; here only the result it
    // reports matters, so `open()` is replaced by a stub.
    openSpy = jest.spyOn(AcEdMTextEditor.prototype, 'open')
    mockShowMessage.mockReset()
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('restores a cancelled MTEXT through exactly one scene path', async () => {
    const target = createMTextEditTarget()
    const mtext = createEditedMText()
    openSpy.mockResolvedValue(null)

    await runEditMTextEntity(target, mtext)

    // The in-scene copy is hidden while the editor owns the text...
    expect(target.removeEntity).toHaveBeenCalledTimes(1)
    // ...and cancelling restores it through the clearing re-convert only:
    // queueing `addEntity` next to it would give the same objectId a second
    // geometry slot in the batched group.
    expect(target.updateEntity).toHaveBeenCalledTimes(1)
    expect(target.updateEntity).toHaveBeenCalledWith(mtext)
    expect(target.addEntity).not.toHaveBeenCalled()
    expect(target._isDirty).toBe(true)
    // A cancelled edit writes nothing.
    expect(mtext.contents).toBe('before edit')
  })

  it('restores the entity once when the editor returns empty contents', async () => {
    const target = createMTextEditTarget()
    const mtext = createEditedMText()
    openSpy.mockResolvedValue(createEditorResult({ contents: '  \n ' }))

    await runEditMTextEntity(target, mtext)

    expect(target.updateEntity).toHaveBeenCalledTimes(1)
    expect(target.addEntity).not.toHaveBeenCalled()
    // An empty payload must not overwrite the entity with invisible text.
    expect(mtext.contents).toBe('before edit')
    expect(mockShowMessage).toHaveBeenCalledWith(
      'jig.mtext.emptyContents',
      'warning'
    )
  })

  it('restores an applied edit through addEntity only', async () => {
    const target = createMTextEditTarget()
    const mtext = createEditedMText()
    openSpy.mockResolvedValue(createEditorResult())

    await runEditMTextEntity(target, mtext)

    // The entity was hidden before the editor opened, so the commit path queues
    // it back for conversion exactly once. Adding `updateEntity` on top would
    // convert the same objectId a second time and duplicate its geometry.
    expect(target.addEntity).toHaveBeenCalledTimes(1)
    expect(target.addEntity).toHaveBeenCalledWith(mtext)
    expect(target.updateEntity).not.toHaveBeenCalled()
    expect(mtext.contents).toBe('after edit')
    expect(mockShowMessage).not.toHaveBeenCalled()
  })

  it('adopts the text style the user picked while the edit was open', async () => {
    const target = createMTextEditTarget()
    const mtext = createEditedMText()
    openSpy.mockImplementation(async () => {
      // Exactly what the contextual Format panel does mid-edit.
      mtext.database.textstyle = 'HZ'
      return createEditorResult()
    })

    await runEditMTextEntity(target, mtext)

    // The in-place path has to reach the same conclusion as the create command:
    // an explicit style choice while editing is an object-level property.
    expect(mtext.styleName).toBe('HZ')
  })

  it('keeps the entity style when the edit did not change it', async () => {
    const target = createMTextEditTarget()
    const mtext = createEditedMText()
    // The entity uses a style that is not the drawing's current one.
    mtext.styleName = 'HZ'
    openSpy.mockResolvedValue(createEditorResult())

    await runEditMTextEntity(target, mtext)

    // Fixing a typo must not silently rewrite DXF group 7 to `$TEXTSTYLE`.
    expect(mtext.styleName).toBe('HZ')
  })

  it('rolls the text style back when the edit is cancelled', async () => {
    const target = createMTextEditTarget()
    const mtext = createEditedMText()
    openSpy.mockImplementation(async () => {
      mtext.database.textstyle = 'HZ'
      return null
    })

    await runEditMTextEntity(target, mtext)

    expect(mtext.database.textstyle).toBe('Standard')
  })
})

import { waitForCurrentDocument } from '../src/command/waitForDocument'

const mockEventBusListeners = new Map<string, Set<(...args: unknown[]) => void>>()

jest.mock('@mlightcad/cad-simple-viewer', () => ({
  AcApDocManager: {
    instance: {
      curDocument: null
    }
  },
  eventBus: {
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (!mockEventBusListeners.has(event)) {
        mockEventBusListeners.set(event, new Set())
      }
      mockEventBusListeners.get(event)?.add(listener)
    }),
    off: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      mockEventBusListeners.get(event)?.delete(listener)
    })
  }
}))

const mocked = jest.requireMock('@mlightcad/cad-simple-viewer') as {
  AcApDocManager: { instance: { curDocument: unknown } }
  eventBus: { on: jest.Mock; off: jest.Mock }
}

const emitFailedToOpen = (payload: unknown = {}): void => {
  for (const listener of mockEventBusListeners.get('failed-to-open-file') ?? []) {
    listener(payload)
  }
}

describe('waitForCurrentDocument', () => {
  const doc = { name: 'doc' }

  beforeEach(() => {
    jest.useFakeTimers()
    mocked.AcApDocManager.instance.curDocument = null
    mocked.eventBus.on.mockClear()
    mocked.eventBus.off.mockClear()
    mockEventBusListeners.clear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('resolves immediately when a document is already current', async () => {
    mocked.AcApDocManager.instance.curDocument = doc
    await expect(waitForCurrentDocument()).resolves.toBe(doc)
    expect(mocked.eventBus.on).not.toHaveBeenCalled()
  })

  it('resolves when the document appears during polling', async () => {
    const pending = waitForCurrentDocument()
    mocked.AcApDocManager.instance.curDocument = doc
    jest.advanceTimersByTime(200)
    await expect(pending).resolves.toBe(doc)
    expect(mocked.eventBus.off).toHaveBeenCalledWith(
      'failed-to-open-file',
      expect.any(Function)
    )
  })

  it('returns null early when the open attempt fails', async () => {
    const pending = waitForCurrentDocument()
    emitFailedToOpen({ fileName: 'broken.dxf' })
    await expect(pending).resolves.toBeNull()
    expect(mocked.eventBus.off).toHaveBeenCalledWith(
      'failed-to-open-file',
      expect.any(Function)
    )
  })

  it('returns null after the timeout without a document', async () => {
    const pending = waitForCurrentDocument(60000)
    jest.advanceTimersByTime(60000)
    await expect(pending).resolves.toBeNull()
  })

  it('stops polling and unsubscribes after it settles', async () => {
    const pending = waitForCurrentDocument()
    mocked.AcApDocManager.instance.curDocument = doc
    jest.advanceTimersByTime(200)
    await expect(pending).resolves.toBe(doc)

    // The success path is the only consumer of the failure listener.
    expect(mocked.eventBus.off).toHaveBeenCalledTimes(1)
    expect(mocked.eventBus.off).toHaveBeenCalledWith(
      'failed-to-open-file',
      expect.any(Function)
    )
  })

  it('ignores a late failure event after the document has resolved', async () => {
    const pending = waitForCurrentDocument()
    mocked.AcApDocManager.instance.curDocument = doc
    jest.advanceTimersByTime(200)
    await expect(pending).resolves.toBe(doc)

    // No listeners are left; emitting must not throw or re-open timers.
    expect(() => emitFailedToOpen({ fileName: 'late.dxf' })).not.toThrow()
    expect(mockEventBusListeners.get('failed-to-open-file')?.size ?? 0).toBe(0)
  })
})

import {
  AcDbBaseWorker,
  type AcDbWorkerTaskContext
} from '../src/converter/worker/AcDbBaseWorker'

/**
 * Regression cover for the chunked-wire stall.
 *
 * The base class owns `self.onmessage` for task dispatch, while a streaming
 * worker adds an `addEventListener('message')` channel for flow control
 * (chunk credits). A flow-control message has no `id`, so it must NOT be
 * dispatched as a task: doing so called `executeTask(undefined)` re-entrantly,
 * which threw *and* reset the streaming worker's credit waiters. The parked
 * producer promise was then orphaned and the stream never produced another
 * chunk — the drawing appeared to hang at ~11%.
 */

interface PostedMessage {
  id?: string
  type?: string
  success?: boolean
  data?: unknown
  error?: string
}

/** Minimal Worker global stand-in with both message channels. */
function installWorkerGlobal() {
  const flowControlListeners: Array<(event: { data: unknown }) => void> = []
  const posted: PostedMessage[] = []
  const scope = {
    onmessage: undefined as
      | ((event: { data: unknown }) => void)
      | undefined,
    postMessage: (message: PostedMessage) => {
      posted.push(message)
    },
    addEventListener: (
      _type: string,
      listener: (event: { data: unknown }) => void
    ) => {
      flowControlListeners.push(listener)
    },
    removeEventListener: () => {}
  }
  ;(globalThis as { self?: unknown }).self = scope

  return {
    posted,
    /**
     * Mirrors a real worker: `onmessage` (assigned in the base constructor)
     * runs before listeners registered later by the subclass.
     */
    dispatch(data: unknown) {
      scope.onmessage?.({ data })
      for (const listener of [...flowControlListeners]) listener({ data })
    }
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** Counts dispatches so re-entrant `executeTask` calls are visible. */
class CountingWorker extends AcDbBaseWorker<number, number> {
  calls: Array<number | undefined> = []

  protected async executeTask(input: number, _context: AcDbWorkerTaskContext) {
    this.calls.push(input)
    return input * 2
  }
}

/**
 * Mirrors `AcDbDxfParserWorker`: credit state lives in the call frame and is
 * only *routed* to by the flow-control listener.
 */
class StreamingWorker extends AcDbBaseWorker<number, string> {
  calls = 0
  private _activeStream?: { grantCredit: () => void }

  constructor() {
    super()
    ;(globalThis as { self?: unknown }).self
    ;(
      (globalThis as { self: { addEventListener: Function } }).self
    ).addEventListener('message', (event: { data?: { type?: string } }) => {
      if (event.data?.type === 'chunk-ack') this._activeStream?.grantCredit()
    })
  }

  protected async executeTask(input: number, _context: AcDbWorkerTaskContext) {
    this.calls += 1
    let credits = 0
    let waiters: Array<() => void> = []
    const grantCredit = () => {
      const waiter = waiters.shift()
      if (waiter) {
        waiter()
        return
      }
      credits += 1
    }
    const acquireCredit = (): Promise<void> => {
      if (credits > 0) {
        credits -= 1
        return Promise.resolve()
      }
      return new Promise<void>(resolve => {
        waiters.push(resolve)
      })
    }
    const stream = { grantCredit }
    this._activeStream = stream
    try {
      for (let index = 0; index < input; index++) await acquireCredit()
      return `done:${input}`
    } finally {
      if (this._activeStream === stream) this._activeStream = undefined
    }
  }
}

describe('AcDbBaseWorker message dispatch', () => {
  it('does not dispatch a flow-control message as a task', async () => {
    const harness = installWorkerGlobal()
    const worker = new CountingWorker()

    harness.dispatch({ type: 'chunk-ack' })
    await flush()

    expect(worker.calls).toEqual([])
    // No bogus error response for a message that was never a task.
    expect(harness.posted).toEqual([])
  })

  it('still dispatches a real task and answers with its id', async () => {
    const harness = installWorkerGlobal()
    const worker = new CountingWorker()

    harness.dispatch({ id: 't1', input: 21 })
    await flush()

    expect(worker.calls).toEqual([21])
    expect(harness.posted).toHaveLength(1)
    expect(harness.posted[0]).toMatchObject({ id: 't1', success: true, data: 42 })
  })

  it('keeps a parked streaming task alive across flow-control messages', async () => {
    const harness = installWorkerGlobal()
    const worker = new StreamingWorker()

    harness.dispatch({ id: 'stream', input: 3 })
    await flush()

    // The task parked waiting for credit; three acknowledgements must resume
    // it. If a flow-control message were dispatched as a task, `calls` would
    // exceed 1 and the parked waiter would be lost, hanging here.
    harness.dispatch({ type: 'chunk-ack' })
    harness.dispatch({ type: 'chunk-ack' })
    harness.dispatch({ type: 'chunk-ack' })
    await flush()

    expect(worker.calls).toBe(1)
    const responses = harness.posted.filter(m => m.id === 'stream')
    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({ success: true, data: 'done:3' })
    // Nothing answered on behalf of a flow-control message.
    expect(harness.posted.filter(m => m.id === undefined)).toEqual([])
  })
})

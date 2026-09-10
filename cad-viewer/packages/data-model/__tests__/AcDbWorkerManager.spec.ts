import {
  AcDbWorkerApi,
  AcDbWorkerManager,
  acdbCreateWorkerApi
} from '../src/converter/worker/AcDbWorkerManager'

class FakeWorker {
  static created = 0
  static terminated = 0
  /** Transfer list of the most recent `postMessage`. */
  static lastTransfers: Transferable[] = []
  /** Emulate a `postMessage` that fails before anything is cloned/moved. */
  static throwOnPostMessage = false
  private readonly listeners: Record<string, Array<(event: any) => void>> = {
    message: [],
    error: []
  }

  constructor(_url: string | URL) {
    FakeWorker.created += 1
  }

  addEventListener(type: 'message' | 'error', cb: (event: any) => void) {
    this.listeners[type].push(cb)
  }

  removeEventListener(type: 'message' | 'error', cb: (event: any) => void) {
    this.listeners[type] = this.listeners[type].filter(item => item !== cb)
  }

  postMessage(
    payload: { id: string; input: unknown },
    transfer?: Transferable[]
  ) {
    FakeWorker.lastTransfers = transfer ?? []
    if (FakeWorker.throwOnPostMessage) {
      throw new Error('Data cannot be cloned')
    }
    if (payload.input === 'trigger-error') {
      const evt = { message: 'boom' }
      this.listeners.error.forEach(cb => cb(evt))
      return
    }
    if (payload.input === 'no-response') {
      return
    }
    if (payload.input === 'fail-result') {
      const evt = {
        data: {
          id: payload.id,
          success: false,
          data: undefined,
          error: payload.input === 'fail-result' ? 'failed' : undefined
        }
      }
      this.listeners.message.forEach(cb => cb(evt))
      return
    }
    if (payload.input === 'fail-oom') {
      const evt = {
        data: {
          id: payload.id,
          success: false,
          error:
            "Failed to execute 'postMessage' on 'DedicatedWorkerGlobalScope': Data cannot be cloned, out of memory.",
          errorCode: 'worker_oom'
        }
      }
      this.listeners.message.forEach(cb => cb(evt))
      return
    }
    const evt = {
      data: {
        id: payload.id,
        success: true,
        data: payload.input
      }
    }
    this.listeners.message.forEach(cb => cb(evt))
  }

  terminate() {
    FakeWorker.terminated += 1
  }
}

describe('AcDbWorkerManager / AcDbWorkerApi', () => {
  const originalWorker = (globalThis as unknown as { Worker?: unknown }).Worker

  beforeEach(() => {
    ;(globalThis as unknown as { Worker: unknown }).Worker =
      FakeWorker as unknown
    FakeWorker.created = 0
    FakeWorker.terminated = 0
    FakeWorker.lastTransfers = []
    FakeWorker.throwOnPostMessage = false
  })

  afterAll(() => {
    ;(globalThis as unknown as { Worker?: unknown }).Worker = originalWorker
  })

  it('executes tasks and returns result/error payloads', async () => {
    const manager = new AcDbWorkerManager({
      workerUrl: 'mock-worker.js',
      timeout: 20,
      maxConcurrentWorkers: 1
    })

    expect(manager.detectWorkerSupport()).toBe(true)

    const ok = await manager.execute<string, string>('hello')
    expect(ok.success).toBe(true)
    expect(ok.data).toBe('hello')
    expect(ok.workerUnavailable).toBeUndefined()

    const failed = await manager.execute<string, string>('fail-result')
    expect(failed.success).toBe(false)
    expect(failed.error).toBe('failed')
    // A worker task answered, so the failure is not flagged as manager-level.
    expect(failed.workerUnavailable).toBeUndefined()

    const oom = await manager.execute<string, string>('fail-oom')
    expect(oom.success).toBe(false)
    expect(oom.errorCode).toBe('worker_oom')

    // A script error means no task ever answered: the failure is flagged as
    // manager-level and the dead worker is evicted (see the eviction test).
    const workerError = await manager.execute<string, string>('trigger-error')
    expect(workerError.success).toBe(false)
    expect(workerError.error).toContain('Worker error: boom')
    expect(workerError.workerUnavailable).toBe(true)

    const timeout = await manager.execute<string, string>('no-response')
    expect(timeout.success).toBe(false)
    expect(timeout.error).toContain('timed out')
    expect(timeout.workerUnavailable).toBe(true)

    manager.destroy()
    expect(manager.getStats().totalWorkers).toBe(0)
  })

  it('evicts a worker that never answered so the next task gets a fresh one', async () => {
    const manager = new AcDbWorkerManager({
      workerUrl: 'mock-worker.js',
      timeout: 20,
      maxConcurrentWorkers: 1
    })

    const ok = await manager.execute<string, string>('hello')
    expect(ok.success).toBe(true)
    expect(FakeWorker.created).toBe(1)
    // A settled task releases its worker, so the pooled one is reused.
    expect(manager.getStats().busyWorkers).toBe(0)

    await manager.execute<string, string>('trigger-error')
    // The dead worker is terminated and dropped instead of being handed to
    // the next task (which would post into the void and wait for the full
    // timeout).
    expect(FakeWorker.terminated).toBe(1)
    expect(manager.getStats().totalWorkers).toBe(0)

    const retry = await manager.execute<string, string>('hello')
    expect(retry.success).toBe(true)
    expect(FakeWorker.created).toBe(2)

    manager.destroy()
  })

  it('transfers Uint8Array view inputs instead of deep-copying them', async () => {
    const manager = new AcDbWorkerManager({
      workerUrl: 'mock-worker.js',
      timeout: 20,
      maxConcurrentWorkers: 1
    })

    const whole = new Uint8Array(new ArrayBuffer(16))
    await manager.execute<Uint8Array, string>(whole)
    expect(FakeWorker.lastTransfers).toEqual([whole.buffer])

    const raw = new ArrayBuffer(16)
    await manager.execute<ArrayBuffer, string>(raw)
    expect(FakeWorker.lastTransfers).toEqual([raw])

    // A partial view must not detach a buffer its owner still shares.
    const partial = new Uint8Array(new ArrayBuffer(16), 4, 8)
    await manager.execute<Uint8Array, string>(partial)
    expect(FakeWorker.lastTransfers).toEqual([])

    if (typeof SharedArrayBuffer !== 'undefined') {
      const shared = new Uint8Array(new SharedArrayBuffer(16))
      await manager.execute<Uint8Array, string>(shared)
      expect(FakeWorker.lastTransfers).toEqual([])
    }

    manager.destroy()
  })

  it('releases — without evicting — the worker when postMessage fails', async () => {
    const manager = new AcDbWorkerManager({
      workerUrl: 'mock-worker.js',
      timeout: 20,
      maxConcurrentWorkers: 1
    })
    FakeWorker.throwOnPostMessage = true

    const failed = await manager.execute<string, string>('hello')
    expect(failed.success).toBe(false)
    expect(failed.error).toContain('postMessage failed')
    expect(failed.workerUnavailable).toBe(true)
    // Serialization failures are input-specific: the worker stays in the pool
    // and is not left marked busy.
    expect(FakeWorker.terminated).toBe(0)
    expect(manager.getStats().totalWorkers).toBe(1)
    expect(manager.getStats().busyWorkers).toBe(0)
    expect(manager.getStats().pendingTasks).toBe(0)

    FakeWorker.throwOnPostMessage = false
    const retry = await manager.execute<string, string>('hello')
    expect(retry.success).toBe(true)

    manager.destroy()
  })

  it('reuses wrapper API', async () => {
    const api = new AcDbWorkerApi({ workerUrl: 'mock-worker.js' })
    const result = await api.execute<string, string>('wrapped')
    expect(result.success).toBe(true)
    expect(result.data).toBe('wrapped')

    const viaFactory = acdbCreateWorkerApi({ workerUrl: 'mock-worker.js' })
    expect(viaFactory.getStats().config.workerUrl).toBe('mock-worker.js')

    api.destroy()
    viaFactory.destroy()
  })

  it('reports no support when Worker is unavailable', () => {
    ;(globalThis as unknown as { Worker?: unknown }).Worker = undefined
    const manager = new AcDbWorkerManager({ workerUrl: 'mock-worker.js' })
    expect(manager.detectWorkerSupport()).toBe(false)
    manager.destroy()
  })
})

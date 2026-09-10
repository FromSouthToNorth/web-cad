/**
 * Simple worker framework
 */

import type { AcDbWorkerErrorCode } from './AcDbBaseWorker'

export interface AcDbWorkerConfig {
  /** Worker script URL (required if useWorker is true) */
  workerUrl: string | URL
  /** Timeout for worker operations in milliseconds */
  timeout?: number
  /** Maximum number of concurrent workers */
  maxConcurrentWorkers?: number
}

export type { AcDbWorkerErrorCode } from './AcDbBaseWorker'

export interface AcDbWorkerResult<TOutput = unknown> {
  success: boolean
  data?: TOutput
  error?: string
  errorCode?: AcDbWorkerErrorCode
  /**
   * `true` when the manager observed the failure itself and no worker task
   * ever reported a result: worker construction/script load failure,
   * `postMessage` failure, timeout, or manager destruction.
   *
   * A plain `success: false` without this flag means a live worker answered
   * and rejected the task. The distinction matters for callers that transfer
   * their input: on an unavailable worker the bytes never committed, so the
   * caller may still fall back to another parse path.
   */
  workerUnavailable?: boolean
  duration: number
}

/**
 * Callback invoked with intermediate worker task progress (ratio in `[0, 1]`)
 * before the final {@link AcDbWorkerResult} settles.
 */
export type AcDbWorkerProgressCallback = (progress: number) => void

/**
 * Worker → main-thread message carrying one chunk of a streaming task.
 *
 * Chunks deliberately carry **no task id**: the parser worker is created with
 * `maxConcurrentWorkers: 1` and a chunk is only ever posted from inside the
 * task that is currently running on that worker, so the manager routes it
 * through the worker instance instead. Adding an id would require the worker
 * to learn its own task id, which the shared `AcDbBaseWorker` protocol does
 * not expose.
 */
export const ACDB_DXF_WORKER_CHUNK_MESSAGE = 'chunk'
/**
 * Main-thread → worker message granting one more chunk.
 *
 * This is the backpressure signal: the worker cannot produce chunk *n + 1*
 * until the consumer has taken chunk *n*. Without it a fast worker would run
 * far ahead of the semantic build and every chunk would accumulate on the
 * receiving thread, giving back the memory chunking is meant to save.
 */
export const ACDB_DXF_WORKER_CHUNK_ACK_MESSAGE = 'chunk-ack'
/** Main-thread → worker message telling it to stop producing chunks. */
export const ACDB_DXF_WORKER_CHUNK_STOP_MESSAGE = 'chunk-stop'

/**
 * Consumer-side handle for a worker task that streams chunks before its final
 * {@link AcDbWorkerResult}.
 */
export interface AcDbWorkerChunkSession<TChunk = unknown> {
  /**
   * Resolves with the next chunk in stream order, or `undefined` once no more
   * will arrive (the task settled, failed, or {@link stop} was called).
   *
   * Calling this is what releases the worker to produce the following chunk,
   * so a consumer that stops early must call {@link stop} (or let the task
   * settle) instead of simply abandoning the session.
   */
  nextChunk(): Promise<TChunk | undefined>
  /** Tells the worker to stop streaming; the consumer will not read more. */
  stop(): void
}

/**
 * Order-preserving chunk queue with a one-chunk window.
 *
 * `nextChunk()` grants a credit each time it hands out a chunk, so the
 * producer is allowed exactly one chunk ahead of the consumer: at most the
 * chunk being consumed plus one queued chunk stay resident on this thread.
 */
class AcDbWorkerChunkQueue<TChunk> implements AcDbWorkerChunkSession<TChunk> {
  private _queue: TChunk[] = []
  private _waiters: Array<(chunk: TChunk | undefined) => void> = []
  private _ended = false

  constructor(private readonly _post: (message: unknown) => void) {}

  deliver(chunk: TChunk): void {
    if (this._ended) return
    const waiter = this._waiters.shift()
    if (waiter) {
      this._grant()
      waiter(chunk)
      return
    }
    this._queue.push(chunk)
  }

  /**
   * Ends the session and wakes every `nextChunk()` with `undefined`.
   *
   * Called both when the task settles and when it fails, so a consumer
   * blocked on a chunk can never hang: a failed stream ends and the caller
   * then observes the task result.
   *
   * Chunks that were delivered before the task settled are handed to the
   * waiters and otherwise **kept**: a worker that publishes its last chunk and
   * its final response back to back would otherwise have that chunk dropped by
   * the very message that ends the stream — a silent truncation.
   */
  end(): void {
    if (this._ended) return
    this._ended = true
    const waiters = this._waiters
    this._waiters = []
    for (const waiter of waiters) waiter(this._queue.shift())
  }

  nextChunk(): Promise<TChunk | undefined> {
    if (this._queue.length > 0) {
      const chunk = this._queue.shift()!
      this._grant()
      return Promise.resolve(chunk)
    }
    if (this._ended) return Promise.resolve(undefined)
    return new Promise(resolve => {
      this._waiters.push(resolve)
    })
  }

  stop(): void {
    if (this._ended) return
    this._post({ type: ACDB_DXF_WORKER_CHUNK_STOP_MESSAGE })
    this.end()
  }

  private _grant(): void {
    this._post({ type: ACDB_DXF_WORKER_CHUNK_ACK_MESSAGE })
  }
}

export interface AcDbWorkerInstance {
  worker: Worker
  isBusy: boolean
  id: string
  createdAt: Date
}

/**
 * Transfer list for a raw-bytes worker input.
 *
 * `postMessage` may only transfer `ArrayBuffer`s, never views, so an
 * `input instanceof ArrayBuffer` test is not enough: the equally common
 * `Uint8Array`-view shape silently falls back to a structured deep copy — a
 * second full copy of the drawing on the main thread. `Blob`/`File` inputs
 * need no entry here (structured clone shares their bytes rather than copying
 * them and a blob must not be detached) and `SharedArrayBuffer`-backed views
 * can never be transferred.
 *
 * A view is transferred only when it spans its whole buffer: moving a partial
 * view would detach a buffer the caller still shares with other views, so a
 * partial view keeps the copy semantics instead.
 *
 * @param input - Worker task input.
 * @returns Buffers to move to the worker; empty when a structured copy is
 * required.
 */
function acdbWorkerInputTransferables(input: unknown): Transferable[] {
  if (input instanceof ArrayBuffer) return [input]
  if (ArrayBuffer.isView(input)) {
    const buffer: ArrayBufferLike = input.buffer
    if (
      buffer instanceof ArrayBuffer &&
      input.byteOffset === 0 &&
      input.byteLength === buffer.byteLength
    ) {
      return [buffer]
    }
  }
  return []
}

/**
 * Simple worker framework
 */
export class AcDbWorkerManager {
  private config: Required<AcDbWorkerConfig>
  private taskId = 0
  private workers = new Map<string, AcDbWorkerInstance>()
  /**
   * Streaming session of the task currently running on each worker. Keyed by
   * the worker because chunk messages carry no task id (see
   * {@link ACDB_DXF_WORKER_CHUNK_MESSAGE}); a worker runs one task at a time.
   */
  private chunkQueues = new Map<Worker, AcDbWorkerChunkQueue<unknown>>()
  private pendingTasks = new Map<
    string,
    {
      resolve: (value: AcDbWorkerResult) => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
      onProgress?: AcDbWorkerProgressCallback
    }
  >()

  constructor(config: AcDbWorkerConfig) {
    this.config = {
      workerUrl: config.workerUrl,
      timeout: config.timeout ?? 30000,
      maxConcurrentWorkers: config.maxConcurrentWorkers ?? 4
    }
  }

  /**
   * Execute a task with worker support and fallback
   */
  async execute<TInput, TOutput>(
    input: TInput,
    workerUrl?: string,
    onProgress?: AcDbWorkerProgressCallback
  ): Promise<AcDbWorkerResult<TOutput>> {
    const startTime = Date.now()
    const taskId = this.generateTaskId()

    try {
      return await this.executeInWorker<TInput, TOutput>(
        taskId,
        input,
        workerUrl || this.config.workerUrl,
        onProgress
      )
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : String(error)
      // Only manager-level failures reject; a task the worker answered with
      // `success: false` resolves above. So this result always means "no
      // worker task produced a result".
      return {
        success: false,
        error: message,
        errorCode: message.toLowerCase().includes('timed out')
          ? 'worker_timeout'
          : 'worker_error',
        workerUnavailable: true,
        duration
      }
    }
  }

  /**
   * Starts a task that publishes intermediate chunks before its final result.
   *
   * The session must be drained with {@link AcDbWorkerChunkSession.nextChunk}
   * (that call is what lets the worker produce more) and {@link
   * AcDbWorkerChunkSession.stop}ped when the consumer is done early. The task
   * itself is not awaited here: `result` settles independently so a consumer
   * can build on the first chunk while the worker is still tokenizing.
   */
  executeStreaming<TInput, TOutput, TChunk = unknown>(
    input: TInput,
    workerUrl?: string,
    onProgress?: AcDbWorkerProgressCallback
  ): {
    session: AcDbWorkerChunkSession<TChunk>
    result: Promise<AcDbWorkerResult<TOutput>>
  } {
    const taskId = this.generateTaskId()
    const startTime = Date.now()
    let session: AcDbWorkerChunkQueue<TChunk> | undefined
    const result = this.executeInWorker<TInput, TOutput>(
      taskId,
      input,
      workerUrl || this.config.workerUrl,
      onProgress,
      queue => {
        session = queue as AcDbWorkerChunkQueue<TChunk>
      }
    ).catch(
      // Mirror `execute`: a manager-level failure resolves as an unavailable
      // worker instead of rejecting, so the consumer has one settlement shape
      // to handle and no unhandled rejection window while it pulls chunks.
      (error: unknown): AcDbWorkerResult<TOutput> => {
        const message = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: message,
          errorCode: message.toLowerCase().includes('timed out')
            ? 'worker_timeout'
            : 'worker_error',
          workerUnavailable: true,
          duration: Date.now() - startTime
        }
      }
    )
    // `executeInWorker` installs the queue synchronously inside its promise
    // executor, so `session` is already set — unless worker construction threw
    // before that point, in which case an already-ended session keeps the
    // consumer from hanging until `result` rejects.
    return {
      session: session ?? {
        nextChunk: () => Promise.resolve(undefined),
        stop: () => undefined
      },
      result
    }
  }

  /**
   * Execute task in web worker
   */
  private async executeInWorker<TInput, TOutput>(
    taskId: string,
    input: TInput,
    workerUrl: string | URL,
    onProgress?: AcDbWorkerProgressCallback,
    installChunkQueue?: (queue: AcDbWorkerChunkQueue<unknown>) => void
  ): Promise<AcDbWorkerResult<TOutput>> {
    const startTime = Date.now()

    return new Promise<AcDbWorkerResult<TOutput>>((resolve, reject) => {
      // Get or create worker
      const worker = this.getAvailableWorker(workerUrl)
      const chunkQueue = installChunkQueue
        ? new AcDbWorkerChunkQueue<unknown>(message =>
            worker.postMessage(message)
          )
        : undefined
      if (chunkQueue) {
        this.chunkQueues.set(worker, chunkQueue)
        installChunkQueue!(chunkQueue)
      }
      const endChunkQueue = () => {
        if (!chunkQueue) return
        if (this.chunkQueues.get(worker) === chunkQueue) {
          this.chunkQueues.delete(worker)
        }
        chunkQueue.end()
      }

      // Set up message handler
      const messageHandler = (event: MessageEvent) => {
        const { id, type, success, data, error, errorCode } = event.data

        // A streamed chunk belongs to whichever task is running on this
        // worker; it is not a settlement, so it must be handled before the
        // task-id filter below.
        if (type === ACDB_DXF_WORKER_CHUNK_MESSAGE) {
          this.chunkQueues.get(worker)?.deliver(event.data.chunk)
          return
        }

        if (id !== taskId) return

        // Intermediate progress notification — task stays pending.
        if (type === 'progress') {
          const task = this.pendingTasks.get(taskId)
          task?.onProgress?.(event.data.progress)
          return
        }

        const task = this.cleanupTask(taskId)
        this.detachTaskHandlers(worker, messageHandler, errorHandler)
        endChunkQueue()

        const duration = Date.now() - startTime
        if (success) {
          task?.resolve({
            success: true,
            data: data as TOutput,
            duration
          })
        } else {
          task?.resolve({
            success: false,
            error,
            errorCode,
            duration
          })
        }
      }

      const errorHandler = (error: ErrorEvent) => {
        const task = this.cleanupTask(taskId)
        this.detachTaskHandlers(worker, messageHandler, errorHandler)
        endChunkQueue()
        // A worker that reported a script error (bundle 404, crash) is dead:
        // leaving it in the pool made every later task post into the void and
        // wait for the full timeout.
        this.evictWorker(worker)
        task?.reject(new Error(`Worker error: ${error.message}`))
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.cleanupTask(taskId)
        this.detachTaskHandlers(worker, messageHandler, errorHandler)
        endChunkQueue()
        // A timed-out task may still be consuming the transferred bytes, so
        // the worker is terminated rather than handed to the next task.
        this.evictWorker(worker)
        reject(
          new Error(`Worker operation timed out after ${this.config.timeout}ms`)
        )
      }, this.config.timeout)

      // Store task. The stored resolve/reject are the settling path: they
      // release the worker back to the pool as well.
      this.pendingTasks.set(taskId, {
        resolve: result => {
          this.cleanupTask(taskId)
          this.releaseWorker(worker)
          resolve(result as AcDbWorkerResult<TOutput>)
        },
        reject: error => {
          this.cleanupTask(taskId)
          this.releaseWorker(worker)
          reject(error)
        },
        timeout,
        onProgress
      })

      worker.addEventListener('message', messageHandler)
      worker.addEventListener('error', errorHandler)

      // Zero-copy raw-bytes inputs into the worker (DXF/DWG file bytes).
      const message = { id: taskId, input }
      const transferables = acdbWorkerInputTransferables(input)
      try {
        if (transferables.length > 0) {
          worker.postMessage(message, transferables)
        } else {
          worker.postMessage(message)
        }
      } catch (error) {
        // The clone/transfer never committed, so the input is still owned by
        // the caller and another parse path can still read it. Serialization
        // failures are input-specific, so the worker itself is only released,
        // not evicted.
        const task = this.cleanupTask(taskId)
        this.detachTaskHandlers(worker, messageHandler, errorHandler)
        endChunkQueue()
        task?.reject(
          new Error(
            `Worker postMessage failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      }
    })
  }

  /**
   * Removes a settled task's listeners from `worker`.
   *
   * Worker instances outlive tasks (the DXF parser worker is cached across
   * reads), so per-task handlers left behind accumulate one closure per task
   * for the lifetime of the worker.
   *
   * @param worker - Worker the task ran on.
   * @param messageHandler - Handler registered for `message`.
   * @param errorHandler - Handler registered for `error`.
   */
  private detachTaskHandlers(
    worker: Worker,
    messageHandler: (event: MessageEvent) => void,
    errorHandler: (error: ErrorEvent) => void
  ): void {
    worker.removeEventListener('message', messageHandler)
    worker.removeEventListener('error', errorHandler)
  }

  /**
   * Terminates `worker` and drops it from the pool.
   *
   * A worker that reported a script error or timed out is not reusable, and
   * `maxConcurrentWorkers: 1` (the DXF parser) would otherwise keep handing
   * that dead worker to every following task.
   *
   * @param worker - Worker to terminate and forget.
   */
  private evictWorker(worker: Worker): void {
    for (const [id, instance] of this.workers) {
      if (instance.worker === worker) {
        this.workers.delete(id)
        break
      }
    }
    worker.terminate()
  }

  /**
   * Clean up a pending task and hand its entry back to the settler.
   *
   * @param taskId - Task identifier.
   * @returns The removed entry, or `undefined` when it already settled.
   */
  private cleanupTask(taskId: string) {
    const task = this.pendingTasks.get(taskId)
    if (!task) return undefined
    clearTimeout(task.timeout)
    this.pendingTasks.delete(taskId)
    return task
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${++this.taskId}_${Date.now()}`
  }

  /**
   * Detect if web workers are supported
   */
  detectWorkerSupport(): boolean {
    return typeof Worker !== 'undefined'
  }

  /**
   * Get an available worker or create a new one
   */
  private getAvailableWorker(workerUrl: string | URL): Worker {
    // Find available worker
    for (const [_id, instance] of this.workers) {
      if (!instance.isBusy) {
        instance.isBusy = true
        return instance.worker
      }
    }

    // Create new worker if under limit
    if (this.workers.size < this.config.maxConcurrentWorkers) {
      const worker = new Worker(workerUrl, { type: 'module' })
      const id = this.generateWorkerId()
      const instance: AcDbWorkerInstance = {
        worker,
        isBusy: true,
        id,
        createdAt: new Date()
      }
      this.workers.set(id, instance)
      return worker
    }

    // Reuse oldest worker
    const oldestWorker = Array.from(this.workers.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )[0]

    oldestWorker.isBusy = true
    return oldestWorker.worker
  }

  /**
   * Release a worker back to the pool
   */
  private releaseWorker(worker: Worker): void {
    for (const [_id, instance] of this.workers) {
      if (instance.worker === worker) {
        instance.isBusy = false
        break
      }
    }
  }

  /**
   * Generate unique worker ID
   */
  private generateWorkerId(): string {
    return `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get framework statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.size,
      busyWorkers: Array.from(this.workers.values()).filter(w => w.isBusy)
        .length,
      pendingTasks: this.pendingTasks.size,
      config: this.config
    }
  }

  /**
   * Clean up all pending tasks and workers
   */
  destroy(): void {
    // Clear all pending requests
    for (const [_taskId, task] of this.pendingTasks) {
      clearTimeout(task.timeout)
      task.reject(new Error('Framework destroyed'))
    }
    this.pendingTasks.clear()

    // Wake every consumer blocked on a chunk before the worker disappears.
    for (const queue of this.chunkQueues.values()) {
      queue.end()
    }
    this.chunkQueues.clear()

    // Terminate all workers
    for (const [_id, instance] of this.workers) {
      instance.worker.terminate()
    }
    this.workers.clear()
  }
}

/**
 * Simple API for executing tasks with worker support
 */
export class AcDbWorkerApi {
  private framework: AcDbWorkerManager

  constructor(config: AcDbWorkerConfig) {
    this.framework = new AcDbWorkerManager(config)
  }

  /**
   * Execute a task with optional worker support
   */
  async execute<TInput, TOutput>(
    input: TInput,
    workerUrl?: string,
    onProgress?: AcDbWorkerProgressCallback
  ): Promise<AcDbWorkerResult<TOutput>> {
    return this.framework.execute(input, workerUrl, onProgress)
  }

  /**
   * Streaming variant of {@link execute}. See
   * {@link AcDbWorkerManager.executeStreaming}.
   */
  executeStreaming<TInput, TOutput, TChunk = unknown>(
    input: TInput,
    workerUrl?: string,
    onProgress?: AcDbWorkerProgressCallback
  ): {
    session: AcDbWorkerChunkSession<TChunk>
    result: Promise<AcDbWorkerResult<TOutput>>
  } {
    return this.framework.executeStreaming<TInput, TOutput, TChunk>(
      input,
      workerUrl,
      onProgress
    )
  }

  /**
   * Get framework statistics
   */
  getStats() {
    return this.framework.getStats()
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.framework.destroy()
  }
}

/**
 * Create a worker API instance
 */
export function acdbCreateWorkerApi(config: AcDbWorkerConfig): AcDbWorkerApi {
  return new AcDbWorkerApi(config)
}

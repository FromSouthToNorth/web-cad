/// <reference lib="webworker" />

import { acdbCreateDxfPairReader } from '../base/AcDbDxfPairReader'
import {
  ACDB_DXF_WIRE_CHUNK_BYTES,
  acdbDrainDxfPairs,
  acdbDrainDxfPairsChunked,
  type AcDbDxfPairWireData,
  acdbDxfPairWireTransferables,
  acdbDxfWireChunking
} from '../base/AcDbDxfPairWire'
import {
  AcDbBaseWorker,
  type AcDbWorkerTaskContext
} from '../converter/worker/AcDbBaseWorker'
import {
  ACDB_DXF_WORKER_CHUNK_ACK_MESSAGE,
  ACDB_DXF_WORKER_CHUNK_MESSAGE,
  ACDB_DXF_WORKER_CHUNK_STOP_MESSAGE
} from '../converter/worker/AcDbWorkerManager'

/**
 * Final response payload of a chunked tokenize task.
 *
 * The pairs themselves were already delivered by the `chunk` messages; this
 * only reports the totals. Distinguished from a whole-wire result by its
 * `mode` field, so a main-thread bundle and a worker bundle built with a
 * different {@link acdbDxfWireChunking} value still agree on which protocol
 * was used.
 */
export interface AcDbDxfParserWorkerChunkSummary {
  mode: 'chunked'
  kind: 'ascii' | 'binary'
  /** Total pairs published across every chunk. */
  count: number
  chunkCount: number
}

export type AcDbDxfParserWorkerResult =
  | AcDbDxfPairWireData
  | AcDbDxfParserWorkerChunkSummary

/**
 * DXF tokenize worker.
 *
 * Turns raw DXF bytes (ASCII or binary) into a drained, transferable pair
 * stream ({@link AcDbDxfPairWireData}). Semantic work — building tables,
 * entities, and the database — stays on the main thread, which replays the
 * pairs through the same filer/document-reader pipeline used for main-thread
 * parsing.
 *
 * The stream is delivered **chunk by chunk** (see
 * `acdbDrainDxfPairsChunked`), and the worker only produces the next chunk
 * after the main thread has granted a credit for it. Without that
 * backpressure the worker would finish far ahead of the (slower) semantic
 * build and the whole 66 MiB wire would pile up on the main thread anyway,
 * which is exactly the residency P1-10 removes.
 */
class AcDbDxfParserWorker extends AcDbBaseWorker<
  ArrayBuffer,
  AcDbDxfParserWorkerResult
> {
  /**
   * Flow-control handle of the stream currently being produced, if any.
   *
   * The credit counters themselves live in `executeTask`'s call frame: a
   * stray message must not be able to reset them and orphan a parked credit
   * waiter, which would stall the stream forever. This field only *routes* an
   * acknowledgement to that frame.
   */
  private _activeStream?: {
    grantCredit: () => void
    requestStop: () => void
  }

  constructor() {
    super()
    // The base class owns `self.onmessage` (task dispatch) and ignores
    // non-task messages. This extra listener carries the main thread's
    // flow-control messages; the two coexist, and flow-control messages
    // arrive between tasks.
    self.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string } | undefined
      if (!data) return
      if (data.type === ACDB_DXF_WORKER_CHUNK_ACK_MESSAGE) {
        this._activeStream?.grantCredit()
      } else if (data.type === ACDB_DXF_WORKER_CHUNK_STOP_MESSAGE) {
        this._activeStream?.requestStop()
      }
    })
  }

  protected async executeTask(
    input: ArrayBuffer,
    context: AcDbWorkerTaskContext
  ): Promise<AcDbDxfParserWorkerResult> {
    const reader = acdbCreateDxfPairReader(input)

    // Rollback path: one whole wire in one message, the pre-P1-10 protocol.
    if (!acdbDxfWireChunking.enabled) {
      return acdbDrainDxfPairs(reader, {
        totalBytes: input.byteLength,
        onProgress: ratio => context.reportProgress(ratio)
      })
    }

    // The first chunk needs no round trip; every later one is paid for by the
    // consumer when it starts using the previous chunk.
    let credits = 1
    let stopRequested = false
    let waiters: Array<(keepGoing: boolean) => void> = []

    const grantCredit = () => {
      // A credit is either handed straight to a parked producer or banked —
      // never both: doing both let one acknowledgement release two chunks and
      // silently widened the window that bounds the resident wire.
      const waiter = waiters.shift()
      if (waiter) {
        waiter(true)
        return
      }
      credits += 1
    }

    const requestStop = () => {
      stopRequested = true
      const pending = waiters
      waiters = []
      for (const waiter of pending) waiter(false)
    }

    /**
     * @returns `true` to keep draining, `false` when the consumer stopped.
     */
    const acquireCredit = (): Promise<boolean> => {
      if (stopRequested) return Promise.resolve(false)
      if (credits > 0) {
        credits -= 1
        return Promise.resolve(true)
      }
      return new Promise(resolve => {
        waiters.push(resolve)
      })
    }

    const stream = { grantCredit, requestStop }
    this._activeStream = stream
    try {
      const summary = await acdbDrainDxfPairsChunked(reader, {
        totalBytes: input.byteLength,
        chunkBytes: ACDB_DXF_WIRE_CHUNK_BYTES,
        onProgress: ratio => context.reportProgress(ratio),
        onChunk: chunk => {
          self.postMessage(
            { type: ACDB_DXF_WORKER_CHUNK_MESSAGE, chunk },
            acdbDxfPairWireTransferables(chunk)
          )
        },
        awaitChunkCredit: acquireCredit
      })

      return {
        mode: 'chunked',
        kind: summary.kind,
        count: summary.count,
        chunkCount: summary.chunkCount
      }
    } finally {
      if (this._activeStream === stream) this._activeStream = undefined
    }
  }

  protected override getTransferables(data: AcDbDxfParserWorkerResult) {
    return 'mode' in data ? [] : acdbDxfPairWireTransferables(data)
  }
}

// Initialize the worker
new AcDbDxfParserWorker()

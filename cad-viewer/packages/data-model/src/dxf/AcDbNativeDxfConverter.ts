import {
  ACCM_DEFAULT_UI_YIELD_BUDGET_MS,
  AcCmUiYieldGate,
  accmYieldForPaint
} from '@hy/common'

import { AcDbDxfFiler } from '../base/AcDbDxfFiler'
import {
  type AcDbDxfPairChunkReader,
  type AcDbDxfPairWireChunk,
  type AcDbDxfPairWireData,
  acdbDxfWireChunking,
  acdbMakeDxfPairArrayReader,
  acdbMakeDxfPairChunkReader
} from '../base/AcDbDxfPairWire'
import {
  acdbCreateWorkerApi,
  type AcDbWorkerApi,
  type AcDbWorkerResult
} from '../converter/worker/AcDbWorkerManager'
import type { AcDbDatabase } from '../database/AcDbDatabase'
import {
  type AcDbConversionProgressCallback,
  AcDbDatabaseConverter,
  type AcDbDatabaseConverterConfig,
  type AcDbDatabaseConverterReadOptions
} from '../database/AcDbDatabaseConverter'
import { AcDbRenderingCache } from '../misc/AcDbRenderingCache'
import {
  ACDB_DXF_PARSE_ENTITY_BATCH_SIZE,
  ACDB_DXF_PARSE_YIELD_BUDGET_MS,
  AcDbDxfDocumentReader
} from './AcDbDxfDocumentReader'
// Type-only: importing the worker module for real would construct the worker
// class (and touch `self`) on the main thread.
import type { AcDbDxfParserWorkerResult } from './AcDbDxfParserWorker'

/**
 * Progress weights mirror typical open cost: a small PARSE slice, then most of
 * the bar for ENTITY add/render (same idea as the old converter where ENTITY
 * carried the largest step).
 */
const PARSE_START_PCT = 1
const PARSE_END_PCT = 18
/**
 * When tokenization runs in the parser worker, worker progress covers PARSE
 * up to this percentage; the semantic build (document reader) then covers
 * from here to {@link PARSE_END_PCT}.
 */
const TOKENIZE_END_PCT = 10
const ENTITY_START_PCT = 20
const ENTITY_END_PCT = 98

/** Default URL of the DXF parser worker bundle (`dxf-parser-worker.js`). */
const DEFAULT_DXF_PARSER_WORKER_URL = '/assets/dxf-parser-worker.js'

/**
 * Cached parser worker. `AcDbWorkerManager` pools workers per API instance, so
 * keeping the API (and its single worker) alive across reads reuses the warm
 * worker (bundle compile + JIT) instead of paying a cold start per open.
 */
interface AcDbParserWorkerEntry {
  /** Worker script URL the cached API was created for. */
  url: string
  /** Worker operation timeout the cached manager was built with. */
  timeoutMs: number
  /** Cached worker API. */
  api: AcDbWorkerApi
  /**
   * Whether a zero-byte readiness probe has been answered by this worker (see
   * {@link AcDbNativeDxfConverter.probeParserWorker}).
   */
  probed: boolean
}

/**
 * What {@link AcDbNativeDxfConverter.tokenizeInWorker} hands back to `read()`.
 *
 * Exactly one of `wire` / `reader` is set when the worker ran:
 * - `wire`: one whole transferable wire — either the pre-P1-10 single-message
 *   protocol, or a chunk stream that fit in a single chunk. Replayed by the
 *   original `acdbMakeDxfPairArrayReader`.
 * - `reader`: a chunk reader that pulls chunks from the worker session on
 *   demand; `stop` releases the worker early and `done` settles with the task
 *   result, which must be checked because a stream that ends early cannot be
 *   told apart from a truncated one without it.
 */
interface AcDbTokenizedPairs {
  wire?: AcDbDxfPairWireData
  reader?: AcDbDxfPairChunkReader
  stop?: () => void
  done?: Promise<AcDbWorkerResult<AcDbDxfParserWorkerResult>>
}

/**
 * Native DXF → database converter.
 *
 * Tokenization (bytes → typed group-code/value pairs) runs in a web worker
 * when `useWorker` is on and a `parserWorkerUrl` is reachable; the worker
 * posts back a drained, transferable pair stream. Semantic building —
 * {@link AcDbDxfDocumentReader} streaming pairs through {@link AcDbDxfFiler}
 * directly into {@link AcDbDatabase} — always runs on the main thread against
 * the same pipeline, so worker and main-thread parses are behavior-identical.
 *
 * Large streams are delivered in chunks (P1-10): the worker only produces the
 * next chunk once the main thread has consumed the previous one, so ≈2 chunks
 * (≈4 MiB) stay resident instead of the whole ≈66 MiB wire, and the semantic
 * build starts after the first chunk rather than after the whole drain.
 *
 * Fallback to main-thread tokenization covers every failure that happens
 * *before* the drawing bytes move: no `Worker` (Node), no worker URL, a
 * unusable worker detected by the readiness probe, or a failed
 * `postMessage`. The bytes are transferred (zero-copy, no `data.slice(0)`
 * copy), so once they are in the worker the main thread has nothing to
 * replay: a task failure after the transfer is reported as an error.
 *
 * Conversion stages: `START → PARSE → ENTITY → END`. The reader fills the
 * database quietly (entity-appended events batched); then the batch flushes so
 * the first draw happens after parse completes. Fonts are loaded on demand by
 * the mtext renderer when a font is first needed.
 *
 * Mid-PARSE progress, chunked ENTITY flush, and time-budgeted UI yields keep
 * the status bar / spinner responsive without stalling large files on
 * per-chunk `requestAnimationFrame` waits.
 */
export class AcDbNativeDxfConverter extends AcDbDatabaseConverter<null> {
  /**
   * Long-lived parser worker, keyed by URL.
   *
   * `AcDbWorkerManager` pools workers, but every `acdbCreateWorkerApi` starts
   * with an empty pool, so building one per `read()` means a fresh `new
   * Worker` + bundle fetch/compile + cold JIT on every file open. Keeping the
   * API (and therefore its worker) alive across reads reuses the warm worker.
   */
  private _parserWorker?: AcDbParserWorkerEntry

  constructor(config: AcDbDatabaseConverterConfig = {}) {
    super({
      parserWorkerUrl: DEFAULT_DXF_PARSER_WORKER_URL,
      ...config
    })
  }

  override async read(
    data: ArrayBuffer,
    db: AcDbDatabase,
    options: AcDbDatabaseConverterReadOptions = {}
  ) {
    // Drop block-render templates left over from the previous drawing.
    //
    // The base `read()` clears the cache from its completion hook
    // (`AcDbDatabaseConverter.onFinished`), which this override replaces, so
    // nothing would ever clear it on the native DXF path: stale templates
    // stayed reusable across drawings and the retired-template list grew
    // without bound. Clearing here — the point where `AcDbDatabase.read()` has
    // already run `db.clear()` for this open — leaves exactly the state the
    // base class produced (empty before the new drawing renders).
    AcDbRenderingCache.instance.clear()

    const { minimumChunkSize = 10, progress } = options

    this.progress = progress

    const emit = async (
      percentage: number,
      stage: Parameters<AcDbConversionProgressCallback>[1],
      status: Parameters<AcDbConversionProgressCallback>[2],
      stageData?: unknown
    ) => {
      if (!progress) return
      await progress(percentage, stage, status, stageData)
    }

    await emit(0, 'START', 'START')
    await emit(PARSE_START_PCT, 'PARSE', 'START')
    // Let the open-file overlay paint before sync-heavy parse work (once).
    await accmYieldForPaint()

    // Tokenize in the parser worker when configured; null means "run the
    // whole parse on the main thread" (no worker support or a worker that
    // proved unusable before the bytes moved).
    let tokenized: AcDbTokenizedPairs | null = await this.tokenizeInWorker(
      data,
      emit
    )

    // Suppress entityAppended (and related) until parse finishes so the viewer
    // does not worldDraw mid-stream while the open-file progress bar is still
    // in PARSE.
    db.beginEventBatch()
    let batchOpen = true
    try {
      let filer: AcDbDxfFiler | null = null
      let totalUnits: number
      let buildStartPct: number
      if (tokenized?.reader) {
        // Streamed wire: `position()` reports an interpolated *source* byte
        // offset, so progress units are source bytes even though the pairs
        // arrive in chunks of unknown total length.
        filer = AcDbDxfFiler.forReading(tokenized.reader, { database: db })
        totalUnits = data.byteLength
        buildStartPct = TOKENIZE_END_PCT
      } else if (tokenized?.wire) {
        // Replay worker-tokenized pairs; the array reader reports its pair
        // index as position, so progress units are pairs, not bytes.
        filer = AcDbDxfFiler.forReading(
          acdbMakeDxfPairArrayReader(tokenized.wire),
          { database: db }
        )
        totalUnits = tokenized.wire.count
        buildStartPct = TOKENIZE_END_PCT
      } else {
        filer = AcDbDxfFiler.fromBuffer(data, { database: db })
        totalUnits = data.byteLength
        buildStartPct = PARSE_START_PCT
      }

      let lastParsePct = buildStartPct
      const reader = new AcDbDxfDocumentReader(db, {
        // Parse slices are bounded by the time budget alone; the entity batch
        // is a fixed polling interval so a large `minimumChunkSize` (used
        // below for ENTITY drain chunks) can no longer inflate parse slices.
        entityBatchSize: ACDB_DXF_PARSE_ENTITY_BATCH_SIZE,
        yieldBudgetMs: ACDB_DXF_PARSE_YIELD_BUDGET_MS,
        totalBytes: totalUnits,
        onProgress: async ratio => {
          const pct = Math.min(
            PARSE_END_PCT - 1,
            buildStartPct +
              Math.floor(ratio * (PARSE_END_PCT - buildStartPct))
          )
          if (pct <= lastParsePct) return
          lastParsePct = pct
          await emit(pct, 'PARSE', 'IN-PROGRESS')
        }
      })
      let result: Awaited<ReturnType<typeof reader.read>>
      try {
        result = await reader.read(filer)
      } finally {
        // Release a worker that is still waiting for a chunk credit, and
        // surface a stream that ended early (worker failure) instead of
        // silently keeping the half-built database.
        tokenized?.stop?.()
      }
      if (tokenized?.done) {
        const settled = await tokenized.done
        if (!settled.success) {
          throw new Error(
            `DXF parser worker failed while streaming pairs (${
              settled.error ?? 'unknown error'
            }); the transfered input buffer cannot be re-parsed on the main thread.`
          )
        }
      }

      // The wire (≈66 MiB of typed arrays for a 112 MB drawing) is only
      // needed while the document reader replays it, and the filer is the last
      // thing holding it (through the pair-array reader's captured arrays).
      // Dropping both references here — before the chunked ENTITY flush and
      // the progressive render it feeds — keeps the wire out of what follows;
      // this async frame would otherwise pin it until `read()` returns.
      filer = null
      tokenized = null

      await emit(PARSE_END_PCT, 'PARSE', 'END', {
        unknownEntityCount: result.unknownEntityCount
      })

      await emit(ENTITY_START_PCT, 'ENTITY', 'START')
      const chunkSize = Math.max(1, minimumChunkSize || 200)
      let lastEntityPct = ENTITY_START_PCT
      const yieldGate = new AcCmUiYieldGate(ACCM_DEFAULT_UI_YIELD_BUDGET_MS)
      // Flush queued entityAppended in chunks while advancing most of the
      // open-file progress bar.
      await db.endEventBatchChunked(chunkSize, async (flushed, total) => {
        const pct =
          total <= 0
            ? ENTITY_END_PCT
            : Math.min(
                ENTITY_END_PCT,
                ENTITY_START_PCT +
                  Math.floor(
                    (flushed / total) * (ENTITY_END_PCT - ENTITY_START_PCT)
                  )
              )
        if (pct > lastEntityPct) {
          lastEntityPct = pct
          await emit(pct, 'ENTITY', 'IN-PROGRESS')
        }
        // Time-budgeted single-frame yield — not per progress percent.
        await yieldGate.maybeYield()
      })
      batchOpen = false
      await emit(ENTITY_END_PCT, 'ENTITY', 'END')

      await emit(100, 'END', 'END')
    } catch (error) {
      if (batchOpen) {
        db.endEventBatch()
      }
      throw error
    }
  }

  protected override async parse(_data: ArrayBuffer) {
    return { model: null, data: { unknownEntityCount: 0 } }
  }

  /**
   * Tokenizes DXF bytes in the parser worker and returns the drained pair
   * stream. Returns `null` when worker parsing is disabled or the worker
   * proved unusable *before* the bytes were transferred (Node or `Worker`
   * missing, failed readiness probe) so the caller can fall back to
   * main-thread tokenization.
   *
   * The ArrayBuffer is transferred to the worker (zero-copy). Both failure
   * modes that keep the bytes on the main thread — a worker that never
   * answered (probe/construction/`postMessage` failure) and a task failure
   * that left the buffer intact — fall back; once the buffer is detached, a
   * failed task is reported as an error because the source bytes are gone.
   */
  private async tokenizeInWorker(
    data: ArrayBuffer,
    emit: (
      percentage: number,
      stage: Parameters<AcDbConversionProgressCallback>[1],
      status: Parameters<AcDbConversionProgressCallback>[2],
      stageData?: unknown
    ) => Promise<void>
  ): Promise<AcDbTokenizedPairs | null> {
    const workerUrl = this.config.parserWorkerUrl
    if (!this.config.useWorker || !workerUrl) return null
    if (typeof Worker === 'undefined') return null

    const entry = this.acquireParserWorker(
      String(workerUrl),
      this.getParserWorkerTimeout(data)
    )
    if (!entry.probed && !(await this.probeParserWorker(entry))) {
      // The worker never answered the probe, so `data` was never transferred
      // and main-thread tokenization can still read it.
      return null
    }
    const api = entry.api

    let lastPct = PARSE_START_PCT
    const onProgress = (ratio: number) => {
      const pct = Math.min(
        TOKENIZE_END_PCT - 1,
        PARSE_START_PCT +
          Math.floor(ratio * (TOKENIZE_END_PCT - PARSE_START_PCT))
      )
      if (pct <= lastPct) return
      lastPct = pct
      // Progress is advisory; never let a listener error fail the parse.
      void emit(pct, 'PARSE', 'IN-PROGRESS').catch(() => undefined)
    }

    // Rollback path: the pre-P1-10 whole-wire protocol.
    if (!acdbDxfWireChunking.enabled) {
      const result = await api.execute<ArrayBuffer, AcDbDxfPairWireData>(
        // AcDbWorkerManager transfers ArrayBuffer inputs; the worker owns the
        // bytes after this call.
        data,
        undefined,
        onProgress
      )
      if (!result.success || !result.data) {
        return this.reportWorkerFailure(api, data, result.error)
      }
      return { wire: result.data }
    }

    const { session, result: done } = api.executeStreaming<
      ArrayBuffer,
      AcDbDxfParserWorkerResult,
      AcDbDxfPairWireChunk
    >(data, undefined, onProgress)

    const first = await session.nextChunk()
    if (!first) {
      // Nothing was streamed at all: the task failed before publishing a
      // chunk, which is the one failure the caller may still be able to
      // recover from on the main thread.
      const settled = await done
      return this.reportWorkerFailure(
        api,
        data,
        settled.error ?? 'no wire chunk was produced'
      )
    }

    if (first.last) {
      // The whole stream fit in one chunk (or the drawing is tiny): replay it
      // through the original array reader, so the common small-file case uses
      // exactly the pre-P1-10 code path. `done` still has to be checked — a
      // stream that ended early looks exactly like a complete one.
      return { wire: first, done }
    }

    const reader = acdbMakeDxfPairChunkReader(() => session.nextChunk())
    reader.pushChunk(first)
    return {
      reader,
      stop: () => session.stop(),
      done
    }
  }

  /**
   * Shared failure handling for both tokenize protocols.
   *
   * @returns `null` when main-thread tokenization can still read `data`, and
   * never returns otherwise (the drawing bytes were transferred away).
   */
  private reportWorkerFailure(
    api: AcDbWorkerApi,
    data: ArrayBuffer,
    reason: string | undefined
  ): null {
    const message = reason ?? 'unknown error'
    // Terminate the long-lived worker only now that the failure has been
    // read, so the error stays diagnosable. A failed worker must not be
    // reused: a timed-out task may still be consuming the transferred bytes.
    this.dropParserWorkerApi(api)
    if (data.byteLength === 0) {
      throw new Error(
        `DXF parser worker failed (${message}); ` +
          'the transferred input buffer cannot be parsed on the main thread.'
      )
    }
    console.warn(
      `DXF parser worker failed (${message}); ` +
        'falling back to main-thread parsing.'
    )
    return null
  }

  /**
   * Verifies a freshly created parser worker can load its bundle and answer
   * before the drawing bytes are handed over.
   *
   * The drawing bytes are transferred, which detaches the main thread's copy,
   * so a worker that turns out to be unusable (missing bundle, script error,
   * broken protocol) *after* the transfer leaves nothing to replay and the
   * open can only fail — the availability cliff a missing
   * `dxf-parser-worker.js` used to be. The probe posts a zero-byte tokenize
   * task first: it exercises the same bundle, message protocol, and worker
   * startup path, and it costs one message round trip per worker creation
   * (workers are reused across reads, so not per open).
   *
   * A failure the worker itself answered (`success: false` with the bytes
   * never involved) still proves the bundle is loaded and the protocol works,
   * so only a manager-level `workerUnavailable` failure rejects the worker.
   *
   * @param entry - Cached worker record to probe.
   * @returns `true` when the worker answered, `false` when it is unusable.
   */
  private async probeParserWorker(
    entry: AcDbParserWorkerEntry
  ): Promise<boolean> {
    const result = await entry.api.execute<ArrayBuffer, AcDbDxfPairWireData>(
      new ArrayBuffer(0)
    )
    if (result.success || !result.workerUnavailable) {
      entry.probed = true
      return true
    }
    console.warn(
      `DXF parser worker unavailable (${result.error ?? 'unknown error'}); ` +
        'falling back to main-thread parsing.'
    )
    this.dropParserWorkerApi(entry.api)
    return false
  }

  /**
   * Returns the parser worker record for `workerUrl`, reusing the cached warm
   * worker when possible.
   *
   * The worker operation timeout is fixed when the manager is created, so a
   * file that needs a longer timeout than the cached worker was built with
   * replaces it. Timeouts only grow with input size
   * ({@link AcDbDatabaseConverter.getParserWorkerTimeout}), so this is at most
   * one cold start when a larger drawing is opened after a smaller one.
   *
   * @param workerUrl - Parser worker script URL (also the cache key).
   * @param timeoutMs - Worker operation timeout this read needs.
   * @returns Cached or freshly created worker record (unprobed when new).
   */
  private acquireParserWorker(
    workerUrl: string,
    timeoutMs: number
  ): AcDbParserWorkerEntry {
    const cached = this._parserWorker
    if (cached && cached.url === workerUrl && cached.timeoutMs >= timeoutMs) {
      return cached
    }
    cached?.api.destroy()
    const api = acdbCreateWorkerApi({
      workerUrl,
      timeout: timeoutMs,
      // One concurrent worker needed for parser
      maxConcurrentWorkers: 1
    })
    this._parserWorker = { url: workerUrl, timeoutMs, api, probed: false }
    return this._parserWorker
  }

  /**
   * Drops `api` from the cache and terminates its worker.
   *
   * A failed worker is never reused: a timed-out task can still be consuming
   * the transferred bytes, so the next read must start from a fresh worker.
   *
   * @param api - Worker API that just failed a task.
   */
  private dropParserWorkerApi(api: AcDbWorkerApi) {
    if (this._parserWorker?.api === api) {
      this._parserWorker = undefined
    }
    api.destroy()
  }
}

import { AcDbDxfFiler, acdbHostApplicationServices } from '../src/base'
import type { AcDbDxfPairReader } from '../src/base/AcDbDxfPairReader'
import { acdbCreateDxfPairReader } from '../src/base/AcDbDxfPairReader'
import {
  acdbDrainDxfPairs,
  acdbDrainDxfPairsChunked,
  acdbDxfWireChunking
} from '../src/base/AcDbDxfPairWire'
import {
  ACDB_DXF_WORKER_CHUNK_ACK_MESSAGE,
  ACDB_DXF_WORKER_CHUNK_MESSAGE,
  ACDB_DXF_WORKER_CHUNK_STOP_MESSAGE
} from '../src/converter/worker/AcDbWorkerManager'
import { AcDbDatabase } from '../src/database'
import { AcDbNativeDxfConverter } from '../src/dxf'
import { AcDbDxfDocumentReader } from '../src/dxf/AcDbDxfDocumentReader'

/**
 * `Worker` stand-in that implements the **chunked** parser-worker protocol
 * with the real drain, the real credit semantics, and a deliberately tiny
 * chunk size, so the manager, the chunk reader, the filer refill points and
 * the converter's stream wiring are all exercised end to end.
 *
 * It runs on the main thread's event loop (there is no real worker in Jest),
 * but every hop still goes through `postMessage` + an async boundary, which is
 * where the protocol's ordering and backpressure bugs live.
 */
class FakeChunkParserWorker {
  /** Force many chunks out of a small drawing. */
  static chunkBytes = 8
  /**
   * Emulate a worker that publishes every chunk and its final response back to
   * back, i.e. before the consumer pulled anything.
   */
  static burst = false
  static reset() {
    FakeChunkParserWorker.created = 0
    FakeChunkParserWorker.terminated = 0
    FakeChunkParserWorker.chunksPosted = 0
    FakeChunkParserWorker.acks = 0
    FakeChunkParserWorker.stopPosts = 0
    FakeChunkParserWorker.maxOutstanding = 0
    FakeChunkParserWorker.burst = false
  }
  static created = 0
  static terminated = 0
  static chunksPosted = 0
  static acks = 0
  static stopPosts = 0
  /** Chunks posted but not yet handed to the consumer. */
  static maxOutstanding = 0

  private readonly listeners: Record<string, Array<(event: unknown) => void>> =
    { message: [], error: [] }
  private credits = 1
  private stopped = false
  private creditWaiters: Array<(keepGoing: boolean) => void> = []

  constructor(_url: string | URL) {
    FakeChunkParserWorker.created += 1
  }

  addEventListener(type: 'message' | 'error', cb: (event: unknown) => void) {
    this.listeners[type].push(cb)
  }

  removeEventListener(type: 'message' | 'error', cb: (event: unknown) => void) {
    this.listeners[type] = this.listeners[type].filter(item => item !== cb)
  }

  postMessage(payload: { id?: string; input?: unknown; type?: string }): void {
    if (payload.type === ACDB_DXF_WORKER_CHUNK_ACK_MESSAGE) {
      FakeChunkParserWorker.acks += 1
      this.credits += 1
      this.wake(true)
      return
    }
    if (payload.type === ACDB_DXF_WORKER_CHUNK_STOP_MESSAGE) {
      FakeChunkParserWorker.stopPosts += 1
      this.stopped = true
      this.wake(false)
      return
    }
    void this.runTask(payload.id!, payload.input as ArrayBuffer)
  }

  terminate(): void {
    FakeChunkParserWorker.terminated += 1
  }

  private emit(data: unknown): void {
    for (const cb of this.listeners.message) cb({ data })
  }

  private wake(keepGoing: boolean): void {
    if (this.creditWaiters.length === 0) return
    const waiters = this.creditWaiters
    this.creditWaiters = []
    for (const waiter of waiters) waiter(keepGoing)
  }

  private acquire(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false)
    if (this.credits > 0) {
      this.credits -= 1
      return Promise.resolve(true)
    }
    return new Promise(resolve => {
      this.creditWaiters.push(resolve)
    })
  }

  private async runTask(id: string, input: ArrayBuffer): Promise<void> {
    this.credits = 1
    this.stopped = false
    // Counters describe one streaming task; the zero-byte readiness probe is
    // not part of it.
    FakeChunkParserWorker.chunksPosted = 0
    FakeChunkParserWorker.acks = 0
    FakeChunkParserWorker.maxOutstanding = 0
    const reader: AcDbDxfPairReader = acdbCreateDxfPairReader(
      new Uint8Array(input)
    )
    try {
      // Honour the same rollback switch the real worker reads.
      if (!acdbDxfWireChunking.enabled) {
        const wire = acdbDrainDxfPairs(reader, {
          totalBytes: input.byteLength
        })
        this.emit({ id, success: true, data: wire as unknown })
        return
      }
      const summary = await acdbDrainDxfPairsChunked(reader, {
        totalBytes: input.byteLength,
        chunkBytes: FakeChunkParserWorker.chunkBytes,
        onChunk: chunk => {
          FakeChunkParserWorker.chunksPosted += 1
          const outstanding =
            FakeChunkParserWorker.chunksPosted - FakeChunkParserWorker.acks
          if (outstanding > FakeChunkParserWorker.maxOutstanding) {
            FakeChunkParserWorker.maxOutstanding = outstanding
          }
          this.emit({ type: ACDB_DXF_WORKER_CHUNK_MESSAGE, chunk })
        },
        awaitChunkCredit: FakeChunkParserWorker.burst
          ? undefined
          : () => this.acquire()
      })
      this.emit({
        id,
        success: true,
        data: { mode: 'chunked', ...summary } as unknown
      })
    } catch (error) {
      this.emit({
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

function buildDxf(): string {
  const entities: string[] = []
  for (let i = 0; i < 12; i++) {
    entities.push(
      '0',
      'LINE',
      '5',
      (0x100 + i).toString(16).toUpperCase(),
      '100',
      'AcDbEntity',
      '8',
      i % 2 === 0 ? 'WALLS' : '0',
      '100',
      'AcDbLine',
      '10',
      String(i),
      '20',
      '0',
      '30',
      '0',
      '11',
      String(i),
      '21',
      '1',
      '31',
      '0'
    )
  }
  // A legacy POLYLINE unit whose VERTEX records must never be split from their
  // header, plus an ATTRIB stream closed by SEQEND.
  entities.push('0', 'POLYLINE', '8', 'WALLS', '66', '1', '70', '0')
  for (let i = 0; i < 4; i++) {
    entities.push(
      '0',
      'VERTEX',
      '8',
      'WALLS',
      '10',
      String(i),
      '20',
      '0',
      '30',
      '0'
    )
  }
  entities.push('0', 'SEQEND', '8', 'WALLS')
  entities.push(
    '0',
    'TEXT',
    '8',
    'WALLS',
    '10',
    '0',
    '20',
    '0',
    '30',
    '0',
    '40',
    '1',
    '1',
    'tail'
  )

  return [
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '70',
    '2',
    '0',
    'LAYER',
    '2',
    '0',
    '70',
    '0',
    '62',
    '7',
    '6',
    'Continuous',
    '0',
    'LAYER',
    '2',
    'WALLS',
    '70',
    '0',
    '62',
    '1',
    '6',
    'Continuous',
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n')
}

const DXF = buildDxf()

async function readMainThread(bytes: Uint8Array): Promise<{
  dump: string
  entities: number
}> {
  const db = new AcDbDatabase()
  db.createDefaultData()
  acdbHostApplicationServices().workingDatabase = db
  const filer = AcDbDxfFiler.fromString(new TextDecoder().decode(bytes), {
    database: db
  })
  await new AcDbDxfDocumentReader(db).read(filer)
  return {
    dump: db.dxfOut('out.dxf') as string,
    entities: db.tables.blockTable.modelSpace.newIterator().count
  }
}

describe('chunked parser-worker stream (P1-10)', () => {
  const originalWorker = (globalThis as unknown as { Worker?: unknown }).Worker

  beforeEach(() => {
    ;(globalThis as unknown as { Worker: unknown }).Worker =
      FakeChunkParserWorker as unknown
    FakeChunkParserWorker.reset()
  })

  afterEach(() => {
    ;(globalThis as unknown as { Worker?: unknown }).Worker = originalWorker
  })

  it('parses identically to the main thread across many chunks', async () => {
    const bytes = new TextEncoder().encode(DXF)
    const expected = await readMainThread(bytes)

    const converter = new AcDbNativeDxfConverter({
      parserWorkerUrl: 'chunked-worker.js'
    })
    const db = new AcDbDatabase()
    db.createDefaultData()
    acdbHostApplicationServices().workingDatabase = db
    await converter.read(bytes.slice().buffer, db, { minimumChunkSize: 50 })

    const entities = db.tables.blockTable.modelSpace.newIterator().count
    // The stream really was chunked, not delivered in one message.
    expect(FakeChunkParserWorker.chunksPosted).toBeGreaterThan(3)
    expect(FakeChunkParserWorker.created).toBe(1)

    expect(entities).toBe(expected.entities)
    expect(db.dxfOut('out.dxf')).toBe(expected.dump)
  })

  it('keeps at most one chunk queued ahead of the consumer', async () => {
    const bytes = new TextEncoder().encode(DXF)
    const converter = new AcDbNativeDxfConverter({
      parserWorkerUrl: 'windowed-worker.js'
    })
    const db = new AcDbDatabase()
    db.createDefaultData()
    acdbHostApplicationServices().workingDatabase = db
    await converter.read(bytes.slice().buffer, db, { minimumChunkSize: 50 })

    // One credit is granted per chunk handed to the consumer, so the producer
    // can never be more than one chunk ahead: that is what bounds the resident
    // wire to two chunks instead of the whole stream.
    expect(FakeChunkParserWorker.chunksPosted).toBeGreaterThan(3)
    expect(FakeChunkParserWorker.acks).toBeGreaterThanOrEqual(
      FakeChunkParserWorker.chunksPosted - 1
    )
    expect(FakeChunkParserWorker.maxOutstanding).toBeLessThanOrEqual(2)
  })

  it('keeps chunks that arrived before the task settled', async () => {
    // A worker that publishes every chunk and then its final response before
    // the consumer asked for anything must not have that whole stream dropped
    // by the message that ends it.
    FakeChunkParserWorker.burst = true
    const bytes = new TextEncoder().encode(DXF)
    const expected = await readMainThread(bytes)

    const converter = new AcDbNativeDxfConverter({
      parserWorkerUrl: 'burst-worker.js'
    })
    const db = new AcDbDatabase()
    db.createDefaultData()
    acdbHostApplicationServices().workingDatabase = db
    await converter.read(bytes.slice().buffer, db, { minimumChunkSize: 50 })

    expect(FakeChunkParserWorker.chunksPosted).toBeGreaterThan(3)
    // Every chunk was posted before the first pull, yet the consumer still
    // received all of them.
    expect(FakeChunkParserWorker.acks).toBeGreaterThanOrEqual(
      FakeChunkParserWorker.chunksPosted - 1
    )
    expect(db.tables.blockTable.modelSpace.newIterator().count).toBe(
      expected.entities
    )
    expect(db.dxfOut('out.dxf')).toBe(expected.dump)
  })

  it('releases the worker when the drawing ends early', async () => {
    // A DXF whose `EOF` arrives before the parser consumed every chunk: the
    // drain stops on demand instead of leaving the worker waiting for a credit
    // that will never come.
    const bytes = new TextEncoder().encode(DXF)
    const converter = new AcDbNativeDxfConverter({
      parserWorkerUrl: 'early-eof-worker.js'
    })
    const db = new AcDbDatabase()
    db.createDefaultData()
    acdbHostApplicationServices().workingDatabase = db
    await converter.read(bytes.slice().buffer, db, { minimumChunkSize: 50 })

    expect(FakeChunkParserWorker.terminated).toBe(0)
    expect([...db.tables.blockTable.modelSpace.newIterator()]).toHaveLength(14)
  })

  it('skips the chunk path when it is disabled', async () => {
    // `acdbDxfWireChunking.enabled = false` restores the pre-P1-10 protocol:
    // the worker answers with a whole wire and no chunk is posted.
    const previous = acdbDxfWireChunking.enabled
    acdbDxfWireChunking.enabled = false
    try {
      const bytes = new TextEncoder().encode(DXF)
      const converter = new AcDbNativeDxfConverter({
        parserWorkerUrl: 'legacy-worker.js'
      })
      const db = new AcDbDatabase()
      db.createDefaultData()
      acdbHostApplicationServices().workingDatabase = db
      await converter.read(bytes.slice().buffer, db, { minimumChunkSize: 50 })

      expect(FakeChunkParserWorker.chunksPosted).toBe(0)
      expect([...db.tables.blockTable.modelSpace.newIterator()]).toHaveLength(
        14
      )
    } finally {
      acdbDxfWireChunking.enabled = previous
    }
  })
})

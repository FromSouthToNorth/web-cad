import { AcDbDxfFiler, acdbHostApplicationServices } from '../src/base'
import type { AcDbDxfPair } from '../src/base/AcDbDxfPair'
import {
  type AcDbDxfPairReader,
  acdbMakeAsciiDxfPairReader
} from '../src/base/AcDbDxfPairReader'
import {
  ACDB_DXF_WIRE_CHUNK_BYTES,
  acdbDrainDxfPairs,
  acdbDrainDxfPairsChunked,
  type AcDbDxfPairWireChunk,
  type AcDbDxfPairWireData,
  acdbJoinDxfPairWireChunks,
  acdbMakeDxfPairArrayReader,
  acdbMakeDxfPairChunkReader
} from '../src/base/AcDbDxfPairWire'
import { AcDbDatabase } from '../src/database'
import { AcDbDxfDocumentReader } from '../src/dxf'

/**
 * A DXF that deliberately contains the two constructs a naive
 * "split at every group-code-0 record" chunker would cut in half:
 *
 * 1. a legacy `POLYLINE` + `VERTEX` … `SEQEND` unit, whose `VERTEX` records are
 *    consumed *inside* the polyline record by a synchronous reader, and
 * 2. an `INSERT` + `ATTRIB` … `SEQEND` stream.
 *
 * It also spans every section kind so the policy has to keep the synchronous
 * sections (HEADER / CLASSES / TABLES / OBJECTS) contiguous.
 */
function buildFixtureDxf(): string {
  const lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1024',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'CLASSES',
    '0',
    'CLASS',
    '1',
    'ACDBDICTIONARYWDFLT',
    '2',
    'AcDbDictionaryWithDefault',
    '3',
    'ObjectDBX Classes',
    '90',
    '0',
    '91',
    '1',
    '280',
    '0',
    '281',
    '0',
    '0',
    'ENDSEC',
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
    'BLOCKS',
    '0',
    'BLOCK',
    '8',
    '0',
    '2',
    'B1',
    '70',
    '0',
    '10',
    '0',
    '20',
    '0',
    '30',
    '0',
    '0',
    'LINE',
    '8',
    'WALLS',
    '10',
    '0',
    '20',
    '0',
    '30',
    '0',
    '11',
    '1',
    '21',
    '0',
    '31',
    '0',
    '0',
    'LWPOLYLINE',
    '8',
    'WALLS',
    '90',
    '2',
    '70',
    '0',
    '10',
    '0',
    '20',
    '0',
    '10',
    '5',
    '20',
    '5',
    '0',
    'ENDBLK',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LINE',
    '8',
    'WALLS',
    '10',
    '1',
    '20',
    '1',
    '30',
    '0',
    '11',
    '2',
    '21',
    '1',
    '31',
    '0',
    // Legacy POLYLINE: the VERTEX records belong to this one entity.
    '0',
    'POLYLINE',
    '8',
    'WALLS',
    '66',
    '1',
    '70',
    '0',
    '0',
    'VERTEX',
    '8',
    'WALLS',
    '10',
    '0',
    '20',
    '0',
    '30',
    '0',
    '0',
    'VERTEX',
    '8',
    'WALLS',
    '10',
    '1',
    '20',
    '0',
    '30',
    '0',
    '0',
    'VERTEX',
    '8',
    'WALLS',
    '10',
    '1',
    '20',
    '1',
    '30',
    '0',
    '0',
    'SEQEND',
    '8',
    'WALLS',
    '0',
    'CIRCLE',
    '8',
    'WALLS',
    '10',
    '4',
    '20',
    '4',
    '30',
    '0',
    '40',
    '2',
    // INSERT + ATTRIB stream, closed by SEQEND.
    '0',
    'INSERT',
    '8',
    'WALLS',
    '2',
    'B1',
    '66',
    '1',
    '10',
    '7',
    '20',
    '7',
    '30',
    '0',
    '0',
    'ATTRIB',
    '8',
    'WALLS',
    '10',
    '7',
    '20',
    '7',
    '30',
    '0',
    '40',
    '1',
    '1',
    'tag',
    '2',
    'value',
    '0',
    'SEQEND',
    '8',
    'WALLS',
    '0',
    'TEXT',
    '8',
    'WALLS',
    '10',
    '9',
    '20',
    '9',
    '30',
    '0',
    '40',
    '1',
    '1',
    'tail',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'OBJECTS',
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ]
  return lines.join('\n')
}

/** Every pair a reader yields, for order-preserving comparison. */
function readAllPairs(reader: {
  next(): AcDbDxfPair | undefined
}): AcDbDxfPair[] {
  const pairs: AcDbDxfPair[] = []
  for (;;) {
    const pair = reader.next()
    if (!pair) break
    pairs.push(pair)
  }
  return pairs
}

function expectSamePairs(actual: AcDbDxfPair[], expected: AcDbDxfPair[]) {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i]!
    const e = expected[i]!
    if (e.type === 'binary') {
      expect(a.type).toBe('binary')
      expect(Array.from((a as { value: Uint8Array }).value)).toEqual(
        Array.from(e.value)
      )
      continue
    }
    expect(`${i}:${a.code}:${a.type}:${String(a.value)}`).toBe(
      `${i}:${e.code}:${e.type}:${String(e.value)}`
    )
  }
}

async function drainChunks(
  dxf: string,
  chunkBytes: number
): Promise<AcDbDxfPairWireChunk[]> {
  const chunks: AcDbDxfPairWireChunk[] = []
  await acdbDrainDxfPairsChunked(acdbMakeAsciiDxfPairReader(dxf), {
    totalBytes: dxf.length,
    chunkBytes,
    onChunk: chunk => {
      chunks.push(chunk)
    }
  })
  return chunks
}

async function readDatabase(makeReader: () => AcDbDxfPairReader) {
  const db = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = db
  const filer = AcDbDxfFiler.forReading(makeReader(), { database: db })
  const result = await new AcDbDxfDocumentReader(db).read(filer)
  return {
    db,
    dump: db.dxfOut('out.dxf') as string,
    entities: db.tables.blockTable.modelSpace.newIterator().count,
    unknownEntityCount: result.unknownEntityCount
  }
}

describe('chunked DXF wire (P1-10)', () => {
  const FIXTURE = buildFixtureDxf()

  it('splitting disabled reproduces the single-drain wire exactly', async () => {
    const single = acdbDrainDxfPairs(acdbMakeAsciiDxfPairReader(FIXTURE))
    const chunks = await drainChunks(FIXTURE, Infinity)

    expect(chunks).toHaveLength(1)
    const chunk = chunks[0]!
    expect(chunk.last).toBe(true)
    expect(chunk.count).toBe(single.count)
    expect(chunk.strings).toEqual(single.strings)
    expect(Array.from(chunk.codes)).toEqual(Array.from(single.codes))
    expect(Array.from(chunk.types)).toEqual(Array.from(single.types))
    expect(Array.from(chunk.numbers)).toEqual(Array.from(single.numbers))
    expect(Array.from(chunk.stringIndices)).toEqual(
      Array.from(single.stringIndices)
    )
    expect(chunk.longs).toEqual(single.longs)
  })

  it('joins many chunks back into the same wire and pair stream', async () => {
    const reference = readAllPairs(
      acdbMakeDxfPairArrayReader(
        acdbDrainDxfPairs(acdbMakeAsciiDxfPairReader(FIXTURE))
      )
    )

    // `chunkBytes: 1` splits at every legal record boundary, so the string
    // table is spread over many chunks and its absolute ids have to line up.
    const chunks = await drainChunks(FIXTURE, 1)
    expect(chunks.length).toBeGreaterThan(3)

    const joined = acdbJoinDxfPairWireChunks(chunks)
    expect(joined.count).toBe(reference.length)
    expect(joined.strings).toEqual(
      acdbDrainDxfPairs(acdbMakeAsciiDxfPairReader(FIXTURE)).strings
    )
    expectSamePairs(readAllPairs(acdbMakeDxfPairArrayReader(joined)), reference)
  })

  it('replays a chunk stream identically to the joined wire', async () => {
    const expected = readAllPairs(
      acdbMakeDxfPairArrayReader(
        acdbDrainDxfPairs(acdbMakeAsciiDxfPairReader(FIXTURE))
      )
    )
    const chunks = await drainChunks(FIXTURE, 1)

    const pushed = acdbMakeDxfPairChunkReader()
    for (const chunk of chunks) pushed.pushChunk(chunk)
    pushed.endChunkStream()
    expectSamePairs(readAllPairs(pushed), expected)

    // Pull-based replay: the reader runs out of data between every pair, which
    // is the path the converter uses in production.
    const queue = [...chunks]
    const pulled = acdbMakeDxfPairChunkReader(async () => queue.shift())
    const collected: AcDbDxfPair[] = []
    for (;;) {
      await pulled.waitForData()
      const pair = pulled.next()
      if (!pair) break
      collected.push(pair)
    }
    expectSamePairs(collected, expected)
  })

  it('keeps every chunk boundary at a complete record start', async () => {
    const chunks = await drainChunks(FIXTURE, 1)
    const strings = chunks.flatMap(chunk => chunk.strings)

    expect(chunks.length).toBeGreaterThan(3)
    for (const chunk of chunks) {
      expect(chunk.count).toBeGreaterThan(0)
      // A chunk always starts with a group-code-0 record: a chunk that ended
      // right after `(0, LINE)` would make the entity's sync reader see EOF.
      expect(chunk.codes[0]).toBe(0)
      const nameIndex = chunk.stringIndices[0]!
      const name = strings[nameIndex]!.toUpperCase()
      expect(['VERTEX', 'SEQEND']).not.toContain(name)
    }

    // Chunks are contiguous and cover the whole stream.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.sourceEnd).toBeGreaterThanOrEqual(
        chunks[i - 1]!.sourceEnd
      )
    }
    expect(chunks[chunks.length - 1]!.sourceEnd).toBeLessThanOrEqual(
      FIXTURE.length
    )
    // The last published chunk is flagged, except when the drain stopped
    // exactly on a split point (then the transport end marks the stream end).
    expect(chunks.filter(chunk => chunk.last).length).toBeLessThanOrEqual(1)
  })

  it('parses the same database through every transport', async () => {
    const baseline = await readDatabase(() =>
      acdbMakeAsciiDxfPairReader(FIXTURE)
    )
    const legacyWire = await readDatabase(() =>
      acdbMakeDxfPairArrayReader(
        acdbDrainDxfPairs(acdbMakeAsciiDxfPairReader(FIXTURE))
      )
    )

    const chunks = await drainChunks(FIXTURE, 1)
    const joined = await readDatabase(() =>
      acdbMakeDxfPairArrayReader(acdbJoinDxfPairWireChunks(chunks))
    )

    const queue = [...chunks]
    const streamed = await readDatabase(() =>
      acdbMakeDxfPairChunkReader(async () => queue.shift())
    )

    // Sanity: the fixture actually produced a non-trivial database.
    expect(baseline.entities).toBeGreaterThan(4)
    expect(baseline.dump.length).toBeGreaterThan(500)

    for (const candidate of [legacyWire, joined, streamed]) {
      expect(candidate.entities).toBe(baseline.entities)
      expect(candidate.unknownEntityCount).toBe(baseline.unknownEntityCount)
      expect(candidate.dump).toBe(baseline.dump)
    }
  })

  it('defaults to a 2 MiB chunk target', async () => {
    expect(ACDB_DXF_WIRE_CHUNK_BYTES).toBe(2 * 1024 * 1024)
    const chunks = await drainChunks(FIXTURE, ACDB_DXF_WIRE_CHUNK_BYTES)
    // The fixture is far smaller than one chunk.
    expect(chunks).toHaveLength(1)
  })

  it('treats a pushed-back pair as data, never as a chunk wait', async () => {
    const chunks = await drainChunks(FIXTURE, 1)
    const queue = [...chunks]
    const reader = acdbMakeDxfPairChunkReader(async () => queue.shift())
    const filer = AcDbDxfFiler.forReading(reader, {
      database: new AcDbDatabase()
    })

    await filer.ensurePairs()
    const first = filer.readItem()
    expect(first).toBeDefined()
    filer.pushBackItem(first)
    // The pushback stack is consulted before the chunk boundary, so the filer
    // must not decide it is between chunks while it owns an unread pair.
    expect(filer.atChunkBoundary).toBe(false)
    const consumed = reader.consumedPairCount()
    await filer.ensurePairs()
    const replayed = filer.readItem()
    expect(replayed?.code).toBe(first!.code)
    // The pair came from the pushback stack, not from a freshly pulled chunk.
    expect(reader.consumedPairCount()).toBe(consumed)
  })

  it('rejects an out-of-order chunk instead of mis-decoding strings', () => {
    const reader = acdbMakeDxfPairChunkReader()
    const chunk: AcDbDxfPairWireChunk = {
      kind: 'ascii',
      count: 0,
      codes: new Int32Array(0),
      types: new Uint8Array(0),
      numbers: new Float64Array(0),
      longs: [],
      strings: ['A'],
      stringIndices: new Int32Array(0),
      binaries: [],
      chunkIndex: 1,
      last: true,
      sourceEnd: 0
    }
    expect(() => reader.pushChunk(chunk)).toThrow(/out of order/)
  })

  it('reports a transient gap as a chunk boundary, not as EOF', () => {
    const reader = acdbMakeDxfPairChunkReader()
    expect(reader.peek()).toBeUndefined()
    expect(reader.atChunkBoundary()).toBe(true)
    expect(reader.isChunkStreamEnded()).toBe(false)

    reader.endChunkStream()
    expect(reader.atChunkBoundary()).toBe(false)
    expect(reader.isChunkStreamEnded()).toBe(true)
  })

  it('drains an empty input as one empty chunk', async () => {
    const wire: AcDbDxfPairWireData = acdbDrainDxfPairs(
      acdbMakeAsciiDxfPairReader('')
    )
    const chunks: AcDbDxfPairWireChunk[] = []
    const summary = await acdbDrainDxfPairsChunked(
      acdbMakeAsciiDxfPairReader(''),
      {
        chunkBytes: 1,
        onChunk: chunk => {
          chunks.push(chunk)
        }
      }
    )
    expect(summary.count).toBe(wire.count)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.count).toBe(0)
    expect(chunks[0]!.last).toBe(true)
  })

  it('stops draining when the consumer denies further chunks', async () => {
    const chunks: AcDbDxfPairWireChunk[] = []
    let credits = 2
    const summary = await acdbDrainDxfPairsChunked(
      acdbMakeAsciiDxfPairReader(FIXTURE),
      {
        totalBytes: FIXTURE.length,
        chunkBytes: 1,
        onChunk: chunk => {
          chunks.push(chunk)
        },
        awaitChunkCredit: () => {
          credits -= 1
          return Promise.resolve(credits > 0)
        }
      }
    )
    expect(credits).toBe(0)
    // The initial chunk plus one paid-for chunk; then the drain stopped.
    expect(chunks).toHaveLength(2)
    expect(summary.count).toBeLessThan(
      acdbDrainDxfPairs(acdbMakeAsciiDxfPairReader(FIXTURE)).count
    )
  })
})

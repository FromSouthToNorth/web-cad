import { acdbDxfKeywordUpper } from './AcDbDxfKeyword'
import type { AcDbDxfPair } from './AcDbDxfPair'
import type { AcDbDxfPairReader } from './AcDbDxfPairReader'

/**
 * Numeric tags for {@link AcDbDxfPair} `type` in the wire format.
 * Comment pairs never reach the wire — pair readers filter them.
 */
const enum AcDbDxfPairWireType {
  String = 0,
  Int = 1,
  Double = 2,
  Long = 3,
  Bool = 4,
  Handle = 5,
  Binary = 6
}

/**
 * Struct-of-arrays form of a drained DXF pair stream.
 *
 * Designed for cheap `postMessage` between the parser worker and the main
 * thread: typed arrays transfer zero-copy, strings pass through one
 * deduplicated table (DXF repeats subclass markers / layer names heavily),
 * and rare `long`/`binary` values ride in side arrays so the common numeric
 * path stays flat.
 */
export interface AcDbDxfPairWireData {
  /** Source format of the drained stream. */
  kind: 'ascii' | 'binary'
  /** Number of pairs (length of {@link codes} / {@link types}). */
  count: number
  /** Group code per pair. */
  codes: Int32Array
  /** {@link AcDbDxfPairWireType} tag per pair. */
  types: Uint8Array
  /** `int` / `double` / `bool` (0|1) values, in pair order. */
  numbers: Float64Array
  /**
   * `long` values as decimal strings, in pair order. Strings keep bigint
   * values exact across the wire; decode restores number vs bigint by the
   * same safe-integer rule the source readers use.
   */
  longs: string[]
  /** Deduplicated table for `string` / `handle` values. */
  strings: string[]
  /** Index into {@link strings} per string/handle-typed pair, in pair order. */
  stringIndices: Int32Array
  /** `binary` values, in pair order. */
  binaries: Uint8Array[]
}

export interface AcDbDxfPairDrainOptions {
  /**
   * Total source byte length; enables {@link onProgress} ratios derived from
   * the reader's byte offset.
   */
  totalBytes?: number
  /** Called with completion in `[0, 1]`; fires at most ~50 times per drain. */
  onProgress?: (ratio: number) => void
}

/**
 * Grows by doubling on demand. Doubling keeps the total reallocation traffic
 * close to one final array size even when the byte estimate is far off, which
 * a ≈1.1× factor does not (its step count multiplies the copied bytes).
 */
function growI32(arr: Int32Array, needed: number): Int32Array {
  if (needed <= arr.length) return arr
  const next = new Int32Array(Math.max(needed, arr.length * 2))
  next.set(arr)
  return next
}

function growU8(arr: Uint8Array, needed: number): Uint8Array {
  if (needed <= arr.length) return arr
  const next = new Uint8Array(Math.max(needed, arr.length * 2))
  next.set(arr)
  return next
}

function growF64(arr: Float64Array, needed: number): Float64Array {
  if (needed <= arr.length) return arr
  const next = new Float64Array(Math.max(needed, arr.length * 2))
  next.set(arr)
  return next
}

/**
 * Shrinks a drained array to its used length without copying when the
 * unused slack is small. The arrays cross `postMessage` as their full
 * backing buffer anyway (see {@link acdbDxfPairWireTransferables}), so an
 * exact-size copy is pure peak-memory overhead unless the overshoot is
 * substantial.
 */
const MAX_TRIM_SLACK_RATIO = 1.25

function trimToCount<T extends Int32Array | Uint8Array | Float64Array>(
  arr: T,
  count: number
): T {
  if (arr.length <= count * MAX_TRIM_SLACK_RATIO) {
    return arr.subarray(0, count) as T
  }
  return arr.slice(0, count) as T
}

/**
 * Drains a streaming {@link AcDbDxfPairReader} into transferable
 * {@link AcDbDxfPairWireData}. Runs inside the parser worker; the result is
 * meant to be posted back with {@link acdbDxfPairWireTransferables}.
 */
export function acdbDrainDxfPairs(
  reader: AcDbDxfPairReader,
  options: AcDbDxfPairDrainOptions = {}
): AcDbDxfPairWireData {
  const totalBytes = options.totalBytes ?? 0
  const onProgress = options.onProgress
  // Average ASCII DXF pair ≈ 12 source bytes ("  10\n1.234\n"); the estimate
  // only seeds capacity — arrays still grow on demand. Real ASCII drawings
  // measured 11.6–17.8 B/pair, so this over-estimates the pair count by up to
  // ≈1.5×; `trimToCount` resolves the slack at the end of the drain.
  const estimated =
    totalBytes > 0
      ? Math.min(8 * 1024 * 1024, Math.max(1024, Math.ceil(totalBytes / 12)))
      : 4096

  let codes = new Int32Array(estimated)
  let types = new Uint8Array(estimated)
  let numbers = new Float64Array(Math.ceil(estimated / 2))
  // String/handle pairs are ~0.33–0.45 of this pair estimate on real ASCII
  // drawings (0.38 on the 112 MB reference drawing). The old `estimated / 4`
  // seed sat just below that share, so the array always grew 2× (copy plus a
  // transient double) and the grown capacity then passed the
  // `MAX_TRIM_SLACK_RATIO` threshold, which made `trimToCount` copy the array
  // again. 0.4 lands inside the zero-copy trim band instead: no growth and no
  // trim copy.
  let stringIndices = new Int32Array(Math.ceil(estimated * 0.4))
  let count = 0
  let numberCount = 0
  let stringValueCount = 0
  const strings: string[] = []
  const stringIds = new Map<string, number>()
  const longs: string[] = []
  const binaries: Uint8Array[] = []

  // Progress posts hop threads; cap them at ~2% steps so messaging never
  // shows up in the tokenize hot path.
  let lastReported = -0.02

  for (;;) {
    const pair = reader.next()
    if (!pair) break

    codes = growI32(codes, count + 1)
    types = growU8(types, count + 1)
    codes[count] = pair.code

    // The wire tag is written from the `switch` arm that already discriminates
    // `pair.type`, so no `pair.type` → tag lookup table is needed.
    switch (pair.type) {
      case 'int':
        types[count] = AcDbDxfPairWireType.Int
        numbers = growF64(numbers, numberCount + 1)
        numbers[numberCount++] = pair.value
        break
      case 'double':
        types[count] = AcDbDxfPairWireType.Double
        numbers = growF64(numbers, numberCount + 1)
        numbers[numberCount++] = pair.value
        break
      case 'bool':
        types[count] = AcDbDxfPairWireType.Bool
        numbers = growF64(numbers, numberCount + 1)
        numbers[numberCount++] = pair.value ? 1 : 0
        break
      case 'long':
        types[count] = AcDbDxfPairWireType.Long
        longs.push(String(pair.value))
        break
      case 'string':
      case 'handle': {
        types[count] =
          pair.type === 'string'
            ? AcDbDxfPairWireType.String
            : AcDbDxfPairWireType.Handle
        let id = stringIds.get(pair.value)
        if (id === undefined) {
          id = strings.length
          strings.push(pair.value)
          stringIds.set(pair.value, id)
        }
        stringIndices = growI32(stringIndices, stringValueCount + 1)
        stringIndices[stringValueCount++] = id
        break
      }
      case 'binary':
        types[count] = AcDbDxfPairWireType.Binary
        binaries.push(pair.value)
        break
    }
    count++

    if (onProgress && totalBytes > 0) {
      const ratio = Math.min(1, reader.position().byteOffset / totalBytes)
      if (ratio - lastReported >= 0.02) {
        lastReported = ratio
        onProgress(ratio)
      }
    }
  }

  if (onProgress && totalBytes > 0 && lastReported < 1) {
    onProgress(1)
  }

  return {
    kind: reader.kind,
    count,
    codes: trimToCount(codes, count),
    types: trimToCount(types, count),
    numbers: trimToCount(numbers, numberCount),
    longs,
    strings,
    stringIndices: trimToCount(stringIndices, stringValueCount),
    binaries
  }
}

/**
 * Buffers to list as `postMessage` transferables so the wire arrays move to
 * the main thread zero-copy.
 */
export function acdbDxfPairWireTransferables(
  data: AcDbDxfPairWireData
): Transferable[] {
  const transferables: Transferable[] = [
    data.codes.buffer as ArrayBuffer,
    data.types.buffer as ArrayBuffer,
    data.numbers.buffer as ArrayBuffer,
    data.stringIndices.buffer as ArrayBuffer
  ]
  for (const binary of data.binaries) {
    transferables.push(binary.buffer as ArrayBuffer)
  }
  return transferables
}

// ---------------------------------------------------------------------------
// Chunked wire (P1-10)
// ---------------------------------------------------------------------------

/**
 * Runtime switch for the chunked worker → main-thread wire (P1-10).
 *
 * `enabled: false` restores the pre-P1-10 protocol: the parser worker drains
 * the whole pair stream into a single {@link AcDbDxfPairWireData} and the main
 * thread replays it with {@link acdbMakeDxfPairArrayReader}. Both the worker
 * and the converter read this flag from their own copy of an ES module, so a
 * runtime flip only affects the realm that flips it; the rollback is flipping
 * the literal below (one line) and rebuilding, which changes both bundles.
 * A bundle mismatch is tolerated either way because the worker's response says
 * which protocol it used.
 *
 * Default `true`: only ≈2 chunks stay resident on the main thread (≈4 MiB with
 * {@link ACDB_DXF_WIRE_CHUNK_BYTES}) instead of the whole ≈66 MiB wire, and
 * semantic parsing starts after the first chunk instead of after the whole
 * drain. Covered by `__tests__/AcDbDxfPairWireChunked.spec.ts` (synthetic
 * multi-chunk equivalence) plus the real-drawing end-to-end check.
 */
export const acdbDxfWireChunking = {
  enabled: true
}

/**
 * Wire bytes per chunk. 2 MiB with the two-chunk consumer window of
 * {@link acdbMakeDxfPairChunkReader} keeps ≈4 MiB resident, matching the
 * report's target, while staying far above message-round-trip overhead
 * (a 112 MB drawing yields ≈33 chunks).
 */
export const ACDB_DXF_WIRE_CHUNK_BYTES = 2 * 1024 * 1024

/**
 * One message-sized slice of a drained pair stream.
 *
 * Chunks are produced in order and must be fed to
 * {@link acdbMakeDxfPairChunkReader} in that order. The string table is
 * **incremental**: {@link AcDbDxfPairWireData.strings} holds only the strings
 * first seen in this chunk, while `stringIndices` stay **absolute** — an index
 * into the concatenation of every chunk's `strings` in chunk order. The
 * consumer therefore keeps one growing table and never has to rewrite indices
 * (rewriting them would need a pass over the whole stream and would break if
 * the worker and the consumer disagreed about chunk boundaries).
 *
 * Chunk boundaries fall **only** at a `(0, …)` record start, only inside the
 * `BLOCKS` / `ENTITIES` sections, and never before `VERTEX` / `SEQEND` (the
 * tail of a legacy `POLYLINE` unit, which a synchronous entity reader consumes
 * as part of the polyline record). Everything else — the header, tables,
 * classes, objects and ACDSDATA sections, which the document reader consumes
 * without ever yielding — stays contiguous inside a single chunk.
 */
export interface AcDbDxfPairWireChunk extends AcDbDxfPairWireData {
  /** 0-based position of this chunk in the stream. */
  chunkIndex: number
  /**
   * `true` for the final chunk of a completed drain. Advisory: a consumer that
   * cannot tell whether more chunks are coming must also treat the end of the
   * transport (the worker task settling) as end-of-stream.
   */
  last: boolean
  /**
   * Source byte offset in the original DXF at the end of this chunk. Lets the
   * consumer derive exact parse progress without knowing the total pair count
   * up front (the count is only known once the drain ends).
   */
  sourceEnd: number
}

/** Result summary of {@link acdbDrainDxfPairsChunked}. */
export interface AcDbDxfPairChunkDrainSummary {
  kind: 'ascii' | 'binary'
  /** Total pairs drained across every chunk. */
  count: number
  /** Number of chunks published. */
  chunkCount: number
}

export interface AcDbDxfPairChunkDrainOptions extends AcDbDxfPairDrainOptions {
  /**
   * Approximate wire bytes per chunk. Defaults to
   * {@link ACDB_DXF_WIRE_CHUNK_BYTES}; `Infinity` disables splitting, which is
   * how the equivalent-output test compares this drain against
   * {@link acdbDrainDxfPairs}.
   */
  chunkBytes?: number
  /** Publishes one chunk, in order. A rejected promise aborts the drain. */
  onChunk: (chunk: AcDbDxfPairWireChunk) => void | Promise<void>
  /**
   * Called after a non-final chunk was published, before the drain continues.
   * Resolving `true` allows the next chunk to be produced; resolving `false`
   * stops the drain early (the consumer no longer needs data). This is the
   * entire backpressure mechanism: without it the worker would race ahead and
   * every chunk would pile up on the receiving thread, giving back the memory
   * the chunking was meant to save.
   */
  awaitChunkCredit?: () => Promise<boolean>
}

/** Per-chunk SoA accumulators, mirroring {@link AcDbDxfPairWireData}. */
interface AcDbDxfPairChunkBuilder {
  codes: Int32Array
  types: Uint8Array
  numbers: Float64Array
  stringIndices: Int32Array
  /** New strings first seen in this chunk; see {@link AcDbDxfPairWireChunk}. */
  strings: string[]
  longs: string[]
  binaries: Uint8Array[]
  count: number
  numberCount: number
  stringValueCount: number
  /** Approximate bytes this chunk will occupy once posted. */
  wireBytes: number
}

function createChunkBuilder(seedPairs: number): AcDbDxfPairChunkBuilder {
  const seed = Math.max(64, seedPairs)
  return {
    codes: new Int32Array(seed),
    types: new Uint8Array(seed),
    numbers: new Float64Array(Math.ceil(seed / 2)),
    // Same 0.4 string/handle share as `acdbDrainDxfPairs`; see the comment
    // there for why 0.4 keeps the array inside the zero-copy trim band.
    stringIndices: new Int32Array(Math.ceil(seed * 0.4)),
    strings: [],
    longs: [],
    binaries: [],
    count: 0,
    numberCount: 0,
    stringValueCount: 0,
    wireBytes: 0
  }
}

/** `true` for DXF records that continue an earlier unit instead of starting one. */
function acdbDxfIsContinuationRecord(name: string): boolean {
  return name === 'VERTEX' || name === 'SEQEND'
}

/**
 * Approximate resident cost of the next pair, used only to decide when a chunk
 * is full. Mirrors the arrays a chunk carries: 4 B codes + 1 B types, plus 8 B
 * numbers, 4 B string index, or the binary payload.
 */
function acdbDxfPairWireCost(pair: AcDbDxfPair): number {
  switch (pair.type) {
    case 'int':
    case 'double':
    case 'bool':
      return 13
    case 'string':
    case 'handle':
      return 9
    case 'binary':
      return 5 + pair.value.length
    default:
      return 5
  }
}

/**
 * Drains a streaming {@link AcDbDxfPairReader} into a sequence of
 * {@link AcDbDxfPairWireChunk}s.
 *
 * Splitting happens only at a `(0, …)` record start inside `BLOCKS` /
 * `ENTITIES` and never before `VERTEX` / `SEQEND`, so every chunk boundary is
 * a point where {@link AcDbDxfDocumentReader} is already awaiting
 * `AcDbDxfFiler.ensurePairs()`. A `(0, …)` pair is always the **first** pair of
 * a chunk, never its last: a chunk that ended right after `(0, LINE)` would
 * make the entity's synchronous reader see "no data" (`atEndOfObject`) and
 * build an empty entity.
 *
 * The drain is deliberately not factored through the synchronous
 * {@link acdbDrainDxfPairs}: that function is the tokenize hot path and this
 * one has to `peek` before every pair and `await` between chunks. Both loops
 * are asserted to produce identical pair streams by
 * `AcDbDxfPairWireChunked.spec.ts`, which is the guard against divergence.
 */
export async function acdbDrainDxfPairsChunked(
  reader: AcDbDxfPairReader,
  options: AcDbDxfPairChunkDrainOptions
): Promise<AcDbDxfPairChunkDrainSummary> {
  const totalBytes = options.totalBytes ?? 0
  const onProgress = options.onProgress
  const chunkBytes = options.chunkBytes ?? ACDB_DXF_WIRE_CHUNK_BYTES
  const estimated =
    totalBytes > 0
      ? Math.min(8 * 1024 * 1024, Math.max(1024, Math.ceil(totalBytes / 12)))
      : 4096

  // Shared across chunks: `stringIds.size` is the running absolute id, while
  // each chunk only carries the entries it first introduced.
  const stringIds = new Map<string, number>()
  // Seed capacity. A chunked drain must *not* seed from the whole-file
  // estimate: asking for an 8M-pair array for a 190k-pair chunk allocated
  // ~85 MiB of buffers that `trimToCount` then copied away, which showed up as
  // a ~43 MiB residency even though only three chunks were live. ≈11 wire
  // bytes/pair is the measured shape of the reference drawing.
  const seedPairs = Number.isFinite(chunkBytes)
    ? Math.max(256, Math.ceil(chunkBytes / 11))
    : estimated
  let builder = createChunkBuilder(seedPairs)
  let totalCount = 0
  let chunkIndex = 0
  let stopped = false

  // Section/record state for the split policy. Updated only on `(0, …)` pairs
  // and on the single `(2, name)` pair that follows `(0, SECTION)`, so the
  // per-pair cost on the tokenize hot path stays two comparisons.
  let section = ''
  let awaitingSectionName = false

  let lastReported = -0.02

  const publish = async (last: boolean): Promise<void> => {
    const chunk: AcDbDxfPairWireChunk = {
      kind: reader.kind,
      count: builder.count,
      codes: trimToCount(builder.codes, builder.count),
      types: trimToCount(builder.types, builder.count),
      numbers: trimToCount(builder.numbers, builder.numberCount),
      longs: builder.longs,
      strings: builder.strings,
      stringIndices: trimToCount(
        builder.stringIndices,
        builder.stringValueCount
      ),
      binaries: builder.binaries,
      chunkIndex: chunkIndex++,
      last,
      sourceEnd: reader.position().byteOffset
    }
    totalCount += builder.count
    await options.onChunk(chunk)
  }

  for (;;) {
    const pending = reader.peek()
    if (!pending) break

    if (
      builder.count > 0 &&
      pending.code === 0 &&
      builder.wireBytes >= chunkBytes &&
      (section === 'ENTITIES' || section === 'BLOCKS') &&
      !acdbDxfIsContinuationRecord(
        pending.type === 'string' || pending.type === 'handle'
          ? acdbDxfKeywordUpper(pending.value)
          : ''
      )
    ) {
      const previousPairs = builder.count
      await publish(false)
      // Release this chunk's arrays *before* waiting for the next credit: the
      // producer must not pin the chunk it just handed away, or the residency
      // budget would include one chunk that is already the consumer's. The
      // next chunk is seeded from the size this one actually reached — self
      // tuning, and it keeps steady-state chunks growth-free.
      builder = createChunkBuilder(previousPairs)
      if (options.awaitChunkCredit) {
        const keepGoing = await options.awaitChunkCredit()
        if (!keepGoing) {
          stopped = true
          break
        }
      }
    }

    const pair = reader.next()
    if (!pair) break

    // Split-policy state. `section` names the section the reader is currently
    // inside and is deliberately *sticky* across the section's records: only
    // `(0, SECTION)` and `(0, ENDSEC)` change it. It is set from the
    // `(2, name)` pair that directly follows `(0, SECTION)`; every other
    // non-code-0 pair clears the "awaiting name" flag so a later unrelated
    // group-code-2 field cannot be mistaken for a section name (which would
    // wrongly enable splitting inside a synchronous HEADER / TABLES / OBJECTS
    // section).
    if (pair.code === 0) {
      const name =
        pair.type === 'string' || pair.type === 'handle'
          ? acdbDxfKeywordUpper(pair.value)
          : ''
      if (name === 'SECTION') {
        section = ''
        awaitingSectionName = true
      } else if (name === 'ENDSEC') {
        section = ''
        awaitingSectionName = false
      } else {
        awaitingSectionName = false
      }
    } else if (awaitingSectionName) {
      section =
        pair.code === 2 && (pair.type === 'string' || pair.type === 'handle')
          ? acdbDxfKeywordUpper(pair.value)
          : ''
      awaitingSectionName = false
    }

    builder.codes = growI32(builder.codes, builder.count + 1)
    builder.types = growU8(builder.types, builder.count + 1)
    builder.codes[builder.count] = pair.code
    builder.wireBytes += acdbDxfPairWireCost(pair)

    switch (pair.type) {
      case 'int':
      case 'double':
      case 'bool': {
        builder.types[builder.count] =
          pair.type === 'int'
            ? AcDbDxfPairWireType.Int
            : pair.type === 'double'
              ? AcDbDxfPairWireType.Double
              : AcDbDxfPairWireType.Bool
        builder.numbers = growF64(builder.numbers, builder.numberCount + 1)
        builder.numbers[builder.numberCount++] =
          pair.type === 'bool' ? (pair.value ? 1 : 0) : pair.value
        break
      }
      case 'long':
        builder.types[builder.count] = AcDbDxfPairWireType.Long
        builder.longs.push(String(pair.value))
        break
      case 'string':
      case 'handle': {
        builder.types[builder.count] =
          pair.type === 'string'
            ? AcDbDxfPairWireType.String
            : AcDbDxfPairWireType.Handle
        let id = stringIds.get(pair.value)
        if (id === undefined) {
          // Absolute id: the string table is shared across chunks, so the id
          // must count every string already published, not just this chunk's.
          id = stringIds.size
          stringIds.set(pair.value, id)
          builder.strings.push(pair.value)
        }
        builder.stringIndices = growI32(
          builder.stringIndices,
          builder.stringValueCount + 1
        )
        builder.stringIndices[builder.stringValueCount++] = id
        break
      }
      case 'binary':
        builder.types[builder.count] = AcDbDxfPairWireType.Binary
        builder.binaries.push(pair.value)
        break
    }
    builder.count++

    if (onProgress && totalBytes > 0) {
      const ratio = Math.min(1, reader.position().byteOffset / totalBytes)
      if (ratio - lastReported >= 0.02) {
        lastReported = ratio
        onProgress(ratio)
      }
    }
  }

  if (onProgress && totalBytes > 0 && lastReported < 1) {
    onProgress(1)
  }

  // An empty tail chunk carries no information; the transport end already
  // tells the consumer the stream is over.
  if (!stopped && (builder.count > 0 || chunkIndex === 0)) {
    await publish(true)
  }

  return { kind: reader.kind, count: totalCount, chunkCount: chunkIndex }
}

/**
 * Rebuilds a whole {@link AcDbDxfPairWireData} from an ordered chunk sequence.
 *
 * The exact inverse of {@link acdbDrainDxfPairsChunked}'s string table
 * sharing: chunk `strings` are concatenated in order (which reproduces the
 * single-drain table entry for entry) and the per-chunk value arrays are
 * concatenated as they are, because `stringIndices` are already absolute.
 *
 * Used by the equivalence tests and available as a fallback for a consumer
 * that wants the pre-P1-10 single-array shape.
 */
export function acdbJoinDxfPairWireChunks(
  chunks: readonly AcDbDxfPairWireChunk[]
): AcDbDxfPairWireData {
  if (chunks.length === 0) {
    return {
      kind: 'ascii',
      count: 0,
      codes: new Int32Array(0),
      types: new Uint8Array(0),
      numbers: new Float64Array(0),
      longs: [],
      strings: [],
      stringIndices: new Int32Array(0),
      binaries: []
    }
  }

  // Every chunk's views were trimmed to their used length by the drain, so
  // the lengths are exact per-chunk counts and no type scan is needed.
  let count = 0
  let numberCount = 0
  let stringValueCount = 0
  let stringCount = 0
  let longCount = 0
  let binaryCount = 0
  for (const chunk of chunks) {
    count += chunk.count
    numberCount += chunk.numbers.length
    stringValueCount += chunk.stringIndices.length
    stringCount += chunk.strings.length
    longCount += chunk.longs.length
    binaryCount += chunk.binaries.length
  }

  const codes = new Int32Array(count)
  const types = new Uint8Array(count)
  const numbers = new Float64Array(numberCount)
  const stringIndices = new Int32Array(stringValueCount)
  const strings = new Array<string>(stringCount)
  const longs = new Array<string>(longCount)
  const binaries = new Array<Uint8Array>(binaryCount)

  let at = 0
  let numberAt = 0
  let stringIndexAt = 0
  let stringAt = 0
  let longAt = 0
  let binaryAt = 0
  for (const chunk of chunks) {
    codes.set(chunk.codes, at)
    types.set(chunk.types, at)
    numbers.set(chunk.numbers, numberAt)
    stringIndices.set(chunk.stringIndices, stringIndexAt)
    for (let i = 0; i < chunk.strings.length; i++) {
      strings[stringAt++] = chunk.strings[i]!
    }
    for (let i = 0; i < chunk.longs.length; i++) {
      longs[longAt++] = chunk.longs[i]!
    }
    for (let i = 0; i < chunk.binaries.length; i++) {
      binaries[binaryAt++] = chunk.binaries[i]!
    }
    at += chunk.count
    numberAt += chunk.numbers.length
    stringIndexAt += chunk.stringIndices.length
  }

  return {
    kind: chunks[0]!.kind,
    count,
    codes,
    types,
    numbers,
    longs,
    strings,
    stringIndices,
    binaries
  }
}

/**
 * Rebuilds an {@link AcDbDxfPairReader} over drained wire data.
 *
 * Sequential access only (like every pair reader): value cursors advance as
 * pairs materialize, and `peek` caches its lookahead. `position().byteOffset`
 * reports the consumed **pair index**, not a source byte offset — callers
 * wanting parse progress should divide by {@link AcDbDxfPairWireData.count}.
 */
export function acdbMakeDxfPairArrayReader(
  data: AcDbDxfPairWireData
): AcDbDxfPairReader {
  let index = 0
  let numberCursor = 0
  let longCursor = 0
  let stringCursor = 0
  let binaryCursor = 0
  let lookahead: AcDbDxfPair | undefined
  let lookaheadValid = false

  const { count, codes, types, numbers, longs, strings, stringIndices } = data
  const binaries = data.binaries

  function readRaw(): AcDbDxfPair | undefined {
    if (index >= count) return undefined
    const code = codes[index]!
    const type = types[index]!
    index++

    switch (type) {
      case AcDbDxfPairWireType.String:
        return {
          code,
          type: 'string',
          value: strings[stringIndices[stringCursor++]!]!
        }
      case AcDbDxfPairWireType.Handle:
        return {
          code,
          type: 'handle',
          value: strings[stringIndices[stringCursor++]!]!
        }
      case AcDbDxfPairWireType.Int:
        return { code, type: 'int', value: numbers[numberCursor++]! }
      case AcDbDxfPairWireType.Double:
        return { code, type: 'double', value: numbers[numberCursor++]! }
      case AcDbDxfPairWireType.Bool:
        return { code, type: 'bool', value: numbers[numberCursor++] !== 0 }
      case AcDbDxfPairWireType.Long: {
        const raw = longs[longCursor++]!
        const n = Number(raw)
        return Number.isSafeInteger(n)
          ? { code, type: 'long', value: n }
          : { code, type: 'long', value: BigInt(raw) }
      }
      case AcDbDxfPairWireType.Binary:
        return { code, type: 'binary', value: binaries[binaryCursor++]! }
      default:
        return readRaw()
    }
  }

  return {
    kind: data.kind,
    next() {
      if (lookaheadValid) {
        const pair = lookahead
        lookahead = undefined
        lookaheadValid = false
        return pair
      }
      return readRaw()
    },
    peek() {
      if (!lookaheadValid) {
        lookahead = readRaw()
        lookaheadValid = true
      }
      return lookahead
    },
    position() {
      return { byteOffset: index }
    }
  }
}

/**
 * Consumer side of the chunked wire protocol.
 *
 * Unlike every other pair reader, `next()` / `peek()` can return `undefined`
 * **without the stream being over**: the current chunk is exhausted and the
 * next one may still be in flight. `undefined` therefore means "no pair right
 * now"; only {@link isChunkStreamEnded} (or `keepWaiting()` resolving `false`)
 * means end of stream. Consumers must therefore be able to await
 * {@link waitForData} at a point where the transport can deliver more data —
 * see `AcDbDxfFiler.ensurePairs()` and the loops in `AcDbDxfDocumentReader`
 * that call it. Treating a transient `undefined` as EOF is exactly the
 * silent-truncation hazard this protocol was designed around.
 */
export interface AcDbDxfPairChunkReader extends AcDbDxfPairReader {
  /** Appends the next chunk. Chunks must arrive in `chunkIndex` order. */
  pushChunk(chunk: AcDbDxfPairWireChunk): void
  /** Declares that no further chunk will arrive. */
  endChunkStream(): void
  /**
   * `true` when no pair is available right now but the stream has not ended —
   * i.e. a `waitForData()` call can produce more pairs.
   */
  atChunkBoundary(): boolean
  /** `true` once the stream has ended and every pair has been consumed. */
  isChunkStreamEnded(): boolean
  /**
   * Resolves once at least one more pair is available, or once the stream
   * ended. When a `pull` callback was supplied it is invoked to fetch the next
   * chunk instead of waiting for a `pushChunk`.
   */
  waitForData(): Promise<void>
  /** Pairs already handed out. */
  consumedPairCount(): number
}

/**
 * Creates a pair reader that replays a **chunked** wire stream.
 *
 * @param pull - Optional fetch hook: called when the reader runs out of data,
 * resolving with the next chunk — or `undefined` once nothing more will
 * arrive. Wired to the worker session, it is what makes the consumer, not the
 * producer, set the pace: the next chunk is only requested once the current
 * one has been consumed, so the consumer holds at most two chunks at a time.
 *
 * `position().byteOffset` reports an interpolated **source byte offset**, not
 * a pair index, because a chunked consumer does not know the total pair count
 * up front while it does know the source length. This differs from
 * {@link acdbMakeDxfPairArrayReader} on purpose; the two readers are not
 * interchangeable for progress accounting.
 */
export function acdbMakeDxfPairChunkReader(
  pull?: () => Promise<AcDbDxfPairWireChunk | undefined>
): AcDbDxfPairChunkReader {
  /** Received chunks not yet started, with the source offset they start at. */
  let pending: Array<{
    chunk: AcDbDxfPairWireChunk
    sourceStart: number
  }> = []
  let head = 0
  /** String table of every chunk, kept because ids are absolute. */
  const tables: string[][] = []
  /** First absolute id of each table in {@link tables}. */
  const bases: number[] = []
  let nextBase = 0
  /** Cursor for the fast path; ids are *not* globally sorted. */
  let tableIndex = 0
  let tableBase = 0

  let cur: AcDbDxfPairWireChunk | undefined
  let curSourceStart = 0
  let curIndex = 0
  let curNumbers = 0
  let curLongs = 0
  let curStrings = 0
  let curBinaries = 0

  let lastSourceEnd = 0
  let expectedChunkIndex = 0
  let consumed = 0
  let ended = false
  let kind: 'ascii' | 'binary' = 'ascii'
  let lookahead: AcDbDxfPair | undefined
  let lookaheadValid = false
  let waiters: Array<() => void> = []

  function flushWaiters(): void {
    if (waiters.length === 0) return
    const pendingWaiters = waiters
    waiters = []
    for (const resolve of pendingWaiters) resolve()
  }

  function advanceChunk(): boolean {
    while (!cur || curIndex >= cur.count) {
      if (head >= pending.length) {
        pending = []
        head = 0
        cur = undefined
        return false
      }
      const entry = pending[head++]!
      cur = entry.chunk
      curSourceStart = entry.sourceStart
      curIndex = 0
      curNumbers = 0
      curLongs = 0
      curStrings = 0
      curBinaries = 0
    }
    return true
  }

  /**
   * Resolves an absolute id against the per-chunk tables.
   *
   * Ids are **not** globally ordered: a chunk re-references every string it
   * uses, including ones an earlier chunk introduced, so an id can drop back
   * to 0 after a much larger one. The cursor is therefore only a fast path for
   * the common "same chunk again" case, and a miss falls back to a binary
   * search over the per-chunk bases. Chunks are never merged into one flat
   * table: that would add a second array of references as large as the string
   * table itself (≈19 MiB on the reference drawing).
   */
  function stringAt(id: number): string {
    const current = tables[tableIndex]
    if (current && id >= tableBase && id < tableBase + current.length) {
      return current[id - tableBase]!
    }
    let low = 0
    let high = tables.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const base = bases[mid]!
      const table = tables[mid]!
      if (id < base) {
        high = mid - 1
      } else if (id >= base + table.length) {
        low = mid + 1
      } else {
        tableIndex = mid
        tableBase = base
        return table[id - base]!
      }
    }
    // Only reachable if a chunk's `strings` table is missing entries it
    // published ids for, which the in-order check in `pushChunk` guards.
    throw new Error(`DXF wire string id ${id} is outside the wire table`)
  }

  function readRaw(): AcDbDxfPair | undefined {
    if (!advanceChunk()) return undefined
    const chunk = cur!
    const code = chunk.codes[curIndex]!
    const type = chunk.types[curIndex]!
    curIndex++
    consumed++

    switch (type) {
      case AcDbDxfPairWireType.String:
        return {
          code,
          type: 'string',
          value: stringAt(chunk.stringIndices[curStrings++]!)
        }
      case AcDbDxfPairWireType.Handle:
        return {
          code,
          type: 'handle',
          value: stringAt(chunk.stringIndices[curStrings++]!)
        }
      case AcDbDxfPairWireType.Int:
        return { code, type: 'int', value: chunk.numbers[curNumbers++]! }
      case AcDbDxfPairWireType.Double:
        return { code, type: 'double', value: chunk.numbers[curNumbers++]! }
      case AcDbDxfPairWireType.Bool:
        return { code, type: 'bool', value: chunk.numbers[curNumbers++] !== 0 }
      case AcDbDxfPairWireType.Long: {
        const raw = chunk.longs[curLongs++]!
        const n = Number(raw)
        return Number.isSafeInteger(n)
          ? { code, type: 'long', value: n }
          : { code, type: 'long', value: BigInt(raw) }
      }
      case AcDbDxfPairWireType.Binary:
        return {
          code,
          type: 'binary',
          value: chunk.binaries[curBinaries++]!
        }
      default:
        return readRaw()
    }
  }

  function hasNoPairNow(): boolean {
    if (lookaheadValid) return false
    if (cur && curIndex < cur.count) return false
    if (head < pending.length) return false
    return true
  }

  /** `true` when no pair is available *and* the stream has not ended. */
  function atChunkBoundary(): boolean {
    return !ended && hasNoPairNow()
  }

  function pushChunk(chunk: AcDbDxfPairWireChunk): void {
    if (ended) return
    // A gap or a reordered delivery would silently misalign the absolute
    // string ids for the whole rest of the stream. Fail loudly instead of
    // decoding garbage.
    if (chunk.chunkIndex !== expectedChunkIndex) {
      throw new Error(
        `DXF wire chunk out of order: expected ${expectedChunkIndex}, got ${chunk.chunkIndex}`
      )
    }
    expectedChunkIndex++
    kind = chunk.kind
    pending.push({ chunk, sourceStart: lastSourceEnd })
    lastSourceEnd = chunk.sourceEnd
    bases.push(nextBase)
    nextBase += chunk.strings.length
    tables.push(chunk.strings)
    flushWaiters()
  }

  function endChunkStream(): void {
    ended = true
    flushWaiters()
  }

  async function waitForData(): Promise<void> {
    for (;;) {
      if (!atChunkBoundary()) return
      if (pull) {
        const chunk = await pull()
        if (chunk) {
          pushChunk(chunk)
          continue
        }
        endChunkStream()
        return
      }
      await new Promise<void>(resolve => {
        waiters.push(resolve)
      })
    }
  }

  return {
    get kind() {
      return kind
    },
    pushChunk,
    endChunkStream,
    atChunkBoundary,
    isChunkStreamEnded() {
      return ended && hasNoPairNow()
    },
    waitForData,
    consumedPairCount() {
      return consumed
    },
    next() {
      if (lookaheadValid) {
        const pair = lookahead
        lookahead = undefined
        lookaheadValid = false
        return pair
      }
      return readRaw()
    },
    peek() {
      if (!lookaheadValid) {
        const pair = readRaw()
        // A miss must not be cached: once the next chunk arrives the same
        // `peek()` has to see it, and `refreshNextPair()` only re-peeks.
        if (pair === undefined) return undefined
        lookahead = pair
        lookaheadValid = true
      }
      return lookahead
    },
    position() {
      if (!cur || cur.count === 0) return { byteOffset: lastSourceEnd }
      const span = cur.sourceEnd - curSourceStart
      return {
        byteOffset: curSourceStart + Math.floor((span * curIndex) / cur.count)
      }
    }
  }
}

import { acdbDxfIsInt32Code, acdbDxfValueType } from './AcDbDxfGroupCodeTypes'
import type { AcDbDxfPair } from './AcDbDxfPair'

/** Magic prefix for AutoCAD Binary DXF files (22 bytes). */
const BINARY_DXF_MAGIC = (() => {
  const prefix = 'AutoCAD Binary DXF\r\n'
  const bytes = new Uint8Array(22)
  for (let i = 0; i < prefix.length; i++) bytes[i] = prefix.charCodeAt(i)
  bytes[20] = 0x1a
  bytes[21] = 0x00
  return bytes
})()

const UTF8_DECODER = new TextDecoder('utf-8')
const UTF8_ENCODER = new TextEncoder()

const HEX_NIBBLE: Int8Array = (() => {
  const t = new Int8Array(128)
  for (let i = 0; i < 10; i++) t[0x30 + i] = i
  for (let i = 0; i < 6; i++) {
    t[0x41 + i] = 10 + i
    t[0x61 + i] = 10 + i
  }
  return t
})()

/**
 * Stream of typed DXF group-code/value pairs.
 *
 * Comment pairs (code 999) are filtered - neither `peek` nor `next` returns
 * them. Implementations must not materialize the whole file as a `string[]`
 * of lines.
 *
 * The ASCII reader scans raw UTF-8 bytes directly. Group code lines and
 * numeric/bool/handle values are ASCII by definition, so they are parsed
 * without decoding. Only string-like value lines are decoded, using a
 * zero-allocation fast path for pure ASCII and `TextDecoder` for multi-byte
 * UTF-8.
 */
export interface AcDbDxfPairReader {
  readonly kind: 'ascii' | 'binary'
  next(): AcDbDxfPair | undefined
  peek(): AcDbDxfPair | undefined
  position(): { line?: number; byteOffset: number }
}

export function acdbIsBinaryDxf(data: Uint8Array): boolean {
  if (data.length < BINARY_DXF_MAGIC.length) return false
  for (let i = 0; i < BINARY_DXF_MAGIC.length; i++) {
    if (data[i] !== BINARY_DXF_MAGIC[i]) return false
  }
  return true
}

/** ASCII whitespace used around DXF numeric fields (String.trim's ASCII set). */
function acdbIsAsciiWhitespace(c: number): boolean {
  return c === 0x20 || (c >= 0x09 && c <= 0x0d)
}

/** True for every character `String.prototype.trim` strips. */
function acdbIsTrimWhitespace(c: number): boolean {
  return (
    c === 0x20 ||
    c === 0xa0 ||
    c === 0x1680 ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff ||
    (c >= 0x09 && c <= 0x0d) ||
    (c >= 0x2000 && c <= 0x200a)
  )
}

/**
 * Decodes a pure-ASCII byte span without constructing a `TextDecoder` call or
 * an intermediate `Uint8Array` copy. DXF keywords, handles and numeric text
 * are overwhelmingly ASCII.
 */
function acdbDecodeAsciiSpan(
  bytes: Uint8Array,
  start: number,
  end: number
): string {
  const length = end - start
  if (length <= 0) return ''
  if (length <= 16) {
    let text = ''
    for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i])
    return text
  }
  // Chunk the apply call so a single very long value line cannot exceed the
  // engine's argument limit.
  const CHUNK = 4096
  let text = ''
  for (let pos = start; pos < end; pos += CHUNK) {
    const chunkEnd = Math.min(pos + CHUNK, end)
    text += String.fromCharCode.apply(
      null,
      bytes.subarray(pos, chunkEnd) as unknown as number[]
    )
  }
  return text
}

/**
 * Decodes a UTF-8 byte span, taking the ASCII fast path when possible.
 *
 * `nonAscii` must be true exactly when the span holds a byte `>= 0x80`. It is
 * produced by the line scanner, so this function never re-scans the span (the
 * previous implementation walked every value line a second time here).
 */
function acdbDecodeUtf8Span(
  bytes: Uint8Array,
  start: number,
  end: number,
  nonAscii: boolean
): string {
  if (!nonAscii) {
    return acdbDecodeAsciiSpan(bytes, start, end)
  }
  return UTF8_DECODER.decode(bytes.subarray(start, end))
}

/**
 * Parses an integer group code straight from the bytes of a code line,
 * without allocating the line string or a trimmed copy.
 *
 * Returns NaN for blank or malformed code lines. DXF group code lines are
 * pure ASCII; the rare non-ASCII line falls back to the exact `Number` +
 * finite-check semantics of the old character parser.
 */
function acdbReadDxfCodeFromBytes(
  bytes: Uint8Array,
  start: number,
  end: number,
  nonAscii: boolean
): number {
  if (nonAscii) {
    const n = Number(acdbDecodeUtf8Span(bytes, start, end, true).trim())
    return Number.isFinite(n) ? n : NaN
  }

  let i = start
  while (i < end && acdbIsAsciiWhitespace(bytes[i])) i++
  if (i >= end) return NaN

  let sign = 1
  const c0 = bytes[i]
  if (c0 === 0x2d) {
    sign = -1
    i++
  } else if (c0 === 0x2b) {
    i++
  }

  let value = 0
  let digits = 0
  while (i < end) {
    const c = bytes[i]
    if (c >= 0x30 && c <= 0x39) {
      value = value * 10 + (c - 0x30)
      digits++
      i++
    } else {
      break
    }
  }
  if (digits === 0) return NaN

  while (i < end) {
    if (!acdbIsAsciiWhitespace(bytes[i])) return NaN
    i++
  }
  return sign * value
}

/**
 * Largest integer `mantissa` for which one more accumulation step
 * `mantissa * 10 + digit` is still an exact integer: `mantissa` below
 * `(2^53 - 9) / 10` guarantees `mantissa * 10 + digit <= 2^53 - 9 + 9 < 2^53`,
 * and every integer below `2^53` is exactly representable as a double.
 *
 * The previous criterion (give up after 15 significant digits) rejected almost
 * every real-world coordinate: this file's coordinates are 7-8 integer digits
 * plus 8-9 fractional digits, i.e. 15-17 significant digits, so 82.7% of all
 * `double` spans fell back to "build a string + `Number()`". The 2^53 bound
 * only rejects what actually cannot be exact.
 */
const MAX_EXACT_DOUBLE_MANTISSA = (Number.MAX_SAFE_INTEGER - 9) / 10

/**
 * Fast path for `double` value lines: parses
 * `[+-]?digits[.digits][eE[+-]digits]` straight from the byte span, without
 * slicing the line or calling `Number()`.
 *
 * Exactness (bit-for-bit identical to `Number()` on the accepted domain):
 * the significant digits are accumulated as the integer `mantissa` and accepted
 * only while every step stays below `2^53` (see
 * {@link MAX_EXACT_DOUBLE_MANTISSA}), so `mantissa` is the *exact* integer
 * formed by those digits. `10^|k|` is exact for `|k| <= 22`, so the final
 * `mantissa / 10^k` or `mantissa * 10^k` is the exact decimal value rounded
 * exactly once by IEEE-754 - the same single correct rounding `Number()`
 * performs (the result normalizes non-finite values to 0 in both paths).
 *
 * Returns `undefined` outside its exact domain; the caller decodes the line
 * and falls back to `Number()`.
 */
function acdbParseDoubleSpan(
  bytes: Uint8Array,
  start: number,
  end: number
): number | undefined {
  let i = start
  while (i < end && acdbIsAsciiWhitespace(bytes[i])) i++
  if (i >= end) return 0

  let sign = 1
  const c0 = bytes[i]
  if (c0 === 0x2d) {
    sign = -1
    i++
  } else if (c0 === 0x2b) {
    i++
  }

  let mantissa = 0
  let exp10 = 0
  let anyDigit = false
  let tooLong = false

  while (i < end) {
    const c = bytes[i]
    if (c < 0x30 || c > 0x39) break
    anyDigit = true
    i++
    if (mantissa === 0 && c === 0x30) continue
    if (mantissa > MAX_EXACT_DOUBLE_MANTISSA) {
      tooLong = true
      continue
    }
    mantissa = mantissa * 10 + (c - 0x30)
  }

  if (i < end && bytes[i] === 0x2e) {
    i++
    while (i < end) {
      const c = bytes[i]
      if (c < 0x30 || c > 0x39) break
      anyDigit = true
      i++
      if (mantissa === 0 && c === 0x30) {
        exp10--
        continue
      }
      if (mantissa > MAX_EXACT_DOUBLE_MANTISSA) {
        tooLong = true
        continue
      }
      mantissa = mantissa * 10 + (c - 0x30)
      exp10--
    }
  }

  if (i < end && (bytes[i] === 0x65 || bytes[i] === 0x45)) {
    i++
    let expSign = 1
    const sc = bytes[i]
    if (sc === 0x2d) {
      expSign = -1
      i++
    } else if (sc === 0x2b) {
      i++
    }
    let expVal = 0
    let expDigits = 0
    while (i < end) {
      const c = bytes[i]
      if (c < 0x30 || c > 0x39) break
      i++
      expDigits++
      if (expVal <= 10000) expVal = expVal * 10 + (c - 0x30)
    }
    if (expDigits === 0) return undefined
    exp10 += expSign * expVal
  }

  // The rest of the line must be whitespace: `Number()` trims the ends but
  // rejects interior garbage, and hex/binary/octal literals like `0x1A`.
  while (i < end) {
    if (!acdbIsAsciiWhitespace(bytes[i])) return undefined
    i++
  }

  if (!anyDigit) return 0
  if (tooLong) return undefined
  if (mantissa === 0) return sign * mantissa
  if (exp10 > 22 || exp10 < -22) return undefined

  let scale = 1
  const k = exp10 < 0 ? -exp10 : exp10
  for (let n = 0; n < k; n++) scale *= 10
  return sign * (exp10 < 0 ? mantissa / scale : mantissa * scale)
}

/**
 * Fast path for `int` value lines with `parseInt(slice, 10)` semantics:
 * skips leading whitespace, takes the longest digit run, ignores the rest.
 * Returns `undefined` when non-ASCII whitespace may precede the digits (so the
 * caller decodes and uses the platform `parseInt`), and for digit runs longer
 * than 15.
 */
function acdbParseIntSpan(
  bytes: Uint8Array,
  start: number,
  end: number
): number | undefined {
  let i = start
  for (;;) {
    if (i >= end) break
    const c = bytes[i]
    if (c >= 0x80) return undefined
    if (!acdbIsAsciiWhitespace(c)) break
    i++
  }

  let sign = 1
  const c0 = bytes[i]
  if (c0 === 0x2d) {
    sign = -1
    i++
  } else if (c0 === 0x2b) {
    i++
  }
  if (i < end && bytes[i] >= 0x80) return undefined

  let value = 0
  let digits = 0
  let anyDigit = false
  while (i < end) {
    const c = bytes[i]
    if (c < 0x30 || c > 0x39) break
    i++
    anyDigit = true
    if (value === 0 && c === 0x30) continue
    if (digits >= 15) return undefined
    value = value * 10 + (c - 0x30)
    digits++
  }
  return anyDigit ? sign * value : 0
}

/**
 * Fast path for `long` value lines with `Number(slice)` semantics (whole line
 * must be numeric, unlike `parseInt`). Returns the integer when it has at most
 * 15 significant digits; otherwise `undefined` and the caller falls back to
 * `Number` / `BigInt`.
 */
function acdbParseLongSpan(
  bytes: Uint8Array,
  start: number,
  end: number
): number | undefined {
  let i = start
  while (i < end && acdbIsAsciiWhitespace(bytes[i])) i++

  let sign = 1
  const c0 = bytes[i]
  if (c0 === 0x2d) {
    sign = -1
    i++
  } else if (c0 === 0x2b) {
    i++
  }

  let value = 0
  let digits = 0
  let anyDigit = false
  while (i < end) {
    const c = bytes[i]
    if (c < 0x30 || c > 0x39) break
    i++
    anyDigit = true
    if (value === 0 && c === 0x30) continue
    if (digits >= 15) return undefined
    value = value * 10 + (c - 0x30)
    digits++
  }

  while (i < end) {
    if (!acdbIsAsciiWhitespace(bytes[i])) return undefined
    i++
  }
  return anyDigit ? sign * value : 0
}

/**
 * Equivalent to `trimmed !== '' && trimmed !== '0'` without allocating.
 *
 * `nonAscii` comes from the line scanner; non-ASCII spans bail out so the
 * caller can use the exact `String.prototype.trim` semantics.
 */
function acdbDxfRawBoolIsTrue(
  bytes: Uint8Array,
  start: number,
  end: number,
  nonAscii: boolean
): boolean | undefined {
  if (nonAscii) return undefined

  while (start < end && acdbIsAsciiWhitespace(bytes[start])) start++
  while (end > start && acdbIsAsciiWhitespace(bytes[end - 1])) end--
  if (start >= end) return false
  return !(end - start === 1 && bytes[start] === 0x30)
}

/**
 * Decodes a hex pair value straight from a character span. Used only as a rare
 * fallback when a binary value line contains non-ASCII bytes.
 */
function acdbDecodeHexBinaryText(
  text: string,
  start: number,
  end: number
): Uint8Array {
  while (start < end && acdbIsTrimWhitespace(text.charCodeAt(start))) start++
  while (end > start && acdbIsTrimWhitespace(text.charCodeAt(end - 1))) end--
  const byteLength = (end - start) >>> 1
  const bytes = new Uint8Array(byteLength)
  for (let j = 0; j < byteLength; j++) {
    const hi = HEX_NIBBLE[text.charCodeAt(start + j * 2) & 0x7f]
    const lo = HEX_NIBBLE[text.charCodeAt(start + j * 2 + 1) & 0x7f]
    bytes[j] = (hi << 4) | lo
  }
  return bytes
}

/**
 * Decodes a code-310 hex line from bytes, trimming ASCII whitespace.
 *
 * `nonAscii` comes from the line scanner. Trimming only removes ASCII
 * whitespace, so it cannot change whether the span holds a non-ASCII byte.
 */
function acdbDecodeHexBinarySpan(
  bytes: Uint8Array,
  start: number,
  end: number,
  nonAscii: boolean
): Uint8Array {
  while (start < end && acdbIsAsciiWhitespace(bytes[start])) start++
  while (end > start && acdbIsAsciiWhitespace(bytes[end - 1])) end--

  if (nonAscii) {
    const text = acdbDecodeUtf8Span(bytes, start, end, true)
    return acdbDecodeHexBinaryText(text, 0, text.length)
  }

  const byteLength = (end - start) >>> 1
  const out = new Uint8Array(byteLength)
  for (let j = 0; j < byteLength; j++) {
    const hi = HEX_NIBBLE[bytes[start + j * 2] & 0x7f]
    const lo = HEX_NIBBLE[bytes[start + j * 2 + 1] & 0x7f]
    out[j] = (hi << 4) | lo
  }
  return out
}

/**
 * Parses one ASCII value line.
 *
 * `nonAscii` is the flag produced by the line scanner for this exact span; it
 * is forwarded to every decode helper so no helper has to re-scan the bytes.
 */
function parseAsciiValueSpan(
  code: number,
  bytes: Uint8Array,
  start: number,
  end: number,
  nonAscii: boolean
): AcDbDxfPair | null {
  const type = acdbDxfValueType(code)
  if (type === 'comment') return null

  switch (type) {
    case 'string':
      return {
        code,
        type,
        value: acdbDecodeUtf8Span(bytes, start, end, nonAscii)
      }
    case 'int': {
      const fast = acdbParseIntSpan(bytes, start, end)
      const n =
        fast === undefined
          ? parseInt(acdbDecodeUtf8Span(bytes, start, end, nonAscii), 10)
          : fast
      return { code, type, value: Number.isFinite(n) ? n : 0 }
    }
    case 'long': {
      const fast = acdbParseLongSpan(bytes, start, end)
      if (fast !== undefined) return { code, type, value: fast }
      const raw = acdbDecodeUtf8Span(bytes, start, end, nonAscii)
      const n = Number(raw)
      if (Number.isSafeInteger(n)) return { code, type, value: n }
      try {
        return { code, type, value: BigInt(raw.trim()) }
      } catch {
        return { code, type, value: 0 }
      }
    }
    case 'double': {
      const fast = acdbParseDoubleSpan(bytes, start, end)
      const n =
        fast === undefined
          ? Number(acdbDecodeUtf8Span(bytes, start, end, nonAscii))
          : fast
      return { code, type, value: Number.isFinite(n) ? n : 0 }
    }
    case 'bool': {
      const fast = acdbDxfRawBoolIsTrue(bytes, start, end, nonAscii)
      if (fast !== undefined) return { code, type, value: fast }
      const trimmed = acdbDecodeUtf8Span(bytes, start, end, nonAscii).trim()
      return { code, type, value: trimmed !== '' && trimmed !== '0' }
    }
    case 'handle': {
      const value = acdbDecodeUtf8Span(bytes, start, end, nonAscii)
      if (value.length === 0) return { code, type, value }
      const first = value.charCodeAt(0)
      const last = value.charCodeAt(value.length - 1)
      if (!acdbIsTrimWhitespace(first) && !acdbIsTrimWhitespace(last)) {
        return { code, type, value }
      }
      return { code, type, value: value.trim() }
    }
    case 'binary':
      return {
        code,
        type,
        value: acdbDecodeHexBinarySpan(bytes, start, end, nonAscii)
      }
    default:
      return null
  }
}

/**
 * ASCII/UTF-8 pair reader over raw bytes.
 *
 * Line breaks are single bytes and UTF-8 continuation bytes never equal
 * 0x0A/0x0D, so non-ASCII text values never straddle line boundaries.
 */
function acdbMakeUtf8DxfPairReader(bytes: Uint8Array): AcDbDxfPairReader {
  let pos =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
      ? 3
      : 0
  let lineNumber = 1
  let lookahead: AcDbDxfPair | undefined
  let lookaheadValid = false

  /**
   * Advances past one line and returns its content byte range.
   *
   * The scan also ORs every content byte, so `nonAscii` ("this line holds a
   * byte >= 0x80") comes for free and the value/code parsers never have to walk
   * the line a second time.
   */
  function readLineSpan():
    | { start: number; end: number; nonAscii: boolean }
    | undefined {
    if (pos >= bytes.length) return undefined
    const start = pos
    let contentEnd = pos
    let flags = 0
    while (contentEnd < bytes.length) {
      const c = bytes[contentEnd]
      if (c === 0x0a || c === 0x0d) break
      flags |= c
      contentEnd++
    }
    let end = contentEnd
    if (end < bytes.length && bytes[end] === 0x0d) end++
    if (end < bytes.length && bytes[end] === 0x0a) end++
    pos = end
    lineNumber++
    return { start, end: contentEnd, nonAscii: flags >= 0x80 }
  }

  function readRaw(): AcDbDxfPair | undefined {
    for (;;) {
      const codeSpan = readLineSpan()
      if (codeSpan === undefined) return undefined
      const code = acdbReadDxfCodeFromBytes(
        bytes,
        codeSpan.start,
        codeSpan.end,
        codeSpan.nonAscii
      )
      if (Number.isNaN(code)) continue
      if (code === 999) {
        if (readLineSpan() === undefined) return undefined
        continue
      }

      const valueSpan = readLineSpan()
      if (valueSpan === undefined) return undefined

      const pair = parseAsciiValueSpan(
        code,
        bytes,
        valueSpan.start,
        valueSpan.end,
        valueSpan.nonAscii
      )
      if (pair) return pair
    }
  }

  return {
    kind: 'ascii',
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
      return { line: lineNumber, byteOffset: pos }
    }
  }
}

/**
 * Creates an ASCII DXF pair reader over raw UTF-8 bytes.
 *
 * This is the UTF-8-only replacement for the old windowed / multi-encoding
 * ASCII readers. A UTF-8 BOM is skipped when present.
 */
export function acdbMakeUtf8AsciiDxfPairReader(
  bytes: Uint8Array
): AcDbDxfPairReader {
  return acdbMakeUtf8DxfPairReader(bytes)
}

/**
 * Backwards-compatible helper for callers that already have a decoded DXF
 * string. The string is UTF-8 encoded once, then parsed by the byte reader.
 */
export function acdbMakeAsciiDxfPairReader(text: string): AcDbDxfPairReader {
  return acdbMakeUtf8DxfPairReader(UTF8_ENCODER.encode(text))
}

function safeBigIntToNumber(v: bigint): number | bigint {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  const min = -max
  if (v >= min && v <= max) return Number(v)
  return v
}

/**
 * Binary DXF pair reader. Skips the 22-byte magic prefix.
 *
 * Strings are decoded as UTF-8, matching the binary writer in
 * {@link AcDbDxfFiler}.
 *
 * @param legacyR12 - AC1009 uses 1-byte group codes (0xFF escape for >255).
 */
export function acdbMakeBinaryDxfPairReader(
  data: Uint8Array,
  options: { legacyR12?: boolean } = {}
): AcDbDxfPairReader {
  const legacyR12 = options.legacyR12 ?? false
  const PREFIX = 22
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const stringDecoder = new TextDecoder('utf-8')
  let offset = data.length >= PREFIX ? PREFIX : data.length
  let lookahead: AcDbDxfPair | undefined
  let lookaheadValid = false

  function readCode(): number | undefined {
    if (offset >= data.length) return undefined
    if (legacyR12) {
      const first = data[offset]
      if (first === undefined) return undefined
      if (first === 0xff) {
        if (offset + 3 > data.length) return undefined
        offset += 1
        const lo = data[offset]
        const hi = data[offset + 1]
        offset += 2
        return (hi << 8) | lo
      }
      offset += 1
      return first
    }
    if (offset + 2 > data.length) return undefined
    const code = view.getUint16(offset, true)
    offset += 2
    return code
  }

  function readString(): string | undefined {
    const start = offset
    while (offset < data.length && data[offset] !== 0) offset += 1
    if (offset >= data.length) return undefined
    const bytes = data.subarray(start, offset)
    offset += 1
    return stringDecoder.decode(bytes)
  }

  function readInt16(): number | undefined {
    if (offset + 2 > data.length) return undefined
    const v = view.getInt16(offset, true)
    offset += 2
    return v
  }

  function readInt32(): number | undefined {
    if (offset + 4 > data.length) return undefined
    const v = view.getInt32(offset, true)
    offset += 4
    return v
  }

  function readInt64(): number | bigint | undefined {
    if (offset + 8 > data.length) return undefined
    const v = view.getBigInt64(offset, true)
    offset += 8
    return safeBigIntToNumber(v)
  }

  function readDouble(): number | undefined {
    if (offset + 8 > data.length) return undefined
    const v = view.getFloat64(offset, true)
    offset += 8
    return v
  }

  function readBool(): boolean | undefined {
    if (offset >= data.length) return undefined
    const v = data[offset]
    if (v === undefined) return undefined
    offset += 1
    return v !== 0
  }

  function readBinaryChunk(): Uint8Array | undefined {
    if (offset >= data.length) return undefined
    const length = data[offset]
    if (length === undefined) return undefined
    offset += 1
    if (offset + length > data.length) return undefined
    const bytes = data.slice(offset, offset + length)
    offset += length
    return bytes
  }

  function readRaw(): AcDbDxfPair | undefined {
    while (offset < data.length) {
      const code = readCode()
      if (code === undefined) return undefined
      if (code === 999) {
        if (readString() === undefined) return undefined
        continue
      }
      const type = acdbDxfValueType(code)
      switch (type) {
        case 'string': {
          const value = readString()
          if (value === undefined) return undefined
          return { code, type: 'string', value }
        }
        case 'int': {
          const v = acdbDxfIsInt32Code(code) ? readInt32() : readInt16()
          if (v === undefined) return undefined
          return { code, type: 'int', value: v }
        }
        case 'long': {
          const v = readInt64()
          if (v === undefined) return undefined
          return { code, type: 'long', value: v }
        }
        case 'double': {
          const v = readDouble()
          if (v === undefined) return undefined
          return { code, type: 'double', value: v }
        }
        case 'bool': {
          const v = readBool()
          if (v === undefined) return undefined
          return { code, type: 'bool', value: v }
        }
        case 'handle': {
          const raw = readString()
          if (raw === undefined) return undefined
          return { code, type: 'handle', value: raw }
        }
        case 'binary': {
          const bytes = readBinaryChunk()
          if (bytes === undefined) return undefined
          return { code, type: 'binary', value: bytes }
        }
        case 'comment':
          continue
        default:
          readString()
          continue
      }
    }
    return undefined
  }

  return {
    kind: 'binary',
    next() {
      if (lookaheadValid) {
        const p = lookahead
        lookahead = undefined
        lookaheadValid = false
        return p
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
      return { byteOffset: offset }
    }
  }
}

export interface AcDbCreateDxfPairReaderOptions {
  /** Force R12 1-byte group codes for binary DXF. */
  legacyR12?: boolean
}

/**
 * Create a pair reader from DXF bytes (ASCII UTF-8 or binary).
 *
 * ASCII text is always interpreted as UTF-8. The numeric group-code layer is
 * parsed directly from bytes; only string values are decoded.
 */
export function acdbCreateDxfPairReader(
  data: ArrayBuffer | Uint8Array,
  options: AcDbCreateDxfPairReaderOptions = {}
): AcDbDxfPairReader {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

  if (!acdbIsBinaryDxf(bytes)) {
    return acdbMakeUtf8AsciiDxfPairReader(bytes)
  }

  let legacyR12 = options.legacyR12
  if (legacyR12 == null) {
    // After the 22-byte magic: R12 uses 1-byte codes (`0,'S'`), modern uses
    // 2-byte LE codes (`0,0,'S'`) for the first SECTION marker.
    const PREFIX = 22
    const b0 = bytes[PREFIX]
    const b1 = bytes[PREFIX + 1]
    const b2 = bytes[PREFIX + 2]
    if (b0 === 0 && b1 === 0x53 /* 'S' */) {
      legacyR12 = true
    } else if (b0 === 0 && b1 === 0 && b2 === 0x53 /* 'S' */) {
      legacyR12 = false
    } else {
      legacyR12 = false
    }
  }
  return acdbMakeBinaryDxfPairReader(bytes, { legacyR12 })
}

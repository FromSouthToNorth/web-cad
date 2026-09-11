import { AcCmColor, AcCmTransparency } from '@hy/common'

import { AcDbDwgVersion } from '../src/database/AcDbDwgVersion'
import { AcDbDxfFiler, AcDbDxfFilerStatus } from '../src/base/AcDbDxfFiler'
import type { AcDbDxfPair } from '../src/base/AcDbDxfPair'
import { AcDbResultBuffer } from '../src/base/AcDbResultBuffer'
import {
  acdbCreateDxfPairReader,
  acdbMakeAsciiDxfPairReader,
  acdbMakeUtf8AsciiDxfPairReader
} from '../src/base/AcDbDxfPairReader'
import type { AcDbTypedValue } from '../src/base/AcDbTypedValue'

/**
 * Regression tests for empty string values.
 *
 * An empty string means "no value for this group code": writer used to emit a
 * placeholder '0' value so the pair stayed present, which turned an empty style
 * name (group 7) into a *style named "0"* and empty MTEXT contents (group 1)
 * into the literal text "0" after a round trip. The whole group must be skipped
 * instead — while numeric 0 stays a legal, emitted value.
 */
describe('AcDbDxfFiler empty string groups', () => {
  it('skips an empty string group entirely', () => {
    const filer = new AcDbDxfFiler()

    // No group code and no value line: `toString()` only adds its terminator.
    filer.writeString(7, '')
    expect(filer.toString()).toBe('\n')

    // Direct writeGroup callers (e.g. XData group 1000 chunking) get the same
    // treatment; undefined/null were already skipped.
    filer.writeGroup(1, '')
    filer.writeString(7, undefined)
    filer.writeString(7, null as unknown as string)
    expect(filer.toString()).toBe('\n')

    filer.writeString(7, 'Standard')
    expect(filer.toString()).toBe('7\nStandard\n')
  })

  it('still writes numeric 0 and values that stringify to "0"', () => {
    const filer = new AcDbDxfFiler()

    filer.writeInt16(70, 0)
    filer.writeDouble(40, 0)
    filer.writeBoolean(290, false)
    filer.writeInt16(71, 0.9)
    filer.writeString(1, '0')

    expect(filer.toString()).toBe('70\n0\n40\n0\n290\n0\n71\n0\n1\n0\n')
  })

  it('keeps the no-empty-value-line guard for values that format to empty', () => {
    // Stringification happens through `formatValue`, which is a different layer
    // than the empty-string check. A value whose string form is empty (and that
    // is therefore not caught by the `value === ''` check, which does not
    // stringify) must still fall back to '0' rather than leaving a blank line.
    const filer = new AcDbDxfFiler()
    filer.writeGroup(70, { toString: () => '' })

    const out = filer.toString()
    expect(out).toBe('70\n0\n')
    // No line may be empty — an empty line would desynchronize code/value
    // pairing for every strict reader.
    expect(out).not.toMatch(/\n\n/)
  })

  it('keeps the no-empty-value-line guard for whitespace-only strings', () => {
    // Only a fully empty string is skipped; a blank-looking value is still a
    // value and must be written (never dropped, never left as an empty line).
    const filer = new AcDbDxfFiler()
    filer.writeString(1, ' ')

    const out = filer.toString()
    expect(out).toBe('1\n \n')
    expect(out).not.toMatch(/\n\n/)
  })
})

describe('AcDbDxfFiler', () => {
  it('writes and formats DXF groups through helper methods', () => {
    const filer = new AcDbDxfFiler({ precision: 20, version: 'AC1015' })

    expect(filer.precision).toBe(16)
    expect(filer.version?.name).toBe('AC1015')
    expect(filer.nextHandle).toBe(1)

    filer.setPrecision(-1)
    expect(filer.precision).toBe(0)

    filer.setVersion(33)
    expect(filer.version).toBeInstanceOf(AcDbDwgVersion)

    expect(filer.registerHandle('abc')).toBe('ABC')
    expect(filer.resolveHandle('abc')).toBe('ABC')
    expect(filer.registerHandle('custom-id')).toBe('1')
    expect(filer.nextHandle).toBe(2)
    expect(filer.resolveHandle()).toBeUndefined()

    filer
      .startSection('HEADER')
      .writeSubclassMarker('AcDbTest')
      .writeString(1, 'line\r\nvalue')
      .writeInt8(70, 3.9)
      .writeInt16(71, 4.2)
      .writeInt32(72, 5.8)
      .writeInt64(73, 6.1)
      .writeUInt16(74, -3)
      .writeUInt32(75, -4)
      .writeBoolean(290, true)
      .writeBool(291, false)
      .writeDouble(40, 1.23456789)
      .writeDouble(41, Number.NaN)
      .writeAngle(50, Math.PI)
      .writeHandle(5, 'abc')
      .writeObjectId(330, 'custom-id')
      .writePoint2d(10, { x: 1.5, y: 2.5 })
      .writePoint3d(20, { x: 3, y: 4, z: 5 })
      .writeVector3d(30, { x: 6, y: 7, z: 8 })
      .startTable('LAYER')
      .endTable()
      .endSection()

    const aciColor = new AcCmColor()
    aciColor.colorIndex = 7
    filer.writeCmColor(aciColor)

    const trueColor = new AcCmColor()
    trueColor.setRGB(255, 0, 0)
    filer.writeCmColor(trueColor)

    const transparency = new AcCmTransparency(128)
    filer.writeTransparency(transparency)

    filer.writeResultBuffer(
      new AcDbResultBuffer([
        { code: 1000, value: 'x' },
        { code: 1070, value: 1 }
      ])
    )

    const out = filer.toString()
    expect(out).toContain('SECTION')
    expect(out).toContain('HEADER')
    expect(out).toContain('AcDbTest')
    expect(out).toContain('line value')
    expect(out).toContain('ENDSEC')
    expect(out).toContain('ENDTAB')
    expect(out).toContain('180')
    expect(out).toContain('ABC')
    expect(out).toContain('1000')
    expect(out).toContain('\n0\n')
  })

  it('supports database getter and setter', () => {
    const filer = new AcDbDxfFiler()
    expect(filer.database).toBeUndefined()
    filer.database = undefined
    expect(filer.database).toBeUndefined()
  })

  it('writes transparency with the default group code and skips invalid values', () => {
    const filer = new AcDbDxfFiler()

    filer.writeTransparency(new AcCmTransparency(128))
    expect(filer.toString()).toBe('440\n33554560\n')

    const invalidFiler = new AcDbDxfFiler()
    invalidFiler.writeTransparency(AcCmTransparency.fromString('invalid'))
    expect(invalidFiler.toString()).not.toContain('440')
  })

  it('reads ASCII DXF pairs via AcDbDxfFiler without splitting into a line array', () => {
    const dxf = [
      '0',
      'LINE',
      '5',
      '1A',
      '100',
      'AcDbEntity',
      '8',
      '0',
      '100',
      'AcDbLine',
      '10',
      '1.5',
      '20',
      '2.5',
      '30',
      '0',
      '11',
      '10',
      '21',
      '20',
      '31',
      '0',
      '0',
      'ENDSEC'
    ].join('\n')

    const filer = AcDbDxfFiler.fromString(dxf)
    expect(filer.mode).toBe('read')

    // readItem returns the underlying pair directly (carries its `type` field).
    expect(filer.readItem()).toEqual({ code: 0, type: 'string', value: 'LINE' })
    expect(filer.readHandle(5)).toBe('1A')
    expect(filer.atSubclassData('AcDbEntity')).toBe(true)
    expect(filer.readString(8)).toBe('0')
    expect(filer.atSubclassData('AcDbLine')).toBe(true)

    const start = filer.readPoint3d(10)
    expect(start?.x).toBe(1.5)
    expect(start?.y).toBe(2.5)
    expect(start?.z).toBe(0)

    const end = filer.readPoint3d(11)
    expect(end?.x).toBe(10)
    expect(end?.y).toBe(20)
    expect(end?.z).toBe(0)

    expect(filer.atEndOfObject).toBe(true)
    // readItem returns the underlying pair directly (carries its `type` field).
    expect(filer.readItem()).toEqual({
      code: 0,
      type: 'string',
      value: 'ENDSEC'
    })
    expect(filer.atEof).toBe(true)
    expect(filer.filerStatus).toBe(AcDbDxfFilerStatus.Ok)
  })

  it('supports pushBackItem and order-independent field reading', () => {
    const dxf = [
      '100',
      'AcDbLine',
      '11',
      '3',
      '21',
      '4',
      '10',
      '1',
      '20',
      '2'
    ].join('\n')
    const filer = AcDbDxfFiler.fromString(dxf)
    expect(filer.atSubclassData('AcDbLine')).toBe(true)

    let x1 = 0
    let y1 = 0
    let x2 = 0
    let y2 = 0
    while (!filer.atEndOfObject && !filer.atEof) {
      const item = filer.readItem()
      if (!item) break
      switch (Number(item.code)) {
        case 10:
          x1 = Number(item.value)
          break
        case 20:
          y1 = Number(item.value)
          break
        case 11:
          x2 = Number(item.value)
          break
        case 21:
          y2 = Number(item.value)
          break
        default:
          filer.pushBackItem(item)
          return
      }
    }
    expect(x1).toBe(1)
    expect(y1).toBe(2)
    expect(x2).toBe(3)
    expect(y2).toBe(4)
  })

  it('supports nested pushBackItem without overwriting prior push', () => {
    const dxf = ['10', '1', '20', '2', '30', '3'].join('\n')
    const filer = AcDbDxfFiler.fromString(dxf)

    const a = filer.readItem()!
    const b = filer.readItem()!
    filer.pushBackItem(a)
    filer.pushBackItem(b)
    // LIFO: last pushed (b) is returned first.
    expect(filer.readItem()).toEqual(b)
    expect(filer.readItem()).toEqual(a)
    // readItem returns the underlying pair directly (carries its `type` field).
    expect(filer.readItem()).toEqual({ code: 30, type: 'double', value: 3 })
    expect(filer.atEof).toBe(true)
  })

  it('creates a pair reader from an ArrayBuffer for ASCII DXF', () => {
    const text = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1032\n0\nENDSEC\n'
    const buffer = new TextEncoder().encode(text).buffer
    const reader = acdbCreateDxfPairReader(buffer)
    expect(reader.kind).toBe('ascii')
    expect(reader.next()).toEqual({ code: 0, type: 'string', value: 'SECTION' })
    expect(reader.next()).toEqual({ code: 2, type: 'string', value: 'HEADER' })

    const ascii = acdbMakeAsciiDxfPairReader(text)
    expect(ascii.peek()?.value).toBe('SECTION')
    expect(ascii.next()?.value).toBe('SECTION')
  })

  it('scans UTF-8 ASCII DXF from bytes without a full-file string decode', () => {
    const text = '0\nLINE\n8\n0\n10\n1\n20\n2\n'
    const bytes = new TextEncoder().encode(text)
    const reader = acdbMakeUtf8AsciiDxfPairReader(bytes)
    expect(reader.next()).toEqual({ code: 0, type: 'string', value: 'LINE' })
    expect(reader.next()).toEqual({ code: 8, type: 'string', value: '0' })
    expect(reader.next()).toEqual({ code: 10, type: 'double', value: 1 })
    expect(reader.next()).toEqual({ code: 20, type: 'double', value: 2 })
    expect(reader.next()).toBeUndefined()
  })
})

/**
 * Regression tests for the cached "next pair" used by the per-pair predicates
 * (`atEof` / `atEndOfObject` / `atExtendedData` / `atSubclassData`).
 *
 * The reference model below is an independent implementation that always goes
 * through its own reader `peek()` plus an explicit pushback stack, so any
 * divergence in the cached group code shows up as a predicate mismatch.
 */
describe('AcDbDxfFiler next-pair cache consistency', () => {
  const FIXTURE = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '0',
    'ENDSEC',
    '0',
    'LAYER',
    '100',
    'AcDbSymbolTableRecord',
    '100',
    'AcDbLayerTableRecord',
    '2',
    '0',
    '70',
    '0',
    '1001',
    'ACAD',
    '1000',
    'hello',
    '1002',
    '{',
    '1000',
    'world',
    '1002',
    '}',
    '0',
    'LINE',
    '100',
    'AcDbEntity',
    '8',
    '0',
    '100',
    'AcDbLine',
    '10',
    '1.5',
    '20',
    '2.5',
    '30',
    '0',
    '11',
    '10',
    '21',
    '20',
    '31',
    '0',
    '0',
    'EOF'
  ].join('\n')

  interface ReferenceModel {
    peek(): AcDbDxfPair | undefined
    read(): AcDbDxfPair | undefined
    atEof(): boolean
    atEndOfObject(): boolean
    atExtendedData(): boolean
    atSubclassData(name: string): boolean
    pushBackItem(item?: AcDbDxfPair): void
    skipToEndOfObject(): void
  }

  function createReference(text: string): ReferenceModel {
    const reader = acdbMakeUtf8AsciiDxfPairReader(
      new TextEncoder().encode(text)
    )
    const stack: AcDbDxfPair[] = []
    let lastRead: AcDbDxfPair | undefined

    const peek = (): AcDbDxfPair | undefined =>
      stack.length > 0 ? stack[stack.length - 1] : reader.peek()
    const read = (): AcDbDxfPair | undefined => {
      const pair = stack.length > 0 ? stack.pop()! : reader.next()
      lastRead = pair
      return pair
    }
    const atEof = () => (stack.length > 0 ? false : reader.peek() === undefined)
    const atEndOfObject = () => {
      const next = peek()
      return next === undefined || next.code === 0
    }
    const atExtendedData = () => {
      const next = peek()
      if (!next) return false
      return next.code === 1001 || next.code === 1000 || next.code === 1002
    }
    return {
      peek,
      read,
      atEof,
      atEndOfObject,
      atExtendedData,
      atSubclassData: (name: string) => {
        const next = peek()
        if (!next || next.code !== 100) return false
        if (typeof next.value !== 'string' || next.value !== name) return false
        read()
        return true
      },
      pushBackItem: (item?: AcDbDxfPair) => {
        if (item) stack.push(item)
        else if (lastRead) stack.push(lastRead)
      },
      skipToEndOfObject: () => {
        while (!atEndOfObject() && !atEof()) read()
      }
    }
  }

  function expectSamePredicates(filer: AcDbDxfFiler, ref: ReferenceModel) {
    expect({
      atEof: filer.atEof,
      atEndOfObject: filer.atEndOfObject,
      atExtendedData: filer.atExtendedData
    }).toEqual({
      atEof: ref.atEof(),
      atEndOfObject: ref.atEndOfObject(),
      atExtendedData: ref.atExtendedData()
    })
  }

  it('matches the reference model over a fuzzed read/pushBack/peek script', () => {
    const filer = AcDbDxfFiler.fromString(FIXTURE)
    const ref = createReference(FIXTURE)
    const names = [
      'AcDbEntity',
      'AcDbLine',
      'AcDbLayerTableRecord',
      'AcDbSymbolTableRecord',
      'Missing'
    ]

    // Deterministic xorshift32 so failures are reproducible and every op is
    // actually reachable (a multiplicative LCG loses its low bits in doubles).
    let seed = 987654321
    const rand = (n: number) => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      seed >>>= 0
      return seed % n
    }

    const seenOps = new Set<number>()
    for (let step = 0; step < 800; step++) {
      const op = rand(8)
      seenOps.add(op)
      if (op <= 1) {
        expect({ step, item: filer.readItem() }).toEqual({
          step,
          item: ref.read()
        })
      } else if (op === 2) {
        expect({ step, item: filer.peekItem() }).toEqual({
          step,
          item: ref.peek()
        })
      } else if (op === 3) {
        // Arg form: callers push back the item they just read.
        const item = filer.readItem()
        const refItem = ref.read()
        expect({ step, item }).toEqual({ step, item: refItem })
        if (item) {
          filer.pushBackItem(item)
          ref.pushBackItem(refItem)
        }
      } else if (op === 4) {
        // No-arg form: re-push the last consumed pair.
        filer.pushBackItem()
        ref.pushBackItem()
      } else if (op === 5) {
        const name = names[rand(names.length)]!
        expect({ step, hit: filer.atSubclassData(name) }).toEqual({
          step,
          hit: ref.atSubclassData(name)
        })
      } else if (op === 6) {
        filer.skipToEndOfObject()
        ref.skipToEndOfObject()
      }
      expectSamePredicates(filer, ref)
    }

    // Guard against a degenerate PRNG silently skipping an operation kind.
    expect([...seenOps].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('rebuilds the cached code after arg and no-arg pushBackItem', () => {
    const text = ['0', 'LINE', '5', '1A', '10', '1'].join('\n')
    const filer = AcDbDxfFiler.fromString(text)
    const ref = createReference(text)

    expect(filer.readItem()).toEqual(ref.read())
    expect(filer.atEndOfObject).toBe(false)
    expect(filer.atExtendedData).toBe(false)
    expect(filer.atEof).toBe(false)

    // No-arg form pushes the pair just consumed => back at the object start.
    filer.pushBackItem()
    ref.pushBackItem()
    expect(filer.atEndOfObject).toBe(true)
    expectSamePredicates(filer, ref)

    // Reading it again clears the cached boundary.
    expect(filer.readItem()).toEqual(ref.read())
    expect(filer.atEndOfObject).toBe(false)
    expectSamePredicates(filer, ref)

    // Arg form: push back the handle pair, the next code must be 5 again.
    const handle = filer.readItem()
    expect(handle).toEqual(ref.read())
    filer.pushBackItem(handle)
    ref.pushBackItem(handle as unknown as AcDbDxfPair)
    expect(filer.atEndOfObject).toBe(false)
    expect(filer.atExtendedData).toBe(false)
    expectSamePredicates(filer, ref)
    expect(filer.readItem()).toEqual({
      code: 5,
      type: 'handle',
      value: '1A'
    })
    ref.read()
    expect(filer.readDouble(10)).toBe(1)
    ref.read()
    expect(filer.atEof).toBe(true)
    expect(filer.atEndOfObject).toBe(true)
    expect(filer.atExtendedData).toBe(false)
    expectSamePredicates(filer, ref)
  })

  it('rebuilds the cached code for a pushed typed value without a type tag', () => {
    const filer = AcDbDxfFiler.fromString(['10', '1'].join('\n'))
    const typed: AcDbTypedValue = { code: 0, value: 'LINE' }
    filer.pushBackItem(typed)
    expect(filer.atEndOfObject).toBe(true)
    expect(filer.atEof).toBe(false)
    expect(filer.atExtendedData).toBe(false)
    expect(filer.readItem()).toEqual({ code: 0, type: 'string', value: 'LINE' })
    expect(filer.readDouble()).toBe(1)
    expect(filer.atEof).toBe(true)
  })

  it('keeps atSubclassData aligned across consecutive subclass markers', () => {
    const text = [
      '0',
      'LAYER',
      '100',
      'AcDbSymbolTableRecord',
      '100',
      'AcDbLayerTableRecord',
      '2',
      '0',
      '1001',
      'XDATA'
    ].join('\n')
    const filer = AcDbDxfFiler.fromString(text)
    const ref = createReference(text)

    expect(filer.readItem()?.value).toBe('LAYER')
    ref.read()
    expect(filer.atSubclassData('AcDbSymbolTableRecord')).toBe(true)
    expect(ref.atSubclassData('AcDbSymbolTableRecord')).toBe(true)
    expect(filer.atSubclassData('AcDbLayerTableRecord')).toBe(true)
    expect(ref.atSubclassData('AcDbLayerTableRecord')).toBe(true)
    // Wrong name must not consume the pair.
    expect(filer.atSubclassData('AcDbEntity')).toBe(false)
    expect(ref.atSubclassData('AcDbEntity')).toBe(false)
    expectSamePredicates(filer, ref)

    expect(filer.readString(2)).toBe('0')
    ref.read()
    expect(filer.atExtendedData).toBe(true)
    expectSamePredicates(filer, ref)
  })

  it('handles pushBackItem immediately before atSubclassData', () => {
    // Mirrors AcDbEntity.dxfInFields: read a 100 marker, push it back, then let
    // the derived class consume it through atSubclassData.
    const filer = AcDbDxfFiler.fromString(
      ['100', 'AcDbLine', '10', '1', '20', '2'].join('\n')
    )
    const item = filer.readItem()!
    expect(Number(item.code)).toBe(100)
    filer.pushBackItem(item)
    expect(filer.atSubclassData('AcDbLine')).toBe(true)
    expect(filer.atSubclassData('AcDbLine')).toBe(false)
    expect(filer.readDouble(10)).toBe(1)
    expect(filer.readDouble(20)).toBe(2)
    expect(filer.atEof).toBe(true)
  })

  it('tracks object boundaries across consecutive code-0 pairs', () => {
    const text = ['0', 'LINE', '8', '0', '0', 'CIRCLE', '0', 'EOF'].join('\n')
    const filer = AcDbDxfFiler.fromString(text)
    const ref = createReference(text)

    filer.readItem()
    ref.read()
    expect(filer.atEndOfObject).toBe(false)
    expect(filer.atEof).toBe(false)
    expectSamePredicates(filer, ref)

    filer.readItem()
    ref.read()
    expect(filer.atEndOfObject).toBe(true)
    expect(filer.atEof).toBe(false)
    expectSamePredicates(filer, ref)

    // A code-0 pair is both a boundary and a readable pair.
    filer.readItem()
    ref.read()
    expect(filer.atEndOfObject).toBe(true)
    expect(filer.atEof).toBe(false)
    expectSamePredicates(filer, ref)

    filer.readItem()
    ref.read()
    expect(filer.atEndOfObject).toBe(true)
    expect(filer.atEof).toBe(true)
    expectSamePredicates(filer, ref)

    // No-arg pushBackItem at EOF restores the last pair into the cache.
    filer.pushBackItem()
    ref.pushBackItem()
    expect(filer.atEof).toBe(false)
    expect(filer.atEndOfObject).toBe(true)
    expectSamePredicates(filer, ref)
    expect(filer.readItem()).toEqual({ code: 0, type: 'string', value: 'EOF' })
    ref.read()
    expect(filer.atEof).toBe(true)
    expectSamePredicates(filer, ref)
  })

  it('rebuilds the cached code after an expected-code mismatch pushback', () => {
    // `readString`/`readNumber`/`readHandle`/... push the pair back through the
    // private `pushBackPair` when the expected group code does not match.
    const text = ['0', 'LINE', '100', 'AcDbLine', '10', '1'].join('\n')
    const filer = AcDbDxfFiler.fromString(text)
    const ref = createReference(text)

    expect(filer.readItem()).toEqual(ref.read())
    expect(filer.atEndOfObject).toBe(false)

    // code 100 != expected 8 => the subclass marker is pushed back.
    expect(filer.readString(8)).toBeUndefined()
    ref.pushBackItem(ref.read())
    expect(filer.filerStatus).toBe(AcDbDxfFilerStatus.InvalidDxfCode)

    // The pushed-back pair must be visible to peeking and atSubclassData.
    expect(filer.peekItem()?.code).toBe(100)
    expect(filer.atEndOfObject).toBe(false)
    expect(filer.atExtendedData).toBe(false)
    expect(filer.atEof).toBe(false)
    expectSamePredicates(filer, ref)

    expect(filer.atSubclassData('AcDbLine')).toBe(true)
    expect(ref.atSubclassData('AcDbLine')).toBe(true)
    expectSamePredicates(filer, ref)

    filer.resetStatus()
    expect(filer.readDouble(10)).toBe(1)
    ref.read()
    expect(filer.atEof).toBe(true)
    expectSamePredicates(filer, ref)
  })

  it('does not consume a pair when peeking then reading', () => {
    const text = ['70', '5', '0', 'EOF'].join('\n')
    const filer = AcDbDxfFiler.fromString(text)
    const ref = createReference(text)

    expect(filer.atEndOfObject).toBe(false)
    expect(filer.atEof).toBe(false)
    // Repeated peeks must neither consume the pair nor disturb the cache.
    for (let i = 0; i < 5; i++) {
      expect(filer.peekItem()?.code).toBe(70)
      expect(filer.peekItem()?.value).toBe(5)
      expectSamePredicates(filer, ref)
    }
    expect(ref.peek()?.code).toBe(70)
    expect(filer.readItem()?.value).toBe(5)
    ref.read()
    expectSamePredicates(filer, ref)
    expect(filer.peekItem()?.code).toBe(0)
    expect(filer.atEndOfObject).toBe(true)
    expect(filer.atEof).toBe(false)
  })
})

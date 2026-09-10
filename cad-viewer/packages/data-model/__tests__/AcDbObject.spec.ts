import { AcDbDxfCode } from '../src/base/AcDbDxfCode'
import { AcDbObject, TEMP_OBJECT_ID_PREFIX } from '../src/base/AcDbObject'
import { AcDbResultBuffer } from '../src/base/AcDbResultBuffer'
import { acdbHostApplicationServices } from '../src/base/AcDbHostApplicationServices'
import { AcDbDatabase } from '../src/database/AcDbDatabase'
import { expectDetachedClone } from '../test-utils/cloneTestUtils'

function getWorkingDatabaseSlot(): {
  get: () => AcDbDatabase | null
  set: (db: AcDbDatabase | null) => void
} {
  const services = acdbHostApplicationServices() as unknown as {
    _workingDatabase: AcDbDatabase | null
  }
  return {
    get: () => services._workingDatabase,
    set: (db) => {
      services._workingDatabase = db
    }
  }
}

describe('AcDbObject', () => {
  it('creates a detached clone with a new objectId', () => {
    expectDetachedClone(() => new AcDbObject())
  })

  it('assigns a TEMP_ handle when not yet bound to a database, even if a working database exists', () => {
    const slot = getWorkingDatabaseSlot()
    const previousDb = slot.get()
    const working = new AcDbDatabase()
    slot.set(working)
    try {
      const obj = new AcDbObject()
      expect(obj.objectId.startsWith(TEMP_OBJECT_ID_PREFIX)).toBe(true)
      expect(obj.isTemp).toBe(true)
    } finally {
      slot.set(previousDb)
    }
  })

  it('accepts a real handle on an unbound object without requiring a working database', () => {
    const slot = getWorkingDatabaseSlot()
    const previousDb = slot.get()
    slot.set(null)
    try {
      const obj = new AcDbObject()
      expect(() => {
        obj.objectId = '1A2B'
      }).not.toThrow()
      expect(obj.objectId).toBe('1A2B')
      expect(obj.isTemp).toBe(false)
    } finally {
      slot.set(previousDb)
    }
  })

  it('allocates the xdata map lazily and never loses xdata on clone/restore', () => {
    const readMap = (obj: AcDbObject) =>
      (obj as unknown as { _xDataMap?: Map<string, unknown> })._xDataMap
    const xdata = (value: string) =>
      new AcDbResultBuffer([
        { code: AcDbDxfCode.ExtendedDataRegAppName, value: 'MY_APP' },
        { code: AcDbDxfCode.ExtendedDataAsciiString, value }
      ])

    const obj = new AcDbObject()
    // No `Map` is allocated for an object without xdata.
    expect(Object.getOwnPropertyNames(obj)).not.toContain('_xDataMap')
    expect(obj.getXData('MY_APP')).toBeUndefined()
    expect(() => obj.removeXData('MY_APP')).not.toThrow()

    // A clone/restore of an object without xdata must not create an empty map,
    // while restoring a snapshot that has xdata must restore it.
    const emptySnapshot = obj.clone()
    expect(readMap(emptySnapshot)).toBeUndefined()
    obj.setXData(xdata('first'))
    expect(readMap(obj)).toBeInstanceOf(Map)
    obj.restoreFrom(emptySnapshot)
    expect(readMap(obj)).toBeUndefined()
    expect(obj.getXData('MY_APP')).toBeUndefined()

    obj.setXData(xdata('second'))
    const snapshot = obj.clone()
    const restored = new AcDbObject()
    restored.restoreFrom(snapshot)
    expect(restored.getXData('MY_APP')?.at(1)?.value).toBe('second')

    // Removing the only entry keeps a (now empty) map; a later restore from an
    // empty snapshot drops it entirely.
    obj.removeXData('MY_APP')
    expect(obj.getXData('MY_APP')).toBeUndefined()
    obj.restoreFrom(obj.clone())
    expect(readMap(obj)).toBeUndefined()
  })
})

import {
  AcDbBlockTableRecord,
  AcDbBlockTableRecordFlag
} from '../src/database/AcDbBlockTableRecord'
import { expectDetachedClone } from '../test-utils/cloneTestUtils'

describe('AcDbBlockTableRecord', () => {
  it('creates a detached clone with a new objectId', () => {
    expectDetachedClone(() => new AcDbBlockTableRecord())
  })

  it('detects unresolved xrefs from flags and empty content', () => {
    const xref = new AcDbBlockTableRecord()
    xref.name = 'BASE'
    xref.flags = AcDbBlockTableRecordFlag.Xref
    xref.pathName = 'C:\\drawings\\base.dwg'
    expect(xref.isXref).toBe(true)
    expect(xref.isOverlayReference).toBe(false)
    expect(xref.isUnresolvedXref).toBe(true)

    const overlay = new AcDbBlockTableRecord()
    overlay.flags =
      AcDbBlockTableRecordFlag.XrefOverlay | AcDbBlockTableRecordFlag.Resolved
    expect(overlay.isXref).toBe(true)
    expect(overlay.isOverlayReference).toBe(true)
    expect(overlay.isUnresolvedXref).toBe(false)
  })

  it('strips AutoCAD-internal Resolved/Referenced bits on import', () => {
    // AutoCAD often writes 36 (Xref|Resolved) for attached xrefs whose geometry
    // is not present in the host file.
    const sanitized = AcDbBlockTableRecord.sanitizeImportedFlags(
      AcDbBlockTableRecordFlag.Xref | AcDbBlockTableRecordFlag.Resolved
    )
    expect(sanitized).toBe(AcDbBlockTableRecordFlag.Xref)

    const xref = new AcDbBlockTableRecord()
    xref.flags = sanitized
    xref.pathName = '.\\xref1.dwg'
    expect(xref.isUnresolvedXref).toBe(true)

    expect(
      AcDbBlockTableRecord.sanitizeImportedFlags(
        AcDbBlockTableRecordFlag.Xref |
          AcDbBlockTableRecordFlag.Resolved |
          AcDbBlockTableRecordFlag.Referenced
      )
    ).toBe(AcDbBlockTableRecordFlag.Xref)
  })

  it('recognizes model and paper space names case-insensitively', () => {
    expect(AcDbBlockTableRecord.isModelSapceName('*Model_Space')).toBe(true)
    expect(AcDbBlockTableRecord.isModelSapceName('*MODEL_SPACE')).toBe(true)
    expect(AcDbBlockTableRecord.isModelSapceName('*model_space')).toBe(true)
    expect(AcDbBlockTableRecord.isModelSapceName('*Model_Space1')).toBe(false)
    expect(AcDbBlockTableRecord.isModelSapceName('')).toBe(false)
    expect(AcDbBlockTableRecord.isModelSapceName('MyBlock')).toBe(false)

    expect(AcDbBlockTableRecord.isPaperSapceName('*Paper_Space')).toBe(true)
    expect(AcDbBlockTableRecord.isPaperSapceName('*PAPER_SPACE1')).toBe(true)
    expect(AcDbBlockTableRecord.isPaperSapceName('*paper_space0')).toBe(true)
    expect(AcDbBlockTableRecord.isPaperSapceName('*Paper')).toBe(false)
    expect(AcDbBlockTableRecord.isPaperSapceName('')).toBe(false)

    // A model space name is never a paper space name and the other way round.
    expect(
      AcDbBlockTableRecord.isPaperSapceName(
        AcDbBlockTableRecord.MODEL_SPACE_NAME
      )
    ).toBe(false)
    expect(
      AcDbBlockTableRecord.isModelSapceName(
        AcDbBlockTableRecord.PAPER_SPACE_NAME_PREFIX
      )
    ).toBe(false)
  })

  it('refreshes the cached space flags whenever the name changes', () => {
    const btr = new AcDbBlockTableRecord()
    expect(btr.isModelSapce).toBe(false)
    expect(btr.isPaperSapce).toBe(false)

    btr.name = '*Model_Space'
    expect(btr.isModelSapce).toBe(true)
    expect(btr.isPaperSapce).toBe(false)

    // Paper space name replaces the cached model space result.
    btr.name = '*Paper_Space1'
    expect(btr.isModelSapce).toBe(false)
    expect(btr.isPaperSapce).toBe(true)

    // Ordinary block name clears both cached flags.
    btr.name = 'MyBlock'
    expect(btr.isModelSapce).toBe(false)
    expect(btr.isPaperSapce).toBe(false)

    // Case variants must be cached too.
    btr.name = '*MODEL_SPACE'
    expect(btr.isModelSapce).toBe(true)
    expect(btr.isPaperSapce).toBe(false)
  })

  it('initializes and clones the cached space flags with attrs', () => {
    const paper = new AcDbBlockTableRecord({ name: '*Paper_Space2' })
    expect(paper.isModelSapce).toBe(false)
    expect(paper.isPaperSapce).toBe(true)

    const clone = paper.clone()
    expect(clone.name).toBe('*Paper_Space2')
    expect(clone.isModelSapce).toBe(false)
    expect(clone.isPaperSapce).toBe(true)

    clone.name = '*Model_Space'
    expect(clone.isModelSapce).toBe(true)
    expect(paper.isPaperSapce).toBe(true)
  })
})

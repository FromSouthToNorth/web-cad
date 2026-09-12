import type { AcDbTextStyleTableRecord } from '@hy/data-model'

import type { TextStyleFormState } from '../src/composable/useTextStyle'
import {
  applyTextStyleForm,
  clampTextStyleObliqueAngle,
  readTextStyleForm,
  TEXT_STYLE_OBLIQUE_MAX,
  TEXT_STYLE_OBLIQUE_MIN,
  useTextStyle
} from '../src/composable/useTextStyle'

jest.mock('@hy/cad-simple-viewer', () => ({
  AcApDocManager: { instance: undefined },
  AcApFontUtil: {
    ensureDrawingFontLoaded: jest.fn(async () => undefined)
  }
}))

/**
 * Structural stand-in for a STYLE table record.
 *
 * `AcDbTextStyleTableRecord` cannot be constructed without a database, and the
 * code under test only reads/writes these members, so a plain object keeps the
 * assertions focused on the form mapping.
 */
function createRecordStub(overrides: Record<string, unknown> = {}) {
  const record = {
    name: 'Standard',
    fileName: '',
    textSize: 0,
    xScale: 1,
    obliquingAngle: 0,
    isVertical: false,
    bigFontFileName: '',
    textStyle: {
      name: 'Standard',
      standardFlag: 0,
      fixedTextHeight: 0,
      widthFactor: 1,
      obliqueAngle: 0,
      textGenerationFlag: 0,
      lastHeight: 0,
      font: '',
      bigFont: ''
    },
    ...overrides
  }
  return record
}

function createForm(
  overrides: Partial<TextStyleFormState> = {}
): TextStyleFormState {
  return {
    font: 'txt',
    fontStyle: 'txt',
    useBigFont: false,
    bigFont: '',
    textHeight: 0,
    upsideDown: false,
    backwards: false,
    vertical: false,
    widthFactor: 1,
    obliqueAngle: 0,
    ...overrides
  }
}

describe('clampTextStyleObliqueAngle', () => {
  it('keeps in-range angles untouched', () => {
    expect(clampTextStyleObliqueAngle(0)).toBe(0)
    expect(clampTextStyleObliqueAngle(15)).toBe(15)
    expect(clampTextStyleObliqueAngle(-42.5)).toBe(-42.5)
  })

  it('clamps to AutoCAD bounds of -85 and 85 degrees', () => {
    expect(clampTextStyleObliqueAngle(200)).toBe(TEXT_STYLE_OBLIQUE_MAX)
    expect(clampTextStyleObliqueAngle(85.5)).toBe(TEXT_STYLE_OBLIQUE_MAX)
    expect(clampTextStyleObliqueAngle(-200)).toBe(TEXT_STYLE_OBLIQUE_MIN)
    expect(clampTextStyleObliqueAngle(-85.5)).toBe(TEXT_STYLE_OBLIQUE_MIN)
  })

  it('treats a non-finite angle as zero', () => {
    expect(clampTextStyleObliqueAngle(Number.NaN)).toBe(0)
    expect(clampTextStyleObliqueAngle(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('applyTextStyleForm', () => {
  it('clamps an out-of-range oblique angle before writing the record', () => {
    const record = createRecordStub()
    applyTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord,
      createForm({ obliqueAngle: 130 })
    )
    expect(record.obliquingAngle).toBe(TEXT_STYLE_OBLIQUE_MAX)
  })

  it('keeps a valid oblique angle verbatim', () => {
    const record = createRecordStub()
    applyTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord,
      createForm({ obliqueAngle: -30 })
    )
    expect(record.obliquingAngle).toBe(-30)
  })

  it('floors height and width factor and rebuilds the generation flags', () => {
    const record = createRecordStub()
    applyTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord,
      createForm({
        textHeight: -5,
        widthFactor: 0,
        backwards: true,
        upsideDown: true,
        vertical: false
      })
    )
    expect(record.textSize).toBe(0)
    expect(record.xScale).toBe(0.01)
    expect(record.textStyle.textGenerationFlag).toBe(2 | 4)
  })

  it('drops big font and upside-down when they do not apply', () => {
    const record = createRecordStub()
    applyTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord,
      createForm({
        useBigFont: false,
        bigFont: 'gbcbig',
        upsideDown: true,
        vertical: true
      })
    )
    expect(record.bigFontFileName).toBe('')
    expect(record.textStyle.textGenerationFlag).toBe(0)
  })
})

describe('readTextStyleForm', () => {
  it('clamps a stored out-of-range oblique angle into the dialog form', () => {
    const record = createRecordStub({ obliquingAngle: 120 })
    const form = readTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord
    )
    expect(form.obliqueAngle).toBe(TEXT_STYLE_OBLIQUE_MAX)
  })

  it('suppresses upside-down while the style is vertical', () => {
    const record = createRecordStub({
      isVertical: true,
      textStyle: { ...createRecordStub().textStyle, textGenerationFlag: 4 }
    })
    const form = readTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord
    )
    expect(form.vertical).toBe(true)
    expect(form.upsideDown).toBe(false)
  })

  it('reports big font usage from the record', () => {
    const record = createRecordStub({ bigFontFileName: 'gbcbig' })
    const form = readTextStyleForm(
      record as unknown as AcDbTextStyleTableRecord
    )
    expect(form.useBigFont).toBe(true)
    expect(form.bigFont).toBe('gbcbig')
  })
})

describe('useTextStyle font catalog', () => {
  /** Minimal document manager stand-in used by the dialog composable. */
  function createEditorStub() {
    const database = {
      textstyle: 'Standard',
      tables: {
        textStyleTable: {
          newIterator: () => [][Symbol.iterator](),
          getAt: () => undefined
        }
      }
    }
    return {
      curDocument: { database },
      avaiableFonts: [
        { name: ['simplex'], file: 'simplex.shx', type: 'shx' },
        { name: ['Arial'], file: 'Arial.ttf', type: 'mesh' }
      ]
    } as unknown as Parameters<typeof useTextStyle>[0]
  }

  it('offers a typed font name that the drawing does not reference yet', () => {
    const dialog = useTextStyle(createEditorStub())
    dialog.openDialog()
    dialog.handleFontSearch('MyCustomFont.ttf')

    const custom = dialog.fontOptions.value[0]
    expect(custom.value).toBe('MyCustomFont.ttf')
    expect(custom.custom).toBe(true)
    expect(custom.type).toBe('mesh')
  })

  it('classifies a typed SHX name as an SHX font', () => {
    const dialog = useTextStyle(createEditorStub())
    dialog.openDialog()
    dialog.handleFontSearch('mybigfont.shx')

    expect(dialog.fontOptions.value[0]).toMatchObject({
      value: 'mybigfont.shx',
      type: 'shx',
      custom: true
    })
  })

  it('does not duplicate a font that is already in the catalog', () => {
    const dialog = useTextStyle(createEditorStub())
    dialog.openDialog()
    dialog.handleFontSearch('Arial')

    const matches = dialog.fontOptions.value.filter(
      option => option.value === 'Arial'
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].custom).toBeUndefined()
  })
})

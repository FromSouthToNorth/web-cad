import { AcGiMTextData, AcGiTextStyle } from '@hy/graphic-interface'

import {
  AcDbProxyGraphic,
  AcDbProxyGraphicType
} from '../src/misc/proxyGraphic'

/**
 * Builds a text proxy graphic stream (type code 11).
 *
 * The stream starts with an 8-byte prefix that the parser skips before reading
 * the chunk header. Chunk payload fields are written in the order consumed by
 * `AcDbProxyGraphic.drawText2`: the insert point, the normal, the text
 * direction, the height, the width factor, the oblique angle, one trailing
 * float, and finally the padded text string.
 */
function buildText2ProxyGraphic(
  direction: [number, number, number]
): Uint8Array {
  const stream = new Uint8Array(8 + 8 + 124)
  const view = new DataView(stream.buffer)
  view.setUint32(8, stream.length - 8, true) // chunk size
  view.setUint32(12, AcDbProxyGraphicType.Text2, true)
  // Chunk payload starts at byte 16. Geometry first: insert point, normal and
  // text direction.
  view.setFloat64(16, 0, true) // insert x
  view.setFloat64(24, 0, true) // insert y
  view.setFloat64(32, 0, true) // insert z
  view.setFloat64(40, 0, true) // normal x
  view.setFloat64(48, 0, true) // normal y
  view.setFloat64(56, 1, true) // normal z
  view.setFloat64(64, direction[0], true) // text direction x
  view.setFloat64(72, direction[1], true) // text direction y
  view.setFloat64(80, direction[2], true) // text direction z
  // Then the padded 'T' string and the two skipped DXF longs, which end at
  // byte 92, followed by the numeric text header fields.
  stream[88] = 0x54 // 'T'
  stream[89] = 0 // string terminator
  view.setFloat64(100, 2, true) // height
  view.setFloat64(108, 1, true) // width factor
  view.setFloat64(116, Math.PI / 12, true) // oblique angle in radians
  view.setFloat64(124, 0, true) // trailing float
  return stream
}

function createRenderer() {
  return {
    subEntityTraits: {
      color: { clone: () => ({}) },
      lineType: { name: 'Continuous', definitionLines: [] },
      lineTypeScale: 1,
      lineWeight: -3,
      layer: '0',
      thickness: 0
    },
    mtext: jest.fn(),
    group: jest.fn((entities: unknown[]) => ({ id: 'group', entities }))
  }
}

describe('AcDbProxyGraphic text rendering', () => {
  it('passes the text rotation to AcGiMTextData in radians', () => {
    const parser = new AcDbProxyGraphic(buildText2ProxyGraphic([1, 1, 0]))
    const renderer = createRenderer()
    const mtextResult = { id: 'mtext' }
    let receivedMtext: AcGiMTextData | undefined
    let receivedStyle: AcGiTextStyle | undefined
    renderer.mtext.mockImplementation(
      (mtextData: AcGiMTextData, style: AcGiTextStyle) => {
        receivedMtext = mtextData
        receivedStyle = style
        return mtextResult as never
      }
    )

    const result = parser.worldDraw(renderer as never)

    expect(result).toMatchObject({ id: 'group' })
    expect(renderer.mtext).toHaveBeenCalledTimes(1)
    // Regression for P2-24: rotation used to be converted to degrees.
    expect(receivedMtext?.rotation).toBeCloseTo(Math.PI / 4, 12)
    expect(receivedMtext?.rotation).not.toBeCloseTo(45, 6)
    // The text style keeps degrees: oblique is expected in degrees.
    expect(receivedStyle?.obliqueAngle).toBeCloseTo(15, 12)
  })

  it('keeps a 90 degree rotation in radians, not degrees', () => {
    const parser = new AcDbProxyGraphic(buildText2ProxyGraphic([0, 1, 0]))
    const renderer = createRenderer()
    renderer.mtext.mockReturnValue({ id: 'mtext' } as never)

    parser.worldDraw(renderer as never)

    const received = (renderer.mtext as jest.Mock).mock
      .calls[0][0] as AcGiMTextData
    expect(received.rotation).toBeCloseTo(Math.PI / 2, 12)
    expect(received.rotation).not.toBeCloseTo(90, 6)
  })
})

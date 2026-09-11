import { MTextData, TextStyle } from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

const mockAsyncRenderMText = jest.fn()

/** Answers `getCharShape` from a simulated main-thread face catalog. */
const mockGetCharShape = jest.fn()
const mockGetCharShapeFromDefaults = jest.fn()
const mockGetCodeShapeFromSymbolFonts = jest.fn()

const mockFontLoaded = { addEventListener: jest.fn() }
const mockFontNotFound = { addEventListener: jest.fn() }

const mockUnifiedRenderer = jest.fn().mockImplementation(() => ({
  setFontUrl: jest.fn(),
  setDefaultMode: jest.fn(),
  setDefaultFonts: jest.fn(() => Promise.resolve()),
  setLazyFontLoading: jest.fn(() => Promise.resolve()),
  setAwaitFontsBeforeDraw: jest.fn(() => Promise.resolve()),
  setStyleManager: jest.fn(),
  cacheFont: jest.fn(() =>
    Promise.resolve({ fontName: 'hztxt', url: '', status: 'Success' })
  ),
  destroy: jest.fn(),
  asyncRenderMText: mockAsyncRenderMText
}))

jest.mock('@mlightcad/mtext-renderer', () => ({
  UnifiedRenderer: mockUnifiedRenderer,
  createDefaultColorSettings: jest.fn(() => ({
    byLayerColor: 0xffffff,
    byBlockColor: 0xffffff,
    color: { aci: 256 }
  })),
  FontManager: {
    instance: {
      lazyFontLoading: false,
      awaitFontsBeforeDraw: false,
      events: {
        fontLoaded: mockFontLoaded,
        fontNotFound: mockFontNotFound
      },
      getCharShape: (...args: unknown[]) => mockGetCharShape(...args),
      getCharShapeFromDefaults: (...args: unknown[]) =>
        mockGetCharShapeFromDefaults(...args),
      getCodeShapeFromSymbolFonts: (...args: unknown[]) =>
        mockGetCodeShapeFromSymbolFonts(...args)
    }
  }
}))

import { AcTrMTextRenderer } from '../src/renderer/AcTrMTextRenderer'

const style: TextStyle = {
  name: 'Standard',
  standardFlag: 0,
  fixedTextHeight: 0,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: 2.5,
  font: 'hztxt.shx',
  bigFont: ''
}

function createContent(text: string): MTextData {
  return { text, height: 2.5, width: 0, position: { x: 0, y: 0, z: 0 } }
}

/**
 * Reproduces the measured "no glyph font available" render result.
 *
 * @remarks
 * Verified against the real `@mlightcad/mtext-renderer` renderer with the font
 * manager released: MTEXT with unresolved glyphs still reports every character
 * through `createLayoutData()`, and its geometry is a single placeholder
 * `LineSegments` leaf, so neither an empty child list nor an empty layout can
 * be used as the missing-glyph signal.
 */
function createPlaceholderMText(): THREE.Object3D {
  const root = new THREE.Group()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3)
  )
  root.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial()))
  const withBox = root as unknown as {
    box: THREE.Box3
    createLayoutData: () => { lines: unknown[]; chars: unknown[] }
  }
  withBox.box = new THREE.Box3(
    new THREE.Vector3(0, -2.5, 0),
    new THREE.Vector3(4.5, 0, 0)
  )
  withBox.createLayoutData = () => ({ lines: [], chars: [] })
  return root
}

/** Simulates a main-thread catalog that can render ASCII only. */
function installAsciiOnlyCatalog() {
  const resolvable = new Set(['A', 'B', 'C', ' '])
  mockGetCharShape.mockImplementation((char: string) =>
    resolvable.has(char) ? { char } : undefined
  )
  mockGetCharShapeFromDefaults.mockReturnValue(undefined)
  mockGetCodeShapeFromSymbolFonts.mockReturnValue(undefined)
}

describe('AcTrMTextRenderer font diagnostics', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    ;(AcTrMTextRenderer as unknown as { _instance: unknown })._instance = null
    mockAsyncRenderMText.mockReset()
    mockAsyncRenderMText.mockImplementation(() => createPlaceholderMText())
    mockGetCharShape.mockReset()
    mockGetCharShapeFromDefaults.mockReset()
    mockGetCodeShapeFromSymbolFonts.mockReset()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('reports a font whose characters cannot be resolved on the worker path', async () => {
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const events: Array<{ fontName: string; count?: number; source: string }> =
      []
    renderer.events.fontNotFound.addEventListener(args => events.push(args))

    await renderer.asyncRenderMText(createContent('中文标注测试'), style)

    expect(events).toHaveLength(1)
    expect(events[0].fontName).toBe('hztxt.shx')
    expect(events[0].source).toBe('worker')
    expect(events[0].count).toBe(6)
    expect(renderer.missedFonts).toEqual({ 'hztxt.shx': 6 })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('reports each missing face once across repeated entities', async () => {
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const listener = jest.fn()
    renderer.events.fontNotFound.addEventListener(listener)

    await renderer.asyncRenderMText(createContent('中文'), style)
    await renderer.asyncRenderMText(createContent('标注'), style)
    await renderer.asyncRenderMText(createContent('测试'), style)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores MTEXT inline formatting codes when counting missing glyphs', async () => {
    // The code's own "H", "x" and "c" resolve; only the CJK body does not.
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const events: Array<{ count?: number; chars?: string[] }> = []
    renderer.events.fontNotFound.addEventListener(args => events.push(args))

    await renderer.asyncRenderMText(
      createContent('\\H2.5x;中\\C1;文\\P%%c%%d%%p'),
      style
    )

    expect(events).toHaveLength(1)
    expect(events[0].count).toBe(2)
    expect(events[0].chars).toEqual(['中', '文'])
  })

  it('stays silent when every printable character resolves', async () => {
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const listener = jest.fn()
    renderer.events.fontNotFound.addEventListener(listener)

    await renderer.asyncRenderMText(createContent('ABC'), style)

    expect(listener).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('ignores whitespace, empty content and MTEXT control codes', async () => {
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const listener = jest.fn()
    renderer.events.fontNotFound.addEventListener(listener)

    await renderer.asyncRenderMText(createContent(''), style)
    await renderer.asyncRenderMText(createContent('   '), style)
    await renderer.asyncRenderMText(createContent('\\P'), style)

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not probe in main render mode, where FontManager already reports', async () => {
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.setRenderMode('main')
    renderer.initialize('worker.js')

    const listener = jest.fn()
    renderer.events.fontNotFound.addEventListener(listener)

    await renderer.asyncRenderMText(createContent('中文'), style)

    expect(listener).not.toHaveBeenCalled()
  })

  it('reports a failing worker render as an observable font failure', async () => {
    installAsciiOnlyCatalog()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const events: Array<{ fontName: string; source: string }> = []
    renderer.events.fontNotFound.addEventListener(args => events.push(args))

    mockAsyncRenderMText.mockRejectedValue(new Error('Unknown message type'))

    await expect(
      renderer.asyncRenderMText(createContent('中文'), style)
    ).rejects.toThrow('Unknown message type')

    expect(events).toEqual([{ fontName: 'hztxt.shx', source: 'worker-error' }])
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('mirrors main-thread fontNotFound events into the renderer channel', () => {
    mockFontNotFound.addEventListener.mockClear()
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const listener = jest.fn()
    renderer.events.fontNotFound.addEventListener(listener)

    type NotFoundListener = (args: { fontName: string; count?: number }) => void
    const mirror = (
      mockFontNotFound.addEventListener.mock.calls[0] as [NotFoundListener]
    )[0]
    mirror({ fontName: 'simsun', count: 3 })

    expect(listener).toHaveBeenCalledWith({
      fontName: 'simsun',
      count: 3,
      source: 'main-thread'
    })
  })
})

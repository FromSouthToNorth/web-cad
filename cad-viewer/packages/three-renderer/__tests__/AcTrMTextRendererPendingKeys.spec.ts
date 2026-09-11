import { ColorSettings, MTextData, TextStyle } from '@mlightcad/mtext-renderer'
import * as THREE from 'three'

/**
 * Bounded-growth tests for the renderer's pending glyph-key map.
 *
 * `_pendingGlyphKeys` remembers content rendered exactly once, so a second
 * occurrence can be promoted into the content-level glyph cache. A drawing whose
 * labels are mostly unique (380k-entity plans) must not retain one key per
 * entity for the whole session, and the bound must not be bought by giving up
 * promotion: a repeat of a recently drawn label still has to hit the cache.
 */

const mockAsyncRenderMText = jest.fn()
const mockSyncRenderMText = jest.fn()

const mockFontLoadedListeners: Array<() => void> = []
const mockFontLoaded = {
  addEventListener: jest.fn((listener: () => void) => {
    mockFontLoadedListeners.push(listener)
  })
}

const mockUnifiedRenderer = jest.fn().mockImplementation(() => ({
  setFontUrl: jest.fn(),
  setDefaultMode: jest.fn(),
  setDefaultFonts: jest.fn(() => Promise.resolve()),
  setLazyFontLoading: jest.fn(() => Promise.resolve()),
  setAwaitFontsBeforeDraw: jest.fn(() => Promise.resolve()),
  setStyleManager: jest.fn(),
  destroy: jest.fn(),
  estimateMemoryUsage: jest.fn(),
  asyncRenderMText: mockAsyncRenderMText,
  syncRenderMText: mockSyncRenderMText
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
        fontNotFound: { addEventListener: jest.fn() }
      },
      estimateMemoryUsage: jest.fn()
    }
  }
}))

import { AcTrMTextGlyphCache } from '../src/renderer/AcTrMTextGlyphCache'
import { AcTrMTextRenderer } from '../src/renderer/AcTrMTextRenderer'

const style: TextStyle = {
  name: 'Standard',
  standardFlag: 0,
  fixedTextHeight: 0,
  widthFactor: 1,
  obliqueAngle: 0,
  textGenerationFlag: 0,
  lastHeight: 2.5,
  font: 'arial.ttf',
  bigFont: 'gbcbig.shx'
}

/**
 * Cap declared by `MAX_PENDING_GLYPH_KEYS` in AcTrMTextRenderer.
 *
 * Duplicated on purpose: importing the constant would keep the test passing if
 * it were ever raised to an unbounded value.
 */
const MAX_PENDING_GLYPH_KEYS = 4096

function createContent(text: string): MTextData {
  return { text, height: 2.5, width: 0, position: { x: 0, y: 0, z: 0 } }
}

function installRenderMock(mock: jest.Mock) {
  mock.mockImplementation((content: MTextData) => {
    const root = new THREE.Group()
    root.position.set(
      content.position.x,
      content.position.y,
      content.position.z
    )
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    )
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
    root.userData.logicalBounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 }
    ;(root as unknown as { box: THREE.Box3 }).box = new THREE.Box3()
    return root
  })
}

/** Reads the private pending-key map, which has no public accessor. */
function pendingGlyphKeys(renderer: AcTrMTextRenderer): Map<string, number> {
  return (renderer as unknown as { _pendingGlyphKeys: Map<string, number> })
    ._pendingGlyphKeys
}

/** Renders `count` distinct labels through the async path, in order. */
async function renderUniqueLabels(
  renderer: AcTrMTextRenderer,
  count: number,
  prefix = 'label'
) {
  for (let i = 0; i < count; i++) {
    await renderer.asyncRenderMText(createContent(`${prefix}-${i}`), style)
  }
}

describe('AcTrMTextRenderer pending glyph keys', () => {
  beforeEach(() => {
    ;(AcTrMTextRenderer as unknown as { _instance: unknown })._instance = null
    mockAsyncRenderMText.mockReset()
    mockSyncRenderMText.mockReset()
    mockFontLoaded.addEventListener.mockClear()
    mockFontLoadedListeners.length = 0
    installRenderMock(mockAsyncRenderMText)
    installRenderMock(mockSyncRenderMText)
  })

  it('keeps the pending key map bounded while rendering unique labels', async () => {
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    // The count is exact on purpose: one label past the cap trims the map back
    // to the same half-sized map the defect produces, so the cap itself is the
    // only count at which the two behaviours differ.
    await renderUniqueLabels(renderer, MAX_PENDING_GLYPH_KEYS)

    const pending = pendingGlyphKeys(renderer)
    // The declared cap must be the trim *trigger*. With the trigger and the
    // target both set to half the cap, the map never holds more than 2048 keys
    // and half of the promotion window the constant promises is silently lost.
    expect(pending.size).toBe(MAX_PENDING_GLYPH_KEYS)
    // Nothing unique was promoted into the template cache.
    expect(renderer.getContentGlyphCacheStats().count).toBe(0)
    expect(mockAsyncRenderMText).toHaveBeenCalledTimes(MAX_PENDING_GLYPH_KEYS)
  }, 120000)

  it('drops the oldest keys first when the map is trimmed', async () => {
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')
    const pending = pendingGlyphKeys(renderer)

    await renderUniqueLabels(renderer, 5000)

    // The map is bounded well below the number of labels drawn, so the
    // earliest ones were evicted and the newest are still tracked.
    expect(pending.size).toBeLessThan(5000)
    expect(pending.size).toBeLessThanOrEqual(MAX_PENDING_GLYPH_KEYS)
    expect(pending.has('label-0')).toBe(false)
    const keys = Array.from(pending.keys())
    expect(keys[0].startsWith('label-0')).toBe(false)
    expect(keys[keys.length - 1].startsWith('label-4999')).toBe(true)
    // The survivors are the contiguous newest run of the render order, which
    // is what "the newest half survives" means for insertion-order trimming.
    const firstSurvivor = Number(
      keys[0].slice('label-'.length).split('\u0001')[0]
    )
    expect(firstSurvivor).toBeGreaterThan(0)
    expect(firstSurvivor + pending.size).toBe(5000)
  }, 120000)

  it('promotes a recently rendered label on its second occurrence', async () => {
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const content = createContent('repeat-me')
    // The pending map is keyed on content *and* style *and* colour, so the
    // assertion has to use the renderer's own key: a lookup by raw text can
    // never fail and therefore proves nothing.
    // Read the mock through `requireMock`: a top-level value import of the
    // mocked module would make Jest evaluate the `jest.mock` factory before its
    // `mock*` consts are initialized.
    const colorSettings = (
      jest.requireMock('@mlightcad/mtext-renderer') as {
        createDefaultColorSettings: () => ColorSettings
      }
    ).createDefaultColorSettings()
    const key = new AcTrMTextGlyphCache().buildKey(
      content,
      style,
      colorSettings
    )
    expect(key.split('\u0001')[0]).toBe('repeat-me')

    await renderer.asyncRenderMText(content, style, colorSettings)
    expect(renderer.getContentGlyphCacheStats().count).toBe(0)
    // The first occurrence is tracked under exactly that key.
    expect(Array.from(pendingGlyphKeys(renderer).keys())).toEqual([key])

    await renderer.asyncRenderMText(content, style, colorSettings)
    expect(renderer.getContentGlyphCacheStats().count).toBe(1)
    // The promoted key leaves the pending map: it now lives in the cache.
    expect(pendingGlyphKeys(renderer).has(key)).toBe(false)

    await renderer.asyncRenderMText(content, style, colorSettings)
    expect(mockAsyncRenderMText).toHaveBeenCalledTimes(2)
  })

  it('clears pending keys and cached templates on a document switch', async () => {
    const renderer = AcTrMTextRenderer.getInstance()
    renderer.initialize('worker.js')

    const repeated = createContent('repeated-label')
    await renderer.asyncRenderMText(repeated, style)
    await renderer.asyncRenderMText(repeated, style)
    expect(renderer.getContentGlyphCacheStats().count).toBe(1)

    await renderer.asyncRenderMText(createContent('unique-a'), style)
    await renderer.asyncRenderMText(createContent('unique-b'), style)
    expect(pendingGlyphKeys(renderer).size).toBe(2)

    renderer.clearDocumentState()

    expect(renderer.getContentGlyphCacheStats().count).toBe(0)
    expect(pendingGlyphKeys(renderer).size).toBe(0)

    // A label cached for the previous document must render again, and the
    // re-render starts a fresh pending entry.
    await renderer.asyncRenderMText(repeated, style)
    expect(mockAsyncRenderMText).toHaveBeenCalledTimes(5)
    expect(pendingGlyphKeys(renderer).size).toBe(1)
    await renderer.asyncRenderMText(repeated, style)
    expect(mockAsyncRenderMText).toHaveBeenCalledTimes(6)
    expect(renderer.getContentGlyphCacheStats().count).toBe(1)
  })
})

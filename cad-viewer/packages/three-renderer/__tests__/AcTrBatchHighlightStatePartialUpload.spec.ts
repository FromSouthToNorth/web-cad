import { installBatchHighlightRenderer } from '../src/batch/highlight/AcTrBatchHighlightShaders'
import {
  AcTrBatchHighlightState,
  acTrSetBatchMaskPartialUploadEnabled
} from '../src/batch/highlight/AcTrBatchHighlightState'

function createFakeRenderer(withTexture = true) {
  const gl = {
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    bindTexture: jest.fn(),
    texSubImage2D: jest.fn()
  }
  return {
    gl,
    renderer: {
      getContext: () => gl,
      properties: {
        get: () => (withTexture ? { __webglTexture: { id: 1 } } : undefined)
      }
    }
  }
}

describe('AcTrBatchHighlightState partial upload', () => {
  afterEach(() => {
    acTrSetBatchMaskPartialUploadEnabled(true)
  })

  it('uploads only the single-row dirty window via texSubImage2D', () => {
    const state = new AcTrBatchHighlightState()
    state.setAddressableSlotCount(100)
    state.setHighlight(0, 'select', true)
    const texture = state.uploadMaskTexture() // creation: full upload
    const versionAfterCreate = texture.version

    state.setHighlight(5, 'select', true)
    const uploaded = state.uploadMaskTexture()
    // The partial path records the region without bumping `version`, so
    // three.js will not re-upload the whole texture at the next render.
    expect(uploaded.version).toBe(versionAfterCreate)

    const fake = createFakeRenderer(true)
    state.uploadPendingMaskRegion(fake.renderer as never)
    expect(fake.gl.bindTexture).toHaveBeenCalledWith(3553, { id: 1 })
    expect(fake.gl.texSubImage2D).toHaveBeenCalledTimes(1)
    const call = fake.gl.texSubImage2D.mock.calls[0]
    expect(call[0]).toBe(3553) // target
    expect(call[1]).toBe(0) // level
    expect(call[2]).toBe(5) // x: the dirty window is just slot 5
    expect(call[3]).toBe(0) // y
    expect(call[4]).toBe(1) // width
    expect(call[5]).toBe(1) // height
    expect(call[6]).toBe(6408) // format
    expect(call[7]).toBe(5121) // type
    const data = call[8] as Uint8Array
    expect(data.length).toBe(4)
    expect(data[0]).toBe(255) // slot 5 selected

    // A second dirty change produces a new sub-upload at the right offset.
    state.setHighlight(20, 'select', true)
    state.uploadMaskTexture()
    state.uploadPendingMaskRegion(fake.renderer as never)
    expect(fake.gl.texSubImage2D).toHaveBeenCalledTimes(2)
    const second = fake.gl.texSubImage2D.mock.calls[1]
    expect(second[2]).toBe(20)
    expect(second[4]).toBe(1)
    expect((second[8] as Uint8Array).length).toBe(4)
  })

  it('keeps a pending clear upload after the last hover is removed', () => {
    const state = new AcTrBatchHighlightState()
    state.setAddressableSlotCount(100)
    state.setHighlight(5, 'hover', true)
    state.uploadMaskTexture() // create the texture with a full upload

    // Unhover clears the CPU mask but the GPU clear is deferred until the
    // next onBeforeRender flush; the state must report it as pending.
    state.setHighlight(5, 'hover', false)
    state.uploadMaskTexture()
    expect(state.hasPendingMaskUpload()).toBe(true)

    const fake = createFakeRenderer(true)
    state.uploadPendingMaskRegion(fake.renderer as never)
    expect(fake.gl.texSubImage2D).toHaveBeenCalledTimes(1)
    const call = fake.gl.texSubImage2D.mock.calls[0]
    expect(call[2]).toBe(5) // x
    expect(call[4]).toBe(1) // width
    const data = call[8] as Uint8Array
    expect(data[0]).toBe(0)
    expect(data[1]).toBe(0) // hovered channel cleared
    expect(state.hasPendingMaskUpload()).toBe(false)
  })

  it('flushes a pending clear on the next draw after the last highlight', () => {
    const object = { userData: {}, onBeforeRender: undefined } as never
    const state = {
      hasAnyHighlight: () => false,
      hasPendingMaskUpload: () => true,
      uploadPendingMaskRegion: jest.fn()
    }
    installBatchHighlightRenderer(object, state as never)

    ;(object as unknown as { onBeforeRender: (...args: unknown[]) => void }).onBeforeRender(
      {},
      {},
      {},
      {},
      {},
      {}
    )
    expect(state.uploadPendingMaskRegion).toHaveBeenCalledTimes(1)
  })

  it('falls back to a full upload when the texture was never uploaded', () => {
    const state = new AcTrBatchHighlightState()
    state.setAddressableSlotCount(100)
    state.setHighlight(0, 'select', true)
    const texture = state.uploadMaskTexture()
    const versionBefore = texture.version

    state.setHighlight(10, 'select', true)
    state.uploadMaskTexture() // pending recorded

    // No GL texture yet: the fallback consumes the pending region and bumps
    // the version so three.js re-uploads the whole texture.
    state.uploadPendingMaskRegion(
      createFakeRenderer(false).renderer as never
    )
    expect(texture.version).toBe(versionBefore + 1)

    const fake = createFakeRenderer(true)
    state.uploadPendingMaskRegion(fake.renderer as never)
    expect(fake.gl.texSubImage2D).not.toHaveBeenCalled()
  })

  it('re-uploads whole when the switch is disabled', () => {
    acTrSetBatchMaskPartialUploadEnabled(false)
    const state = new AcTrBatchHighlightState()
    state.setAddressableSlotCount(100)
    state.setHighlight(0, 'select', true)
    const texture = state.uploadMaskTexture()
    const versionBefore = texture.version

    state.setHighlight(1, 'select', true)
    state.uploadMaskTexture()
    expect(texture.version).toBe(versionBefore + 1)
  })

  it('falls back to a full upload for cross-row dirty windows', () => {
    const state = new AcTrBatchHighlightState()
    state.setAddressableSlotCount(5000) // 4096x2 layout
    state.setHighlight(0, 'select', true)
    const texture = state.uploadMaskTexture()
    const versionBefore = texture.version

    state.setHighlight(5, 'select', true) // row 0
    state.setHighlight(4096, 'select', true) // row 1 → dirty window [5, 4096]
    state.uploadMaskTexture()
    expect(texture.version).toBe(versionBefore + 1)
  })

  it('clears the pending region when a layout change recreates the texture', () => {
    const state = new AcTrBatchHighlightState()
    state.setAddressableSlotCount(100)
    state.setHighlight(0, 'select', true)
    state.uploadMaskTexture()
    state.setHighlight(5, 'select', true)
    state.uploadMaskTexture() // pending recorded

    state.setAddressableSlotCount(5000) // layout change
    state.uploadMaskTexture() // recreation clears the pending region

    const fake = createFakeRenderer(true)
    state.uploadPendingMaskRegion(fake.renderer as never)
    expect(fake.gl.texSubImage2D).not.toHaveBeenCalled()
  })
})

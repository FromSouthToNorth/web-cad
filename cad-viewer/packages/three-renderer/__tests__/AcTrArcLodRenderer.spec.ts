import {
  AcGeCircArc3d,
  AcGeEllipseArc3d,
  AcGePoint3d,
  AcGeVector3d
} from '@mlightcad/data-model'
import * as THREE from 'three'

import { acTrSetArcLodEnabled } from '../src/draw/AcTrArcLod'
import { AcTrRenderer } from '../src/renderer/AcTrRenderer'

function createRenderer() {
  const webgl = {
    getSize: (target: THREE.Vector2) => target.set(800, 600)
  } as unknown as THREE.WebGLRenderer
  return new AcTrRenderer(webgl)
}

function captureCircularArc(
  renderer: AcTrRenderer,
  radius: number,
  sweep = Math.PI * 2
): Float64Array | null {
  const arc = new AcGeCircArc3d(
    new AcGePoint3d(0, 0, 0),
    radius,
    0,
    sweep,
    AcGeVector3d.Z_AXIS,
    AcGeVector3d.X_AXIS
  )
  renderer.beginDirectCapture()
  renderer.circularArc(arc)
  const payload = renderer.takeDirectCapture()
  return payload?.kind === 'lineStrip' &&
    payload.points instanceof Float64Array
    ? payload.points
    : null
}

function captureEllipticalArc(
  renderer: AcTrRenderer,
  major: number,
  minor: number
): Float64Array | null {
  const ellipse = new AcGeEllipseArc3d(
    new AcGePoint3d(0, 0, 0),
    AcGeVector3d.Z_AXIS,
    AcGeVector3d.X_AXIS,
    major,
    minor,
    0,
    Math.PI * 2
  )
  renderer.beginDirectCapture()
  renderer.ellipticalArc(ellipse)
  const payload = renderer.takeDirectCapture()
  return payload?.kind === 'lineStrip' &&
    payload.points instanceof Float64Array
    ? payload.points
    : null
}

describe('AcTrRenderer arc tessellation LOD', () => {
  afterEach(() => {
    acTrSetArcLodEnabled(true)
  })

  it('keeps the legacy 100 segments when no scale reference is available', () => {
    const renderer = createRenderer()
    expect(renderer.context.arcLodDiagonal).toBe(0)
    const points = captureCircularArc(renderer, 2)
    expect(points?.length).toBe(101 * 3)
  })

  it('reduces a small full circle to 16 segments against a large drawing', () => {
    const renderer = createRenderer()
    renderer.context.arcLodDiagonal = 1e6
    const points = captureCircularArc(renderer, 2)
    expect(points?.length).toBe(17 * 3)
  })

  it('uses 48 segments for a mid-size circle', () => {
    const renderer = createRenderer()
    renderer.context.arcLodDiagonal = 1e6
    const points = captureCircularArc(renderer, 2000)
    expect(points?.length).toBe(49 * 3)
  })

  it('keeps 100 segments for a large circle', () => {
    const renderer = createRenderer()
    renderer.context.arcLodDiagonal = 1e6
    const points = captureCircularArc(renderer, 20000)
    expect(points?.length).toBe(101 * 3)
  })

  it('floors partial arcs at 8 segments', () => {
    const renderer = createRenderer()
    renderer.context.arcLodDiagonal = 1e6
    const points = captureCircularArc(renderer, 2, Math.PI / 2)
    expect(points?.length).toBe(9 * 3)
  })

  it('uses the larger ellipse radius as the LOD scale', () => {
    const renderer = createRenderer()
    renderer.context.arcLodDiagonal = 1e6
    // major 2, minor 20000: the larger radius keeps the full tessellation.
    const points = captureEllipticalArc(renderer, 2, 20000)
    expect(points?.length).toBe(101 * 3)
    const small = captureEllipticalArc(renderer, 2, 1)
    expect(small?.length).toBe(17 * 3)
  })

  it('restores the legacy tessellation when the flag is disabled', () => {
    acTrSetArcLodEnabled(false)
    const renderer = createRenderer()
    renderer.context.arcLodDiagonal = 1e6
    const points = captureCircularArc(renderer, 2)
    expect(points?.length).toBe(101 * 3)
  })
})

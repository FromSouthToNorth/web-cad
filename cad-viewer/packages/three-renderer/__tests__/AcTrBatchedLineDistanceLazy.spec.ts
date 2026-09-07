import * as THREE from 'three'

import { AcTrBufferGeometryUtil } from '../src/util/AcTrBufferGeometryUtil'
import {
  AcTrBatchedLine,
  acTrSetBatchLineDistanceLazyEnabled
} from '../src/batch/AcTrBatchedLine'

function buildLineGeometry(segments: [number, number, number][][]) {
  const geometry = new THREE.BufferGeometry()
  const points: number[] = []
  const indices: number[] = []
  for (const segment of segments) {
    for (const point of segment) {
      indices.push(points.length / 3)
      points.push(point[0], point[1], point[2])
    }
  }
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(points), 3)
  )
  geometry.setIndex(indices)
  return geometry
}

/** Copies the source segments so in-place batch rebasing never mutates them. */
function freshGeometry(
  segments: [number, number, number][][]
): THREE.BufferGeometry {
  return buildLineGeometry(segments.map(seg => seg.map(p => [...p])))
}

function makeDashMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: 'attribute float lineDistance; void main() {}',
    fragmentShader: 'void main() {}'
  })
}

describe('AcTrBatchedLine distance lazy', () => {
  afterEach(() => {
    acTrSetBatchLineDistanceLazyEnabled(true)
  })

  it('defers lineDistance for solid materials and keeps the layout uniform', () => {
    const batch = new AcTrBatchedLine(
      1000,
      2000,
      new THREE.LineBasicMaterial()
    )
    const geometry = freshGeometry([
      [[0, 0, 0], [10, 0, 0]],
      [[10, 0, 0], [10, 10, 0]]
    ])
    batch.addGeometry(geometry)
    batch.addGeometry(freshGeometry([[[0, 0, 0], [5, 0, 0]]]))

    expect(geometry.hasAttribute('lineDistance')).toBe(false)
    expect(batch.geometry.hasAttribute('lineDistance')).toBe(false)
    expect(batch.getGeometryRangeAt(0).vertexCount).toBe(4)
    expect(batch.getGeometryRangeAt(1).vertexCount).toBe(2)
  })

  it('materializes on first highlight for thin-line materials', () => {
    const batch = new AcTrBatchedLine(
      1000,
      2000,
      new THREE.LineBasicMaterial()
    )
    batch.addGeometry(freshGeometry([[[0, 0, 0], [10, 0, 0]]]))
    expect(batch.geometry.hasAttribute('lineDistance')).toBe(false)

    batch.setHighlightAt(0, 'select', true)
    expect(batch.geometry.hasAttribute('lineDistance')).toBe(true)
  })

  it('defers pattern-line materials too and materializes on highlight', () => {
    const batch = new AcTrBatchedLine(1000, 2000, makeDashMaterial())
    batch.addGeometry(freshGeometry([[[0, 0, 0], [10, 0, 0]]]))
    expect(batch.geometry.hasAttribute('lineDistance')).toBe(false)

    batch.setHighlightAt(0, 'select', true)
    expect(batch.geometry.hasAttribute('lineDistance')).toBe(true)
  })

  it('materializes per-slot distances on first highlight after a material swap', () => {
    const batch = new AcTrBatchedLine(
      1000,
      2000,
      new THREE.LineBasicMaterial()
    )
    const segmentsA: [number, number, number][][] = [
      [[0, 0, 0], [10, 0, 0]],
      [[10, 0, 0], [10, 10, 0]]
    ]
    const segmentsB: [number, number, number][][] = [
      [[0, 0, 0], [3, 4, 0]],
      [[3, 4, 0], [3, 4, 12]]
    ]
    batch.addGeometry(freshGeometry(segmentsA))
    batch.addGeometry(freshGeometry(segmentsB))

    // Reference distances are translation-invariant, so they can be computed
    // on a fresh copy even though the batch rebases vertices in place.
    const refA = freshGeometry(segmentsA)
    const refB = freshGeometry(segmentsB)
    AcTrBufferGeometryUtil.computeSegmentLineDistances(refA)
    AcTrBufferGeometryUtil.computeSegmentLineDistances(refB)

    batch.material = makeDashMaterial()
    batch.setHighlightAt(0, 'select', true)

    const distances = batch.geometry.getAttribute(
      'lineDistance'
    ) as THREE.BufferAttribute
    expect(distances.count).toBe(
      batch.geometry.getAttribute('position').count
    )
    const slotA = batch.getGeometryRangeAt(0)
    expect(
      Array.from(
        distances.array.slice(slotA.vertexStart, slotA.vertexStart + 4)
      )
    ).toEqual(
      Array.from(
        (refA.getAttribute('lineDistance') as THREE.BufferAttribute).array
      )
    )
    const slotB = batch.getGeometryRangeAt(1)
    expect(
      Array.from(
        distances.array.slice(slotB.vertexStart, slotB.vertexStart + 4)
      )
    ).toEqual(
      Array.from(
        (refB.getAttribute('lineDistance') as THREE.BufferAttribute).array
      )
    )

    // After materialization the batch accepts new geometry again.
    const geometry = freshGeometry([[[0, 0, 0], [5, 0, 0]]])
    batch.addGeometry(geometry)
    expect(geometry.hasAttribute('lineDistance')).toBe(true)
  })

  it('restores eager behavior when the lazy switch is disabled', () => {
    acTrSetBatchLineDistanceLazyEnabled(false)
    const batch = new AcTrBatchedLine(
      1000,
      2000,
      new THREE.LineBasicMaterial()
    )
    batch.addGeometry(freshGeometry([[[0, 0, 0], [10, 0, 0]]]))

    expect(batch.geometry.hasAttribute('lineDistance')).toBe(true)
  })
})

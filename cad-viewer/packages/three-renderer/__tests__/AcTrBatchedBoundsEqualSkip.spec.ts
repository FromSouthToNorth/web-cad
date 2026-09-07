import * as THREE from 'three'

import { AcTrBatchedLine } from '../src/batch/AcTrBatchedLine'

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

describe('AcTrBatchedLine bounds equal-skip', () => {
  it('skips the frustum-bounds invalidation when a rewrite keeps the same extents', () => {
    const batch = new AcTrBatchedLine(
      1000,
      2000,
      new THREE.LineBasicMaterial()
    )
    const segments: [number, number, number][][] = [
      [[0, 0, 0], [10, 0, 0]],
      [[10, 0, 0], [10, 10, 0]]
    ]
    const geometry = buildLineGeometry(segments)
    const id = batch.addGeometry(geometry) // rebased in place by the batch

    batch.syncFrustumBounds()
    expect(batch.frustumCulled).toBe(true)

    // Rewrite the same (batch-local) vertex data: extents unchanged, so the
    // aggregate sphere stays valid and culling remains enabled.
    batch.setGeometryAt(id, geometry)
    expect(batch.frustumCulled).toBe(true)
    expect(batch.geometry.boundingSphere).not.toBeNull()
  })

  it('still invalidates when the rewrite changes the extents', () => {
    const batch = new AcTrBatchedLine(
      1000,
      2000,
      new THREE.LineBasicMaterial()
    )
    const geometry = buildLineGeometry([
      [[0, 0, 0], [10, 0, 0]],
      [[10, 0, 0], [10, 10, 0]]
    ])
    const id = batch.addGeometry(geometry)

    batch.syncFrustumBounds()
    expect(batch.frustumCulled).toBe(true)

    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    position.setXYZ(1, 50, 0, 0)
    position.setXYZ(3, 50, 50, 0)
    position.needsUpdate = true
    batch.setGeometryAt(id, geometry)
    expect(batch.frustumCulled).toBe(false)

    batch.syncFrustumBounds()
    expect(batch.frustumCulled).toBe(true)
  })
})

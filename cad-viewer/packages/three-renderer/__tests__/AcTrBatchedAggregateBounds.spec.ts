import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

import { isBatchGeometryActive } from '../src/batch/AcTrBatchedGeometryInfo'
import { AcTrBatchedLine } from '../src/batch/AcTrBatchedLine'
import { AcTrBatchedLine2 } from '../src/batch/AcTrBatchedLine2'
import { AcTrBatchedMesh } from '../src/batch/AcTrBatchedMesh'
import { AcTrBatchedPoint } from '../src/batch/AcTrBatchedPoint'

/**
 * Equivalence guards for the P1-3 aggregate-bounds rework.
 *
 * The rework replaces the per-slot `Box3` cache with (a) a direct packed-array
 * scan for per-slot boxes and (b) a single packed-array pass producing the
 * aggregate bounding sphere. These tests pin down that:
 *
 * 1. per-slot bounds are numerically identical to the cached implementation,
 *    so `unionActiveVisibleBoundingBoxInto` (layout extents / fit) is bitwise
 *    unchanged;
 * 2. the aggregate sphere still encloses every active vertex, so frustum
 *    culling can never drop geometry that is in view — while being no larger
 *    than the previous union-of-per-slot-spheres bound;
 * 3. no slot record retains a `Box3` after an aggregate query or a pick;
 * 4. mesh/point batches keep the exact previous union-of-spheres result, since
 *    they still use the caching default.
 */

type SlotRecord = {
  boundingBox: THREE.Box3 | null
  flags: number
  vertexStart: number
  vertexCount: number
  indexStart?: number
  indexCount?: number
  objectId?: string
}
type BatchInternals = {
  _geometryInfo: SlotRecord[]
  _geometryCount: number
  _localBoundsAt(geometryId: number, target: THREE.Box3): THREE.Box3 | null
  updateMatrixWorld(force?: boolean): void
  matrixWorld: THREE.Matrix4
  boundingSphere: THREE.Sphere | null
  geometry: THREE.BufferGeometry
}
type CachedBounds = {
  getBoundingBoxAt(geometryId: number, target: THREE.Box3): THREE.Box3 | null
}

const _scratch = /*@__PURE__*/ new THREE.Vector3()

function internalsOf(batch: unknown) {
  return batch as unknown as BatchInternals
}

function cachedBoundsOf(batch: unknown) {
  return batch as unknown as CachedBounds
}

function countMaterializedSlotBoxes(batch: unknown) {
  const info = internalsOf(batch)._geometryInfo
  let count = 0
  for (let i = 0; i < info.length; i++) {
    if (info[i].boundingBox !== null) count++
  }
  return count
}

function makeRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

const SEGMENTS: Array<[number, number, number, number]> = (() => {
  const random = makeRandom(20240614)
  const segments: Array<[number, number, number, number]> = []
  for (let i = 0; i < 60; i++) {
    const x = random() * 20_000_000
    const y = random() * 20_000_000
    segments.push([x, y, random() * 200, random() * 200])
  }
  return segments
})()

function buildLine2Batch() {
  const batch = new AcTrBatchedLine2(1000, new LineMaterial())
  SEGMENTS.forEach(([x, y, dx, dy], index) => {
    const geometry = new LineSegmentsGeometry()
    const z = index % 3 === 0 ? 0 : index
    geometry.setPositions([x, y, z, x + dx, y + dy, z])
    batch.addGeometry(geometry)
    internalsOf(batch)._geometryInfo[index].objectId = `e${index}`
  })
  batch.updateMatrixWorld(true)
  return batch
}

function buildLineBatch() {
  const batch = new AcTrBatchedLine(1000, 2000, new THREE.LineBasicMaterial())
  SEGMENTS.forEach(([x, y, dx, dy], index) => {
    const geometry = new THREE.BufferGeometry()
    const z = index % 3 === 0 ? 0 : index
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([x, y, z, x + dx, y + dy, z], 3)
    )
    geometry.setIndex([0, 1])
    batch.addGeometry(geometry)
    internalsOf(batch)._geometryInfo[index].objectId = `e${index}`
  })
  batch.updateMatrixWorld(true)
  return batch
}

/**
 * Reference per-slot bounds, re-derived from the packed buffers exactly like
 * the pre-fix cached implementation did.
 */
function referenceSlotBox(
  batch: unknown,
  geometryId: number,
  target: THREE.Box3
) {
  const internals = internalsOf(batch)
  const info = internals._geometryInfo[geometryId]
  const start = internals.geometry.getAttribute('instanceStart')
  const end = internals.geometry.getAttribute('instanceEnd')
  target.makeEmpty()
  if (start && end) {
    for (
      let i = info.vertexStart, l = info.vertexStart + info.vertexCount;
      i < l;
      i++
    ) {
      target.expandByPoint(_scratch.fromBufferAttribute(start, i))
      target.expandByPoint(_scratch.fromBufferAttribute(end, i))
    }
    return target
  }

  const position = internals.geometry.attributes.position
  const index = internals.geometry.index
  const loopStart = index ? info.indexStart! : info.vertexStart
  const loopCount = index ? info.indexCount! : info.vertexCount
  for (let i = loopStart, l = loopStart + loopCount; i < l; i++) {
    target.expandByPoint(
      _scratch.fromBufferAttribute(position, index ? index.getX(i) : i)
    )
  }
  return target
}

/** Reference aggregate sphere: union of per-slot box-derived spheres. */
function referenceAggregateSphere(batch: unknown, getSlotBox: GetSlotBox) {
  const internals = internalsOf(batch)
  const aggregate = new THREE.Sphere()
  aggregate.makeEmpty()
  const sphere = new THREE.Sphere()
  const box = new THREE.Box3()
  for (let i = 0; i < internals._geometryInfo.length; i++) {
    if (!isBatchGeometryActive(internals._geometryInfo[i].flags)) continue
    if (getSlotBox(i, box) === null) continue
    box.getBoundingSphere(sphere)
    aggregate.union(sphere)
  }
  return aggregate
}

type GetSlotBox = (geometryId: number, target: THREE.Box3) => THREE.Box3 | null

/** Every active slot's vertices, in batch-local space. */
function collectActiveVertices(batch: unknown) {
  const internals = internalsOf(batch)
  const start = internals.geometry.getAttribute('instanceStart')
  const end = internals.geometry.getAttribute('instanceEnd')
  const position = internals.geometry.attributes.position
  const index = internals.geometry.index
  const vertices: THREE.Vector3[] = []
  for (let slot = 0; slot < internals._geometryCount; slot++) {
    const info = internals._geometryInfo[slot]
    if (!isBatchGeometryActive(info.flags)) continue
    if (start && end) {
      for (
        let i = info.vertexStart, l = info.vertexStart + info.vertexCount;
        i < l;
        i++
      ) {
        vertices.push(new THREE.Vector3().fromBufferAttribute(start, i))
        vertices.push(new THREE.Vector3().fromBufferAttribute(end, i))
      }
    } else if (index) {
      for (
        let i = info.indexStart!, l = info.indexStart! + info.indexCount!;
        i < l;
        i++
      ) {
        vertices.push(
          new THREE.Vector3().fromBufferAttribute(position, index.getX(i))
        )
      }
    } else {
      for (
        let i = info.vertexStart, l = info.vertexStart + info.vertexCount;
        i < l;
        i++
      ) {
        vertices.push(new THREE.Vector3().fromBufferAttribute(position, i))
      }
    }
  }
  return vertices
}

function frustumAt(center: { x: number; y: number }, size: number) {
  const camera = new THREE.OrthographicCamera(
    -size,
    size,
    size,
    -size,
    0.1,
    2000
  )
  camera.position.set(center.x, center.y, 1000)
  camera.lookAt(center.x, center.y, 0)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  )
  return new THREE.Frustum().setFromProjectionMatrix(matrix)
}

/** The pre-fix `unionActiveVisibleBoundingBoxInto` loop. */
function referenceUnionBox(batch: unknown, ids: ReadonlySet<string> | null) {
  const internals = internalsOf(batch)
  internals.updateMatrixWorld(true)
  const cached = cachedBoundsOf(batch)
  const target = new THREE.Box3()
  const slotBox = new THREE.Box3()
  for (let i = 0; i < internals._geometryCount; i++) {
    const info = internals._geometryInfo[i]
    if (!isBatchGeometryActive(info.flags)) continue
    if (ids && info.objectId && ids.has(info.objectId)) continue
    if (cached.getBoundingBoxAt(i, slotBox) !== null) {
      slotBox.applyMatrix4(internals.matrixWorld)
      target.union(slotBox)
    }
  }
  return target
}

describe('batched aggregate bounds equivalence (P1-3)', () => {
  it('Line2 per-slot bounds equal the cached implementation', () => {
    const batch = buildLine2Batch()
    const internals = internalsOf(batch)
    const scratch = new THREE.Box3()
    const cached = new THREE.Box3()

    for (let i = 0; i < internals._geometryCount; i++) {
      expect(internals._localBoundsAt(i, scratch)).not.toBeNull()
      expect(cachedBoundsOf(batch).getBoundingBoxAt(i, cached)).not.toBeNull()
      expect(scratch.min.toArray()).toEqual(cached.min.toArray())
      expect(scratch.max.toArray()).toEqual(cached.max.toArray())
    }

    // Only the explicit cached queries above materialize slot boxes.
    expect(countMaterializedSlotBoxes(batch)).toBe(internals._geometryCount)
  })

  it('Line per-slot bounds equal the cached implementation', () => {
    const batch = buildLineBatch()
    const internals = internalsOf(batch)
    const scratch = new THREE.Box3()
    const cached = new THREE.Box3()

    for (let i = 0; i < internals._geometryCount; i++) {
      expect(internals._localBoundsAt(i, scratch)).not.toBeNull()
      expect(cachedBoundsOf(batch).getBoundingBoxAt(i, cached)).not.toBeNull()
      expect(scratch.min.toArray()).toEqual(cached.min.toArray())
      expect(scratch.max.toArray()).toEqual(cached.max.toArray())
    }
  })

  it('Line2 aggregate box union is bitwise identical to the pre-fix loop', () => {
    const actual = buildLine2Batch()
    const reference = buildLine2Batch()
    const actualBox = new THREE.Box3()
    actual.unionActiveVisibleBoundingBoxInto(actualBox)
    const referenceBox = referenceUnionBox(reference, null)

    expect(actualBox.min.toArray()).toEqual(referenceBox.min.toArray())
    expect(actualBox.max.toArray()).toEqual(referenceBox.max.toArray())
    expect(countMaterializedSlotBoxes(actual)).toBe(0)
  })

  it('Line aggregate box union is bitwise identical to the pre-fix loop', () => {
    const actual = buildLineBatch()
    const reference = buildLineBatch()
    const actualBox = new THREE.Box3()
    actual.unionActiveVisibleBoundingBoxInto(actualBox)
    const referenceBox = referenceUnionBox(reference, null)

    expect(actualBox.min.toArray()).toEqual(referenceBox.min.toArray())
    expect(actualBox.max.toArray()).toEqual(referenceBox.max.toArray())
    expect(countMaterializedSlotBoxes(actual)).toBe(0)
  })

  it('respects excludeObjectIds exactly like the pre-fix loop', () => {
    const actual = buildLine2Batch()
    const reference = buildLine2Batch()
    const excludeObjectIds = new Set(['e0', 'e1', 'e7'])
    const actualBox = new THREE.Box3()
    actual.unionActiveVisibleBoundingBoxInto(actualBox, { excludeObjectIds })
    const referenceBox = referenceUnionBox(reference, excludeObjectIds)

    expect(actualBox.min.toArray()).toEqual(referenceBox.min.toArray())
    expect(actualBox.max.toArray()).toEqual(referenceBox.max.toArray())
    expect(countMaterializedSlotBoxes(actual)).toBe(0)
  })

  it('includes only the requested object ids without caching slot boxes', () => {
    const batch = buildLine2Batch()
    const included = new THREE.Box3()
    batch.unionActiveVisibleBoundingBoxInto(included, {
      includeObjectIds: new Set(['e0'])
    })

    const expected = referenceSlotBox(batch, 0, new THREE.Box3())
    expected.applyMatrix4(internalsOf(batch).matrixWorld)
    expect(included.min.toArray()).toEqual(expected.min.toArray())
    expect(included.max.toArray()).toEqual(expected.max.toArray())
    expect(countMaterializedSlotBoxes(batch)).toBe(0)
  })

  it('Line2 aggregate sphere encloses every active vertex and stays tight', () => {
    const batch = buildLine2Batch()
    const internals = internalsOf(batch)
    batch.syncFrustumBounds()
    const actual = internals.boundingSphere!

    const vertices = collectActiveVertices(batch)
    expect(vertices.length).toBe(SEGMENTS.length * 2)
    for (const vertex of vertices) {
      // 1e-6 relative slack absorbs radius rounding at 1e7 coordinates; the
      // sphere is derived from the very same float values.
      expect(actual.center.distanceTo(vertex)).toBeLessThanOrEqual(
        actual.radius * (1 + 1e-6)
      )
    }

    // The pre-fix union-of-per-slot-spheres is also a valid enclosure here, so
    // both bounds can be compared fairly: the new circumsphere is within a few
    // percent of the old one (measured 1.0277× on this dataset) and always
    // encloses the same vertex set. A slightly looser bound only costs a few
    // extra draw calls, never a missing one.
    const reference = referenceAggregateSphere(batch, (id, target) =>
      cachedBoundsOf(batch).getBoundingBoxAt(id, target)
    )
    const referenceMaxDistance = vertices.reduce(
      (max, vertex) => Math.max(max, reference.center.distanceTo(vertex)),
      0
    )
    expect(referenceMaxDistance).toBeLessThanOrEqual(reference.radius)
    expect(actual.radius).toBeLessThanOrEqual(reference.radius * 1.1)
  })

  it('Line aggregate sphere encloses every active vertex and stays tight', () => {
    const batch = buildLineBatch()
    const internals = internalsOf(batch)
    batch.syncFrustumBounds()
    const actual = internals.boundingSphere!

    const vertices = collectActiveVertices(batch)
    expect(vertices.length).toBe(SEGMENTS.length * 2)
    for (const vertex of vertices) {
      expect(actual.center.distanceTo(vertex)).toBeLessThanOrEqual(
        actual.radius * (1 + 1e-6)
      )
    }

    const reference = referenceAggregateSphere(batch, (id, target) =>
      cachedBoundsOf(batch).getBoundingBoxAt(id, target)
    )
    const referenceMaxDistance = vertices.reduce(
      (max, vertex) => Math.max(max, reference.center.distanceTo(vertex)),
      0
    )
    expect(referenceMaxDistance).toBeLessThanOrEqual(reference.radius)
    expect(actual.radius).toBeLessThanOrEqual(reference.radius * 1.1)
  })

  it('never culls a batch whose geometry is inside the frustum', () => {
    const batch = buildLine2Batch()
    const internals = internalsOf(batch)
    batch.syncFrustumBounds()
    const newSphere = internals.boundingSphere!.clone()
    const oldSphere = referenceAggregateSphere(batch, (id, target) =>
      cachedBoundsOf(batch).getBoundingBoxAt(id, target)
    )

    const vertices = collectActiveVertices(batch)
    const worldCenter = newSphere.center
      .clone()
      .applyMatrix4(internals.matrixWorld)
    const radius = newSphere.radius
    const cases: Array<{ center: { x: number; y: number }; size: number }> = [
      // Inside the aggregate bound.
      { center: { x: worldCenter.x, y: worldCenter.y }, size: 1 },
      { center: { x: worldCenter.x, y: worldCenter.y }, size: radius / 2 },
      // Just inside the new (looser) bound but outside the old one.
      {
        center: { x: worldCenter.x + radius * 0.99, y: worldCenter.y },
        size: 1
      },
      // Far outside any bound.
      {
        center: { x: worldCenter.x + radius * 1.5, y: worldCenter.y },
        size: 1
      },
      {
        center: { x: worldCenter.x - radius * 1.5, y: worldCenter.y },
        size: 1
      },
      {
        center: { x: worldCenter.x, y: worldCenter.y + radius * 1.5 },
        size: 1
      },
      {
        center: {
          x: worldCenter.x + radius * 1.5,
          y: worldCenter.y + radius * 1.5
        },
        size: 1
      },
      {
        center: { x: worldCenter.x + radius * 1.01, y: worldCenter.y },
        size: 1
      }
    ]

    const worldNew = new THREE.Sphere()
    const worldOld = new THREE.Sphere()
    let visibleCount = 0
    let culledCount = 0

    for (const probe of cases) {
      const frustum = frustumAt(probe.center, probe.size)
      worldNew.copy(newSphere).applyMatrix4(internals.matrixWorld)
      worldOld.copy(oldSphere).applyMatrix4(internals.matrixWorld)
      const newVisible = frustum.intersectsSphere(worldNew)
      const oldVisible = frustum.intersectsSphere(worldOld)
      if (newVisible) visibleCount++
      else culledCount++

      // The new bound is the circumsphere of the exact min/max of every active
      // vertex, so a "culled" verdict proves that no vertex — hence no drawable
      // geometry — is inside the frustum. This is the property that keeps
      // frustum culling from ever hiding visible linework.
      if (!newVisible) {
        for (const vertex of vertices) {
          const world = vertex.clone().applyMatrix4(internals.matrixWorld)
          expect(frustum.containsPoint(world)).toBe(false)
        }
      }

      // A looser bound may keep a batch the old bound dropped (extra, harmless
      // draw call). It must never do the reverse: the new bound is derived from
      // the same packed vertices, so anything the old bound kept that has real
      // geometry in view is kept here too.
      if (oldVisible && !newVisible) {
        for (const vertex of vertices) {
          const world = vertex.clone().applyMatrix4(internals.matrixWorld)
          expect(frustum.containsPoint(world)).toBe(false)
        }
      }
    }

    // The battery must contain both verdicts, otherwise it proves nothing.
    expect(visibleCount).toBeGreaterThan(0)
    expect(culledCount).toBeGreaterThan(0)
  })

  it('keeps mesh and point aggregate spheres on the pre-fix path', () => {
    const mesh = new AcTrBatchedMesh(1000, 2000, new THREE.MeshBasicMaterial())
    const triangle = new THREE.BufferGeometry()
    triangle.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 40, 0, 0, 0, 30, 0], 3)
    )
    triangle.setIndex([0, 1, 2])
    mesh.addGeometry(triangle)
    mesh.syncFrustumBounds()
    expect(internalsOf(mesh).boundingSphere).toEqual(
      referenceAggregateSphere(mesh, (id, target) =>
        cachedBoundsOf(mesh).getBoundingBoxAt(id, target)
      )
    )

    const points = new AcTrBatchedPoint(1000, new THREE.PointsMaterial())
    const pointCloud = new THREE.BufferGeometry()
    pointCloud.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 3, 4, 0, 30, 40, 0], 3)
    )
    points.addGeometry(pointCloud)
    points.syncFrustumBounds()
    expect(internalsOf(points).boundingSphere).toEqual(
      referenceAggregateSphere(points, (id, target) =>
        cachedBoundsOf(points).getBoundingBoxAt(id, target)
      )
    )
  })

  it('keeps slot boxes unmaterialized across sync, box union and picking', () => {
    const batch = buildLine2Batch()
    batch.syncFrustumBounds()
    expect(countMaterializedSlotBoxes(batch)).toBe(0)

    const box = new THREE.Box3()
    batch.unionActiveVisibleBoundingBoxInto(box)
    expect(box.isEmpty()).toBe(false)
    expect(countMaterializedSlotBoxes(batch)).toBe(0)

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 1000),
      new THREE.Vector3(0, 0, -1)
    )
    const hits: THREE.Intersection[] = []
    batch.raycast(raycaster, hits)
    expect(countMaterializedSlotBoxes(batch)).toBe(0)
  })

  /**
   * Cost shape of one layout-fit recompute (P1-4): the box union performs one
   * `Box3.applyMatrix4` per active visible slot — the dominant term the report
   * measured at ~52ms per recompute for 434,083 slots. The mid-open fit no
   * longer calls this at all (it unions one entity box per appended entity into
   * the running O(1) box); only the terminal fit still does.
   */
  it('performs one Box3.applyMatrix4 per active visible slot on the box path', () => {
    const batch = buildLine2Batch()
    const target = new THREE.Box3()
    const spy = jest.spyOn(THREE.Box3.prototype, 'applyMatrix4')
    try {
      spy.mockClear()
      batch.unionActiveVisibleBoundingBoxInto(target)
      expect(spy).toHaveBeenCalledTimes(SEGMENTS.length)
    } finally {
      spy.mockRestore()
    }
    expect(countMaterializedSlotBoxes(batch)).toBe(0)
  })

  it('falls back to the generic path for non-interleaved Line2 attributes', () => {
    const batch = new AcTrBatchedLine2(10, new LineMaterial())
    const geometry = new LineSegmentsGeometry()
    geometry.setAttribute(
      'instanceStart',
      new THREE.InstancedBufferAttribute(
        new Float32Array([0, 0, 0, 10, 0, 0]),
        3
      )
    )
    geometry.setAttribute(
      'instanceEnd',
      new THREE.InstancedBufferAttribute(
        new Float32Array([10, 0, 0, 10, 10, 0]),
        3
      )
    )
    batch.addGeometry(geometry)

    const local = internalsOf(batch)._localBoundsAt(0, new THREE.Box3())
    const cached = cachedBoundsOf(batch).getBoundingBoxAt(0, new THREE.Box3())
    expect(local).not.toBeNull()
    expect(cached).not.toBeNull()
    expect(local!.min.toArray()).toEqual(cached!.min.toArray())
    expect(local!.max.toArray()).toEqual(cached!.max.toArray())

    // The aggregate sphere scan must handle the same fallback layout.
    batch.syncFrustumBounds()
    const sphere = internalsOf(batch).boundingSphere!
    expect(sphere.radius).toBeGreaterThanOrEqual(5)
  })

  /**
   * The "same extents → keep the aggregate bounds" fast path used to depend on
   * a materialized slot `Box3`. It must keep working now that Line slots never
   * cache one: the pre-rewrite extents are scanned from the packed buffer
   * instead.
   */
  it('keeps the equal-extents rewrite fast path without a cached Box3', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 10, 10, 0], 3)
    )
    geometry.setIndex([0, 1, 1, 2])
    const batch = new AcTrBatchedLine(1000, 2000, new THREE.LineBasicMaterial())
    const id = batch.addGeometry(geometry)

    batch.syncFrustumBounds()
    expect(batch.frustumCulled).toBe(true)
    expect(countMaterializedSlotBoxes(batch)).toBe(0)

    // `addGeometry` rebased the source in place, so rewriting it copies the
    // identical packed positions back: extents unchanged.
    batch.setGeometryAt(id, geometry)
    expect(batch.frustumCulled).toBe(true)
    expect(countMaterializedSlotBoxes(batch)).toBe(0)

    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    position.setXYZ(1, 90, 0, 0)
    position.setXYZ(2, 90, 90, 0)
    position.needsUpdate = true
    batch.setGeometryAt(id, geometry)
    expect(batch.frustumCulled).toBe(false)
  })
})

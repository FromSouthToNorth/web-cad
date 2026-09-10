import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

import { isBatchGeometryActive } from '../src/batch/AcTrBatchedGeometryInfo'
import { AcTrBatchedLine } from '../src/batch/AcTrBatchedLine'
import { AcTrBatchedLine2 } from '../src/batch/AcTrBatchedLine2'

/**
 * A/B benchmark for the per-slot bounds allocation in aggregate bounds
 * queries (P1-3).
 *
 * Before the fix, `computeBoundingSphere()` / `unionActiveVisibleBoundingBoxInto()`
 * walked every slot through the lazily caching `getBoundingBoxAt()` and
 * permanently materialized one `Box3` per slot (434,083 × ~234B ≈ 100MB on the
 * 千树塔 drawing). After the fix, line batches scan their packed vertex arrays
 * instead, so the materialized count stays 0.
 *
 * The primary measured quantity is the *number of slot records holding a
 * materialized `Box3`*, which is exactly the resident memory the report
 * attributes to this item. Timings are printed for the A/B log.
 *
 * ⚠️ Timing caveat: this repository runs Jest inside a `vm` context where
 * `Math.min`/`Math.max` are ~300× slower than in plain node (3M calls: 414ms
 * under Jest vs 1.39ms standalone), which inflates every `Box3.expandByPoint`
 * based path. Only the **ratio** between the two variants below is meaningful;
 * production-scale numbers were measured separately with
 * `/tmp/bounds-ab.cjs` (see the P1 report).
 *
 * Run with a bigger `DSH_BOUNDS_BENCH_SLOTS` (e.g. 434083) to approximate the
 * production slot count; the default stays small so the suite stays fast.
 */
const SLOT_COUNT = Number(process.env.DSH_BOUNDS_BENCH_SLOTS ?? 20000)

type SlotRecord = {
  boundingBox: THREE.Box3 | null
  flags: number
  vertexStart: number
  vertexCount: number
}
type BatchInternals = {
  _geometryInfo: SlotRecord[]
  _geometryCount: number
  matrixWorld: THREE.Matrix4
  updateMatrixWorld(force?: boolean): void
}

/** Counts slot records that hold a permanently materialized `Box3`. */
function countMaterializedSlotBoxes(batch: unknown) {
  const info = (batch as BatchInternals)._geometryInfo
  let count = 0
  for (let i = 0; i < info.length; i++) {
    if (info[i].boundingBox !== null) count++
  }
  return count
}

/** Deterministic pseudo-random generator (no Math.random dependency). */
function makeRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

function createLine2Batch(slotCount: number) {
  const random = makeRandom(20240614)
  const batch = new AcTrBatchedLine2(slotCount, new LineMaterial())
  for (let i = 0; i < slotCount; i++) {
    const x = random() * 20_000_000
    const y = random() * 20_000_000
    const dx = random() * 100
    const dy = random() * 100
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions([x, y, 0, x + dx, y + dy, 0])
    batch.addGeometry(geometry)
  }
  batch.updateMatrixWorld(true)
  return batch
}

function createLineBatch(slotCount: number) {
  const random = makeRandom(20240615)
  const batch = new AcTrBatchedLine(1000, 2000, new THREE.LineBasicMaterial())
  for (let i = 0; i < slotCount; i++) {
    const x = random() * 20_000_000
    const y = random() * 20_000_000
    const dx = random() * 100
    const dy = random() * 100
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([x, y, 0, x + dx, y + dy, 0], 3)
    )
    geometry.setIndex([0, 1])
    batch.addGeometry(geometry)
  }
  batch.updateMatrixWorld(true)
  return batch
}

function timeMs(fn: () => void, repeats = 5) {
  const samples: number[] = []
  for (let i = 0; i < repeats; i++) {
    const startedAt = performance.now()
    fn()
    samples.push(performance.now() - startedAt)
  }
  return Math.min(...samples)
}

function timeFirstMs(fn: () => void) {
  const startedAt = performance.now()
  fn()
  return performance.now() - startedAt
}

function report(label: string, value: number | string) {
  console.log(`[bounds-bench] ${label}=${value}`)
}

/**
 * Pre-fix behavior, reproduced on a parallel cache so both variants can be
 * timed in the same run: one materialized `Box3` per slot, then
 * copy → `applyMatrix4` → `union` per slot.
 */
function measurePreFixBoxUnion(batch: unknown) {
  const internals = batch as BatchInternals & THREE.Object3D
  const info = internals._geometryInfo
  const cache: THREE.Box3[] = new Array(info.length)
  const materializeMs = timeFirstMs(() => {
    for (let i = 0; i < info.length; i++) {
      if (!isBatchGeometryActive(info[i].flags)) {
        cache[i] = new THREE.Box3()
        continue
      }
      const box = new THREE.Box3()
      const geometry = (
        internals as unknown as { geometry: THREE.BufferGeometry }
      ).geometry
      const start = geometry.getAttribute('instanceStart')
      const end = geometry.getAttribute('instanceEnd')
      const position = geometry.attributes.position
      for (
        let v = info[i].vertexStart,
          l = info[i].vertexStart + info[i].vertexCount;
        v < l;
        v++
      ) {
        if (start && end) {
          box.expandByPoint(_scratch.fromBufferAttribute(start, v))
          box.expandByPoint(_scratch.fromBufferAttribute(end, v))
        } else if (position) {
          box.expandByPoint(_scratch.fromBufferAttribute(position, v))
        }
      }
      cache[i] = box
    }
  })
  report('prefix.materializeSlotBoxes.ms', materializeMs.toFixed(2))

  const target = new THREE.Box3()
  const scratch = new THREE.Box3()
  const steadyMs = timeMs(() => {
    target.makeEmpty()
    for (let i = 0; i < info.length; i++) {
      if (!isBatchGeometryActive(info[i].flags)) continue
      scratch.copy(cache[i])
      scratch.applyMatrix4(internals.matrixWorld)
      target.union(scratch)
    }
  })
  report('prefix.unionSteadyState.ms', steadyMs.toFixed(2))
  return { materializeMs, steadyMs }
}

const _scratch = /*@__PURE__*/ new THREE.Vector3()

describe('batched aggregate bounds allocation bench', () => {
  it('does not materialize one Box3 per slot (Line2)', () => {
    const batch = createLine2Batch(SLOT_COUNT)
    report('line2.slots', SLOT_COUNT)

    // Production cadence: every geometry change marks the aggregate bounds
    // dirty, so every sync walks the whole active slot set.
    const sphereMs = timeMs(() => {
      batch.invalidateFrustumBounds()
      batch.syncFrustumBounds()
    })
    report('line2.dirtySyncFrustumBounds.ms', sphereMs.toFixed(2))

    const target = new THREE.Box3()
    const boxMs = timeMs(() => {
      target.makeEmpty()
      batch.unionActiveVisibleBoundingBoxInto(target)
    })
    report('line2.unionActiveVisibleBoundingBoxInto.ms', boxMs.toFixed(2))

    const preFix = measurePreFixBoxUnion(batch)
    report(
      'line2.unionSpeedupVsPreFixSteady',
      (preFix.steadyMs / boxMs).toFixed(2)
    )

    const materialized = countMaterializedSlotBoxes(batch)
    report('line2.materializedSlotBoxes', materialized)
    report('line2.estimatedMaterializedBytes', materialized * 234)
    expect(materialized).toBe(0)
  })

  it('does not materialize one Box3 per slot (Line)', () => {
    const batch = createLineBatch(SLOT_COUNT)
    report('line.slots', SLOT_COUNT)

    const sphereMs = timeMs(() => {
      batch.invalidateFrustumBounds()
      batch.syncFrustumBounds()
    })
    report('line.dirtySyncFrustumBounds.ms', sphereMs.toFixed(2))

    const target = new THREE.Box3()
    const boxMs = timeMs(() => {
      target.makeEmpty()
      batch.unionActiveVisibleBoundingBoxInto(target)
    })
    report('line.unionActiveVisibleBoundingBoxInto.ms', boxMs.toFixed(2))

    const materialized = countMaterializedSlotBoxes(batch)
    report('line.materializedSlotBoxes', materialized)
    report('line.estimatedMaterializedBytes', materialized * 234)
    expect(materialized).toBe(0)
  })

  it('measures the retained size of one materialized Box3', () => {
    const gc = (global as { gc?: () => void }).gc
    if (!gc) {
      report('box3.size', 'skipped (run with NODE_OPTIONS=--expose-gc)')
      return
    }

    const sampleCount = 20_000
    gc()
    const before = process.memoryUsage().heapUsed
    const boxes: THREE.Box3[] = new Array(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      boxes[i] = new THREE.Box3()
    }
    gc()
    const after = process.memoryUsage().heapUsed
    const perBox = (after - before) / sampleCount
    report('box3.retainedBytes', perBox.toFixed(1))
    expect(boxes.length).toBe(sampleCount)
  })
})

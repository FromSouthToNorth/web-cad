import { AcGeBox2d } from '@hy/data-model'

import { AcTrProgressiveOpenFitController } from '../src/view/AcTrProgressiveOpenFitController'

describe('AcTrProgressiveOpenFitController', () => {
  it('refreshes pending threshold on re-begin without resetting fit state', () => {
    const zooms: AcGeBox2d[] = []
    const controller = new AcTrProgressiveOpenFitController(box => {
      zooms.push(box.clone())
    })

    controller.begin(0)
    expect(controller.isActive).toBe(true)

    // Simulate geometry landing before db.read finishes.
    for (let i = 0; i < 500; i++) {
      controller.afterGeometryBatch(
        () => new AcGeBox2d({ x: 0, y: 0 }, { x: 10 + i, y: 10 + i })
      )
    }

    const zoomsBeforeRefresh = zooms.length
    expect(zoomsBeforeRefresh).toBeGreaterThan(0)

    controller.begin(20000)
    expect(controller.isActive).toBe(true)

    // Re-begin must not clear prior fit / force an immediate re-zoom.
    expect(zooms.length).toBe(zoomsBeforeRefresh)
  })

  it('stops auto-fit after a user view change', () => {
    const zooms: AcGeBox2d[] = []
    const controller = new AcTrProgressiveOpenFitController(box => {
      zooms.push(box.clone())
    })

    controller.begin(1000)
    controller.afterGeometryBatch(
      () => new AcGeBox2d({ x: 0, y: 0 }, { x: 100, y: 100 })
    )
    const afterFirst = zooms.length

    controller.onLayoutViewChanged()
    expect(controller.isActive).toBe(false)

    controller.afterGeometryBatch(
      () => new AcGeBox2d({ x: 0, y: 0 }, { x: 1000, y: 1000 })
    )
    expect(zooms.length).toBe(afterFirst)
  })

  /**
   * P1-4 contract: the mid-open fit resolver runs at the 500ms throttle, never
   * per entity. The host view now passes an O(1) running-union resolver here
   * instead of the O(active slots × Box3.applyMatrix4) batch-geometry extent
   * recompute, so this cadence is what bounds the cost of a full open.
   *
   * The terminal fit (`applyFinalFit`) keeps its own resolver, which is what
   * lets the host keep the batch-geometry box for the final framing while the
   * throttled framing uses the incremental box.
   */
  it('resolves the fit box at most once per throttle window', () => {
    const zooms: AcGeBox2d[] = []
    const controller = new AcTrProgressiveOpenFitController(box => {
      zooms.push(box.clone())
    })
    let resolverCalls = 0
    const resolver = () => {
      resolverCalls++
      return new AcGeBox2d({ x: 0, y: 0 }, { x: 100, y: 100 })
    }

    controller.begin(10_000)
    for (let i = 0; i < 500; i++) {
      controller.afterGeometryBatch(resolver)
    }

    // 500 entities, at most one throttled resolve (the first tick has no
    // previous zoom, so it always fits).
    expect(resolverCalls).toBe(1)
    expect(zooms.length).toBe(1)
  })

  it('keeps the terminal fit resolver separate from the throttled one', () => {
    const zooms: AcGeBox2d[] = []
    const controller = new AcTrProgressiveOpenFitController(box => {
      zooms.push(box.clone())
    })
    let incrementalCalls = 0
    let finalCalls = 0

    controller.begin(10_000)
    controller.afterGeometryBatch(() => {
      incrementalCalls++
      return new AcGeBox2d({ x: 0, y: 0 }, { x: 1, y: 1 })
    })
    controller.applyFinalFit(() => {
      finalCalls++
      return new AcGeBox2d({ x: 0, y: 0 }, { x: 2, y: 2 })
    })

    expect(incrementalCalls).toBe(1)
    expect(finalCalls).toBe(1)
    expect(zooms.length).toBe(2)
    // The terminal fit frames its own box.
    expect(zooms[1].max.x).toBe(2)
  })
})

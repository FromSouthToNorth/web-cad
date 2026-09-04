/**
 * Headless render-stats collector for M6-1 (arc LOD) and the M5-4
 * slot-level frustum culling decision.
 *
 * Opens a drawing in the example dev server's progressive bench page, waits
 * for the open work gate (conversion + progressive camera fit) to go idle,
 * forces one render, then reports:
 *  - renderer.info.render (calls / triangles / lines / points)
 *  - per-batch container: vertex count, bounding sphere, frustum hit at the
 *    current camera — CPU-side plane tests, valid regardless of GPU
 *  - camera state at collection time
 *
 * Two samples are collected: at fit view (by construction everything is
 * visible) and after zooming into the central quarter of the scene bounds.
 * The zoomed sample's visible/invisible vertex split is the data that
 * decides whether M5-4 (per-slot culling) pays off: a high
 * invisible-vertex share means large batches span the viewport and would
 * benefit from finer culling; a low share means batch-level culling
 * already suffices.
 *
 * Note: this machine uses SwiftShader; `renderer.info` is still accurate,
 * but frame-rate conclusions must be re-checked on a real GPU.
 *
 * Usage:
 *   node bench/collect-render-stats.cjs <fixture> [baseUrl] [outDir]
 *
 *  - `<fixture>`: name served from /bench/fixtures/ (e.g.
 *    origin-shift-big.dxf). For a drawing outside the repo, copy it into
 *    bench/fixtures/ BEFORE starting the dev server (the vite file watcher
 *    crashes on files created inside watched dirs while it runs).
 *  - baseUrl defaults to http://127.0.0.1:4173
 *    (start with: node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173)
 *  - outDir defaults to bench/out/ (env OUT_DIR overrides)
 *
 * Output: outDir/render-stats-<fixture>.json + human summary on stdout.
 */
const { chromium } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const file = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4173'
const outDir = process.env.OUT_DIR ?? path.join(__dirname, 'out')
const waitMs = Number(process.env.WAIT_MS ?? 900000)

if (!file) {
  console.error('Usage: node bench/collect-render-stats.cjs <fixture> [baseUrl] [outDir]')
  process.exit(1)
}

async function readViewState(page) {
  return page.evaluate(() => {
    const view = globalThis['__mlViewDebug']
    if (!view) return { hook: 'missing' }
    const renderer = view['renderer']?.['internalRenderer']
    const scene = view['cadScene']?.['internalScene']
    const camera = view['internalCamera']
    if (!renderer || !scene || !camera) return { hook: 'internals-missing' }

    // Force one render so batch bounding spheres are synced (the batch
    // mixin fills geometry.boundingSphere in onBeforeRender), then capture
    // the per-frame info counters for exactly this frame.
    renderer.render(scene, camera)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()

    // Frustum planes from the combined view-projection matrix (same math as
    // THREE.Frustum.setFromProjectionMatrix), computed without needing the
    // THREE namespace.
    const cm = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
    const me = cm.elements
    const rawPlanes = [
      [me[3] + me[0], me[7] + me[4], me[11] + me[8], me[15] + me[12]],
      [me[3] - me[0], me[7] - me[4], me[11] - me[8], me[15] - me[12]],
      [me[3] - me[1], me[7] - me[5], me[11] - me[9], me[15] - me[13]],
      [me[3] + me[1], me[7] + me[5], me[11] + me[9], me[15] + me[13]],
      [me[3] + me[2], me[7] + me[6], me[11] + me[10], me[15] + me[14]],
      [me[3] - me[2], me[7] - me[6], me[11] - me[10], me[15] - me[14]]
    ]
    const planes = rawPlanes.map(p => {
      const n = Math.hypot(p[0], p[1], p[2]) || 1
      return [p[0] / n, p[1] / n, p[2] / n, p[3] / n]
    })
    const sphereVisible = (cx, cy, cz, r) => {
      for (const p of planes) {
        if (p[0] * cx + p[1] * cy + p[2] * cz + p[3] < -r) return false
      }
      return true
    }

    const batches = []
    scene.traverse(obj => {
      if (obj.visible === false) return
      const geometry = obj.geometry
      if (!geometry || obj.userData?.batchDisposed) return
      const posAttr =
        geometry.attributes?.position ?? geometry.attributes?.instanceStart
      if (!posAttr || !posAttr.count) return

      let sphere = geometry.boundingSphere
      if (!sphere || !Number.isFinite(sphere.radius)) {
        geometry.computeBoundingSphere?.()
        sphere = geometry.boundingSphere
      }
      let visible = null
      let cx = 0
      let cy = 0
      let cz = 0
      let r = 0
      if (sphere && Number.isFinite(sphere.radius) && sphere.radius > 0) {
        const c = sphere.center.clone().applyMatrix4(obj.matrixWorld)
        cx = c.x
        cy = c.y
        cz = c.z
        r = sphere.radius * (obj.matrixWorld.getMaxScaleOnAxis?.() ?? 1)
        visible = sphereVisible(cx, cy, cz, r)
      }
      batches.push({
        type: obj.type,
        vertices: posAttr.count,
        sphere: visible === null ? null : { cx, cy, cz, r },
        frustumHit: visible
      })
    })

    const info = renderer.info?.render
    const arcLodDiagonal =
      view['renderer']?.['context']?.arcLodDiagonal ??
      renderer?.['context']?.arcLodDiagonal ??
      null
    return {
      hook: 'ok',
      arcLodDiagonal,
      info: info
        ? {
            calls: info.calls,
            triangles: info.triangles,
            lines: info.lines,
            points: info.points
          }
        : null,
      camera: {
        x: +camera.position.x.toFixed(0),
        y: +camera.position.y.toFixed(0),
        z: +camera.position.z.toFixed(0),
        zoom: +camera.zoom.toFixed(4),
        near: camera.near,
        far: +camera.far.toFixed(0)
      },
      batches
    }
  })
}

function summarize(state) {
  const batches = state.batches ?? []
  let totalVertices = 0
  let visibleVertices = 0
  let withSphere = 0
  for (const b of batches) {
    totalVertices += b.vertices
    if (b.frustumHit === true) {
      visibleVertices += b.vertices
      withSphere++
    } else if (b.frustumHit === false) {
      withSphere++
    }
  }
  return {
    info: state.info,
    camera: state.camera,
    arcLodDiagonal: state.arcLodDiagonal ?? null,
    batchCount: batches.length,
    totalVertices,
    visibleVertices,
    invisibleVertices: totalVertices - visibleVertices,
    visibleRatio:
      totalVertices > 0
        ? Number((visibleVertices / totalVertices).toFixed(4))
        : null,
    batchesWithSphere: withSphere
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--enable-webgl'
    ]
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.setDefaultTimeout(20000)
  const errors = []
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text().slice(0,300))
  })
  page.on('pageerror', e => errors.push(String(e).slice(0, 300)))

  try {
    await page.goto(`${baseUrl}/bench/progressive.html?file=${file}`, {
      waitUntil: 'domcontentloaded'
    })

    // Idle gate: conversion done AND progressive camera fit done.
    const readBusy = () =>
      page
        .evaluate(() => {
          const v = globalThis['__mlViewDebug']
          if (!v) return true
          return v['isOpenFileWorkPending'] ?? v['isProcessingEntities'] ?? true
        })
        .catch(() => true)

    const t0 = Date.now()
    let busy = true
    while (Date.now() - t0 < waitMs) {
      busy = await readBusy()
      if (busy === false) break
      await page.waitForTimeout(3000)
    }
    if (busy !== false) {
      console.error(
        `COLLECT_FAILED: open work did not go idle within ${waitMs}ms ` +
          `(hook present: ${await page.evaluate(() => !!globalThis['__mlViewDebug'])})`
      )
      process.exit(1)
    }

    const fitState = await readViewState(page)
    if (fitState.hook !== 'ok') {
      console.error(`COLLECT_FAILED: bad hook state after idle: ${fitState.hook}`)
      process.exit(1)
    }

    // Deterministic zoomed sample: frame a local window around the largest
    // batch sphere so some batches stay in view and the rest fall outside
    // the frustum. The scene-box center is NOT used: multi-cluster drawings
    // (this one has content clusters ~38M units apart) have an empty middle,
    // and wheel zoom pans the camera away from content entirely.
    let largest = null
    for (const b of fitState.batches) {
      if (b.sphere && (!largest || b.vertices > largest.vertices)) largest = b
    }
    const target = largest?.sphere
      ? { cx: largest.sphere.cx, cy: largest.sphere.cy, r: largest.sphere.r }
      : null
    const zoomResult = await page.evaluate(target => {
      const view = globalThis['__mlViewDebug']
      if (!view || !target) return 'no-target'
      const half = Math.max(target.r * 4, 1)
      const x0 = target.cx - half
      const y0 = target.cy - half
      const x1 = target.cx + half
      const y1 = target.cy + half
      // zoomTo expects an AcGeBox2d-like object providing getSize/getCenter
      // with out-params (no need to reach the real class from the page).
      view['zoomTo'](
        {
          min: { x: x0, y: y0 },
          max: { x: x1, y: y1 },
          getSize: targetBox => {
            targetBox.x = x1 - x0
            targetBox.y = y1 - y0
            return targetBox
          },
          getCenter: targetBox => {
            targetBox.x = (x0 + x1) / 2
            targetBox.y = (y0 + y1) / 2
            return targetBox
          }
        },
        1.05
      )
      return 'zoomed'
    }, target)
    await page.waitForTimeout(1500)
    const zoomedState = await readViewState(page)
    if (zoomedState.hook !== 'ok') {
      console.error(
        `COLLECT_FAILED: bad hook state after zoom (${zoomResult}): ${zoomedState.hook}`
      )
      process.exit(1)
    }

    const result = {
      collectedAt: new Date().toISOString(),
      file,
      baseUrl,
      fit: summarize(fitState),
      zoomed: summarize(zoomedState),
      batches: zoomedState.batches,
      pageErrors: errors.filter(e => !e.includes('404'))
    }
    const outFile = path.join(outDir, `render-stats-${file}.json`)
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2))
    console.log('COLLECT_OK', outFile)
    console.log('fit view:', JSON.stringify(result.fit, null, 2))
    console.log('zoomed view:', JSON.stringify(result.zoomed, null, 2))
    console.log('page errors:', JSON.stringify(result.pageErrors))
  } finally {
    await browser.close()
  }
}

main().catch(e => {
  console.error('COLLECT_FAILED', e)
  process.exit(1)
})

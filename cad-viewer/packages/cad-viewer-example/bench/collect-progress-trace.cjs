/**
 * Runner for bench/progressive-trace.html — dumps the raw openProgress event
 * stream, regen()/view.clear() interceptions, overlay samples, and console
 * output for a fixture, then prints a compacted summary.
 *
 * Usage:
 *   node bench/collect-progress-trace.cjs <fixture> [baseUrl]
 *
 *  - `<fixture>`: name served from /bench/fixtures/. Copy it there BEFORE
 *    starting the dev server (the vite watcher crashes on new watched files).
 *  - baseUrl defaults to http://127.0.0.1:4173
 *
 * Output: bench/out/open-trace-<fixture>.json + summary on stdout.
 */
const { chromium } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const file = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4173'
const outDir = process.env.OUT_DIR ?? path.join(__dirname, 'out')
const idleWaitMs = Number(process.env.WAIT_MS ?? 1800000)

if (!file) {
  console.error('Usage: node bench/collect-progress-trace.cjs <fixture> [baseUrl]')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// The local playwright cache may carry a different browser revision than the
// installed @playwright/test expects; fall back to the newest cached
// chrome-headless-shell executable when the default launch fails.
function resolveExecutablePath() {
  if (process.env.PLAYWRIGHT_EXE) return process.env.PLAYWRIGHT_EXE
  const root = path.join(
    process.env.LOCALAPPDATA ?? '',
    'ms-playwright'
  )
  try {
    const candidates = fs
      .readdirSync(root)
      .filter(d => d.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
    for (const dir of candidates) {
      const exe = path.join(
        root,
        dir,
        'chrome-headless-shell-win64',
        'chrome-headless-shell.exe'
      )
      if (fs.existsSync(exe)) return exe
    }
  } catch {
    /* fall through to playwright default */
  }
  return undefined
}

async function main() {
  const executablePath = resolveExecutablePath()
  const browser = await chromium.launch(
    executablePath ? { executablePath } : undefined
  )
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const consoleLines = []
  page.on('console', msg => {
    const text = msg.text()
    if (msg.type() === 'warning' || msg.type() === 'error') {
      consoleLines.push(`[${msg.type()}] ${text}`)
    }
  })
  page.on('pageerror', err => consoleLines.push(`[pageerror] ${err.message}`))

  await page.goto(`${baseUrl}/bench/progressive-trace.html?file=${encodeURIComponent(file)}`)

  // Phase 1: wait until openDocument returns (parse + flush done).
  const tStart = Date.now()
  let returned = false
  while (Date.now() - tStart < idleWaitMs) {
    returned = await page.evaluate(() => {
      const trace = globalThis['__openTrace'] ?? []
      return trace.some(e => e.type === 'open-returned')
    })
    if (returned) break
    await sleep(1000)
  }
  const openReturnMs = Date.now() - tStart

  // Phase 2: wait for the open-work gate (drain + progressive fit) to idle.
  let idle = false
  const tDrain = Date.now()
  if (returned) {
    while (Date.now() - tDrain < idleWaitMs) {
      idle = await page.evaluate(() => {
        const view = globalThis['__mlViewDebug']
        if (!view) return false
        const pending = view['isOpenFileWorkPending']
        return pending === false
      })
      if (idle) break
      await sleep(2000)
    }
  }
  const drainMs = Date.now() - tDrain

  const trace = await page.evaluate(() => globalThis['__openTrace'] ?? [])
  const stats = await page.evaluate(() => {
    const view = globalThis['__mlViewDebug']
    if (!view) return null
    let s = null
    try { s = view['stats'] ?? null } catch { s = null }
    const renderer = view['renderer']?.['internalRenderer'] ?? view['renderer']
    return {
      stats: s,
      renderCalls: renderer?.info?.render?.calls ?? null,
      lines: renderer?.info?.render?.lines ?? null,
      points: renderer?.info?.render?.points ?? null,
      triangles: renderer?.info?.render?.triangles ?? null,
      showLineWeight: view['renderer']?.['showLineWeight'] ?? null,
      lwdisplay: view['renderer']?.['context']?.['database']?.['lwdisplay'] ?? null
    }
  })

  const out = {
    fixture: file,
    openReturnMs,
    drainMs,
    drainIdle: idle,
    stats,
    consoleLines,
    trace
  }
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `open-trace-${file}.json`)
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2))

  // ── summary ─────────────────────────────────────────────────────────
  console.log(`fixture           : ${file}`)
  console.log(`open returned     : ${returned} in ${(openReturnMs / 1000).toFixed(1)}s`)
  console.log(`drain idle        : ${idle} in ${(drainMs / 1000).toFixed(1)}s`)
  if (stats) console.log(`view stats        : ${JSON.stringify(stats)}`)
  if (consoleLines.length) {
    console.log(`console (${consoleLines.length}):`)
    for (const line of consoleLines.slice(0, 20)) console.log(`  ${line}`)
  }

  // Compacted progress stream: collapse consecutive identical pct/sub.
  const progress = trace.filter(e => e.type === 'progress')
  const marks = trace.filter(e => e.type !== 'progress' && e.type !== 'overlay')
  console.log(`\nmarks (${marks.length}):`)
  for (const m of marks) console.log(`  t=${m.t}ms ${m.type} ${JSON.stringify({ ...m, t: undefined, type: undefined })}`)

  console.log(`\nprogress events (${progress.length}, compacted):`)
  let prev = null
  let count = 0
  for (const e of progress) {
    const key = `${e.pct}|${e.sub}|${e.status}`
    if (key !== prev) {
      console.log(`  t=${e.t}ms pct=${e.pct} stage=${e.stage} sub=${e.sub} status=${e.status}`)
      prev = key
      count++
      if (count > 200) { console.log('  …(truncated)'); break }
    }
  }

  // Overlay samples that show a numeric regression after a high value.
  const overlay = trace.filter(e => e.type === 'overlay' && e.label)
  console.log(`\noverlay numeric samples (${overlay.length}):`)
  for (const e of overlay) console.log(`  t=${e.t}ms label=${e.label} fill=${e.fill} msg=${e.msg}`)

  await browser.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

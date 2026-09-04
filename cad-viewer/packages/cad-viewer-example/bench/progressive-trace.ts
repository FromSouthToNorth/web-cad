/**
 * Open-progress tracer: records the raw openProgress event stream, regen()
 * calls, view.clear() calls, and the visible overlay state while a drawing
 * opens, so progress-bar regressions (e.g. "100% then back to 20-40%") can
 * be attributed to a concrete event source.
 *
 * Query params:
 *   ?file=NAME       fixture served from /bench/fixtures/
 *   ?progressive=0   open with progressiveRendering disabled
 *
 * Result is published on globalThis.__openTrace (array of stamped entries)
 * and globalThis.__mlViewDebug (the view, after open returns).
 */
import { AcApDocManager, AcEdOpenMode } from '@mlightcad/cad-simple-viewer'

const bar = document.getElementById('bar') as HTMLDivElement
const params = new URLSearchParams(location.search)
const progressive = params.get('progressive') !== '0'
const file = params.get('file') ?? 'progressive.dxf'
const t0 = performance.now()

interface TraceEntry {
  t: number
  type: string
  [key: string]: unknown
}
const trace: TraceEntry[] = []
const mark = (type: string, data?: Record<string, unknown>) => {
  trace.push({ t: Math.round(performance.now() - t0), type, ...data })
}
;(globalThis as Record<string, unknown>)['__openTrace'] = trace

AcApDocManager.createInstance({
  container: document.getElementById('cad-root') as HTMLDivElement,
  width: 1280,
  height: 720,
  autoResize: true,
  useMainThreadDraw: true
})

const docManager = AcApDocManager.instance
const db = docManager.curDocument.database

db.events.openProgress.addEventListener(args => {
  mark('progress', {
    pct: args.percentage,
    stage: args.stage,
    sub: args.subStage,
    status: args.subStageStatus
  })
})

// Intercept regen() and view.clear() — the prime suspects for replaying a
// full CONVERSION progress sequence mid-open.
const origRegen = db.regen.bind(db)
db.regen = () => {
  mark('regen-call')
  return origRegen()
}
const view = docManager.curView as unknown as Record<string, unknown>
const origClear = (view['clear'] as () => void).bind(view)
view['clear'] = () => {
  mark('view-clear')
  return origClear()
}

// Sample what the user actually sees: overlay visibility, numeric label,
// fill width, stage message.
setInterval(() => {
  const overlay = document.querySelector('.ml-ccl-overlay') as HTMLElement
  if (!overlay) return
  const label = document.querySelector('.ml-ccl-progress-label') as HTMLElement
  const fill = document.querySelector('.ml-ccl-progress-fill') as HTMLElement
  const message = document.querySelector('.ml-ccl-message') as HTMLElement
  const last = trace[trace.length - 1]
  const sample = {
    shown: overlay.style.display !== 'none',
    label: label?.textContent ?? '',
    fill: fill?.style.width ?? '',
    msg: message?.textContent ?? ''
  }
  if (
    last?.type === 'overlay' &&
    last.shown === sample.shown &&
    last.label === sample.label &&
    last.msg === sample.msg
  ) {
    return
  }
  mark('overlay', sample)
}, 100)

bar.textContent = `[${file}] fetching…`
const response = await fetch(`/bench/fixtures/${file}`)
const buffer = await response.arrayBuffer()
mark('fetch-done', { bytes: buffer.byteLength })
bar.textContent = `[${file}] opening…`

const opened = await docManager.openDocument(file, buffer, {
  mode: AcEdOpenMode.Read,
  progressiveRendering: progressive
})
mark('open-returned', { opened })
bar.textContent = `[${file}] open returned ok=${String(opened)}, draining…`
;(globalThis as Record<string, unknown>)['__mlViewDebug'] = docManager.curView

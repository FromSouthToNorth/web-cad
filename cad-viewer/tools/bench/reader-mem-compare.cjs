// Reader-level memory comparison: byte-level UTF-8 reader vs the legacy
// full-decode path. Retains every string value (like real entity parsing) so
// slices cannot be collected, and reports external memory + RSS in addition
// to heapUsed.
'use strict'
const { readFileSync } = require('node:fs')
// tools/ has no own node_modules link; fall back to the workspace bundle so
// this runs from anywhere inside the monorepo.
const dataModel = (() => {
  try {
    return require('@mlightcad/data-model')
  } catch {
    return require('../../packages/data-model/dist/data-model.cjs')
  }
})()
const {
  acdbMakeAsciiDxfPairReader,
  acdbMakeUtf8AsciiDxfPairReader
} = dataModel

function drainRetain(reader) {
  const kept = []
  for (;;) {
    const pair = reader.next()
    if (pair === undefined) return kept
    if (typeof pair.value === 'string') kept.push(pair.value)
  }
}

function peakOf(fn) {
  global.gc()
  const before = process.memoryUsage()
  let peakHeap = before.heapUsed
  let peakExt = before.external
  let peakRss = before.rss
  const timer = setInterval(() => {
    const m = process.memoryUsage()
    peakHeap = Math.max(peakHeap, m.heapUsed)
    peakExt = Math.max(peakExt, m.external)
    peakRss = Math.max(peakRss, m.rss)
  }, 10)
  const result = fn()
  clearInterval(timer)
  return {
    retained: result.length,
    heapMB: (peakHeap / 1048576).toFixed(1),
    externalMB: (peakExt / 1048576).toFixed(1),
    rssMB: (peakRss / 1048576).toFixed(1)
  }
}

const file = process.argv[2]
const bytes = new Uint8Array(readFileSync(file))
console.log('file bytes:', (bytes.length / 1048576).toFixed(1), 'MB')

const byteReader = peakOf(() => drainRetain(acdbMakeUtf8AsciiDxfPairReader(bytes)))
console.log('byte reader  :', JSON.stringify(byteReader))

const fullDecode = peakOf(() =>
  drainRetain(acdbMakeAsciiDxfPairReader(new TextDecoder('utf-8').decode(bytes)))
)
console.log('full decode  :', JSON.stringify(fullDecode))

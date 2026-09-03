#!/usr/bin/env node
/**
 * Generate a UTF-8 DXF fixture (AC1021, `$DWGCODEPAGE: UTF-8`) for the
 * Chinese-text-heavy benchmark path. Mirrors the original utf8-mixed-100000
 * fixture family: mixed entity types with Chinese TEXT/MTEXT sprinkled in,
 * streamed to disk as UTF-8 bytes.
 *
 * Usage:
 *   node tools/bench/generate-utf8-dxf.mjs [count] [outfile]
 *
 * Defaults: 100000 entities, tools/bench/fixtures/utf8-mixed-100000.dxf
 */
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsDir = dirname(fileURLToPath(import.meta.url))
const defaultOutFile = join(toolsDir, 'fixtures', 'utf8-mixed-100000.dxf')

// Deterministic LCG so benchmark runs are reproducible.
function makeRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

const rand = makeRandom(0x8badf00d)

function fmt(n) {
  return n.toFixed(4)
}

const count = Number(process.argv[2] ?? 100000)
const outFile = process.argv[3] ?? defaultOutFile

await mkdir(dirname(outFile), { recursive: true })
const stream = createWriteStream(outFile, { encoding: 'utf8' })

let buffered = ''
const flush = async (force = false) => {
  if (buffered.length >= 1 << 20 || force) {
    if (!stream.write(buffered)) {
      await new Promise((resolve) => stream.once('drain', resolve))
    }
    buffered = ''
  }
}

function write(text) {
  buffered += text
}

write(
  '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n' +
    '9\n$DWGCODEPAGE\n3\nUTF-8\n0\nENDSEC\n'
)
write(
  '0\nSECTION\n2\nTABLES\n' +
    '0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n' +
    '3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n' +
    '0\nTABLE\n2\nLAYER\n70\n2\n' +
    '0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n370\n-1\n' +
    '0\nLAYER\n2\n道路图层\n70\n0\n62\n3\n6\nCONTINUOUS\n370\n-1\n' +
    '0\nENDTAB\n0\nENDSEC\n'
)
write('0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n')

const CHINESE = ['道路中线', '测量点', '桥梁桩号', '排水管线', '用地红线', '标高标注']

for (let i = 0; i < count; i++) {
  const x = rand() * 100000
  const y = rand() * 100000
  const layer = i % 2 === 0 ? '0' : '道路图层'
  const r = rand()
  if (r < 0.4) {
    write(
      `0\nLINE\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0.0\n` +
        `11\n${fmt(x + 10)}\n21\n${fmt(y + 5)}\n31\n0.0\n`
    )
  } else if (r < 0.6) {
    write(
      `0\nCIRCLE\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0.0\n` +
        `40\n${fmt(rand() * 10)}\n`
    )
  } else if (r < 0.75) {
    write(
      `0\nARC\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0.0\n` +
        `40\n${fmt(rand() * 10)}\n100\n${fmt(rand() * 360)}\n50\n${fmt(rand() * 360)}\n`
    )
  } else if (r < 0.9) {
    write(
      `0\nTEXT\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0.0\n` +
        `40\n2.5\n1\n${CHINESE[i % CHINESE.length]}\n`
    )
  } else if (r < 0.97) {
    write(
      `0\nMTEXT\n8\n${layer}\n10\n${fmt(x)}\n20\n${fmt(y)}\n30\n0.0\n` +
        `40\n2.5\n1\n${CHINESE[(i + 3) % CHINESE.length]}\\P第二行${i % 10}\n`
    )
  } else {
    write(
      `0\nLWPOLYLINE\n8\n${layer}\n90\n4\n70\n0\n` +
        `10\n${fmt(x)}\n20\n${fmt(y)}\n` +
        `10\n${fmt(x + 8)}\n20\n${fmt(y + 3)}\n` +
        `10\n${fmt(x + 6)}\n20\n${fmt(y + 9)}\n` +
        `10\n${fmt(x - 2)}\n20\n${fmt(y + 7)}\n`
    )
  }
  await flush()
}

write('0\nENDSEC\n0\nEOF\n')
await flush(true)
await new Promise((resolve, reject) => {
  stream.end((err) => (err ? reject(err) : resolve()))
})

const { size } = await stat(outFile)
console.log(`wrote ${outFile} (${count} entities, UTF-8/AC1021, ${(size / 1024 / 1024).toFixed(1)} MB)`)

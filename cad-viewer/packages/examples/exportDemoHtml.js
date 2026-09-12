#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CAD_DATA_DIR,
  CAD_DATA_SAMPLE_DIR
} from '../../tools/cad-data-assets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const cliPath = path.resolve(
  rootDir,
  'packages/cad-simple-viewer-cli/dist/cli.js'
)
const scriptPath = path.resolve(
  rootDir,
  'packages/cad-simple-viewer-cli/examples/export-html.scr'
)
const outputDir = path.resolve(__dirname, './public/self-contained-html')
const outputPath = path.join(outputDir, 'block-color.html')

/**
 * Sample drawing for the offline HTML demo.
 *
 * `block-color.dxf` comes from the local cad-data mirror
 * (`pnpm sync:cad-data`). It used to be `canteen.dwg` fetched from jsDelivr,
 * which this fork's CLI cannot open: the GPL-licensed LibreDWG converter was
 * removed, so only `.dxf` inputs are supported.
 */
const sampleName = 'block-color.dxf'
const localSamplePath = path.resolve(
  rootDir,
  CAD_DATA_DIR,
  CAD_DATA_SAMPLE_DIR,
  sampleName
)
const remoteSampleUrl = `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/${CAD_DATA_SAMPLE_DIR}/${sampleName}`
const samplePath = path.join(outputDir, sampleName)

if (!fs.existsSync(cliPath)) {
  console.error(
    'cad-simple-viewer-cli is not built. Run "pnpm build" from the repo root first.'
  )
  process.exit(1)
}

if (!fs.existsSync(scriptPath)) {
  console.error(`Export script not found: ${scriptPath}`)
  process.exit(1)
}

await fs.promises.mkdir(outputDir, { recursive: true })

/**
 * Resolves the sample drawing bytes, preferring the local mirror so the export
 * works offline and never depends on the CDN when the mirror is present.
 */
async function resolveSampleBytes() {
  if (fs.existsSync(localSamplePath)) {
    console.log(`Using local cad-data sample ${localSamplePath}`)
    return fs.promises.readFile(localSamplePath)
  }
  console.log(`Local cad-data mirror missing; downloading ${remoteSampleUrl}`)
  const response = await fetch(remoteSampleUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to download ${sampleName} (${response.status} ${response.statusText}). ` +
        'Run "pnpm sync:cad-data" to use a local copy instead.'
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

if (!fs.existsSync(samplePath)) {
  await fs.promises.writeFile(samplePath, await resolveSampleBytes())
}

console.log('Exporting self-contained HTML demo…')
const { status, error } = spawnSync(
  process.execPath,
  [
    cliPath,
    '-i',
    samplePath,
    '-s',
    scriptPath,
    '-o',
    outputDir,
    '--mode',
    'read',
    '--locale',
    'en'
  ],
  {
    stdio: 'inherit',
    env: process.env
  }
)

if (error) {
  console.error(error)
  process.exit(1)
}

if (status !== 0) {
  process.exit(status ?? 1)
}

if (!fs.existsSync(outputPath)) {
  console.error(`Expected output missing: ${outputPath}`)
  process.exit(1)
}

console.log(`Wrote ${outputPath}`)

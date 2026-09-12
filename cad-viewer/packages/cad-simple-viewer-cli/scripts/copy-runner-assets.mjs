import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CAD_DATA_FONTS_DIR,
  CAD_DATA_PACKAGE_DIR_NAME
} from '../../../tools/cad-data-assets.mjs'
import {
  DATA_MODEL_PACKAGE,
  DXF_PARSER_WORKER_FILE,
  MTEXT_RENDERER_PACKAGE,
  MTEXT_RENDERER_WORKER_FILE
} from '../../../tools/worker-assets.mjs'

const require = createRequire(import.meta.url)
const cliPackageRoot = fileURLToPath(new URL('..', import.meta.url))
const monorepoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const outDir = join(cliPackageRoot, 'dist-runner')
const workersDir = join(outDir, 'workers')
const cadDataFontsDir = join(
  monorepoRoot,
  'packages',
  CAD_DATA_PACKAGE_DIR_NAME,
  CAD_DATA_FONTS_DIR
)

function pkgRoot(name) {
  const entry = require.resolve(name)
  let dir = dirname(entry)
  while (true) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(require('node:fs').readFileSync(pkgPath, 'utf8'))
      if (pkg.name === name) {
        return dir
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`Package root not found: ${name}`)
    }
    dir = parent
  }
}

function copy(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing asset: ${from}`)
  }
  copyFileSync(from, to)
}

mkdirSync(workersDir, { recursive: true })

copy(
  join(pkgRoot(MTEXT_RENDERER_PACKAGE), 'dist', MTEXT_RENDERER_WORKER_FILE),
  join(workersDir, MTEXT_RENDERER_WORKER_FILE)
)
copy(
  join(pkgRoot(DATA_MODEL_PACKAGE), 'dist', DXF_PARSER_WORKER_FILE),
  join(workersDir, DXF_PARSER_WORKER_FILE)
)
copy(
  join(pkgRoot('@hy/cad-html-plugin'), 'dist', 'viewer-runtime.iife.js'),
  join(outDir, 'viewer-runtime.iife.js')
)

// Local cad-data mirror → dist-runner/cad-data/fonts/…
//
// The mirror is not tracked by git (`pnpm sync:cad-data` populates it), so a
// missing directory is not an error: the runner then falls back to the
// jsDelivr CDN, exactly like the example app.
if (existsSync(cadDataFontsDir)) {
  const targetDir = join(outDir, CAD_DATA_PACKAGE_DIR_NAME, CAD_DATA_FONTS_DIR)
  mkdirSync(targetDir, { recursive: true })
  for (const file of readdirSync(cadDataFontsDir)) {
    copy(join(cadDataFontsDir, file), join(targetDir, file))
  }
  console.log(
    `Copied local cad-data fonts into dist-runner/${CAD_DATA_PACKAGE_DIR_NAME}/${CAD_DATA_FONTS_DIR}/`
  )
} else {
  console.warn(
    `[cad-simple-viewer-cli] Local cad-data mirror not found at ${cadDataFontsDir}; ` +
      'the headless runner will fetch fonts from the jsDelivr CDN. Run `pnpm sync:cad-data` for offline runs.'
  )
}

console.log('Copied runner workers and viewer runtime into dist-runner/')

#!/usr/bin/env node
/**
 * Sync the local `cad-data` mirror (`packages/cad-data/`).
 *
 * `cad-data` is a pure static-asset repository (AutoCAD SHX/WOFF/TTF fonts,
 * DXF templates and sample drawings) that the viewer used to fetch from
 * jsDelivr at runtime. Fetching fonts from a third-party CDN is what made the
 * viewer unusable offline — and the upstream repo ships third-party
 * proprietary fonts with no license grant ("It is your own responsibility to
 * buy license of those data"), so the assets are deliberately NOT committed to
 * git. Every machine that needs offline fonts syncs its own copy instead.
 *
 * Usage (from the `cad-viewer/` directory):
 *   node tools/sync-cad-data.mjs              # essential subset (~9.4 MB)
 *   node tools/sync-cad-data.mjs --all        # full mirror (~55 MB)
 *   node tools/sync-cad-data.mjs --force      # re-download existing files
 *   node tools/sync-cad-data.mjs --check      # report status, download nothing
 *   node tools/sync-cad-data.mjs --list       # print the file list only
 *
 * The essential subset is what the viewer's default `modern` font preset needs
 * (`hztxt` + `simsun` + symbol fonts `simplex`/`amgdt`), the CJK face Chinese
 * drawings routinely name in their text styles (`simkai`, aliased as
 * `SimKai`/`楷体`), plus one sample DXF for the CLI examples gallery.
 * `fonts.json` is trimmed to the synced files so an unknown font resolves to a
 * cheap local "not found" instead of a network round-trip; it is rebuilt on
 * every sync because it is derived from the manifest — a stale catalog would
 * leave a freshly synced font unreachable by name.
 *
 * Set `GITHUB_TOKEN` when using `--all` to lift the anonymous GitHub API rate
 * limit.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CAD_DATA_ALL_DIRS,
  CAD_DATA_CDN_BASE_URL,
  CAD_DATA_DIR,
  CAD_DATA_ESSENTIAL_FONT_FILES,
  CAD_DATA_ESSENTIAL_SAMPLE_FILES,
  CAD_DATA_FONTS_DIR,
  CAD_DATA_FONTS_METADATA_FILE,
  CAD_DATA_RAW_BASE_URL,
  CAD_DATA_REF,
  CAD_DATA_REPO,
  CAD_DATA_SAMPLE_DIR
} from './cad-data-assets.mjs'

const monorepoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const mirrorRoot = join(monorepoRoot, CAD_DATA_DIR)

const args = new Set(process.argv.slice(2))
const allMode = args.has('--all')
const forceMode = args.has('--force')
const checkMode = args.has('--check')
const listMode = args.has('--list')

const HOSTS = [CAD_DATA_CDN_BASE_URL, CAD_DATA_RAW_BASE_URL]
const ATTEMPTS_PER_HOST = 3

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Downloads one upstream asset, trying every host a few times.
 *
 * @param relativePath - Path relative to the upstream repository root
 * @returns File contents
 */
async function download(relativePath) {
  let lastError
  for (const host of HOSTS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_HOST; attempt++) {
      try {
        const response = await fetch(`${host}/${relativePath}`, {
          redirect: 'follow'
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }
        return Buffer.from(await response.arrayBuffer())
      } catch (error) {
        lastError = error
        if (attempt < ATTEMPTS_PER_HOST) {
          await sleep(500 * attempt)
        }
      }
    }
  }
  throw new Error(
    `Failed to download ${relativePath} from ${HOSTS.join(' or ')}: ${
      lastError?.message ?? lastError
    }`
  )
}

/**
 * Lists every blob of the upstream repository via the GitHub tree API.
 *
 * Only needed by `--all`; the essential subset uses a hard-coded file list.
 */
async function listUpstreamTree() {
  const url = `https://api.github.com/repos/${CAD_DATA_REPO}/git/trees/${CAD_DATA_REF}?recursive=1`
  const headers = { accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(
      `GitHub tree API failed (HTTP ${response.status}); set GITHUB_TOKEN to lift the rate limit`
    )
  }
  const body = await response.json()
  return body.tree
    .filter(entry => entry.type === 'blob')
    .map(entry => entry.path)
}

function writeMirrorFile(relativePath, buffer) {
  const target = join(mirrorRoot, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buffer)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function reportLine(status, relativePath, bytes) {
  const icon = status === 'written' ? '✓' : status === 'skipped' ? '⏭' : '✗'
  const size = bytes == null ? '' : ` (${formatBytes(bytes)})`
  console.log(`  ${icon} ${relativePath}${size}`)
}

/** Builds the trimmed `fonts.json` from the entries actually synced. */
function buildTrimmedFontCatalog(catalogBuffer, fontFiles) {
  const entries = JSON.parse(catalogBuffer.toString('utf8'))
  const wanted = new Set(fontFiles)
  const kept = entries.filter(entry => wanted.has(entry.file))
  const missing = [...wanted].filter(
    file => !kept.some(entry => entry.file === file)
  )
  if (missing.length > 0) {
    throw new Error(
      `Upstream fonts.json does not list: ${missing.join(', ')} — the catalog changed, update tools/cad-data-assets.mjs`
    )
  }
  return Buffer.from(`${JSON.stringify(kept, null, 2)}\n`, 'utf8')
}

/** Essential subset: the default viewer font preset plus a sample DXF. */
function essentialTargets() {
  return [
    ...CAD_DATA_ESSENTIAL_FONT_FILES.map(entry => ({
      path: `${CAD_DATA_FONTS_DIR}/${entry.file}`,
      bytes: entry.bytes
    })),
    ...CAD_DATA_ESSENTIAL_SAMPLE_FILES.map(entry => ({
      path: `${CAD_DATA_SAMPLE_DIR}/${entry.file}`,
      bytes: entry.bytes
    })),
    {
      path: `${CAD_DATA_FONTS_DIR}/${CAD_DATA_FONTS_METADATA_FILE}`,
      bytes: 9424
    }
  ]
}

function checkMirror(targets) {
  let fileMissing = 0
  let total = 0
  for (const target of targets) {
    const full = join(mirrorRoot, target.path)
    if (existsSync(full) && statSync(full).size > 0) {
      const size = statSync(full).size
      total += size
      reportLine('skipped', target.path, size)
    } else {
      fileMissing++
      reportLine('missing', target.path, null)
    }
  }

  // A present binary is not enough: `fonts.json` is what maps a DXF font name
  // to a file, so a trimmed catalog that predates a manifest change leaves the
  // new font on disk and unreachable. Report that as a problem too.
  const catalogPath = join(
    mirrorRoot,
    CAD_DATA_FONTS_DIR,
    CAD_DATA_FONTS_METADATA_FILE
  )
  const catalogGaps = missingCatalogFonts(catalogPath)
  if (catalogGaps.length > 0) {
    console.log(
      `  ✗ ${CAD_DATA_FONTS_DIR}/${CAD_DATA_FONTS_METADATA_FILE} 未收录: ${catalogGaps.join(', ')}`
    )
  }

  const ok = fileMissing === 0 && catalogGaps.length === 0
  console.log(
    `\n${ok ? '✅' : '⚠'} 文件 ${targets.length - fileMissing}/${targets.length} 就位, ${formatBytes(total)} on disk`
  )
  if (catalogGaps.length > 0) {
    console.log(
      `   字体目录未收录 ${catalogGaps.length} 个必需字体（重跑同步可重建）`
    )
  }
  console.log(
    `   镜像目录: ${mirrorRoot}\n   运行 \`pnpm sync:cad-data\` 补齐缺失文件。`
  )
  return fileMissing + catalogGaps.length
}

/**
 * Lists essential font files missing from the local `fonts.json`.
 *
 * @param catalogPath - Local (trimmed) font catalog.
 * @returns Font file names that the manifest requires but the catalog omits.
 */
function missingCatalogFonts(catalogPath) {
  if (!existsSync(catalogPath)) {
    return CAD_DATA_ESSENTIAL_FONT_FILES.map(entry => entry.file)
  }
  try {
    const entries = JSON.parse(readFileSync(catalogPath, 'utf8'))
    const listed = new Set(entries.map(entry => entry.file))
    return CAD_DATA_ESSENTIAL_FONT_FILES.map(entry => entry.file).filter(
      file => !listed.has(file)
    )
  } catch {
    return CAD_DATA_ESSENTIAL_FONT_FILES.map(entry => entry.file)
  }
}

async function syncEssential() {
  console.log(`\n同步 cad-data 必需子集 → ${mirrorRoot}`)
  const fontFiles = CAD_DATA_ESSENTIAL_FONT_FILES.map(entry => entry.file)

  for (const entry of CAD_DATA_ESSENTIAL_FONT_FILES) {
    const target = join(mirrorRoot, CAD_DATA_FONTS_DIR, entry.file)
    if (!forceMode && existsSync(target) && statSync(target).size > 0) {
      reportLine(
        'skipped',
        `${CAD_DATA_FONTS_DIR}/${entry.file}`,
        statSync(target).size
      )
      continue
    }
    const buffer = await download(`${CAD_DATA_FONTS_DIR}/${entry.file}`)
    if (entry.bytes && buffer.length !== entry.bytes) {
      console.warn(
        `  ⚠ ${entry.file}: upstream size changed (${buffer.length} B, expected ${entry.bytes} B)`
      )
    }
    writeMirrorFile(`${CAD_DATA_FONTS_DIR}/${entry.file}`, buffer)
    reportLine('written', `${CAD_DATA_FONTS_DIR}/${entry.file}`, buffer.length)
  }

  for (const entry of CAD_DATA_ESSENTIAL_SAMPLE_FILES) {
    const target = join(mirrorRoot, CAD_DATA_SAMPLE_DIR, entry.file)
    if (!forceMode && existsSync(target) && statSync(target).size > 0) {
      reportLine(
        'skipped',
        `${CAD_DATA_SAMPLE_DIR}/${entry.file}`,
        statSync(target).size
      )
      continue
    }
    const buffer = await download(`${CAD_DATA_SAMPLE_DIR}/${entry.file}`)
    writeMirrorFile(`${CAD_DATA_SAMPLE_DIR}/${entry.file}`, buffer)
    reportLine('written', `${CAD_DATA_SAMPLE_DIR}/${entry.file}`, buffer.length)
  }

  // The trimmed catalog is derived from the manifest, so it is rebuilt on
  // every sync: keying it on "file exists" left a pre-existing catalog stale
  // after a font was added (the binary synced, the name stayed unresolvable).
  const catalog = await download(
    `${CAD_DATA_FONTS_DIR}/${CAD_DATA_FONTS_METADATA_FILE}`
  )
  const trimmed = buildTrimmedFontCatalog(catalog, fontFiles)
  writeMirrorFile(
    `${CAD_DATA_FONTS_DIR}/${CAD_DATA_FONTS_METADATA_FILE}`,
    trimmed
  )
  reportLine(
    'written',
    `${CAD_DATA_FONTS_DIR}/${CAD_DATA_FONTS_METADATA_FILE}`,
    trimmed.length
  )
}

async function syncAll() {
  console.log(`\n同步 cad-data 全量镜像 → ${mirrorRoot}`)
  const paths = (await listUpstreamTree()).filter(path =>
    CAD_DATA_ALL_DIRS.some(dir => path.startsWith(`${dir}/`))
  )
  let written = 0
  let skipped = 0
  let bytes = 0
  for (const path of paths) {
    const target = join(mirrorRoot, path)
    if (!forceMode && existsSync(target) && statSync(target).size > 0) {
      skipped++
      bytes += statSync(target).size
      continue
    }
    const buffer = await download(path)
    writeMirrorFile(path, buffer)
    written++
    bytes += buffer.length
    reportLine('written', path, buffer.length)
  }
  console.log(
    `\n✅ 全量镜像完成: 新下载 ${written} 个, 跳过 ${skipped} 个, 共 ${formatBytes(bytes)}`
  )
}

async function main() {
  if (listMode) {
    const targets = allMode
      ? (await listUpstreamTree()).filter(path =>
          CAD_DATA_ALL_DIRS.some(dir => path.startsWith(`${dir}/`))
        )
      : essentialTargets().map(target => target.path)
    for (const path of targets) {
      console.log(path)
    }
    return
  }

  if (checkMode) {
    const missing = allMode ? 0 : checkMirror(essentialTargets())
    if (missing > 0) {
      process.exitCode = 1
    }
    return
  }

  if (allMode) {
    await syncAll()
  } else {
    await syncEssential()
  }

  if (!allMode) {
    const missing = checkMirror(essentialTargets())
    if (missing > 0) {
      process.exitCode = 1
    }
  } else {
    console.log('\n提示: 全量镜像模式下 fonts.json 保留上游原始内容。')
  }
}

main().catch(error => {
  console.error(`\n✗ cad-data 同步失败: ${error.message}`)
  process.exit(1)
})

/**
 * Canonical names for the local `cad-data` asset mirror.
 *
 * The viewer reads its AutoCAD fonts from `<baseUrl>/fonts/` and materialises
 * that URL from the viewer's `baseUrl` option (see
 * `AcApDocManager.resolveFontsBaseUrl`). Historically `baseUrl` pointed at the
 * jsDelivr mirror of `mlightcad/cad-data`, which made every first paint depend
 * on a third-party CDN and left offline/intranet deployments without CJK
 * glyphs.
 *
 * `packages/cad-data` is the local mirror: `tools/sync-cad-data.mjs` downloads
 * the required subset into it, and each consumer copies it next to its own
 * build output so the runtime URL stays same-origin. The asset bodies are NOT
 * tracked by git (see `.gitignore`) — upstream ships third-party proprietary
 * fonts with no license grant, so every developer/CI machine syncs its own
 * copy.
 *
 * Runtime TypeScript mirrors these names in:
 *   packages/cad-simple-viewer/src/app/AcApCadDataAssets.ts
 */

/** Local mirror directory, relative to the monorepo root (`cad-viewer/`). */
export const CAD_DATA_DIR = 'packages/cad-data'

/** Basename of {@link CAD_DATA_DIR}, for builds that reference it as a sibling. */
export const CAD_DATA_PACKAGE_DIR_NAME = 'cad-data'

/** Sub-directory holding AutoCAD font binaries plus `fonts.json`. */
export const CAD_DATA_FONTS_DIR = 'fonts'

/** Sub-directory holding sample drawings. */
export const CAD_DATA_SAMPLE_DIR = 'data'

/**
 * Font catalog read by `@mlightcad/mtext-renderer` as `<baseUrl>fonts.json`.
 * The catalog is what maps a DXF font name to a file name, so it must ship
 * together with the binaries.
 */
export const CAD_DATA_FONTS_METADATA_FILE = 'fonts.json'

/** Upstream repository that hosts the assets. */
export const CAD_DATA_REPO = 'mlightcad/cad-data'

/** Upstream ref tracked by the sync script. */
export const CAD_DATA_REF = 'main'

/** Primary download host (same one the runtime used before this migration). */
export const CAD_DATA_CDN_BASE_URL = `https://cdn.jsdelivr.net/gh/${CAD_DATA_REPO}@${CAD_DATA_REF}`

/** Fallback download host, used when jsDelivr fails. */
export const CAD_DATA_RAW_BASE_URL = `https://raw.githubusercontent.com/${CAD_DATA_REPO}/${CAD_DATA_REF}`

/**
 * Fonts needed by the viewer's default `modern` preset:
 * `['hztxt','simsun']` plus symbol fonts `['simplex','amgdt']`.
 *
 * `simsun` resolves to `simsun.woff` through `fonts.json` — the 10 MB
 * `simsun.ttf` sitting next to it upstream is not referenced by the catalog
 * and is deliberately not synced.
 *
 * `simkai.woff` is synced for the same reason even though it is not a default
 * face: Chinese drawings routinely name a Windows CJK font in their text
 * styles (`SimKai` / 楷体 is the stock face of the AutoCAD China templates),
 * and every name that is absent from the mirror degrades to the fallback chain
 * plus a "font not found" notice. The catalog lists this file under both
 * `simkai` and `楷体`, and lookups are case-insensitive, so `SimKai` resolves
 * directly.
 *
 * `bytes` is the upstream size at the time of writing; the sync script warns
 * (but does not fail) when it changes, so an upstream font refresh is visible
 * without breaking offline builds.
 */
export const CAD_DATA_ESSENTIAL_FONT_FILES = [
  { file: 'hztxt.shx', bytes: 1171617 },
  { file: 'simsun.woff', bytes: 6431956 },
  { file: 'simkai.woff', bytes: 1645448 },
  { file: 'simplex.shx', bytes: 17816 },
  { file: 'amgdt.shx', bytes: 5419 }
]

/**
 * Sample drawing used as the default fixture of the CLI examples gallery.
 * A DXF on purpose: the CLI only accepts `.dxf` inputs.
 */
export const CAD_DATA_ESSENTIAL_SAMPLE_FILES = [
  { file: 'block-color.dxf', bytes: 606282 }
]

/** Full mirror directories, used by `sync-cad-data.mjs --all`. */
export const CAD_DATA_ALL_DIRS = ['fonts', 'templates', 'data']

/** Path (relative to the monorepo root) of the synced font catalog. */
export function cadDataFontsMetadataPath() {
  return `${CAD_DATA_DIR}/${CAD_DATA_FONTS_DIR}/${CAD_DATA_FONTS_METADATA_FILE}`
}

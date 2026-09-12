/**
 * Local-first resolution of the `cad-data` asset repository root.
 *
 * The viewer treats its `baseUrl` option as the root of an asset repository and
 * derives `<baseUrl>/fonts/` from it, where it fetches `fonts.json` and the font
 * binaries (see `AcApDocManager.resolveFontsBaseUrl`). Until this module
 * existed, every entry point passed the jsDelivr mirror of
 * `mlightcad/cad-data` directly, so a first paint always depended on a
 * third-party CDN and offline/intranet deployments rendered no CJK glyphs at
 * all: the font catalog request throws before the IndexedDB cache is consulted.
 *
 * `cad-viewer/packages/cad-data` is now the local mirror, populated by
 * `pnpm sync:cad-data` and copied next to each application's build output.
 * {@link resolveCadDataBaseUrl} implements the "local first, CDN fallback"
 * policy: probe `<local>/fonts/fonts.json` once, use the local copy when it is
 * there (fully offline), otherwise keep the previous CDN behaviour so a machine
 * that has not synced yet keeps working.
 *
 * Build scripts mirror these names in `tools/cad-data-assets.mjs`.
 */

/** Upstream CDN mirror, kept as the fallback when no local copy is available. */
export const CAD_DATA_CDN_BASE_URL =
  'https://cdn.jsdelivr.net/gh/mlightcad/cad-data'

/** Application-relative directory that serves the local mirror. */
export const CAD_DATA_LOCAL_DIR_NAME = 'cad-data'

/** Sub-directory of the mirror that holds the font binaries and catalog. */
export const CAD_DATA_FONTS_DIR_NAME = 'fonts'

/**
 * Font catalog inside {@link CAD_DATA_FONTS_DIR_NAME}. Its presence is also the
 * readiness probe: the sync script writes it together with the binaries, so
 * `fonts.json` existing implies the font set is usable.
 */
export const CAD_DATA_FONTS_METADATA_FILE = 'fonts.json'

/** Options accepted by {@link resolveCadDataBaseUrl}. */
export interface AcApCadDataBaseUrlOptions {
  /**
   * Base URL of the host application, used to locate the local mirror.
   * Vite hosts pass `import.meta.env.BASE_URL`. Defaults to `'./'`, which
   * resolves against `document.baseURI` and therefore also works when the app
   * is deployed under a sub-path (GitHub Pages).
   */
  appBaseUrl?: string
  /** Override for {@link CAD_DATA_LOCAL_DIR_NAME}. */
  localDirName?: string
  /** Override for {@link CAD_DATA_CDN_BASE_URL}. */
  fallbackBaseUrl?: string
  /** How long the local probe may take before falling back. Defaults to 2000 ms. */
  probeTimeoutMs?: number
  /** Use the local base URL without probing. Useful for tests and CLIs. */
  skipProbe?: boolean
}

/** Document base to resolve relative URLs against; workers have no document. */
export function resolveDocumentBaseUrl(): string {
  const base = globalThis.document?.baseURI
  return base && base.length > 0 ? base : 'http://localhost/'
}

/**
 * Absolute URL of the local mirror, e.g. `https://host/app/cad-data/`.
 *
 * The result is absolute on purpose: the MTEXT renderer loads fonts from a
 * module Web Worker, and a relative URL inside a worker resolves against the
 * worker script (`dist/assets/…`) rather than the page.
 */
export function resolveLocalCadDataBaseUrl(
  appBaseUrl = './',
  localDirName = CAD_DATA_LOCAL_DIR_NAME
): string {
  const appRoot = new URL(appBaseUrl, resolveDocumentBaseUrl())
  return new URL(`${localDirName}/`, appRoot).href
}

/**
 * Probes whether the local mirror is served at `baseUrl`.
 *
 * Fetches the font catalog (a few hundred bytes to a few kilobytes) — `GET`
 * rather than `HEAD` because several static servers in this monorepo answer
 * only `GET`. Any network error, timeout or non-OK status means "missing", so
 * callers fall back to the CDN.
 */
export async function isLocalCadDataAvailable(
  baseUrl: string,
  timeoutMs = 2000
): Promise<boolean> {
  const probeUrl = `${baseUrl}${CAD_DATA_FONTS_DIR_NAME}/${CAD_DATA_FONTS_METADATA_FILE}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(probeUrl, { signal: controller.signal })
    if (!response.ok) return false
    // The body is not needed; release the stream instead of buffering it.
    void response.body?.cancel().catch(() => undefined)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Cached probe results, keyed by `<local>|<fallback>`. Every viewer instance in
 * a session resolves the same pair, and the mirror does not change at runtime.
 */
const probeCache = new Map<string, Promise<string>>()

/**
 * Resolves the asset base URL to hand to the viewer.
 *
 * @param options - Host application base and fallback overrides
 * @returns Absolute base URL ending in `/`; the local mirror when available,
 *          the CDN fallback otherwise
 */
export function resolveCadDataBaseUrl(
  options: AcApCadDataBaseUrlOptions = {}
): Promise<string> {
  const localBaseUrl = resolveLocalCadDataBaseUrl(
    options.appBaseUrl,
    options.localDirName
  )
  const fallbackBaseUrl = withTrailingSlash(
    options.fallbackBaseUrl ?? CAD_DATA_CDN_BASE_URL
  )
  if (options.skipProbe) {
    return Promise.resolve(localBaseUrl)
  }
  const key = `${localBaseUrl}|${fallbackBaseUrl}`
  let pending = probeCache.get(key)
  if (!pending) {
    pending = isLocalCadDataAvailable(
      localBaseUrl,
      options.probeTimeoutMs
    ).then(available => {
      if (!available) {
        console.info(
          `[cad-viewer] Local cad-data mirror not found at ${localBaseUrl}; ` +
            `falling back to ${fallbackBaseUrl} (run \`pnpm sync:cad-data\` for offline fonts).`
        )
      }
      return available ? localBaseUrl : fallbackBaseUrl
    })
    probeCache.set(key, pending)
  }
  return pending
}

/** Drops cached probe results. Intended for tests. */
export function resetCadDataBaseUrlCache(): void {
  probeCache.clear()
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

/**
 * Canonical filenames for Web Worker JS bundles used by the viewer.
 *
 * Keep these in one place so rename/migration is a single-file change.
 * Build scripts mirror these in: `tools/worker-assets.mjs`
 */

/** MTEXT layout/shaping worker from `@mlightcad/mtext-renderer`. */
export const MTEXT_RENDERER_WORKER_FILE = 'mtext-renderer-worker.js'

/** DXF tokenizer worker from `@mlightcad/data-model`. */
export const DXF_PARSER_WORKER_FILE = 'dxf-parser-worker.js'

/**
 * Proprietary DWG parser worker from private package `@mlight-cad/dwg-converter`.
 * Not registered by default; used when the host app opts into that converter.
 */
export const DWG_PARSER_WORKER_FILE = 'dwg-parser-worker.js'

/**
 * Proprietary DWG parser main-thread module from `@mlight-cad/dwg-converter`.
 * Used when parsing DWG on the main thread instead of a Web Worker.
 */
export const DWG_PARSER_MAIN_FILE = 'dwg-parser-main.js'

/** npm package that ships {@link MTEXT_RENDERER_WORKER_FILE}. */
export const MTEXT_RENDERER_PACKAGE = '@mlightcad/mtext-renderer'

/** npm package that ships {@link DXF_PARSER_WORKER_FILE}. */
export const DATA_MODEL_PACKAGE = '@mlightcad/data-model'

/** Private npm package that ships {@link DWG_PARSER_WORKER_FILE} / {@link DWG_PARSER_MAIN_FILE}. */
export const DWG_CONVERTER_PACKAGE = '@mlight-cad/dwg-converter'

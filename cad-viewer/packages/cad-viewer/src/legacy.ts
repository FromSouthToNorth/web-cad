/**
 * Legacy Element Plus shell entry (`@mlightcad/cad-viewer/legacy`).
 *
 * The old MlCadViewer shell (toolbars, palettes, ribbon, status bar) is built
 * on `@mlightcad/ui-components` / Element Plus. It moved out of the main
 * entry so consumers that only need the engine + Ant Design shell no longer
 * pull Element Plus into their bundles.
 *
 * Consumers of the old shell should switch their import to:
 *   import { MlCadViewer } from '@mlightcad/cad-viewer/legacy'
 * and install `@mlightcad/ui-components` (its peer `element-plus` follows).
 */

export * from './component/layout'
export * from './component/palette'
export * from './component/ribbon'
export * from './component/notification'
export * from './component/statusBar'
export { default as MlCadViewer } from './component/MlCadViewer.vue'

// Hatch pattern UI built on @mlightcad/ribbon (Element Plus); only the legacy
// shell consumes it, so it lives here instead of the main entry.
export { default as MlHatchPatternPanel } from './component/common/MlHatchPatternPanel.vue'
export { default as MlHatchPatternDropdown } from './component/common/MlHatchPatternDropdown.vue'

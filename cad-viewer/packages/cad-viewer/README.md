# CAD Viewer Component

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@mlightcad/cad-viewer.svg)](https://www.npmjs.com/package/@mlightcad/cad-viewer)

`@mlightcad/cad-viewer` is the UI layer of the mlightcad web CAD stack. It provides **Vue 3 components, dialogs, commands, composables, and i18n** for viewing and editing CAD files (DXF, DWG) **entirely in the browser without requiring any backend server**, on top of the `@mlightcad/cad-simple-viewer` engine and the `@mlightcad/three-renderer` renderer.

## Key Features

- **High-performance** CAD editing and viewing with smooth 60+ FPS rendering
- **No backend required** - Files are parsed and processed entirely in the browser
- **Enhanced data security** - Files never leave your device, ensuring complete privacy
- **Local file support** - Load DWG/DXF files directly from your computer via file dialog or drag & drop
- **Remote file support** - Load CAD files from URLs automatically
- **Easy integration** - No server setup or backend infrastructure needed for third-party integration
- Modern UI optimized for large CAD file handling
- State management for layers, entities, and settings
- Integration with optimized SVG and THREE.js renderers
- Dialogs, toolbars, and command line interface
- Ant Design Vue-based components, themable via CSS variables and a `ConfigProvider` token bridge

## When Should You Choose cad-viewer?

Use `cad-viewer` if you want **ready-to-use CAD UI building blocks** — dialogs, toolbars, commands, composables, and i18n — for viewing and editing CAD files. This package is ideal if:

- You want to embed CAD viewing/editing into your Vue application with minimal setup.
- You need support for both local file loading (from user's computer) and remote file loading (from URLs).
- You need a solution that handles file loading, rendering, layer/entity management, and user interactions out of the box.
- You want seamless integration with optimized SVG and THREE.js renderers, internationalization, and theming.
- You do **not** want to build every CAD dialog and command from scratch.

**Note:** Since v2.0, `cad-viewer` no longer ships the ready-made Element Plus viewer shell (`MlCadViewer`). Build your own shell with the exported components and composables, or use the [`cad-viewer-example`](../cad-viewer-example/README.md) package as a reference Ant Design Vue shell.

**Recommended for:** Most web applications, dashboards, or platforms that need to display CAD files with a polished user interface.

## Browser-Only Architecture

This package operates entirely in the browser with **no backend dependencies**. DWG/DXF files are parsed and processed locally using WebAssembly and JavaScript, providing:

- **Zero server requirements** - Deploy the component anywhere with just static file hosting
- **Complete data privacy** - CAD files never leave the user's device, whether loaded locally or from URLs
- **Local file support** - Users can load files directly from their computer using the built-in file dialog
- **Remote file support** - Automatically load files from URLs when provided
- **Instant integration** - No complex backend setup or API configuration needed
- **Offline capability** - Works without internet connectivity once loaded
- **Third-party friendly** - Easy to embed in any Vue 3 application without server-side concerns

## Directory Structure (partial)

- `src/app/` – Application entry, store, and command/dialog registration
- `src/component/` – UI components (dialogs, base controls, layer table, …)
- `src/composable/` – Vue composables for state and logic
- `src/locale/` – Internationalization files
- `src/style/` – Stylesheets
- `src/svg/` – SVG assets

## Installation

```bash
npm install @mlightcad/cad-viewer
```

## Usage

Please refer to sub-package `cad-viewer-example` as one example.

### Basic Usage

Add the following peer dependencies into your package.json.

- @mlightcad/cad-simple-viewer
- @mlightcad/cad-viewer
- @mlightcad/data-model
- @mlightcad/three-renderer
- @vueuse/core
- ant-design-vue
- lodash-es
- three
- vue
- vue-i18n

Then initialize the viewer and register the built-in commands and dialogs.

```ts
import {
  initializeCadViewer,
  registerCmds,
  registerDialogs,
  registerLazyPlugins,
  i18n
} from '@mlightcad/cad-viewer'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import { createApp } from 'vue'

initializeCadViewer()
registerCmds()
registerDialogs()
registerLazyPlugins()

const app = createApp(App)
app.use(Antd)
app.use(i18n)
app.mount('#app')
```

### Available Exports

#### Setup

- `initializeCadViewer` - Bootstraps the viewer on top of `AcApDocManager`
- `registerCmds` - Registers the built-in commands (`layer`, `properties`, `insert`, `style`, `qselect`, `pttype`, `units`, `chtml`, `attedit`, `attdef`, …)
- `registerDialogs` - Registers the built-in dialogs
- `registerLazyPlugins` - Registers lazy plugin integrations (PDF, HTML export, SVG, Agent, Search)
- `registerMTextColorPicker` - Installs the default MTEXT color picker toolbar
- `store` - Reactive store (palette tab, plugin feature flags)
- `i18n` - Internationalization instance

#### Commands

- `AcApLayerStateCmd` - Layer state command
- `AcApPointStyleCmd` - Point style command
- `AcApPropertiesCmd` - Entity properties command
- `AcApInsertPaletteCmd` - Blocks palette command
- `AcApDrawingUnitsCmd` - Drawing units dialog command
- `AcApExportHtmlDlgCmd` - HTML export dialog command
- `AcApQSelectCmd` - Quick select dialog command
- `AcApTextStyleCmd` - Text style dialog command
- `AcApAttEditCmd` - Attribute edit dialog command
- `AcApAttDefCmd` - Attribute definition dialog command

#### Components

Dialogs: `MlPointStyleDlg`, `MlQuickSelectDlg`, `MlExportHtmlDlg`, `MlDrawingUnitsDlg`, `MlTextStyleDlg`, `MlAttEditDlg`, `MlAttDefDlg`, `MlColorPickerDlg`

Common controls: `MlBaseDialog`, `MlBaseDrawStyleToolbar`, `MlBaseInputNumber`, `MlBlockInsertGallery`, `MlColorDropdown`, `MlColorIndexPicker`, `MlColorPickerDropdown`, `MlColorPickerTabs`, `MlDialogManager`, `MlFieldsetGroup`, `MlLineWeightSelect`, `MlLayerSelect`, `MlLayerTable`, `MlFontFileReader`, `MlLineTypeSelect`, `MlSysVarToggleButton`, `MlToggleButton`

#### Composables

- `useCommands` - Command management
- `useCurrentPos` - Current position tracking
- `useDark` - Reactive dark-mode state backed by the `COLORTHEME` system variable
- `useDialogManager` - Dialog management
- `useDocument` - Active document access
- `useFileTypes` - File type utilities
- `useLayers` - Layer management
- `useLayouts` - Layout management
- `useSettings` - Settings management
- `useSystemVars` - System variables
- `useUndoRedo` - Undo/redo state
- `useSelectionSet` - Selection set state
- `useInsertableBlocks` - Insertable block definitions
- `useMarkup` - Markup entity access
- `useQuickSelect` - Quick select logic
- `useAttEdit` - Attribute editing logic
- `useTextStyle` - Text style state
- `useLocale` - Locale helpers
- `useLayerFilters` - Layer filter state

### Theme Synchronization

The viewer UI theme is synchronized through the `COLORTHEME` system variable managed by `AcDbSysVarManager`.

- `COLORTHEME = 0` means dark theme.
- `COLORTHEME = 1` means light theme.
- The exported `useDark` composable wraps `COLORTHEME` instead of maintaining an isolated local dark-mode state.
- Any runtime change to `COLORTHEME` is reflected automatically in viewer UI and MTEXT-related UI.

Component styling is driven by the `--ml-theme-*` CSS variables (see `src/style/index.scss`); `cad-viewer-example` bridges them into the Ant Design Vue `ConfigProvider` token set.

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build the library
pnpm build

# Preview the build
pnpm preview
```

## License

MIT

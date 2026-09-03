---
'@mlightcad/cad-viewer': major
'@mlightcad/cad-viewer-example': minor
'@mlightcad/cad-viewer-examples': minor
---

# 删除旧 Element Plus 壳

`@mlightcad/cad-viewer` 基于 Element Plus 的旧壳组件已全部移除：
`MlCadViewer`、`MlToolBars`、`MlStatusBar`、`MlPaletteManager`、
`MlRibbonCommands`、`MlNotificationCenter`、`MlHatchPatternPanel`、
`MlHatchPatternDropdown`、`MlCharacterMapDialog` 等，以及仅旧壳使用的
命令（`AcApMemCmd`、`AcApOpenPerfCmd`、`AcApCountListCmd`、`AcApXrefCmd`、
`AcApMissedDataCmd`、`AcApMarkupPanelCmd`、`AcApHatchRibbonCmd`）与组合式函数
（`useNotificationCenter`、`useMemoryProfile`、`useCountList`、
`useViewerRect`、`useIsMobile`、`useOpenFileProfile`、
`openMissingResourcesPalette`、`useMissedData`、`useRibbonContextualTab`、
`useDrawStyleToolbar`、`useHover`）。

包对 `@mlightcad/ui-components`、`@mlightcad/ribbon` 与 `element-plus` 的
依赖（可选 peer + workspace override）已彻底移除，element-plus 不再出现在
lockfile 中。

## 迁移方式

`@mlightcad/cad-viewer` 不再提供完整查看器壳。请基于导出的命令、对话框、
公共组件与组合式函数自行组装壳，或参考 `cad-viewer-example` 的 Ant Design
Vue 壳实现。

```ts
import {
  initializeCadViewer,
  registerCmds,
  registerDialogs,
  registerLazyPlugins,
  i18n
} from '@mlightcad/cad-viewer'
```

## 其它变更

- 主入口恢复单入口构建，产物为 `dist/cad-viewer.js` + `dist/cad-viewer.css`
  （不再有 `/legacy` 子路径与 `cad-viewer-legacy.css`）。
- CDN 引导页（`cad-viewer-examples`）回退到 1.6.1（最后一个内联旧壳的
  发布版本）主入口。
- 引擎自带的 `-hatch` 命令不受影响；旧壳专用的 `hatch` 命令注册已移除。

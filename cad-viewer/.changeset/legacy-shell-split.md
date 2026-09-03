---
'@mlightcad/cad-viewer': major
'@mlightcad/cad-viewer-example': minor
'@mlightcad/cad-viewer-examples': minor
---

# 拆分旧 Element Plus 壳到 `/legacy` 子路径

`@mlightcad/cad-viewer` 的主入口不再导出基于 Element Plus 的旧壳组件
（`MlCadViewer`、`MlToolBars`、`MlStatusBar`、`MlPaletteManager`、
`MlRibbonCommands`、`MlNotificationCenter`、`MlHatchPatternDropdown` 等），
主 dist 不再内联 `@mlightcad/ui-components`、`@mlightcad/ribbon` 与
Element Plus 组件代码。

## 迁移方式

旧壳消费者改为从子路径导入：

```ts
import { MlCadViewer } from '@mlightcad/cad-viewer/legacy'
```

并安装可选 peer 依赖：

```sh
pnpm add @mlightcad/ui-components @mlightcad/ribbon element-plus
```

## 其它变更

- 产物 CSS 由 `dist/cad-viewer.css` 拆分为
  `dist/cad-viewer-app.css`（主入口）与 `dist/cad-viewer-legacy.css`（旧壳）。
- `@mlightcad/three-viewcube`（未使用的依赖）已移除。
- `cad-viewer-example` 移除 Element Plus 全量引入与全局注册，
  主 chunk 减小约 841 KB（JS）+ 352 KB（CSS）。
- CDN 引导页（`cad-viewer-examples`）已迁移至 `/legacy` 子路径。

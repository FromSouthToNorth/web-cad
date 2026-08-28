# CAD 大图纸性能优化工作区

本仓库是一个基于 [mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer) 的单一 monorepo,
包含纯浏览器端 DWG/DXF 查看器、编辑器以及底层 DWG/DXF 解析核心(仿 ObjectARX API 设计),
用于大图纸(煤矿采掘工程平面图等)加载与渲染性能的联合优化。

## 项目结构

```
bw-cad-view/
├── cad-viewer/                 # 单一 monorepo (pnpm workspace + nx)
│   └── packages/
│       ├── common/             # 基础工具、颜色管理、日志
│       ├── geometry-engine/    # 几何计算引擎
│       ├── graphic-interface/  # 图形接口抽象
│       ├── data-model/         # DWG/DXF 解析核心 (仿 ObjectARX)
│       ├── three-renderer/     # Three.js 3D 渲染
│       ├── cad-simple-viewer/  # 轻量查看器核心
│       ├── cad-viewer/         # Vue 全功能查看器
│       ├── cad-svg-plugin/     # SVG 导出插件
│       ├── cad-pdf-plugin/     # PDF 导出插件
│       ├── cad-html-plugin/    # HTML 导出插件
│       ├── cad-agent-plugin/   # AI 智能助手插件
│       ├── cad-simple-ui-plugin/
│       ├── cad-invertsel-plugin/
│       ├── cad-viewer-example/        # 全功能查看器示例应用
│       ├── cad-simple-viewer-example/ # 轻量查看器示例应用
│       ├── cad-simple-viewer-cli/     # 无头 CLI 工具
│       └── examples/                  # 示例服务
├── cad/                        # 测试数据 (DWG/DXF)
├── cad-tools/                  # Python DXF 处理脚本
├── docs/                       # 项目文档（分类存放，见 docs/README.md）
└── bootstrap.mjs               # 一键初始化脚本
```

## 环境要求

- [Node.js](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/) >= 10

## 快速开始

```bash
node bootstrap.mjs          # 一键初始化 (安装依赖 + 全量构建)
cd cad-viewer
pnpm dev                    # 全功能查看器 (开发模式)
pnpm dev:simple             # 简单查看器 (开发模式)
pnpm build                  # 全量构建 (用于部署)
```

首次初始化较慢 (需安装依赖 + 全量构建), 后续重跑会自动跳过已完成步骤。
使用 `node bootstrap.mjs --fast` 可跳过最终验证构建, 更快进入开发。

## 构建与部署

```bash
cd cad-viewer
pnpm build                  # nx 拓扑排序, 自动按依赖顺序构建全部 16+ 包
```

构建完成后, 部署产物位于:

| 应用 | 产物路径 |
| --- | --- |
| 全功能查看器 | `packages/cad-viewer-example/dist/` |
| 简单查看器 | `packages/cad-simple-viewer-example/dist/` |
| CLI 工具 | `packages/cad-simple-viewer-cli/dist/` |

## 测试

```bash
cd cad-viewer
pnpm test                                                # 全量测试
pnpm --filter @mlightcad/cad-simple-viewer test          # 简单查看器单元测试
pnpm --filter @mlightcad/cad-viewer-example test:e2e     # E2E 测试
```

## 包依赖关系

```
common
  ↑
geometry-engine
  ↑
graphic-interface
  ↑
data-model
  ↑
cad-simple-viewer / three-renderer
  ↑
cad-viewer / cad-{svg,pdf,html,agent}-plugin
  ↑
cad-viewer-example / cad-simple-viewer-example / cad-simple-viewer-cli
```

nx 会根据此拓扑关系自动确定构建顺序, 无需手动管理。

## 文档

文档按主题分类存放在 `docs/` 下，索引见 [docs/README.md](./docs/README.md)。

- [docs/02-性能优化/性能优化总结.md](./docs/02-性能优化/性能优化总结.md): 根因分析、已实施优化 (M0–M2)、遗留工作 (M3+)
- [docs/02-性能优化/渲染与解析性能瓶颈分析.md](./docs/02-性能优化/渲染与解析性能瓶颈分析.md): 渲染 + 解析性能瓶颈分析 (UTF-8 DXF 焦点)
- [docs/02-性能优化/优化计划.md](./docs/02-性能优化/优化计划.md): 性能优化实施计划与里程碑复测记录
- [docs/01-架构设计/架构图.md](./docs/01-架构设计/架构图.md): 项目流程图与架构图 (Mermaid)
- [docs/01-架构设计/高性能技术分析.md](./docs/01-架构设计/高性能技术分析.md): WebAssembly / Web Worker / 内存管理技术分析
- [cad-viewer/README.md](./cad-viewer/README.md) (含多语言版本)

## 注意事项

1. 所有包已合并至 `cad-viewer/` 单一 monorepo, 一条 `pnpm build` 即可完成全部构建和部署打包。
2. 本机为软件渲染环境 (无真实 GPU), 渲染类优化需在真实 GPU 环境验证。

## License

MIT, `@mlightcad/libredwg-converter` 为 GPL-3.0

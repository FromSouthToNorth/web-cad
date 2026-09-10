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
│       ├── cad-layerctx-plugin/       # 图层右键上下文菜单插件
│       ├── cad-search-plugin/         # 图形/文字搜索插件
│       ├── cad-tunnel-plugin/         # 绘制巷道插件（GeoJSON → 巷道/立井/煤仓）
│       ├── cad-viewer-example/        # 全功能查看器示例应用
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
pnpm build                  # 全量构建 (用于部署)
```

首次初始化较慢 (需安装依赖 + 全量构建), 后续重跑会自动跳过已完成步骤。
使用 `node bootstrap.mjs --fast` 可跳过最终验证构建, 更快进入开发。

## 构建与部署

```bash
cd cad-viewer
pnpm build                  # nx 拓扑排序, 自动按依赖顺序构建全部 19 个包
```

构建完成后, 部署产物位于:

| 应用 | 产物路径 |
| --- | --- |
| 全功能查看器 | `packages/cad-viewer-example/dist/` |
| CLI 工具 | `packages/cad-simple-viewer-cli/dist/` |
| 解析核心 | `packages/data-model/lib/` + `packages/data-model/dist/dxf-parser-worker.js` |

> `data-model` 的 `dist/dxf-parser-worker.js` 由 `cad-viewer/tools/copy-workers.mjs` 复制到各应用产物中。
> 改动 `data-model` 后若不重新构建并 **硬刷新浏览器**, 主线程与 worker 可能加载到不同版本的协议
> (浏览器会缓存 worker 脚本), 表现为打开图纸时进度停滞。

## 测试

```bash
cd cad-viewer
pnpm test                                     # 全量单元测试 (Jest)
pnpm test -- packages/data-model              # 按路径过滤到单个包
pnpm test -- packages/data-model/__tests__/AcDbDxfPairWireChunked.spec.ts   # 单个 spec
pnpm test:e2e                                 # E2E (Playwright)
pnpm --filter @hy/cad-viewer-example test:e2e:headed   # 有头 E2E
pnpm --filter @hy/cad-viewer-example test:e2e:ui       # Playwright UI 模式
```

> 单元测试统一由根目录 Jest 驱动, 各 package 没有独立的 `test` 脚本,
> 因此请使用 `pnpm test -- <路径>` 而不是 `pnpm --filter <包名> test`。
> 位于 `cad-viewer/packages/*/__tests__/` 的 `*.bench.spec.ts` 是带基准输出的 spec, 会随全量测试一起执行。

## 性能现状 (实测)

以 `cad/千树塔井上下对照图（2025.04）.dxf`(112 MB / 630 万 group pair / 43.4 万实体的 UTF-8 DXF,
本地测试数据、不入库)为基准, 经 P0 + P1 两轮优化后的实测结果。
下表中「解析」一列为 Node 24 主线程口径(未启用 worker、不含渲染):

| 指标 | 优化前 | 优化后 |
| --- | --- | --- |
| `db.read` best | 2709 ms | 1588 ~ 1753 ms (同口径多次运行的区间, **−35% ~ −41%**) |
| 每实体耗时 | 6.24 µs | 3.78 µs |
| 单次运行峰值 `heapUsed` | 654.8 MB | **352.5 MB (−46%)** |
| 单次运行峰值 RSS | 926.4 MB | 625.0 MB |
| 纯词法层 (630 万 pair) | 867 ms | 510 ms |
| 模型空间实体数 | 434,083 | 434,083 (不变) |

主要收益来源: 词法层 double 快路径判据修正(坐标回退率 82.7% → 3.0%)、属性包未观察写入的裸写路径、
逐实体框架容器与几何法向量惰性化、批级剔除去掉逐槽 `Box3`、wire 分块回传、渐进 fit 改 O(1) 增量并集。

复现方式:

```bash
cd cad-viewer
node --expose-gc tools/bench/bench-parse.cjs \
  "../cad/千树塔井上下对照图（2025.04）.dxf" --repeat 3 --gc
```

> **口径与边界**: 上表为 Node 主线程解析口径, 不等于浏览器端到端耗时。渲染侧收益
> (逐槽 `Box3` 内存、渐进 fit、SOLID 三角化、直批占位)只统计了 CPU/内存部分;
> 真实 GPU 的绘制/填充率收益, 以及浏览器帧时序(long task / 帧间隔)在本机(软件渲染、无真实 GPU)
> **无法验证**, 详见 P1 实测报告的「未完成项」与「必须真机验证的遗留问题」。
> 分块 wire 协议可用 `acdbDxfWireChunking.enabled = false` 在运行时回退为整块协议。

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
cad-viewer-example / cad-simple-viewer-cli
```

nx 会根据此拓扑关系自动确定构建顺序, 无需手动管理。

## 文档

文档按主题分类存放在 `docs/` 下，索引见 [docs/README.md](./docs/README.md)。

性能优化主线(按时间倒序, 后三者为本轮 P0/P1 施工的完整记录):

- [docs/02-性能优化/千树塔DXF P1修复实测报告.md](<./docs/02-性能优化/千树塔DXF P1修复实测报告.md>): P1 五个波次的实测前后对比、对原报告的 11 处修正、未完成项与真机验证清单
- [docs/02-性能优化/千树塔DXF P0修复实测报告.md](<./docs/02-性能优化/千树塔DXF P0修复实测报告.md>): P0 13 项的逐项实测结果与放弃项
- [docs/02-性能优化/千树塔DXF加载性能瓶颈分析（Agent Teams）.md](<./docs/02-性能优化/千树塔DXF加载性能瓶颈分析（Agent Teams）.md>): 11 个模块审计 + 9 个对抗性验证, P0/P1/P2 分级与证伪清单
- [docs/02-性能优化/性能优化总结.md](./docs/02-性能优化/性能优化总结.md): 根因分析、M0–M2 已实施优化、M3+ 遗留工作
- [docs/02-性能优化/渲染与解析性能瓶颈分析.md](./docs/02-性能优化/渲染与解析性能瓶颈分析.md): 渲染 + 解析性能瓶颈分析 (UTF-8 DXF 焦点)
- [docs/02-性能优化/优化计划.md](./docs/02-性能优化/优化计划.md): 性能优化实施计划与里程碑复测记录

其他:

- [docs/01-架构设计/架构图.md](./docs/01-架构设计/架构图.md): 项目流程图与架构图 (Mermaid)
- [docs/01-架构设计/高性能技术分析.md](./docs/01-架构设计/高性能技术分析.md): WebAssembly / Web Worker / 内存管理技术分析
- [docs/01-架构设计/data-model解析器类结构详解.md](./docs/01-架构设计/data-model解析器类结构详解.md): DXF 解析链路类结构
- [docs/03-缺陷修复与功能改造/](./docs/03-缺陷修复与功能改造/): 热路径修复记录 (改动解析/渲染热路径前建议先查阅, 避免回归已修复路径)
- [cad-viewer/README.md](./cad-viewer/README.md) (含多语言版本)

## 注意事项

1. 所有包已合并至 `cad-viewer/` 单一 monorepo, 一条 `pnpm build` 即可完成全部构建和部署打包。
2. 本机为软件渲染环境 (无真实 GPU), 渲染类优化需在真实 GPU 环境验证;
   浏览器帧时序 (long task / 帧间隔) 与输入延迟同样无法在本机取得可信数据。
3. 改动 `data-model` 后请重新 `pnpm build` 并 **硬刷新浏览器**: 主线程 bundle 与
   `dxf-parser-worker.js` 属于两份独立产物, 浏览器会缓存 worker 脚本, 版本不一致会导致打开图纸卡住。
   排查时可先确认 Network 中 worker 文件为最新, 或用 `acdbDxfWireChunking.enabled = false` 回退分块协议。
4. 大图纸性能改动前, 请先阅读 `docs/02-性能优化/` 与 `docs/03-缺陷修复与功能改造/`;
   两轮优化中已有多条「看似合理但实测无效或有害」的方案被否决, 报告中均有记录。
5. `pnpm lint` 目前在仓库中即存在既有失败 (多为 `simple-import-sort` 与 `vue-i18n` 规则,
   集中在 P1 未触及的文件), 属改动前状态; 新增或修改代码时请只保证自己涉及的文件 lint 干净。

## License

MIT(本工作区已移除 GPL-3.0 的 `@mlightcad/libredwg-converter` 依赖,仅保留 MIT 的 DXF 解析链路)

# CLAUDE.md

本文件为 Claude Code 在本仓库工作时提供指引。

## 项目概览

CAD 大图纸性能优化工作区（`bw-cad-view`），基于 mlightcad/cad-viewer 的单一 monorepo。
包含纯浏览器端 DWG/DXF 查看器、编辑器，以及底层 DWG/DXF 解析核心（仿 ObjectARX API 设计）。
主要优化目标：大图纸（煤矿采掘工程平面图，如 95MB / 38 万实体 DXF）的加载与渲染性能。

## 常用命令

所有命令都在 `cad-viewer/` 目录下执行；仓库根目录没有 `package.json`，不要在此执行 pnpm 命令（根目录 `bootstrap.mjs` 除外）。

### 初始化

```bash
node bootstrap.mjs            # 根目录一键初始化（安装依赖 + 全量构建 + 验证）
node bootstrap.mjs --fast     # 跳过最终验证构建
node bootstrap.mjs --force    # 强制重跑所有步骤
```

### 开发与构建

```bash
cd cad-viewer
pnpm install                  # 安装依赖
pnpm dev                      # 启动全功能查看器（cad-viewer-example）开发服务器
pnpm build                    # nx 拓扑排序，按依赖顺序构建全部包
pnpm preview                  # 预览构建产物
pnpm serve                    # 启动 examples 服务
pnpm pre-serve                # 预构建 examples 服务
pnpm docs:build               # TypeDoc 生成 API 文档
pnpm clean                    # 清理全部构建产物
pnpm copy:workers             # 复制各包的 worker 产物
```

### CLI

```bash
cd cad-viewer
pnpm cli                      # 构建并运行无头 CLI（cad-simple-viewer-cli）
pnpm cli:run                  # 直接运行已构建的 CLI
pnpm cli:setup                # 安装 CLI 所需 Chromium（playwright install chromium）
pnpm export:html              # 用 CLI 将示例 DXF 导出为 HTML
```

### 测试

```bash
cd cad-viewer
pnpm test                                             # Jest 全量单元测试
pnpm test -- packages/cad-simple-viewer               # 只跑某个包的单元测试（按路径过滤）
pnpm test -- packages/data-model                      # 同上，data-model 包
pnpm test:e2e                                         # 全功能查看器 Playwright E2E
pnpm --filter @mlightcad/cad-viewer-example test:e2e:headed   # 有头 E2E
pnpm --filter @mlightcad/cad-viewer-example test:e2e:ui       # Playwright UI 模式
```

单元测试位于各包 `packages/<pkg>/__tests__/`（文件名 `*.spec.ts`），E2E 位于 `packages/cad-viewer-example/e2e/`。

### 代码质量

```bash
cd cad-viewer
pnpm lint                     # nx 全量 lint
pnpm lint:fix                 # nx 全量 lint 自动修复
pnpm format                   # prettier 格式化 packages/**/*.{ts,js,vue,json}
```

### 版本与发布

- 根 `package.json` 私有且版本固定 `1.0.0`；`packages/*` 采用 lockstep 发布（所有包最终统一到同一版本），不要只 bump 改动过的包。当前各包版本线并不一致（1.0.0 / 1.6.1 / 1.13.0 / 3.13.0）。
- 发布流程详见 `.cursor/skills/create-release/SKILL.md`：changeset 必须覆盖全部包并使用同一 bump 类型，然后 `pnpm changeset version`。
- `pnpm sync:versions:check` 校验各包依赖版本与 `pnpm-workspace.yaml` overrides 是否同步；`pnpm sync:versions` 自动修复。
- `pnpm release [X.Y.Z]` 创建并推送 tag（要求 `main` 分支且工作区干净），CI 在 tag 上通过 npm Trusted Publishing 发布，无需 NPM_TOKEN。

## 架构要点

- monorepo 位于 `cad-viewer/`：pnpm workspace + nx 20。`packages/*` 下有 19 个 workspace 包；`packages/vite-config/` 是共享构建配置目录（无 `package.json`，不算包）。
- 包依赖分层（自底向上）：
  `common` → `geometry-engine` → `graphic-interface` → `data-model` → `three-renderer` / `cad-simple-viewer` → `cad-viewer` / 各功能插件 → `cad-viewer-example` / `cad-simple-viewer-cli`。
  插件（svg / pdf / html / agent / simple-ui / invertsel / layerctx / search / tunnel）把 `cad-simple-viewer`、`data-model` 等声明为 peerDependencies，实例由宿主应用提供。
- 关键包：
  - `common`：基础工具、颜色管理、日志。
  - `geometry-engine` / `graphic-interface`：几何计算与图形接口抽象。
  - `data-model`：DWG/DXF 解析核心，仿 ObjectARX API；含 DXF tokenizer Web Worker。
  - `three-renderer`：Three.js 渲染。
  - `cad-simple-viewer`：轻量查看器核心。
  - `cad-viewer`：Vue 全功能查看器。
  - `cad-viewer-example`：全功能查看器示例应用。
  - `cad-simple-viewer-cli`：无头 CLI 工具。
  - `cad-tunnel-plugin`：绘制巷道（GeoJSON → 巷道/立井/煤仓），测试数据在根目录 `jsonData/tunnel.json`。
- `cad-tools/`：Python DXF 预处理脚本（`process_dxf.py` + `tools/` 下的分析/校验脚本），逻辑见 `docs/06-工具脚本/process_dxf处理逻辑分析.md`。
- worker 资产：`@mlightcad/data-model` 构建产出 `lib/index.js` 与 `dist/dxf-parser-worker.js`；应用侧通过 `cad-viewer/tools/copy-workers.mjs` 复制 worker，文件名常量集中在 `tools/worker-assets.mjs` 与 `packages/cad-simple-viewer/src/app/AcApWorkerAssets.ts`，重命名时需同步。

## 构建产物

| 应用 | 产物路径 |
| --- | --- |
| 全功能查看器 | `cad-viewer/packages/cad-viewer-example/dist/` |
| CLI 工具 | `cad-viewer/packages/cad-simple-viewer-cli/dist/` |
| data-model | `cad-viewer/packages/data-model/lib/` + `dist/dxf-parser-worker.js` |

- nx 构建带缓存（`.nx/`），`pnpm build` 按 `^build` 依赖顺序执行。
- `pnpm dev` 的 nx target 会先构建其依赖包，改动底层包后无需手动逐个构建。
- `bootstrap.mjs` 验证这三个文件：`data-model/lib/index.js`、`data-model/dist/dxf-parser-worker.js`、`cad-viewer-example/dist/index.html`；缺失时重新 `pnpm build`。

## 代码约定

- 格式以 Prettier 为准（`.prettierrc.js`）：无分号、单引号、80 列、无尾逗号、箭头函数单参数省略括号。
- ESLint flat config（`eslint.config.js`）：`simple-import-sort` 强制 import 排序；`no-unused-vars` 允许 `_` 前缀；vue-i18n 禁止动态 key 和未使用 key，新增 UI 文案需同步 locale 文件并保证 key 被静态引用。
- TypeScript 开启 `strict` + `noUnusedLocals` / `noUnusedParameters`（`tsconfig.base.json`）。
- 包内引用一律使用 `workspace:*`；插件对 viewer / data-model 使用 peerDependencies。新增或升级三方依赖需留意 `pnpm-workspace.yaml` 的 overrides（`three ^0.172.0`、`vue ^3.4.21`、`lodash-es` 固定 `4.17.21`）与 `.pnpmrc` 的 `strict-peer-dependencies=true`。
- 许可证为 MIT；本工作区已移除 GPL-3.0 的 `@mlightcad/libredwg-converter`，不要引入 GPL 依赖。商业专有 DWG parser（`@mlight-cad/dwg-converter`）不在仓库内，仅作为可选 worker 资产接入，见 `PROPRIETARY-PARSER.md`。

## 测试要点

- 单元测试：Jest 30 + ts-jest，根配置 `cad-viewer/jest.config.ts`；测试中 `three` 走 CJS 构建，部分 `three/examples/jsm` 模块（LineMaterial、LineSegments2、OrbitControls 等）映射到 `cad-viewer/test/mocks/three/` 下的 mock，`lodash-es` 映射为 CJS `lodash`。
- E2E：Playwright，目录 `cad-viewer/packages/cad-viewer-example/e2e/`；CI 通过 `PLAYWRIGHT_BROWSER_CHANNEL=chrome` 复用系统 Chrome。
- 改动底层包（data-model / geometry-engine / three-renderer 等）后，至少运行对应路径的 Jest 测试并通过 `pnpm build` 验证类型与产物。

## CI 与部署

- `cad-viewer/.github/workflows/ci.yml`：`main` push / PR / `v*` tag 触发 lint → build → test → e2e → docs:build → pre-serve；tag 额外触发 npm 发布（Trusted Publishing）。
- 根 `.github/workflows/deploy-pages.yml`：仅 push 到 `dev_hy` 分支时构建 `cad-viewer-example/dist` 并部署 GitHub Pages。
- `cad-viewer/.gitlab-ci.yml` 仍在使用 Node 20，落后于 `engines: node >=24`；以 GitHub Actions 与 `.nvmrc` 为准。

## 环境要求

- Node.js >= 24（`.nvmrc` 为 24，CI 使用 Node 24）
- pnpm >= 10（`packageManager` 为 pnpm@10.33.4）

## 文档

文档按主题分类在 `docs/`，索引见 `docs/README.md`：

- `docs/01-架构设计/`：架构图、高性能技术分析、data-model 与 cad-viewer 类结构详解
- `docs/02-性能优化/`：瓶颈分析、优化计划、性能优化总结（M0–M2 已完成，M3+ 遗留）、框选性能分析、圆弧 LOD 与渲染数据采集实施计划等
- `docs/03-缺陷修复与功能改造/`：bug 修复与功能改造总结（含大坐标平移、框选图层丢失、选择高亮、悬停交互、样条打散、巷道首次点击等）
- `docs/04-开发规范/`：功能插件开发标准
- `docs/05-使用手册/`：CAD 命令行命令、绘制巷道插件使用说明
- `docs/06-工具脚本/`：process_dxf.py 处理逻辑分析
- `docs/07-更新日志/`：按日期归档的修改记录

## 注意事项

1. 所有包已合并至 `cad-viewer/` 单一 monorepo，一条 `pnpm build` 完成全部构建。
2. 本机为软件渲染环境（无真实 GPU），渲染类优化需在真实 GPU 环境验证。
3. 大图纸性能优化相关代码改动前，先阅读 `docs/02-性能优化/`，并查阅 `docs/03-缺陷修复与功能改造/` 中的热路径修复，避免回归已修复路径。
4. `bootstrap.mjs` 是增量幂等的：已有 `node_modules` 或构建产物时会自动跳过对应步骤。
5. README.md 中项目结构提到的 `cad/` 测试数据目录当前不存在（被 `.gitignore` 排除，仅本地使用）；巷道插件测试数据在 `jsonData/`。
6. 新增功能插件前阅读 `docs/04-开发规范/功能插件开发标准.md`，遵循包骨架、加载策略与验证 Checklist。

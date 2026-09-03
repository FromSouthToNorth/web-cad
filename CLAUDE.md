# CLAUDE.md

本文件为 Claude Code 在本仓库工作时提供指引。

## 项目概览

CAD 大图纸性能优化工作区（`bw-cad-view`），基于 mlightcad/cad-viewer 的单一 monorepo。
包含纯浏览器端 DWG/DXF 查看器、编辑器，以及底层 DWG/DXF 解析核心（仿 ObjectARX API 设计）。
主要优化目标：大图纸（煤矿采掘工程平面图，如 95MB / 38 万实体 DXF）的加载与渲染性能。

## 常用命令

所有命令均在 `cad-viewer/` 目录下执行（根目录 `bootstrap.mjs` 除外）。

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
pnpm clean                    # 清理全部构建产物
```

### 测试

```bash
cd cad-viewer
pnpm test                                          # 全量 Jest 单元测试
pnpm --filter @mlightcad/cad-simple-viewer test    # 单包单元测试
pnpm test:e2e                                      # 全功能查看器 E2E 测试
```

### 代码质量

```bash
cd cad-viewer
pnpm lint                     # nx 全量 lint
pnpm lint:fix                 # nx 全量 lint 自动修复
pnpm format                   # prettier 格式化 packages/**/*.{ts,js,vue,json}
```

### 构建产物

| 应用 | 产物路径 |
| --- | --- |
| 全功能查看器 | `cad-viewer/packages/cad-viewer-example/dist/` |
| CLI 工具 | `cad-viewer/packages/cad-simple-viewer-cli/dist/` |

## 架构要点

- monorepo 位于 `cad-viewer/`：pnpm workspace + nx 20，`packages/*` 全部包。
- 包依赖拓扑（自底向上）：
  `common` → `geometry-engine` → `graphic-interface` → `data-model` → `cad-simple-viewer` / `three-renderer` → `cad-viewer` / 插件包 → `cad-viewer-example` / `cad-simple-viewer-cli`。
- 关键包：
  - `data-model`：DWG/DXF 解析核心，仿 ObjectARX API。
  - `cad-simple-viewer`：轻量查看器核心。
  - `cad-viewer`：Vue 全功能查看器。
  - `cad-viewer-example`：全功能查看器示例应用。
  - `cad-simple-viewer-cli`：无头 CLI 工具。
  - 插件：`cad-svg-plugin`、`cad-pdf-plugin`、`cad-html-plugin`、`cad-agent-plugin`、`cad-simple-ui-plugin`、`cad-invertsel-plugin`、`cad-layerctx-plugin`、`cad-search-plugin`。
- `cad-tools/`：Python DXF 预处理脚本（`process_dxf.py`），逻辑见 `docs/06-工具脚本/process_dxf处理逻辑分析.md`。

## 环境要求

- Node.js >= 24（`cad-viewer/package.json` engines 声明）
- pnpm >= 10（packageManager 为 pnpm@10.33.4）

## 文档

文档按主题分类在 `docs/`，索引见 `docs/README.md`：

- `docs/01-架构设计/`：架构图、高性能技术分析
- `docs/02-性能优化/`：瓶颈分析、优化计划、优化总结（M0–M2 已完成，M3+ 遗留）
- `docs/03-缺陷修复与功能改造/`：bug 修复与改造总结
- `docs/04-开发规范/`：功能插件开发标准
- `docs/05-使用手册/`：CAD 命令行命令说明
- `docs/06-工具脚本/`：预处理脚本逻辑分析

## 注意事项

1. 所有包已合并至 `cad-viewer/` 单一 monorepo，一条 `pnpm build` 完成全部构建。
2. 本机为软件渲染环境（无真实 GPU），渲染类优化需在真实 GPU 环境验证。
3. 本工作区已移除 GPL-3.0 的 `@mlightcad/libredwg-converter` 依赖，仅保留 MIT 的 DXF 解析链路。
4. `bootstrap.mjs` 是增量幂等的：已有 `node_modules` 或构建产物时会自动跳过对应步骤。
5. 大图纸性能优化相关代码改动前，先阅读 `docs/02-性能优化/` 下文档，避免回归已修复热路径。

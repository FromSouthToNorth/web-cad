# cad-data（本地资源镜像）

本目录是 [mlightcad/cad-data](https://github.com/mlightcad/cad-data) 的**本地镜像**，用于替代运行时从
jsDelivr CDN 拉取 CAD 字体 / 模板 / 样例图纸。目录结构：

```
packages/cad-data/
├── fonts/            # AutoCAD 字体二进制 + fonts.json（字体目录）
│   ├── fonts.json    # 字体名 → 字体文件映射，<baseUrl>fonts.json
│   ├── hztxt.shx     # modern 预设：中文主字体（gbk）
│   ├── simsun.woff   # modern 预设：simsun / 宋体 回退
│   ├── simplex.shx   # modern 预设：符号字体
│   └── amgdt.shx     # modern 预设：符号字体
├── data/             # 样例图纸（CLI examples gallery 默认夹具）
└── templates/        # DXF 模板（--all 才有；运行时已不再下载，见下）
```

## 为什么资源本体不入库

上游仓库**没有 LICENSE 文件**，README 明确写着
"It is your own responsibility to buy license of those data."，其中包含 Autodesk SHX、
微软/中易 CJK 字体等第三方专有二进制。把 55MB 这类字体提交进本 MIT 仓库等于再分发，
存在法律风险。

因此：**目录结构入库，资源本体不入库**（见 `cad-viewer/.gitignore`）。每台机器
自行同步一份，离线/内网环境只需同步一次。

## 同步

```bash
cd cad-viewer

pnpm sync:cad-data          # 必需子集 ≈9.4MB（默认，够 viewer 完整离线显示中文）
pnpm sync:cad-data:all      # 全量镜像 ≈55MB（fonts/ + templates/ + data/）
pnpm sync:cad-data:check    # 只检查本地是否齐全，不下载（缺文件时退出码 1）
pnpm sync:cad-data -- --list   # 只打印文件清单
pnpm sync:cad-data -- --force  # 强制重下
```

必需子集 = viewer 默认 `modern` 字体预设（`hztxt` + `simsun` + 符号字体
`simplex`/`amgdt`）、中文图纸常用的楷体 `simkai`（`SimKai`/`楷体`，
否则会退化为宋体并弹「找不到字体」）+ CLI gallery 用的一张样例 DXF。同步脚本会把 `fonts.json`
裁剪成"只包含已同步文件"，这样未同步的字体名会走本地 404（廉价、无网络），
而不是白跑一次 CDN 请求。

`--all` 模式保留上游 `fonts.json` 原文。使用 `--all` 时建议设置 `GITHUB_TOKEN`
以规避 GitHub API 匿名限流：

```bash
GITHUB_TOKEN=ghp_xxx pnpm sync:cad-data:all
```

## 运行时如何引用

查看器把 `baseUrl` 当作**资源仓库根目录**，并拼出 `<baseUrl>/fonts/`，
再请求 `<baseUrl>/fonts/fonts.json` 与 `<baseUrl>/fonts/<file>`：

| 消费方 | 本地基址 | 资源如何就位 |
| --- | --- | --- |
| `@hy/cad-viewer-example`（dev / 构建 / GitHub Pages） | `new URL('./cad-data/', document.baseURI)`，经 `resolveCadDataBaseUrl()` 自动回退 CDN | `viteStaticCopy` 把本目录 `fonts/` 复制到 `dist/cad-data/fonts/` |
| `@hy/cad-simple-viewer-cli` | `new URL('./cad-data/', location.href)` | `scripts/copy-runner-assets.mjs` 复制到 `dist-runner/cad-data/fonts/` |
| bench 页面 | 同上 | 由 example 的静态复制目标提供 |
| 其他宿主应用 | 自行传入 `baseUrl` | 参考 `AcApCadDataAssets.ts` 的 `resolveCadDataBaseUrl()` |

策略是**本地优先、CDN 回退**：宿主先探测本地
`<localBase>fonts/fonts.json` 是否存在，存在就用本地（完全离线），不存在才回落到
`https://cdn.jsdelivr.net/gh/mlightcad/cad-data`（行为与迁移前一致，不会因为没同步
资源而白屏）。

> ⚠️ `baseUrl` 必须是**绝对 URL**。MText 渲染 worker 是 module worker，worker 内相对
> URL 会以 worker 脚本地址（`dist/assets/…`）而不是页面地址为基准解析。
> `AcApDocManager.resolveFontsBaseUrl()` 会把传入值规范化为绝对 URL，宿主无需自行处理。

## 已不再使用的上游内容

- `templates/acadiso.dxf`：新建图纸改用内嵌的最小 ASCII DXF
  （`packages/cad-simple-viewer/src/app/defaultNewDrawingTemplate.ts`），不再下载模板。
  `templates/` 仅在 `--all` 模式同步，运行时无引用。
- `data/canteen.dwg`：CLI gallery 原默认夹具是 `.dwg`，而 CLI 只接受 `.dxf`，本来就
  不可用；已改为本地 `data/block-color.dxf`。

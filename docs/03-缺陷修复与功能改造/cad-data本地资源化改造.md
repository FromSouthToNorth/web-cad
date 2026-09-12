# cad-data 本地资源化改造（去 CDN 运行时依赖）

> 目标：把对 [mlightcad/cad-data](https://github.com/mlightcad/cad-data) 的**运行时依赖**
> 从 jsDelivr CDN 改为 `cad-viewer/packages/` 下的**本地引用**，同时消除离线/内网环境
> 中文不可见的问题。

## 一、背景

查看器把 `baseUrl` 当作**资源仓库根目录**，据此拼出 `<baseUrl>/fonts/`，再请求
`<baseUrl>/fonts/fonts.json` 与 `<baseUrl>/fonts/<file>`。改造前，所有入口都指向
`https://cdn.jsdelivr.net/gh/mlightcad/cad-data`：

| 位置 | 现象 |
| --- | --- |
| `packages/cad-simple-viewer/src/app/AcApDocManager.ts` | `DEFAULT_BASE_URL` 为 CDN；`baseUrl` 未导出，宿主无法复用，只能各自复制字面量（全仓 ~9 处） |
| `packages/cad-viewer-example/src/App.vue` | 显式传入 CDN URL（**并非**走默认值，此前审计文档描述有误） |
| `packages/cad-simple-viewer-cli/runner/main.ts` | 硬编码 CDN |
| `packages/examples/exportDemoHtml.js` | 构建期从 CDN 下载 `canteen.dwg`，无回退，失败会阻断 Pages 部署 |
| CLI gallery / `examples/index.json` | 默认夹具指向 CDN 的 `canteen.dwg` |

离线时 `@mlightcad/mtext-renderer` 的 `DefaultFontLoader.getAvailableFonts()` 会在
`fetch(fonts.json)` 失败时**直接抛错**，而 IndexedDB 回退在 `await getAvailableFonts()`
之后，永远不可达；异常又被 `requestFont` 的 `.catch` 吞掉 → worker 字体表为空 →
整段中文只剩占位空白、且无任何告警。

## 二、上游仓库分析结论

`mlightcad/cad-data` 是**纯静态资源仓库**（无源码、无构建）：

| 目录 | 文件数 | 体积 |
| --- | --- | --- |
| `fonts/` | 99（97 条 `fonts.json` 条目 + `fonts.json` + 未被引用的 `simsun.ttf` 10.5MB） | 48.52 MB |
| `data/` | 7（dwg/dxf 样例） | 6.72 MB |
| `templates/` | 2（`acad.dxf`、`acadiso.dxf`） | 0.21 MB |
| 合计 | 111 | **约 55 MB** |

结论要点：

1. **上游没有 LICENSE 文件**（`api.github.com/.../license` 与 `raw/.../LICENSE` 均 404），
   README 全文仅一句：*"This repository contains data commonly used by CAD software.
   It is your own responsibility to buy license of those data."*
   内容为 Autodesk SHX、微软/中易 CJK 字体等**第三方专有二进制**。
   直接提交进本 MIT 仓库属于再分发，故资源本体**不入库**。
2. `templates/` **已无运行时引用**：新建图纸改用内嵌最小 ASCII DXF
   （`defaultNewDrawingTemplate.ts`）。
3. `data/` 只有 `canteen.dwg`（CI 构建脚本）与 CLI 夹具在用，且都是 `data/` 而非字体。
4. 默认 `modern` 字体预设实际需要 **4 个字体文件**：
   `simsun` + `hztxt`（`DEFAULT_FONTS_PRESETS.modern`）与符号字体
   `simplex` + `amgdt`（`SYMBOL_FONTS_PRESETS.modern`），加 `fonts.json` 共 ≈ **7.6 MB**。
5. （2026-09-12 补充）中文图纸的文字样式普遍写 Windows 专有 CJK 字体名，
   `SimKai`/`楷体` 是 AutoCAD 中国模板 Standard 样式的默认值；该字体上游存在
   （`simkai.woff`，1.57 MB），此前未纳入必需子集，导致打开这类图纸必然退化为
   宋体并弹「找不到字体」。现加入必需子集，共计 **5 个字体文件 ≈ 9.4 MB**。

## 三、方案

**本地镜像目录 + 按需同步 + 本地优先/CDN 回退。**

```
cad-viewer/packages/cad-data/          # 目录结构入库，资源本体被 .gitignore 排除
├── README.md                          # 唯一被 git 跟踪的文件
├── fonts/     # fonts.json + hztxt.shx / simsun.woff / simkai.woff / simplex.shx / amgdt.shx
├── data/      # block-color.dxf（CLI gallery 夹具）
└── templates/ # 仅 --all 模式同步，运行时无引用
```

- `pnpm sync:cad-data` 下载**必需子集**（≈9.4MB）并生成**裁剪版 `fonts.json`**
  （只保留已同步条目）：未同步的字体名走本地 404（廉价、无网络），而不是白跑一次
  CDN 请求后 `FailedToLoad`。
- `pnpm sync:cad-data:all` 全量镜像（≈55MB，`GITHUB_TOKEN` 可提升 API 限额）；
  `--check` 只校验、`--list` 只列清单、`--force` 强制重下。
- 下载脚本双源（jsDelivr → raw.githubusercontent）+ 每源 3 次重试。

### 运行时引用方式

新增 `packages/cad-simple-viewer/src/app/AcApCadDataAssets.ts`，作为**唯一常量与解析入口**
（与 `AcApWorkerAssets.ts` / `tools/worker-assets.mjs` 同一约定）：

| 导出 | 作用 |
| --- | --- |
| `CAD_DATA_CDN_BASE_URL` | CDN 回退地址（也是 `AcApDocManager` 无 `baseUrl` 时的默认值） |
| `resolveLocalCadDataBaseUrl(appBaseUrl)` | 由宿主 base 推导本地镜像绝对 URL |
| `isLocalCadDataAvailable(baseUrl)` | 探测 `<base>/fonts/fonts.json`（带超时，失败即视为缺失） |
| `resolveCadDataBaseUrl(options)` | **本地优先 + CDN 回退**，结果按 `<local>\|<fallback>` 缓存一次 |

各消费方：

| 消费方 | 本地基址 | 资源就位方式 |
| --- | --- | --- |
| `@hy/cad-viewer-example`（dev / build / GitHub Pages） | `resolveCadDataBaseUrl({ appBaseUrl: import.meta.env.BASE_URL })` | `vite-plugin-static-copy` 把 `packages/cad-data/fonts/**` 复制到 `dist/cad-data/fonts/` |
| `@hy/cad-simple-viewer-cli` | `resolveCadDataBaseUrl({ appBaseUrl: './' })` | `scripts/copy-runner-assets.mjs` 复制到 `dist-runner/cad-data/fonts/` |
| bench 页面 | 同上 | 由 example 的静态复制目标提供 |
| 第三方宿主 | 自行传 `baseUrl` | 未传时仍为 CDN（保持向后兼容，非破坏性） |

### ⚠️ 关键陷阱：`baseUrl` 必须是绝对 URL

MTEXT 字形排布跑在 **module Web Worker** 中（`new Worker('./assets/mtext-renderer-worker.js', {type:'module'})`）。
worker 内的相对 URL 以 **worker 脚本地址**为基准，`'./cad-data/'` 会被解析成
`dist/assets/cad-data/…`。因此 `AcApDocManager.resolveFontsBaseUrl()` 现在会把
`baseUrl + 'fonts/'` 用 `new URL(..., document.baseURI)` 规范化成**绝对 URL**，
宿主可安全传入 `'./cad-data/'`；绝对输入原样返回（既有单测仍然通过）。

## 四、改动清单

### 新增

- `cad-viewer/tools/cad-data-assets.mjs` — 资源名/清单常量（构建侧）
- `cad-viewer/tools/sync-cad-data.mjs` — 同步脚本（必需子集 / 全量 / 校验 / 列表）
- `cad-viewer/packages/cad-data/README.md` — 目录说明、同步方式、许可证风险说明
- `cad-viewer/packages/cad-simple-viewer/src/app/AcApCadDataAssets.ts` — 运行时常量与解析
- `cad-viewer/packages/cad-simple-viewer/__tests__/AcApCadDataAssets.spec.ts` — 9 条单测

### 修改

- `AcApDocManager.ts` — 默认值改为引用 `CAD_DATA_CDN_BASE_URL`；`resolveFontsBaseUrl()`
  输出绝对 URL；补 `baseUrl` 选项文档
- `app/index.ts` — 导出 `AcApCadDataAssets`
- `packages/cad-viewer-example/` — `vite.config.ts` 增加静态复制目标（镜像缺失时跳过并告警）；
  `App.vue` 改为 `cadDataBaseUrl` ref（先 CDN、探测成功后切本地），hztxt 从该 base 拉取；
  `bench/progressive{,-trace}.ts` 显式传入本地 base
- `packages/cad-simple-viewer-cli/` — `scripts/copy-runner-assets.mjs` 复制本地字体到
  `dist-runner/`；`runner/main.ts` 用 `resolveCadDataBaseUrl`；`runHeadless.ts` 补
  `.shx/.woff/.woff2/.ttf` MIME；`examples/index.json` 与 gallery 改用本地
  `../cad-data/data/block-color.dxf`
- `packages/examples/exportDemoHtml.js` — 改用本地镜像的 `block-color.dxf`（顺带修掉
  「CLI 只接受 .dxf，却传 `canteen.dwg`」的既有 bug），仅镜像缺失时才回退 CDN
- `packages/examples/public/index.html` — 离线示例按钮改指向 `block-color.html`，并说明
  内存对比数据仍来自上游 `canteen.dwg`
- `.gitignore` — 排除 `packages/cad-data/{fonts,templates,data}/`
- `package.json` — 新增 `sync:cad-data` / `:all` / `:check`
- `bootstrap.mjs` — 新增同步步骤（**离线失败只告警不阻塞**），验证产物时本地资源缺失亦仅告警
- `.github/workflows/ci.yml`、`.github/workflows/deploy-pages.yml` — `pnpm install` 后同步本地资源
- `packages/cad-viewer-example/public/fonts/hztxt.shx` — **删除**（已跟踪的 1.12MB 重复副本，
  与上游差 4 字节）；hztxt 统一由镜像提供

### 文档

- `packages/cad-viewer-example/README.md`、`packages/data-model/README.md`、
  `packages/examples/README.md`、`packages/cad-simple-viewer-cli/README.md`
- `CLAUDE.md`

## 五、验证方式

```bash
cd cad-viewer
pnpm sync:cad-data                      # 或 node tools/sync-cad-data.mjs
pnpm sync:cad-data:check                # 6/6 files present
node --test 不需要；直接：
npx jest packages/cad-simple-viewer/__tests__/AcApCadDataAssets.spec.ts
npx jest packages/cad-simple-viewer/__tests__/AcApDocManagerFontUrl.spec.ts
pnpm build                              # 产物应含 dist/cad-data/fonts/{fonts.json,hztxt.shx,...}
pnpm dev                                # 浏览器 Network 面板应命中 /cad-data/fonts/fonts.json
```

手工核验要点：

1. `packages/cad-viewer-example/dist/cad-data/fonts/` 与
   `packages/cad-simple-viewer-cli/dist-runner/cad-data/fonts/` 均存在；
2. 断网（DevTools Offline）后打开一张中文图纸，文字仍可见；
3. 删除 `packages/cad-data/fonts/` 后重跑 dev：控制台出现回退告警，功能与改造前一致。

## 六、例外与遗留

- `packages/examples/public/cdn-bootstrap/cad-viewer.html` 仍用 CDN —— 该页面本身就是
  「纯 CDN 引导」演示（所有依赖都从 jsDelivr 拉取），已就地注释说明属**有意例外**。
- 各级 `README*.md` 中指向 `canteen.dwg` 的**文档超链接**保留（历史性能对比数据的出处），
  它们不是运行时依赖。
- 上游 vendored 的 `packages/mtext-renderer/src/font/defaultFontLoader.ts` 仍内置 CDN 默认值；
  该默认值在查看器路径上总是被 `AcApDocManager` 覆盖，属死代码，为减少与上游分叉未改动。
- 审计文档 `docs/03-缺陷修复与功能改造/text-audit/`（`A4-verify.json:22`、
  `context-pack.md:212-213`）中「示例应用未传 baseUrl」与旧行号（140/463/1185-1190）
  与现状不符，本次未改写历史审计产物，以本文档为准。
- 既有 bug 顺带修复：`examples/index.json` 的默认夹具原为 `.dwg`，而 CLI 与
  `assertIsFile` 只接受 `.dxf`，该默认值此前根本无法使用；`exportDemoHtml.js` 同样
  下载 `.dwg` 后交给只支持 `.dxf` 的 CLI（本仓库已移除 GPL 的 libredwg 转换器）。
- （2026-09-12 补充）**新增字体时 `fonts.json` 不刷新**：`syncEssential()` 里写裁剪版
  catalog 的条件是 `forceMode || !existsSync(catalogPath)`，而 catalog 是**由清单派生**
  的产物。于是一台已经同步过的机器再新增必需字体会出现「二进制下好了、名字查不到」：
  文件在盘上，`fonts.json` 里没有该条目，运行时仍走替代链并弹「找不到字体」。
  更糟的是 `--check` 只数文件是否存在，此时照样报 `✅ 7/7`（假绿）。
  现改为**每次同步都重建 catalog**，且 `--check` 额外校验 catalog 是否收录全部必需
  字体（不足则计入失败并打印缺失名单），负控验证：删掉 catalog 后 `--check` 退出码 1。

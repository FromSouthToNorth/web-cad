# 上游 Wiki（mlightcad/cad-viewer）分析与对照

> 分析对象：<https://github.com/mlightcad/cad-viewer/wiki>
> 快照方式：`git clone --depth 1 https://github.com/mlightcad/cad-viewer.wiki.git`
> Wiki 最后提交：`de00664` 2026-09-05 09:38（*feat: add wiki page on supporting Tianzheng DWG drawings*）
> 本工作区参考点：`cad-viewer/` HEAD `1ef785d` 2026-09-11
> 规模：22 个 Markdown 页面 + 1 张插图（`images/font_cache.jpg`），约 147 KB

---

## 一、结论速览

1. Wiki 是**面向"集成者与扩展者"的设计文档**，不是 API 参考（API 参考指向 TypeDoc：`mlightcad.github.io/cad-viewer/docs/`、`mlightcad.github.io/realdwg-web/`）。
2. 内容重心是 **ObjectARX 语义的 Web 复刻**：命令 / Jig / 系统变量 / OSNAP / 事务与 undo / 颜色，几乎每页都显式对照 AutoCAD 概念，便于有 ObjectARX 背景的人迁移。
3. 对本工作区而言，**约 60% 页面可直接复用**（命令、Jig、输入、事务与 undo、插件、系统变量、i18n、颜色、OSNAP、Worker URL、集成 props），**约 40% 需要改写或已作废**（包名 scope、LibreDWG、mtext-renderer 来源、多仓库调试、默认 CDN baseUrl、标注命令基类）。
4. Wiki **完全没有覆盖**本工作区的核心命题——大图纸性能优化（95MB / 38 万实体 DXF），也没有覆盖 worker 资产流转、cad-data 本地镜像、构建产物与发布流程。这部分只能依赖 `docs/02-性能优化/` 与本仓库自有文档。
5. Wiki 自身存在若干一致性问题（空链接、拼写错误、过期 Roadmap、示例签名前后不一致），**不能当作可信的 API 契约使用**，需以代码为准。

---

## 二、页面清单与适用度

| 页面 | 主题 | 对本工作区适用度 |
| --- | --- | --- |
| `Home.md` | Wiki 导航 + 5 篇 Medium 渲染技术文章外链 | 参考（外链有独立价值） |
| `Development-Guide.md` | 开发指南目录（含 1 个空链接） | 索引 |
| `CAD-Viewer-Basics.md` | `cad-viewer` vs `cad-simple-viewer` 选型 | ✅ 适用（结论未变） |
| `Architecture-Overview.md` | 分层架构、渲染引擎三大挑战 | ⚠️ 部分过时（LibreDWG / mtext 外链） |
| `Integrate-Simple-CAD-Viewer.md` | 无 UI 内核的导出清单与用法 | ⚠️ 包名需替换，导出清单偏旧 |
| `Integrate-CAD-Viewer-Component.md` | `MlCadViewer` props / events / 全局开关 | ✅ 适用（props 名未变） |
| `Configure-Worker-URLs.md` | Worker URL 相对基准、`import.meta.url` 陷阱 | ✅ 完全适用（重要坑） |
| `Self-Hosted-Fonts-and-Templates.md` | `baseUrl` 目录结构、`fonts.json`、CORS、Nginx | ✅ 适用，但默认值已改（本仓本地优先） |
| `Debugging-with-Multiple-Repo-Changes.md` | 跨仓库 `file:` overrides 调试法 | ❌ 已作废（本仓已合并为单 monorepo） |
| `Plugin-System.md` | `AcApPlugin` / 懒加载 / 4 种注册路径 / 排错表 | ✅ 适用（本仓实现一致，插件更多） |
| `Command.md` | 命令生命周期、状态机、别名、`AcEdOpenMode` | ✅ 适用（最高价值页） |
| `Entity-Modification-Best-Practices.md` | 事务 / undo mark / 事件同步 / 常见错误表 | ✅ 适用（最高价值页） |
| `Jig-System.md` | `prompt.jig` 一体化预览，对照 `AcEdJig` | ✅ 适用 |
| `User-Input.md` | `AcEditor` 9 个输入 API、关键字规则、结果类型 | ✅ 适用 |
| `System-Variables.md` | 双注册表设计、命令行化、新增变量 4 步 | ✅ 适用 |
| `Object-Snap.md` | `subGetOsnapPoints`、`gsMark`、INSERT 弱点 | ✅ 适用（含已知缺陷清单） |
| `Color-System.md` | ACI / TrueColor / ByLayer / ByBlock / ACI 7 自适应 | ✅ 适用 |
| `Annotation-Commands.md` | `AcApBaseRevCmd` 基类 + 标注图层 + 系统变量样式 | ❌ 类不存在于本仓，架构已被替代 |
| `Localization.md` | `AcApI18n` 无关注册表 + vue-i18n 合并 | ✅ 适用 |
| `FAQ.md` | 格式支持、字体排错、依赖版本锁定 | ⚠️ 依赖/解析器部分过时 |
| `Roadmap.md` | 里程碑与时间线 | ⚠️ 时间线已过期 |
| `Supporting-Tianzheng-DWG-Drawings.md` | 天正自定义实体 → T3 转换预处理 | ✅ 适用（业务相关，含工具参考） |

---

## 三、Wiki 的技术主张提炼

### 3.1 定位与分层

纯浏览器端、零后端、文件不出设备、可离线。分层（自底向上）：

```
data-model（模型：实体/图层/视图参数 + AcDbDatabaseConverter 抽象）
  ↑
graphic-interface（渲染接口抽象）
  ↑
three-renderer / svg-renderer（Two.js / SVG 双实现）
  ↑
cad-simple-viewer（框架无关：文档管理、命令栈、编辑器、场景，只提供 canvas）
  ↑
cad-viewer（Vue 3 UI：菜单/工具栏/命令行/状态栏/对话框/主题/i18n）
```

关键设计动机（Wiki 自述）：市面 DXG/DWG 读写工具都不完整，因此定义 `AcDbDatabaseConverter` 接口，让 LibreDWG、dxf-json、乃至商业 ODA 都能产出同一份数据模型。

### 3.2 性能三支柱

- **合批几何**：Three.js `BatchedMesh` 只支持三角面，不支持点与线，故自行实现点/线/面三类合批，核心目标是压低 Draw Call。
- **文本渲染**：MText 解析（`mtext-parser`）+ SHX 描边字体解析（`shx-parser`）+ 排版渲染（`mtext-renderer`）；解析后的字体缓存进 **IndexedDB** 加速二次渲染。
- **大坐标精度**：Medium 专文《Precision-Safe Rendering of Large-Coordinate CAD Drawings in Three.js》。
- 线型 / 填充图案用 `ShaderMaterial` 实现（含文字的线型尚未支持）。

### 3.3 命令 · 事务 · Undo 三层模型（最有价值的部分）

- 生命周期：`trigger()` → `commandWillStart` 事件 → `execute()` → `finally` 中 `commandEnded`（**必发，异常也发**）。
- `AcEdCommand.trigger()` 自动包裹 **1 个 undo mark + 1 个 transaction**；`execute()` 抛错则 `abortTransaction()` + `cancelUndoMark()`。因此普通命令**不应**手写事务。
- Undo 录制需要三个条件同时成立：`recordsUndoStack === true`、`doc.openMode >= Review`、`command.mode >= Review`；`AcApUndoCmd`/`AcApRedoCmd` 应设 `recordsUndoStack = false`。
- 访问权限：`AcEdOpenMode.Read(0) / Review(4) / Write(8)`，按数值可比大小，命令只能在不高于文档 openMode 时执行。
- 写实体必须走 `openEntityForWrite(...)`（或其 ID 版本），否则绕过事务记录、**不可 undo**。
- 命令之外的编辑（Ribbon、夹点、内联编辑器、对话框回调）必须用 `acapRunDatabaseEdit(db, label, fn)`。
- 视图同步是**事件驱动**的：`entityAppended/Modified/Erased` → `view.addEntity/updateEntity/removeEntity`；提交后**不要**手写 `view.updateEntity()`，除非是临时预览。
- 批量导入用 `beginEventBatch()` / `endEventBatch()` 合并事件。
- 失败模式清单（stale 引用直接改属性、jig 内写库、自建 undo 栈等）已列成表格。

### 3.4 Jig 与用户输入

- 与 ObjectARX 的差异：Jig **直接挂在 prompt options 上**（`opts.jig = new CircleJig(view, center)`），无需覆写 `sampler()` / `worldDraw()` / `drag()`。
- 映射关系：`sampler()` ↔ `update(value)`，`startJig()` ↔ `setEntity()`，`drag()` ↔ 外部 JS 事件驱动。
- 输入必须走 `AcEditor` 的 9 个方法（`getPoint` / `getDistance` / `getAngle` / `getDouble` / `getString` / `getKeywords` / `getEntity` / `getSelection` / `getBox`），**禁止**在 canvas 上直接监听键鼠，否则绕过关键字与输入生命周期。
- 关键字规则：`displayName` / `globalName` / `localName` 三元组，大小写不敏感，别名由 globalName 的大写字母派生（`sAve → A`），`_` 前缀强制匹配 global；`AcEdKeywordCollection('Ja Nein _ Yes No')` 支持 ObjectARX 风格字符串。
- 复杂命令（如 PLINE）推荐 **状态机管分支 + Jig 只管当前状态预览**，复用 `AcEdPromptStateMachine`。

### 3.5 系统变量：双注册表

- `AcDbSystemVariables` = 变量名常量目录（单一事实来源，产出 `AcDbSystemVariableName` 类型）。
- `AcDbSysVarManager.registry` = 运行时**实际支持**的变量（目录里有名字 ≠ 可用）。
- `AcApDocManager` 启动时遍历 `getAllDescriptors()`，把**每个变量名注册成一个同名命令**（共用 `AcApSysVarCmd` 实现），于是 `CLAYER`、`PICKBOX` 直接就是命令。
- 两类存储：库驻留（`CECOLOR` / `CELTSCALE` / `CELWEIGHT` / `CLAYER` / `LWDISPLAY`）vs 管理器缓存（`COLORTHEME` / `PICKBOX` / `WHITEBKCOLOR`）。
- 变更通过 `sysVarChanged` 事件驱动消费方（范例：`AcEdCursorManager` 监听 `PICKBOX` 重建准星）。
- 新增变量 4 步：常量 → 注册 descriptor → 选存储模型 → 按需接事件。

### 3.6 插件与懒加载

- `AcApPlugin{ name, version?, description?, onLoad, onUnload }`，上下文为 `AcApContext`（doc + view），命令栈为 `AcEdCommandStack`。
- 懒加载：`registerLazyPlugin({ name, triggers, loader })`，`triggers` 为触发命令名，用户在命令行敲触发命令时由 `AcApDocManager` 自动 `loadByTrigger()`；`loader` 内用动态 `import()` 让打包器切 chunk。
- 4 条注册路径：懒加载（推荐）/ `cad-viewer` 内置 `registerLazyPlugins()` / `pluginManager.loadPlugin()` 立即加载 / `createInstance({ plugins: { fromConfig | fromFolder } })`。
- 硬约束：`onUnload` 必须移除 `onLoad` 注册的**全部**命令；`name` 必须与 loader 返回实例的 `name` 一致；一个 trigger 不能映射两个插件（注册即抛错）。
- 官方插件：`chtml`（HTML 导出，额外需要 `htmlViewerRuntimeUrl`）、`cpdf` / `ipdf`（PDF 导出/矢量导入）、`csvg`。
- 页末附 5 行症状→原因排错表。

### 3.7 其余要点

- **i18n**：`AcApI18n` 是无框架依赖的消息注册表，键为点分路径，按 `command` / `jig` / `dialog` / `entity` / `main` 约定前缀；插件用 `mergeLocaleMessage` 合并，Vue 宿主用 `AcApI18n.messages` 喂给 `vue-i18n`，并用 `localeChanged` 事件双向同步。
- **颜色**：`AcCmColor` 统一 ACI 与 TrueColor；ACI 0=ByBlock、256=ByLayer、**7=自适应前景色**（黑底白、白底黑）。实现细节：材质创建时打"是否前景"标记，切换背景时由样式管理器集中通知各材质管理器只刷新被标记的材质。
- **OSNAP**：实体侧 `subGetOsnapPoints(osnapMode, pickPoint, lastPoint, snapPoints, gsMark?)`；模式是**序数而非位标志**，互转用 `acdbOsnapModesToMask/acdbMaskToOsnapModes`；运行时链路为 `view.pick → 逐模式调用 → 取距光标最近点 → 按屏幕 hitRadius（默认 20px）换算世界距离阈值`。UI 仅暴露 6 种（端点/中点/圆心/节点/象限/插入），默认掩码仅端点+中点+圆心。**INSERT 非插入点吸附是已知缺陷**（依赖子命中回传 `gsMark`），并列出根因与贡献方向。
- **Worker URL**：`new Worker(url, { type: 'module' })` 中 URL **相对 HTML 文档**解析，不相对 JS 模块；因此明确"避免使用 `import.meta.url`"，并给出 dev/prod 解析差异对照表。
- **字体/模板自托管**：约定 `fonts/` + `templates/`（默认模板 `acadiso.dxf`）+ `fonts.json` 元数据（`name`/`file`/`type`/`description`/`encoding`），配 CORS 与 MIME 要求及 Nginx 片段；字体加载失败走 `fonts-not-found` / `fonts-not-loaded` 事件。

---

## 四、与本工作区逐条对照

| # | 主题 | Wiki 说法 | 本工作区现状 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 包名 | `@mlightcad/*` | 已整体改名为 `@hy/*`（`@hy/cad-simple-viewer` 1.6.1 等） | ⚠️ 所有 install / import 片段**不可直接照抄** |
| 2 | mtext-renderer | 独立 npm 包，来自 `mlightcad/mtext-renderer` 仓库 | 已 vendor 到 `packages/mtext-renderer`，包名**故意保留** `@mlightcad/mtext-renderer`，版本锁 `^0.12.4`（避免双实例 / `instanceof` 失效） | ⚠️ 来源与版本策略完全不同 |
| 3 | DWG 解析 | `@mlightcad/libredwg-converter` + WASM | 已移除 GPL 的 libredwg-converter；无任何 libredwg 依赖；改为可选专有 `@mlight-cad/dwg-converter` 接入（见 `PROPRIETARY-PARSER.md`），DXF 为主路径 | ❌ 架构页 / FAQ 的解析器叙述已过时 |
| 4 | 多仓库调试 | `pnpm-workspace.yaml` 里用 `file:` overrides 指向同级的 `realdwg-web` / `mtext-renderer` | 已合并为单一 monorepo，`overrides` 仅剩 `@mlightcad/mtext-input-box` | ❌ 该页对本仓无意义（`pnpm sync:versions` 机制仍有效） |
| 5 | 默认资源地址 | 无 `baseUrl` 时用 `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/` | `resolveCadDataBaseUrl()` 实现**本地优先、CDN 回退**（镜像目录 `packages/cad-data`，`pnpm sync:cad-data`） | ⚠️ 需改写；另 Wiki 未覆盖"worker 内相对 URL 需绝对化"这个坑 |
| 6 | 标注命令 | 基类 `AcApBaseRevCmd` + 专用标注图层 + `cecolor/celweight` 临时改写 | 仓库内**不存在** `AcApBaseRevCmd`；改为 `command/markup`（云线/矩形/圆/箭头/文字/标注引线/图章/高亮）+ `command/measure` + `command/overlay`，带 sidecar JSON 持久化 | ❌ 该页架构在本仓不成立，功能上本仓是超集 |
| 7 | data-model 依赖关系 | FAQ：`cad-simple-viewer` **依赖** `data-model`，视为版本锁定的成对包 | 本仓 `data-model` 与 `three-renderer` 声明为 **peerDependencies**（`workspace:*`），由 `.pnpmrc` 的 `strict-peer-dependencies` 兜底 | ⚠️ 结论方向一致（需同版本），机制不同 |
| 8 | 插件集合 | 官方仅 html / pdf / svg 三个导出插件 | 除 html / pdf / svg 外，另有 agent / invertsel / layerctx / search / simple-ui / tunnel 六个功能插件 | ✅ `AcApPluginManager` 机制一致，本仓用法更广 |
| 9 | 插件开发规范 | 无（Wiki 只讲机制） | 本仓有 `docs/04-开发规范/功能插件开发标准.md`（包骨架、加载策略、验证 Checklist） | ✅ 互补，本仓更严 |
| 10 | 大图纸性能 | 仅架构页泛谈合批 + Medium 外链 | `docs/02-性能优化/` 有成体系的瓶颈分析、M1–M6 计划与实测报告 | ✅ 本仓显著更深 |
| 11 | 天正图纸 | 建议服务端预处理转 T3 DWG（参考 `t3-conv`），检测代理实体 | 无相关实现；本仓业务为煤矿采掘工程平面图 DXF | ✅ 可直接采纳的建议 |
| 12 | 命令 / Jig / 输入 / 事务 / 系统变量 / 颜色 / i18n / Worker URL / 集成 props | 见第三节 | 代码中对应符号均在（`AcEdOpenMode` 117 文件、`AcDbSysVarManager` 66、`AcEdPreviewJig` 51、`subGetOsnapPoints` 96、`AcApI18n` 138、`acapRunDatabaseEdit` 21、`AcEdPromptStateMachine` 13） | ✅ 可直接作为本仓扩展开发的参考 |

---

## 五、评价

### 值得借鉴

1. **"设计意图 + 反例"写法**：`Entity-Modification-Best-Practices` 的「Common Mistakes」表、`Object-Snap` 的「Why INSERT snapping can fail」、`Plugin-System` 的「Troubleshooting」表，把踩坑经验前置，比纯 API 列表有用得多。本仓 `docs/` 可借鉴这种"已知缺陷 + 根因 + 贡献方向"的结构。
2. **显式的 ObjectARX 对照**：`AcDbEntity.subGetOsnapPoints` ↔ `getOsnapPoints`、`AcEdPreviewJig.update` ↔ `sampler()`，显著降低有 ObjectARX 背景者的迁移成本。
3. **边界写清楚**：明确 `AcDbSystemVariables`（名字目录）与 `AcDbSysVarManager.registry`（运行时支持集）的差别，明确 Worker URL 相对文档解析、明确"目录里有名字 ≠ 可用"。这类"容易误解点"值得本仓文档复制。
4. **Home 页的 5 篇 Medium 外链**：合批几何、场景构建、文本渲染、大坐标精度、海量实体拾取——与本仓性能命题高度重合，是 Wiki 正文之外最有价值的部分。

### 明显不足

1. **无版本标注**：所有页面都不写"对应哪个版本"，而 `#6`、`#2`、`#3` 这类差异证明页面与代码会分叉。
2. **一致性问题**：`Development-Guide` 的 `[Create Drawing and Entities]()` 是空链接；`Integrate-Simple-CAD-Viewer` 里 `AcApDocManager.createInstance(canvas)` 与 `Configure-Worker-URLs` 里 `createInstance({ webworkerFileUrls })` 签名不一致；`Self-Hosted-Fonts` 里又出现 `createInstance(canvas)`。实际本仓是 `createInstance({ container })`。
3. **拼写与格式**：`Developmennt`、`avaiable`、`hwo`、`workUrl`（应为 `workerUrl`）、多处表格/代码块缩进错位。
4. **Roadmap 已过期**：时间线停在 2025 Q4 / 2026 Q2，实际已是 2026-09，多项"Planned"在本仓早已实现（设计评审标注、测量、离线编辑框架）。
5. **覆盖面缺口**：无性能优化专页、无 worker 资产流转（`dxf-parser-worker.js` / `mtext-renderer-worker.js` 的复制与命名约束）、无构建产物与发布流程、无 E2E/单测约定、无中文版本。
6. **指向其他仓库的代码链接会失效**：如 `realdwg-web` 的 `AcCmColor.ts`、`AcDbEntity.ts`，以及本仓已不存在的 `AcApBaseRevCmd`。

---

## 六、建议的后续动作

**P0（低成本、防误导）**

1. 在本仓 `docs/04-开发规范/` 增补一页《上游 Wiki 使用说明》，核心只有一句：**读设计意图可以，抄代码片段不行**，并列出 §四 表中的 6 条必改点（`@mlightcad` → `@hy`、无 libredwg、baseUrl 本地优先、无 `AcApBaseRevCmd` 等）。
2. 把 Wiki 中本仓**完全适用但本仓尚无对应中文文档**的三页翻译改写进 `docs/01-架构设计/`：`Command`（命令生命周期 + 别名 + OpenMode）、`Entity-Modification-Best-Practices`（事务/undo/事件同步）、`Configure-Worker-URLs`（相对基准与 `import.meta.url` 陷阱）。改包名、补本仓实际路径。

**P1（可选增强）**

3. 按 Wiki 的"已知缺陷 + 根因 + 贡献方向"格式，给本仓 `docs/03-缺陷修复与功能改造/` 的既有文档补一节"同类问题预防清单"。
4. 把 `Home.md` 的 5 篇 Medium 文章登记进 `docs/02-性能优化/` 的参考清单（它们讲的是上游如何解决合批/文本/大坐标/拾取，可作为本仓优化的外部对照）。
5. 若后续要与上游同步代码：注意包名 scope、mtext-renderer vendor 化、libredwg 移除这三项是**结构性分叉**，直接向上游提 PR 需要先剥离。

**P2（回馈上游）**

6. 可向上游 Wiki 提的小 PR：修正 `Developmennt` / `avaiable` / `hwo` / `workUrl` 拼写、补 `Development-Guide` 的空链接、更新 Roadmap 时间线、统一 `createInstance` 示例签名。

---

## 七、附：复现本次分析

```bash
git clone --depth 1 https://github.com/mlightcad/cad-viewer.wiki.git /tmp/cad-viewer-wiki
ls /tmp/cad-viewer-wiki            # 22 个 .md + images/
git -C /tmp/cad-viewer-wiki log -1 # 核对快照时间
```

对照本仓符号是否存在：

```bash
cd cad-viewer
for k in AcApPluginManager AcEdPromptStateMachine acapRunDatabaseEdit \
         AcEdOpenMode AcDbSysVarManager AcApSysVarCmd AcApI18n \
         AcEdCursorManager AcApBaseRevCmd AcEdPreviewJig subGetOsnapPoints; do
  printf '%-24s %s\n' "$k" "$(grep -rl --include='*.ts' --include='*.vue' -- "$k" packages/ | wc -l)"
done
```

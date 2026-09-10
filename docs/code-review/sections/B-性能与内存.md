# B 性能与内存

> 覆盖范围：`docs/code-review/raw/` 下 14 份评审 JSON 中 **verdict=confirmed 且 category ∈ {performance, memory, concurrency}** 的 finding，共 48 条；跨域重复条目（`AcApDocManager.destroy()`、`openDocument` 重入、`_pendingGlyphKeys`、`OrbitControls` 未销毁）合并为同一条，最终 **44 条**。
> 本机为软件渲染、无真实 GPU：凡涉及每帧扫描/GPU 纹理的条目，结论以代码事实与调用频率为准，实际帧率收益需在真实 GPU 环境复测。
> P1 条目只作一句话引用（严重问题章节详解），本章重点写 P2/P3 的修复收益与验证者修正。
> 全部行号、代码事实与量级均取自上述 JSON，未作任何补充推断。

---

## 总览表

| 编号 | 主题 | 热点频率 | 严重度 | 关键位置 |
| --- | --- | --- | --- | --- |
| B1 | 事务变更记录器线性扫描退化 O(N²) | 每实体变更；38.9 万实体一次框选删除 | P1 | `data-model/src/database/transaction/AcDbChangeRecorder.ts:55-68` |
| B2 | LWPOLYLINE 凸度段固定 100 采样、每点 4 次分配 | 每凸度段 101 点 × 每实体每次构建 | P2（P1→P2） | `data-model/src/entity/AcDbPolyline.ts:649-670` |
| B3 | NURBS 逐点采样走 evaluate() 并算一二阶导数 | 每实体 100 采样 × (n+1) × 7 次递归 | P2 | `geometry-engine/src/geometry/AcGeNurbsCurve.ts:112-134` |
| B4 | 图层缺失时每实体每次绘制一条 console.error | 每缺图层实体每次 worldDraw | P2 | `data-model/src/entity/AcDbEntity.ts:1029-1039` |
| B5 | TABLE 行/列数直接作数组长度，可致整图打不开 | 单条坏 TABLE 即中断 95MB 打开 | P2（P1→P2） | `data-model/src/entity/AcDbTable.ts:339-347` |
| B6 | 渐进式让帧每实体一次 async+await | 38.9 万次 promise 与微任务 | P3 | `cad-simple-viewer/src/view/AcTrView2d.ts:2998-3005` |
| B7 | MLeader 箭头修剪距离每次绘制重复解析 | 每条引线每次 subWorldDraw | P3（P2→P3） | `data-model/src/entity/AcDbMLeader.ts:3042-3058` |
| B8 | 宽多段线 toFixed 做 Map 键 + Math.max 展开 | 每采样点 2 次 toFixed；12.5 万参数才抛 RangeError | P3（P2→P3） | `data-model/src/entity/AcDbPolyline.ts:1272` |
| B9 | 每个代理实体绘制都全量重建图层/线型名数组 | P 个代理实体 × L 个图层名 | P3 | `data-model/src/misc/proxyGraphic/AcDbProxyGraphic.ts:290-299` |
| B10 | 每实体热路径 getObjectById 反查批次容器 | 38 万次入批 + 每 mousemove/每次选择 | P1 | `three-renderer/src/batch/AcTrBatchedGroup.ts:1257` |
| B11 | 高亮掩码 hasAnyHighlight 每 draw call 全量扫描 | 每帧每批次；38 万实体≈0.4MB/帧 | P2 | `three-renderer/src/batch/highlight/AcTrBatchHighlightState.ts:217-224` |
| B12 | 每个 POINT 实体重复建点符号几何并再 clone | 38 万 POINT ≈ 76 万 BufferGeometry | P2 | `three-renderer/src/object/AcTrPoint.ts:32-41` |
| B13 | grip 拖拽每次 mousemove 深克隆实体并重建几何 | 每 mousemove；单条 10 万顶点多段线 | P1 | `cad-simple-viewer/src/editor/grip/AcEdGripPreviewJig.ts:43-53, 64-68` |
| B14 | 每 mousemove 12~15 次 getBoundingClientRect | 每 mousemove（实际强制重排 3~4 次） | P2（P1→P2） | `cad-simple-viewer/src/editor/input/ui/AcEdFloatingMessage.ts:257-276` |
| B15 | OSNAP 标记每次 mousemove 销毁并新建 DOM | 每 mousemove 命中捕捉点 1 个 div | P2 | `cad-simple-viewer/src/editor/input/ui/AcEdFloatingInput.ts:355-372` |
| B16 | OSNAP 每候选实体重复 mask→模式数组转换 | 每 mousemove 数百至数千次分配 | P2 | `cad-simple-viewer/src/editor/input/AcEdOsnapResolver.ts:140-158` |
| B17 | 子索引构建逐条 insert 而非 load() | 每子盒子一次；单 group 可 >10 万 | P2 | `cad-simple-viewer/src/spatialIndex/AcTrHierarchicalSpatialIndex.ts:352-364` |
| B18 | 层次索引 window 模式重复全量子项遍历与分配 | 每次 window 框选，命中数千 INSERT | P3（P2→P3） | `cad-simple-viewer/src/spatialIndex/AcTrHierarchicalSpatialIndex.ts:196-207, 218-233` |
| B19 | 属性面板为全部选中实体建运行时属性树 | 每次选择变更；38.9 万实体≈800 万描述符 | P1 | `cad-viewer-example/src/shell/panels/AntdPropertiesPanel.vue:93-102` |
| B20 | QuickSelect 每个下拉字段全量扫描 modelSpace | 打开对话框 2~4 遍全图扫描 | P2（P1→P2） | `cad-viewer/src/composable/useQuickSelect.ts:196-222` |
| B21 | HTML 快照 osnap 目录构建整块同步不让出 | 单图层 38 万实体只让出 1 次 | P2 | `cad-html-plugin/src/AcApHtmlSnapshotBuilder.ts:130-154` |
| B22 | 批次几何导出 number[] 逐浮点 push 不预分配 | 每次导出每 batch；千万级浮点 | P2 | `cad-html-plugin/src/AcExSceneBatchCollector.ts:208-227` |
| B23 | 快照 base64 逐字符拼接整段载荷 | 每次导出；数十 MB 载荷 | P2 | `cad-html-plugin/src/AcExSnapshotCodec.ts:58-73` |
| B24 | SVG/PDF 导出整图拼单串 + 整棵 DOM | 每次导出；38 万实体 | P2 | `cad-svg-plugin/src/AcSvgRenderer.ts:315-362` |
| B25 | 智能体验证截图对全模型空间实体同步提取 | 每轮最多 5 次；38 万实体 | P2 | `cad-agent-plugin/src/agent/drawingPreviewCapture.ts:17-21, 53-54` |
| B26 | SVG lineSegments 每段一个 `<line>` 并重复样式 | 每次导出；上限数百万段 | P3 | `cad-svg-plugin/src/AcSvgLineSegments.ts:22-43` |
| B27 | destroy() 不销毁视图：rAF/WebGL/DOM/单例监听泄漏 | 每次 QUIT + 重挂载 | P1 | `cad-simple-viewer/src/app/AcApDocManager.ts:625-632` |
| B28 | 视图/编辑器无析构：ResizeObserver 与单例监听泄漏 | 每次 create/destroy | P1 | `cad-simple-viewer/src/editor/view/AcEdBaseView.ts:331-340` |
| B29 | 单例 sysVar 监听 + 旧 database（38 万实体）被持有 | 每次 SETVAR/LWDISPLAY 触发 O(N) 重派发 | P1 | `cad-simple-viewer/src/app/AcApContext.ts:116-138` |
| B30 | `_pendingGlyphKeys` 无上限且跨文档不清理 | 每次打开/换图单调增长 | P1 | `three-renderer/src/renderer/AcTrMTextRenderer.ts:76, 451-464` |
| B31 | 布局/视口视图 OrbitControls 永不回收 | 泄漏量≈布局数+视口数×重开次数 | P2（P1→P2） | `cad-simple-viewer/src/view/AcTrView2d.ts:2413-2429` |
| B32 | AcTrRenderer.dispose 不解绑 FontManager、不释放 WebGLRenderer | 每个 destroy/create 周期 1 个上下文 | P2（P1→P2） | `three-renderer/src/renderer/AcTrRenderer.ts:147-152, 667-670` |
| B33 | 批次 dispose 不释放高亮掩码 DataTexture | 每次文档/布局切换按批次累积 | P2 | `three-renderer/src/batch/AcTrBatchedMixin.ts:1270-1274` |
| B34 | useSystemVars 在进程级单例上注册监听且不注销 | 每次「退出→再开图」+2 监听 | P2 | `cad-viewer/src/composable/useSystemVars.ts:150-186` |
| B35 | useLayouts 在全局 layoutManager 上注册匿名监听 | 每次壳层挂载 +1 监听 | P2 | `cad-viewer/src/composable/useLayouts.ts:35-51` |
| B36 | 示例壳层选择/文档监听卸载时不注销 | 每次切换 ribbon 页签即卸载重挂 | P2（P3→P2，唯一上调） | `cad-viewer-example/src/shell/ribbon/AntdPropertyBar.vue:159-188` |
| B37 | AcApDrawStyleToolbar.dispose() 无调用点 | 每次 destroy/重建 +1 capture 监听 | P3（P2→P3） | `cad-simple-viewer/src/ui/AcApDrawStyleToolbar.ts:403-421` |
| B38 | SymbolTable.add 同名覆盖不释放旧句柄 | 每条重名记录泄漏 1 个对象 | P3（P2→P3） | `data-model/src/database/AcDbSymbolTable.ts:99-111` |
| B39 | computeLineDistance 对在用 geometry 调 dispose() | 每非批处理 AcTrLine/AcTrLineSegments 转换 | P3（P2→P3） | `three-renderer/src/util/AcTrBufferGeometryUtil.ts:249-296` |
| B40 | disposeObjectTree 释放与原对象共享的 geometry | 潜在；现网调用方 ownsClone 恒 false | P3（P2→P3） | `three-renderer/src/renderer/AcTrEntityPreview.ts:330-339` |
| B41 | 搜索面板防抖定时器未在卸载时清理 | 每次快速切换最多一次全量扫描 | P3（P2→P3） | `cad-search-plugin/src/ui/SearchPanel.vue:82-92` |
| B42 | openDocument/openUrl 无 in-flight 守卫 | 打开窗口持续数秒期间可二次触发 | P2（P1→P2） | `cad-simple-viewer/src/app/AcApDocManager.ts:923-944` |
| B43 | worker 池成功/错误路径永不释放 worker | 池满后任务串行化 + 误报 timeout | P3（P2→P3） | `data-model/src/converter/worker/AcDbWorkerManager.ts:121-134, 148-170` |
| B44 | worker 池每任务监听器永不注销 | N 个任务后每次消息遍历 N 个 handler | P3 | `data-model/src/converter/worker/AcDbWorkerManager.ts:137-182` |

---

## 一、解析与实体构建（每 pair / 每实体）

### B1 事务变更记录器对每条变更做全数组线性扫描，批量删除/编辑退化为 O(N²)

**位置**：`cad-viewer/packages/data-model/src/database/transaction/AcDbChangeRecorder.ts:55-68、79-83、127-140、196-218、228-239`（调用点 `database/AcDbBlockTableRecord.ts:499-504`、`database/transaction/AcDbTransaction.ts:44-58`）

**频率/规模**：框选 N 个实体删除时每实体一次 `findIndex`；本机 Node 实测同谓词 `remove` 5k=25ms / 20k=288ms / 50k=1787ms，`modify` 50k=4993ms，按 N² 外推 38 万实体一次框选删除 ≈90-100s 主线程冻结。

**问题与验证结论**：`recordRemove`/`recordModify`/结构变更去重全部用 `this.changes.findIndex(...)` 线性扫描（验证者逐行核对 `:57-59/80-82/129-131/175-179/198-200/208-210/233-238`），且每次 `clonePreservingIdentity()` 深拷贝快照；`AcApEraseCmd` 经 `AcEdCommand.ts:241-242` 开启 undo mark + 事务，`isRecording` 为真，因此该退化落在「框选大批量删除 + 撤销」主链路上。独立验证者**确认**，并指出 `docs/02-性能优化/框选大量对象性能分析.md:73` 的「批量删除均为线性复杂度」结论不成立。

**建议修复**：为 modify / sysvar / 结构变更各维护 `Map<objectId, changeIndex>` 或 `Set<containerKey+objectId>` 去重索引替代 `find`/`findIndex`；结构取消配对改为按 key 查表。

**验证者补充**：P1 维持，未下调。触发条件是「开启事务录制状态下的批量删除/修改」，普通小批量编辑不显著；修复改动集中在一个类内部，但需保证 `Set`/`Map` 索引与 `changes` 数组在新增、取消、flush 各路径上严格同步，属**中风险**改动。（严重问题章节详解）

---

### B2 LWPOLYLINE 凸度段固定 100 采样且每采样点两次对象分配

**位置**：`cad-viewer/packages/data-model/src/entity/AcDbPolyline.ts:649-670`（另 `AcGePolyline2d.ts:279-284`、`AcGeCircArc2d.ts:482-487`）

**频率/规模**：每次 `subWorldDraw`（每实体每次转换/重建，direct batch 路径经 `AcTrDirectBatch.ts:43` 同样经 `worldDraw` 触发）对每个凸度段生成 101 个点；验证者实测**每采样点 4 次分配**（而非评审员原文的 2 次），每凸度段另加 1 个 `AcGeCircArc2d`。

**问题与验证结论**：`AcDbPolyline.ts:650` 固定 `this._geo.getPoints(100)`，`AcGePolyline2d.ts:279-285` 每凸度段 `new AcGeCircArc2d` 并复制点，`AcGeCircArc2d.ts:482-487` 的 `getPointAtAngle` 也 `new AcGePoint2d`；采样数与实体实际尺寸无关，而 ARC/CIRCLE 已用 `acTrComputeArcSegmentCount` + `getPointsFlat` 做过 LOD 与零对象采样，凸度段未享受。独立验证者**确认代码事实且比原文更重**。

**建议修复**：为 `AcGePolyline2d`/`AcGeCircArc2d` 增加长度感知的 flat 采样（镜像 `getPointsFlat(out?: Float64Array)`）；LWPOLYLINE 复用渲染器已有的 `arcLodDiagonal`/`arcSegmentCount` 计算每段采样数，并让 `subWorldDraw` 直接产出 `Float64Array`，避免 `AcGePoint2d`+`AcGePoint3d` 双份对象。

**验证者补充**：**P1→P2 下调**，原因是量级假设未获证实：夹具 `jky-small`/`anjian`/`origin-shift-big` 的 LWPOLYLINE 为 21/540/300 条，含组码 42（凸度）者仅 0/1/0，「凸度多段线占比很高」不成立，GC 压力证据不足。`AcDb2dPolyline.ts:444` 同病。修复需改几何引擎公开签名，回归面较广。

---

### B3 NURBS 逐点采样走 evaluate()：每点重建控制点数组并计算一二阶导数

**位置**：`cad-viewer/packages/geometry-engine/src/geometry/AcGeNurbsCurve.ts:112-134`（热路径 `AcGeSpline3d.ts:521-539`，内层 `AcGeNurbsUtil.ts:647-668`）

**频率/规模**：每实体构建渲染数据时 `AcDbSpline.subWorldDraw`（`AcDbSpline.ts:620-628`）→ `AcGeSpline3d.getPoints(100)`：100 个采样点每点重建 n+1 个 `[x,y,z]` 数组，并对全部 n+1 个控制点各算 basis/deriv1/deriv2（共 7 次递归 Cox-de Boor），却只用 `point` 分量；`acgeCalculateCurveLength:714-762` 另有固定 1000 步同构开销。

**问题与验证结论**：`AcGeNurbsCurve.ts:112-114` 的 `point()` 直接转 `evaluate()`，`:125-134` 每点 `map` 重建控制点数组；`AcGeSpline3d.ts:521-541` → `AcDbSpline.ts:626-628` 只用 `point`。验证者用 jest 实测 21 控制点三次样条 100 采样：`point` 0.591ms vs 现成 `acgeEvaluateNurbsPoint` 0.289ms，**约 2x**（评审员原文「4-7x」偏高）。独立验证者**确认**，维持 P2。

**建议修复**：在 `AcGeNurbsCurve` 上缓存数值化控制点数组（构造/变更时失效），点采样改用 `acgeEvaluateNurbsPoint`（或新增只算位置的 `evaluatePoint`）；把基函数循环限制在非零区间 `[span-p, span]`。

**验证者补充**：未下调。触发条件是图纸含 SPLINE/样条实体（中文图纸中样条越多越明显）。这是本章**性价比最高**的条目之一：改动是在 `point()` 内改调一个已存在的函数，预期省约一半开销，风险低。

---

### B4 图层缺失时每个实体每次绘制触发一次 console.error

**位置**：`cad-viewer/packages/data-model/src/entity/AcDbEntity.ts:1029-1039`（调用链 `:214` ← `resolveStandardColor` ← `:827`）

**频率/规模**：开销随「缺图层的实体数」线性增长（验证者明确修正：不是全部 38 万实体），每次 `worldDraw` 一条 error。

**问题与验证结论**：`AcDbDatabase.isLayerDrawable`（`AcDbDatabase.ts:1669-1675`）对 `layer==null` 返回 true，实体照画，于是 `resolvedColor` 每次 `worldDraw` 都走 `getLayerColor` 并 `console.error`，**没有任何缺失图层缓存**（验证者核对全库仅此一处图层缺失日志）。仅含 ENTITIES 段（无 TABLES）、引用 xref/Defpoints 图层或经第三方转换器生成的 DXF 都会命中；DevTools 打开时是明显停顿。独立验证者**确认**，维持 P2。

**建议修复**：在数据库或实体上缓存「已确认缺失的图层名」集合，首次命中时 `console.warn` 一次并返回 `undefined`（配合打开结束时的汇总告警），后续静默走 fallback 颜色。

**验证者补充**：未下调。修复成本极低（一个 `Set` + 一次 warn），**收益/成本比最高**；但要注意 DevTools 未打开时 `console.error` 本身开销较小，因此收益集中在调试态与大量缺图层实体场景。

---

### B5 TABLE 行/列数直接来自文件并用作数组长度，异常输入可致整份图纸打开失败

**位置**：`cad-viewer/packages/data-model/src/entity/AcDbTable.ts:339-347`（`:344-346`、`:1143-1145`、`:1151`）

**频率/规模**：单条畸形 TABLE 记录即可让 95MB / 38 万实体图纸整体打不开（不是性能退化而是失败放大）。

**问题与验证结论**：`this._rowHeight = new Array<number>(rows).fill(0)` / `new Array<AcDbTableCell>(rows * cols)` 中 `rows`/`cols` 来自组码 91/92 且无上界或整数校验；验证者写临时用例走 `ACAD_TABLE→dxfIn`，组码 91=1e18 时在 `ensureGrid(:1053-1064)`→`resizeGrid(:344)` 抛 `RangeError: Invalid array length`。下游无兜底：`AcDbDxfDocumentReader.readEntitiesSection` 对 `acdbDxfInEntity`（`:780`）无 try/catch（该文件 0 处 catch），`AcDbNativeDxfConverter.read:170-175` 直接 `throw error`。独立验证者**确认**。

**建议修复**：在 `resizeGrid` 内校验 `Number.isInteger(rows) && rows>0 && rows<=MAX`（并对 `rows*cols` 做溢出/上限判断，超出则按需扩容或按 `cellIndex` 上限裁剪）；给 `readEntitiesSection` 的单实体解析加 try/catch，坏实体计入 `unknownEntityCount` 后继续。

**验证者补充**：**P1→P2 下调**，且原文「NaN 也会抛」**不成立**：`NaN>0` 为 false，`ensureGrid` 不执行，实测无异常；只有超大/非整数有限值会抛。触发依赖畸形文件，且 91/92 的合法值是小整数。修复属健壮性加固，改动小、风险低。

---

### B6 渐进式让帧：每个实体一次 async 调用 + await

**位置**：`cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2998-3005`（`packages/common/src/AcCmYieldToUi.ts:143`）

**频率/规模**：一次 38.9 万实体的打开 ≈ 38.9 万次 promise 分配与等量微任务，而真正让出只有每 300ms 一次。

**问题与验证结论**：`AcCmUiYieldGate.maybeYield` 是 async 方法（验证者核对 `AcCmYieldToUi.ts:139-158`），预算未到时 `return false` 也仍返回 Promise；`AcTrView2d.ts:2998-3005` 在 progressive 每实体循环末尾无条件 `await`。独立验证者**确认**，维持 P3。

**建议修复**：给 `AcCmUiYieldGate` 增加同步判定（如 `shouldYield()`/`tryYield()`），仅在预算到期时才 `await`。

**验证者补充**：未下调。验证者修正了收益量级：单次开销约百纳秒级（合计约 0.1s 量级），且 `:2780` 每个 `batchConvert` 都新建 gate，要单批跑满 300ms 才真正让出；因此收益有限，属「顺手优化」，不应单独排期。

---

### B7 MLeader 每条引线的箭头修剪距离在每次绘制中重复解析样式并遍历箭头块

**位置**：`cad-viewer/packages/data-model/src/entity/AcDbMLeader.ts:3042-3058`（`:3032`、`:1719-1722`）

**频率/规模**：subWorldDraw 每个 leader 的每条 leaderLine 一次，按引线数线性放大（千级 MLEADER 标注图纸明显）。

**问题与验证结论**：`isArrowheadVisible(:3000-3003)`→`getResolvedArrowheadId(:3191-3194)`/`Size(:3212-3220)`/`BlockTableRecord(:3201-3205)` 各自再次 `getMLeaderStyle(:3304-3325，含 :3314 entries() 全字典回退)`，并 `newIterator()` 遍历箭头块、逐个求 `geometricExtents`，全类无缓存。独立验证者**确认重复解析成立**。

**建议修复**：在实体内缓存一次「箭头块最大 X 偏移 × size」（键为 `arrowheadId`/`arrowSize`，实体属性变更时失效），并把 `getMLeaderStyle()` 结果在同一轮 subWorldDraw 内解析一次后传参复用。

**验证者补充**：**P2→P3 下调**，因为原文「每帧」不成立：`worldDraw` 只在 `AcDbRenderingCache.addEntity(:798)` 缓存未命中时执行一次，块模板命中后连 `subWorldDraw` 都不再跑；且箭头块通常只有 1-3 条实体，绝对开销很小。

---

### B8 宽多段线绘制路径用 toFixed 字符串做 Map 键并对整条采样线做 Math.max 展开

**位置**：`cad-viewer/packages/data-model/src/entity/AcDbPolyline.ts:1272`（`:1241-1243`、`:1216`、`:1226`、`:1192-1195`）

**频率/规模**：仅开口且 `hasRenderableWidth` 的宽多段线；验证者实测 10 万参数正常、**12.5 万才抛 RangeError**，即需约 3000 个凸度段才崩。

**问题与验证结论**：`:1272` `Math.max(...centerline.map(point => point.width))` 以展开实参个数等于采样点数；`:1241-1243` 以 `toFixed(4)` 字符串作 Map 键并被 `splitWidePolylineProfileAtRevisits` 逐采样点调用。异常被 `AcTrView2d.ts:2981-2985` 每实体 catch，后果是**该实体消失而非整图崩溃**。独立验证者**确认代码事实**。

**建议修复**：改为一次 `for` 循环求最大宽度；revisit 检测用数值量化键（如 `(x*1e4|0)` 组合的整数键或按段比较）替代 `toFixed` 字符串，且只在需要判重时才建键。

**验证者补充**：**P2→P3 下调**。原文「凸度段 101 点/段」**不成立**：宽路径 `sampleSegment(:999-1004)` 用 `getPoints(32)`，即 33 点/段。属潜在崩溃 + 常数开销，优先级低，但修法安全。

---

### B9 每个代理实体绘制都全量重建图层/线型名数组

**位置**：`cad-viewer/packages/data-model/src/misc/proxyGraphic/AcDbProxyGraphic.ts:290-299`（构造点 `:281`；调用点 `entity/AcDbProxyEntity.ts:345、440`）

**频率/规模**：P 个代理实体 × L 个图层名，每个代理实体每次绘制/求包围盒一次 O(L) 拷贝。

**问题与验证结论**：构造器用 `layerTable/linetypeTable.newIterator().toArray()` 复制全部名称，而 `AcDbProxyEntity.subWorldDraw`/`geometricExtents` 每次调用都 `new AcDbProxyGraphic`，即每次绘制/求包围盒一次 O(L) 拷贝（`toArray` 另有数组分配）。独立验证者**确认**，维持 P3。

**建议修复**：把 layer/linetype 名字数组缓存在 database 上，或用模块级 `WeakMap<AcDbDatabase, {layers, linetypes}>` 复用，避免逐实例 `toArray`。

**验证者补充**：未下调。仅影响代理实体（第三方转换器生成的图形），单次开销小，属「有则改之」的清理项。

---

**本组优先级建议**

1. **B4 图层缺失日志去重**（低成本高确定性）：数据库级 `missingLayer` 集合 + 首次 warn，几行改动即消除大量重复 `console.error`；风险极低，唯一注意点是保留一次 warn 以便诊断。
2. **B3 NURBS 点采样改走 `acgeEvaluateNurbsPoint`**（约 2x、低改动）：`point()` 内换调用即可，已由验证者实测 0.591ms→0.289ms；风险在于新增函数需覆盖原有边界（闭区间端点）语义。
3. **B2 凸度段长度感知采样 + `Float64Array`**（潜在收益最大、风险最高）：可同时消除 4 次/点分配与尺寸无关的过采样，但改几何引擎公开签名、影响 LWPOLYLINE/2dPolyline 及所有下游渲染路径，必须配夹具回归；建议在「凸度多段线占比」实测确认后再生效。
4. **B5 TABLE rows/cols 上界校验 + 单实体 try/catch**（健壮性加固）：防止一条畸形记录毁掉整份 95MB 图纸；改动局部，建议顺带补一条畸形 TABLE 用例。
5. **B1 变更记录器去重索引**：虽属严重问题章节，但它是本组唯一能把「框选删除 38 万实体 ≈90s」变成可用交互的改动，建议与 B2 同批规划；风险集中在索引与 `changes` 数组的一致性。

---

## 二、渲染批次与几何（每帧 / 每次批量变更）

### B10 每实体热路径用 Object3D.getObjectById 反查批次容器（O(子树) 线性扫描）

**位置**：`cad-viewer/packages/three-renderer/src/batch/AcTrBatchedGroup.ts:1257`（被 `addEntity:1015/1028/1041/1050` 与 `registerDirectAppend:1257` 调用）、`917`、`1463`、`1275`、`1580/1695/1705`

**频率/规模**：每实体入批（38 万次）、hover（每次 mousemove）、框选/选择/取消选择的每实体、erase 的每实体、图层可见性切换的每实体。

**问题与验证结论**：验证者核对 `917/1275/1344/1463/1695/1705` 均为 `this.getObjectById(item.batchedObjectId)`；three@0.172 `getObjectByProperty` 为深度优先递归且无缓存，构造函数 `312-314` 先 `add(_unbatchedObjects[0])`、批次容器到 `1963` 才挂载，故每次查询必先遍历整棵未合批子树（文本/字形/图案填充可达上万节点）。`addLine:1751`/`addMesh:1869`/`addPoint:1912` 明明已持有容器却只返回 id。独立验证者**确认**，P1 维持。

**建议修复**：在 `AcTrBatchedGroup` 内维护 `_containerById: Map<number, AcTrOriginBatch>`（`add(batch)` 时登记、`clear/dispose` 时删除），所有 `getObjectById(item.batchedObjectId)` 改为查表；或让 `addLine/addLine2/addMesh/addPoint` 返回 container 引用并把它与 `batchId` 一起存入 `AcTrEntityInBatchedObject`，彻底去掉反查。

**验证者补充**：P1 维持，未下调（与多数「每帧」条目不同，此条在入批期就有 38 万次调用）。（严重问题章节详解）

---

### B11 高亮掩码 hasAnyHighlight 每次 draw call 全量扫描 mask

**位置**：`cad-viewer/packages/three-renderer/src/batch/highlight/AcTrBatchHighlightState.ts:217-224`（调用点 `AcTrBatchHighlightShaders.ts:533` 的 `onBeforeRender`；另 `AcTrBatchedMixin.ts:1150`）

**频率/规模**：每帧每批次一次；验证者估算量级≈全场景槽位字节数（38 万实体约 0.4MB/帧），且容量只增不减。

**问题与验证结论**：`hasAnyHighlight()` 全量遍历 `selectedMask.length`、无计数；`installBatchHighlightRenderer:504-507` 一旦置位便永不卸载 hook；`ensureCapacity:115-126` 按 2 倍扩容，`getTextureSlotCount` 取 max，容量不收缩。取消高亮后每次绘制仍要扫完整个 `Uint8Array`。独立验证者**确认**，维持 P2。

**建议修复**：用计数替代扫描：在 `setHighlight`/`clearSlot`/`clearAll` 中维护 `highlightCount`（或每槽位的 selected/hovered 计数），`hasAnyHighlight()` 返回 `count>0`；批量清除时置 0。

**验证者补充**：未下调。验证者补充「批次几何无 groups，故每帧每容器一次」，属一般优化而非瓶颈；软件渲染下每帧多扫 0.4MB 相对绘制本身占比有限，真实 GPU 环境收益更小。

---

### B12 每个 POINT 实体重复创建点符号几何并再次 clone 入批

**位置**：`cad-viewer/packages/three-renderer/src/object/AcTrPoint.ts:32-41、51-52`（几何来源 `geometry/AcTrPointSymbolCreator.ts:453-480`）

**频率/规模**：按实际 POINT 实体数缩放；若达 38 万 POINT，则加载期新增约 76 万个 `BufferGeometry` 及配套 `Float32Array`。

**问题与验证结论**：`AcTrPointSymbolCreator.create`（`453-480`）每次调用都新建几何（displayMode 0/null 走 `new BufferGeometry().setFromPoints([origin])`，符号模式走 `pointSymbolGeometry.clone()`），无缓存、无复用；`AcTrPoint:32-41` 逐实体调用，`addPoint:1899`/`addLine:1738` 再 `clone` 后 dispose 自身副本。验证者补两点修正：源几何**不是泄漏**（`AcTrView2d.ts:2936` 的 `threeEntity.dispose()` 会释放）；影响随实际 POINT 数而非固定 38 万缩放。独立验证者**确认**，维持 P2。

**建议修复**：在 `AcTrPointSymbolCreator` 内为每个 displayMode 缓存一份不可变模板（point 与 line 各一），`AcTrPoint` 只引用共享模板；入批时让 `addGeometry/addPoint` 直接从源数组拷贝到批次缓冲，避免每实体 clone。

**验证者补充**：未下调。修复须给共享模板标 `sharesTemplateGeometry`，否则会被 `dispose` 掉——这是本条目唯一的风险点。

---

**本组优先级建议**

1. **B10 getObjectById 改查表**（P1、收益确定）：把反查换成 `Map<id,容器>` 或直接存容器引用，可同时消掉入批、hover、框选、擦除、图层切换五条路径的 O(子树) 扫描；风险在于容器生命周期（`clear`/`dispose` 时同步删表）必须与现有 `children` 挂载顺序解耦。
2. **B12 点符号模板缓存**（中等收益、低风险）：38 万 POINT 时省约 76 万次几何构造；注意共享模板需标记、且需确认入批路径不再依赖「每实体独立几何」。
3. **B11 高亮计数替代扫描**：改动小、语义明确，但收益受限于每帧 0.4MB 量级，建议作为批次高亮重构的顺带项，而非独立排期。

---

## 三、视图与交互（每 mousemove / 每次悬停 / 每次拾取与框选 / 每次 grip 拖拽）

### B13 grip 拖拽预览每次 mousemove 深克隆实体并重建 transient 几何

**位置**：`cad-viewer/packages/cad-simple-viewer/src/editor/grip/AcEdGripPreviewJig.ts:43-53, 64-68`（调用点 `AcEdGripEditSession.ts:57-61`、`AcTrView2d.ts:1838/1842-1851`）

**频率/规模**：grip 拖拽期间每个 mousemove 一次；单条 10 万顶点多段线每移动一次即复制 10 万点并重建一次 THREE 几何。

**问题与验证结论**：`AcEdGripPreviewJig.ts:49` 每次 `update` 都 `_sourceClone.clone()`（`AcDbObject.ts:620-623` 深拷贝并生成新句柄），`:64-68` 再 `addTransientEntity`（`AcTrView2d.ts:1838` 每次全量转换几何）；`AcEdGripEditSession.ts:57-61` 由 document mousemove 直驱、无 rAF/节流。另有异步发布竞态：`scene.add` 在 `asyncDraw().then(...)` 中执行，被取代的 transient 可能以新 objectId 永久留在场景。验证者修正竞态范围**较窄**：`asyncDraw` 基类（`AcTrEntity.ts:364`）为 no-op 微任务，仅 `AcTrGroup.ts:400`、`AcTrGlyphEntity.ts:166` 真 await 时会残留。独立验证者**确认**，P1 维持。

**建议修复**：构造时克隆一次，mousemove 只更新几何/矩阵（或改走 `view.createEntityPreview + updateEntityPreview`）；用 rAF 合并同一帧内多次 mousemove；并对异步发布做「是否仍为当前预览」校验。

**验证者补充**：P1 维持。（严重问题章节详解）

---

### B14 命令输入期每次 mousemove 触发 12~15 次 getBoundingClientRect

**位置**：`cad-viewer/packages/cad-simple-viewer/src/editor/input/ui/AcEdFloatingMessage.ts:257-276`（另 `AcEdRubberBand.ts:92-94,209-213,303,337`、`AcEdBaseView.ts:1119`、`AcEdOSnapMarkerManager.ts:46`）

**频率/规模**：每次 mousemove 12~15 次 rect 读取；验证者修正**实际强制同步布局约 3~4 次**。

**问题与验证结论**：调用数属实：`AcEdFloatingMessage.ts:258-259` 读 host/container rect，`:261`/`:263` 经 `viewportToCanvas`/`viewportToContainer` 再读 canvas、container（`AcEdBaseView.ts:1007、1038`），随后 `:273-274` 写 style；`AcEdRubberBand.ts:92-94` 在 `212-213`、`303`、`337` 共 8 次；再加 `AcEdBaseView.ts:1119` 与 `AcEdOSnapMarkerManager.ts:46`，合计 12~15 次。独立验证者**确认调用数**。

**建议修复**：缓存 canvas/container 的 rect（`viewResize` 时失效），把布局读取集中到 rAF 一帧一次；橡皮筋/浮层用单个 `transform` 写入替代多次 rect 读取。

**验证者补充**：**P1→P2 下调**，因为「两读之间无写入不触发同步布局，实际强制重排约 3~4 次」，且橡皮筋仅在 `options.basePoint` 存在时生效、DOM 很小。修复方向仍成立。

---

### B15 OSNAP 标记每次 mousemove 销毁并新建 DOM 节点

**位置**：`cad-viewer/packages/cad-simple-viewer/src/editor/input/ui/AcEdFloatingInput.ts:355-372`（另 `AcEdOSnapMarkerManager.ts:37-51,69-72`、`AcEdMarker.ts:58,109`）

**频率/规模**：每次 mousemove 命中捕捉点时创建+销毁 1 个小 div 并触发一次样式重算；grip 拖拽期间 `AcEdGripEditSession.resolveWcs:103-113` 走同一路径。

**问题与验证结论**：`AcEdFloatingInput.ts:355-372` 每次 mousemove 先 `hideMarker()`（`AcEdOSnapMarkerManager.ts:69-72` 销毁节点）再 `showMarker()`（`:37-51` `new AcEdMarker`，`AcEdMarker.ts:58` `getComputedStyle`、`:109` `getElementById`、`:71` `appendChild`），随后 `worldToScreen+canvasToContainer` 再做一次 rect 读取。独立验证者**确认**，量级有限（每次 1 个小 div），维持 P2。

**建议修复**：每个 manager 复用一个 `AcEdMarker` 实例，mousemove 只 `setPosition`（必要时用已有的 set type 切换形状），无捕捉点时才 hide。

**验证者补充**：未下调。验证者指出**修复件已存在**：`AcEdOSnapMarkerManager.ts:56-63` 的 `repositionTop` 即「不重建只改位置」，目前仅被 `AcEdFloatingInput.ts:279` 调用，接入 mousemove 即可——这是本章改动量最小的交互热点修复。

---

### B16 OSNAP 每个候选实体重复执行一次 mask→模式数组转换

**位置**：`cad-viewer/packages/cad-simple-viewer/src/editor/input/AcEdOsnapResolver.ts:140-158`（`:147`，被 `:172-194` 调用）

**频率/规模**：每次 mousemove 对 `view.pick` 返回的每个实体（含 block children，缩小视图时可达数千）各一次 mask 转换 + 数组分配 + sysvar 读取；实体数 × 模式数（≤5）。

**问题与验证结论**：`AcEdOsnapResolver.ts:147` 的 `acdbMaskToOsnapModes` 位于 `collectOsnapPointsInAvailableModes` 内，被 `:172-194` 对每个实体/child 各调一次，`AcDbOsnapMode.ts:107-120` 每次新建数组。独立验证者**确认冗余分配成立**。

**建议修复**：在 `collectOsnapPoints` 入口把 `acdbMaskToOsnapModes` 结果算一次并向下传参。

**验证者补充**：未下调；但验证者**否决了评审员建议的「命中最高优先级即提前结束遍历」**：优先级在 `resolve():58-80` 才算出，提前退出会改语义。安全做法只是 `:147` 处算一次 `modes` 向下传参。主开销仍是每实体×≤5 次 `subGetOsnapPoints`，本项次要。

---

**本组优先级建议**

1. **B15 复用 OSNAP marker 实例**（近乎零风险、收益即时）：`repositionTop` 已存在，只需把 mousemove 路径从 hide/show 改为 reposition，可消除每个 mousemove 的 DOM 创建+销毁与样式重算。
2. **B16 `modes` 上移一次**（低风险）：一个参数传递改动即可消掉每 mousemove 数百至数千次数组分配；切勿同时按评审员原建议加提前退出，会改 OSNAP 语义。
3. **B14 rect 缓存 + rAF 合并布局读取**（中等收益、中等风险）：可把每 mousemove 的强制重排压到每帧一次；风险是缓存失效点（缩放、面板折叠、容器尺寸变化）需覆盖全，否则浮层/橡皮筋会错位。
4. **B13 grip 预览复用 clone + rAF 合并**（P1、收益最大）：同时解决深克隆与异步残留两件事，但涉及 transient 生命周期与 `asyncDraw` 竞态校验，建议在严重问题章节修复方案确定后一并落地。

---

## 四、空间索引与选择集

### B17 子索引构建用逐条 insert 而非接口自述的批量 load()

**位置**：`cad-viewer/packages/cad-simple-viewer/src/spatialIndex/AcTrHierarchicalSpatialIndex.ts:352-364`（`AcTrSpatialIndex.ts:64/70-84`、`createIndexBySize:391-399`）

**频率/规模**：INSERT/多区域 hatch 的子盒子可达数万（`AcTrView2d.ts:3061` 注释：单个 group 可能 >100,000 对象）；且图层重新打开会经 `convertMissingEntitiesOnLayer→batchConvert→registerEntitySpatialIndex→ensureChildIndex` 反复重建。

**问题与验证结论**：`existing.clear()` 后逐条 `existing.insert({ ...item })`，新建索引同样逐条 `insert`，与 `AcTrSpatialIndex.ts:71-75` 接口自述（`load` 建树快约 2-3 倍、查询性能好 20-30%）不符；`createIndexBySize(391-399)` 对 >100 项走 `AcTrRBushSpatialIndex`，其 `load(53-60)` 即 `tree.load` 并顺带填 `idMap`，语义等价。独立验证者**确认**，维持 P2。

**建议修复**：两条 `forEach` 改为 `spatialIndex.load(finiteItems)`（新索引为空树，正是 `load` 的最优场景）；已存在的子索引 `clear()` 后同样 `load()`，并去掉 `{ ...item }` 拷贝。

**验证者补充**：未下调。验证者补充了两条边界：`ensureChildIndex` 会被 `registerEntitySpatialIndex`（`AcTrLayout.ts:1072`）在每次 add/updateEntity 时重建；且 **≤100 项走 `AcTrLinearSpatialIndex`，其 `load(60-64)` 仍是循环 insert，无收益**——修复只对 >100 项的 RBush 子索引起效。

---

### B18 层次索引 window 模式对每个命中重复做全量子项遍历与分配

**位置**：`cad-viewer/packages/cad-simple-viewer/src/spatialIndex/AcTrHierarchicalSpatialIndex.ts:196-207, 218-233`

**频率/规模**：window 框选（左→右拖拽在 mouseup 判定）时每个命中一次 `child.search` + `child.all()` + `filter`；大图纸命中数千个带子索引的 INSERT，全部在 mouseup 主线程内完成。

**问题与验证结论**：window 时每个带 `childIndex` 的命中都先 `child.search(196)` + 新建 `{...hit}(197-200)`，再 `all()(227)`+`filter`+`every(232)`。独立验证者**确认事实成立**，但修正量级：window 独有的额外开销只是 `all()`+`filter` 一次全量子树物化，是各命中子项数**之和**而非「命中数×子项数」的乘积，属约 2 倍常数而非复杂度升级；`child.search` 与 `{...hit}` 在 crossing 下同样必需。

**建议修复**：一次遍历完成判定：取 `all()` 一次后在循环里同时判相交与全包含，去掉 `{ ...hit }` 复制。

**验证者补充**：**P2→P3 下调**。验证者还**否决了「原地挂 children 到命中对象」的写法**：`186-191` 直接 push 索引内同一 hit 对象，原地修改会污染索引。crossing（悬停拾取）路径不受影响。

---

**本组优先级建议**

1. **B17 子索引改 `load()`**（一行改动、低风险）：对 >100 项的子索引可直接兑现接口自述的 2-3 倍建树收益，且 `AcTrRBushSpatialIndex.load` 语义等价；代价是需保留 ≤100 项线性索引的既有行为。
2. **B18 window 判定合并为一次遍历**：可与 B17 同批改动，但必须保留 `{...hit}` 拷贝（否则污染索引）——即使降为 P3，其改动就在同一函数内，边际成本低。

---

## 五、Vue 响应式与 UI（每次选择变更 / 每次面板刷新）

### B19 属性面板为全部选中实体构建运行时属性树，实际只用第一个

**位置**：`cad-viewer/packages/cad-viewer-example/src/shell/panels/AntdPropertiesPanel.vue:93-102`（消费点 `:106`、`:204`）

**频率/规模**：每次选择变更（框选/全选 10 万~38.9 万实体）；38.9 万实体约 800 万个属性描述符 + 1600 万个闭包。

**问题与验证结论**：`:93-102` 对 `selectionSet` 全量 `forEach` 并 `push(entity.properties)`，而 `:106`/`:204` 只用 `list[0]`；`AcDbEntity.ts:641-646` 的 `properties` getter 每次新建 `AcDbEntityProperties`，`getGeneralProperties()`（`:855` 起）返回 7 个描述符、每个带 accessor get/set 闭包。`AntdCadViewer.vue:91-120` 右 sider 只改宽度、面板在 `v-if=editorReady` 内常驻，**折叠时也照样全量构建**。独立验证者**确认**，P1 维持。

**建议修复**：只解析第一个实体：`const id = selectionSet.value[0]; const entity = id != null ? modelSpace.getIdAt(id) : undefined`；多选数量用 `selectionSet.value.length`；后续若要展示多选公共属性，先按类型分桶再抽样。

**验证者补充**：P1 维持。（严重问题章节详解）

---

### B20 QuickSelect 每个下拉字段都在主线程全量扫描 modelSpace 并逐实体建对象

**位置**：`cad-viewer/packages/cad-viewer/src/composable/useQuickSelect.ts:196-222`（`MlQuickSelectDlg.vue:217-252`、`:265-277`、`AcEditor.ts:443-467`）

**频率/规模**：`collectSourceItems` 每次把 38.9 万实体包装成 `{id, entity}`（约 20MB 临时对象）；打开对话框或改动任一字段即触发 2~4 遍全图纸扫描；`color` 属性还会生成 38.9 万个字符串。

**问题与验证结论**：`:196-222` 全表包装 `{id,entity}`；`MlQuickSelectDlg.vue:217-252` 的 `objectTypeOptions`/`valueOptions`/`sourceCount`/`matchedCount` 四个 computed 各自调用一次，`matchedCount(:275)` 再走 `editor.selectAll`（`AcEditor.ts:443-464` 同样全表遍历并新建 38.9 万 id 的 `AcEdSelectionSet`）。独立验证者**确认**。

**建议修复**：在 `useQuickSelect` 内按 `(docId, applyTo, objectType)` 缓存一次 `collectSourceItems` 结果，`documentActivated` 时失效；`sourceCount` 用缓存长度；`matchedCount` 复用同一份 items 调 `filter.matches`，不再调 `selectAll`；候选值从同一份 items 派生。

**验证者补充**：**P1→P2 下调**，因为仅限用户主动打开对话框。验证者另发现一个**功能性副作用**：`:265-277` 的 immediate watch 在 `editorReady` 时（此刻为空图纸，`AcApDocManager.ts:481`）就缓存了 `valueOptions`，`documentActivated` 不会使其失效，首次打开 Value 下拉可能为空——修复缓存时应一并解决。

---

**本组优先级建议**

1. **B19 属性面板只取 `selectionSet.value[0]`**（P1、一行级改动、收益巨大）：从「每次选择变更建千万级对象」变成建 1 棵树；风险仅在多选语义（原本也只展示第一个，行为不变）。
2. **B20 QuickSelect 结果缓存**（中等收益）：把 2~4 遍全图扫描压到每个文档一次，并顺带修掉首次打开 Value 下拉为空的问题；风险是缓存失效点必须覆盖 `documentActivated` 与图纸内容变更。

---

## 六、导出管线（HTML/SVG/PDF，38 万实体规模）

### B21 HTML 快照 buildAsync 的让出点失效：osnap 目录构建整块同步执行

**位置**：`cad-viewer/packages/cad-html-plugin/src/AcApHtmlSnapshotBuilder.ts:130-154`（`:141` 让出、`:149-151` 同步构建 osnap；`AcExOsnapPrimitiveBuilder.ts:1315-1326、184-188、80、96、121、147-156、1329-1352`）

**频率/规模**：让出点只有每图层/每布局两次；38 万实体、尤其实体集中在单一图层 0 时循环只让出 **1 次**。

**问题与验证结论**：`:141` 每图层让出一次，`:149-151` 在该层循环之后同步执行 `buildOsnapCatalog`，而 `AcExOsnapPrimitiveBuilder.ts` 全文无任何 yield（grep 无命中），`:1315-1326` 递归遍历整张 BTR，`:80/:96/:121/:147-156` 每实体 `new THREE.Vector3/Matrix4`，`:1329-1352` circle/arc 还会 `new AcDbEllipse`。调用方 `AcApHtmlConvertor.ts:93-117` 用 `withBusyIndicator` 包住，覆盖层需要让出才能重绘。独立验证者**确认**，维持 P2（`:222` 的同步 `buildSync` 同理但非交互路径）。

**建议修复**：在 `buildOsnapCatalog` 的实体遍历中按批次调用 `accmYieldForPaint`（或移入可让出的分片调度），并把 osnap 构建放到图层几何收集之后单独让出。

**验证者补充**：未下调。表现为「用户以为卡死」，而非数据错误。

---

### B22 批次几何导出用 number[] 逐浮点 push，未按已知 vertexCount 预分配

**位置**：`cad-viewer/packages/cad-html-plugin/src/AcExSceneBatchCollector.ts:208-227`（同类问题另见 `262-282` `exportActiveBatchedLine2Slice`）

**频率/规模**：导出时每个 layer 的每个 batch 执行一次；38 万实体批量缓冲常达千万级浮点，峰值约为所需内存的 3 倍。

**问题与验证结论**：`:208-226` 用 `number[]` 逐 float `push` 后 `new Float32Array(activeFloats)`，`:262-282` 同样，并经 `:234-239` `appendSegmentFromAttribute` 对 `instanceStart/End` 各调用 `getX/getY/getZ` 两次；`:216` 已有 `info.vertexCount` 可先求和预分配（同文件 `:137` 的 `copyFloat32Range` 已是游标写法）。独立验证者**确认**。

**建议修复**：先遍历 active 槽位求和，一次性 `new Float32Array(total)` 并用游标写入；wide-line 分支直接读 `instanceStart/instanceEnd` 的底层 array。

**验证者补充**：未下调；验证者澄清「峰值放大部分是每次调用的瞬时开销（结果数组 + `number[]` 中间态），非全图常驻」，因此不构成常驻内存问题。

---

### B23 快照 base64 编解码逐字符拼接整段载荷字符串

**位置**：`cad-viewer/packages/cad-html-plugin/src/AcExSnapshotCodec.ts:58-73`（调用链 `encodeSnapshot:29-33` → `AcExHtmlPackager.ts:35、54`；运行时 `:87`）

**频率/规模**：每次导出；gzip 后载荷可达数十 MB，逐字节构造 JS 字符串后再 `btoa` 生成 4/3 大小副本。

**问题与验证结论**：`:58-64` 逐字节 `+=` 构造 `binary` 后 `btoa`，`:66-72` `atob` 后逐字符写 `Uint8Array`；`packHtml` 把 payload 内联进 `:54` 的模板字符串，`decode` 侧 `base64ToUint8` 反向构造。独立验证者**确认**，但修正一处量级：V8 的 `+=` 是摊还 O(N) 而非 O(N²)，故「秒级阻塞」偏保守，主要成本是内存放大（binary 字符串 2 字节/字符 + base64 4/3 副本）。

**建议修复**：改为分块处理：每次取 8192 字节用 `String.fromCharCode.apply` 或分片拼接，或用 fflate 的 `strToU8/strFromU8` 配合分片 `btoa`；导出侧可考虑改用 Blob+URL 而非内联 base64。

**验证者补充**：未下调，P2 合理。

---

### B24 SVG/PDF 导出把整张图纸拼成单个字符串，峰值约为文档体积的 2-3 倍

**位置**：`cad-viewer/packages/cad-svg-plugin/src/AcSvgRenderer.ts:315-362`（PDF 侧 `cad-viewer/packages/cad-pdf-plugin/src/AcApPdfConvertor.ts:56-78`）

**频率/规模**：每次导出；38 万实体（每实体数百字节 markup）时 SVG 字符串可达数百 MB；PDF 路径元素数 = 实体数 + 段数。

**问题与验证结论**：`AcSvgRenderer.ts:316-326` 收集 `parts` 后 `join`，`:349-360` 再套进模板字符串整体返回；每个实体另持有 `_localSvg`（`AcSvgEntity.ts:70-72`），故峰值**高于**评审员原估算（parts 引用 + join 串 + 模板串 + Blob 展平）。PDF 侧 `AcApPdfConvertor.ts:56-58` 用 `DOMParser` 把整串解析为元素树，`:73` `svg2pdf` 主线程逐元素转换。独立验证者**确认**，P2 保留（「数百 MB」为数量级估计）。

**建议修复**：导出改为流式/分块：分批 `renderSvg` 后写入 Blob 分片数组（`new Blob(parts)` 支持多段而不必 `join`），PDF 侧先用 `DocumentFragment`/`innerHTML` 增量解析或分页转换；确需整体字符串时设上限并给出进度。

**验证者补充**：未下调。冷路径但用户可触发，且正是 38 万实体目标场景，浏览器标签页极易 OOM。

---

### B25 智能体验证截图对全部模型空间实体做同步预览提取，单条消息最多重复 5 次

**位置**：`cad-viewer/packages/cad-agent-plugin/src/agent/drawingPreviewCapture.ts:17-21, 53-54`（`AcApEntityPreviewConvertor.ts:73-143`、`AcTrLayout.ts:588-601、655-720`、`AcTrBatchedGroup.ts:431-474`）

**频率/规模**：目标图纸 38 万实体时每次调用遍历/克隆 38 万实体的 overlay 几何；高推理模式下每轮一次，失败时 `MAX_VERIFICATION_ATTEMPTS=5` 次/条消息。

**问题与验证结论**：`drawingPreviewCapture.ts:17-21/53-54` 取全部 `modelSpace` id；`AcApEntityPreviewConvertor.ts:73-143` 的 `capture` 为**同步方法**（无 yield），经 `AcTrScene.ts:557-575`→`AcTrLayout.ts:588-601` 对每个 id 单独算包围盒、`AcTrBatchedGroup.ts:431-474` 按 slot 全量遍历 batch（约 O(实体数×slot 数)），`:655-720` 再对全部 id 建 preview 子集。`AgentChatPanel.vue:87` 默认 high-inference，`createCadAgent.ts:246-258` 每轮调用。独立验证者**确认**，维持 P2。

**建议修复**：不要用全量 model-space id：优先复用当前视图 canvas 截图，或只取本轮工具创建/修改的实体 id（`draw_*` 已返回 `entityIds`）；必要时对 id 分批并 `accmYieldForPaint` 让出主线程。

**验证者补充**：未下调。主线程长时间独占（`capture` 非 async），属交互可感知的卡顿。

---

### B26 SVG lineSegments 每段输出一个 `<line>` 元素并重复整套样式属性

**位置**：`cad-viewer/packages/cad-svg-plugin/src/AcSvgLineSegments.ts:22-43`（`AcSvgStyleUtil.strokeAttributes:52-69`）

**频率/规模**：markup 体积约为等价单条 `<path d="M…L…">` 的 5-10 倍；段数上限估计为百万级。

**问题与验证结论**：`:22-40` 每两索引生成一个 `<line>` 并展开 `strokeAttrs`（至少含 stroke/fill/stroke-width/vector-effect 4 个属性），`:42` `join` 后存入 `_localSvg`。独立验证者**确认写法问题**，但**修正了前提**：全仓 `lineSegments()` 调用者仅 `AcDb3dSolid.ts:356/390`、`AcDbFace.ts:290`、`AcDbTable.ts:686`，普通折线/圆弧不走此路径，故「百万级段数」属上限估计。

**建议修复**：合并为单个 `<path>`（`M x1,y1 L x2,y2 …`）或按样式分组输出 `polyline`/`path`，属性只写一次。

**验证者补充**：维持 P3。与 B24 的字符串内存问题叠加，但触发面比评审员原描述窄。

---

**本组优先级建议**

1. **B21 osnap 目录构建分片让出**（收益直接可感知）：可解决「单图层 38 万实体导出时忙碌指示器卡死」；风险是 `buildOsnapCatalog` 递归遍历的让出点需正确处理 async 化，改动涉及导出主链路。
2. **B24 SVG/PDF 改 Blob 分片/增量解析**（防 OOM）：这是 38 万实体导出最容易直接 OOM 的一条；改动较大（渲染器返回结构变更），建议先设规模上限 + 进度提示作为过渡。
3. **B22 几何导出预分配 `Float32Array`**（低风险、纯内存优化）：`:216` 已有 `vertexCount`，按同文件 `copyFloat32Range` 的游标写法改写即可，可去掉约 3 倍峰值。
4. **B23 base64 分块编解码**（低风险）：改动局限在 codec 两个函数内，处理数十 MB 载荷时降低内存尖峰。
5. **B26 合并 `<line>` 为 `<path>`**：与 B24 同域，可一并实施以直接减小 markup 与字符串峰值；注意避开 「`lineSegments` 仅用于 3DSOLID/FACE/TABLE」的实际调用面。

---

## 七、资源生命周期与内存泄漏（监听器、纹理/几何、缓存上限）

### B27 AcApDocManager.destroy() 不销毁视图：rAF 循环永不停、Stats DOM 与已实现的 teardown 入口全部零调用

**位置**：`cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:625-632`（`AcTrView2d.ts:2295/2344/2364-2365`、`AcApProgress.ts:232`、`AcEdHoverController.ts:174`）

**频率/规模**：每次宿主卸载/重挂载（`useAntdCadShell.ts:305`、HMR、路由切换、示例 QUIT 后重开图）泄漏一份完整视图对象图 + 定时器 + DOM + WebGL 上下文。

**问题与验证结论**：`destroy()` 只做 `unloadAllPlugins`/`doc.destroy`/`uninstallOpenFileDialog`/`AcTrMTextRenderer.resetInstance` 并把 `_instance` 置空，从不触碰 `:507` 构造的 view；`AcTrView2d.ts:2365` 的 `animate` 自续 rAF、`:2295` 的 `stopAnimationLoop()` 全仓 **0 调用**；`:338` canvas、`:688` CSS2D、`:2340` stats DOM 均无移除路径；`:362/:390/:406` 与 `AcApContext` 在静态单例上的监听无解绑；`AcApProgress.destroy(:232)`、`AcEdHoverController.dispose(:174)` 同样 0 调用；`:533-540` `acapBindCommandServices` 把闭包写到模块级全局。独立验证者（csv-cmd 域与 lifecycle 域各一位）**确认 P1**，并指出注释自述 "Destroy the view" 属契约违反。

**建议修复**：给视图/toolbar/进度层补 dispose 路径并在 `destroy()` 中调用：`view.stopAnimationLoop()` + 解绑单例监听（改具名 handler）+ dispose renderer + 从 container/body 移除 canvas/CSS2D/stats DOM；`_openFileProgress`/`_busyIndicator` 调 `AcApProgress.destroy()`；新增 `acapUnbindCommandServices()` 并在 `destroy()` 调用。若有意不支持重建，则 `destroy()` 后应禁止 `createInstance`。

**验证者补充**：两个域均维持 P1，无下调。这是本次评审中复用度最高的泄漏根因（B28/B31/B32/B37 都是它的下游）。（严重问题章节详解）

---

### B28 视图/编辑器无析构路径：ResizeObserver 与进程级单例监听永久泄漏

**位置**：`cad-viewer/packages/cad-simple-viewer/src/editor/view/AcEdBaseView.ts:331-340`（另 `:316-329`、`AcEdHoverController.ts:174`、`AcEdCursorManager.ts:94`、`AcEdInputManager.ts:165`）

**频率/规模**：每次 `createInstance`/`destroy` 都泄漏一整个视图（ResizeObserver 由 document 保活 → debounce 闭包引用 `this`）。

**问题与验证结论**：构造函数只把 `ResizeObserver` 存在局部 `const` 里（`:331-340` observer 仅局部，canvas 监听 `:316-329` 匿名），`AcEdBaseView`/`AcTrView2d.ts:139` 均无 `dispose`；`AcEdCursorManager.ts:94` 在永不重置的 `AcDbSysVarManager.instance()` 上挂匿名闭包（持 `_view`），`AcEdInputManager.ts:165` 在 `AcApSettingManager.instance()` 同理且无 dispose；`AcEdHoverController.ts:174` 的 `dispose()` 全仓零调用，其 hover/pause `setTimeout` 可能在视图销毁后仍触发 `host.pick`。独立验证者**确认 P1**，属硬泄漏。

**建议修复**：为视图/编辑器补 `dispose()`：保存 bound handler 与 ResizeObserver 实例并在销毁时 `removeEventListener`/`disconnect`；`AcEditor` 级联到 cursorManager/inputManager/hoverController（含 `hoverController.dispose()`）；`AcApDocManager.destroy()` 中调用 `view.dispose()`。

**验证者补充**：P1 维持。（严重问题章节详解）

---

### B29 进程级单例 AcDbSysVarManager 上的监听无退订句柄，且旧数据库被闭包长期持有

**位置**：`cad-viewer/packages/cad-simple-viewer/src/app/AcApContext.ts:116-138`（`:66/77/95/106/111/140/147/152`；`AcDbSysVarManager.ts:117-123`、`AcApDocument.ts:287-295`）

**频率/规模**：销毁后任何一次 SETVAR/LWDISPLAY 变更即触发一次 O(N) 重派发（当前库 38 万实体）到已废弃场景，主线程抖动。

**问题与验证结论**：`AcApContext.ts` 共 9 处 `addEventListener`、**0 处 remove**；`:116` 挂在进程级单例 `AcDbSysVarManager.instance()`（`:117-123` 静态单例，全仓无 reset）上，闭包捕获 view/doc/database；`AcApDocManager.ts:627` 仅 `doc.destroy()`，`AcApDocument.ts:287-295` 不清库。对照 `AcApLayerStore.ts:64/72`、`AcEdGripManager.ts:214/232` 均有配对 remove，属遗漏。独立验证者**确认 P1**。

**建议修复**：`AcApContext`/`AcTrView2d` 保存每个监听句柄并提供 `dispose()`，由 `AcApDocManager.destroy()` 调用；`AcApDocument.destroy()` 增加 database 释放（`clear()`）。

**验证者补充**：P1 维持，但**修正了评审员原文的一处事实**：`regen` 作用于 `args.database`（当前库），影响是「每次 LWDISPLAY 重复一次 O(N) 派发」，而**不是**对旧场景重派发。（严重问题章节详解）

---

### B30 `_pendingGlyphKeys` 无上限且文档切换不清理，与字形模板缓存的 LRU 上限不对称

**位置**：`cad-viewer/packages/three-renderer/src/renderer/AcTrMTextRenderer.ts:76, 451-464, 484-500`（另见 lifecycle 域引用的 `:220-227`；对照 `AcTrMTextGlyphCache.ts:23-24`）

**频率/规模**：文本渲染热路径（打开文档时按实体数发生，中文图纸常达数万至数十万条唯一文本）；大小等于「文本+样式+颜色」不同组合数，单键数百字节至 KB 级。

**问题与验证结论**：`:456-460` 的 `occurrences===1` 分支只 `set(1)` 不 `delete`，仅第 2 次（`461`）或 `invalidateGlyphCache`（`469-475`）才清；真正的模板缓存已有 512 条/16MiB 上限（`AcTrMTextGlyphCache.ts:23-24`）。`registerWorkers` 只在 `AcApDocManager.ts:568` 构造期调用，`openDocument` 不做 MText 清理，同一实例多次开图键无界累积。`:484-500` 注册到 `FontManager.instance.events.fontLoaded` 的 `onFontLoaded` 在 `dispose()`（`403-414`）中确未移除。两个域各自**确认**：tr-render 域维持 **P1**，lifecycle 域维持 **P2**（该域聚焦跨文档增长部分）。

**建议修复**：把 `_pendingGlyphKeys` 改为 `Set` 并在消费后清理，或让其复用 `_glyphCache` 的预算；新增 `clearDocumentState()` 由 `AcTrRenderer.dispose()`/`AcTrView2d.clear()` 调用；`dispose()` 中同时 `removeEventListener` 掉 `_fontLoadedListener`。

**验证者补充**：两域严重度不同（P1 / P2）源于切入角度：tr-render 域关注同一实例跨图累积（保留 P1），lifecycle 域关注单文档内条目无上限（P2）。验证者指出 `destroy():629 resetInstance` 会清，故泄漏发生在「同一会话内反复 openDocument」路径。（严重问题章节详解）

---

### B31 布局视图/视口视图永不回收：每个视图都向共享 canvas 挂一个 OrbitControls

**位置**：`cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2413-2429`（`AcTrLayoutViewManager.ts:30/108`、`AcTrLayoutView.ts:156-165`、`AcTrBufferGeometry`… 另 `cad-viewer/packages/three-renderer/src/viewport/AcTrBaseView.ts:41-54, 287-306`）

**频率/规模**：泄漏量≈布局数 + 视口数×重开次数；VPORT 重转换时按 `viewport.id` 覆盖旧实例，旧控制器监听永留。

**问题与验证结论**：`AcTrBaseView.ts:287-306` 构造器即 `new OrbitControls(camera, 共享 canvas)`；three@0.172 的 `OrbitControls.js:196-203` 构造即 `connect()` 注册 4 个 canvas 监听 + **document 级 keydown capture**，仅 `:211-222` 可摘除，而全仓 grep 无 `controls.dispose()`。`AcTrLayoutViewManager.ts:30/108` 仅 `add` 无 `delete`/`clear`；`AcTrView2d.ts:691` 只构造一次、`clear():2219-2235` 不重置，`addLayout:2094-2098` 再建；`:2964-2971` 每次 VPORT 转换 `new AcTrViewportView` 覆盖；`AcTrLayoutView.ts:165` 的 `removeViewport` 全仓 0 调用。独立验证者（lifecycle 域、tr-render 域）均**确认**。

**建议修复**：`AcTrBaseView` 增加 `dispose()`（`_cameraControls.dispose()`）；`AcTrLayoutViewManager` 增加 `clear()`/`delete(btrId)` 并遍历视图 dispose；`AcTrView2d.clear()`/`bindDrawDatabase` 时按新文档 btrId 重建 `_layoutViewManager`；VPORT 实体擦除/更新时调用 `removeViewport` 并 dispose 旧 `AcTrViewportView`。

**验证者补充**：两域均 **P1→P2 下调**。lifecycle 域理由：被持留对象仅为相机+控制器+监听；tr-render 域理由：`ensureViewportViews` 有 `viewportCount===0` 守卫（`:2490`）、layout view 由 `getAt` 复用不重建，且仅 destroy/create 循环才新增 canvas。

---

### B32 AcTrRenderer.dispose() 不解绑 FontManager 单例监听，也不释放注入的 WebGLRenderer

**位置**：`cad-viewer/packages/three-renderer/src/renderer/AcTrRenderer.ts:147-152, 667-670`

**频率/规模**：每个 destroy/create 周期泄漏一份渲染器与一个 WebGL 上下文（Chrome 约 16 个上下文上限后开始丢最旧上下文）。

**问题与验证结论**：`:147-152` 以**无引用内联箭头函数**订阅全局单例 `FontManager.instance.events.fontNotFound/fontLoaded`；`AcCmEventManager.addEventListener` 返回 void、无法移除，故 FontManager 永久持有每个 `AcTrRenderer`，连带其 `AcTrStyleManager` 全部缓存材质、`AcTrRenderContext` 与 `THREE.WebGLRenderer`（GPU program/纹理）都无法回收。`dispose()`（`667-670`）只清 `styleManager`/`missedFonts`，全仓无 `WebGLRenderer.dispose()`/`forceContextLoss`。独立验证者**确认**。

**建议修复**：构造时用命名函数（或封装返回 off 句柄）保存监听引用，`dispose()` 里对两个事件 `removeEventListener`；同时 `dispose()` 内调用 `this._renderer.dispose()`（按需 `forceContextLoss()`），明确 `WebGLRenderer` 生命周期归属 `AcTrRenderer`。

**验证者补充**：**P1→P2 下调**：`destroy()`（`625-632`）还调用了 `doc.destroy()` 与 `AcTrMTextRenderer.resetInstance()`，且正常重开文档走 `AcTrView2d.clear()` 复用同一 `AcTrRenderer`、不新增监听，泄漏仅在 `createInstance`/`destroy` 循环（`useAntdCadShell.ts:305`）。

---

### B33 批次 dispose 不释放高亮掩码 DataTexture（GPU 纹理泄漏）

**位置**：`cad-viewer/packages/three-renderer/src/batch/AcTrBatchedMixin.ts:1270-1274`（`AcTrBatchHighlightState.ts:60` `maskTexture`，全文无 dispose 方法）

**频率/规模**：每次文档/布局切换按批次累积；单个 DataTexture 宽可达 4096、RGBA。

**问题与验证结论**：mixin `dispose()`（`1270-1274`）只置 `userData.batchDisposed` 与 `geometry.dispose()`，从不触 `_highlightState`（字段 `914`）；通读 `AcTrBatchHighlightState` 421 行**无 dispose**，`maskTexture`（`60`）仅在 `303` 重分配时释放；`AcTrBatchedGroup.clear():483` 逐批 dispose。验证者指出 three 的 `WebGLRenderer.dispose` 仅 `properties.dispose()`（weakmap 重置），**不 `gl.deleteTexture`**，故布局/文档切换会累积。独立验证者**确认**，维持 P2。

**建议修复**：`AcTrBatchedMixin.dispose()` 中加 `this._highlightState.dispose()`（内部 `this.maskTexture?.dispose(); this.maskTexture=null`，清空掩码与 dirty/pending 状态），并在 `AcTrBatchedGroup.clear()` 的批次 dispose 路径复用。

**验证者补充**：未下调。依赖 `AcTrBatchHighlightState` 新增 dispose API，改动小但需保证 dirty/pending 状态一并清理，避免复用时残留。

---

### B34 useSystemVars 在进程级 sysVarChanged 单例上注册监听且从不注销

**位置**：`cad-viewer/packages/cad-viewer/src/composable/useSystemVars.ts:150-186`（调用点 `AntdStatusBar.vue:127`、`MlPointStyleDlg.vue:64`）

**频率/规模**：每次「退出→再开图」线性累积监听与已销毁组件的 `reactiveSystemVars`；每个调用点 +2 个监听。

**问题与验证结论**：`:146-189` 两个匿名监听、全文件**无 `onScopeDispose`**；`AcDbSysVarManager.ts:116-122` 的静态 `_instance` 从不重置，`AcApDocManager.destroy()`（`:625-632`）也不摘除；示例 quit（`quitCmd.ts:10` → `App.vue:162` v-if 卸载 → `useAntdCadShell.ts:305` destroy）后每次重开图确实新增。同仓 `useLayers.ts:486`、`useLayerFilters.ts:322` 已用 `onScopeDispose`，本文件为唯一漏项。独立验证者**确认**，维持 P2。

**建议修复**：把两个监听提为具名 handler 并在 `onScopeDispose` 中 `removeEventListener`（与 `useLayerFilters.ts:322` 一致）；或改为模块级单次注册 + `isInitialized` 守卫。

**验证者补充**：未下调。验证者修正了调用面：`MlSysVarToggleButton` 仅导出、仓库内无调用点，实际每壳层只有 `AntdStatusBar:127` 与 `MlPointStyleDlg:64` 两处，残留量有限。

---

### B35 useLayouts 在全局 layoutManager 单例上注册匿名 layoutSwitched 监听且从不注销

**位置**：`cad-viewer/packages/cad-viewer/src/composable/useLayouts.ts:35-51`（`AcDbHostApplicationServices.ts:51-52、121-131`、`AntdStatusBar.vue:126`）

**频率/规模**：每次壳层挂载 +1（另有 `:35` 的 `documentActivated` 匿名监听）；切换布局时按残留份数重复执行。

**问题与验证结论**：`:35-51` 两个匿名监听、无 `onScopeDispose`；`layoutManager` 存于静态 `AcDbHostApplicationServices.instance`（仅首次创建、无重置点），不随 `AcApDocManager.destroy()` 释放；`App.vue:162-164` 的 quit→重开图确会重建壳层。独立验证者**确认**，维持 P2。

**建议修复**：保存具名 handler，`onScopeDispose` 中 `removeEventListener`（`editor.events.documentActivated` 与 `layoutManager.events.layoutSwitched` 都要），与 `useLayers` 的清理方式对齐。

**验证者补充**：未下调。验证者对残留规模的判断是「仅少量 layout 对象、切换布局时开销很小」，故**维持 P2 而非更高**；修复是标准 `onScopeDispose` 配对。

---

### B36 示例壳层的选择/文档监听在组件卸载时不注销

**位置**：`cad-viewer/packages/cad-viewer-example/src/shell/ribbon/AntdPropertyBar.vue:159-188`（另 `AntdLayerSelect.vue:378-405、447`）

**频率/规模**：二者位于 `AntdRibbon.vue:99-116` 的 `v-for=panel` + `v-if` 内，**每次切换 ribbon 页签即卸载重挂**；每个残留 `selectionAdded` 都执行 `AcEdSelectionSet.ts:84-86` 的 `Array.from(_ids)`（整份 id 拷贝）。

**问题与验证结论**：`AntdPropertyBar.vue:162-163、217` 注册 3 个监听，`onUnmounted(:187、238)` 只停定时器，全文件无 `removeEventListener`；`AntdLayerSelect.vue:381-382、426` 同样。同仓 `cad-viewer/src/composable/useSelectionSet.ts:31-35` 是成对 remove，示例与库的清理约定不一致。独立验证者**确认**，并修正评审员原文「5 个监听」不准确（`AntdLayerSelect` 仅 3 个直接监听，`useLayers` 部分已由 effectScope 清理）。

**建议修复**：把 events 与 handler 保存下来，在 `onUnmounted` 中成对 `removeEventListener`（`selectionAdded`/`selectionRemoved`/`documentActivated`），并把 `selectionBound`/`documentBound` 与移除逻辑成对维护。

**验证者补充**：**P3→P2 上调**——本章唯一被验证者**上调**的条目。理由：泄漏落在同一存活的 `selectionSet` 上，且每逢页签切换就触发整份 id 数组拷贝，频率远高于其他「每次挂载」类泄漏。

---

### B37 AcApDrawStyleToolbar.dispose() 无调用点，destroy 后泄漏 capture 监听与 DOM

**位置**：`cad-viewer/packages/cad-simple-viewer/src/ui/AcApDrawStyleToolbar.ts:403-421`（另 `:374`、`:387-390`、`:394`；`app/AcApDocManager.ts:512, 625-632`）

**频率/规模**：每次 destroy/重建 +1 个 document capture 监听；旧工具栏 DOM 留在旧容器中。

**问题与验证结论**：构造函数注册 document `pointerdown` capture（`:366-374`）、editor `commandWillStart/Ended`（`:387-390`）、`AcApSettingManager` listener（`:394-396`），只有 `dispose()` 能移除；但 `dispose`（`:403-421`）全仓无调用点，只有 `ui/index.ts:4` 导出与 `AcApDocManager.ts:512` 的 `new`，`destroy()`（`625-632`）不回收。独立验证者**确认**。

**建议修复**：在 `AcApDocManager.destroy()` 中调用 `this._drawStyleToolbar.dispose()`；注意公开 getter 允许宿主自行调用，因此该 dispose 目前只是「可能被外部调用」。

**验证者补充**：**P2→P3 下调**：`:367` 的 `if (!this.colorPanelOpen) return` 使残留 capture 监听基本空转，旧 DOM 随旧容器不可见，影响有限；与 B27 同源，建议在 `destroy()` 中顺带调用 `dispose`。

---

### B38 AcDbSymbolTable.add 同名记录直接覆盖且不释放旧句柄，旧对象永久驻留 handleRegistry

**位置**：`cad-viewer/packages/data-model/src/database/AcDbSymbolTable.ts:99-111`（对比 `object/AcDbDictionary.ts:94-107`；`removeAll:198-207`、`AcDbDatabase.ts:1074-1082`）

**频率/规模**：触发需重名记录（`AcDbDxfDocumentReader.ts:368/377` 等 add 前不查重），每条仅泄漏 1 个对象。

**问题与验证结论**：`:99-106` 确为 `Map.set` 直接覆盖，无 `AcDbDictionary.setAt:94-107` 那样的 `releaseObjectHandle(旧值)`；`removeAll:198-207` 只遍历 map + `_unnamedRecords`，旧记录永久留在 `_handleRegistry`，`getObjectById(旧 id)` 仍可解析，`registerBootstrapHandles` 仅构造/重置时调用（`:521`、`:3336`），解析结束无句柄清扫。独立验证者**确认**。

**建议修复**：`set` 前取 `existing`，若存在且不是同一对象则 `releaseObjectHandle(existing)`（在事务录制时按需记录 remove/append）。

**验证者补充**：**P2→P3 下调**：需重名记录才触发，单条泄漏 1 个对象，绝对量级小。

---

### B39 AcTrBufferGeometryUtil.computeLineDistance 对仍在使用的 geometry 调用 dispose()

**位置**：`cad-viewer/packages/three-renderer/src/util/AcTrBufferGeometryUtil.ts:249-296`（调用点 `AcTrLine.ts:64`、`AcTrLineSegments.ts:59`）

**频率/规模**：每个非批处理的 `AcTrLine`/`AcTrLineSegments` 实体转换时调用一次。

**问题与验证结论**：`:252-257`/`:293-294` 事实成立：未索引时**先 `dispose` 再赋回同一 geometry**；索引时 dispose 的是 `toNonIndexed` 前的原几何（代码 `TODO` 自认可能被共享）。独立验证者**确认代码事实**。

**建议修复**：仅在确实替换成新几何体（`toNonIndexed` 返回新对象）时 dispose 旧对象，并用 `userData`/引用计数确认无其它对象共享；`geometry === line.geometry` 时不要 dispose。

**验证者补充**：**P2→P3 下调**：唯一调用方都在实体构造期、入场景渲染前执行，几何体从未上传，`dispose()` 此时无 GPU 属性可删，属 **no-op**；评审员所称「多余上传」不成立，共享仅为 `:259` TODO 推测。

---

### B40 AcTrEntityPreview.disposeObjectTree 释放了与原对象共享的 geometry

**位置**：`cad-viewer/packages/three-renderer/src/renderer/AcTrEntityPreview.ts:330-339, 167-176, 576-582`

**频率/规模**：潜在缺陷；现网两个调用方 `ownsClone` 恒为 false，`dispose` 分支不可达。

**问题与验证结论**：`:334-338` 的 `clone(true)` 只复制节点，geometry/material 仍是同一引用（对照 `AcTrMTextGlyphCache.ts:239-251` 专门 clone 几何体），而 `:167-171` 在 `ownsClone` 时于 `finally` 中调用 `disposeObjectTree`（`:576-582`），对 traverse 出的每个 mesh 执行 `geometry.dispose()`。独立验证者**确认**该缺陷存在。

**建议修复**：让 `prepareDrawable` 同时克隆叶节点 geometry（或只 dispose 本次 capture 自己创建的 geometry，用标记位区分），与 `clonePlacedMTextTemplate` 的隔离策略保持一致。

**验证者补充**：**P2→P3 下调**：两个真实调用方 `AcApBlockPreviewConvertor.ts:135`、`AcApEntityPreviewConvertor.ts:115` 传入的根均 `parent==null`（`AcTrLayout.ts:702` 新建 Group；`AcDbRenderingCache.get` 返回 `fastDeepClone`），`ownsClone` 恒 false，`dispose` 分支**现网不可达**；仅在外部按 `AcTrRenderer.ts:636-642` 传场景内对象时触发。

---

### B41 搜索面板的防抖定时器未在组件卸载时清理，面板关闭后仍会全量扫描模型空间

**位置**：`cad-viewer/packages/cad-search-plugin/src/ui/SearchPanel.vue:82-92`（`textSearch.ts:130-141、211-226`、`AntdCadViewer.vue:59-63`）

**频率/规模**：每次快速切换面板最多一次全量扫描（200ms 内切换/关闭时触发）。

**问题与验证结论**：`SearchPanel.vue:82-92` 无清理、全文**仅 `onMounted(142-144)`**、无 `onUnmounted`；卸载后 pending 的 200ms 定时器仍执行 `searchTextItems(value)`，走 `textSearch.ts:130-141/211-226` 全量 `collectTextItems`（38 万实体逐文本建对象 + `toLowerCase` + `fuzzyMatch`）并写入已卸载组件的 ref。挂载点为 `AntdCadViewer.vue:59-63`（`v-else-if`）与 `:170`，切页签即卸载。独立验证者**确认**。

**建议修复**：在 `onUnmounted`（或 `onBeforeUnmount`）中 `clearTimeout(debounceTimer)` 并置 `undefined`。

**验证者补充**：**P2→P3 下调**：定时器只延迟 200ms 且只触发一次，属短暂持有闭包而非持久泄漏，影响是一次多余扫描；但修复成本一行，仍**值得修**。

---

**本组优先级建议**

1. **B27 + B28 建立统一 `dispose()` 链**（P1、收益最大）：`AcApDocManager.destroy()` → `view.dispose()` → editor/cursor/input/hover、renderer、DOM/Stats、rAF 全链路拆除。它是 B32/B37 等条目的共同上游；风险在于生命周期语义变化（是否允许重建）需先定契约。
2. **B32 FontManager 监听改具名 + `WebGLRenderer.dispose()`**（低成本、防上下文耗尽）：Chrome 约 16 个 WebGL 上下文上限，超过后会丢最旧上下文；改动集中在构造函数与 `dispose()`。
3. **B34 / B35 / B36 Vue 监听补 `onScopeDispose`/`onUnmounted`**（低风险、模式统一）：三处都是匿名监听漏清理，按同仓 `useLayerFilters.ts:322`、`useSelectionSet.ts:31-35` 的既有写法对齐即可；B36 因页签每次卸载重挂已被上调至 P2，建议优先。
4. **B31 视图/控制器 dispose**（P2、依赖第 1 条）：在 `AcTrBaseView` 增加 `dispose()` 并在布局/视口覆盖前调用；关键是 `AcTrLayoutViewManager` 补 `clear()`/`delete()`，否则监听数仍随重开次数增长。
5. **B33 高亮 DataTexture dispose**（P2、独立小改动）：新增 `AcTrBatchHighlightState.dispose()` 并在 mixin dispose 中调用，可与 B40/B39 一并作为「几何/纹理生命周期清理」批次处理。

---

## 八、并发与竞态（重复打开文档、命令排队、后台任务）

### B42 openDocument/openUrl 无重入（in-flight）保护，第二次打开会与第一次交错解析同一个 AcDbDatabase

**位置**：`cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:923-944`（`openUrl:890-903`、`newDocument:1080-1105`；`AcDbDatabase.ts:2182`、`AcDbNativeDxfConverter.ts:448`）

**频率/规模**：95MB/38 万实体下打开窗口持续数秒，期间可二次触发；表现为首份图纸半途丢实体、进度条回退或 db 内容混杂。

**问题与验证结论**：`openDocument`（`:923-944`）与 `openUrl`（`:890-903`）都没有 in-flight 判断，也没有可等待的 promise；打开全程复用同一个 `AcDbDatabase` 实例（注释 TODO 自认不新建 context）与同一个 converter（`runner/main.ts:187` 注册 `AcDbNativeDxfConverter`），而该 converter 在 `read` 里写实例状态（`AcDbDatabaseConverter.ts:448` `this.progress = progress`），并发 read 必然互相覆写。触发路径：打开期间在命令行执行 OPEN（`AcApOpenCmd.ts:14-16` 只 emit `open-file` 即返回，命令栈不把读盘算作 active command），或宿主直接调用公开 API/脚本；二次打开先走 `onBeforeOpenDocument→curView.clear()`（`:1658`，`_convertEpoch++` 丢弃在途转换）并重置进度。lifecycle 域补充：`AcDbDatabase.read` 首行 `clear()`（`AcDbDatabase.ts:2182` → `:3315 blockTable.removeAll`）会把第一次已提交的实体清空，同时两次 `beginEventBatch` 复用 `_eventBatchDepth`（`:735-737`），`endEventBatchChunked` 因 depth≠0 直接 return（`:764-774`），实体事件推迟到第二次结束时一次性派发 → 场景混入两份图纸。两个域均**确认**。

**建议修复**：在 `AcApDocManager` 内加 `_openInFlight?: Promise<boolean>` 守卫（进行中时拒绝或排队第二次 open），或提供 abort 语义取消前一次；`AcDbDatabase.read` 检测 `isReading` 时拒绝；解析各 await 之后校验 generation，过期结果整体丢弃；同时把 OPEN 命令的 active 生命周期延伸到文件选择+读取完成。

**验证者补充**：lifecycle 域 **P1→P2 下调**（csv-cmd 域原评级即 P2）：遮罩 `AcApProgress.ts:352-359` 为 `pointer-events:auto` 挡鼠标，需用户**键入**第二次 OPEN 或宿主二次调用 API；示例 ribbon 有 disabled 排队（`AntdRibbon.vue:454`），但库级 API 缺守卫。

---

### B43 worker 池成功/错误路径永不释放 worker：`releaseWorker` 包装器是死代码

**位置**：`cad-viewer/packages/data-model/src/converter/worker/AcDbWorkerManager.ts:121-134, 148-170, 248-255`

**频率/规模**：池达到 `maxConcurrentWorkers` 后每次 `execute` 都走 `getAvailableWorker` 的 'Reuse oldest worker' 分支（`237-242`）；表现是任务串行化 + 排队任务误报 `worker_timeout`。

**问题与验证结论**：`:107` Promise 执行器的 `resolve` 被 `152/158` 直接调用，带 `releaseWorker` 的包装器（`122-131`）**全文件无调用点**（grep `resolve` 仅 `107/115/122/125/152/158/169`，`284` 行的 `destroy` 只调 `task.reject`）；成功/错误路径确实不释放 worker，仅 `112-118` 超时路径释放。后果是任何成功/失败任务都让 worker 永久 `isBusy=true`，且超时从 `postMessage` 时刻起算。独立验证者**确认契约已破**（`AcDbWorkerManager.spec` 已按 5 任务/1 worker 序列跑）。

**建议修复**：在 `messageHandler`/`errorHandler` 内改为取回包装器并调用它（`const task = this.pendingTasks.get(taskId); task?.resolve({...})`），或在 resolve 前显式 `this.releaseWorker(worker)`；补一条断言 `busyWorkers===0` 的回归测试。

**验证者补充**：**P2→P3 下调**：唯一调用方 `AcDbNativeDxfConverter.ts:206` 每次 open 新建 manager、`maxConcurrentWorkers:1`、单任务后 `destroy()`，当前 App 内不可见；但该类是包公开导出的池 API。

---

### B44 worker 池每个任务注册的 message/error 监听器永不注销

**位置**：`cad-viewer/packages/data-model/src/converter/worker/AcDbWorkerManager.ts:137-182`（`cleanupTask:188-194`）

**频率/规模**：N 个任务后每次 worker 消息要遍历执行 N 个 `messageHandler`，闭包同时保留 `resolve/reject/worker/startTime`，内存与派发开销随任务数线性增长。

**问题与验证结论**：`:172-173` 每个任务都 `addEventListener('message'/'error')`，全文件 `removeEventListener` 为 **0 处**；`cleanupTask(188-194)` 只 `clearTimeout`+`delete`，成功（`148`）/错误（`167`）/超时（`112`）三条路径均不摘除。独立验证者**确认**，P3 恰当。

**建议修复**：在 `messageHandler`/`errorHandler` 的每个出口（resolve、reject、timeout、cleanup）统一 `removeEventListener` 两个监听器（可用 `once:true` 处理 error），并把监听器与任务生命周期绑定。

**验证者补充**：未下调。验证者提示一个**实施注意点**：测试替身 `FakeWorker`（`__tests__/AcDbWorkerManager.spec.ts:7-69`）未实现 `removeEventListener`，需同步补上，否则新增清理会让现有用例报错。

---

**本组优先级建议**

1. **B42 open 重入守卫**（P2、用户可感知的数据损坏风险）：不只是性能问题，二次打开会污染事件批次与数据库内容，建议以「进行中直接拒绝 + 过期 generation 丢弃」双保险实现；风险在命令层（`AcApOpenCmd` 需 await 读盘完成）。
2. **B43 worker 池释放路径修正**（一行级改动）：`messageHandler`/`errorHandler` 改调包装器即可恢复池契约，并补 `busyWorkers===0` 回归；对当前 App 无可见影响，属防回归修复。
3. **B44 监听器注销**（低风险）：与 B43 同文件、同批改动最经济；务必先给 `FakeWorker` 补 `removeEventListener`。

---

## 被验证者下调/推翻的性能类结论

对抗式验证在本章的价值集中体现为：**48 条 confirmed 中 17 条被下调、1 条被推翻**；另有 6 条虽事实成立但被验证者指出「量级/可达性远低于评审员描述」。下表为 performance/memory/concurrency 类别内被下调或推翻的条目，以及不应优先修的理由。

### 一、被推翻（verdict=refuted，correctedSeverity=drop）

| 条目 | 位置 | 原评级 | 推翻理由 |
| --- | --- | --- | --- |
| `acdbPeekDxfHeaderInfo` 在未识别 HEADER 段时全文解码：95MB 逐块 `TextDecoder`+`split` 成百万行字符串 | `data-model/src/base/AcDbDxfPairReader.ts:59-101` | P3 | 验证者核对 HEAD 证据**属实**（`68` 行 while 无上限、`74` 行 `split(/\r?\n/)`、`79` 行大小写敏感且只留 1 行 leftover，找不到 HEADER 时确会全文逐块解码，各块 `lines` 可被 GC 而非同时驻留；文档「只扫前几 KB」与实现不符），但**该函数在当前工作区已被整体删除**：`AcDbDxfPairReader.ts` 现 832 行且无 `acdbPeekDxfHeaderInfo`，`base/index.ts` 与 `src/index.ts` 也已去掉导出，按「已被处理」判 refuted。验证者明确保留条件：**若未提交重写被回退，原问题成立**。 |

**同域连带被推翻（非性能类别，但解释同一批结论为何失效）**：dm-parser 域 8 条 finding 中 4 条 refuted，全部集中在 `AcDbDxfPairReader`；验证者记录的原因是「验证期间工作区出现并发的、未提交的大规模重写——`AcDbDxfPairReader.ts` 由 HEAD 的 1062 行改为 832 行 UTF-8-only 版（20:41 起仍在改动，期间从 824→832 行），删除了 `acdbPeekDxfHeaderInfo` 等函数」。因此：

- **不应优先修**：被推翻的这 4 条针对的是**不再存在的代码路径**，投入修复没有意义；但 `docs/02-性能优化/渲染与解析性能瓶颈分析.md:80` 对该函数的「只扫前几 KB」描述已与实现脱节，文档需要更新。
- **行动建议**：先把这批未提交重写**落定并合入**，再以重写后的 832 行版本重新评估解析路径性能；否则本章与 dm-parser 域的结论都可能随代码漂移而失效。

### 二、被下调的性能/内存类条目（事实成立，但严重度或量级被修正）

| 编号 | 条目 | 原→修正 | 下调原因（验证者原话要点） | 为什么不应优先修 |
| --- | --- | --- | --- | --- |
| B2 | LWPOLYLINE 凸度段固定 100 采样 | P1→P2 | 「凸度多段线占比很高」未获证实：夹具 LWPOLYLINE 21/540/300 条，含组码 42 者仅 0/1/0，GC 压力证据不足 | 需先实测目标图纸凸度占比；修复要改几何引擎公开签名，回归面广 |
| B5 | TABLE 行/列数作数组长度 | P1→P2 | 原文「NaN 也会抛」不成立（`NaN>0` 为 false，实测无异常）；触发依赖畸形文件 | 属健壮性加固而非热点；可作为安全批次顺带处理 |
| B7 | MLeader 箭头修剪重复解析 | P2→P3 | 「每帧」不成立：`worldDraw` 只在渲染缓存未命中时执行，块模板命中后不再跑；箭头块通常 1-3 条实体 | 绝对开销很小 |
| B8 | 宽多段线 toFixed + `Math.max` 展开 | P2→P3 | 「凸度段 101 点/段」不成立（宽路径用 `getPoints(32)`，33 点/段）；实测 12.5 万参数才抛且异常被每实体 catch | 异常后果是单实体消失而非整图崩溃 |
| B14 | 每 mousemove 12~15 次 `getBoundingClientRect` | P1→P2 | 两读之间无写入不触发同步布局，实际强制重排约 3~4 次；橡皮筋仅在有基点时生效且 DOM 很小 | 收益从「每 mousemove 十几次重排」降为 3~4 次 |
| B18 | 层次索引 window 模式全量子项遍历 | P2→P3 | 是各命中子项数之**和**而非乘积，属约 2 倍常数而非复杂度升级；`child.search` 与 `{...hit}` 在 crossing 下同样必需 | 只影响 window 框选；验证者还否决了「去掉 `{...hit}`」的写法（会污染索引） |
| B20 | QuickSelect 全量扫描 | P1→P2 | 仅限用户主动打开对话框 | 非持续热路径，可由缓存修复兜住 |
| B31 | 布局/视口 OrbitControls 永不回收 | P1→P2（两域一致） | 被持留对象仅相机+控制器+监听；`ensureViewportViews` 有 `viewportCount===0` 守卫，layout view 由 `getAt` 复用不重建 | 只在 destroy/create 循环累积，正常重开文档不新增 |
| B32 | AcTrRenderer.dispose 不解绑 FontManager | P1→P2 | 正常重开文档走 `clear()` 复用同一 `AcTrRenderer`；泄漏仅在 `createInstance`/`destroy` 循环 | 触发面窄，但 WebGL 上下文上限使其仍值得修 |
| B37 | AcApDrawStyleToolbar.dispose 无调用点 | P2→P3 | `if (!this.colorPanelOpen) return` 使残留 capture 监听基本空转，旧 DOM 随旧容器不可见 | 影响有限，建议随 B27 一并调用 dispose |
| B38 | SymbolTable.add 同名覆盖不释放旧句柄 | P2→P3 | 需重名记录才触发，每条仅泄漏 1 个对象 | 量级小 |
| B39 | computeLineDistance 对在用 geometry 调 dispose | P2→P3 | 两个调用方都在实体构造期、几何从未上传，`dispose()` 属 **no-op**；「多余上传」不成立，共享仅为 TODO 推测 | 当前无实际后果，属潜在生命周期缺陷 |
| B40 | disposeObjectTree 释放共享 geometry | P2→P3 | 两个真实调用方传入的根 `parent==null`，`ownsClone` 恒 false，dispose 分支**现网不可达** | 现网不可达，仅防御外部按文档传场景内对象 |
| B41 | 搜索面板防抖定时器未清理 | P2→P3 | 只延迟 200ms 且只触发一次，属短暂持有闭包而非持久泄漏 | 影响是一次多余扫描；但一行 `clearTimeout` 仍值得修 |
| B42 | openDocument/openUrl 无 in-flight 守卫 | P1→P2（lifecycle 域） | 遮罩为 `pointer-events:auto` 挡鼠标，需用户键入第二次 OPEN 或宿主二次调用 API | 触发需主动操作；但后果是数据损坏，仍建议修 |
| B43 | worker 池永不释放 worker | P2→P3 | 唯一调用方每次 open 新建 manager、单任务后 `destroy()`，当前 App 内不可见 | 属公开池 API 的契约破坏 + 防回归 |

**唯一被上调的条目**：**B36 示例壳层监听不注销（P3→P2）**——验证者认为二者位于 ribbon 页签 `v-for`+`v-if` 内，每次切页签即卸载重挂，且每个残留 `selectionAdded` 都执行整份 id 数组拷贝，频率远高于其他「每次挂载」类泄漏。这说明对抗验证既会压低被夸大的结论，也会纠正被低估的结论。

### 三、相邻类别但属性能/资源类的下调项（供跨章节交叉参考，本章不展开）

这些条目在 JSON 中归类为 correctness 等类别，但评审员的原始论据包含性能/资源判断，验证者同样作了下调，阅读严重问题章节时应一并注意：

- **`AcDbBlockTable.removeEntity` 对每个 BTR 重建 `Set(ids)`**（dm-database，P2→P3）：属「每实体 × BTR」扫描，但首个命中即 break，实际没有 O(N²) 放大。
- **`points.push(...cached)` 顶点标记展开入队**（csv-editor，P2→P3）：验证者实测需单实体 ≥12.5 万点才抛 `RangeError`，常规图纸不可达。
- **`splitLineSegmentsClusters` 输出索引用 `Uint16Array`**（tr-batch，P1→P2）：已用 40000 段单簇实测复现索引回绕，但可达性窄于原文——多段线走 `buildLineGeometryMulti` 已用 `Uint32`。
- **`AcSvgRenderer.image()` 返回共享哑对象**（plugins-heavy，P1→P2）：影响面仅限含 IMAGE/OLE2FRAME 的图纸。
- **`tooling` 域 3 条 P2→P3**（jest lodash store 解析、bootstrap 跳过构建、process_dxf 原地覆盖）：属构建/脚本健壮性，与运行时性能无关。

### 四、对抗验证暴露的方法论问题（供后续评审复用）

1. **「每帧」类断言必须核到缓存层**：B7 的 `worldDraw` 被 `AcDbRenderingCache` 缓存、B11 的 `hasAnyHighlight` 只在装过高亮 hook 后每帧执行——评审员若只看函数内部循环，容易把「每次构建」误报为「每帧」。
2. **必须先量化目标图纸的实际组成**：B2/B8 的下调都源于夹具实测（凸度段占比、宽路径采样点数）与评审员假设不符；38 万实体总量不等于每条 finding 的规模。
3. **「强制同步布局」「O(N²)」「RangeError 崩溃」需要实测阈值**：B14、B18、B8 分别把 12~15 次 rect、乘积复杂度、12.5 万参数阈值纠正为实际值，验证者的本机复现（Node 实测 / jest 临时用例 / 夹具统计）是本章可信度的基础。
4. **代码在评审过程中会变**：dm-parser 域整簇 refuted 的根因是并发的大规模未提交重写；性能结论必须绑定 commit/文件行数，并在重写落定后**重跑**对应域。

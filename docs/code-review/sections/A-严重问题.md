# A. 严重问题详解（P0/P1）

## 本章范围与筛选口径

- 数据来源：`docs/code-review/raw/` 下 14 个领域的评审结果 JSON
  （csv-cmd、csv-editor、csv-view、dm-database、dm-entity、dm-parser、geo、
  lifecycle、plugins-heavy、plugins-light、tooling、tr-batch、tr-render、vue-app）。
- 筛选条件：`verdict === "confirmed"` 且 `correctedSeverity` 为 P0 或 P1。
- 14 个文件合计 109 条 finding：confirmed 104 条、refuted 5 条，
  **没有任何一条被验证者修正为 P0**；命中筛选条件的是 16 条原始 P1
  （验证者全部维持 P1，无上调、无下调）。
- 去重后合并为 14 条：`csv-cmd`、`lifecycle`、`csv-editor` 三个领域报的
  「视图/编辑器无析构路径，`AcApDocManager.destroy()` 不销毁视图」是同一根因，
  已合并为 A11，其余条目一一对应。
- 所有行号、代码摘录、验证结论均直接取自上述 JSON 的
  `file`/`line`/`evidence`/`note` 字段；凡属本章补充的具体写法，均标注「（报告补充）」。
- 项目背景：纯浏览器端 DWG/DXF 查看器，目标图纸为煤矿采掘工程平面图，
  典型规模 95MB / 38 万实体；主线程同时承担解析、几何转换、渲染与 Vue 组件更新，
  因此「每 mousemove」「每帧」「每实体」的路径都会被 38 万倍放大。

## 概览

| 编号 | 标题 | 位置 | 类别 | 严重度 | 置信度 |
| --- | --- | --- | --- | --- | --- |
| A1 | 批量通知 `push(...items)` 超 V8 参数上限，撤销大范围删除抛 RangeError | `cad-viewer/packages/data-model/src/database/AcDbDatabase.ts:828-838、845-855` | correctness | P1 | high |
| A2 | 事务变更记录器每条变更全数组线性扫描，批量删除/编辑退化 O(N²) | `cad-viewer/packages/data-model/src/database/transaction/AcDbChangeRecorder.ts:55-68 等` | performance | P1 | high |
| A3 | 每实体热路径用 `Object3D.getObjectById` 反查批次容器（O(子树)） | `cad-viewer/packages/three-renderer/src/batch/AcTrBatchedGroup.ts:1257`（另 917/1275/1463/1580/1695/1705） | performance | P1 | high |
| A4 | grip 拖拽预览每次 mousemove 深克隆实体并重建 transient 几何 | `cad-viewer/packages/cad-simple-viewer/src/editor/grip/AcEdGripPreviewJig.ts:43-53、64-68` | performance | P1 | high |
| A5 | 属性面板为全部选中实体构建运行时属性树，实际只用第一个 | `cad-viewer/packages/cad-viewer-example/src/shell/panels/AntdPropertiesPanel.vue:93-102` | performance | P1 | high |
| A6 | `updateEntity` 调 `batchConvert` 未配平计数，`_numOfEntitiesToProcess` 下溢钳零 | `cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2047-2049、2986-2992、3165-3172` | correctness | P1 | high |
| A7 | `clear()` 不重置每文档布局状态，第二个文档复用上一张图纸的布局/相机 | `cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2219-2235、2413-2415、655-658` | correctness | P1 | high |
| A8 | `AcGeCircArc3d.deltaAngle` 对整圆返回 0，CIRCLE 捕捉全部失效 | `cad-viewer/packages/geometry-engine/src/geometry/AcGeCircArc3d.ts:215-217`（消费点 344、402、440） | correctness | P1 | high |
| A9 | `AcSvgEntity.fastDeepClone()` 返回 `this`，破坏渲染缓存模板不可变契约 | `cad-viewer/packages/cad-svg-plugin/src/AcSvgEntity.ts:147-149`（配合 126-133） | correctness | P1 | high |
| A10 | agent `draw_arc` 把「度」直接传给按弧度解释的 `AcDbArc` | `cad-viewer/packages/cad-agent-plugin/src/tools/CadActionExecutor.ts:291-301` | correctness | P1 | high |
| A11 | `AcApDocManager.destroy()` 不销毁视图/编辑器，rAF/DOM/监听永久泄漏 | `cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:625-632` | memory | P1 | high |
| A12 | 进程级单例 `AcDbSysVarManager` 上的监听无退订句柄，旧数据库（38 万实体）被闭包长期持有 | `cad-viewer/packages/cad-simple-viewer/src/app/AcApContext.ts:116-138` | memory | P1 | high |
| A13 | `AcTrMTextRenderer._pendingGlyphKeys` 永不回收，`dispose()` 也未解绑 `fontLoaded` | `cad-viewer/packages/three-renderer/src/renderer/AcTrMTextRenderer.ts:76、451-464、484-500` | memory | P1 | high |
| A14 | CI 的 lint 门禁在 HEAD 上已失败：4 个包 21 个 error，build job 必然红 | `cad-viewer/.github/workflows/ci.yml:48-49` | build-tooling | P1 | high |

---

## A1 批量通知 `push(...items)` 超 V8 参数上限，撤销大范围删除抛 RangeError

**位置**：`cad-viewer/packages/data-model/src/database/AcDbDatabase.ts:828-838、845-855`

**类别**：correctness（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。dm-database 领域对抗式验证者复核 note 的关键事实：
`AcDbDatabase.ts:831/848` 确为 `push(...items)`；`AcDbDatabaseTransactionManager.ts:232-242`
的 `undo()` 先 `beginEventBatch()`，`dispatchUndoRedoEvents:481-486` 把
`acdbCollectChangeEntities` 收集的全部 erased（`AcDbChangeApplier.ts:275-280`，无分块）一次传入；
本机 V8 实测 120000 个实参正常、125000 抛 `RangeError`。该 finding 由 dm-database 领域在评审轮提出，
验证轮由同一领域的独立对抗式验证者逐行读源码 + 本机 Node 实测复核确认。

**问题**：`entityAppended`/`entityErased` 的通知在事件批处理开启时，把整批实体一次性展开为
`push` 的实参。JS 引擎对函数实参/栈展开有硬上限，一批实体数超过该上限即直接抛异常；
而 `undo()`/`redo()` 恰好会把「整批被删除实体」一次交给通知。

**代码证据**：

```
if (this.isEventBatched()) {
      const items = Array.isArray(entity) ? entity : [entity]
      this._pendingEntityAppended.push(...items)
      return
    }
```

**影响**：在 95MB / 38 万实体目标图纸上，「框选删除 + 撤销」是常规操作，
一次撤销即可让 `erased.length` 达到 12 万以上并触发 RangeError。
后果不只是报错：异常在 `finally` 之后抛出，`undoStack.pushRedo(record)` 被跳过（重做记录丢失），
被恢复实体的 `entityAppended` 通知也未派发，视图与数据库状态不一致
（验证 note 补充：`AcApMarkupHistory.ts:277-280` 的 `redoKinds.push('db')` 同样被跳过，会话撤销栈也错乱）。

**最小修复建议**：把两处 `this._pendingEntityAppended.push(...items)` /
`this._pendingEntityErased.push(...items)` 改为 `for` 循环 push 或按固定块
（如 1000）分批 push，与同文件 `endEventBatchChunked` 的分块口径保持一致；
undo/redo 的实体恢复通知同样分块派发（报告补充：可抽一个私有
`pushInChunks(target, items, size = 1000)` 同时用于 appended/erased 两条路径）。

**验证补充**：触发条件是「单批实体数 ≥ 约 12.5 万」，需一次性框选/撤销极大量实体，
不是每次普通撤销都命中，属触发门槛较高但落在目标图纸主链路上的缺陷；
原 impact 中「38 万实体必然抛」的表述成立，但需单批达到该量级。

---

## A2 事务变更记录器每条变更全数组线性扫描，批量删除/编辑退化 O(N²)

**位置**：`cad-viewer/packages/data-model/src/database/transaction/AcDbChangeRecorder.ts:55-68、79-83、127-140、196-218、228-239`
（调用点 `database/AcDbBlockTableRecord.ts:499-504`、`database/transaction/AcDbTransaction.ts:44-58`）

**类别**：performance（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。dm-database 领域对抗式验证者 note 的关键事实：
`AcDbChangeRecorder.ts:57-59/80-82/129-131/175-179/198-200/208-210/233-238` 全为 `find`/`findIndex` 线性扫描；
`AcDbBlockTableRecord.ts:497-504` 在删除循环内逐实体 `recordRemove`；
`AcApEraseCmd`(mode=Write) 经 `AcEdCommand.ts:241-242` 开启 undo mark + 事务，`isRecording` 为真。
本机 Node 复现同一谓词：remove 5k=25ms / 20k=288ms / 50k=1787ms，modify 50k=4993ms，38 万≈90-100s。

**问题**：变更记录器用「遍历整个 changes 数组逐个比对 kind/objectId/container」的方式做去重，
而每次实体删除或属性修改都会调用它一次，于是批量操作的时间复杂度从 O(N) 退化为 O(N²)；
`docs/02-性能优化/框选大量对象性能分析.md:73` 中「批量删除均为线性复杂度」的结论不成立。

**代码证据**：

```
return this.changes.findIndex(
      change =>
        change.kind === kind &&
        change.object.objectId === objectId &&
        acdbAreChangeContainersEqual(change.container, container)
    )
```

**影响**：38 万实体规模下一次框选删除按 N² 外推约 90-100s 主线程冻结，即浏览器「页面无响应」；
每次还伴随 `clonePreservingIdentity()` 深拷贝快照，内存同量级增长。
这是「框选大批量删除 + 撤销」主链路的直接性能回归，与项目核心优化目标冲突。

**最小修复建议**：为 modify / sysvar / 结构变更各维护一个
`Map<objectId, changeIndex>`（或 `Set<containerKey + objectId>`）去重索引，替代
`find`/`findIndex`；结构取消配对改为按 key 查表。
（报告补充：可在 `recordRemove`/`recordModify` 的写入侧同步更新索引，删除时用
`changes[index]` 与尾元素交换后 `pop()`，避免数组 `splice` 的二次搬移。）

**验证补充**：has 判定必须保持原有「kind + objectId + container 三者相等」的语义，
否则会误合并不同容器中的同 id 变更；这是修复时最容易引入正确性回归的点。

---

## A3 每实体热路径用 `Object3D.getObjectById` 反查批次容器（O(子树)）

**位置**：`cad-viewer/packages/three-renderer/src/batch/AcTrBatchedGroup.ts:1257`
（`applyBatchSlotVisibility`，被 `addEntity:1015/1028/1041/1050` 与 `registerDirectAppend:1257` 调用）、
`917`（`setEntityVisible`）、`1463`（`setEntityHighlight` → hover/selectMany）、
`1275`（`removeEntity`）、`1580/1695/1705`

**类别**：performance（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。tr-batch 领域对抗式验证者 note 的关键事实：
`917/1275/1344/1463/1695/1705` 确为 `this.getObjectById(item.batchedObjectId)`；
three@0.172 的 `getObjectByProperty` 是深度优先递归且无缓存；
构造函数 `312-314` 先 `add(_unbatchedObjects[0])`，批次容器到 `1963` 才 `add`，
故每次查找必先遍历整棵未合批子树（文本/字形/图案填充可达上万节点）。
验证者同时确认 `addLine:1751`/`addMesh:1869`/`addPoint:1912` 已持有容器引用却只返回 id。

**问题**：`Object3D.getObjectById` 会递归遍历整棵子树直到命中；
`_unbatchedObjects` 是 `children[0]`，因此每次查找都先走完全部未合批子树，
再线性扫批次容器列表，而不是 O(1) 查表。

**代码证据**：

```
private applyBatchSlotVisibility(...) {
  const batchedObject = this.getObjectById(
    item.batchedObjectId
  ) as AcTrBatchedObject | undefined
  batchedObject?.setVisibleAt(item.batchId, visible)
}
// 构造函数 312-314 先 add(_unbatchedObjects/_selectedObjects/_hoverObjects)
```

**影响**：该调用位于每实体入批（38 万次）、hover（每次 mousemove）、
框选/选择/取消选择的每实体、erase 的每实体、图层可见性切换的每实体。
在纯浏览器 + 软件渲染环境下，hover 与框选是最频繁的交互，
每次都要付出一次 O(子树) 递归，是明确的交互热路径性能回归。

**最小修复建议**：在 `AcTrBatchedGroup` 内维护
`_containerById: Map<number, AcTrOriginBatch>`（`add(batch)` 时登记、`clear`/`dispose` 时删除），
所有 `this.getObjectById(item.batchedObjectId)` 改为查表；
或让 `addLine`/`addLine2`/`addMesh`/`addPoint` 返回容器引用并把它与 `batchId`
一起存入 `AcTrEntityInBatchedObject`，彻底去掉反查。

**验证补充**：验证者在复核中未发现该路径存在其它缓存，确认是每次调用都真扫；
修复后需同时覆盖 `setEntityVisible`、`setEntityHighlight`、`removeEntity`
等全部 6 处调用点，避免只改 `applyBatchSlotVisibility` 留下残余。

---

## A4 grip 拖拽预览每次 mousemove 深克隆实体并重建 transient 几何

**位置**：`cad-viewer/packages/cad-simple-viewer/src/editor/grip/AcEdGripPreviewJig.ts:43-53、64-68`

**类别**：performance（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。csv-editor 领域对抗式验证者 note 的关键事实：
`AcEdGripPreviewJig.ts:49` 每次 `update` 都 `_sourceClone.clone()`
（`AcDbObject.ts:620-623` 深拷贝 + 新句柄），`:64-68` 再 `addTransientEntity`；
`AcEdGripEditSession.ts:57-61` 由 document mousemove 直驱、无 rAF/节流；
`AcTrView2d.ts:1838` 每次全量转换几何，开销/GC 压力成立。
同一 finding 由 csv-editor 领域在评审轮提出、验证轮独立复核确认。

**问题**：grip 拖拽期间每个 mousemove 都深克隆整实体（含全部顶点数组）、
删除上一份 transient 并重新入场景转换，没有矩阵复用，也没有按帧合并。

**代码证据**：

```
this._view.removeTransientEntity(this._previewEntity.objectId) ... const preview = this._sourceClone.clone() ... preview.subMoveGripPointsAt([this._gripIndex], this.computeOffset(point))
```

**影响**：单条 10 万顶点多段线每移动一次鼠标即复制 10 万点并重建一次 THREE 几何，
软件渲染下必然掉帧且持续制造 GC 压力。
另存在异步发布竞态：`scene.add` 在 `asyncDraw().then(AcTrView2d.ts:1842-1851)` 中执行，
若下一次 move 的 `removeTransientEntity` 早于该 then（字体/组转换需 await），
被取代的 transient 会以独立 `objectId`（clone 每次生成新临时句柄）永久留在场景中形成残留预览。

**最小修复建议**：构造时克隆一次，mousemove 只更新几何/矩阵
（或改走 `view.createEntityPreview` + `updateEntityPreview`，如 `AcEdBatchPreview` 的做法）；
用 rAF 合并同一帧内多次 mousemove；并对异步发布做「是否仍为当前预览」的校验。

**验证补充**：验证者指出该竞态的触发窗口比原 finding 更窄——
`asyncDraw` 基类（`AcTrEntity.ts:364`）为 no-op 微任务，仅 `AcTrGroup.ts:400`、
`AcTrGlyphEntity.ts:166` 真 await 时 `:45` 的 remove 才会落空、`:1849` 的 then 留下旧 transient；
即主症状是「每 mousemove 深克隆」的性能问题，残留预览是次要的竞态后果。

---

## A5 属性面板为全部选中实体构建运行时属性树，实际只用第一个

**位置**：`cad-viewer/packages/cad-viewer-example/src/shell/panels/AntdPropertiesPanel.vue:93-102`

**类别**：performance（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。vue-app 领域对抗式验证者 note 的关键事实：
`AntdPropertiesPanel.vue:93-102` 确实全量 `forEach` 并 `push entity.properties`，
而 `:106`/`:204` 只用 `list[0]`；`AcDbEntity.ts:641-646` 的 getter 每次新建
`AcDbEntityProperties`，`getGeneralProperties()`（`:855` 起）返回 7 个描述符、
每个带 accessor get/set 闭包；`AntdCadViewer.vue:91-120` 右 sider 只改宽度、
面板在 `v-if=editorReady` 内常驻，折叠时也构建。

**问题**：为「全部选中实体」构建运行时属性树，但消费端只读取第一个实体；
选择集越大，无用分配越多。

**代码证据**：

```
selectionSet.value.forEach(id => { const entity = db.tables.blockTable.modelSpace.getIdAt(id); if (entity) list.push(entity.properties) })；仅 list[0] 被消费（:106 entityPropsList.value[0]?.type、:204 const entity = list[0]）
```

**影响**：框选/全选 10 万~38.9 万实体时，本 computed 在主线程为每个实体各建一棵树：
38.9 万实体约 800 万个属性描述符 + 1600 万个闭包，实测同类规模下必然数秒级冻结并可能 OOM。
由于面板在 `v-if=editorReady` 内常驻，右侧 sider 折叠时也会照常全量构建，
即「用户看不见面板」并不能规避这次卡顿。

**最小修复建议**：只解析第一个实体：
`const id = selectionSet.value[0]; const entity = id != null ? modelSpace.getIdAt(id) : undefined`，
属性树只建一次；多选数量用 `selectionSet.value.length`；
若后续要展示多选公共属性，先按类型分桶再抽样。

**验证补充**：验证者逐个数过 `getGeneralProperties()` 的 7 个描述符与闭包数量，
确认「千万级对象分配」的量级估计成立；修复时需注意 `list[0]` 在两个位置被消费，
都要改成同一份单实体结果，避免只改一处造成面板空态。

---

## A6 `updateEntity` 调 `batchConvert` 未配平计数，`_numOfEntitiesToProcess` 下溢钳零

**位置**：`cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2047-2049、2986-2992、3165-3172`

**类别**：correctness（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。csv-view 领域对抗式验证者 note 的关键事实：
`updateEntity`(2028-2062) 在 2048 直接 `await batchConvert`，
未做 `1944`/`2541`/`2621` 的 +N 配平；`batchConvert(2784)` 循环对每个实体在
`finally(2986-2992)` 调 `decreaseNumOfEntitiesToProcess`，`3166-3171` 减到负值即钳 0 并 warn；
`AcApContext.ts:77-91` 的 `entityModified → updateEntity` 是常态入口，单实体编辑即告警。

**问题**：调用方在调 `batchConvert` 前要把待处理计数加 N，而 `batchConvert` 在 `finally` 中
对每个实体减 1；`updateEntity` 是唯一漏掉 +N 配平的调用点，于是每修改一个实体计数净减 1。

**代码证据**：

```
void (async () => {
      await this.batchConvert(entities)  …  if (epoch === this._convertEpoch) {
          this.decreaseNumOfEntitiesToProcess()  …  this._numOfEntitiesToProcess--
    if (this._numOfEntitiesToProcess < 0) {
      this._numOfEntitiesToProcess = 0
```

**影响**：每次实体修改（MOVE / 属性改 / 图层改 / 撤销）都会把共享计数减到负值、
被钳到 0 并打印 `'Something wrong! ... should not be less than 0.'`，每个实体一条日志。
更严重的是若此刻确有转换在途，`isProcessingEntities` 会提前变 `false`，
使 `waitUntilIdle`/`zoomToFitDrawing` 的 waiter 与 `ensureEntitiesConvertedForExport`
在场景未完成时提前返回（过早 fit、HTML 导出缺几何），
`entityProcessingProgress` 的分母也失真（验证 note 引用 `797` 与 `2169/1411`）。

**最小修复建议**：在 `updateEntity` 调 `batchConvert` 前做同样的计数配平
（`_numOfEntitiesToProcess`/`_totalEntitiesToProcess += entities.length`），
或改为由调用方统一管理计数、`batchConvert` 不再自减。

**验证补充**：这是「可复现、影响 waiter/进度」的确定性缺陷，单实体编辑即可触发告警；
验证者建议的最小修复即 2048 前补一行 +N，成本极低，建议优先处理。

---

## A7 `clear()` 不重置每文档布局状态，第二个文档复用上一张图纸的布局/相机

**位置**：`cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2219-2235、2413-2415、655-658`

**类别**：correctness（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。csv-view 领域对抗式验证者 note 的关键事实：
`clear()`(2219-2235) 只重置 epoch/计数/scene/renderer，
未动 `_layoutViewManager`（`691` 处 new 一次，`AcTrLayoutViewManager` 无 `clear()`）、
`_initializedLayouts`(201) 等四个集合；`btrId` 即 handle（`AcDbObject.ts:843-844`），跨图纸易复用；
`AcApDocManager` 单例(592-597)、view 仅 `507` 建一次、`1658` 只 `clear()`；
`2414 getAt` 命中旧 `AcTrLayoutView`（旧相机），`2486-2493` 因 `viewportCount>0`
跳过 `ensureViewportViews`，`657 isFirstVisit` 恒为 `false`。

**问题**：`clear()` 不清空每文档的布局视图管理器、已访问布局集合、外部取景集合、
加载中集合与正在转换图层集合，而布局的 `btrId` 就是 DXF handle，
跨图纸高度重复（模型空间常为 `1F`），因此新图纸会命中旧图纸的布局视图。

**代码证据**：

```
clear() {
    this._convertEpoch++
    this._convertQueue.length = 0  …  let layoutView = this._layoutViewManager.getAt(layoutBtrId)
    if (layoutView == null) {  …  const isFirstVisit = !this._initializedLayouts.has(btrId)
```

**影响**：打开第二个文档后，可能沿用上一张图纸的相机 pan/zoom；
旧 `viewportViews` 保留（新图纸不存在的视口条目永不删除，`drawViewports` 用过期纸空间矩形）；
`_initializedLayouts` 保留旧 id 使新图纸首次切到该布局不再 auto-zoom，
用户可能看到空白或上一张图的取景；布局视图对象还会持续累积。
对 38 万实体的多图纸工作流（对照查阅）是高频且直观的错误。

**最小修复建议**：`clear()` 中清空 `_layoutViewManager`（为 `AcTrLayoutViewManager`
增加 `clear()` 并重建）、`_initializedLayouts`、`_externallyFramedLayouts`、
`_loadingLayouts`、`_convertingLayers`，并按新文档重新创建布局视图与视口视图。

**验证补充**：验证者特别指出 `1136 regen()` 也走 `clear()`，同文档重绘必须保留相机，
因此修复要区分「换文档」与「同文档重绘」两种 `clear()` 语义
（报告补充：建议拆成 `clear()` 与 `clearForNewDocument()`，或给 `clear()` 加布尔参数），
简单粗暴地清空会在 `regen()` 时把用户当前取景重置。

---

## A8 `AcGeCircArc3d.deltaAngle` 对整圆返回 0，CIRCLE 捕捉全部失效

**位置**：`cad-viewer/packages/geometry-engine/src/geometry/AcGeCircArc3d.ts:215-217`
（消费点 `344`、`402`、`440`）

**类别**：correctness（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。geo 领域对抗式验证者 note 的关键事实：
`AcGeCircArc3d.ts:215-217` + `AcGeMathUtil.ts:524-527` 确认 `normalizeAngle(TAU)=0`，
`:338-344`/`:399-402`/`:439-440` 均以 `deltaAngle` 为上限，`:501-503 closed=true`；
用 jest 实测 r=10 整圆(0,TAU)：`nearestPoint(0,5)=(10,0,0)`、
`tangentPoints(30,0)=[]`、`perpendicularPoints(0,5)=[]`、`isLargeArc=0`、`clockwise=true`；
`AcDbCircle.ts:71/128/586` 全用 0..TAU，`AcApSettingManager.ts:67` 默认 OSNAP 含 Nearest。

**问题**：`AcDbCircle` 用 `start=0`、`end=TAU` 构造整圆，而 `normalizeAngle(TAU)===0`，
于是整圆 `deltaAngle===0` 却 `closed===true`；最近点/切点/垂足三处都用
`deltaAngle` 作为角度上限，导致整圆的捕捉结果错误或为空。

**代码证据**：

```
get deltaAngle() {
    return AcGeMathUtil.normalizeAngle(this.endAngle - this.startAngle)
  }
// nearestPoint: if (t > delta) t = delta
```

**影响**：调用链 `AcDbCircle.subGetOsnapPoints:277-292 ← AcEdOsnapResolver.ts:127`，
即每次悬停/点击的 OSNAP。切点/垂足捕捉对全部 CIRCLE 静默失效，
最近点捕捉返回错误位置（实测要求 `(0,10,0)` 却返回 `(10,0,0)`）。
默认 OSNAP 含 Nearest，因此在目标图纸上属于「默认交互即中招」的功能性错误。
`AcGeEllipseArc3d.ts:144-151` 已显式处理 TAU，可证此处是遗漏。

**最小修复建议**：改为
`get deltaAngle() { return this.closed ? TAU : AcGeMathUtil.normalizeAngle(this.endAngle - this.startAngle) }`，
或在 `nearestPoint`/`tangentPoints`/`perpendicularPoints` 内用 `closed` 短路
（closed 时 t 直接落在 [0,TAU]）。

**验证补充**：验证者强调这是 16 条中少数「默认路径 + 交互直接可见」的正确性缺陷，
置信度高、复现成本低，建议优先修复；同时提醒修复 `deltaAngle` 会影响
`isLargeArc`/`clockwise` 等派生属性，需一并回归。

---

## A9 `AcSvgEntity.fastDeepClone()` 返回 `this`，破坏渲染缓存模板不可变契约

**位置**：`cad-viewer/packages/cad-svg-plugin/src/AcSvgEntity.ts:147-149`
（配合 `126-133 applyMatrix`；调用方 `cad-viewer/packages/cad-svg-plugin/src/AcSvgRenderer.ts:183-186 group()`）

**类别**：correctness（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。plugins-heavy 领域对抗式验证者 note 的关键事实：
`AcSvgEntity.ts:147-149` 返回 `this`，`AcSvgGroup` 未覆写；
`AcDbRenderingCache.ts:663-678` 的 miss 路径 `set()` 后 `fastDeepClone` 仍为同一对象，
`:694-703 applyMatrix` 就地改写模板（`_matrix` 连乘、`_box` 反复变换）。
验证者还修正了原 finding 的症状描述（见下）。

**问题**：`AcDbRenderingCache` 依赖 `fastDeepClone()` 返回副本以保证缓存模板不可变
（`AcTrEntity.fastDeepClone` 是真深拷贝），而 SVG 侧直接返回 `this`，
于是命中缓存的实例会就地改写模板。

**代码证据**：

```
fastDeepClone() {
    return this
  }   // 而 applyMatrix: else { this._matrix = matrix.clone().multiply(this._matrix) }
```

**影响**：`AcSvgRenderer.prepareExport()` 清缓存后，同一命名块的实例会拿到同一对象，
`applyMatrix(M2)` 得到 `M2*M1`，凡有重复块引用的图纸（符号、图框、块化文字）
导出结果几何错位；更严重的是导出结束后缓存里存的是 `AcSvgGroup`（未清缓存），
此后实时 three 渲染器再 `draw()` 命中同一 key 会拿到 SVG 实体（缺 three 侧接口），
后续实体转换会抛错或渲染为空。对 38 万实体图纸，冷路径（csvg/PDF 导出）也是必须正确的交付路径。

**最小修复建议**：实现真正的 `fastDeepClone`（新建 `AcSvgEntity`，复制
`_localSvg`、`_box`、`_matrix`、`basePoint`），并让 `AcSvgRenderer.prepareExport()`
在导出开始与结束都调用 `AcDbRenderingCache.instance.clear()`
（或在缓存 key 中加入渲染器身份）以避免污染 three 渲染路径。

**验证补充**：验证者修正了两点：
1）实际症状比原文更重——hit 路径不调 `renderer.group()`，仅 miss 时
`AcSvgRenderer.ts:183-186` 把该对象 push 进 `_entities`，
故导出中同名块只出现 1 次、变换为各实例矩阵连乘（而非「第 2 个以后错位」）；
2）导出后未清缓存，`AcTrView2d.ts:2880/2656` 的 three 侧会抛错，
修法必须包含「导出结束后再 clear」。

---

## A10 agent `draw_arc` 把「度」直接传给按弧度解释的 `AcDbArc`

**位置**：`cad-viewer/packages/cad-agent-plugin/src/tools/CadActionExecutor.ts:291-301`

**类别**：correctness（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。plugins-light 领域对抗式验证者 note 的关键事实：
`CadActionExecutor.ts:293-298` 角度未转换直接进 `AcDbArc`；
同文件 `80-82` 有 `degToRad`，`513/521/593` 均使用，仅此处漏用；
`AcDbArc.ts:96-97` 明写角度为 radians 且示例用 `Math.PI/2`，
ctor 体 `138-149` 透传给 `AcGeCircArc3d`，后者 `195/204` 行 `normalizeAngle`，
`90` 被当 `90rad`；`cadTools.ts:44-51` 声明单位为 degrees。

**问题**：工具入参 schema 声明 `startAngleDeg`/`endAngleDeg` 单位为度，
但构造函数需要弧度，代码未做 `degToRad` 转换。

**代码证据**：

```
const arc = new AcDbArc(
  toPoint3d(input.center),
  input.radius,
  input.startAngleDeg,
  input.endAngleDeg
)
```

**影响**：`cadTools.ts:44-46` 与 inputSchema 明确声明单位为度，模型会传 0/90 这类值；
90° 被当作 90 rad≈116.6°，圆弧起止角与扫掠角全部错误。
每次 `draw_arc` 工具调用必错，即 AI 绘图链路中圆弧是确定性错误的。

**最小修复建议**：改为 `degToRad(input.startAngleDeg)`/`degToRad(input.endAngleDeg)`，
或把入参改名并同步修改 `cadTools.ts` 的 description 与字段名。

**验证补充**：验证者确认这是「每次调用必错」的确定性缺陷，与同文件
`drawEllipse(:513-521)`、`drawHatch(:593)` 已正确调用 `degToRad` 形成鲜明对照，
属漏改而非设计取舍。

---

## A11 `AcApDocManager.destroy()` 不销毁视图/编辑器，rAF、DOM、ResizeObserver 与单例监听永久泄漏

**位置**：`cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:625-632`
（另 `cad-viewer/packages/cad-simple-viewer/src/editor/view/AcEdBaseView.ts:331-340、316-329`、
`cad-viewer/packages/cad-simple-viewer/src/editor/view/AcEdHoverController.ts:174`）

**类别**：memory（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。
本条由三个领域独立发现并各自复核，属同一根因「视图/编辑器没有析构路径，
`destroy()` 不回收视图」：

- csv-cmd 领域（`AcApDocManager.ts:625-632`）note：
  `destroy()` 只 `unloadAllPlugins/doc.destroy/uninstall dialog/resetInstance`，
  不触碰 `:507` 的 `view`；`AcTrView2d.ts:2365 animate` 自续 rAF，
  `stopAnimationLoop(:2295)` 全仓 0 调用；`:338 canvas`、`:688 CSS2D`、`:2340 stats DOM`
  无移除；`:362/:390/:406` 与 `AcApContext` 在静态单例上的监听无解绑；
  `AcApProgress.destroy(:232)` 无调用者。结论明确标注「与 lifecycle 域重复」。
- lifecycle 领域（同一 `AcApDocManager.ts:625-632`）note：
  `AcTrView2d.ts:2364-2365 animate` 每帧自续 rAF、`:2295` 全仓 0 调用；
  `:2342-2354 Stats appendChild(document.body)` 且只切 `display`；
  `AcEdBaseView.ts:225` 起与 `AcTrView2d.ts` 无 `dispose`/`destroy`，
  13 处 `addEventListener` 零 `remove`；
  `AcApDocManager.ts:622-624` 注释自述 `'Destroy the view'`，`:625-632` 仅插件/doc；
  `AcApProgress.ts:232`、`AcEdHoverController.ts:174` 亦 0 调用；
  `useAntdCadShell.ts:302-306` 卸载后 `app.ts:30` 重建，旧 view 必泄漏。
- csv-editor 领域（`AcEdBaseView.ts:331-340`）note：
  `AcEdBaseView.ts:331-340` 的 `observer` 仅存局部 `const`、canvas 监听(`:316-329`)匿名，
  `AcEdBaseView`/`AcTrView2d.ts:139` 均无 `dispose`；
  `AcApDocManager.ts:625-632` 不销毁视图且 `:631` 允许重建；
  硬泄漏：`AcEdCursorManager.ts:94` 在永不重置的 `AcDbSysVarManager.instance()` 挂匿名闭包（持 `_view`），
  `AcEdInputManager.ts:165` 挂 `AcApSettingManager.instance()` 同理且无 `dispose`，
  `AcEdHoverController.ts:174 dispose` 全仓零调用。

**问题**：`destroy()` 只卸载插件、销毁 document 级服务并把 `_instance` 置空，
从不销毁 `this._context.view`（构造于 `:507`）；
而视图侧（`AcTrView2d`/`AcEdBaseView`）连 `dispose()`/`destroy()` 方法都不存在，
构造函数里注册的 rAF 自续循环、canvas/container 监听、`ResizeObserver`、
CSS2D 与 Stats DOM、以及挂在进程级单例上的监听全部没有对应的拆除路径。

**代码证据**（三个领域各自的摘录，保留原样）：

`AcApDocManager.ts:625-632`（csv-cmd）：

```
async destroy() {
    await this._pluginManager.unloadAllPlugins()
    this.context.doc.destroy()
    acapUninstallOpenFileDialog()
    AcTrMTextRenderer.resetInstance()
```

`AcTrView2d.ts` 相关行（lifecycle）：

```
AcTrView2d.ts:2365 this._rafId = requestAnimationFrame(this.animate)（自续，永不停）；:2295 stopAnimationLoop() { cancelAnimationFrame(this._rafId) } 全仓 0 调用点；:2344 document.body.appendChild(stats.dom)
```

`AcEdBaseView.ts:331-340`（csv-editor）：

```
const resizeObserver = new ResizeObserver(debouncedWindowResize)
    resizeObserver.observe(this._container)
```

**影响**：明确可达——cad-viewer-example 的 `onUnmounted` 会调用
`AcApDocManager.instance.destroy()`（`useAntdCadShell.ts:305`），
重新挂载时 `createInstance` 会新建第二份视图。后果分层：

1. 视图的常驻 rAF 循环在销毁后继续以 60fps 渲染（`view/AcTrView2d.ts:2364-2365`），
   且 renderer/canvas 未释放（`AcTrView2d.ts:338` 把 `renderer.domElement` 挂到 container、
   `:688` CSS2D、`:2344 stats.dom` 挂到 body，均无移除路径）；
   浏览器 WebGL context 数量有限，多轮挂载后新视图可能无法创建渲染上下文。
2. 视图在进程级单例上注册的匿名监听
   （`AcApSettingManager.events.modified :406`、`AcDbSysVarManager.events.sysVarChanged :390`、
   `renderer.events.fontNotFound :362`）无法解绑，销毁后仍回调已废弃对象。
3. 现成拆除入口 `view.stopAnimationLoop()`（`AcTrView2d.ts:2295`，全仓无调用者）
   与 `AcApProgress.destroy()`（`AcApProgress.ts:232`）都没被调用，
   `_busyIndicator`/`_openFileProgress`/`_drawStyleToolbar` 亦无 `dispose`。
4. `:533-540 acapBindCommandServices` 把闭包 `this` 写入模块级全局
   （`AcApCommandServices.ts:20`），`destroy` 无解绑。
5. `ResizeObserver` 由 document 保活 → debounce 回调闭包引用 `this`
   → 视图/场景/渲染器全部无法回收；`AcEdHoverController` 的 hover/pause `setTimeout`
   可能在视图销毁后仍触发 `host.pick` 与事件派发。

在「QUIT 后重新打开图纸」「HMR」「路由切换」这些常规路径上，每次都会泄漏一份完整视图对象图。

**最小修复建议**：为 `AcTrView2d`/`AcEdBaseView` 补齐 `dispose()`：
`stopAnimationLoop()`、移除 document keydown / canvas / `layoutManager.layoutSwitched` /
`AcDbSysVarManager` / `AcApSettingManager` 监听、`stats.dom.remove()`、
`observer.disconnect()`、`_renderer.dispose()`、`_hoverController.dispose()`；
`AcEditor` 级联到 `cursorManager`/`inputManager`/`hoverController`；
`AcApDocManager.destroy()` 调用 `view.dispose()` 与 `_openFileProgress.destroy()`；
`_drawStyleToolbar.dispose()`、`_busyIndicator.destroy()` 一并接入。
若有意不支持重建，则 `destroy()` 后应禁止 `createInstance`（或在 destroy 内断言单次生命周期）。

**验证补充**：三个领域独立复核时都确认「非假阳性」；
csv-editor 领域指出第 2、7 条 finding（本条的 editor 侧与 `AcApDrawStyleToolbar.dispose`
无调用点）同源、可一并处理；lifecycle 领域把 `AcTrView2d` 的 13 处
`addEventListener` 零 `remove` 作为契约违反的直接证据（`destroy` 注释自述 `'Destroy the view'`）。
触发条件是生命周期循环（destroy → createInstance / 卸载重挂载），
正常「重开文档」复用同一 view，因此不是每次开图都新增泄漏，
但对示例应用默认的 quit/重挂载路径是必现的。

---

## A12 进程级单例 `AcDbSysVarManager` 上的监听无退订句柄，旧数据库（38 万实体）被闭包长期持有

**位置**：`cad-viewer/packages/cad-simple-viewer/src/app/AcApContext.ts:116-138`

**类别**：memory（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。lifecycle 领域对抗式验证者 note 的关键事实：
`AcApContext.ts :66/:77/:95/:106/:111/:116/:140/:147/:152` 共 9 处 `addEventListener`、0 处 `remove`；
`:116` 挂 `AcDbSysVarManager.instance()`（`:117-123` 静态单例，全仓无 reset），
闭包捕获 `view/doc/database`；`AcApDocManager.ts:627` 仅 `doc.destroy()`，
`AcApDocument.ts:287-295` 不清库；
对照 `AcApLayerStore.ts:64/72`、`AcEdGripManager.ts:214/232` 均有配对 `remove`，属遗漏。

**问题**：`AcApContext` 的 9 个监听都没有保存句柄、没有 `removeEventListener`，
其中挂在进程级单例上的监听会在 `AcApDocManager.destroy()` 之后继续存活，
闭包长期持有旧 `view`/`doc`/`database`（整份 38 万实体）。

**代码证据**：

```
AcDbSysVarManager.instance().events.sysVarChanged.addEventListener(args => { ... if (view.hasSceneContent) { view.clear(); args.database.regen() } })（AcApContext 全文 0 处 removeEventListener）
```

**影响**：`AcCmEventManager` 只有 `push` 无自动回收（`common/src/AcCmEventManager.ts:51-53`），
`AcTrView2d.ts:390` 有同类注册。销毁之后任何一次 `SETVAR`/`LWDISPLAY` 变更
都会驱动已死 context 的 listener，对旧 view 执行 `clear()` + `database.regen()`，
即 O(N) 重派发 38 万实体到已废弃场景（主线程抖动）；
同时旧数据库无法被 GC，内存长期驻留。

**最小修复建议**：`AcApContext`/`AcTrView2d` 保存每个监听句柄并提供 `dispose()`，
由 `AcApDocManager.destroy()` 调用；`AcApDocument.destroy()` 增加 database 释放（`clear()`）。

**验证补充**：验证者修正了原 finding 的一处表述——`regen` 作用于
`args.database`（当前库），影响是「每次 LWDISPLAY 重复一次 O(N) 派发」，
而非「regen 到旧场景」；缺陷性质与 P1 定级不变。

---

## A13 `AcTrMTextRenderer._pendingGlyphKeys` 永不回收，`dispose()` 也未解绑 `fontLoaded`

**位置**：`cad-viewer/packages/three-renderer/src/renderer/AcTrMTextRenderer.ts:76、451-464、484-500`

**类别**：memory（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。tr-render 领域对抗式验证者 note 的关键事实：
`AcTrMTextRenderer.ts:456-460` 确认 `occurrence===1` 只 `set(1)` 不 `delete`，
仅第 2 次（`461`）或 `invalidateGlyphCache`（`469-475`）清理；
`registerWorkers` 只在 `AcApDocManager.ts:568` 构造期调用，
`setFontUrl`/`setDefaultFonts` 亦然，`openDocument` 不做 MText 清理，
故同一实例多次开图键无界累积成立，键含三段 JSON（`GlyphCache.ts:81-87`）
且 `estimateMemoryUsage`（`381-384`）未统计；
`:484-500` 监听在 `dispose()`（`403-414`）确未移除。
另有领域 lifecycle 独立发现同一处问题（其复核结论为 P2，见 `lifecycle.json` 第 5 条），
两侧对代码事实的描述一致。

**问题**：字形「待处理计数」Map 对只出现一次的 key 只增不删、无上限，
与真正的模板缓存（`AcTrMTextGlyphCache.ts:23-24`，512 条 / 16MiB 且有 LRU）不对称；
它还是 `AcTrMTextRenderer` 单例的实例字段，文档切换不清空。

**代码证据**：

```
    const occurrences = (this._pendingGlyphKeys.get(key) ?? 0) + 1
    if (occurrences === 1) {
      this._pendingGlyphKeys.set(key, 1)
      return rendered
    }
```

**影响**：Map 大小等于图纸中「文本 + 样式 + 颜色」的不同组合数，
而键由 `buildKey` 把 text 与 `mtextContent`/`textStyle`/`colorSettings` 的 JSON 全量拼接
（`AcTrMTextGlyphCache.ts:81-87`），单键数百字节至 KB 级；
38 万实体图纸的中文标注可达数万条唯一键 → 数 MB~数十 MB。
同一页面换图纸后前一份图纸的全部文本键仍驻留；
`:484-500` 注册到 `FontManager.instance.events.fontLoaded` 的 `onFontLoaded`
从不 `removeEventListener`（全文件仅 `addEventListener`），
于是 `resetInstance()` 后旧实例仍被全局单例持有。

**最小修复建议**：把 `_pendingGlyphKeys` 改为 `Set` 并在消费后清理，
或让其复用 `_glyphCache` 的预算（记录 occurrence 时同步淘汰）；
新增 `clearDocumentState()` 由 `AcTrRenderer.dispose()`/`AcTrView2d.clear()` 调用
以清空 `_pendingGlyphKeys` 与 `_glyphCache`；
`dispose()` 中同时 `removeEventListener` 掉 `_fontLoadedListener` 并置空。

**验证补充**：验证者明确本条与另两条泄漏（`AcTrBaseView` 从不销毁 `OrbitControls`、
`AcTrRenderer.dispose()` 不解绑 FontManager 单例监听）的关键区别：
后两者只在 `destroy() → createInstance()` 循环中新增泄漏，
而本条**在同一 `AcApDocManager` 会话内随每次打开图纸单调增长**，
因此是三条泄漏中唯一在「正常重开图纸」路径上就命中的，故只有它保留 P1，
另两条被下调为 P2；这也说明本条的修复优先级更高。

---

## A14 CI 的 lint 门禁在 HEAD 上已失败：4 个包 21 个 error，build job 必然红

**位置**：`cad-viewer/.github/workflows/ci.yml:48-49`

**类别**：build-tooling（严重度 P1，置信度 high）

**验证结论**：confirmed，原 P1，验证后维持 P1。tooling 领域对抗式验证者 note 的关键事实：
逐包执行 `eslint src/`（各包 lint 脚本即该命令）复现 2+3+3+13=21 error；
再以 `NX_DAEMON=false npx nx run-many -t lint` 复现 exit 1，
输出列出 three-renderer/cad-search-plugin/cad-viewer/cad-viewer-example 四个 project，
与 `ci.yml:48-49` 一致；`package.json:81` 的 `--config ./.eslintrc.js` 确认指向不存在的文件。

**问题**：CI 的 `pnpm lint` 在 HEAD 上就已经失败，
其中 14 个是 `simple-import-sort/imports`（自动可修），
7 个是 `cad-viewer-example` 的 `@intlify/vue-i18n/no-dynamic-keys`（不可自动修）。

**代码证据**：

```
      - name: Lint code
        run: pnpm lint
```

**影响**：`ci.yml:48` 的 lint 步骤失败 → build job 失败 →
`needs:build` 的 release(publish) 与 pages job 全部不执行。
即主分支上的 CI 长期是红的，发布与部署链路被完全阻断；
被报文件在 HEAD 上均未修改（`git status` 为空），说明不是本地脏改动的偶发结果。

**最小修复建议**：在 `cad-viewer` 下跑 `pnpm lint:fix` 修掉 14 个 import 排序错误；
手工把 7 处动态 ``t(`...${id}`)`` 改为静态 key（或对动态 key 处加
`eslint-disable` 并说明理由）；删除 `package.json:81` 的 `--config ./.eslintrc.js`。
建议 CI 增加 `lint:fix` 后 `git diff --exit-code` 的自动修复校验。

**验证补充**：验证者提醒本机直接 `pnpm lint` 会先报 nx graph 错误，
源于 `.nx/file-map.json` 残留并发重构已删除的 `__tmp_*.spec.ts`，
属本机缓存污染而非 HEAD 缺陷；CI 干净环境下复现的结论是 21 个 error、exit 1。
另注：vue-app 域 P3 的 `AntdPropertiesPanel.vue:108` 动态 i18n key 与本条的 7 条
`no-dynamic-keys` 是同一类问题的不同落点。

---

## 为什么这些是 P0/P1 而不是更低

**本次评审没有任何 confirmed P0。** 109 条 finding 中 confirmed 104 条、refuted 5 条，
被验证者修正后的最高严重度就是 P1；本章 14 条即全部 P1（16 条原始 P1 经去重合并），
验证者全部维持原级，无上调也无下调。

本章采用的判定标准：

- **P0（本章为空）**：崩溃 / 数据损坏 / 主线程完全卡死且默认路径必现，无规避手段。
  多条 finding 原被评审员标为 P1，验证者认为其触发条件依赖畸形输入、
  非默认路径或可达性有限，因此没有任何一条被上调到 P0，
  例如 `TABLE rows/cols` 无上界（`dm-entity`，P1→P2，需畸形文件）、
  `Float64Array` 对齐（`dm-database#4`，维持 P2，异常被每实体 `try/catch` 捕获）。
- **P1（本章 14 条）**：明确的资源泄漏 / 竞态 / 热路径性能回归 / 结果错误，
  且在**默认或常见路径**上可达，或落在 95MB / 38 万实体目标场景的主链路上：
  崩溃且破坏撤销栈（A1）、主线程冻结级别的复杂度退化（A2）、
  每实体/每 mousemove/每次选择的热路径（A3、A4、A5）、
  确定性的结果错误（A6~A10）、以及每次生命周期循环或每次开图都累积的资源泄漏（A11~A13）、
  阻断发布链路的确定性 CI 失败（A14）。
- **P2/P3（不在本章）**：需要额外前提（畸形文件、已废弃路径、冷路径、
  单个小对象、潜在但现网不可达），或仅影响可维护性与文档。
  本次验证者把 11 条原始 P1 下调为 P2，本章未收录，
  包括：`getBoundingClientRect` 强制重排（`csv-editor`，实测约 3~4 次而非 12~15 次）、
  LWPOLYLINE 凸度采样 / DXF 210 挤出 / TABLE 行列入参（`dm-entity`，夹具统计不支持原假设）、
  布局视图与 `OrbitControls` 泄漏、打开文档无 in-flight 守卫（`lifecycle`）、
  `AcSvgRenderer.image()` 哑对象（`plugins-heavy`，仅含 IMAGE/OLE2FRAME 的图纸）、
  `splitLineSegmentsClusters` 的 Uint16 截断（`tr-batch`，多段线已走 Uint32 路径）、
  `AcTrBaseView` 的 `OrbitControls` 与 `AcTrRenderer` 的 FontManager 监听
  （`tr-render`，仅 destroy/createInstance 循环）、QuickSelect 全表扫描
  （`vue-app`，仅用户主动打开对话框）。

**诚实标注：触发条件较窄的 P1。** 下列条目虽定级 P1，但并非「每次普通操作必现」，
其 P1 依据是「一旦触发即落在目标图纸主链路，且后果重」：

- **A1**：需单批 ≥ 约 12.5 万实体（本机实测 120000 正常、125000 抛 RangeError），
  即撤销一次极大范围的框选删除；普通撤销不触发。
- **A9**：仅在 SVG/PDF 导出（冷路径）触发，但 38 万实体图纸普遍含重复块引用，
  且污染会回流到实时 three 渲染路径，故仍判 P1。
- **A11**：需 `destroy() → createInstance()` / 卸载重挂载（示例的 quit、HMR、路由切换）
  才新增泄漏；正常「重开文档」复用同一 `AcTrView2d`，不新增。
- **A12**：泄漏本身需生命周期循环；P1 的另一半依据是「旧 38 万实体数据库被闭包长期持有」
  以及每次 `SETVAR`/`LWDISPLAY` 触发一次 O(N) 重派发。
- **A4**：主症状需 grip 拖拽期间每 mousemove 深克隆，长顶点实体（如 10 万顶点多段线）
  才明显；残留预览的竞态窗口更窄（仅 `AcTrGroup`/`AcTrGlyphEntity` 真 await 时）。

相对而言，A2、A3、A5、A6、A8、A13、A14 属于默认/常见路径就命中，
是本章中优先修复收益最确定的一组。

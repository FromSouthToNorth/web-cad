# 千树塔 DXF 加载性能 · P1 修复实测报告

> 承接 `docs/02-性能优化/千树塔DXF P0修复实测报告.md`（P0 档 13 项）
> 施工依据：`docs/02-性能优化/千树塔DXF加载性能瓶颈分析（Agent Teams）.md` 第 3.2 节
> 目标文件：`cad/千树塔井上下对照图（2025.04）.dxf`（112,271,908 B / 6,301,264 pair / 434,083 模型空间实体）
> 环境：macOS / Node v24.19.0；解析基准为主线程同步路径（未启用 worker、不含渲染）
> 执行方式：Agent Teams 分五个波次、文件清单互斥；每波次以 `pnpm build` + 全仓 Jest + `tools/bench` 为闸门

---

## 1. 最终效果（相对本会话开始时的原始基线）

| 指标 | 原始基线 | 最终 | 变化 |
| --- | --- | --- | --- |
| `db.read` best（3 次重复） | 2709.49 ms | **1642.51 ms** | −1066.98 ms（**−39.4%**） |
| `db.read` avg | 2789.91 ms | **1656.97 ms** | −40.6% |
| 每实体 | 6.24 µs | **3.78 µs** | −39.4% |
| **单次运行峰值 heapUsed** | **654.8 MB** | **352.5 MB** | **−302.3 MB（−46.2%）** |
| 单次运行峰值 RSS | 926.4 MB | **625.0 MB** | −301.4 MB（−32.5%） |
| 3 次重复峰值 heapUsed | 1210.5 MB | **647.5 MB** | −46.5% |
| 3 次重复峰值 RSS | 1539.3 MB | **933.1 MB** | −39.4% |
| 纯词法（6,301,264 pair） | 867 ms | **510 ms** | −357 ms（−41.2%） |
| 解析后常驻 heapUsed | 674.2 MB | **366.5 MB** | −307.7 MB |
| 模型空间实体数 | 434,083 | 434,083 | **不变** |
| 构建 / 测试 | — | 18 包成功；**357 套 / 2320 通过** | 用例 937 → 2320 |

**测试说明**：全仓仍有 2 套失败（`packages/cad-viewer/__tests__/polarTrackingMenu.spec.ts`、`AcApHatchRibbonCmd.spec.ts`），二者 import 的源文件在 **HEAD 中就不存在**（`git cat-file -e HEAD:<path>` 已核实），属仓库既有破损用例；另有 2 套 skipped。

⚠️ **读数方差**：`db.read` best 在多次同口径运行中落在 **1588 ~ 1723 ms** 区间（约 ±8%），取决于机器负载。上表用最后一轮的 1642.51 ms。**结论在区间内都成立**（相对基线 −36% ~ −41%），但不要把单轮数字当作精确常数。

### 内存收益的构成（分项实测之和与端到端自洽）

| 来源 | 波次 | 实测 |
| --- | --- | --- |
| 颜色/透明度惰性分配 + ByLayer 哨兵 | P0 | −31~35 MB |
| `_xDataMap` 惰性化 | P1-1 | −157.7 B/实体 ⇒ ≈ −65 MB |
| `events`（2 manager + 2 listeners 数组）惰性化 | P1-1 | −176.0 B/实体 ⇒ **−76.4 MB** |
| `changed` + `_previousAttributes` 惰性化 | P1-1 | −128.0 B/实体 ⇒ **−55.6 MB** |
| LINE/TRACE 默认法向量惰性化 | P1-2 | −96 B/实体 ⇒ **−39.6 MiB** |
| **解析峰值小计** | | **≈ −290 MB**（端到端实测 **−302 MB**，吻合） |
| 批槽聚合包围盒不再物化逐槽 `Box3` | P1-3 | 247.98 B × 434,083 ⇒ **−107.6 MB（常驻）** |
| 渲染侧两张逐实体索引不再存单元素数组 | P1-7 | 23.18 × 2 ⇒ **−46.37 MB（常驻，N=434,083 直接实测）** |
| wire 分块回传 | P1-10 | 主线程 wire 常驻 **67.0 → 11.8 MB** |
| **渲染/常驻侧小计** | | **≈ −209 MB** |

---

### 1.1 ⚠️ 严重缺陷修复：分块 wire 协议与 worker 消息分发冲突（加载卡在 ~11%）

**症状**：图纸无法加载，进度停在约 11%。

**根因**（代码级确认）：`AcDbBaseWorker.setupMessageHandler()` 把 `self.onmessage` 上的**每一条**消息都当作任务分发，从不检查消息类型：

```ts
self.onmessage = async event => {
  const { id, input } = event.data   // 修复前：无任何类型判断
  ...
  await this.executeTask(input, context)
}
```

而 P1-10 的分块协议新增了主线程 → worker 的**流控消息**（`{type:'chunk-ack'}` / `{type:'chunk-stop'}`），它们没有 `id`。真实 Worker 里 `onmessage` 是最先注册的监听器，因此每条 ack 都会：

1. 先被基类处理器当成任务 → `executeTask(undefined)`；
2. `executeTask` 的前三条语句正是 `this._credits = 0` / `this._stopRequested = false` / **`this._creditWaiters = []`** —— 这会**清空正在等待配额的生产者 promise 数组，把它变成孤儿**；
3. 随后才在 `acdbCreateDxfPairReader(undefined)` 处抛错（错误被 `catch` 吞成一条 `id: undefined` 的错误响应）；
4. 紧接着子类的 `addEventListener` 处理器执行 `_grantCredit()`，发现等待队列已被清空，于是只记账不加唤醒。

结果：真正的 drain 永远停在 `await ensureCredit()` 上 → 主线程等不到第 2 块 → **进度停在第 1 块解析完的时刻（~11%）**。**任何超过 1 块的图纸都会命中**；单块的小图（如测试夹具）不受影响 —— 这正是它躲过全部闸门的原因。

**修复**（两处，纵深防御）：
1. `AcDbBaseWorker`：只把**任务消息**交给 `executeTask` —— `if (!data || typeof data.id !== 'string') return`。任务消息定义为 `{ id: string; input }`，流控消息没有 `id`。
2. `AcDbDxfParserWorker`：把配额计数从实例字段下沉到 `executeTask` 的调用帧（`let credits/waiters` 局部变量），实例上只保留一个 `_activeStream` **路由句柄**。这样即使将来又出现意外重入，也不可能清空正在运行的那条流的等待队列。

**回归测试**：新增 `packages/data-model/__tests__/AcDbBaseWorkerMessageDispatch.spec.ts`（3 例），含一个「生产者停在配额等待中、流控消息必须唤醒它」的用例。**判别力已用变异验证**：把基类守卫临时还原成修复前的写法后，该 spec 由 3 passed 变为 **2 failed**，失败信息为 `Expected: 1, Received: 4` —— 即每条 ack 确实重入了一次 `executeTask`，与上述根因完全一致。

**修复后实测**（真实 worker 类 + 真实 Worker 全局垫片 + 真实 manager/converter，112MB 图纸）：

| 路径 | 墙钟 | 消息数 | 模型空间实体 |
| --- | --- | --- | --- |
| 分块（默认） | **1486 ms** | 35（34 块 + 汇总） | **434,083** |
| 回退（`acdbDxfWireChunking.enabled = false`） | 2431 ms | 2 | **434,083** |

即分块路径在真实 worker 下端到端快 **945 ms**，且两条路径实体数一致。

**应急回退**（若线上仍出现卡住）：`acdbDxfWireChunking.enabled = false` 可切回 P1-10 之前的整块协议。该开关已从包公开 API 导出，可在运行时翻转、无需改源码重建。

**诚实交底 —— 这条修复的证据边界**：我**没能在 Node 端复现出「修复前必卡」**。原因很有价值：此前 `/tmp/p110` 里那个「真实 worker」端到端 harness，其 worker 侧是**手写的配额协议副本**，根本没有使用 `AcDbBaseWorker` —— 也就是说它从结构上不可能覆盖到这个 bug，这正是缺陷逃过全部闸门的原因。因此：

- 「基类把流控消息当任务分发、并清空等待队列」——**已由单元测试与变异验证确证**；
- 「这就是你遇到的 11% 卡住的**唯一**原因」——**尚未由端到端复现证明**，属于按机理与代码路径推理。若重建后仍卡，请提供浏览器控制台输出与 Network 中 `dxf-parser-worker.js` 的响应，我再继续定位。

---

## 2. 必须说明的两笔取舍

### 2.1 解析让出预算：Node 变慢，浏览器待验证

时间曲线：**2709 →（P0）1606 →（P1）1642 ms**。其中 +117 ms 来自 **P1-13 把解析让出预算 50→16 ms**（本机 Node 没有 `requestAnimationFrame`，让出回落到 `setTimeout`，是真实代价）。后续波次（P1-11 的 memcpy 归零、P1-3/P1-10 等）把这部分又赚了回来，最终 1642 ms 已优于 P0 单独时的 1606 ms + 方差范围之内。

报告的真 Chromium 实测结论是：更频繁的让出在浏览器里**墙钟只 +0.2%**，换来 **long task 37~40 次 → 0 次、帧率 20 → 48 fps、maxFrameGap 50.4 → 20.9 ms**。

⚠️ **本会话三次尝试真 Chromium 量测均未取得可用数据**（软件渲染下 112MB 图纸的加载使 headless shell 反复重启；harness 的 `WAIT_MS` 默认 30 分钟导致长时间无输出），最终中止以免阻塞验收闸门。**因此这笔交易目前只有报告的历史实测支持，需要真机 A/B 复核。** 回滚点只有两处常量：`ACDB_DXF_PARSE_YIELD_BUDGET_MS`（16）与 `ACDB_DXF_PARSE_ENTITY_BATCH_SIZE`（250）。

### 2.2 渲染侧收益的计时口径

P1-3 ~ P1-8 的收益**不在 `db.read` 里**，而在「解析之后、首帧之前」的渲染对象构建阶段，本机是软件渲染、无真实 GPU，因此：

- 报告出的毫秒数（P1-5 的 −1918 ms、P1-6 的 −877 ms、P1-4 的 0.25~0.5 s、P1-3 的脏同步 5.6×）**全部是 CPU 侧、可在 Node/Jest 定量复现**的部分；
- **真实 GPU 的绘制/填充率收益一律未测**，本报告不含任何 GPU 数字。

---

## 3. 逐波次结果

### 3.1 第一波（调度与交互）

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| P1-13 | 解析让出 50→16 ms、实体批 1000→250、解开与 `minimumChunkSize` 的耦合 | ✅ 落地。**未改共享常量** `ACCM_DEFAULT_UI_YIELD_BUDGET_MS`（它同时供 drain gate 与 `AcDbRenderingCache` 使用），改为在 data-model 内新增 `ACDB_DXF_PARSE_YIELD_BUDGET_MS` / `ACDB_DXF_PARSE_ENTITY_BATCH_SIZE`。并按报告要求**撤销**了 `渲染与解析性能瓶颈分析.md` 中「把 `setTimeout(0)` 推广到解析路径」的 M3 建议 |
| P1-14 | drain 让出 300→16 ms **且同时** `setTimeout(0)`→rAF | ✅ 两项同时落地（报告警告只改其一会更差）；另加「单个巨型实体超预算也让出」保护 |
| P1-15 | 打开遮罩吞掉指针交互 | ✅ 但**收窄为 per-instance 选项**：`.ml-ccl-overlay` 被 `AcApBusyIndicator` 共用（HTML 导出 / XATTACH / 实体预览 / 转 DXF），全局放开会让这些「有意阻塞」的遮罩变可穿透。新增 `passthroughPointer`（默认 false），仅打开遮罩传 true |
| P2-8 | 示例应用 `progressiveRendering` 默认 `false` | ✅ `FileUpload.vue` 改为 `ref(true)`，与 `App.vue` 及文档 M2 的实施记录对齐；UI 切换保留 |
| P1-22 | OPENPROF 无条件开 RenderingCache profiling | ✅ `profiling = true` 移入打印开关分支 |

### 3.2 第二波（生命周期与状态机）

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| P1-19 | `destroy()` 不拆视图 ⇒ **每轮 quit→重开泄漏整张 `AcDbDatabase`（634.8 MB 堆 / 922 MB RSS）** | ✅ `AcTrView2d.dispose()`（幂等；停 rAF → 解 4 类全局监听 → 清场景/批次 → **`context.database = undefined`** → `renderer.dispose()`+`forceContextLoss()` → 拆 DOM 并置 canvas 0×0）+ `AcApDocManager.destroy()` 调用链 |
| P1-20 | 陈旧 sysVar 监听器对新图**重放整轮转换**（434k 实体）+ 进度条 100%→20% 回跳 | ✅ `AcApContext.destroy()`（9 处监听从 `bindEvent` 统一登记/注销 + `_destroyed` 守卫）+ sysVar 监听器按 **database 实例身份**过滤陈旧事件 |
| P1-17 | `.dwg` 未注册时旧图被当「部分成功」 | ✅ 新增 `AcDbDatabase.wasResetForLatestOpenAttempt` 收紧判据 + 失败分支不再污染 `_fileName`/`docTitle`（`adoptFileIdentity()`）。报告方案 ③ 经核实 **HEAD 已是现状** |

### 3.3 第三波（解析侧内存与数据通道）

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| P1-1 | 逐实体框架容器惰性化 | ✅ **−215 MB 量级**（`_xDataMap` −65 / `events` −76.4 / `changed`+`_previousAttributes` −55.6 MB）。`attributes` 按指令未惰性化（每次读写，收益≈0）。P0-6 的裸写快速路径改为读私有 `_events`，零监听者时完全不物化 events |
| P1-2 | 几何原语内存 | ✅ **−39.6 MiB**（LINE −35.7 + SOLID/TRACE −3.9）。采用**惰性 getter 而非共享实例**，因此不需要写时复制，规避了报告警告的「共享实例被就地写坏」风险。第②项（LINE 端点惰性化）**经实测否决**：渲染期 `worldDraw` 必然读端点，真实流程净收益≈0 |
| P1-9 | worker 失败=可用性悬崖 | ⚠️ **partial（改用方案②）**：「transfer 前 0 字节就绪探测」——字节尚未 transfer 时可安全回退主线程。顺带修掉 worker 死亡后**永久 isBusy**、`postMessage` 抛错未清理 pending、长驻 worker 下每次读泄漏一对监听闭包。方案①（Blob 主线程直传）需改清单外的 `AcDbDxfParserWorker.ts` 输入签名 |
| P1-21 | 主线程整体物化 112 MB 再 transfer | ⚠️ **partial**：(a) 输入类型收窄——`instanceof ArrayBuffer` 对视图/SharedArrayBuffer 不成立会静默退化成深拷贝，现按五分支处理（局部视图**有意**保留拷贝以免 detach 调用方共享 buffer）；(b) **提前释放 wire**：实测 ENTITY START 时刻 `arrayBuffers` 173.4→107.3 MB（−66.1 MiB）。①（>64 MB 分级）与 ②（Blob 直传）因需 i18n key 与清单外文件未做 |
| P1-11 | drain 容量估算与 `growI32` 策略 | ⚠️ **partial，推翻了报告的一个数字**：报告给的 `seed = estimated*0.55` 在目标图上**不省反升**（峰值 28.04→29.64 MB）。改用 `estimated*0.4`：峰值 28.04→**12.80 MB**、memcpy 20.04→**0 MB**、整条 drain 采样峰值 `arrayBuffers` −11.2 MB、maxRSS −7~9 MB，wire 逻辑哈希不变。第②条（`growI32` 改 1.1×）**经验算否决** |
| P1-12 | `readOnly` 是文档化但从未实现的死选项 | ⚠️ **partial**：按方案①真正实现——新增 `AcDbDatabaseTransactionManager.suspendRecording()`（计数、可嵌套、幂等），`db.read` 全程挂起录制并强制 `strictMode=false`，`finally` 还原。实测事务内 read `changeRecords=0`（挂起态 0.95 µs/次 append vs 录制态 30.89 µs/次，**32×**） |

### 3.4 第四波（渲染侧 CPU 与逐槽内存）

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| P1-3 | 批级剔除不再物化逐槽 `Box3` | ✅ 新增 `_localBoundsAt`/`_localSphereAt` 钩子，`AcTrBatchedLine`/`Line2` 覆写为直扫 packed 顶点。实测 15 万槽：物化 `Box3` **150,000 → 0**；单 `Box3` 247.98 B ⇒ 434,083 槽 **−107.6 MB**；脏同步 23.55→**4.19 ms（5.6×）**；box 并集路径比值 1.00（无 CPU 回退）。**过程中发现并修掉一个真实回归** `AcTrBatchedBoundsEqualSkip`（等范围重写快路径原本依赖已物化的逐槽 Box3） |
| P1-4 | 渐进 fit 的 500 ms 全量 bbox 重建 | ✅ 新增 `_progressiveFitBox`（O(1) 增量并集，含多图层 INSERT 桶）供 3 处 `afterGeometryBatch` 使用；**终态 fit 仍走 `resolveLayoutFitBox`，初始视图逐位不变**。实测单次全量 = 434,083 次 `Box3.applyMatrix4` ≈ **52.92 ms**（与报告 52 ms 吻合），O(1) 全程 1.51 ms（≈35×）；按 2 次/秒 × 5 s ⇒ 删掉整轮 **0.25~0.5 s** |
| P1-5 | 直批捕获占位 `AcTrEntity` | ✅ **−1918 ms**（报告估 0.6 s，实测为其 3 倍）：`new AcTrEntity()` 434,083 次 = 1,919 ms → 共享占位 1.7 ms。占位对 `dispose()`/`removeFromParent()` 双免疫、每渲染器一个实例（避免模块级单例持有废弃 context 造成新泄漏）；用例证明占位不进入产物、连续 4 轮捕获仍是同一实例 |
| P1-6 | SOLID/TRACE 三角化快路径 | ✅ **−877 ms**（真实 40,811 个 SOLID：快路径 1,607 ms vs 通用 2,484 ms；31,605 命中 / 9,206 回退）。仅「单环 + 无子环 + 去重后 3~4 点 + 有限 + 非零面积 + 不自交」才走快路径，其余回退原管线。**写出第一版扇形快路径时对凹四边形多覆盖面积（面积 55 被算成 75），被等价性用例当场抓住**，改为按有向面积选对角线后才通过 |

### 3.5 第五波（索引与分块 wire）

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| P1-7 | 渲染侧逐实体索引的单元素数组 | ✅ ① `_entitiesMap` 单槽存裸对象、② `_entityLayerIndex` 单层存裸对象 ⇒ **−46.37 MB**（23.18 × 2，N=434,083 直接实测、无外推）。读取全部改走零分配迭代器 `forEachEntitySlot`/`visitEntityLayers`；0/1/2 基数各有专门用例；把源码临时改回「一律数组」后仅白盒表示断言失败、全部行为断言一致 |
| P1-8 | 空间索引转换期批量装载 | ✅ 由我本人补上（原被文件清单挡住）：`ensureChildIndex` 的 existing / 新建两个分支改用 `clear()` + `load()`（空树上的真 OMT 批量构建），2 行改动，既有 `AcTrHierarchicalSpatialIndex.spec.ts` 对这两条路径的用例全绿 + 新增 `load/insert` 查询等价用例。**本图收益≈0**（ENTITIES 内 INSERT/HATCH 均为 0），INSERT 密集图 23~68 ms |
| P1-10 | worker → 主线程 wire 分块回传 | ✅ 主管线落地：按**记录边界**切 ≈2 MiB 块 + credit 背压，主线程常驻 **67.0 → 11.8 MB**（报告估 4 MiB；1 MiB 块可到 7.0 MB），真 `worker_threads` 并行墙钟 **−736 ms**。显式区分「暂时无数据」与「EOF」（报告点名的静默截断陷阱），靠 `atChunkBoundary()`/`ensurePairs()` 在实体边界补块；字符串表按块增量 + **绝对 id**（id 非全局单调，作者第一版用只前进游标因此静默解出 undefined，被自己的用例抓住）；块内绝不切在 `VERTEX`/`SEQEND` 之前。**顺带修掉两个真实 bug**：`AcDbWorkerChunkQueue.end()` 丢弃已入队块（会导致静默截断）、worker credit 一次 ack 放行两块。单块回退开关保留（`acdbDxfWireChunking.enabled`，默认 true） |

---

## 4. 对原报告的修正

| # | 报告原文 | 核实结果 |
| --- | --- | --- |
| 1 | P1-11「`stringIndices` 种子 `estimated*0.55`」 | **该值在目标图上更差**（峰值 +1.60 MB）。改 `0.4` 后峰值 −15.2 MB、memcpy 归零 |
| 2 | P1-11「`growI32` 改 `needed*1.1`」 | **经验算否决**（+28.8 MB memcpy 换 −3.44 MB 峰值；估计偏低时累计拷贝放大 5~10×） |
| 3 | P1-2「LINE 端点惰性化 ≈47 MB」 | **在本图收益≈0**：渲染期 `worldDraw` 必然读端点，延迟物化会被全部还回。已实测否决，未实现 |
| 4 | P1-17「方案③ 在 `db.read` 里先查 converter 再 `clear()`」 | **HEAD 已是现状**，无工作可做 |
| 5 | P1-19「解绑 `AcTrRenderContext`」 | 该文件实际位于 **three-renderer 包**（报告锚点写成了 cad-simple-viewer）。已通过 `this._renderer.context.database = undefined` 等价完成 |
| 6 | P1-1「`events` 改惰性」 | 报告警告「不能用 getter，否则被 `set` 内部击穿」——正确且关键。最终为私有 `_events` + 公开 getter |
| 7 | **P1-6「SOLID 是固定 4 顶点直四边形」** | **前提错误**：扫描全 DXF，40,811 个 SOLID **全部是 3 角点**（3 个不同角点 33,055 个、2 个角点 7,756 个、**4 角点 0 个**）。快路径仍有效（收益主要来自 3 点环绕过 `THREE.Shape`/earcut），但报告的形态描述不成立 |
| 8 | P1-7「`idMap` 只在需要 `removeById`/`getById` 时懒建，可省 14 MB」 | **与实现不符，删除会破坏选择**：`idMap` 的唯一消费者是 `insert` 的同 id 去重（`removeById` 走 `tree.remove` 谓词，从不读它）。真实 rbush 实验证明：无去重时同一 id 同盒连续两次 insert ⇒ search 命中 2 条；生产路径 `AcTrLayout.registerEntitySpatialIndex` + `ensureChildIndex` 确实会触发。**已保留 idMap** |
| 9 | P1-7 ②「`_entityLayerIndex` 位掩码可省 ≈35 MB」 | 实测为 **23.18 MB**（报告基线取自另一次 40.5 MB 的测量，而单元素数组在两表上成本相同，均为 90 B/条） |
| 10 | P1-5「≈0.6 s」/ P1-6「≥0.2~0.3 s」 | 实测分别为 **1.918 s** 与 **0.877 s**，均显著高于估算 |
| 11 | P1-3「−103 MB」 | 实测 **−107.6 MB**（247.98 B × 434,083），吻合 |

---

## 5. 未完成项（明确交底）

| 项 | 状态 | 原因 |
| --- | --- | --- |
| P1-7 ③ rbush `idMap` 懒建 | **明确否决** | 见上表第 8 条，会破坏选择/命中 |
| P1-7 ④ 批槽 objectId 惰性保存 | **明确否决** | `objectId` 被 `AcTrBatchedMixin` 用于 bbox 过滤与 raycaster 命中反查，删除会破坏拾取 |
| P1-9 方案① 真正 Blob 主线程直传 | partial | 需改 `AcDbDxfParserWorker.ts` 输入签名与 `AcDbDatabase.read` 公开签名 |
| P1-21 ① 大文件分级确认 / ② Blob 直传 | partial | ① 需新增 i18n key（4 个 locale 文件）+ `AcDbOpenDatabaseOptions.ts`；② 同 P1-9 |
| P1-12 把 `readOnly` 转发给转换器 | partial | 需改 `AcDbDatabaseConverter.ts`；且仓库内无转换器消费该字段，属语义清理 |
| P1-8 在 INSERT/HATCH 密集图上的收益 | 已实现未量化 | 本图 ENTITIES 内 INSERT/HATCH 均为 0 |
| P1-10 报告方案 ④（增量 flush 提前出图） | 未做 | 需改 `AcDbDatabase.ts`（清单外）；本次已用「首块到达即开始语义构建」拿到主要时间收益 |
| ~~P1-10 新 API 未从包 barrel 导出~~ | ✅ **已补** | 已把 `acdbDrainDxfPairsChunked` / `acdbMakeDxfPairChunkReader` / `acdbJoinDxfPairWireChunks` / `acdbDxfWireChunking` / `ACDB_DXF_WIRE_CHUNK_BYTES` 及 4 个类型、`AcDbWorkerChunkSession` 逐层导出（`base/index.ts` → `converter/worker/index.ts` → `converter/index.ts` → `src/index.ts`）。实测 `require('@hy/data-model').acdbDxfWireChunking.enabled === true`，**回退开关现在可在运行时翻转，无需改源码重建** |

**必须真机验证的遗留问题**（本机软件渲染 + 无真实 GPU）：
1. **P1-13/P1-14 的浏览器收益**（long task 归零、帧率、输入延迟、drain 墙钟增幅 <10%）——三次尝试均未取得数据。**根因已定位**：`bench/progressive-trace.html`/`progressive.ts` **不在生产构建产物里**（`packages/cad-viewer-example/dist/bench/` 不存在），因此 `pnpm preview` 无法服务该页，必须起 **dev server**（`pnpm serve`）；而 dev server 的 vite watcher 会因新增被监听文件（112MB fixture）崩溃，且软件渲染下 434k 实体的加载使 headless shell 反复重启。未来在**真机 + 真实 GPU**上复现的步骤：
   ```bash
   cd cad-viewer
   cp "/Users/huangyu/Documents/TypeScript/web-cad/cad/千树塔井上下对照图（2025.04）.dxf" \
      packages/cad-viewer-example/bench/fixtures/qst.dxf    # 必须在起服务之前复制
   pnpm serve &                                             # dev server，非 preview
   PLAYWRIGHT_EXE=~/Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell \
   WAIT_MS=90000 node packages/cad-viewer-example/bench/collect-progress-trace.cjs qst.dxf http://127.0.0.1:4173
   rm packages/cad-viewer-example/bench/fixtures/qst.dxf    # 该目录未被 .gitignore，务必删除
   ```
   注意 `WAIT_MS` 默认 1,800,000ms（30 分钟），不设小值会看起来像卡死；harness 在超时后**仍会写出 trace**。另外 `progressive-trace.ts` 目前**不采集 long task**（只记 progress/regen/clear/overlay），要验证 P1-13 需要在 `page.addInitScript` 里注入 `PerformanceObserver({type:'longtask'})` 或改该文件后重新构建。
2. **P1-19/P1-20 的内存判据**：quit→重开 ×3 后 heapUsed 差 <50 MB、存活 WebGL 上下文数恒为 1、无 `regen` 事件。
3. **P1-3~P1-8 的 GPU 侧收益**与「画面看起来正确」（只能证明几何等价，不能证明像素一致）。
4. **P1-10 在真实 Chrome Worker 下的表现**：Node `worker_threads` 与浏览器 Worker 的序列化/调度/消息延迟不同；每块 `strings`（≈19 MiB heap）在浏览器里要结构化克隆，Node harness 未建模这部分成本。
5. 浏览器渲染进程真实峰值内存（352.5 MB 是 Node 口径）。

---

## 6. 复现命令

```bash
cd cad-viewer

pnpm build                                          # 18 个项目
pnpm test                                           # 357 套 / 2320 通过（另 2 套为 HEAD 既有破损）

# 时间：3 次重复取最优
node --expose-gc tools/bench/bench-parse.cjs \
  "/Users/huangyu/Documents/TypeScript/web-cad/cad/千树塔井上下对照图（2025.04）.dxf" \
  --repeat 3 --gc
```

单次运行的阶段与峰值内存（§1 的「单次运行」一行来自此脚本）：

```bash
node --expose-gc /tmp/dxfscan/phase-bench.cjs \
  "/Users/huangyu/Documents/TypeScript/web-cad/cad/千树塔井上下对照图（2025.04）.dxf"
```

---

## 7. 改动范围

源码（P0 的 12 个文件之外）：

| 包 | 文件 | 对应项 |
| --- | --- | --- |
| common | `AcCmObject.ts`、`AcCmEventManager.ts`、`AcCmYieldToUi.ts`（注释） | P1-1、P0-6、P1-13 |
| data-model | `base/AcDbObject.ts`、`base/AcDbDxfPairWire.ts`、`base/AcDbDxfFiler.ts`、`dxf/AcDbDxfDocumentReader.ts`、`dxf/AcDbDxfParserWorker.ts`、`dxf/AcDbNativeDxfConverter.ts`、`converter/worker/AcDbWorkerManager.ts`、`database/AcDbDatabase.ts`、`database/AcDbDatabaseTransactionManager.ts`、`database/AcDbSysVarManager.ts`（注释）、`entity/AcDbLine.ts`、`entity/AcDbTrace.ts`；barrel：`src/base/index.ts`、`src/converter/worker/index.ts`、`src/converter/index.ts`、`src/index.ts`（导出分块 wire 的公开 API 与回退开关） | P1-1、P1-2、P1-9、P1-10、P1-11、P1-12、P1-13、P1-20、P1-21 |
| three-renderer | `batch/AcTrBatchedMixin.ts`、`batch/AcTrBatchedLine.ts`、`batch/AcTrBatchedLine2.ts`、`batch/AcTrBatchedGroup.ts`、`renderer/AcTrRenderer.ts`、`object/AcTrLineGeometryBuilder.ts`、`object/AcTrPolygon.ts` | P1-3、P1-5、P1-6、P1-7 |
| cad-simple-viewer | `view/AcTrView2d.ts`、`view/AcTrLayout.ts`、`view/AcTrProgressiveOpenFitController.ts`、`view/AcTrDirectBatch.ts`、`spatialIndex/AcTrHierarchicalSpatialIndex.ts`、`app/AcApContext.ts`、`app/AcApDocManager.ts`、`app/AcApDocument.ts`、`app/AcApProgress.ts`、`app/AcApOpenFileProgressController.ts`、`app/AcApOpenFileProfiler.ts` | P1-4、P1-7、P1-8、P1-14、P1-15、P1-17、P1-19、P1-20、P1-22 |
| cad-viewer-example | `components/FileUpload.vue` | P2-8 |

文档：`渲染与解析性能瓶颈分析.md`（撤销 M3 建议）、`性能优化总结.md`、`框选大量对象性能分析.md`、`架构图.md`（修正「回退主线程」的失效描述）。

测试：新增 14 个 spec 文件（含 `AcDbDxfPairWireChunked.spec.ts`、`AcDbDxfChunkStream.spec.ts`、`AcTrBatchedAggregateBounds.spec.ts`、`AcTrAreaFillFastPath.spec.ts`、`AcTrDirectBatchPlaceholder.spec.ts`、`AcTrBatchedGroupEntitySlots.spec.ts`、`AcTrLayoutEntityLayerIndex.spec.ts`、`AcTrRBushSpatialIndexBulkLoad.spec.ts` 等），全仓用例数 937 → 2320。

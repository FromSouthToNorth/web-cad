# 千树塔井上下对照图 DXF 加载性能瓶颈分析（Agent Teams）

> 分析对象：`cad/千树塔井上下对照图（2025.04）.dxf`（112,271,908 B / 6,301,264 pair / 434,083 模型空间实体）
> 方法：两轮共 11 个审计单元 + 9 个对抗性验证单元（可追溯报告单元：7 份审计报告 + 5 份验证报告，覆盖 38 条 findings、38 条裁决）
> 采信规则：**只采信 confirmed；partially-confirmed 一律把 correction 并入结论并使用修正后的估算；refuted 只进第 5 节，绝不进第 3 节优先级表。**
> 本报告只写文件 `docs/02-性能优化/千树塔DXF加载性能瓶颈分析（Agent Teams）.md`，未改动仓库任何其他文件。
>
> ⚠️ **P0 档已施工完成，本报告第 3.1 节的预估量级已被实测取代。** 实测结果、对若干预估的修正（P0-2 高估、P0-9 属伪收益应删除、P0-4b 方案不安全）以及前后对比数据，见 `docs/02-性能优化/千树塔DXF P0修复实测报告.md`。
>
> ⚠️ **P1 档已施工完成（五个波次）。** 实测结果、对报告若干预估的修正（P1-11 的种子比例更差、P1-11 的 `growI32` 方案经验算否决、P1-2 的 LINE 端点惰性化在本图收益≈0、P1-17 的方案③ HEAD 已是现状、**P1-6 的「SOLID 是 4 顶点」前提错误（实测全部为 3 点）**、P1-7 的 `idMap` 懒建会破坏选择）以及未完成项清单，见 `docs/02-性能优化/千树塔DXF P1修复实测报告.md`。**第 3.2 节中仅剩 P1-9/P1-21 的 Blob 主线程直传、P1-12 的选项转发、P1-10 的方案④ 未做（均因需改动公开 API 或清单外文件）。**

---

## 0. 结论摘要

**一段话**：这张图的加载成本不是"某个热点函数慢"，而是三层结构性问题的叠加——**词法层的 double 快路径判据失效**（读 883ms 里约 40% 花在"建串 + `Number()`"回退上）、**语义层的按实体框架开销**（每个实体 848B 裸对象里 87% 是永不使用的容器，66.1MiB wire 在整个语义构建期常驻）、以及**调度层的三段式串行**（`beginEventBatch` 把 43.4 万次 `entityAppended` 全量排队到解析结束才派发，导致 progressive 渲染只覆盖打开墙钟的后段，首几何最早出现在 3.0s）。加上渲染侧 5 份逐实体重复索引（≈131MB）与逐槽 `Box3`（103MB）长期常驻，浏览器端真实常驻堆逼近 0.95GB。**P0 档（低风险、函数级小改）预计可直接回收解析侧 ≈600~1000ms 与常驻 ≈80MB；P1 档可再回收 ≈0.8~1.5s 首帧前耗时与 ≈450MB 常驻；P2 档（流式解析 + 分块 wire + SoA 直写）才能把"看到第一根线"从 3.0~3.5s 压到 0.2~1.7s。**

**要点**：

1. **口径必须先修正**：`readFile 31ms` 与 `db.read 2959ms` 才可相加（≈3.0s）；**883ms 是词法层单独占比的度量（约占解析 30%），与 2959ms 不可相加**。任何"3.9s"的写法都是把惰性词法算了两遍。worker 路径墙钟 ≈3.5s，比单线程**慢 0.5~0.9s**（取决于单线程基线取 2959 还是 3180~3420，方向确定、幅度待浏览器直测），换来的是主线程阻塞从 2.96s 降到 2.2s。
2. **词法层最大单点收益**：`AcDbDxfPairReader` 的 double 快路径把上限设为"15 位有效数字"，导致本图 **82.65%（2,460,409/2,977,066）** 的坐标回退；把判据换成 2^53 mantissa 界后命中率 97.0%，本机 A/B 实测 **−368ms**（口径建议写"约 −350~370ms"），且与 `Number()` 位级等价（2,977,066 个 span 全量比对 0 处不符）。
3. **语义层最大单项**：`AcCmObject.set` 的机械开销（4.14 次写/实体，各带浅拷贝 + `changed={}` + 2 次 `isEqual` + 零监听者事件对象）实测上限 **−305ms（−10.5%，0.70µs/实体）**，且经核验这是**下限**——生产代码里 `changed/previous/attrChanged/modelChanged` 的唯一消费者是 `AcCmObject.spec.ts`。
4. **调度层最大缺陷**：`AcDbNativeDxfConverter.ts:100` 的 `db.beginEventBatch()` 让解析期 434,084 次 `entityAppended` 全部落进 `_pendingEntityAppended`，直到注册读结束才 flush；实测首次派发在 **3402.7ms**（解析 100% 完成时刻），435 批在 1.0ms 内派完。progressive 的 300ms 让出、1s 重绘节流、渐进 fit 全部只作用于 flush 之后。
5. **内存账**：解析峰值 heapUsed 634.8MB / RSS 922MB（输入的 5.7~8.4 倍），其中 ≥40% 是逐实体框架容器（合并 A/B 实测 **234MB**）；渲染侧另有 **≈131MB 重复索引 + 103MB 逐槽 Box3**（均不在 634.8MB 基线内）；`AcDbNativeDxfConverter` 覆写了 `read` 且不调 `onFinished()`，使 `AcDbRenderingCache.clear()` 在 DXF 路径上永不执行。

---

## 1. 实测基线与口径

| 阶段 | 耗时 | 内存 | 备注 |
| --- | --- | --- | --- |
| `readFile` 112,271,908 B | 31ms | 瞬时 +107MiB ArrayBuffer（主线程） | 之后 transfer 给 worker，主线程 buffer 被 detach，不保留 |
| 词法单独：`acdbCreateDxfPairReader(buffer).next()` 遍历 6,301,264 pair | **883ms**（≈140ns/pair，线性） | 扫描前后 heapUsed 9.5MB→12.7MB | **词法层零分配、对象复用**；这是"词法层单独占比"的度量，**不是可叠加阶段** |
| 端到端 `db.read(buffer,{minimumChunkSize:1000,readOnly:true},DXF)` | **2959ms**（6.82µs/实体） | 峰值 heapUsed **634.8MB**、RSS **922MB**（输入的 5.7~8.4 倍） | 434,083 个模型空间实体；**内部已含词法扫描** |
| worker drain → SoA wire | **1585ms**（比裸词法 1010ms 贵 **+57%**） | wire **66.1MiB**（external）+ `strings` 477,796 条 ≈19MiB | 一次性抽干，`AcDbDxfPairWire.ts:120-213` |
| 主线程 `structuredClone(strings)` / wire 回放 6.3M pair | 14ms / 50ms | — | transfer 零拷贝；回放不是瓶颈 |
| 纯语义构建（worker 路径） | 2.08~2.2s | — | 主线程 |
| **worker 路径墙钟（合成值）** | **≈3.5s** | 跨线程瞬时合计 ≈1.1GB | 比单线程慢 **0.5~0.9s**；主线程阻塞 2.96s→2.2s |
| 让出次数（单线程，A7 插桩） | 49~52 次，每次 rAF 等待中位 0.09ms | — | 50ms 预算 + 1000 实体批过冲 = 54.6ms/片 |
| PARSE→ENTITY 进度跨度（A7 插桩） | PARSE 0.3→3402.6ms 占 99.97% 墙钟；ENTITY 20%→98% 仅 1.1ms | — | 首次 `entityAppended` 在 3402.7ms |

### 口径修正（强制）

- **883ms 与 2959ms 不可相加。** `db.read` 内部就会做词法扫描，用户可见解析总时长 ≈ `readFile 31ms + db.read 2959ms ≈ 3.0s`。883ms 是"词法层单独占比"的度量（约占解析 30%），任何把总时长写成 3.9s 的说法都是错的。
- **66.1MiB wire 是 `arrayBuffers`（external），不进 `heapUsed`。** 正确写法是"堆 634.8MB + 外部 66.1MiB + ≈19MiB 字符串表 ≈ 720MB 等价占用"，不要与 634.8MB 混为同一指标。
- **峰值/常驻内存的绝对值一律以基线为准**（峰值 heapUsed 634.8MB / RSS 922MB / 常驻 583~596MB）。各审计自测的绝对值（670.6 / 688.4 / 573.6MB 等）只用于引用**增量**。
- **"6.3M 个 pair 对象常驻内存"已被证伪**（wire 是 SoA 类型化数组，transfer 零拷贝）。但**主线程仍会为 6.3M 个 pair 逐个新建对象**——wire 只搬走了字节扫描，没有搬走 pair 物化（见 P2-3）。
- **单线程基线存在机器差异**：同机重跑 `db.read` 为 3175~3420ms。引用 worker 净亏时写"比单线程慢 0.5~0.9s"。

---

## 2. 目标文件画像

| 维度 | 实测 |
| --- | --- |
| 文件 | 112,271,908 B，纯 UTF-8（无 BOM、无非法字节），CRLF，`$ACADVER=AC1024`，`$DWGCODEPAGE=ANSI_936`（但实际编码就是 UTF-8） |
| 行 / pair | 12,602,528 行 → 6,301,264 个 group pair |
| 段构成（pair 占比） | ENTITIES 5,971,903（94.8%）｜BLOCKS 249,535｜OBJECTS 68,982｜TABLES 9,881 |
| 实体构成（434,084） | LINE 390,379（均 12.4 pair，89.9% 实体 / 76.7% pair）｜SOLID 40,811（均 19.0 pair）｜TEXT 1,344｜CIRCLE 1,047｜POINT 261｜ARC 207｜其余 <25 |
| 关键事实 | **ENTITIES 内无 INSERT**；LINE+SOLID ≈ 全文件 89% 的 pair；`ACDSDATA` 0 次、`3DSOLID` 0 次 |
| 高频组码 | 100:901,488｜5:465,285｜330:463,412｜10/20:460,017｜8:448,305｜6:383,873｜370:82,429｜62:61,416 |
| 类型分布（pair） | double 2,977,066｜string 2,208,052｜handle 948,920｜int 165,862｜binary 1,037｜bool 324｜long 3 |
| 符号表 | 图层实际只用到 **57** 个（DGX 269,136｜0 78,206｜计曲线 62,811…）；BLOCK 437｜LTYPE 71｜STYLE 32 |
| 坐标系 | 头部 `$EXTMIN/X=37,412,590`、`$EXTMAX/X=37,417,036`（宽仅 4,446 单位），与实体实际范围（X 1,171.6~37,428,194.7）基本一致；RTE 1e6 阈值几乎不分裂 → **批容器实测只有 ~268 个**（不是"大量批次容器"） |
| 其它头部变量（影响结论） | **`$LWDISPLAY = 1`**（组码 290，位于第 902 行，t=4ms 触发）→ 全部线走 fat-line；**`$CELWEIGHT = 20`**（组码 370）→ 无实体级 370 的实体解析线宽 = `max(1, 20/40) = 1` |

---

## 3. 瓶颈优先级表

### 3.1 P0 —— 低风险、函数级小改、可直接施工

**概览表**

| 编号 | 标题 | 阶段 | 严重度 | 证据（file:line） | 量化影响 | 裁决 |
| --- | --- | --- | --- | --- | --- | --- |
| P0-1 | double 快路径判据从"15 位数字"改为 2^53 mantissa 界 | 词法 | critical | `data-model/src/base/AcDbDxfPairReader.ts:221-224, 240-243, 281`；回退点 `:473-480` | **−350~370ms**（本机 best-of-3 −368ms；= 883ms 的 ~39%）；命中率 17.35%→97.0% | confirmed |
| P0-2 | filer 缓存"下一个 pair 组码"，消掉每 pair 3 次 getter | 语义 | medium | `AcDbDxfFiler.ts:256-260, 277-281, 284-289, 295-302, 333-346, 859-877` | 18.87M 次 getter → 缓存字段；filer self 176ms（112+64）中回收 **≈80~140ms** | confirmed |
| P0-3 | LINE `dxfInFields` 用字面量默认值，不再击穿 `_geo` 惰性 | 语义 | medium | `data-model/src/entity/AcDbLine.ts:493-506, 563`；`AcGeLine3d.ts:21-25` | **−8~25ms** + 省 ≈56MB/次解析短命垃圾（390,379 × 144B） | confirmed |
| P0-4 | `isModelSapceName` 零分配比较 + owner 透传 + ByLayer 颜色惰性标记 | 语义 | low | `AcDbBlockTableRecord.ts:117-121, 138-142, 411-460`；`AcDbDxfDocumentReader.ts:782, 800-818`；`AcDbEntity.ts:436-440` | 895,602 次判定 → 缓存；**−40~60ms + ≈19MB** | confirmed |
| P0-5 | `readLineSpan` 顺带产出非 ASCII 标志，删掉分层重扫 | 词法 | low | `AcDbDxfPairReader.ts:77-86, 125, 144, 523-540` | code 行 18.9MB + 值行 19.6MB 重扫消失；**−30~50ms** | confirmed |
| P0-6 | `AcCmObject.set` 增加"无监听者 + 未录制"裸写路径；工厂取消 `TEMP_` 句柄 | 语义 | high | `common/src/AcCmObject.ts:61-64, 67, 147-267`；`AcDbObject.ts:101-127, 237-252` | **−305ms（−10.5%，0.70µs/实体）为下限**；消除 ≈3.6M 临时对象、≈100MB/次年轻代垃圾 | confirmed |
| P0-7 | wire 类型常量内联，删掉 `WIRE_TYPE_BY_PAIR_TYPE[pair.type]` 字符串查表 | worker | high | `AcDbDxfPairWire.ts:156, 159-187` | **−50~100ms**（drain 1585ms 内） | confirmed |
| P0-8 | `notifyEntityAppended` / `BTR.appendEntity` 单元素数组消除 | 语义 | low | `AcDbDatabase.ts:829-832`；`AcDbBlockTableRecord.ts:437` | 每实体 2 次单元素数组 + 2 次 spread push（≈868k 次分配）→ **−20~40ms** | partial（修正后） |
| P0-9 | 图层名/线型名字符串 intern | 内存 | medium | `AcDbEntity.ts:507-512`；`AcDbDxfPairReader.ts:452` | 447,362 实体只有 76/41 个不同值；gc 差分实测 **−24.33MB**（layer 12.72 + linetype 16.05） | 验证新增（missed finding） |
| P0-10 | `_color`/`_transparency` 共享冻结默认实例 + 写时复制 | 内存 | medium | `AcDbEntity.ts:80-96, 436-440, 603-608`；`AcCmColor.ts:11-49`；`AcCmTransparency.ts:12-36` | **≈−34MB**（修正：17.1+17.1，而非 43MB） | partial（修正后） |
| P0-11 | SOLID/TRACE 的 `dxfIn` 消除临时对象（A2 漏项） | 语义 | low | `AcDbTrace.ts:377-382, 428-434`；`AcGeOcsUtil.ts:40-45` | 每实体 ≈10 次分配、≈26~30MB 峰值垃圾 → **−10~30ms** | 验证新增（missed finding） |
| P0-12 | `AcDbRenderingCache.clear()` 在 native `read()` 开头调用 | 应用 | high | `AcDbNativeDxfConverter.ts:69-176`；`AcDbDatabaseConverter.ts:688-694`；`AcDbRenderingCache.ts:235-259` | **本文件 0 字节**（ENTITIES 无 INSERT）；对 INSERT 密集图是跨图纸陈旧模板复用 + retired 数组无上界增长 | confirmed |
| P0-13 | Worker 长驻复用（不每次 read 新建 + terminate） | worker | low | `AcDbNativeDxfConverter.ts:206-211, 231`；`AcDbWorkerManager.ts:213-243, 280-293` | 每次打开省 `new Worker` + 编译 10,540B bundle（**5~20ms，未实测**）+ 保留 JIT 热态；`:231` destroy 在成功判定前执行 → 失败不可诊断 | partial（降为 low） |

**修复动作与风险表**

| 编号 | 机理 | 修复动作（函数级） | 代价 | 风险 |
| --- | --- | --- | --- | --- |
| P0-1 | 判据把"有效数字"按整数位+小数位一起数，超过 15 就放弃快路径；本图坐标 7~8 位整数 + 8~9 位小数，必然越过 15 位。真正保证精确的条件是整数 mantissa ≤ 2^53（96.4%→97.0% 的坐标落在界内） | 把 `AcDbDxfPairReader.ts:221-224` 与 `:240-243` 两处 `if (digits >= 15) { tooLong = true; continue }` 统一换成 `if (mantissa > (Number.MAX_SAFE_INTEGER - 9) / 10) { tooLong = true; continue }`（可删 `digits` 计数器，`:280-283` 其余守卫不动）。已验证：2,977,066 个真实 span 两条路径与 `Number()` 严格 `===`，**0 处不符**（含 `:479` 有意的 non-finite→0 归一化）；`mantissa > (2^53-9)/10` 时 `mantissa*10+d ≤ 2^53-9+9 < 2^53` 每步精确，`10^|k|`（|k|≤22）精确，末步 IEEE 单次正确舍入 ⇒ 位级等价 | S | low |
| P0-2 | 每个 pair 的 while 条件是 `!atEndOfObject && !atEof && !atExtendedData`，其中两个走 `peekPair()`（内部再 `assertReadMode()` + `_pushed.length` + `_reader.peek()`），一个直接 `_reader.peek()`；`peek()` 有 lookahead 缓存（不重复扫描），但闭包属性读取 + 模式断言仍按 pair 计费 | 给 `AcDbDxfFiler` 增加 `private _nextCode: number`（在 `readPair`/`peekPair`/`pushBackItem` 后同步刷新，-1 表示 EOF），把 `get atEndOfObject/atEof/atExtendedData` 改为纯字段比较；或提供 `readCodeAndPair()` 一次返回 `{code, pair}`。**必须同时覆盖 `_pushed` 栈的变化**（`pushBackItem` 有无参形式复用 `_lastRead`，否则 push 后 `atSubclassData` 判断会错位） | M | medium |
| P0-3 | `AcDbLine.dxfInFields` 开头读 `this.startPoint.x`…取默认值，经 getter 触发 `_geo` 物化（`AcGeLine3d` + 2 个 `AcGePoint3d`），末尾 `:563` 再建第二套，第一套 3 个对象立即变垃圾。**这是"已完成项的内部抵消"**：`docs/02` 记 🅾 的"惰性 `_geo` + 工厂无参构造"确实落地，但 dxfIn 自己把惰性打穿 | 开头默认值改字面量标量 `let x1=0,y1=0,z1=0,...,nx=0,ny=0,nz=1`，完全不触碰 `this.startPoint/endPoint/normal`；循环结束只调一次 `this._geo = new AcGeLine3d(...)`；把 `normal.set().normalize()` 改为先判 `nx!==0 || ny!==0 || nz!==1` 的恒等短路；`set lineType` 改用 `acdbDxfKeywordUpper()` 替代 `toUpperCase()` | S | low |
| P0-4 | 同一问题每实体问两次（`resolveEntityOwner:807` + `appendEntity:454`），每次对 BTR 名字做 2 次 `toLowerCase()`（常量侧未提升为模块常量）并经通用属性包读 `name`；颜色侧为表达"缺省 ByLayer"给 386k 个实体各分配独立 `AcCmColor` | ① `AcDbBlockTableRecord.isModelSapceName` 改零分配比较（把 `MODEL_SPACE_NAME.toLowerCase()` 提为模块常量 + `name.length===12 && /^\*model_space$/i`）；② `readEntitiesSection` 每实体算一次 owner 并以参数传给 `appendEntity(entity, owner)`，删掉 `appendEntity` 二次判定；③ `applyDxfFileDefaults` 改为惰性标记 `_colorIsByLayerDefault = true`。**注意保持《缺失颜色组码默认ByLayer修复》语义**：缺 62/420 默认 ByLayer、不得从 CECOLOR 取值 | S | low |
| P0-5 | 同一行被读两遍：`readLineSpan` 找 EOL 一遍，`acdbHasNonAscii` 再一遍。code 行 100% 无用（本文件 0 条非 ASCII code 行），string/handle 只有 3.2% 需要 | `readLineSpan` 行扫描循环里 `flag |= bytes[contentEnd]`，返回 `{start, end, nonAscii: flag >= 0x80}`；把该标志透传给 `acdbReadDxfCodeFromBytes` 与 `parseAsciiValueSpan`，删掉 `:144` 与 `:125` 的 `acdbHasNonAscii` 调用。**顺带把 12.6M 次 `{start,end}` 对象也改为写模块级 out-record**（单 reader 不可重入，安全） | S | low |
| P0-6 | 导入路径每个实体的 `objectId`/`ownerId` 都被通用响应式属性包处理：写入 clone 整个 `attributes` + 重建 `changed={}`，每属性 2 次 deep `isEqual`，变更后为每个属性名分配事件参数对象并 `dispatch`（实体自身 events 永远 0 监听者）。构造函数还先写一次 `TEMP_` 句柄（dxfIn 立即覆盖） | ① `AcCmObject.set` 增加"未跟踪快速路径"：`if (这个实例无监听者 && !this._tracked && !transactionManager.isRecording())` 时只写 `this.attributes[attr]`，跳过 clone/changed/isEqual/事件参数；**不要把 `events` 只换成惰性 getter**——`AcCmObject.ts:240/:258` 在 set 内部就会读 `this.events.attrChanged/modelChanged`，getter 会被立即击穿；必须保留 public getter 供外部 `addEventListener`，同时把 set 内部改为读私有 `_events?`，仅当存在时才 dispatch。② 增加 `AcDbObject.setAttrRaw(name, value)`，`dxfIn`/`commitEntity` 全部改用。③ 构造函数支持传入已知 objectId，取消 `TEMP_+uid` 生成与那次写入。**注意**：`changed` 记账**不能**改为"首次 `hasChanged()` 被调用时按需重建"（写入前旧值已丢失，事后无法重建）；必须在 `AcCmObject.ts:47-54` 的方法契约注释里显式声明这一收窄 | M | medium |
| P0-7 | drain 每 pair 做 `types[count] = WIRE_TYPE_BY_PAIR_TYPE[pair.type]` 对象查表，而下面已有的 `switch (pair.type)` 分支本来就知道类型 | 删掉 `:156` 的查表，把类型常量写进 `switch` 各 case | S | low |
| P0-8 | `notifyEntityAppended` 每实体 `Array.isArray(entity) ? entity : [entity]` + `push(...items)`；`BTR.appendEntity` 内 `:437` 有同构的一次（**审计原文漏了这处，只算了一处**） | 两处都改为 `if (Array.isArray(entity)) this._pendingEntityAppended.push(...entity); else this._pendingEntityAppended.push(entity)` | S | low |
| P0-9 | dxfIn 对每个 pair 新建字符串并存进 `_layer`/`_lineType`，447,362 个实体 100% 持有、不同值仅 76/41 个 | 在语义层做一次 76/41 条名字的 intern，或让 `_layer` 直接存 `AcDbLayerTableRecord` 引用（同时消掉渲染侧逐实体字符串比较）。`_attrs.attributes` 里不存这两个字段（实测 0 次），纯重复 | S | low |
| P0-10 | 为让 getter 免于 undefined，给每个实体分配两个取值等于全局默认（ByLayer / alpha=255）的两字段小对象 | 引入模块级冻结默认实例 + `_color/_transparency` 可选字段，getter 在 undefined 时返回共享默认、setter 首次写入时 `??=` 复制。**必须做写时复制**：`AcDbEntity.ts:520-525` 的 `this.color.colorIndex = ...` / `setRGBValue(...)` 都是就地写。**更硬的风险**：`resolveEffectiveProperties()` 以 `this._color == null` 作为是否用 CECOLOR 兜底的判据（`:603-608`），单纯可选化会让"缺失颜色组码默认 ByLayer"修复当场回归——必须额外引入「文件加载」标记或共享默认哨兵 | M | **high** |
| P0-11 | `AcDbTrace.dxfInFields` 为 4 个顶点各建 `{x,y,z}` 字面量、再建 `AcGeVector3d`、每顶点一次分配版 `acgeTransformOcsPointToWcs` | 改用 `acgeTransformOcsPointToWcsInto` + 复用 scratch 字面量/法向量（即 `docs/02` A2 已对 Line/Circle/Arc/Polyline 做过的同一套） | S | low |
| P0-12 | 基类把 `onFinished()` 当"本次读结束"的唯一生命周期钩子（也是唯一缓存清空点），native 转换器覆写整个 `read()` 把它彻底绕过 | 在 `AcDbNativeDxfConverter.read()` 开头（`db.clear()` 同点、`:95` 之前）调用 `AcDbRenderingCache.instance.clear()`；并给 `draw()/get()` 的 key 追加数据库/epoch 前缀作二次防线 | S | low |
| P0-13 | worker 生命周期绑在单次 `read()` 上（创建→执行一次→terminate），`maxConcurrentWorkers`/`getAvailableWorker` 的池复用路径永远走不到（每个新 manager 都是空 Map） | 按 `workerUrl` 缓存 `AcDbWorkerApi` 长驻，仅在 URL 变化或显式销毁时 `destroy()`；同时把 `:231 api.destroy()` 移到成功判定之后。**注意**：readiness 侧把 dxfParser 归为"可选"，但该回退已失效（P1-9），且 `workersReady` 在全仓**没有任何消费者**，修复②需先补 gate 才有意义 | S | low |

**P0 合计**：解析侧 **≈ −600 ~ −1000ms**（本机口径，其中 P0-1 −350~370ms、P0-6 −305ms 为下限、P0-2 −80~140ms、P0-7 −50~100ms、P0-4 −40~60ms、P0-5 −30~50ms、P0-3/P0-8/P0-11 −40~95ms）；常驻内存 **≈ −58MB**（P0-9 24.33 + P0-10 34）；另回收 ≈100MB/次解析的年轻代垃圾。除 P0-10（high）与 P0-2/P0-6（medium）外全部 low。

---

### 3.2 P1 —— 中等改动、需要小规模重构或行为变更

**概览表**

| 编号 | 标题 | 阶段 | 严重度 | 证据（file:line） | 量化影响 | 裁决 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-1 | 逐实体框架容器（6 个容器桶）惰性化 | 内存 | high | `data-model/src/base/AcDbObject.ts:84-88, 101-104`；`common/src/AcCmObject.ts:57-68` | 合并 A/B 实测 **−234MB**（修正：不是 238MB；548.5B/实体）。逐项 raw 上界：`_xDataMap` 80~83、events 72~76、prev+changed 48~52、attributes 24、color 17、transparency 17 | partial（修正后） |
| P1-2 | 几何原语 128MB：默认法向量共享 + LINE 端点标量化 | 内存 | high | `data-model/src/entity/AcDbLine.ts:53-56, 549-564`；`AcGeLine3d.ts:21-25`；`AcDbTrace.ts:63-68` | 几何总账 ≈128MB（常驻 21.6%）。默认法向量 ≈**20.1MB**（438,892×48B，修正非 20.6MB）→ LINE 端点惰性化再 ≈47MB → Float64Array 顶点池可去全部 128MB | confirmed |
| P1-3 | 批级视锥剔除改为扫 packed 顶点，不建逐槽 `Box3` | 渲染 | high | `three-renderer/src/batch/AcTrBatchedMixin.ts:1009-1055`；`AcTrBatchedLine2.ts:508-544`；`AcTrBatchedLine.ts:733-779` | 常驻 **−103MB**（434,083 × 248B 实测）；每次脏同步 −28~32ms（实测，非 27ms）。**"CPU 半"是 known-m3（文档已列未落地），新增的只有内存量化** | partial（修正后） |
| P1-4 | 渐进 fit 的 500ms 全量 bbox 重建改用 `_openUnionBox` | 渲染 | medium | `AcTrView2d.ts:2851, 2940` → `AcTrProgressiveOpenFitController.ts:120, 137-151` → `AcTrLayout.ts:169-197` → `AcTrBatchedMixin.ts:964-1002` | 实测 **52ms/次、峰值 2 次/秒**：整轮打开累计 ≈0.25~0.5s（T_drain 5s→0.26s） | 验证新增（missed finding） |
| P1-5 | 直批捕获路径的占位 `AcTrEntity` 改用模块级共享哑元 | 渲染 | medium | `cad-simple-viewer/src/view/AcTrDirectBatch.ts:40-43, 82-84`；`AcTrRenderer.ts:483-485, 502-511, 550-570, 581-587` | `new THREE.Object3D()` 实测 1.37µs → ≈42 万直批实体 ≈**0.6s 纯构造开销**（保守估计） | 验证新增（missed finding） |
| P1-6 | SOLID 快路径：单环 ≤4 顶点直接生成 2 三角形 | 渲染 | medium | `AcTrLineGeometryBuilder.ts:213-303`；`AcTrPolygon.ts:72-133`；`AcDbTrace.ts:316-345` | 分量合计实测 **≈0.35~0.38s / 40,811 实体**（修正：不是 273ms 下限）→ 可省 **≥0.2~0.3s** | partial（修正后） |
| P1-7 | 渲染侧三张逐实体 Map + 索引项去重/合并 | 渲染内存 | medium | `AcTrBatchedGroup.ts:1246-1262`；`AcTrLayout.ts:409-445, 928-935, 1085-1093`；`AcTrRBushSpatialIndex.ts:21-51` | 实测 **≈131MB**（修正：不是 161MB；= 53.7 + 40.5 + 37.2，其中 40.5 已含 29.8 的索引项）。三表合并为一个 `AcTrEntityRenderIndex` 可省 ≈65MB；去掉 `idMap` 再省 14MB | partial（修正后） |
| P1-8 | 空间索引转换期改用 `rbush.load()` 批量装载 | 渲染 | medium | `AcTrRBushSpatialIndex.ts:28-51, 53-60`；`AcTrLayout.ts:1085-1093` | 用**真实** 434,084 包围盒重测：insert 460/427ms、load 361/390ms ⇒ **省 37~99ms**（修正：不是 133ms；合成夹具高估）。**根索引不能等全量再 load**（实体分块增量到达 + progressive 要求提前出帧）→ 只对子索引可行 | partial（修正后） |
| P1-9 | worker 失败硬失败：文档宣称的"回退主线程"已失效 | worker | medium | `AcDbNativeDxfConverter.ts:49-50, 187-191, 214-217, 231, 233-245`；`AcDbWorkerManager.ts:109-118, 167-181` | 无稳态 ms 成本，是**可用性悬崖**：worker 404 / OOM / 超时 = 112MB 文件完全打不开；`:231` 的 destroy 在成功判定前执行 → 连诊断与重试都没有 | confirmed |
| P1-10 | 66.1MiB wire 在整个语义构建期常驻主线程 | worker | medium | `AcDbDxfPairWire.ts:40-63, 202-212, 242-317` | 主线程常驻 +66.1MiB(external) + ≈19MiB(strings)；分块（8~16 块、每块 2~4MiB）后降到 **≈4MiB**，省 ≈62MiB | confirmed |
| P1-11 | drain 容量估算与 `growI32` 2× 策略 | worker | low | `AcDbDxfPairWire.ts:126-136, 75-113, 205-210` | 诊断成立：`estimated = min(8,388,608, ceil(B/12)) = 8,388,608`，实际 **17.82 B/pair** ⇒ 4 个 buffer 全部超配，多一次 8.4MiB 增长与 ≈78MiB 裁剪 memcpy。**原修复方案是错的**（见下） | partial（修正后） |
| P1-12 | `readOnly` 死选项：文档化但从未实现 | 语义 | medium | `AcDbDatabase.ts:181-190, 2171-2211`；`AcDbDatabaseTransactionManager.ts:48, 82-84, 91-93, 300-303`；`AcDbBlockTableRecord.ts:411-419, 442-449` | 当前实现 **0ms/0MB**（打开期确实零事务）；风险在宿主若在事务内 read，43.4 万条 append 各记一条 change → O(N²) 恶化，而 `readOnly:true` **无法阻止** | confirmed |
| P1-13 | 解析让出预算 50ms → ≈16ms | 调度 | high | `common/src/AcCmYieldToUi.ts:6, 33-46`；`AcDbDxfDocumentReader.ts:82-84, 751, 788-792`；`AcDbNativeDxfConverter.ts:121-124` | 墙体成本 **+0.2%（4.5ms/2500ms，真 Chromium 实测）**；帧率 20fps→48fps、long task 37~40 次→**0 次**、maxFrameGap 50.4ms→20.9ms。**不要低于一帧**（8.5ms 片浪费 96% 墙钟） | confirmed |
| P1-14 | 转换 drain 让出预算 300ms → ≈16ms **且同时把 `setTimeout(0)` 改 rAF** | 调度 | high | `AcTrView2d.ts:281-286, 2782-2783, 2998-3005`；`AcApOpenFileProgressController.ts:186-241` | 长任务 300ms→≈20ms、输入延迟中位 258ms→≈10ms。**注意**：只改预算会让让出次数 ×18，`setTimeout(0)` 的 4ms 嵌套钳制使墙钟 +≈25%D，直接违反 `<10%` 验收判据——**两项必须同时做** | partial（修正后） |
| P1-15 | 全屏遮罩 `pointer-events:auto` + ribbon 禁用双闸门 | 应用 | high | `AcApProgress.ts:167-172, 273-275, 351-360`；`AntdCadViewer.vue:5, 217`；`AntdRibbon.vue:453-455, 492`；`AcApOpenFileProgressController.ts:216-241` | 从 t=0 到 drain 结束（≈5s+）**所有指针交互被吞**；解析期实测输入延迟中位 7.7ms（事件送达没问题，是目标元素被遮罩抢走）。附带矛盾：`documentActivated` 在 db.read 结束即触发、ribbon 已点亮但遮罩仍覆盖。**此项 docs/code-review 已记（known-partial）** | confirmed（known-partial） |
| P1-16 | worker 每次打开重建 + readiness 漏掉 dxf-parser-worker | worker | low | `AcDbNativeDxfConverter.ts:193-231`；`AcApWebworkerReadiness.ts:20-28` | 重建 5~20ms（未实测）；`workersReady` 全仓**零消费者**，假阳性实际影响 **= 0** ⇒ 严重度降为 low | partial（降为 low） |
| P1-17 | `.dwg` 未注册时旧图被当"部分成功"重新激活 | 应用 | medium | `AcApDocManager.ts:1680-1695, 1817-1828`；`AcDbDatabase.ts:2176-2182`；`AcApDocument.ts:127-154` | 非延迟问题、是状态机缺陷。**修正**：`onBeforeOpenDocument` 已 `curView.clear()`，画布是空的，**不存在"旧图重新激活/重新 fit"**；真实损害是标题/`_fileName` 指向失败的新文件而 db 仍是旧图 + 平移缩放丢失（来自每次打开无条件 clear） | partial（修正后） |
| P1-18 | 打开不可取消、不可被新选择取代 | 应用 | medium | `AcApDocManager.ts:890-944`；`AcDbDatabaseConverter.ts:214, 703-715`；`AcDbWorkerManager.ts:82-93, 112-118` | 3.0~3.5s 不可中断（Node 解析口径，浏览器还需叠加 flush/首帧 + ≥300ms fit 轮询）；120s 超时后用户收到内部错误。**"让出与分帧已存在"，不应作为本条建议** | confirmed |
| P1-19 | `destroy()` 不拆视图：每轮 quit→重开泄漏整张图 | 应用 | high | `AcApDocManager.ts:625-632, 511`；`AcTrView2d.ts:1063-1065, 2295-2300, 2364-2401`；`AcTrRenderContext.ts:37` | **修正后量级放大约 30 倍**：`bindDrawDatabase()` 把 db 写进 `context.database` 且无人解绑 ⇒ 泄漏的是**上一张图的整个 `AcDbDatabase`（634.8MB 堆 / 922MB RSS）**，不是"批缓冲 19.4MB"；另有全局 sysVar 监听器第二条保持路径 | partial（修正后） |
| P1-20 | 陈旧 sysVar 监听器触发 `view.clear() + db.regen()` 重放 | 应用 | high | `AcApContext.ts:116-138`；`AcDbSysVarManager.ts:115-131, 813-818`；`AcDbDatabase.ts:2400-2406`；`AcTrView2d.ts:2364-2401` | 前后两张图 `$LWDISPLAY` 不同即触发（本文件头部 `9 $LWDISPLAY / 290 1`，t=4ms）⇒ 对新打开的 db **重放一整轮转换**（本次 434k 实体）+ 进度条 100%→20% 回跳 | 验证新增（missed finding） |
| P1-21 | 主线程整体物化 112MB 再 transfer；无大小预检/降级 | 应用 | medium | `useAntdCadShell.ts:73-99`；`AcApOpenFileDialog.ts:56-63`；`AcDbWorkerManager.ts:175-181` | 主线程峰值 ≈700MB 堆（634.8 + 69.3，Node 口径，**禁当浏览器实测值**）；Blob 直传可省主线程 107MiB 分配与一次整文件 memcpy，但**不改变 635MB 那个峰值**（detach 早于建库） | confirmed |
| P1-22 | `AcApOpenFileProfiler.begin()` 无条件打开 RenderingCache profiling | 应用 | low | `AcApOpenFileProfiler.ts:122-137, 296-299`；`AcDbRenderingCache.ts:568-604, 417-435` | 本文件 0（无 INSERT）；INSERT 密集图估算 **20~60ms/10 万 INSERT**（未实测） | 验证新增（missed finding） |

**修复动作与风险表**

| 编号 | 机理 | 修复动作（函数级） | 代价 | 风险 |
| --- | --- | --- | --- | --- |
| P1-1 | 每个实体构造期无条件建 6 个容器：`_xDataMap`（V8 空 Map 184B，即使 0 条目也已分配 backing table）、`events` + 2×`AcCmEventManager` + 2 个 listeners 数组、`attributes`、`changed`、`_previousAttributes`。DXF 导入既不订阅事件也不需要变更跟踪 | ① `_xDataMap` 声明 `Map \| undefined`，`getXData` 读 undefined 直接返回，`setXData` 才 `??= new Map()`；**`restoreXDataMapFrom` 必须"源空则保持 undefined、源非空则先建 Map"**，否则反序列化丢 XDATA。② `events`/`changed`/`_previousAttributes` 改惰性——但**不能用 getter 实现**（见 P0-6）。③ 给 DXF/DWG 导入路径加 `lightweight` 开关，避免影响编辑器依赖 `changed` 的选区/属性面板。回归面：`_xDataMap` 共 8 个使用点（`AcDbObject.ts:404, 434, 456, 582-584, 598, 659, 801` + `AcDbMemoryEstimator.ts:329` 按属性名归类，改字段名会破），需逐条回归 `AcCmObject.spec` 与事务/undo 用例 | M | medium |
| P1-2 | dxfIn 为每个 LINE 保留 `AcGeLine3d` + 2 个 `AcGePoint3d`；坐标是 ~3.8e6 的非整数 double，V8 必须为每个字段分配 16B HeapNumber（真实点 96B vs 默认点 48B）；438,892 个 LINE/TRACE 无条件 new 默认 `(0,0,1)` 法向量（值为 SMI 只花 48B 壳，但 99% 从未被修改——全文件 code 210 仅 82,429 个 pair 且大部分属其它语义） | ① `_normal` 共享冻结 `Z_AXIS`，只在 dxfIn 读到 210/220/230 时才 new —— **必须同时给 setter 加写时复制**：`get normal()` 直接返回 `_normal` 引用（`AcDbLine.ts:172`），`set normal(value){ this._normal.copy(value).normalize() }`、dxfIn 的 `this.normal.set(...).normalize()`、`AcDbTrace.ts:190-192/:430` 的 `this.normal.copy(...)` 全是就地写，共享实例会被污染全图。② LINE 端点改为 6 个标量字段 + 惰性 `_geoData`，仅在 `startPoint/endPoint/subWorldDraw` 被访问时物化。③ 中长期按已存在的 drain/wire SoA 设计，对 LINE/SOLID 改用 `Float64Array` 顶点池 | L | medium |
| P1-3 | 批级剔除需要聚合包围球 → 实现建立在"逐槽 bbox 并集"上 → 逐槽 `Box3` 懒创建后**永久缓存**在槽记录上（仅 `reset()`/`deleteGeometry` 释放） | ① `computeBoundingSphere` 改为单次遍历 packed 顶点数组（Line2 直扫 `instanceStart/instanceEnd` 连续 `Float32Array`，Line 扫 `position` + `index`），完全不建逐槽 `Box3`；② 若必须保留逐槽 bbox，则在 append 时用入参 geometry 已算好的 bbox 增量并集到批级 min/max，且**只在首次 raycast/highlight 真正需要该槽时**才分配；③ `computeBoundingSphere` 只遍历 active 且 dirty 的槽 | M | low |
| P1-4 | `afterGeometryBatch(() => this.resolveLayoutFitBox())` 每个直批实体成功后调用；fit 控制器 500ms 一次；`AcTrLayout.addDirectEntity` 每实体都 `invalidateBox()`，而 `recomputeBox()` 结束才把 `_boxDirty=false` ⇒ 500ms 刻度上恒为 true，每次都全量重算 | `resolveLayoutFitBox` 改用场景已有的 `this._openUnionBox`（`AcTrView2d.ts:2823-2831` 已按实体 unionBox 增量并集），把 fit 从 O(槽数 × Box3.applyMatrix4) 降到 O(1) | S | low |
| P1-5 | `tryBuildDirectEntityMetas` 用捕获态跑 `entity.worldDraw(renderer)`，每个捕获分支命中后都返回 `this.createEntity()`，随后在 `finally` 里 `placeholder?.dispose()` 丢弃 | 捕获态返回一个模块级共享占位对象（或让 `beginDirectCapture` 暴露哑元），语义不变 | S | low |
| P1-6 | SOLID/TRACE 是固定 4 顶点直四边形，却完整走通用填充管线（AcGeArea2d → THREE.Shape → earcut → AcTrPolygon → clone → traverse×2 → dispose） | ① data-model 侧给 `AcDbTrace` 增加"凸四边形/单环"快路径，`directBatchPrimitive` 返回预三角化顶点/索引；或 ② `buildAreaGeometry` 内对 `area.getPoints(100)` 得到的**单环且点数 ≤4** 直接生成 2 三角形，跳过 `AcTrPolygon`/`ShapeGeometry`/`clone`/`traverse` | M | low |
| P1-7 | 同一 objectId 在批、层、空间索引三处各留一条引用记录，两处用"单元素数组"当容器 | ① `_entitiesMap` 值在只有 1 个槽时直接存对象（省 ≈26MB）；② `_entityLayerIndex` 改按 layout 的 layer 序号存位掩码/小整数（57 图层，省 ≈35MB）；③ `idMap` 只在需要 `removeById/getById` 时懒建，或与 rbush 项共用同一对象；④ 批槽记录里 objectId 仅在需要反查时保存 | M | low |
| P1-8 | rbush 单条 insert 需自顶向下选子树并按 maxEntries 分裂，常数远大于 OMT 批量装载；转换期又在每个实体后立即插入 | 给 `AcTrLayout` 加"索引收集模式"：drain 期间把 box 压进数组（可扁平成 TypedArray），结束后一次性 `load(items)`。**根索引 `AcTrRBushSpatialIndex` 不能这么做**（增量到达 + progressive 提前出帧），只对子索引适用 | S | low |
| P1-9 | 一旦把输入所有权 transfer 给 worker，主线程就没有字节可重放，代码只能 `throw`；文档描述的 `data.slice(0)` 复制已不存在（三处注释/文档仍在声称会回退） | ① 首选改传 `Blob`/`File`（结构化克隆不复制字节、不 detach），worker 内 `await blob.arrayBuffer()`；② 或 transfer 前先跑 1 字节握手确认 bundle 可加载；③ 同步修正 `AcDbNativeDxfConverter.ts:49-50, 187-191`、`docs/02-性能优化/性能优化总结.md:94-95`、`框选大量对象性能分析.md:50`、`docs/01-架构设计/架构图.md:100` 四处表述；④ 补一条"worker 失败回退"单测 | M | low |
| P1-10 | `acdbMakeDxfPairArrayReader` 的解构闭包在整个 `reader.read(filer)` 期间持有全部数组，而 6.3M pair 实际顺序消费，同一时刻只需一个窗口 | 与 P2-2 的分块 protocol 绑定：`acdbDrainDxfPairsChunked` 按 **code===0 的记录边界**切块，每块 transfer；同时必须给 array reader 加**显式块边界态**（现在 `readRaw()` 用 undefined 同时表示"块结束"与"EOF"，而 `AcDbDxfDocumentReader.ts:103-106` 是 `if (!item) break` —— 不区分会静默截断文档） | M | low |
| P1-11 | 估算常量 `B/12` 与本图实际 17.82 B/pair 不符，导致"预分配 + 裁剪"双重成本 | **不要**把 `/12` 改成 `/18`——`estimated = ceil(112271908/18) = 6,237,329 < 6,301,264`，会先 `growI32` 翻倍到 12,474,656（各 47.6MiB）再 slice，反而多 49.8MiB 分配 + 2×25.2MB 拷贝；而任何 ≥17.82 的取值又会让 `arr.length <= count*1.25` 走 `subarray` 分支、transfer 整块 buffer（`/17` 时 codes 多传 2.4MiB、stringIndices 多 1.2MiB）。**正确做法**：① `stringIndices` 种子按 `estimated*0.55`≈4.6M 给，免掉那次 8.4MiB 翻倍与 16.8MiB 瞬时双份；② 改 `growI32` 的 2× 策略为 `needed*1.1`。裁剪本身是精确大小的代价，不是纯浪费 | S | low |
| P1-12 | 选项接口与实现脱节：`db.read` 在 `:2196-2206` 只透传 4 个字段，全仓 `readOnly` 只有声明与 3 处 JSDoc；而它本应带来的收益因"读文件不开启事务"而天然成立 | 二选一并落到测试：① 真正实现——`db.read` 内对本次调用强制 `transactionManager.strictMode = false` 并加 `_suspendRecording` 计数，同时把选项转发给转换器；② 或删除该选项与相关 JSDoc（`cad-simple-viewer` 的公开类型已显式 `Omit<...>'readOnly'>` 并以 `mode` 取代，影响面限于 data-model）。补一条"事务内 read 不得录制"的回归用例 | S | low |
| P1-13 | 长任务结束时刻若已有 pending rAF，Chromium 会**立即补发 BeginFrame**，所以"每片最多等一帧 vsync"的直觉不成立：实测帧间隔 == 切片时长（50.4ms）而非 50+16.7ms | 把解析路径让出预算从 50ms 改为 ≈16ms，并把实体批从 1000 降到 250~500，使片长 = 预算 + 一批过冲 ≈16~19ms。**顺带撤销 `渲染与解析性能瓶颈分析.md:99` 那条"把 setTimeout(0) 推广到解析路径"的 M3 建议**（实测更慢、输入延迟更差）。让出边界不要再和 `minimumChunkSize` 耦合，时间预算应是唯一判据 | S | low |
| P1-14 | 300ms 预算 = 主线程一次连续占用 18 个帧周期；且它是 overlay 生命期的开关（`holdUntilSceneIdle` 轮询 `isProcessingEntities`） | ① 让出预算降到 ≈16ms（与解析侧统一）；② 因为检查点是"每个实体之后"，必须防止单个巨型实体自身超预算——在实体开始处用 `performance.now()` 判断并允许"超预算也要让"；③ **同时把 `yieldToEventLoop = () => new Promise(r => setTimeout(r, 0))` 改为 rAF**，否则 4ms 嵌套钳制会让墙钟 +25%D。代码注释自述的"smaller budgets made open 2–3× slower"并未被任何真实 drain 测量推翻，必须在真机 A/B 后定案 | S | low |
| P1-15 | 两个独立的"忙"机制叠加：DOM 层 `pointer-events:auto` 的 inset:0 遮罩吞掉全部指针事件，应用层 `isDocumentOpening` 禁用 ribbon。分帧让出只保证"主线程有空档"，事件的目标元素被遮罩抢走 | 三选一或组合：① `.ml-ccl-overlay` 的 `pointer-events` 改 `none`，只让 spinner/进度条自身接收事件（内部 wrapper 单独设 auto）；② 与 P2-1 流式改造配合，遮罩在首个 ENTITY 批次到达后自动收起为不拦截（`isDocumentOpening` 也改成"首个批次即解除 ribbon 禁用"）；③ 至少把 `holdUntilSceneIdle` 判据从 `isProcessingEntities` 改为"首个批次已出图" | M | medium |
| P1-16 | worker 生命周期绑在单次 read 上（同 P0-13） | 同 P0-13。若采用 P2-2 的分块流水，这个冷启动会变成首帧前的固定延迟，必须一并把 manager 提到 converter 实例级 | S | low |
| P1-17 | "部分成功恢复"只用"model space 有实体"做判据，而共享的 `AcDbDatabase` 实例让"上一张图"天然满足；且 converter 查找失败发生在 `clear()` 之前 | ① 收紧判据——只有"本次打开确实写入过实体"才允许恢复（db 记 openEpoch/写入计数，或仅在 `errorCode ∈ {worker_timeout, worker_oom}` 时允许）；② 失败分支回滚 `_fileName`（移进 try 成功路径）；③ 或在 `db.read` 里先查 converter 再 `clear()` | S | low |
| P1-18 | 打开是一个不可抢占过程，既无取消令牌也无"新请求作废旧请求"的版本号；唯一硬上限是 worker 超时，而超时实现把输入已 transfer 才失败 | ① `openDocument` 接受 `AbortSignal` 并透传到 converter/worker，abort 时 `cancel(taskId)` + `worker.terminate()`；② 增 open 版本号 epoch，旧请求在下一个 chunk 边界自行放弃，**放弃路径不得调用 `db.clear()`**；③ overlay 加取消按钮 | M | medium |
| P1-19 | `destroy()` 不接触视图；`stopAnimationLoop()` 全仓零调用者；animate 每帧自我重排，闭包持有 view ⇒ view/`_scene`/批次永不回收；`bindDrawDatabase()` 把 db 写进 `context.database` | 给 `AcTrView2d` 增加 `dispose()`（`stopAnimationLoop()` + `clear()` + renderer dispose/`forceContextLoss()` + canvas 移除 + 解绑 resize），在 `AcApDocManager.destroy()` 中调用；把 `_instance = undefined` 后的容器复用约束写进 `createInstance` 契约；同时让 `AcApContext` 可销毁（见 P1-20） | M | medium |
| P1-20 | `AcApContext.ts:116` 把监听器注册在**模块级单例** `AcDbSysVarManager.instance().events.sysVarChanged`，而 `AcApContext` 全文件 174 行无任何 `removeEventListener`/`dispose`，`destroy()` 也不销毁 context | 让 `AcApContext` 可销毁（`destroy()` 里 `removeEventListener` + `ApDocManager.destroy()` 调用它），或在监听器里校验 `view === 当前活动视图` | S | low |
| P1-21 | 本地文件打开的唯一入口是 `FileReader`/`Blob` → `ArrayBuffer`（完整物化）再 transfer；代码既无大小阈值也无内存估算 | ① 打开前按 `file.size` 分级（>64MB 弹确认 + 关闭额外缓存/预览）；② `AcDbWorkerManager` 增加 Blob 分支（`File` 可结构化克隆，不加入 transfer 列表），worker 内 `await input.arrayBuffer()`，删掉主线程 107MiB 副本；③ 主线程语义构建失败时先释放 `wire` 引用再走部分打开提示 | M | medium |
| P1-22 | `AcApDocManager.ts:1660` 无条件调 `_openFileProfiler.begin()`，而 `begin()` 只把打印开关设为 `isEnabled(database)`，却无条件执行 `AcDbRenderingCache.resetProfile()` 与 `profiling = true` | 把 `profiling/resetProfile` 放进 `if (this._printToConsole)` 分支或按需开关 | S | low |

---

### 3.3 P2 —— 架构级（流式解析 · 分块 wire · SoA 直写 · 内存压缩 · GPU 合批）

| 编号 | 标题 | 阶段 | 严重度 | 证据（file:line） | 量化影响 | 裁决 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-1 | 渐进式渲染的起点被事件批处理锁在整段解析之后 | 调度 | **critical** | `AcDbNativeDxfConverter.ts:100-101, 136, 143-165`；`AcDbDatabase.ts:764-814, 828-838`；`AcDbBlockTableRecord.ts:453-459`；`AcTrView2d.ts:1940-1950` | 首几何 = 整段解析：单线程 **3.0s→≈0.2s**（ENTITIES 段第一个 55ms 片 ≈8,000 实体）；worker 路径 **3.5s→≈1.7s**（下限被 worker 一次性 drain 卡住）。总 CPU 不减，省的是感知延迟 | confirmed |
| P2-2 | worker 一次性 drain 后再回传，与主线程语义构建零重叠 | worker | critical | `AcDbDxfParserWorker.ts:26-39`；`AcDbDxfPairWire.ts:120-213`；`AcDbNativeDxfConverter.ts:95, 100, 109-118, 136, 148` | 主线程空转 1.39s/3.5s；时间到首帧 ≈1.4s（分块流水后 <0.15s）；总时长 ≈ max(1.39, 2.2)+ε ≈ **2.3s**（−22%）。**净亏口径修正为"比单线程慢 0.5~0.9s"** | partial（修正后） |
| P2-3 | worker 只搬走字节扫描，6,301,264 个 pair 对象仍在主线程物化 | worker | medium | `AcDbDxfPairWire.ts:256-292`；对照 `AcDbDxfPairReader.ts:452, 459-498` | worker 换来的 0.76s 主线程收益**已接近上限**；A3 剖面的 GC 460ms(13.1%) 与 pair 对象 churn 在两条路径上都存在。"wire 回放只要 50ms"与"GC 460ms"不矛盾（50ms 是回放循环 CPU，垃圾账记在 GC 桶） | 验证新增（missed finding） |
| P2-4 | 渲染侧 5 份逐实体索引 + 逐实体 item 对象 | 渲染内存 | medium | `AcTrBatchedGroup.ts:1235-1239, 1246-1258` | `_entitiesMap` 建模时用共享 fakeObj，未计入 **434,083 个真实 item 字面量 ≈23.2MB**（`{}` 净 56B）⇒ 渲染侧逐实体开销应约 156MB 而非 133.2MB | 验证新增（missed finding） |
| P2-5 | 进度权重与真实成本倒挂 | 调度 | medium | `AcDbNativeDxfConverter.ts:26-35, 120-135, 148-165`；`AcApOpenFileProgressController.ts:151-162, 186-205` | 3.4s 解析只把用户可见进度从 11% 推到 26%，随后 28%→98% 在 **1.1ms** 内冲完，真正 drain 完全无进度。**修正**：`渲染与解析性能瓶颈分析.md:70` 是"修复方向提案"不是现状宣称，本条为 known-partial；**修复①（把 60-100 留给 drain / 接回视图进度）与已实施的 M1-1 冲突**（M1-1 明确删除了 drain 数字回画，`entityProcessingProgress` 已无消费者），要接回必须按 `_peak` 单调不减重新设计 | partial（修正后） |
| P2-6 | 转换期重绘被 1s 节流硬压 | 调度 | medium | `AcTrView2d.ts:287-291, 2269-2280, 2376-2390, 3166-3173`；`AcTrProgressiveOpenFitController.ts:27, 142-157` | 对 D ms 的 drain，几何刷新 ≈D/1000 + D/500 次（1~3fps），而主线程有 30 次以上让出空档可绘制。预测 maxFrameGap≈1000ms（**未验证**，需真机大图） | partial（需真机） |
| P2-7 | 打开遮罩没有看门狗：`holdUntilSceneIdle` 只轮询布尔门、永不超时 | 调度 | medium | `AcApOpenFileProgressController.ts:216-241`；`AcTrView2d.ts:797-809, 2047-2049, 2541-2558` | 配合 code-review 已确认的两处计数缺陷（A6/P1-2 计数未配平、P3=C.3.4 异步转换异常被吞），一旦命中即 **全屏遮罩永久驻留**且无超时/取消路径 | 验证新增（missed finding） |
| P2-8 | 示例应用默认上传入口把 `progressiveRendering` 关掉 | 应用 | high | `FileUpload.vue:209, 287` → `App.vue:169, 196-205` → `AcApDocManager.ts:1650-1653` → `AcTrView2d.ts:2376-2379` | **P2-1/P1-14/P2-6 的全部收益与代价都以该标志为 true 为前提**。`progressive=false` 时 `batchConvert` 不建 yieldGate、animate 直接 return ⇒ drain 期根本不绘制（与 docs 宣称的"M2 渐进式渲染默认开启／加载期间画面可交互"相反） | 验证新增（missed finding） |

**关键修复动作**

- **P2-1（施工主线）**：在 reader 现有的按批边界（`AcDbDxfDocumentReader.ts:624-627, 771-777, 788-792`，正是它调用 `yieldAndReportProgress` 的地方）增加"flush 待派发 append"钩子：把 `AcDbDatabase.ts:793-804` 的切片派发逻辑抽成 `flushPendingEntityAppendedChunk()`，converter 在 `:121-136` 构造 reader 时传入该回调，把一次性 `beginEventBatch()` 换成"解析期按批增量 flush、结束时 `endEventBatch()`"。这样视图 drain 与 ENTITIES 语义构建天然交错。**两条真实风险**：① ACDSDATA 的 ASM_Data 在 ENTITIES 之后回填 3DSOLID —— **对本文件不成立**（实测 `ACDSDATA` 0 次、`3DSOLID` 0 次；段序 HEADER@2/CLASSES@1120/TABLES@1910/BLOCKS@21676/ENTITIES@520750/OBJECTS@12464560），只属通用风险；② `AcApContext.ts:126-135` 的 LWDISPLAY 保护依赖"打开途中场景为空" —— **被实测削弱**：`$LWDISPLAY` 在 HEADER 段内、t=4ms 触发，远早于 ENTITIES，流式后 `view.hasSceneContent` 仍为 false，守卫依然成立；只有"流式开始后才变更 sysVar"才踩坑。**唯一的实质折扣**：收益要求 `progressiveRendering=true`（见 P2-8）。
- **P2-2 分块协议**：① 新增 `acdbDrainDxfPairsChunked(reader,{pairsPerChunk,onChunk})`，仅在 **code===0 的记录边界**切块（保证块内是完整 record），每块复用同一 `stringIds` Map 并以 transferables 立即 postMessage；② chunk 队列接进 `acdbMakeDxfPairArrayReader` 并加显式边界态（见 P1-10）；③ `AcDbDxfFiler` 上加 `atChunkBoundary()`/`await ensurePairs()`，由已是 async 的 document reader 在实体边界 await；④ `endEventBatchChunked` 改为按收到 chunk / 时间预算增量 flush。
- **P2-3 边界**：若目标是把词法对象真正从主线程去掉，得给 `acdbMakeDxfPairArrayReader` 加 `nextInto(dst)`/共享只读 pair 视图。**注意**：`docs/02-性能优化/优化计划.md` M2-3 已实测"对象池化反而慢 5-7%"，必须是**消除对象**而不是复用对象，且 filer 的 pushBack 同一性协议（`AcDbDxfFiler.ts:333-346`）是硬约束。

---

## 4. 分阶段路线图

### 4.1 第一档：P0（低风险高收益，建议一个迭代内完成）

**预期收益：解析侧 ≈ −600 ~ −1000ms（相对 2959ms 基线约 −20%~−34%）；常驻内存 ≈ −58MB；另回收 ≈100MB/次解析的年轻代垃圾。**

| 步骤 | 内容 | 验证方式 |
| --- | --- | --- |
| 1 | P0-1 double 判据放宽到 2^53 + P0-5 非 ASCII 标志复用 | `AcDbDxfPairReaderSpan.spec.ts:353-395`（已含 18 位整数位/12 位小数位守门用例，`:424/:432` 断言严格等于 `Number()`）；`tools/bench/bench-parse.cjs` 前后对比 |
| 2 | P0-6 裸写路径 + TEMP_ 消除 | `common/__tests__/AcCmObject.spec.ts` 全绿 + 新增"无监听者裸写语义"用例；`pnpm test -- packages/data-model` |
| 3 | P0-2 filer 组码缓存 | `tools/bench/debug-phase-timing.cjs` / `debug-section-timing.cjs` 看 filer self 是否下降 |
| 4 | P0-3 / P0-4 / P0-8 / P0-11 / P0-7 | `tools/bench/count-entities.cjs` 断言实体数不变（434,083）；E2E 回归选择/悬停/图层 |
| 5 | P0-9 / P0-10 内存项 | `tools/bench/reader-mem-compare.cjs`；**P0-10 必须新增"共享默认不被写坏" + "缺 62/420 默认 ByLayer 不走 CECOLOR"回归** |
| 6 | P0-12 RenderingCache.clear + P0-13 worker 长驻 | 新增"连续打开两个含同名 INSERT 的 DXF"用例，断言第二次不命中第一次模板、`_retiredCompactedTemplates.length === 0` |

### 4.2 第二档：P1（中等改动，1~2 个迭代）

**预期收益：首帧前耗时 ≈ −0.8 ~ −1.5s（P1-4 0.25~0.5s + P1-5 0.6s + P1-6 0.2~0.3s + P1-8 0.04~0.1s，均发生在 2959ms 解析之外、首帧之前）；常驻内存 ≈ −450MB（P1-1 234 + P1-3 103 + P1-7 65 + P1-10 62，其中 P1-10 是 external）；交互体感从 20fps/输入延迟 258ms 提升到 48fps/输入延迟 ≈10ms。**

- **调度（优先，改动最小）**：P1-13 解析让出 50→16ms；P1-14 drain 让出 300→16ms **且必须同改 rAF**；P1-15 遮罩 `pointer-events:none`。
- **内存（收益最大）**：P1-1 容器惰性化（234MB）→ P1-3 逐槽 Box3（103MB）→ P1-7 渲染索引合并（65MB）→ P1-2 几何（20MB 起）。
- **渲染**：P1-4 fit 走 `_openUnionBox`（S，52ms/次 ×2/s）→ P1-5 占位实体哑元（S，0.6s）→ P1-6 SOLID 快路径（M，0.35s）→ P1-8 子索引 load。
- **应用/worker**：P1-9 回退修复（Blob 直传，同时解 P1-21）→ P1-19 视图 dispose + P1-20 context 销毁（**合起来才能真正止住 600MB+/轮 + 重放**）→ P1-17/P1-18 状态机与取消 → P1-22。

### 4.3 第三档：P2（架构级，需要专项设计）

- **P2-8 前提修复（必须最先做）**：确认 `progressiveRendering` 的生产默认值。若产品确要"加载期可交互"，把示例上传入口的 `ref(false)` 与 `AcApDocManager.ts:1650` 的 `?? false` 一并改为 true（或至少让 UI 默认勾选），否则 P2-1/P1-14/P2-6 全部白做。
- **P2-1 流式解析**：`flushPendingEntityAppendedChunk()` 钩子。判据：首个 ENTITY 段事件 <500ms、PARSE 跨度占比 <60%。首几何 3.0s→0.2s（单线程）/3.5s→1.7s（worker）。
- **P2-2 分块 wire**：`acdbDrainDxfPairsChunked` + 显式块边界态 + 增量 flush。墙钟 ≈2.3s，首帧 <0.15s。
- **P2-3 SoA 直写**：`nextInto(dst)` 消除 6.3M 次 pair 物化（必须是消除而非池化）。这是唯一能把 GC 460ms 桶打下来的方向。
- **内存压缩 / GPU 合批**：LINE/SOLID `Float64Array` 顶点池（可去 128MB 几何）；每段 36B → 28B（fat 段 381,852 段省 3.05MB distance + GPU 顶点变换 3×）；文字/点批次合并。**GPU 侧收益一律留待真机验证。**
- **P2-6 重绘节流**：先把 `PROGRESSIVE_OPEN_PAINT_INTERVAL_MS` 从 1000 降到 100~250ms，并为"仅新增几何、相机未变"用增量路径（只上传新增批次、不清屏整绘），以免重演"paint 主导打开耗时"。

---

## 5. 被证伪的误解与已实施项（避免后人重做）

### 5.1 已证伪的误解

| # | 误解 | 事实 |
| --- | --- | --- |
| 1 | `readFile 31ms + 词法 883ms + db.read 2959ms = 3.9s` | **错**。`db.read` 内部就做词法扫描，三者不可相加。正确口径：约 3.0s（另 883ms 是词法层单独占比 ≈30%） |
| 2 | "6.3M 个 pair 对象常驻内存" | **已证伪**。wire 是 SoA 类型化数组（`Int32Array`/`Uint8Array`/`Float64Array` + 字符串去重表），transferable 零拷贝。**但主线程仍逐 pair 新建对象**（P2-3） |
| 3 | "发往 worker 前 `data.slice(0)` 复制" | **已不存在**（`docs/02-性能优化/性能优化总结.md:95`）。当前是 transfer，主线程 buffer 被 detach |
| 4 | "GBK 全量解码是本文件的问题" | **不是**。文件是纯 UTF-8（无 BOM、无非法字节）；`$DWGCODEPAGE=ANSI_936` 与实际编码无关 |
| 5 | "散布全图的线/面产生大量批次容器" | **不成立**。本图集中在宽 4,446 单位的窗口内，RTE 1e6 阈值几乎不分裂，**实测 268 个容器**，`resolveOriginBatch` 全部内层扫描合计仅 435,670 次迭代 |
| 6 | "关闭渐进式 → rAF 饥饿 12s+"（`性能优化总结.md:62`） | **与代码不符**：`FileUpload.vue:209` 默认 `progressiveRendering = ref(false)` 覆盖 `App.vue:175` 的 true，但 `AcDbDatabase.ts:790-804` 分块 dispatch + `tryBuildDirectEntityMetas` 同步快路径 + 块末 `decreaseNumOfEntitiesToProcess()` 已把计数归零并置脏 ⇒ **progressive=false 也可能在每个让出点重绘**。该文档数据早于分块 flush，标为**未验证** |
| 7 | "'60 次 rAF 等待 ≈ 最多 1s'"（把 vsync 锁相模型当浏览器实测） | **推翻**。真 Chromium 长任务结束立即补发 BeginFrame，帧间隔 == 切片时长（50.4ms）而非 50+16.7ms；50 次让出总开销 **4.5ms（+0.2%）**。618~658ms 是 Node 模拟模型产物 |
| 8 | "`setTimeout(0)` 应该推广到解析路径"（`渲染与解析性能瓶颈分析.md:99` 的 M3 建议） | **应当撤销**。实测用 `setTimeout(0)` 解析墙钟 +9%（≈250ms）且最大输入延迟 9.7→83ms。**本条明确建议不要做** |
| 9 | "图层名解析每实体 44.8 万次" | **不存在**。解析期 `AcDbSymbolTable.getAt` 全程仅 **440 次**；`code 8 → this.layer = String(item.value)` 是纯字段写入（`String(string)` 返回同一引用）。真正的归一化在绘制路径，仅 ≈24~60ms/遍 |
| 10 | "`AcDbRenderingCache` 无 LRU"，"随文档关闭 clear" | 两点都要修正。**LRU 已存在且有界**（512 条 / 64MB，`AcDbRenderingCache.ts:156-163, 297-310`）；"随文档关闭 clear"在原生 DXF 路径**不可达**（P0-12） |
| 11 | "词法层应该做字符串 intern 能省很多" | **否决**。建串本身已接近最优（TextDecoder 更慢 2.9×，展开只省 13%）；上限 ≤45ms（883ms 的 5%）。与已否决的 P5-c"strings 单池"、M2-3"pair 池化"（实测慢 5-7%）同族，应并入**否决项清单**。**真正的内存靶点在语义层**（P0-9：图层名/线型名 intern，实测 −24.33MB） |
| 12 | "`_normal` 惰性化能省 62MB" | **收益≈0**。`AcDbLine.dxfInFields:504-506` 会读 `this.normal.x/y/z`，第一个实体就把 `_normal` 物化回来。**A/B 的 −229B/实体恰好等于空 Map + AcCmTransparency 之和**，"惰性化 3 个容器"实际只有 2 个在贡献。要让 `_normal` 真正省下来必须先落 P0-3 |
| 13 | "`AcDbTrace` 有惰性几何，dxfIn 击穿了它" | **子结论 refuted**。`AcDbTrace` 没有惰性几何——`_vertices` 4 个 `AcGePoint3d` 在构造函数就 eager 分配（`:59, 81-91`），`getPointAt` 只是数组取值。SOLID/TRACE 的真实浪费是**临时对象**（P0-11），属 `性能小项优化实施计划` A2 的漏项 |
| 14 | "drain 容量估算按 12B/pair，改成 18 即可修复" | **修复方案本身是错的**。`ceil(112271908/18) = 6,237,329 < 6,301,264` ⇒ 会先翻倍再 slice，反而更差。正确做法见 P1-11 |
| 15 | "`readOnly` 带来了打开期的内存/时间收益" | **死选项**，`db.read` 从未转发它。打开期零事务/零变更记录是"恰好没有开事务"（`isRecording()` 恒 false），不是因为 `readOnly` |
| 16 | "worker 路径比单线程慢 0.5s（+18%）" | 算术不自洽。按分量求和 = 31+1585+14+50+2080~2200 = **3760~3880ms**，相对 2959ms 是 +0.77~0.89s（+26~30%）；+0.5s 只在单线程基线取 3180~3420ms 时成立。**目前没有任何人做过 worker vs 主线程的端到端墙钟 A/B** |
| 17 | "P0-12 的渲染缓存清空点是全仓唯一" | 不准确。`cad-svg-plugin/src/AcSvgRenderer.ts:46-48` 的 `prepareExport()` 也调用，但只被 SVG/PDF 导出调用，不在 DXF 打开链上，结论不受影响 |
| 18 | "关闭 `destroy()` 后泄漏的是批缓冲 ≈19.4MB" | **低估约 30 倍**。泄漏链是 view → renderer → `context.database` → **上一张图的整个 `AcDbDatabase`（634.8MB 堆）** |
| 19 | "选到 `.dwg` 会让旧图被重新激活并重新 fit" | **修正**：`onBeforeOpenDocument` 已 `curView.clear()`，画布是空的，不存在"旧图重新激活/重新 fit"。真实损害是状态机不一致（标题/`_fileName` 指向失败的新文件而 db 仍是旧图）+ 平移缩放丢失（来自每次打开无条件 clear） |
| 20 | "`workersReady` 给出假阳性、会拦住缺 bundle 的部署" | `workersReady` getter 与 `events.workersReady` 在全仓（含 `.vue` 与全部插件包）**没有任何读取者**，假阳性实际影响 **= 0**；修复需先补 gate |
| 21 | "`P3-9` / `node_modules` 里的 `P5-1` 等编号" | `P5-1` 在 docs 下 0 匹配；`AcTrView2d.ts:2522-2527` + `:2545` 展开上限隐患在 docs/code-review 的编号是 **C.3.4（P3）**，口径是"需 >约 12 万"（不是 ≥10.4 万） |
| 22 | "`instanceDistance` 恒算是本次的主要浪费" | 属 known-m3（`性能小项优化实施计划.md:55` 明确"AcTrBatchedLine2 保持现状"，`框选分析.md:38` 已列未落地） |
| 23 | "解析线宽来自 LAYER 表（-3）" | **关键前提错误**。线宽来自 `$CELWEIGHT = 20`（缺省回退 `database.celweight`）；若真按图层 -3 解析，`traits.lineWeight < 0` 会把这些线全推到 `LineBasicMaterial`，结论会被推翻。**"结论对、前提错"**。且不是"所有线"——实体级 370 有约 365 条非正值走细线（0.09%） |
| 24 | "`progressiveRendering` 默认 true"（A7 全程按 true 叙述） | **生产路径不成立**：示例上传入口 `FileUpload.vue:209` 默认 `false` |

### 5.2 已实施项 / 不能回退的既有优化（复核结论）

- **wire 已是 SoA + transferable 零拷贝**（`AcDbDxfPairWire.ts:40-63, 219-232`）——"6.3M pair 对象常驻"的说法不要重提。
- **`AcCmObject.set` 的引用相等快速路径已实施**（`AcCmObject.ts:176-195`）——P0-6 不得回退它。
- **LINE/CIRCLE/ARC/ELLIPSE/SPLINE 惰性 `_geo` + 工厂无参构造已落地**——但 **LINE 的 dxfIn 自己把惰性打穿**（P0-3），建议在 `性能小项优化实施计划` §3 A3 的实施记录里回填"LINE 分支实际未生效"。
- **`AcDbRenderingCache` LRU 已有界**（512 条 / 64MB）。
- **XATTACH 已改为"先解析一次再 `registerOverlayDatabase`"**；切 layout 有 `existingLayout.entityCount > 0` 提前返回；**未发现重复解析**。
- **打开路径没有任何 Vue 进度重渲染风暴**：`open-file-progress` 在 packages 内**零监听者**；99 次 `eventBus.emit` 经 4 层去重 → **88 次 DOM 写**（2 次 style + 1 次 text）。
- **`defaultBatchDrawPolicy`（1e6 阈值 → unbatch）未在生产启用**（默认 `alwaysBatchDrawPolicy`），因此 `AcTrDirectBatch` 快路径对本图全部生效。
- **材质不重复创建**：`getMaterial` 命中缓存即复用，本图只触发 **264 次**；图案线型最多产生 **4 个额外 program**（原以为 68 个，已证伪）。
- **`$EXTMIN/$EXTMAX` 来自 HEADER**（`AcDbDxfHeaderReader.ts:144-151`），打开后无额外全量遍历；`AcDbObjectIterator.count` O(1)；`AcDbMemoryEstimator` 与 `AcDbRenderingCache.prebuildAll` 在生产源码中无调用者。
- **模型空间容器是普通数组 push**（摊还 O(1)、最终 3.5MB、累计拷贝 ≈7MB），无内存放大。
- **句柄表 `Map<string, AcDbObject>` 448,226 条，表结构仅 14MB**，key 串与实体 objectId 是同一批字符串（不重复），`getObjectById` 是 O(1)。**不建议改结构**（收益 <2% 且风险高）。

---

## 6. 待实测问题

| # | 问题 | 为什么现在测不了 | 影响面 |
| --- | --- | --- | --- |
| 1 | **worker vs 单线程端到端墙钟 A/B** | 没有任何人做过；3.5s / 3.76s 都是合成值。Node 下 `typeof Worker === 'undefined'` 直接返回 null，全部基线都不含 worker 构造与传输 | P2-2 的收益结论、P0-13/P1-16 的收益量 |
| 2 | **转换 drain（`flush` → 首帧）的真实时长** | 本机软件渲染（SwiftShader）下 paste/draw 主导，审计无法测量 | P1-14/P2-1/P2-6 的定量判据都要它 |
| 3 | **`bench/progressive.html` 在原图上的 maxFrameGap** | 无浏览器端大图实测；预测 ≈1000ms 未被验证 | P2-6、P1-14 验收判据 |
| 4 | **浏览器渲染进程的真实峰值内存** | 700MB / 1.3GB 都是由 Node RSS 922MB 外推 | P1-21、P0-10 的降级策略 |
| 5 | **GPU 侧收益**（fat-line 3× 顶点变换、每段 36B、批级剔除精度） | 本机为软件渲染，无真实 GPU | 4.3 的内存压缩/GPU 合批档 |
| 6 | **worker 重建成本（5~20ms）与脚本 fetch RTT** | 未实测 | P0-13/P1-16 |
| 7 | **`AcDbRenderingCache` retired 数组的单次增量（0.1~10MB/淘汰）** | 本文件无 INSERT，代价为 0 | P0-12 对 INSERT 密集图的收益 |
| 8 | **P1-14 的 drain 墙钟增幅**（300→16ms 的代价） | 代码注释自述"smaller budgets made open 2–3× slower"，但无真实 drain 测量 | P1-14 是否可"免费"实施 |
| 9 | **重入/并发打开时的实体交叠破坏形态** | 未实测（标"未确认"） | P1-18 |
| 10 | **`P2-8` 产品口径**：加载期是否必须可交互 | 需产品确认；`docs/code-review/代码评审报告-2026-09-10.md:567` 已记为待确认 | P2-1/P1-14/P2-6 全部收益的前提 |
| 11 | **P2-7 遮罩永久驻留是否真实可达** | 依赖 code-review 已确认的两处计数缺陷，未在本图复现 | P2-7 |

---

## 7. 浏览器端验证方案

### 7.1 可复用的现成设施

| 工具 | 路径 | 用途 |
| --- | --- | --- |
| `bench/progressive-trace.html` + `progressive-trace.ts` + `bench/collect-progress-trace.cjs` | `cad-viewer/packages/cad-viewer-example/bench/` | 逐事件记录 `openProgress`/`regen`/`clear`/overlay 时间线 |
| `bench/progressive.html` + `progressive.ts` | 同上 | `maxFrameGap` 与 `renderer.info.render.calls` 轮询；`view.progressiveOpenStats.paintCount/yieldCount` |
| `bench/collect-render-stats.cjs` | 同上 | 渲染统计采集 |
| `bench/entity-census.cjs` | 同上 | 实体构成核对 |
| `tools/bench/bench-parse.cjs` | `cad-viewer/tools/bench/` | Node 侧解析吞吐基线 |
| `tools/bench/count-entities.cjs` | 同上 | 实体数断言（434,083） |
| `tools/bench/debug-phase-timing.cjs` / `debug-section-timing.cjs` | 同上 | Node 侧阶段基线 |
| `tools/bench/reader-mem-compare.cjs` | 同上 | 词法层内存对比 |
| `tools/bench/pool-ceiling.cjs` | 同上 | worker 池/并发 |
| `tools/bench/scan-coords.cjs` | 同上 | 坐标/增量扫描 |
| `packages/common/__tests__/AcCmYieldToUi.spec.ts` | `cad-viewer/packages/common/__tests__/` | 让出 gate 的预算语义回归网 |
| `packages/data-model/__tests__/AcDbDxfPairReaderSpan.spec.ts:353-395, 424, 432` | `cad-viewer/packages/data-model/__tests__/` | double 快路径与 `Number()` 位级等价的守门用例 |

**已知坑（必须绕过）**：`collect-progress-trace.cjs` 的回退路径只找 Windows 的 `chrome-headless-shell-win64`（`:40-56`），而本机 playwright 1.59.1 要 chromium 1217、缓存只有 1181，需设：
`PLAYWRIGHT_EXE=~/Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell`
（本次 A7 审计即如此绕过。）另外 `bench/progressive-trace.html` 依赖 `progressiveRendering=true`，验证前先确认 P2-8。

### 7.2 要采集的指标与成功判据

| 目标 | 采集项 | 成功判据 |
| --- | --- | --- |
| **P0-1/P0-5/P0-7 词法** | `tools/bench/bench-parse.cjs` 的 tokenize 墙钟；worker drain 墙钟 | tokenize 从 883ms 降到 ≈510~535ms（−350~370ms）；worker drain 从 1585ms 降到 ≈1450ms |
| **P0-6/P0-2/P0-3/P0-4 语义** | Node 侧 `db.read` 墙钟 + `debug-phase-timing.cjs` 分项 | `db.read` 从 2959ms 降到 ≈2100~2400ms |
| **P1-13 解析让出** | `PerformanceObserver('longtask')` 计数、rAF 帧间隔、CDP 真实鼠标输入延迟 | long task 37~40 次 → **0 次**；帧率 20fps → ≈48fps；输入延迟 p95 ≤ 25ms；解析墙钟增幅 <5% |
| **P1-14 drain 让出** | 同上 + `view.progressiveOpenStats.yieldCount` | 单任务从 301ms → ≈20ms；输入延迟中位 258ms → ≈10ms；**drain 墙钟增幅 <10%**（若超，说明忘记改 rAF） |
| **P1-15 遮罩** | 首个 ENTITY 批次时刻 vs overlay `pointer-events` 生效期的差 | 首个批次后即可滚轮/平移 |
| **P1-1/P1-3/P1-7 内存** | `performance.memory.usedJSHeapSize` 峰值/常驻、Chrome DevTools heap snapshot 的 `Detached`/`System` 归因 | 常驻堆从 ≈950MB 降到 ≈500MB；峰值 heapUsed ≤ 520MB |
| **P1-4/P1-5/P1-6 首帧前耗时** | `AcApOpenFileProfiler` 的 OPENPROF 报告 + `openProgress` 时间线 | 首帧前（解析之后、首批几何之前）总耗时降 ≥1s |
| **P1-19/P1-20 泄漏** | quit → 重开 ×3 后的 heapUsed / `renderer.info.memory` / 存活 WebGL 上下文数 | 第 3 轮 heapUsed 与第 1 轮差 <50MB；上下文数恒为 1；无 `regen` 事件 |
| **P2-1 流式解析** | `progressive-trace` 的首个 ENTITY 段事件时刻、PARSE 跨度占比 | 首个事件 **<500ms** 且 PARSE 跨度占比 **<60%**（当前 3402.7ms / 99.97%） |
| **P2-2 worker 分块** | 时间到首帧实体 + 端到端墙钟 + 跨线程瞬时 RSS | 首帧 <0.15s；总时长 ≈2.3s；跨线程瞬时 ≤ 单线程 922MB 的 1.1× |
| **P2-6 重绘节流** | `bench/progressive.html` 的 maxFrameGap、`paintCount/yieldCount` | 改 100~250ms 后 maxFrameGap <100ms，`paintCount` 随 drain 时间线性增长（≈1 次/帧） |
| **渲染正确性** | `renderer.info.render.calls` | ≈320（含文字/点，合批容器 ≈268）且图面无缺漏（`bench/analyze-png.cjs` / `png-view.cjs` 比对） |
| **回归面** | `pnpm test`（尤其 `AcCmObject.spec`、`AcDbObject` 事务/undo、`AcDbDxfPairReaderSpan.spec`）+ `pnpm test:e2e` | 全绿；选择/悬停/图层/框选/深层探针（`verify-*.cjs`）无回归 |

---

## 8. Agent Teams 分工与验证记录

### 8.1 审计单元（11）

| # | 模块 | 覆盖内容 | findings |
| --- | --- | --- | --- |
| 1 | **A1 词法/字节扫描层** | 逐 pair 控制流、字节遍历账、数值快路径命中率、字符串去向 | 4（A1-1~4） |
| 2 | **A2 Worker 与 pair 传输边界** | 一次性 drain、零拷贝、双份内存、回退可用性、容量估算 | 5（A2-1~5） |
| 3 | **A3 Filer 与实体构建** | 实体构建路径、属性包、filer 协议、dxfIn、owner/颜色判定、前提修正 | 6（A3-1~6） |
| 4 | **A4 数据库/内存结构** | 解析结果内存结构、规模效应、重复索引；`v8.queryObjects` 精确计数 + 斜率法微基准 + 逐容器 A/B 差分 + heap snapshot 归因（1.03GB/15,289,632 节点） | 6（A4-1~6） |
| 5 | **A5-a 渲染层 drawable 生成** | 实体 → THREE 对象 → 首帧；批容器数、几何量、材质键、渐进时序 | 2（A5-1、A5-4） |
| 6 | **A5-b 渲染材质/线型/合批** | fat-line vs 细线、材质复用、图案线型 program 数 | 1（A5-2） |
| 7 | **A5-c 视锥剔除/边界/精度** | 批级剔除实现、逐槽 bbox、空间索引、RTE 精度 | 2（A5-3、A5-5） |
| 8 | **A6-a 应用层加载编排（读取路径）** | 拷贝/驻留、串行阶段、内存上限/兜底、重复解析 | 3（A6-3~5） |
| 9 | **A6-b worker 生命周期/缓存/进度** | worker 重建、RenderingCache 生命周期、视图销毁、进度上报 | 3（A6-1、A6-2、A6-6） |
| 10 | **A7-a 分帧调度** | 让出机制、预算-粒度匹配、输入延迟、真实浏览器调度复刻（chromium 1181 + `PerformanceObserver` + CDP 真实鼠标） | 3（A7-1~3） |
| 11 | **A7-b 渐进式渲染与进度上报** | overlay/ribbon 双闸门、进度权重、重绘节流、可复用基准设施 | 3（A7-4~6） |

### 8.2 对抗性验证单元（9）

| # | 模块 | 复核对象 | 独立复刻口径 |
| --- | --- | --- | --- |
| 1 | **V1-A1 词法** | A1-1~4 | Node v24.19.0，同一文件，字节扫描 + 逐 span 统计 + A/B + 与 `Number()` 全量位级比对，脚本自建、从源码逐字复刻。自证：pairs=6,301,264、行 12,602,528、double=2,977,066、int=165,862、handle=948,920、string=2,208,052、bool=324、long=3、binary=1,037，与权威扫描完全一致 |
| 2 | **V1-A2 worker/wire** | A2-1~5 | 同进程交替 A/B；esbuild 打包当前 src 的 wire；`transferables.length` 实测 1041；`--cpu-prof` 分解 |
| 3 | **V1-A3 filer/实体** | A3-1~6 | `dist/data-model.cjs` + `--expose-gc`（300k 对象）实测对象尺寸；真图原型打点计数；全仓 grep 生产消费者 |
| 4 | **V2-A4** | A4-1~6 | 真实 112MB 文件重跑；`v8.queryObjects`；重跑 A/B（复现 base 噪声底 −4.4MB 并据此判伪报告的 +4.4MB 修正）；`registry.clear()` 前后差分 |
| 5 | **V2-A5 渲染剔除/几何** | A5-1、A5-4 | 重跑 `/tmp/dxfscan/a5-objsize2.mjs`、`a5-sync.mjs`、`a5-solid.mjs`（three 0.172 CJS） |
| 6 | **V2-A5 材质/合批** | A5-2 | 解析线宽改为按 `$CELWEIGHT=20` 建模；对照 `AcTrLineMaterialManager.ts:86` 的 `<0` 分支 |
| 7 | **V2-A5 索引** | A5-3、A5-5 | 用**真实** 434,084 包围盒（按 DXF 文件顺序提取，实测相邻间距 <1e5 占 100.0%）重测 insert/load；对照合成随机夹具 |
| 8 | **V2-A6** | A6-1~6 | 全仓 grep 消费者（`onFinished`/`AbortController`/`workersReady`/`removeEventListener`）；逐调用链核对 |
| 9 | **V2-A7** | A7-1~6 | 重跑 `/tmp/dxfscan/a7-yield-count.cjs`（raf/settimeout 双模式）、`a7-lw-timing.cjs`；重跑 `/tmp/schedbench/run.mjs`（chromium_headless_shell-1181，裸 rAF 中位 16.6~16.7ms 作为环境先验） |

### 8.3 裁决统计

| 轮次 | findings | confirmed | partially-confirmed | refuted |
| --- | --- | --- | --- | --- |
| 第一轮（A1/A2/A3） | 15 | **11** | 4 | 0（另 1 条**子结论**被 refuted，已并入 A3-4 的 correction：`AcDbTrace` 不存在惰性几何） |
| 第二轮（A4/A5/A6/A7） | 23 | **10** | 13 | 0 |
| **合计** | **38** | **21** | **17** | **0** |

**分布明细**

- 第一轮 confirmed（11）：A1-1、A1-2、A1-3、A1-4、A2-2、A2-3、A2-4、A3-2、A3-3、A3-4、A3-5。⚠️ 验证模块 summary 文字写"9 条 confirmed、5 条 partially-confirmed"，与逐项 verdict 数组不一致；**以逐项 verdict 为准**，即 **11 confirmed + 4 partial = 15**。
- 第一轮 partial（4）：A2-1、A2-5、A3-1、A3-6。
- 第二轮 confirmed：A4-1、A4-5、A4-6、A5-2、A6-1、A6-3、A6-4、A7-1、A7-2、A7-4 → **10**。
- 第二轮 partial：A4-2、A4-3、A4-4、A5-1、A5-3、A5-4、A5-5、A6-2、A6-5、A6-6、A7-3、A7-5、A7-6 → **13**。

> **口径说明**：任务书口径为"11 个模块审计 + 9 个对抗性验证"；本报告按可追溯的报告单元与子域拆分展开为 11 个审计单元（A1–A7 主模块，A5/A6/A7 按子域拆为 3+2+2）与 9 个验证单元（首轮按 A1/A2/A3 拆为 3，第二轮 A4–A7 为 4，加 2 个补充复核）。
> **未计入本表**：验证过程额外产出的 **13 条 missed findings**（首轮 3 条 + A4 3 条 + A5 2 条 + A6 2 条 + A7 3 条），其中高价值项（图层名 intern 24.33MB、fit 全量 bbox 52ms/次、占位 `AcTrEntity` 0.6s、sysVar 泄漏触发整轮 regen、`progressiveRendering` 默认 false、overlay 无看门狗、SOLID 临时对象、渲染 item 对象 23MB、pair 主线程物化、worker 每次重建、OPENPROF 无条件 profiling、`entityProcessingProgress` 无消费者）已分别并入本报告第 3 节的 P0-9、P0-11、P1-4、P1-5、P1-16、P1-20、P1-22、P2-3、P2-4、P2-7、P2-8 与第 6 节。

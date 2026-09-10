# 千树塔 DXF 加载性能 · P0 档修复实测报告

> 施工依据：`docs/02-性能优化/千树塔DXF加载性能瓶颈分析（Agent Teams）.md`（第 3.1 节 P0 优先级表 + 修复动作与风险表）
> 目标文件：`cad/千树塔井上下对照图（2025.04）.dxf`（112,271,908 B / 6,301,264 pair / 434,083 模型空间实体）
> 执行方式：Agent Teams 分两个波次并行施工，文件清单互斥；每波次以 `pnpm build` + Jest + `tools/bench/bench-parse.cjs` 为验收闸门
> 环境：macOS / Node v24.19.0 / 主线程同步路径（未启用 worker、不含渲染）
> 日期：施工与实测同批完成

---

## 1. 验收结论

**P0 档 13 项：12 项落地，1 项（P0-9）经核实为伪收益并建议从报告删除。**

| 指标 | 修复前 | 修复后 | 变化 |
| --- | --- | --- | --- |
| `db.read` best（3 次重复取最优） | 2709.49 ms | **1606.54 ms** | **−1102.95 ms（−40.7%）** |
| `db.read` avg | 2789.91 ms | **1681.70 ms** | −1108.21 ms（−39.7%） |
| 每实体耗时 | 6.24 µs | **3.70 µs** | **−40.7%** |
| 峰值 heapUsed（3 次重复口径） | 1210.5 MB | **1127.2 MB** | −83.3 MB（−6.9%） |
| 峰值 RSS（3 次重复口径） | 1539.3 MB | **1447.5 MB** | −91.8 MB（−6.0%） |
| 模型空间实体数 | 434,083 | 434,083 | **不变（正确性守门）** |
| 构建 | — | 18 个项目全部成功 | — |
| 测试 | 134 套 / 958 全绿（data-model + common） | **全仓 348 套通过 / 2231 个测试通过** | 新增 21+ 个用例 |

**测试说明（重要，非本次回归）**：全仓 `pnpm test` 有 2 个套件失败 —— `packages/cad-viewer/__tests__/polarTrackingMenu.spec.ts` 与 `packages/cad-viewer/__tests__/AcApHatchRibbonCmd.spec.ts`。二者 import 的源文件（`src/command/AcApHatchRibbonCmd.ts`、`src/component/common/hatchPatternPreview.ts`）**在 HEAD 中就不存在**（已用 `git cat-file -e HEAD:<path>` 核实），属仓库既有破损用例，与本次改动无关。

**口径提醒**：合并前的 `2709 ms` 已包含词法扫描（`db.read` 内部自行分词），报告第 1 节的「词法 883 ms 与端到端不可相加」修正依然成立。

---

## 2. 逐项结果

### 2.1 第一波（词法 / 属性包 / wire / 实体 / filer）

| 编号 | 内容 | 报告预估 | 实测 | 状态 |
| --- | --- | --- | --- | --- |
| P0-1 | double 快路径判据 `digits>=15` → 2^53 mantissa 界 | −350~370 ms | 回退率 **82.7% → 2.99%**（命中率 97.0%）；全量 2,974,394 个 double span 与 `Number()` 位级等价；波次合计见下 | ✅ |
| P0-5 | `readLineSpan` 顺带产出非 ASCII 标志，删分层重扫 | −30~50 ms | 隔离实测 **−61 ms** | ✅ |
| P0-6 | `AcCmObject.set` 无监听者裸写路径 | −305 ms（下限） | 隔离实测 **−249 ms**（per-set 181.5 ns → 37.9 ns） | ✅ |
| P0-7 | wire 类型常量内联，删字符串查表 | −50~100 ms | 隔离实测 **−47.3 ms**（−3.56%）；真实文件 wire 输出 SHA-256 逐字节一致 | ✅ |
| P0-3 | `AcDbLine.dxfInFields` 用字面量默认值，不击穿 `_geo` 惰性 | −8~25 ms + 56 MB 垃圾 | 已验证 `AcGeLine3d` 每条 LINE 由 **2 → 1** 个，临时对象归零（判别力用例在还原源码后确实失败） | ✅ |
| P0-11 | SOLID/TRACE `dxfIn` 消除临时对象 | −10~30 ms + 26~30 MB | 同上，每 SOLID/TRACE 的法向量分配与 4 次分配版 OCS 变换 **→ 0** | ✅ |

> 第一波合计（同口径 bench）：`2709 → 1703 ms`，**−1007 ms**。其中 P0-1 与 P0-5 同处一个文件、共享收益，未单独拆分归属。

### 2.2 第二波（内存 / 正确性）

| 编号 | 内容 | 报告预估 | 实测 | 状态 |
| --- | --- | --- | --- | --- |
| P0-4a | 模型空间/图纸空间判定缓存 + 零分配比较 | −40~60 ms | 端到端交替 A/B 5 轮 **Δavg −73 ms（−4.1%）**；1.2M 次判定分配 7.43 MB → 0.03 MB | ✅ |
| P0-4c / P0-10 | 颜色/透明度惰性分配 + ByLayer 默认显式哨兵 | ≈ −34 MB | 解析峰值堆 **−31~35 MB**（3 次重复一致）；解析末期已物化 `_color` 434,083 → 49,778、`_transparency` → 0 | ✅（第 3 步见 §3.2） |
| P0-8a | `AcDbDatabase.notifyEntityAppended` 单元素数组 | −20~40 ms | 分配 23.20 MB → 0.01 MB；时间在噪声内（**无时间收益**） | ✅ |
| P0-8b | `AcDbBlockTableRecord.appendEntity` 同构分配点 | （报告原审计漏项） | 同上；两处合计约 46 MB/次解析的短命分配被消除 | ✅ |
| P0-12 | `AcDbNativeDxfConverter.read()` 开头清空渲染缓存 | 本文件 0 | 正确性修复：该路径原本**永不执行** `AcDbRenderingCache.clear()`；本文件（ENTITIES 无 INSERT）收益 0，INSERT 密集图修复跨图纸陈旧模板复用 + `retired` 数组无界增长 | ✅ |
| P0-13 | parser worker 长驻复用 + `destroy()` 移到失败分支 | 5~20 ms/次 | 隔离实测 **15~30 ms/次**（Node 口径，真实 worker bundle） | ✅ |

---

## 3. 对原报告的修正

### 3.1 必须修正的结论

| # | 报告原文 | 核实结果 |
| --- | --- | --- |
| 1 | **P0-9「图层名/线型名 intern 可省 24.33 MB」** | **伪收益，建议从报告删除。** worker 路径的 wire 内含去重字符串表，`acdbMakeDxfPairArrayReader` 的 `readRaw()` 返回 `strings[stringIndices[i]]`，重复的图层名/线型名**本就是同一个 JS 字符串实例**，`this.layer = String(item.value)` 亦返回同一引用。真图实测：434,083 个实体、57 个不同图层名、32 个不同线型名，**持有重复值不同实例的实体数 = 0**，可省 0 MB。原 24.33 MB 是 Node 主线程基线路径的产物，浏览器生产路径不存在。 |
| 2 | **P0-4b「每实体算一次 owner 并传给 `appendEntity(entity, owner)`」** | **方案不安全，已放弃。** `appendEntity(` 在全仓有**约 40 个调用点**（agent/隧道/图层插件、cad-simple-viewer 的几十条绘制与修改命令、pdf 插件、changeApplier、test-utils），全部只传一个参数。改为在 `AcDbBlockTableRecord` 上缓存空间标志后，`appendEntity` 内的二次判定退化为 2 次字段读取，收益已被 P0-4a 吸收，无需改签名。 |
| 3 | **P0-2「filer 每 pair 3 次 getter，可省 −80~140 ms」** | **报告高估。** 实测 **−22~25 ms（−2.3%）**，报告自估的 filer self 176 ms 未能复现为可回收量。改动方向正确、行为等价、风险低，予以保留，但量级需下调。 |
| 4 | **P0-7「−50~100 ms」** | 实测 **−47 ms**，落在预估下沿。 |
| 5 | **P0-6「−305 ms」** | 实测 **−249 ms**（−79.1% 的 per-set 成本），接近但有差距。 |
| 6 | **P0-13「5~20 ms」** | 实测 **15~30 ms**，略高于预估上沿。 |

### 3.2 未完成 / 显式放弃的部分

| 项 | 状态 | 原因 |
| --- | --- | --- |
| **P0-10 第 3 步：共享冻结默认 + 写时复制** | **未做（有意的）** | 报告把它标为 risk=high，核实后确认就地在写散落在**本波次文件清单之外**：`AcDbRenderingCache.ts:620-622`、`AcDbTable.ts:708-710`、`AcDbDxfPolylineAssembler.ts:323-324` 都会对 `entity.color` 做 `setForeground()/setRGBValue()/colorIndex=` 就地写。若 `get color()` 返回共享实例，这些写入会污染全图。第 1 步（惰性分配）已回收全部 384,305 个默认色与 434,083 个默认透明度，跨文件改造风险大于剩余收益。 |
| **P0-10 哨兵的两个隐藏坑** | 已修 | 除报告点明的 `resolveEffectiveProperties()` 外，还发现 `hasExplicitColor()`（被 `AcDbHatch.color` 依赖）也用颜色字段判空 —— 若不纳入哨兵，DXF 加载的无 62 组码 HATCH 会退回 CECOLOR。已一并处理并加用例。 |
| `AcDbObject` 构造期 `TEMP_+uid` 句柄写入移除 | **放弃** | 该写入被 `isTemp` 语义（`AcDbSymbolTableRecord.assertOpenForWrite`）、`commitObjectHandle` 的 `needsGenerated`、`clone()`、`dxfOut()` 以及多处既有断言依赖，grep 无法证明「构造后、dxfIn 前无人读 objectId」。不为省 40 B 冒错 id 风险。 |

### 3.3 新增的回归风险（需知悉）

1. **`AcCmObject` 变更记账被显式收窄**：对象在**零监听者**期间的所有非 `unset` 写入不再维护 `changed`/`_previousAttributes`，因此 `hasChanged()`/`changedAttributes()`/`previous()`/`previousAttributes()` 不再反映这些写入（值本身仍可经 `get()`/`attributes` 读到）。已核实全仓（含全部 `.vue` 与插件包）这三个 API 的**唯一消费者是 `AcCmObject.spec.ts`**，事务/撤销走 `clonePreservingIdentity()` 快照、不依赖 `changed`。已在类 JSDoc 中显式声明该契约，并新增「注册监听者后恢复 tracked 契约」的用例。**仓库外的第三方代码若消费 `changed` 会观察到差异。**
2. **`AcDbBlockTableRecord` 空间标志缓存**：所有仓库内 `name` 写入都走 public setter（已 grep 确认），`clone()`/`restoreFrom` 按 own-property 快照复制标志。将来若有人新增绕过 setter 直接写 `name` 的旁路，缓存会失效。
3. **`AcDbLine.dxfInFields` 默认值语义收窄**：默认值由「实体既有几何」改为字面量。仓库内所有 dxfIn 调用点都是「新建空实体再灌字段」，解析路径完全等价；但若宿主把 `dxfInFields` 当「合并进已有实体」用，未出现的坐标码会回落到 0 而不是保留原值。建议按 ObjectARX「dxfIn 填充新对象」的契约对待。
4. **worker 长驻的代价**：worker 线程及其解析后抬升的 V8 堆会保留到页面卸载（换冷启动与 JIT 热态）。另 `AcDbWorkerManager` 从不在任务结束摘除 `message`/`error` 监听闭包，长驻后每次 read 多留 2 个监听（毫秒级、缓慢增长），根治需改 `AcDbWorkerManager.ts`（不在本波次清单）。同一 converter 实例上并发 read 现在共享一个 worker。
5. **`AcDbFiler` 组码缓存**：`position()` 语义前移一个 pair（约 18 字节 / 112 MB），仅影响进度百分比。

---

## 4. 复现命令

```bash
cd cad-viewer

# 构建（18 个项目）
pnpm build

# 全仓测试（348 套通过；2 套为 HEAD 既有破损用例）
pnpm test

# 本次涉及的包
pnpm test -- packages/data-model packages/common

# 基准（前后对比用的同一口径）
node --expose-gc tools/bench/bench-parse.cjs \
  "/Users/huangyu/Documents/TypeScript/web-cad/cad/千树塔井上下对照图（2025.04）.dxf" \
  --repeat 3 --gc
```

---

## 5. 改动清单

源码 12 个文件、测试 8 个文件（净 +1818 / −155 行）：

| 包 | 源文件 | 对应项 |
| --- | --- | --- |
| data-model | `src/base/AcDbDxfPairReader.ts` | P0-1、P0-5 |
| data-model | `src/base/AcDbDxfFiler.ts` | P0-2 |
| data-model | `src/base/AcDbDxfPairWire.ts` | P0-7 |
| data-model | `src/entity/AcDbLine.ts`、`src/entity/AcDbTrace.ts`、`src/entity/AcDbEntity.ts` | P0-3、P0-11、P0-4c、P0-10 |
| data-model | `src/database/AcDbBlockTableRecord.ts`、`src/database/AcDbDatabase.ts` | P0-4a、P0-8 |
| data-model | `src/dxf/AcDbNativeDxfConverter.ts` | P0-12、P0-13 |
| common | `src/AcCmObject.ts`、`src/AcCmEventManager.ts` | P0-6 |

新增测试：`packages/data-model/__tests__/AcDbLineDxfIn.spec.ts`（新增），以及在 `AcCmObject.spec.ts`、`AcDbDxfFiler.spec.ts`、`AcDbDxfPairReaderSpan.spec.ts`、`AcDbDxfPairWire.spec.ts`、`AcDbBlockTableRecord.spec.ts`、`AcDbDatabase.spec.ts`、`AcDbEntity.spec.ts`、`AcDbNativeDxfConverter.spec.ts` 中扩充的用例。

---

## 6. 下一步建议（P1，尚未施工）

按「收益 / 风险」排序，建议下一波次优先：

1. **P1-13 解析让出预算 50 ms → ≈16 ms**（报告：帧率 20→48 fps、long task 37~40 次 → **0** 次，墙钟仅 +0.2%）。
2. **P1-14 drain 让出 300 ms → ≈16 ms，且必须同时把 `setTimeout(0)` 改 rAF**（报告：输入延迟中位 258 ms → ≈10 ms；只改预算会让墙钟 +25%，两项必须同做）。
3. **P1-15 全屏遮罩 `pointer-events:auto`** 吞掉全部指针交互（从 t=0 到 drain 结束）。
4. **P2-8 先确认 `progressiveRendering` 的生产默认值** —— 示例上传入口 `FileUpload.vue` 默认 `false`，会使 P2-1/P1-14/P2-6 的全部收益落空。
5. **P1-1 逐实体框架容器惰性化（≈ −234 MB）** —— 内存收益最大项，但需覆盖 `changed`/`_previousAttributes`/`_xDataMap` 的序列化与事务回归面。

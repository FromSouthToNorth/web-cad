# M6 实施计划：圆弧细分 LOD 与渲染数据采集（槽级剔除决策支撑）

> 依据：`docs/02-性能优化/渲染与解析性能瓶颈分析.md`、`性能优化总结.md` §7（M3+ 遗留清单）、上一轮方案对照评估结论
> 目标场景：UTF-8 编码 DXF 矿图（`F:\gis\bw-cad-view\cad\dxf\processed`，25 张 / 632MB，最大 154MB / 27 万实体）
> 日期：2026-09-03；状态：**待实施（定于当晚 19:00 自动化执行，结果回填文末『实施结果』小节）**

---

## 0. 背景与验收指标

上一轮评估确认：通用优化方案中约 80% 已在本仓库落地（M1–M5 + P 系列，含夜间回归基线），剩余可实施项收敛为两个：

1. **M6-1 圆弧细分 LOD**：圆弧/圆/椭圆目前固定 100 段密化，矿图中大量钻孔符号等小圆顶点数严重过剩（每个整圆 101 个顶点），是批缓冲体积、转换 drain 与首帧上传的隐形大头。
2. **M6-2 渲染数据采集脚本**：产出 `renderer.info` + 批级视锥命中数据，为搁置中的 M5-4「槽级视锥剔除」提供决策依据（可见槽占比高 → 槽级剔除收益低；反之高）。

**明确不做（GPU 门控 / 已有否决记录）**：槽级剔除实现、图纸空间视口剔除、大 INSERT/hatch 分批、GBK 峰值堆优化、data-model 实体存储结构改造、pair 对象池（M2-3 实测否决）。

### 验收指标

| 指标 | 目标 | 验证方式 |
|---|---|---|
| 小圆顶点数（r/diag < 1e-4） | 100 → 16 段（101 → 17 点） | 单测断言 |
| 大圆顶点数（r/diag ≥ 1e-2） | 100 段不变（位级一致） | 差分测试 |
| 三包 tsc | 干净 | `--noEmit` |
| 相关 jest 套件 | 全绿（新增 + 回归） | 见 §1/§2 测试小节 |
| 解析基准（utf8-mixed-100000 等） | 不劣化（LOD 属渲染侧，预期无影响，防意外回归） | `tools/bench/bench-parse.cjs` |
| 视觉验收（小圆放大后棱角可接受性） | **本机无 GPU，留真实 GPU 环境目视** | 记录为未闭环项 |

---

## 1. M6-1 圆弧细分 LOD

### 1.1 现状

- `AcTrRenderer.circularArc` / `ellipticalArc` 固定 100 段：[`three-renderer/src/renderer/AcTrRenderer.ts:513-522`](../../cad-viewer/packages/three-renderer/src/renderer/AcTrRenderer.ts)
- 密化器 `getPointsFlat(numPoints)`：`geometry-engine/src/geometry/AcGeCircArc3d.ts:535`、`AcGeEllipseArc3d.ts:386`（P0 已零分配化，本次不改）
- 圆半径 getter：`AcGeCircArc3d.radius`（`AcGeCircArc3d.ts:178`）；椭圆长/短半轴 getter 以 `AcGeEllipseArc3d` 实际导出为准
- 两条调用路径（direct capture 快路径与普通 `AcTrLine` 路径）共用 `circularArc`/`ellipticalArc` 同一入口，改动点收敛于此二方法，无需触碰 `linePoints`（`:655`）与几何构建器

### 1.2 设计

**新增工具模块**：`three-renderer/src/draw/AcTrArcLod.ts`

```
acTrComputeArcSegmentCount(radius, sweepRatio, diagonal, enabled) -> number
```

- **尺度基准 `diagonal`**：`this._context.database.extents` 的对角线长度。
  - 渲染上下文已携带数据库：`AcTrRenderContext.database`（`AcTrRenderContext.ts:37`）
  - 数据库范围是实体提交时 `expandByPoint` 扩张的真实范围（`AcDbDatabase.ts:2026-2028`、getter `:2062`），**解析先于转换完成，转换期 extents 已完整**；不依赖可能错误的文件头 EXTMIN/EXTMAX
  - 退化回退：`diagonal` ≤ 0、非有限、或 `database` 为空 → 返回 100（维持现状行为）
- **LOD 档位**（半径/对角线比值，尺度无关，默认开启）：

| 档位 | 条件（radius / diagonal） | 段数 |
|---|---|---|
| LOD0 | < 1e-4 | 16 |
| LOD1 | < 1e-2 | 48 |
| LOD2 | ≥ 1e-2 | 100（不变） |

  阈值依据：1280px 视口 fit 视图下 LOD0 圆直径 ≈ 0.26px（肉眼不可见），48 段相对弦高误差 ≈ 0.2%，视觉安全。
- **椭圆**：radius 取 max(长半轴, 短半轴)。
- **非整圆弧**：`n = clamp(ceil(sweepRatio × 整圆段数), 8, 100)`；sweepRatio ≤ 0 或非有限 → 100。整圆（sweep = 2π）用整圆段数。
- **特性开关**（仿 `acTrSetBatchFrustumCullingEnabled` 模式，`AcTrBatchedMixin.ts:782-796`）：
  - `acTrSetArcLodEnabled(enabled: boolean)` / `acTrIsArcLodEnabled(): boolean`，模块级变量，**默认开启**
  - 关闭时一律 100，一键回滚
- 变更点：
  1. `AcTrRenderer.circularArc`：`getPointsFlat(this._context.database ? acTrComputeArcSegmentCount(arc.radius, 1, diagonal, enabled) : 100)` 样式的调用（以最终代码为准）
  2. `AcTrRenderer.ellipticalArc`：同构
  3. `src/index.ts` 导出新工具与开关（放 util 导出组）
- 大坐标场景不新增风险：段数变化与 RTE rebase（`RTE_REBASE_THRESHOLD = 1e6`）正交，`AcTrOriginShift.spec.ts` 回归确认

### 1.3 测试

1. **新单测 `AcTrArcLod.spec.ts`**：档位边界（恰为 1e-4 / 1e-2）、退化 diagonal/radius（0、负数、NaN、Infinity）、sweep 比例折算与下限 8 / 上限 100、开关关闭恒 100
2. **`AcTrRenderer` 集成测试**（扩展 `AcTrRendererDirectLineCapture.spec.ts` 或新增 spec）：构造真实 `AcDbDatabase` 并以实体扩张 extents（或测试内直接设置 context.database），断言 direct capture payload 的点数符合档位；extents 为空回退 101 点
3. **回归**：`AcTrRendererDirectLineCapture.spec.ts`、`AcGeArcGetPointsFlat.spec.ts`、`AcTrOriginShift.spec.ts`、`AcTrLineGeometryBuilder.spec.ts` 全绿；LOD2 档位与旧行为位级一致（同为 getPointsFlat(100)）

### 1.4 风险与回滚

- 已知取舍：极小圆（如钻孔符号）放大到近屏级时呈 16 边形棱角，属 CAD 查看器常规取舍；开关关闭即完全回退
- 视觉验收清单（GPU 环境）：fit 视图下小圆无视觉差异；将钻孔符号放大至满屏观察棱角；大圆/大弧与旧版逐像素一致
- 回滚：删除变更文件 + 还原 `AcTrRenderer` 两处调用 + 还原 index 导出

---

## 2. M6-2 渲染数据采集脚本

### 2.1 现状

- 采集钩子现成：`bench/verify-jky3.cjs` 的 `internals()` 已演示 `globalThis['__mlViewDebug']` → `renderer.internalRenderer.info.render`（calls/triangles/lines/points）、`view.stats`（entityCount/unbatched/mesh/line）、相机参数、转换计数器
- 页面入口现成：`bench/progressive.html?file=<fixture>`；无头 Chromium + SwiftShader 启动参数见 `verify-jky3.cjs:46-53`
- 本地 SwiftShader 下 `renderer.info` 可用（`bench/progressive.ts` 已用于帧计数）

### 2.2 设计

**新文件**：`cad-viewer/packages/cad-viewer-example/bench/collect-render-stats.cjs`

```
node bench/collect-render-stats.cjs <fixture> [baseUrl] [outDir]
```

流程：

1. 连接 example 开发服务器（`baseUrl` 默认 `http://127.0.0.1:4173`，即 `pnpm dev --host 127.0.0.1 --port 4173`；e2e 配置同端口）
2. `progressive.html?file=` 打开夹具，轮询 `isProcessingEntities === false` 等 idle（沿用 verify-jky3 的轮询模式）
3. `page.evaluate` 采集并回传：
   - `renderer.info.render`：calls / triangles / lines / points
   - `view.stats`：批容器统计
   - **批级视锥命中**：遍历场景图收集各批容器（`geometry.attributes.position.count`、本地 bbox / boundingSphere、世界偏移），用 `THREE.Frustum.setFromProjectionMatrix(camera.projectionMatrix × camera.matrixWorldInverse)` 对每批做 `intersectsSphere` → 输出可见批顶点占比、不可见批顶点占比
   - 相机参数（zoom / z / near / far）与采集时刻
   - 圆弧相关统计（若调试钩子可达实体迭代，统计 circle/arc 实体数与其顶点贡献；不可达则跳过，仅记录批级数据）
4. 输出 JSON 至 `outDir`（默认 `bench/out/render-stats-<basename>.json`），stdout 打印人读摘要（总顶点数、可见/不可见顶点占比、draw call 数）

### 2.3 用途与运行要求

- 用途 1：量化 M6-1 实施前后顶点总量降幅（同夹具跑两遍对比）
- 用途 2：产出 M5-4「槽级视锥剔除」决策数据——fit 视图中不可见槽顶点占比越高，槽级剔除收益越大；占比若已很低则维持 M5-4 暂缓决策
- 夹具选择：优先中等体积（如 `F:\gis\bw-cad-view\cad\dxf\processed\新大地工业广场平面图1000（202509）(1).dxf` ≈ 6MB）；全量 JKY（92MB）在 SwiftShader 下转换过慢，仅作为可选慢速路径并在脚本注释中标注
- 真实 GPU 复跑指引写入脚本文件头注释（本机数据作 CPU 侧参考，GPU 验收另行执行）

### 2.4 测试

- 脚本不进入 jest 套件（Node 工具脚本，与既有 verify-*.cjs 一致）；验收为一次真实运行产出合法 JSON + 摘要数值合理（calls ≥ 1、顶点数 > 0、可见占比 ∈ [0,1]）
- 用 2300 实体的 `origin-shift-big.dxf` 夹具先做冒烟，再跑 6MB 真实图纸

---

## 3. 执行顺序（19:00 自动化，严格按序）

1. **环境自检**：`node -v`（≥ 24）、`pnpm -v`；若 `npx`/`pnpm` 因系统 PATH 缺陷失败（已知问题：PATH 含 `D:\Android_SDK\Android\Sdk\tools"` 尾引号），改用直接调用：`node node_modules/jest/bin/jest.js`、`node node_modules/typescript/bin/tsc`
2. **基线存档**：fixtures 不存在则用 `tools/bench/generate-utf8-dxf.mjs` 等生成；跑 `node --expose-gc tools/bench/bench-parse.cjs <utf8夹具> --repeat 2 --gc` 存档（预期与 §0 基线持平，仅防回归）
3. **实施 M6-1**：新模块 + `AcTrRenderer` 两处改动 + index 导出 → 新增/扩展单测 → `three-renderer` 包 jest 全量 → `node node_modules/typescript/bin/tsc -p packages/three-renderer --noEmit`
4. **实施 M6-2**：新脚本 → 后台启动 `pnpm dev --host 127.0.0.1 --port 4173` → 冒烟夹具跑通 → 6MB 真实图纸跑一次并保存 JSON → 关闭 dev server
5. **全量回归**：`three-renderer`、`cad-simple-viewer`、`data-model`、`geometry-engine` 四包受影响套件（至少 §1.3/§2.4 所列 + 包全量）
6. **收尾**：结果回填本文档『实施结果』小节；**不执行 git commit**；改动保留在工作树待人工审阅
7. **失败处理**：任一步失败且有限重试（≤2 次）内无法解决 → 停止后续步骤，在『实施结果』记录失败原因与已改文件清单，如实报告，不得跳过或伪造成功

## 4. 范围外（重申）

槽级视锥剔除实现、图纸空间视口剔除、大 INSERT/hatch/ACIS 分批、GBK 堆优化、实体存储结构改造——一律不实施；M6-2 数据产出后按《性能优化总结.md》§7 的既有决策纪律另行评估。

## 5. 参考

- `docs/02-性能优化/渲染与解析性能瓶颈分析.md`（§2.2 渲染侧剩余项、§四 优先级清单）
- `docs/02-性能优化/优化计划.md`（M1–M5 实施记录与测试/基准纪律 §9）
- `docs/02-性能优化/性能优化总结.md`（§7 遗留工作清单）
- 代码锚点：`AcTrRenderer.ts:513-522/655-672`、`AcTrRenderContext.ts:29-46`、`AcDbDatabase.ts:2022-2062`、`AcGeCircArc3d.ts:178/535`、`AcGeEllipseArc3d.ts:386`、`bench/verify-jky3.cjs`

---

## 实施结果（自动化执行后回填）

> 2026-09-03 19:00 定时任务执行，19:00–21:10 完成。**全部改动保留在工作树，未 commit。**

### 完成项

| 项 | 状态 | 文件 |
|---|---|---|
| M6-1 LOD 工具（三档 16/48/100、sweep 折算、退化回退、全局开关默认开） | ✅ | `three-renderer/src/draw/AcTrArcLod.ts`（新增）、`src/draw/index.ts`（导出） |
| M6-1 尺度参考字段 | ✅ | `three-renderer/src/renderer/AcTrRenderContext.ts`（`arcLodDiagonal: number = 0`） |
| M6-1 渲染器接入 | ✅ | `three-renderer/src/renderer/AcTrRenderer.ts`（`circularArc`/`ellipticalArc` 两处） |
| M6-1 视图接线 | ✅ | `cad-simple-viewer/src/view/AcTrView2d.ts`（`batchConvert` 每块更新 + `clear()` 复位） |
| M6-1 测试 | ✅ | `AcTrArcLod.spec.ts`（9 测）+ `AcTrArcLodRenderer.spec.ts`（7 测），共 16 测新增 |
| M6-2 采集脚本 | ✅ | `cad-viewer-example/bench/collect-render-stats.cjs`（新增） |

### ⚠️ 设计偏差（重要，必须读）

实施中发现计划文档 §1.2 的两个前提与代码事实不符，按文档"不依赖可能错误的文件头"的**意图**做了最小修正：

1. **`db.extents` 只由文件头 `$EXTMAX/$EXTMIN` 填充**（`AcDbDxfHeaderReader.ts:146/151`），不是实体提交扩张。性能总结 §6.6 早已记录头部值不可靠（JKY 头只覆盖原点一角；3煤 文件为 ±1e20 哨兵）。哨兵若构成"合法大盒"（min=-1e20/max=+1e20），所有圆会被误判为 LOD0 → 整图 16 边形化。**故不采用 `db.extents`。**
2. **转换期间 `_scene.box` 恒空**：`setActiveLayout` 在打开流程结束后才执行，drain 期间 `activeLayout` 未选。首版接线实测 LOD 未触发（浏览器顶点数不变），已改为视图维护的 **`_openUnionBox`（本次打开已转换实体包围盒并集）**：`batchConvert` 每块从并集盒对角更新 `arcLodDiagonal`，direct 路径并入 `unionBox`、非 direct 路径并入 `threeEntity.wcsBbox`，`clear()` 重置。并集盒单调增长 → 比值只会高估 → LOD 永不欠细分，质量安全。

### 测试与回归（全绿）

- three-renderer：**55 套 / 351 测**（含新增 2 套 16 测）；cad-simple-viewer：**74 套 / 381 测**；data-model + geometry-engine：**223 套 / 1456 测**。合计 **352 套 / 2188 测**全过。
- tsc `--noEmit`：three-renderer、cad-simple-viewer 干净（需先 `tsc -p packages/three-renderer` 产出新 d.ts 供下游解析）。
- 解析基准（防回归）：utf8-mixed-100000 778ms / 262.5MB 峰值堆，与基线持平（LOD 属渲染侧）。

### 采集数据（`cad-viewer-example/bench/out/`）

| 夹具 | LOD | 顶点总数 | 说明 |
|---|---|---|---|
| origin-shift-big.dxf（冒烟，2300 实体） | on | 233,122（3 批） | fit + 放大双采样跑通，页面零报错 |
| 新大地工业广场平面图 6MB（25 批） | on / off | 123,205 / 122,274 | 差异 ±0.8% 在 chunk 时序噪声内 |
| 6#煤采掘工程平面图 12.7MB（145 批） | on / off | 1,141,539 / 1,137,655 | 实体普查：35,693 实体中仅 215 圆 + 111 弧 + 25 椭圆（0.9%）→ LOD 影响 <1% |
| **utf8-mixed-100000（20,207 圆 + 15,145 弧）** | **on / off** | **2,756,528 / 4,051,342** | **-32.0%** |

- utf8 夹具全图对角线仅 2.83，半径 1 的圆落 tier2 不裁剪，-32% 主要来自小半径弧；tier0/tier1 档位行为由单测锁定，端到端机制已验证。
- M5-4 决策数据（6# 矿图，锚定最大批球心 4r 窗口）：31/145 批参与绘制，批级剔除消掉 22.3% 顶点（可见比 0.777→0.794）。局部窗口下批级剔除已捕获远簇；**批内槽级剔除的收益需更深缩放数据，维持 M5-4 暂缓决策**。

### 已知遗留

1. **视觉验收未闭环**（本机 SwiftShader）：fit 视图无差异、小圆放大棱角、大圆位级一致——需真实 GPU 目视。
2. 转换期 drain 按时间预算分组，chunk 组成随运行时序微变 → 顶点总数存在 ±0.8% 非确定性（不影响视觉，A/B 需同夹具多次采样）。
3. 环境问题（非代码）：系统 PATH 缺陷实际发作（pnpm shim 无法解析 node），全部改用 `node node_modules/...` 直调；vite 监视目录内**新增**文件会 EBUSY 崩溃，采集夹具必须预先放置、用后删除（本次已清理，`bench/fixtures/` 恢复原状）。

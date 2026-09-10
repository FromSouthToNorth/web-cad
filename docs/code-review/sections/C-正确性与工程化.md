# C 正确性、健壮性与工程化

## C.0 本章范围、数据来源与阅读约定

本章是两轮多智能体代码评审的汇总结论之一，**全部内容取自** `docs/code-review/raw/` 下 14 个域的复核 JSON（csv-cmd、csv-editor、csv-view、dm-database、dm-entity、dm-parser、geo、lifecycle、plugins-heavy、plugins-light、tooling、tr-batch、tr-render、vue-app），未新增任何未经复核的结论。行号、符号名、复现结论均照抄 JSON 中的 `file` / `line` / `evidence` / `note` 字段。

范围口径：

- 收录 `verdict === "confirmed"` 且 `category ∈ {correctness, security, api-design, maintainability, test-gap, build-tooling, docs}` 的 finding，共 **56 条**。
- `category = performance / memory / concurrency` 不在本章，见对应章节。
- **P0/P1 只在表格中占一行**，详解归入「A 严重问题详解」（表格已标注对应 A 编号）；本章展开条目只针对 P1 以下的条目。`performance / memory / concurrency` 类结论见「B 性能与内存」。
- 每条均经过独立「对抗式验证者」逐条读源码 / grep 调用链 / 实测复现，表格「验证结论」列同时标注验证者的修正（严重度上调下调、触发条件收窄、事实被推翻）。

本章 56 条按 `correctedSeverity` 分布：**P1 = 7 条、P2 = 15 条、P3 = 34 条**；按 category 分布：correctness 35、maintainability 6、build-tooling 6、api-design 5、docs 2、security 1、test-gap 1。

> 重要前提（诚实标注）：评审与验证期间，工作区存在**并发的大规模未提交重写**，受影响最重的是 `cad-viewer/packages/data-model/src/base/AcDbDxfPairReader.ts`（1062 → 832 行，20:41 前后被改）。dm-parser 域 4 条 finding 因此被判 refuted（见 C.7.1）——其中 3 条在**评审时的 HEAD**上事实成立，只是当前工作区已不存在该代码或已改为「仅支持 UTF-8」的设计取舍。若这份未提交重写被回退，应按 C.7.1 的提示重新立案。此外，各条行号以评审快照为准，修复前请重新定位。

---

## C.1 数值与几何正确性

覆盖 geometry-engine 的圆弧/椭圆/直线判定、坐标系（OCS/WCS）变换、角度单位、索引数值宽度与 2D 变换公式。

| 编号 | 问题 | 位置 | 严重度 | 验证结论 |
| --- | --- | --- | --- | --- |
| C.1.1 | 整圆 `deltaAngle` 返回 0，CIRCLE 最近点/切点/垂足捕捉全部失效 | cad-viewer/packages/geometry-engine/src/geometry/AcGeCircArc3d.ts:215-217 | P1 | confirmed（P1 维持，jest 实测复现；详解见 A8） |
| C.1.2 | `draw_arc` 把「度」直接传给按弧度解释的 `AcDbArc`，圆弧角度错误 | cad-viewer/packages/cad-agent-plugin/src/tools/CadActionExecutor.ts:291-301 | P1 | confirmed（P1 维持，每次调用必错；详解见 A10） |
| C.1.3 | 三点构造用斜率倒数求圆心，弦轴对齐时圆心/半径变 NaN | cad-viewer/packages/geometry-engine/src/geometry/AcGeCircArc2d.ts:102-130 | P2 | confirmed（P2 维持；实测复现，且 240° 跨度为结构性触发） |
| C.1.4 | `AcGeEllipseArc3d.closed` 语义相反：整椭圆 false、零扫掠 true | cad-viewer/packages/geometry-engine/src/geometry/AcGeEllipseArc3d.ts:358-360 | P2 | confirmed（P2 维持；实测复现，后果比原文更重） |
| C.1.5 | LWPOLYLINE 挤出方向（DXF 210）只存储不生效，几何错误 | cad-viewer/packages/data-model/src/entity/AcDbPolyline.ts:853-873 | P2 | confirmed（P1→P2：夹具 21 条 LWPOLYLINE 的 210 全为 (0,0,1)，无实际样本） |
| C.1.6 | 单簇段数 >32767 时索引 `Uint16Array` 回绕，静默画错线 | cad-viewer/packages/three-renderer/src/object/AcTrLineGeometryBuilder.ts:830 | P2 | confirmed（P1→P2：40000 段单簇实测复现，可达入口窄于原文） |
| C.1.7 | `AcGeCircArc2d.length` 对整圆返回 0 | cad-viewer/packages/geometry-engine/src/geometry/AcGeCircArc2d.ts:405-407 | P3 | confirmed（P2→P3：消费点仅 loop/polyline 长度，「OFFSET/标注」未证实） |
| C.1.8 | 零扫掠圆弧被判为整圆，退化 ARC/弧边变成完整圆 | cad-viewer/packages/geometry-engine/src/geometry/AcGeCircArc3d.ts:154-161 | P3 | confirmed（P2→P3：仅退化输入命中，与 C.1.1 同根因） |
| C.1.9 | `buildHierarchy` 用 `Math.random()` 选包含性测试点，hatch 嵌套不可复现 | cad-viewer/packages/geometry-engine/src/geometry/AcGeArea2d.ts:125-141 | P3 | confirmed（P2→P3：`containsBox` 前置后常规 hatch 输出稳定） |
| C.1.10 | 3DSOLID 线框索引硬编码 `Uint16Array`，>65535 顶点静默截断 | cad-viewer/packages/data-model/src/entity/AcDb3dSolid.ts:349-357 | P3 | confirmed（P2→P3：门槛高；原文修法不完整，渲染侧同样硬编码） |
| C.1.11 | `apply2dTransform` 非旋转分支 Y 坐标公式自累加 | cad-viewer/packages/three-renderer/src/util/AcTrBufferGeometryUtil.ts:342-350 | P3 | confirmed（P3 维持；当前全仓无生产调用方） |

### C.1.3 AcGeCircArc2d 三点构造在弦轴对齐时产生 NaN 圆心

- **问题**：三点构造先用斜率及其倒数求垂直平分线，再解交点。`slope` 分母为 0（弦垂直）得 ±Infinity，`perpSlope = -1/m` 得 -0/0，`b` 出现 `0 * Infinity` 或 `±Infinity`，最终 `(b2 - b1) / (m1 - m2)` 必为 NaN。
- **证据**（JSON 原文）：`AcGeCircArc2d.ts:102-105,122,127-130`；实测 `new AcGeCircArc2d({x:0,y:0},{x:1,y:0},{x:1,y:1})` → `center=(NaN,NaN)`、`radius=NaN`、`deltaAngle=NaN`。并非常见输入才有：弧跨度约 240°（如 30°→270°，中点 150°）时 p1、p2 同 y，`slope1=0 → perpSlope1=-Infinity`，结构性触发。
- **可达链**：`AcDbHatch.ts:1690` → `AcGeArea2d.ts:71` → `AcGeLoop2d.ts:166-190` → `AcGeCircArc2d.ts:433`（transform 内部重建弧）；另有 grip 拖动路径 `AcDbHatch.ts:1363`。NaN 会静默扩散到 radius、包围盒与空间索引。
- **建议修复**：改用垂直平分线向量法解 2×2 线性方程组（可复用 `AcGeCircArc3d.computeCenterPoint` 的做法），求交前用弦长平方下界剔除退化弦，避免出现 `1/m` 与 `∞·0`。

### C.1.4 AcGeEllipseArc3d.closed 与整圆/零扫掠语义相反

- **问题**：`get closed() { return this.deltaAngle == 0 }`（:358-360），而 `deltaAngle` 对整椭圆显式返回 TAU（:144-151）。于是**整椭圆 `closed=false`**，**零扫掠退化椭圆 `closed=true`**，与 `AcGeCircArc3d.ts:501-503`、`AcGeEllipseArc2d.ts:198-200` 完全相反。
- **证据**：实测 `AcGeEllipseArc3d(0,TAU)` → `closed=false`、`deltaAngle=TAU`；零扫掠 `(1.2,1.2)` → `closed=true`、`getPoints(8)` 返回 9 点（整椭圆）。后果比「语义相反」更重：`:623` 的 transform 因 `closed=false` 走 else 分支，整椭圆变换后 `start==end → deltaAngle=0`，实测 `area=0`、`length=0`、`nearestPoint` 退化。下游已被迫打补丁：`AcDbEllipse.ts:374` 写 `this._geo.closed || Math.abs(this._geo.deltaAngle - TAU) < 1e-10`，但只补了 closed 一处；`AcDbEllipse.ts:473/808` 经 `AcApCopyCmd.ts:150` 与 grip 拖动可达。
- **建议修复**：`closed` 统一为「整圈」语义（`|deltaAngle - TAU| < 1e-10`）并显式排除零扫掠，随后移除 `AcDbEllipse.ts:374` 的补偿判断。

### C.1.5 LWPOLYLINE 忽略 DXF 210 挤出方向

- **问题**：`AcDbPolyline.ts:853-873` 的 `case 210` 只把值写入 `this.normal`，此后 `subWorldDraw`（:649-670）只做 `this._geo.getPoints(100)` 并把 z 设为 `this.elevation`，`geometricExtents`（:338-344）与 `getPoint3dAt`（:322-325）也全都不引用 `_normal`。LWPOLYLINE 顶点按 DXF 规范存于 OCS，必须先经 210 变换到 WCS。
- **证据**（临时 Jest 用例实测）：`dxfIn` 读入 `210=(0,0,-1)` 后 `normal.z=-1`，但 `getPoint3dAt(0)=(1,2)`、`getPoint3dAt(1)=(4,2)`，`geometricExtents` 仍为 x∈[1,4]；按 OCS→WCS 应为 (-1,2)、(-4,2)、x∈[-4,-1]。
- **同源问题**：`AcDb2dPolyline.ts` 全文无 210 处理；TEXT/MTEXT 的绘制与 `geometricExtents` 同样缺变换。对照组：`AcDbCircle.ts:582-593`、`AcDbArc.ts:793` 已做 `acgeTransformOcsPointToWcs`。触发面窄——真实夹具 21 条 LWPOLYLINE 的 210 全是 (0,0,1)，故从 P1 下调 P2；但渲染几何、wcsBbox 与空间索引注册框会一起偏。
- **建议修复**：在 `dxfInFields` 结束处按 `AcDbArc.applyDxfInGeometry` 的做法用 refVec 把顶点 OCS→WCS 写回（或保留 normal 并在 worldDraw/geometricExtents/snap 统一用挤出矩阵），并补 LWPOLYLINE / 2dPolyline 的 210 用例。

### C.1.6 单簇线段索引 Uint16 回绕（>32767 段）

- **问题**：`AcTrLineGeometryBuilder.ts:830` 的 `outIndices` 恒为 `new Uint16Array(totalSegments * 2)`，而 `:776-779` 对 `subIndices` 已按 `subVertCount > 65535 ? Uint32Array : Uint16Array` 处理；`:404` 的 `new Uint16Array(filteredIndices)` 同样截断。
- **证据**（实测）：40000 段单簇下最大索引为 65535（应为 79999），第 32768 段索引回绕为 0/1，不抛错、无日志。簇的切分只受 `LINE_REBASE_SPLIT_EXTENT=1e6` 约束、与段数无关，因此稠密边界/表线易落入单簇。
- **可达性（收窄）**：多段线走 `buildLineGeometryMulti`（:135-138 已用 Uint32），只有 `lineSegments` 入口落入（`AcDbTable.ts:589` 大表、`AcDb3dSolid` 线框长段细分），故 P1→P2。
- **建议修复**：让 `outIndices`、`AcTrSegmentCluster.indices` 与 `buildLineSegmentsGeometry:404` 的 indices 形参一起支持 `Uint32Array`（按簇内顶点数选择，与 :776-779 一致），或对每簇强制 32767 段上限。

### C.1.9 buildHierarchy 用 Math.random() 选包含性测试点

- **问题**：判断某 hatch 环是否嵌套在另一环内时，`AcGeArea2d.ts:132-135` 用 `AcGeMathUtil.randInt(0, boundary.length - 1)` 随机抽一个边界顶点送入 `isPointInPolygon`。同一图纸每次运行可能得到不同的孔洞/外环归属（决定填充岛与取反）。
- **证据**：`AcGeGeometryUtil.ts:50-54` 用严格 `<` 判交且 `includeOnSide` 默认 false，抽到的顶点恰落在对方边界上会返回 `inside=false`；`AcGeMathUtil.ts:431-433` 证明 `randInt(0,-1)=0`，空环会传 `undefined` 并在 `:46` 抛错。调用点：`AcDbHatch.ts:972`（`buildAreasFromLoops`）与 `AcTrPolygon.ts:79`。
- **收窄**：`containsBox` 前置后，不相交的嵌套环任取顶点结论一致，只有环互相重叠/相切时才翻转，常规 hatch 输出稳定，故 P2→P3。
- **建议修复**：去掉随机采样，改确定性内点测试（边中点沿局部内法向微移，或对 bbox 中心做多次射线取多数）；`boundary.length === 0` 提前返回；顶点先去重。

### C.1.11 apply2dTransform 非旋转分支 Y 坐标自累加

- **问题**：`AcTrBufferGeometryUtil.ts:342-350` 中 x 分支为 `array[i] = array[i] * scale + translation.x`，y 分支却写成 `array[i + 1] += array[i + 1] * scale + translation.y`，与旋转分支（:338-339 的 `yNew * scale + translation.y`）语义不一致。默认 `scale=1` 时 y 变成 `2y + ty`，同一次调用 x 正确、y 错误，输出点整体错位。
- **证据**：全仓 grep 仅 `:314` 定义处命中，`util/index.ts` 有桶导出但无调用方、测试未覆盖，属未启用路径上的潜在错误，故维持 P3。
- **建议修复**：改为 `array[i + 1] = array[i + 1] * scale + translation.y`，并补一条 `scale≠1` 且 `translation.y≠0` 的单测锁定行为。

---

## C.2 数据解析与往返正确性

覆盖 DXF 标志位与句柄、HATCH 种子点、代理图形二进制 chunk、PDF 导入路径、GeoJSON→实体转换以及 SVG 导出的变换保真。

| 编号 | 问题 | 位置 | 严重度 | 验证结论 |
| --- | --- | --- | --- | --- |
| C.2.1 | 代理图形 PushMatrix 用 `Float64Array`，4 字节对齐 chunk 抛错 | cad-viewer/packages/data-model/src/misc/proxyGraphic/AcDbProxyGraphic.ts:728-733 | P2 | confirmed（P2 维持；良构数据即可触发，本机复现） |
| C.2.2 | `isFrozen`/`isLocked` setter 置 false 无法清位，解冻/解锁静默失效 | cad-viewer/packages/data-model/src/database/AcDbLayerTableRecord.ts:188-194 | P2 | confirmed（P2 维持；仓库内无 setter 调用点，宿主已绕开） |
| C.2.3 | SVG `image()` 返回共享哑对象，栅格图恒在最上层且丢块变换 | cad-viewer/packages/cad-svg-plugin/src/AcSvgRenderer.ts:293-301 | P2 | confirmed（P1→P2：影响面仅含 IMAGE/OLE2FRAME 的图纸） |
| C.2.4 | PDF 导入 `closePath` 守卫条件错误，第 2 个起子路径丢闭合段 | cad-viewer/packages/cad-pdf-plugin/src/AcApPdfImportConvertor.ts:180-186 | P2 | confirmed（P2 维持；多子路径带孔填充/复合轮廓常见） |
| C.2.5 | 代理图形属性 chunk 的 `DataView` 越过 chunk 长度读取 | cad-viewer/packages/data-model/src/misc/proxyGraphic/AcDbProxyGraphic.ts:617-624 | P3 | confirmed（P2→P3：仅截断/损坏的 310 流触发，异常按实体捕获） |
| C.2.6 | `registerHandle` 合成句柄可撞真实句柄、大小写不同 key 输出同句柄 | cad-viewer/packages/data-model/src/base/AcDbDxfFiler.ts:230-249 | P3 | confirmed（P3 维持；已用 dist/data-model.cjs 实测重复 group 5） |
| C.2.7 | HATCH 导出恒写 0 个种子点，读取侧又整体丢弃，往返丢失 | cad-viewer/packages/data-model/src/entity/AcDbHatch.ts:1879-1880 | P3 | confirmed（P3 维持；仅影响导出，不影响查看） |
| C.2.8 | Polygon/MultiPolygon 只用外环，内环（孔洞）被静默丢弃 | cad-viewer/packages/cad-tunnel-plugin/src/geojson/geojsonToEntities.ts:498-537 | P3 | confirmed（P2→P3：jsonData/tunnel.json 38 个要素全为 LineString，0 个 Polygon） |
| C.2.9 | MultiPoint 不生成名称标注，与使用手册声明不一致 | cad-viewer/packages/cad-tunnel-plugin/src/geojson/geojsonToEntities.ts:611-623 | P3 | confirmed（P3 维持；原 confidence=low，但代码事实可直接确认） |

### C.2.1 代理图形 PushMatrix 的 Float64Array 对齐缺陷

- **问题**：`AcDbProxyGraphic.ts:729` 直接 `new Float64Array(data.buffer, data.byteOffset, 16)`。`Float64Array` 要求 `byteOffset` 为 8 的倍数且底层剩余 ≥128 字节，而本模块自述代理图形 chunk 只保证**4 字节对齐**（`AcDbProxyGraphicBinaryStream.ts:39-43`，`align=4`）。
- **证据**：类自述流含 8 字节前缀（`:221-225`，`_index=8`），载荷绝对偏移 = 16 + Σsize；`Polyline(12+24N)` 与 size=12 的 4 字节属性 chunk（AttributeColor/Layer/Linetype/Fill/TrueColor/Lineweight）的 size ≡ 4 (mod 8)，其后接 PushMatrix 时 `byteOffset % 8 === 4`。本机实测抛 `RangeError: start offset of Float64Array should be a multiple of 8`——**良构数据即可触发**，不是只有损坏文件才出问题。载荷 <128 字节（如 size=8）时还会越界读入后续 chunk 或抛错。
- **影响（验证者修正）**：异常被 `AcTrView2d.ts:2981` 的 per-entity catch 捕获 → 该代理实体不绘制，**不会**中断整批渲染（原文“可能上抛渲染批次”不成立）。
- **建议修复**：改用 `new DataView(data.buffer, data.byteOffset, Math.min(128, data.length))` 循环 `getFloat64`，或先校验 `data.length >= 128` 再复制到 8 字节对齐的临时缓冲。

### C.2.2 isFrozen / isLocked setter 置 false 不清位

- **问题**：`AcDbLayerTableRecord.ts:191-194` 为 `this.standardFlags = this.standardFlags | flag`，其中 `flag = value ? 1 : 0`；`isLocked`（:259-262）同理用 `| 4`。`layer.isFrozen = false` 等价于 `flags | 0`，位不会被清除，解冻/解锁**静默无效**且无任何提示。getter 在 `:189`/`:257` 按位读取。
- **证据**：仓库内没有任何 setter 调用点（仅 `:185`/`:253` 的文档示例）；宿主 `AcApLayerService.ts:309-332` 的 `setLayerFrozenState`/`setLayerLockedState` 正是用 `flags & ~FLAG` 绕开，说明正确写法存在。这是对齐 ObjectARX 的公开 API 上的遗漏，插件/CLI/文档示例按 API 解冻图层会失败。
- **建议修复**：`this.standardFlags = value ? this.standardFlags | 1 : this.standardFlags & ~1`（`isLocked` 用 `0x04`）。

### C.2.3 SVG 导出的 image() 保序与变换丢失

- **问题**：`AcSvgRenderer.ts:293-301` 在 `image()` 里把 `AcSvgImage.fromBlob(...).then(entity => this.pushEntity(entity))` 排进微任务，却**立即返回模块级单例 `_tempEntity`**（定义在 `:377`，`_localSvg=''`）。
- **证据**：`AcApSvgConvertor.ts:27-29` / PDF 侧 `:36-40` 是**同步**遍历 modelSpace 调 `worldDraw`，pushEntity 必然排在全部同步实体之后，因此所有 IMAGE/OLE2FRAME 恒位于 `<g>` 末尾，按 SVG 绘制顺序覆盖压住其上方的矢量线；`AcDbRenderingCache.addEntity` 把 `_tempEntity` 塞进 group，块/INSERT 变换作用在 group 上而非真实 image，块内栅格图不被定位。另：`AcSvgImage.ts:54-58` 只 catch 了 rasterize 的失败，FileReader 失败会让 `exportAsync:307` 的 `Promise.all` 整体 reject，整个导出失败。
- **收窄**：影响面仅限含 IMAGE/OLE2FRAME 的图纸，非通用导出路径，P1→P2。
- **建议修复**：让 `image()` 返回可被 `applyMatrix` 的真实占位/延迟实体（或同步返回 `AcSvgImage` 并稍后填充 dataUrl），按插入位置保序追加而非 push 到末尾；并捕获 `fromBlob` 的 rejection。

### C.2.4 PDF 导入 closePath 守卫条件写错

- **问题**：`AcApPdfImportConvertor.ts:181` 的守卫是 `if (current.length > 0 && subpaths.length === 0)`。而 `flush()`（`:97-100`）正是把 `current` 推入 `subpaths`（`:98`），因此同一 path 内**第一个**子路径会被补首点，**第二个起** `subpaths.length > 0` 恒为假、永不补点。PDF 的 `closePath` 语义是「用一条直线回到子路径起点」。
- **证据**：`subpathToEntity`（`:218-224`）用首末点距离 `< 1e-6` 判 `closed`，缺闭合边时 `poly.closed` 保持 false，导入折线留缺口。多子路径的带孔填充、复合轮廓、字形轮廓都会命中；P2 恰当。
- **建议修复**：条件改为 `if (current.length > 0)`，并在 `subpathToEntity` 里判重首点避免重复入顶点。

### C.2.6 registerHandle 可产出重复句柄

- **问题**：`AcDbDxfFiler.ts:230-249` 的合成分支中 `_nextHandle`（`:120` 初始化为 1）只在合成时自增，**从不跳过图中已存在的真实句柄**；map 以原始 key 为键、以大写句柄为值。
- **证据**（用已构建的 `dist/data-model.cjs` 实测）：`registerHandle('1a')→'1A'`、`registerHandle('1A')→'1A'`，随后两次 `writeHandle(5, …)` 后 `toString()` 输出两组 `5\n1A` —— 重复 group 5 成立；`registerHandle('10')` 保留 `'10'`、`registerHandle('x')→'1'`，验证合成值可撞真实 `'10'`。真实图纸句柄按十六进制递增，注册到第 15 个非 hex key 就会撞车。重复 group 5 会破坏句柄引用（AutoCAD AUDIT 报错、字典→对象链接断裂）。
- **收窄**：仓内调用方只传大写 hex（`AcDbObject.ts:788`、`AcDbDatabase.ts:3191/3198` 等），非 hex key 仅见 `AcDbDxfFiler.spec.ts:31`，属公开 API 的潜在缺陷，且导出是冷路径，维持 P3。
- **建议修复**：保留句柄按大写归一化后再入 map 并检测冲突；合成时在「已用句柄集合」中跳过冲突值，或统一走 `AcDbDatabase.generateHandle()`。

### C.2.7 HATCH 种子点在 DXF 往返中永久丢失

- **问题**：`AcDbHatch.ts:1879-1880` 是 `// TODO: Write the number of seed points` + `filer.writeInt16(98, 0)`，导出恒写 0 个种子点；读入侧 `:2212-2218` 在 `afterBoundaries` 分支把组码 98 及随后的 10/20 全部丢弃。类内没有任何 seed 字段（全文仅 3 处 seed 注释：1879/2213/2242），因此种子点信息在往返导出中**必然**丢失。
- **影响**：AutoCAD 依据种子点重建/编辑填充边界与孤岛，含多个孤岛的填充重新生成时结果可能不同，属静默数据丢失。导出路径真实存在（`AcApDxfConvertor.ts:12` 调用 `database.dxfOut`），但仅影响导出结果、不影响查看，故维持 P3。
- **建议修复**：dxfIn 把 98 后的种子点存入实体字段，dxfOut 按真实数量写 98 并回写坐标；若暂不实现，至少保留读到的原始数组而不是写 0。

---

## C.3 健壮性与边界

覆盖异常/失败路径、数组长度上界、路径校验、未处理 Promise 拒绝、跨文档状态与计数残留。

| 编号 | 问题 | 位置 | 严重度 | 验证结论 |
| --- | --- | --- | --- | --- |
| C.3.1 | `updateEntity` 未配平待处理计数，计数下溢被钳到 0 | cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2047-2049 | P1 | confirmed（P1 维持，每次编辑实体即告警；详解见 A6） |
| C.3.2 | `clear()` 不重置每文档布局状态，第二个文档复用上一张图纸布局 | cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2219-2235 | P1 | confirmed（P1 维持；btrId 跨图纸高度重复；详解见 A7） |
| C.3.3 | 批量通知 `push(...items)` 超 V8 参数上限抛 RangeError | cad-viewer/packages/data-model/src/database/AcDbDatabase.ts:828-838 | P1 | confirmed（P1 维持，实测 125000 抛错；详解见 A1） |
| C.3.4 | `loadLayoutEntitiesIfNeeded` 异步转换失败被吞，计数永不回减 | cad-viewer/packages/cad-simple-viewer/src/view/AcTrView2d.ts:2541-2558 | P3 | confirmed（P2→P3：需布局未被流式装载且实体数 >约 12 万，可达性低） |
| C.3.5 | 顶点标记 `points.push(...cached)` 可抛 RangeError | cad-viewer/packages/cad-simple-viewer/src/editor/marker/AcEdSelectionVertexMarkers.ts:147-157 | P3 | confirmed（P2→P3：本机实测约 12.6 万起才抛，需单实体 ≥约 12.5 万 grip 点） |
| C.3.6 | CLI 静态服务器 `readFile` 无 catch：未处理拒绝 + 响应悬挂 | cad-viewer/packages/cad-simple-viewer-cli/src/runHeadless.ts:258-261 | P3 | confirmed（P2→P3：触发需请求目录路径或 existsSync/readFile 竞态） |
| C.3.7 | `waitForIdle` 轮询无上限、`cancel()` 停不掉定时器 | cad-viewer/packages/cad-simple-viewer/src/app/AcApOpenFileProfiler.ts:221-237 | P3 | confirmed（P2→P3：仅影响 OPENPROF 诊断，getLastSnapshot 全仓无调用者） |
| C.3.8 | CLI 静态服务器目录前缀校验可被 `../` 绕过 | cad-viewer/packages/cad-simple-viewer-cli/src/runHeadless.ts:235-241 | P3 | confirmed（P3 维持；仅监听 127.0.0.1、无 CORS，危害限本机） |
| C.3.9 | `preloadDefaultFonts` 的 fire-and-forget 吞掉字体加载 rejection | cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:564-566 | P3 | confirmed（P3 维持；仓内无调用者启用 preloadDefaultFonts） |
| C.3.10 | 导出 HTML 运行时永久清空几何 CPU 数组，上下文丢失后无法恢复 | cad-viewer/packages/cad-html-plugin/src/AcExViewerMemory.ts:117-124 | P2 | confirmed（P2 维持；原文 fix 不可行，已在验证中修正） |
| C.3.11 | 分层隐藏只做一次性遍历，之后新增/reattach 的覆盖层忽略隐藏态 | cad-viewer/packages/three-renderer/src/html/AcTrHtmlTransientManager.ts:401-433 | P3 | confirmed（P3 维持；链已核实） |
| C.3.12 | `resetGeometry` 会复活已删除（inactive）的槽位 | cad-viewer/packages/three-renderer/src/batch/AcTrBatchedLine.ts:265-276 | P2 | confirmed（P2 维持；PDMODE 变更链路已核实） |

### C.3.4 loadLayoutEntitiesIfNeeded 的失败路径吞掉计数

- **问题**：`AcTrView2d.ts:2541-2558` 先 `this._numOfEntitiesToProcess += entities.length`，随后 progressive 模式用 `this._convertQueue.push(...entities)`（:2545）入队，并以 `void convert()`（:2558）触发 async 转换。`entities` 是整块 block table record 的全量数组（:2523-2527 逐实体 push，无分块），同文件 `:3144-3146` 的注释已明确警告 `push(...)` 展开模式。
- **证据与影响**：`convert` 无 catch 兜底，异常成为未处理 rejection；`finally` 只清 `_loadingLayouts`，而计数已 +N 却永不回减 → `isProcessingEntities` / `isOpenFileWorkPending` 恒为 true，打开/切布局遮罩不消失、`zoomToFitDrawing` 的 waiter 永不触发、`isLoaded` 也不再置位（每次切该布局重试）。
- **收窄**：`:2511` 对 `entityCount > 0` 已早退，且 `AcDbBlockTableRecord.ts:451-459` 表明各空间都会 `entityAppended`，大图纸模型空间走不到此处；触发需「布局未被流式装载且实体数 >约 12 万」，P2→P3。同类更易触发的点是 `:1242`（导出跨布局累计），但 `:1252` 才 +N 不漏计数。
- **建议修复**：分批入队（for 循环 push 或 splice 分批）；给 `convert` 加 catch 并回滚 pending 计数，避免未处理 rejection。

### C.3.6 CLI 静态服务器的未处理 Promise 拒绝

- **问题**：`runHeadless.ts:258-261` 为 `void readFile(filePath).then(body => { res.writeHead(200); res.end(body) })`，没有 `.catch`。外层 try/catch（`:231-265`）只能捕获同步异常。
- **证据**：`existsSync`（`:243`）对目录也返回 true，因此请求 dist-runner 下某个子目录（如 `GET /workers/`、`/assets/`）会在 `readFile` 处 EISDIR 并 reject。Node 24 默认 `--unhandled-rejections=throw`，会打印未处理拒绝并**终止 CLI 进程**（页面端表现为请求悬挂、Playwright networkidle 卡死），而不是返回 500；全仓 grep 无 `unhandledRejection`/`uncaughtException` 兜底。
- **收窄**：正常 runner 资源加载不会命中，触发需请求目录路径或 existsSync/readFile 竞态，P2→P3。
- **建议修复**：改为 `await readFile` 并用 try/catch 返回 500（或补 `.catch`）；同时用 `statSync().isFile()` 区分目录。

### C.3.7 OPENPROF 的 waitForIdle 轮询无法取消

- **问题**：`AcApOpenFileProfiler.ts:221-237` 的 `poll` 只看 `view.isProcessingEntities`，以 `setTimeout(poll, 16)` 自续，**无 epoch、无上限**；`cancel()`（`:161-172`）只 detach 进度监听与清 `_active`，没有任何标志或句柄能停止已排定的定时器。
- **证据与影响**：(1) 只要 `isProcessingEntities` 不落回 false（打开失败/文档被替换/转换队列卡住），poll 就永久以 ~60Hz 空转，promise 永不 resolve → `scheduleReport` 的 `.then` 永不执行，`begin()` 置位的 `AcDbRenderingCache.profiling=true`（:136）会一直保持开启，data-model 侧持续按块收集统计。(2) `begin()`（:123）先 `cancel()` 再置 `_active=true`；上一次遗留的 poll 在第二会话开始后 resolve 时，`:208-214` 见 `_active` 已为新会话为 true 就 `publishReport` 并 `cancel()`，用旧会话的 convertEndMs 与新会话的 `_stages` 出一份错报告，同时把新会话 `_active` 关掉，导致 `markReadCompleteAndScheduleReport` 因 `!this._active`（:151-153）直接 return，新会话 profile 被静默丢弃。
- **收窄**：仅影响 OPENPROF 诊断功能（`getLastSnapshot` 全仓无调用者），P2→P3。
- **建议修复**：`begin()` 生成 epoch/AbortSignal，poll 每轮先校验 epoch 匹配并累加最大等待（如 120s 后放弃并 publish），`cancel()` 置位让 poll 立刻退出，`publishReport` 前再校验 epoch。

### C.3.8 CLI 静态服务器的路径前缀校验可被绕过

- **问题**：`runHeadless.ts:235-241` 用 `path.join(root, relative)` 后判 `filePath.startsWith(root)`，是**字符串前缀**而不是路径关系判断。
- **证据**（node 实测）：`path.join('/a/dist-runner','../dist-runner-x/secret')` = `/a/dist-runner-x/secret`，仍满足 `startsWith(root)`，403 被绕过，可读取 dist-runner 之外的文件（`../../etc/passwd` 之类会被拦）。服务只监听 127.0.0.1 且不返回 CORS 头，浏览器页面无法直接读取响应，实际危害限于本机进程/本机工具读取任意文件，故 P3——但这是明确的路径穿越。
- **建议修复**：改用 `path.relative(root, filePath)` 并判断结果不以 `..` 开头且非绝对路径，或用 `filePath === root || filePath.startsWith(root + path.sep)`。

### C.3.10 导出 HTML 清空 CPU 几何后无法从 WebGL 上下文丢失中恢复

- **问题**：`AcExViewerMemory.ts:117-124` 在 renderer 首次渲染后（调用点 `AcExHtmlViewerRuntime.ts:626`）把静态图层所有 position/index/instanceStart 等 attribute 的底层 array 置为 `new Float32Array(0)`、清 update ranges 并置 `needsUpdate=false`，以省内存。
- **证据与影响**：three 0.172 在上下文丢失并恢复时会重建 GL 上下文并从 `attribute.array` 重新上传缓冲（`three.module.js:14980`），此时数组已空，导出 HTML 会永久显示空白或残缺图纸；全仓无 `webglcontextlost` 监听。目标环境正是软件渲染（无真实 GPU），上下文丢失/驱动重置概率更高，而导出 HTML 常作为长期交付物打开。
- **验证修正**：原文建议「恢复时从快照批次重建 BufferGeometry」**不可行**——批次与 payload 已分别被 `:66-80` 与 `removeSnapshotElement`（:206）清空；只能保留 CPU 数据，或在丢失时给出提示而非静默空白。JSDoc 只写了「GPU 已上传」，未覆盖上下文恢复场景。
- **建议修复**：保留可重建的最小数据（或记录可回填标记），监听 `webglcontextlost/restored`；若确要保持现状，至少在恢复回调里提示用户。

### C.3.12 resetGeometry 复活已删除的槽位

- **问题**：`deleteGeometry` 只把 flags 置为 `None`（`AcTrBatchedMixin.ts:436`），`optimize()` 也不裁剪 `_geometryInfo` 记录，因此已擦除实体的 position/objectId 仍留在数组里；而 `AcTrBatchedLine.getUserData()`（`AcTrBatchedLine.ts:265-276`）**未按 `isBatchGeometryActive` 过滤**。
- **证据（链路已核实）**：点显示模式变化时 `AcApContext.ts:118` 的 PDMODE → `AcTrView2d.rerenderPoints:1397` → `AcTrBatchedGroup:406-415` 调 `resetGeometry`（`AcTrBatchedLine.ts:289-313`），对带 position 的残留记录一律 `addGeometry + setGeometryInfo`，已擦除的 POINT 符号/点实体重新出现（视觉数据回退）。
- **建议修复**：`getUserData()` 跳过 `!isBatchGeometryActive(item.flags)` 的记录（或 `resetGeometry` 只遍历 active 槽），必要时在 `optimize` 末尾截断尾部连续 inactive 记录。

---

## C.4 API 设计与一致性

覆盖 setter/查询语义不一致、契约违反、默认值漂移、依赖协议、死代码与单一实现两套行为。

| 编号 | 问题 | 位置 | 严重度 | 验证结论 |
| --- | --- | --- | --- | --- |
| C.4.1 | `fastDeepClone()` 返回 `this`，违反缓存模板不可变契约 | cad-viewer/packages/cad-svg-plugin/src/AcSvgEntity.ts:147-149 | P1 | confirmed（P1 维持，重复 INSERT 变换连乘；详解见 A9） |
| C.4.2 | `removeEntity` 首个命中即 break，跨 owner 的选择删除不完整 | cad-viewer/packages/data-model/src/database/AcDbBlockTable.ts:91-100 | P3 | confirmed（P2→P3：break 使 B×N 次 Set 构造不成立；数组调用方仅同布局） |
| C.4.3 | invertsel 对 data-model 用 semver 范围而非 `workspace:*` | cad-viewer/packages/cad-invertsel-plugin/package.json:48,52 | P2 | confirmed（P2 维持；实测已解析/软链到 registry 1.14.3） |
| C.4.4 | 设置面板重算标签碰撞不按文档要求的优先级排序 | cad-viewer/packages/cad-tunnel-plugin/src/applyTunnelSettings.ts:91-102 | P2 | confirmed（P2 维持；两条路径行为不一致） |
| C.4.5 | `registerLazyPlugin` 冲突抛异常但保留半注册状态 | cad-viewer/packages/cad-simple-viewer/src/plugin/AcApPluginManager.ts:136-151 | P3 | confirmed（P3 维持；重试永久失败） |
| C.4.6 | 公开导出的 i18n `cmdDescription` 未小写化命令名，查表必然未命中 | cad-viewer/packages/cad-simple-viewer/src/i18n/index.ts:38-41 | P3 | confirmed（P3 维持；仓库内无调用者，仅集成方暴露） |
| C.4.7 | `AcDbDictionary.has` 大写化 key，与 getAt/setAt/remove 结论矛盾 | cad-viewer/packages/data-model/src/object/AcDbDictionary.ts:258-260 | P3 | confirmed（P3 维持；仓库内唯一调用方受影响） |
| C.4.8 | `AcGeLine3d.atLength` 的 flag 语义与文档相反 | cad-viewer/packages/geometry-engine/src/geometry/AcGeLine3d.ts:107-122 | P3 | confirmed（P3 维持；无生产调用者，仅对外 API） |
| C.4.9 | `minimumChunkSize \|\| 200` 中的 200 不可达，实体分批实际恒为 10 | cad-viewer/packages/data-model/src/dxf/AcDbNativeDxfConverter.ts:74,122,143 | P3 | confirmed（P3 维持；仓内 4 个调用点均显式传值，无用户可见回归） |
| C.4.10 | `AcTrBatchedLine2.dispose` 覆盖基类实现且丢失 `batchDisposed` 标记 | cad-viewer/packages/three-renderer/src/batch/AcTrBatchedLine2.ts:661-664 | P3 | confirmed（P3 维持；窗口窄的未爆发竞态） |
| C.4.11 | `AcTrVersionManager` 版本号硬编码、未导出、无任何调用者 | cad-viewer/packages/three-renderer/src/AcTrVersionManager.ts:1-31 | P3 | confirmed（P3 维持；死代码 + localStorage 无保护） |
| C.4.12 | `useDocument` 轮询无上限且类型断言直读私有 `_instance` | cad-viewer/packages/cad-viewer/src/composable/useDocument.ts:289-295 | P3 | confirmed（P3 维持；同仓 useUndoRedo 有上限，行为不一致） |
| C.4.13 | Agent 消息工具标签 `v-for` 使用可能重复的 `:key` | cad-viewer/packages/cad-agent-plugin/src/ui/AgentChatPanel.vue:549-555 | P3 | confirmed（P3 维持；Vue 会告警并可能错误复用 DOM） |

### C.4.2 removeEntity 的 break 语义导致跨 owner 删除不完整

- **问题**：`AcDbBlockTable.ts:91-100` 遍历全部 BLOCK_RECORD，**首个命中任意 id 的 BTR 即 break**，其余 owner 中的 id 不会被删除却仍返回 `true`。
- **证据**：`AcDbBlockTableRecord.removeEntity`（:488-519）内部每次调用都 `new Set(ids)` 并全量扫描实体。唯一数组调用方 `AcApEntityService.eraseEntities:158-170` 仍按 `idsToErase.length` 报告成功数，跨模型/图纸空间或块内选择会静默漏删。
- **验证修正（收窄）**：原文「B×N 次 Set 构造」基本不成立——break 使常规只有 model space 一个 BTR 被扫；`AcEditor.selectAll:443-464` 仅枚举 model space，跨 owner 漏删需调用方自行拼跨容器 id 数组。故 P2→P3，但 API 契约（返回 true 却未删完）仍应修。
- **建议修复**：用 `db.getObjectById(id)` 取实体后按 `ownerId` 直接定位 owner BTR 做单次删除；若保留该 API，则不要 break，并返回真实删除数量。

### C.4.3 cad-invertsel-plugin 的 data-model 依赖未用 workspace 协议

- **问题**：`packages/cad-invertsel-plugin/package.json:48`（devDependencies）与 `:52`（peerDependencies）把 `@hy/data-model` 写成 `^1.13.0`，是全仓 24 处声明中唯一的漂移，违反 CLAUDE.md「包内引用一律使用 `workspace:*`」。
- **证据**：`tools/sync-versions.mjs:139-152` 只重写 `workspace:*` 或 `pnpm-workspace.yaml` overrides 中列出的名字，而 data-model 不在 overrides（`pnpm-workspace.yaml:10-17`），所以 `pnpm sync:versions:check` **永远看不到它**。
- **验证修正（比原文更严重）**：`pnpm-lock.yaml:180-182` 已把它解析为 registry 的 **1.14.3**（repository 指向 realdwg-web），插件 node_modules 也软链到该 registry 副本而非本地 1.13.0（`link-workspace-packages` 未生效）；即本地改动不会进入插件。原文「publish 后 peer 范围静默失效」那半不成立——该包 `private:true`。
- **建议修复**：两处都改为 `workspace:*` 并重装；考虑在 sync-versions.mjs 中把内部包名（`@hy/*`）纳入强制 workspace 协议检查。

### C.4.4 标签碰撞重算与绘制路径的优先级不一致

- **问题**：`applyTunnelSettings.ts:91-102` 把按 db 迭代顺序（= 插入/要素顺序）构造的 `boxes`（:92-99）直接交给 `selectNonOverlapping`，而绘制路径 `geojsonToEntities.ts:250-273` 会**先按优先级降序排序再贪心**（priority 由几何长度/立井外圈周长算出，:301-329）。
- **证据**：`labelCollision.ts:66-78` 的注释明确写 `Sort boxes by priority first`，顺序即决定保留者；`docs/05-使用手册/绘制巷道插件使用说明.md:205-207` 声明「按优先级（几何长度，长者优先…）排序后贪心保留」。`settingsPanel.ts:268-296` 每次 apply（含仅改线宽/字高）都重跑碰撞并在 `:329-334` 防抖，因此用户即使只拖动「巷道线宽」也会导致可见名称集合与 drawtunnel 当次绘制结果不一致、互相切换。Text 实体不携带长度，无法恢复优先级。
- **建议修复**：在 Text 实体上持久化标签优先级（XDATA）或维护 名称→优先级 映射后排序；或 `updateTunnelEntities` 只处理高度/线宽变化，碰撞显隐沿用绘制时记录的 visibility 与优先级。

### C.4.5 registerLazyPlugin 抛异常后留下半注册状态

- **问题**：`AcApPluginManager.ts:136` 先 `this._lazyRegistrations.set(pluginName, registration)`，随后在 `:138-151` 的循环里逐条写 `_triggerToPluginName`，:144 遇触发器冲突直接 `throw`。异常抛出后 `_lazyRegistrations` 保留了该插件名，而只有部分 trigger 进入映射表，无任何回滚/清理代码。
- **证据与影响**：调用方（宿主/测试）修正配置后重试会命中 `:124` 的 `Lazy plugin ... is already registered` **永久失败**；已写入的 trigger 仍能把 `loadByTrigger`（:183-198）指向一个只注册了一半的插件，行为不确定。
- **建议修复**：先做完整校验（构造临时 trigger→plugin 映射，检查空值/重复/与既有映射冲突），全部通过后再一次性提交两处写入；或在 catch 中回滚已写入的 trigger。

### C.4.7 AcDbDictionary 的 key 归一化策略混用

- **问题**：`AcDbDictionary.ts:258-260` 的 `has(name)` 用 `name.toUpperCase()`，而 `setAt:114`、`getAt:293-295`、`remove:147` 使用**原始 key**。同一对象上 `has('Model')===false`、`has('MODEL')===true` 而 `getAt('MODEL')===undefined`，结论自相矛盾。
- **证据**：`AcDbDatabase.ts:2607` 正是 `setAt('Model', …)` 写入；仓库内唯一调用方 `AcDbLayoutManager.ts:205-207` 的 `layoutExists` 对任何混合大小写布局名恒返回 false。dictionary key 的大小写敏感性在 DXF 中是有语义的，当前实现两种策略混用。
- **建议修复**：统一 key 归一化——要么 setAt/getAt/remove/has 全部做同一种规范化，要么 `has` 也用原始 key，并把大小写敏感性约定写进注释。

### C.4.8 AcGeLine3d.atLength 的实现与文档相反

- **问题**：`AcGeLine3d.ts:107-113` 的文档声明「flag=true 时使用到端点的长度」，实现却在 `flag===true` 时以 `_start` 为基点；`flag===false` 时以 `_end` 为基点却仍沿 start→end 正向偏移，返回**线段延长线之外**的点。两个分支都与文档不符，也与同文件 `extend`（:131-144）的 `inversed` 约定相反。
- **证据**：全仓 grep 仅两处测试调用——`AcGeLine3d.spec.ts:9-13` 只断言 `flag=true` 得 x≈1（正好固化了现实现），`AcGeCoverageBoost.spec.ts:578` 只断言 defined；无生产调用者，属对外发布的 ObjectARX 风格 API 上的文档/实现不一致，维持 P3。
- **建议修复**：统一语义（flag 为真时基点取 `_end` 且方向取 `-direction`，为假时基点取 `_start` 且方向取 `+direction`），或改名为 `atDistanceFromEnd`/`atDistanceFromStart` 并同步文档与测试。

### C.4.9 实体分批默认值漂移（`|| 200` 不可达）

- **问题**：`AcDbNativeDxfConverter.ts:74` 解构默认已是 `minimumChunkSize = 10`，而 `:122`、`:143` 写 `Math.max(1, minimumChunkSize || 200)`；`10 || 200` 恒为 10，`|| 200` 想表达的 200 默认（与 `AcDbDxfDocumentReader.ts:538/751` 的 `entityBatchSize ?? 200`、注释口径一致）**永远拿不到**。
- **影响**：调用方不传该选项时，38 万实体的 ENTITIES 主循环每 10 个实体就 await 一次 `yieldAndReportProgress`（3.8 万次 reportParseProgress/让门检查），`endEventBatchChunked(10)` 把 entityAppended 切成 3.8 万个 chunk（200 时应为 1900 个），事件派发与渲染转换队列开销放大约 20 倍。200 这一阈值在 4 处重复字面量，已出现语义漂移。
- **收窄**：本仓 4 个调用点都显式传 1000（`useAntdCadShell.ts:64`、`AcApOpenFileDialog.ts:77`、`AcApDocManager.ts:1123`，data-model 测试传 50/5），当前无用户可见回归，属公开 API 默认值失效，维持 P3。
- **建议修复**：抽具名常量（如 `ACDB_ENTITY_BATCH_SIZE = 200`），三处改用 `options.minimumChunkSize ?? ACDB_ENTITY_BATCH_SIZE`，`AcDbDxfDocumentReaderOptions.entityBatchSize` 复用同一常量。

### C.4.13 Agent 消息内工具标签的 :key 可能重复

- **问题**：`AgentChatPanel.vue:550-552` 的 `v-for="toolName in toolParts(message)" :key="toolName"`；`toolParts`（:355-363）只做 `part.type.replace(/^tool-/, '')`，因此同一条 assistant 消息里同名工具被调用多次（如多次 `draw_line`，在 `stopWhen=stepCountIs(10)` 内很常见）就产生重复 key。
- **证据**：Vue 会报 “Duplicate keys found during update” 并在补丁阶段复用错误的 DOM 节点，标签行可能丢失或错位。AI SDK 每条 `tool-<name>` part 各有唯一 `toolCallId`，可作 key。
- **建议修复**：`toolParts` 返回 `{name, key}` 或以 `part.toolCallId`/索引作 key。

---

## C.5 工程化与 CI

覆盖 lint 门禁、locale 规则、changeset/lockstep、release 校验、jest 配置、bootstrap 与 Python 工具。

| 编号 | 问题 | 位置 | 严重度 | 验证结论 |
| --- | --- | --- | --- | --- |
| C.5.1 | CI 的 lint 门禁在 HEAD 上已失败：4 个包 21 个 error | cad-viewer/.github/workflows/ci.yml:48-49 | P1 | confirmed（P1 维持，逐包 + nx 双重复现；详解见 A14） |
| C.5.2 | eslint 的 `localeDir` 匹配不到任何文件，locale 规则静默失效 | cad-viewer/eslint.config.js:81 | P2 | confirmed（P2 维持；验证者指出光改 glob 仍不够） |
| C.5.3 | changeset fixed 组漏掉 5 个已发布包，lockstep 版本无法达成 | cad-viewer/.changeset/config.json:5-19 | P2 | confirmed（P2 维持；现存 changeset 也自相矛盾） |
| C.5.4 | `tools/release.mjs` 不校验 tag 与各包版本一致，也不跑 changeset | cad-viewer/tools/release.mjs:109-112 | P2 | confirmed（P2 维持；通读全文 114 行确认） |
| C.5.5 | jest.config.ts 用 readdir 顺序挑 store 里的 lodash，版本不可复现 | cad-viewer/jest.config.ts:13-27 | P3 | confirmed（P2→P3：实测命中 4.18.1，仅影响单测可复现性） |
| C.5.6 | bootstrap.mjs 用下游示例产物作为「全部包已构建」的代理信号 | bootstrap.mjs:78-84 | P3 | confirmed（P2→P3：开发脚本健壮性，有明确 workaround） |
| C.5.7 | process_dxf.py 缺 `--out`/`--src` 同目录保护，可原地覆盖源图 | cad-tools/process_dxf.py:1239-1248 | P3 | confirmed（P2→P3：需用户显式误写才触发，且 md 已提示分离） |
| C.5.8 | 动态 i18n key 违反仓库自身 ESLint 规则 | cad-viewer/packages/cad-viewer-example/src/shell/panels/AntdPropertiesPanel.vue:108 | P3 | confirmed（P3 维持；实测该包 13 error/4 warning） |

### C.5.2 localeDir 错位导致整套 locale 规则空转

- **问题**：`eslint.config.js:81` 配置 `localeDir: './**/locales/*.{json,json5,ts,js,yaml,yml}'`，但仓库中**不存在任何 `locales/` 目录**：实际文案在 `packages/cad-viewer/src/locale/<lang>/*.ts`（单数、且深一层），`packages/*/src/i18n/*.ts` 则是另一套目录名。
- **证据**：插件用 `glob.sync(pattern, {cwd})`（`@intlify/eslint-plugin-vue-i18n dist/utils/index.js:134`）得到 **0 个文件**；对照实验——localeDir 指向有效 json 时 `no-missing-keys` 会告警，用仓库配置则一条不报，证明整套 locale 规则失效（不止 `no-unused-keys`）。用插件自带 glob@13.0.6 以各包 cwd 跑该 pattern 得 0 文件，`./src/locale/*/*.ts` 在 cad-viewer 为 16 个。CLAUDE.md 声称「vue-i18n 禁止动态 key 和未使用 key」——动态 key 那一半确实在报错（见 C.5.1），未使用 key 那一半在 CI 中并不生效，废弃文案会持续累积。
- **验证修正（修复方向）**：插件 3.2.0 的 `no-unused-keys` 只对 JSON/YAML 资源或 `<i18n>` 块生效（`dist/rules/no-unused-keys.js:384-418`），本仓 locale 为 `.ts`，**仅改 glob 仍不生效**，须改资源格式或换工具。
- **建议修复**：把 pattern 改成与实际结构一致（如 `./src/locale/*/*.ts`），并补一条冒烟测试（保留一个只定义未使用的 key，断言 lint 报错）防止再次静默失效。

### C.5.3 changeset fixed 组与 lockstep 约定不符

- **问题**：`.changeset/config.json:5-19` 的 `fixed` 组只有 11 个包，缺 `@hy/cad-search-plugin`(1.6.1)、`common`(1.13.0)、`data-model`(1.13.0)、`geometry-engine`(3.13.0)、`graphic-interface`(3.13.0)。这 5 个都不是 private，会被 `ci.yml:149` 的 `pnpm -r publish` 发布。
- **证据**：CLAUDE.md 要求「packages/* 采用 lockstep 发布（所有包最终统一到同一版本）」；只要它们不同属一个 fixed 组，`pnpm changeset version` 只能得到 1.6.1→1.7.0 与 3.13.0→3.14.0 等多条版本线——正是 CLAUDE.md 自己记录的版本线不一致的成因。另：config.json `:21` 的 `"access": "restricted"` 与 CI 的 `--access public` 相互矛盾（实际发布走 pnpm，影响小）；更强的证据是现存 `.changeset/legacy-shell-removal.md` 只列 3 个包且 bump 混用（major/minor），与 SKILL.md「覆盖全部包、同一 bump」冲突，lockstep 事实上未达成。
- **建议修复**：把这 5 个包并入同一个 fixed 组（需先把 version 对齐到统一版本线），并把 `access` 改为 `public`；或明确放弃 lockstep 并同步修改 CLAUDE.md 的约定。

### C.5.4 release.mjs 缺失版本一致性校验

- **问题**：通读 `tools/release.mjs` 全文 114 行，只有 tag 存在性检查（:79-83）、分支=main（:85-92）、`pnpm sync:versions:check`（:94-99）、工作区干净（:101-104），随后 `:109-112` 直接 `git tag -a ${tag}` + `git push origin ${tag}`；**全程从不读取 `packages/*/version`，也不调用 `pnpm changeset version`**。
- **证据与影响**：`pnpm release 1.7.0` 会在所有包仍是 1.6.1 时创建并推送 v1.7.0；随后 CI 的 release job 执行 `pnpm publish:viewer`。验证者补充：`pnpm -r publish` 对已存在版本通常**跳过并 exit 0**，因此比原文描述更隐蔽——tag/GitHub Release 已生成但什么都没发布，而此时 tag 已 push，无法回滚。
- **建议修复**：打 tag 前读取所有 workspace 包的 version 与目标版本比对，不一致直接 fail 并提示先跑 `pnpm changeset version`；或由脚本直接执行 changeset version 后校验工作区干净再继续。

### C.5.5 jest 的 lodash 映射不可复现

- **问题**：`jest.config.ts:13-27` 扫描 `node_modules/.pnpm` 并返回**首个**含 `node_modules/lodash` 的条目，作为 `moduleNameMapper` 中 `'^lodash-es$'` 的目标。readdir 顺序依赖文件系统（APFS/ext4 不同），本地与 CI 可能挑到不同版本，出现「本机过、CI 挂」的不可复现差异。
- **证据与验证修正**：store 中 lodash@4.17.23 与 4.18.1 确实并存；但**「实测命中 4.17.23」不成立**——实测首个命中是 `@intlify+eslint-plugin-vue-i18n@3.2.0` 条目，其 `node_modules/lodash` 软链到 **lodash@4.18.1**；lock 显示 antd、vue-eslint-parser 等依赖 4.18.1，4.17.23 是 optional。即当前把 `lodash-es` 4.17.21（`pnpm-workspace.yaml:14` pin 的版本）映射成了 4.18.1。问题仅影响单测可复现性、无已证实的行为差异，故 P2→P3。
- **建议修复**：不要扫描 `.pnpm`；在根 devDependencies 显式声明与 lodash-es 同版本的 `lodash`，再映射为 `require.resolve('lodash')`；或从 `pnpm-lock.yaml` 精确解析 4.17.21 的 store 路径并断言版本。

### C.5.6 bootstrap.mjs 的构建完成判据过弱

- **问题**：`bootstrap.mjs:78` 只要 `packages/cad-viewer-example/dist` 存在就跳过 `pnpm build`，即便 `data-model/lib`、`three-renderer/lib` 等上游产物缺失或过期（例如单独跑过 `pnpm --filter @hy/data-model clean`，或新加了包）。
- **证据**：第 3 步校验只检查 3 个硬编码文件（`:90-94`），失败时仅 `process.exit(1)` 而**不会补跑构建**（与 CLAUDE.md「缺失时重新 pnpm build」的描述不符）；`--fast` 模式下 `:87` 整段校验被跳过，使用者会拿到残缺环境。可复现：删除 `packages/data-model/lib` 后运行，步骤 2 被跳过、步骤 3 报缺失退出，须人工 `cd cad-viewer && pnpm build` 恢复。nx 有构建缓存，真正重跑 `pnpm build` 成本很低，跳过几乎无收益，故 P2→P3。
- **建议修复**：改为遍历 workspace 包逐一校验产物（或直接无条件执行 `pnpm build`，依赖 nx cache 兜底），并把 expectedFiles 由包清单生成而不是硬编码 3 个路径。

### C.5.7 process_dxf.py 可原地覆盖源图纸

- **问题**：`cad-tools/process_dxf.py:1239-1248` 的 `main()` 从不校验 `out_dir` 与 `src_dir` 不同；`process_file` 在 `:1211` 用 `out = out_dir / src.name`、`:1213` `doc.saveas()` 落盘。脚本对文档做破坏性清理（删图层/删实体/打散）。
- **证据**：用户把 `--out` 写成源目录（如 `--src cad/dxf --out cad/dxf`）就会用处理结果**原地覆盖原始图纸**，无备份、无确认；若同时带 `--skip-processed`，则因同名文件已存在而 0 个文件被处理，`:1247-1251` 过滤后打印「未找到 DXF 文件」返回 1，用户几乎无法察觉。
- **收窄**：`cad-tools/process_dxf.md:624` 已写明「输出目录建议与源目录分离，避免覆盖」，且默认值 `--src cad/dxf` 与 `--out cad/dxf/processed` 不同，需用户显式误写才触发，故 P2→P3。
- **建议修复**：启动时 `if src_dir.resolve() == out_dir.resolve(): 报错退出`（并拒绝 `out_dir` 位于 `src_dir` 之下的情形），或显式提供 `--allow-in-place` 开关。

---

## C.6 测试缺口与文档一致性

| 编号 | 问题 | 位置 | 严重度 | 验证结论 |
| --- | --- | --- | --- | --- |
| C.6.1 | 高风险模块零单测且无覆盖率门槛，CI 不做覆盖率采集 | cad-viewer/.github/workflows/ci.yml:56-57 | P3 | confirmed（P3 维持；351 个 spec 的实测清单已核对） |
| C.6.2 | docs 索引与实际内容不一致：漏列圆弧 LOD 文档、仍称 realdwg-web 联合开发 | docs/README.md:30 | P3 | confirmed（P3 维持；同类过期表述另有 2 处文件） |
| C.6.3 | cad-svg-plugin README 的 peer 依赖清单与实际配置/运行时不符 | cad-viewer/packages/cad-svg-plugin/README.md:27-31 | P3 | confirmed（P3 维持；纯文档缺陷） |

### C.6.1 高风险模块零单测、无覆盖率门槛

- **问题**：`ci.yml:56-57` 只跑 `pnpm test`，`jest.config.ts` 无 `collectCoverage`/`coverageThreshold`，CI 也不产出覆盖率报告，因此覆盖缺口不会被任何门禁发现。
- **证据**（实测清单）：`jest --listTests` 收到 **351 个** spec（另 11 个 e2e 被 `jest.config.ts:52-55` 的 `testPathIgnorePatterns` 排除），但以下高风险路径完全没有测试——`cad-search-plugin/src/logic/textSearch.ts`（227 行，每次输入/搜索都全量遍历文本实体；该包 src 恰 17 个文件、0 spec）、`cad-simple-viewer-cli/src/runHeadless.ts`（414 行，整包 0 spec）、`cad-pdf-plugin` / `cad-invertsel-plugin` / `cad-layerctx-plugin`（各 0 spec）。e2e（`packages/cad-viewer-example/e2e/tests` 共 11 个 spec）也没有大图纸打开、HTML/PDF/SVG 导出与 CLI 回传路径。
- **建议修复**：补齐 textSearch/locate、CLI 参数解析与 runHeadless、PDF/SVG 导出的单测；在 `jest.config.ts` 打开 `collectCoverage` 并设置可达成下限的 `coverageThreshold`；CI 上传覆盖率产物。

### C.6.2 docs 索引与实际内容不一致

- **问题**：`docs/README.md:30` 称「五份文档构成完整生命周期」，索引表（`docs/README.md:32-38`）只有 5 行，漏掉 `docs/02-性能优化/圆弧LOD与渲染数据采集实施计划.md`（该目录实有 6 个 .md）；`:3` 仍写「本目录按主题分类存放 `bw-cad-view` 工作区（`cad-viewer` + `realdwg-web` 联合开发）的全部项目文档」，而所有包已合并进 cad-viewer 单一 monorepo，仓库内 find 不到任何 realdwg 目录（git 88aa3fa 已合并）。
- **影响**：读者按索引找不到圆弧 LOD 方案文档，这正是 P1/C.1.1 类几何缺陷最需要参照的设计资料。
- **建议修复**：在 02 表格补上 `圆弧LOD与渲染数据采集实施计划.md` 一行、「五份文档」改为六份；把 `:3` 的 realdwg-web 表述改为单一 monorepo（`cad-viewer/packages/*`）。同类过期表述还散见于 `docs/01-架构设计/架构图.md:3,15,33` 与 `docs/01-架构设计/高性能技术分析.md:3,7`，可一并处理。

### C.6.3 cad-svg-plugin README 的 peer 依赖与产物名不准

- **问题**：`README.md:27-31` 的 peer 依赖只列 `@hy/cad-simple-viewer`、`@hy/data-model`、`@mlightcad/mtext-parser`，漏了 `@mlightcad/mtext-renderer`；`:35` 还称产物为 `dist/index.js` / `dist/register.js`。
- **证据**：`package.json:51-56` 声明了 peerDependency `@mlightcad/mtext-renderer@^0.12.4`，且 `AcSvgShapeUtil.ts:8-13` 在运行时从 `'@mlightcad/mtext-renderer'` 导入 `FontManager`/`ShxParserFont`（SHAPE 实体导出路径；`AcSvgMTextUtil.ts:19` 另用 mtext-parser，已列）。实际产物为 `cad-svg-plugin.js` / `cad-svg-plugin-register.js`（`package.json:30/35` 与磁盘 `dist/` 一致）。
- **影响**：按文档安装的宿主（`.pnpmrc` 开启 `strict-peer-dependencies=true`）会在执行 `csvg` 时缺包失败。
- **建议修复**：README 补齐 `@mlightcad/mtext-renderer` 并修正产物文件名（或让其与 `pluginRollupOutput` 的 `createLibEntryFileName` 生成规则一致）。

---

## C.7 对抗验证结果统计与误报清单

### C.7.1 全量统计

| 指标 | 数值 |
| --- | --- |
| 参与复核的领域 JSON | 14 |
| finding 总数 | 109 |
| `verdict=confirmed` | 104（95.4%） |
| `verdict=refuted` | 5（4.6%） |
| `correctedSeverity=drop` | 5（与 refuted 完全重合） |
| 严重度下调（非 drop） | 34 |
| 严重度上调 | 1（vue-app#4，P3→P2，属 memory 域、不在本章） |
| 本章范围 finding（confirmed 且 category 属本章） | 56（P1 7 / P2 15 / P3 34） |
| 本章范围内被 refuted 的 finding | 4 |
| 本章范围内严重度下调 | 17 |

结论：评审员的**事实性错误率很低**（5/109 被推翻），但**严重度普遍偏高**——本章 56 条中有 17 条被验证者下调（约 30%），其中 3 条由 P1 降为 P2。制定修复计划时应以 `correctedSeverity` 为准，并注意「触发条件收窄」：多条 finding 只在退化输入、损坏数据或非默认配置下成立。

### C.7.2 误报清单（verdict=refuted / correctedSeverity=drop，**不应进入修复计划**）

| 标题 | 位置 | 被推翻的原因 |
| --- | --- | --- |
| `AcApBlockPreviewConvertor` 用静态标志位守护「按文档实例」的事件管理器，`AcApDocManager` 重建后缓存清理监听失效 | cad-viewer/packages/cad-simple-viewer/src/command/convert/AcApBlockPreviewConvertor.ts:40-46 | 代码事实成立，但危害已在别处被处理：唯一调用方 `cad-viewer/src/composable/useInsertableBlocks.ts:120-121` 在每次 `refreshBlocks` 开头就调 `AcApBlockPreviewConvertor.clearCache()`，`:158/:163` 又用 `currentBlockTableDocId` 校验，`:61` 仅在面板打开时刷新，因此不会命中上一会话缩略图；旧 `events` 也无强引用、可被 GC。无可复现影响 |
| 头部未声明/未识别 `$DWGCODEPAGE` 时静默按 UTF-8 解码：旧代码页（GBK 等）整图乱码 | cad-viewer/packages/data-model/src/base/AcDbDxfPairReader.ts:1026-1057 | HEAD 证据属实（判定 + 嗅探、全文件无 `console.*`），但版本门（:1031-1035）使 2007+ 图纸（AC1032 → `supportsUtf8CodePage=true`）一律强制 utf-8，故「95MB 目标图头部探测失败即乱码」不成立。更关键：该分支已被**有意移除**——当前 `.ts` 已重写为 UTF-8-only（832 行，`acdbCreateDxfPairReader` 恒返回 UTF-8 reader），`misc/AcDbCodePage.ts` 编码表已删除，CLAUDE.md 明示「仅支持 UTF-8」，属设计取舍 |
| `acdbPeekDxfHeaderInfo` 在未识别 HEADER 段时全文解码：95MB 逐块 `TextDecoder`+split | cad-viewer/packages/data-model/src/base/AcDbDxfPairReader.ts:59-101 | HEAD 证据属实（:68 while 无上限、:74 split、:79 大小写敏感且只留 1 行 leftover；文档《渲染与解析性能瓶颈分析.md:80》「只扫前几 KB」与实现不符），但该函数在当前工作区**已被整体删除**（现 832 行无该函数，`base/index.ts` 与 `src/index.ts` 也已去掉导出）——「已被处理」 |
| 二进制 DXF 分支完全忽略 `$DWGCODEPAGE`，字符串恒按 UTF-8 解码/编码 | cad-viewer/packages/data-model/src/base/AcDbDxfPairReader.ts:997-1019 | HEAD 证据属实（二进制分支只取 `options.encoding` 缺省 utf-8；写侧 `AcDbDxfFiler.ts:778/842` 恒 `new TextEncoder()`），但工作区重写把 `acdbMakeBinaryDxfPairReader` 改成硬编码 UTF-8（现 :626-632、:796），JSDoc 明示「与 `AcDbDxfFiler` 的二进制写侧一致」，编码表与 UTF-8 嗅探一并删除，属**显式的「二进制恒 UTF-8」设计取舍**，仓内二进制读写自成 UTF-8 往返 |
| `src/` 下遗留未跟踪的重写草稿 `AcDbDxfPairReader.new`（重复表 + 未使用常量） | cad-viewer/packages/data-model/src/base/AcDbDxfPairReader.new:1-56 | 复核 `find . -name '*.new'` 与 `git ls-files --others` 均无该文件，**当前不存在**（git 历史也从未出现过），按「已被处理」判 refuted。旁证：当前 `.ts` 第 5/14-15/17/40 行的常量/接口与 finding 描述的草稿内容同形（偏移约 3 行），推测草稿已被采纳/删除 |

补充说明（供修复计划参考）：

1. 上述后 4 条中有 3 条**在评审时的 HEAD 上事实成立**，只是因为工作区那份**未提交的 `AcDbDxfPairReader.ts` 重写**（1062 → 832 行）使代码不复存在或语义改变。若该重写被回退，dm-parser#2 应按**原 P3（而非原文的 P2）**重新立案，另外两条按原级重新立案。同时提示：这份 800+ 行未提交改动本身应尽快提交或回退，不要长期悬挂。
2. 误报的共同特征是「代码事实正确、但危害路径已被别处覆盖」或「代码已按设计取舍移除」。评审员给出的行号与代码引用均准确，问题出在**影响面推断**上——这正是对抗验证环节的价值所在。

### C.7.3 本章严重度下调与触发条件收窄汇总（17 条）

| 编号 | finding | 原→修正 | 收窄要点（来自验证者 note） |
| --- | --- | --- | --- |
| C.1.5 | dm-entity#1 LWPOLYLINE 210 | P1→P2 | 夹具 21 条 LWPOLYLINE 的 210 全为 (0,0,1)，无实际样本 |
| C.1.6 | tr-batch#1 单簇 Uint16 索引 | P1→P2 | 实测复现，但仅 `lineSegments` 入口落入（多段线走 Uint32 路径） |
| C.1.7 | geo#2 CircArc2d.length | P2→P3 | 消费点仅 `AcGeLoop2d`/`AcGePolyline2d` 长度，「OFFSET/标注」未证实 |
| C.1.8 | geo#3 零扫掠判整圆 | P2→P3 | 仅退化输入命中，与 C.1.1 同根因 |
| C.1.9 | geo#6 Math.random 采样 | P2→P3 | `containsBox` 前置后常规 hatch 输出稳定 |
| C.1.10 | dm-entity#4 3DSOLID Uint16 | P2→P3 | 门槛高（球面采样约 236 顶点/球），夹具无 3DSOLID |
| C.2.3 | plugins-heavy#1 SVG image | P1→P2 | 影响面仅限含 IMAGE/OLE2FRAME 的图纸 |
| C.2.5 | dm-database#4 代理图形 DataView | P2→P3 | 仅截断/损坏的 310 流触发，异常按实体捕获 |
| C.2.8 | plugins-light#3 Polygon 内环 | P2→P3 | `jsonData/tunnel.json` 38 个要素全为 LineString，0 个 Polygon |
| C.3.4 | csv-view#2 布局转换失败吞计数 | P2→P3 | 需「布局未被流式装载且实体数 >约 12 万」，大图纸模型空间走不到 |
| C.3.5 | csv-editor#5 `push(...cached)` | P2→P3 | 本机实测约 12.6 万起才抛，需单实体 ≥约 12.5 万 grip 点 |
| C.3.6 | csv-cmd#3 CLI readFile | P2→P3 | 触发需请求目录路径或 existsSync/readFile 竞态 |
| C.3.7 | csv-cmd#2 OPENPROF 轮询 | P2→P3 | 仅影响诊断功能，`getLastSnapshot` 全仓无调用者 |
| C.4.2 | dm-database#2 removeEntity break | P2→P3 | break 使 B×N 次 Set 构造基本不成立；跨 owner 漏删需调用方自行拼 id |
| C.5.5 | tooling#4 jest lodash | P2→P3 | 仅影响单测可复现性；且实测命中 4.18.1 而非原文的 4.17.23 |
| C.5.6 | tooling#5 bootstrap 代理信号 | P2→P3 | 开发脚本健壮性，有明确 workaround |
| C.5.7 | tooling#7 process_dxf.py 原地覆盖 | P2→P3 | 默认 src/out 不同，`process_dxf.md:624` 已提示分离，需用户显式误写 |

另需注意本章一条 `confidence=low` 的 finding：**C.2.9**（MultiPoint 不生成名称标注）——验证者确认代码事实可直接判定（`geojsonToEntities.ts:611-623` 分支确实未调 `queueLabel`，而 MultiLineString/MultiPolygon/GeometryCollection 都会排标签），但与 `docs/05-使用手册` 的声明不一致属低危文档/行为偏差。

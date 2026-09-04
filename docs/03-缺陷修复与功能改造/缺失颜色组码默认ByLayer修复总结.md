# 实体缺失颜色组码渲染为 CECOLOR 修复总结

- 日期：2026-09-04
- 涉及仓库：`cad-viewer`（data-model）
- 关联文档：`../06-工具脚本/process_dxf处理逻辑分析.md`（预处理脚本产物即本次问题图纸）
- 目标图纸：`F:\gis\bw-cad-view\cad\dxf\processed\千树塔井上下对照图（2025.04）.dxf`（118MB，AC1024/ANSI_936，模型空间 457,917 实体）

## 1. 结论

打开该图纸后大量线条渲染成青色，根因是：**DXF 实体省略颜色组码 62 时，数据层错误地用 `$CECOLOR`（本图 = 4，青色）兜底，而 DXF 规范的默认值是 ByLayer（256）**。该图纸约 89% 的模型空间实体省略 62，全部中招。

修复后：文件加载路径缺失 62 一律按 ByLayer 解析（随图层色），API 编程新建实体仍保留 CECOLOR 种子语义（对齐 AutoCAD `AcDbEntity::setDatabaseDefaults`），两者互不干扰。

## 2. 问题现象与数据摸底

对目标 DXF 做全量组码统计（13,231,730 行）：

- HEADER：`$CECOLOR = 62 → 4`（青色）。
- 模型空间（ENTITIES）实体 457,917 个，其中**仅 49,778 个带 62 组码，约 40.8 万（89%）省略**——预处理工具 `process_dxf.py`（ezdxf 写出）对 ByLayer 实体不输出 62。
- 另有 44,607 个模型空间实体显式 `62=0`（ByBlock，块打散产物）。

按 DXF 规范（ezdxf / ACadSharp 等实现一致），实体省略 62 的默认值为 256（ByLayer）；`$CECOLOR` 只是编辑器交互新建实体时的当前颜色种子，不应用于文件加载。

## 3. 根因定位

颜色数据链路：`DXF 62/420 → AcDbEntity._color → resolvedColor（ByLayer 查图层表）→ traits → three-renderer 材质`。

根因在两处"懒初始化 + 追加实体时兜底"逻辑（`packages/data-model/src/entity/AcDbEntity.ts`）：

1. `getEntityColor()`（:399）：`_color == null` 时复制 `database.cecolor`；
2. `resolveEffectiveProperties()`（:585，由 `AcDbBlockTableRecord.appendEntity` :426 在每次加载追加时调用）：同样用 `database.cecolor` 兜底。

于是所有省略 62 的实体在加载时就被烘焙成 CECOLOR=4（青色），图层色根本不生效。

**最小复现**（jest，`AcDbDxfFiler.fromString` + `AcDbDxfDocumentReader`）：`$CECOLOR=4`、WALLS 层（ACI 1 红）上一条无 62 的 LINE，修复前 `color=4`（青），期望 ByLayer→红。

## 4. 修复

共 2 个文件（+27/-8）：

| 文件 | 改动 |
| --- | --- |
| `packages/data-model/src/entity/AcDbEntity.ts` | 新增 `@internal applyDxfFileDefaults()`：`_color == null` 时设为 ByLayer（`new AcCmColor()` 默认即 ByLayer） |
| `packages/data-model/src/dxf/AcDbDxfEntityFactory.ts` | `acdbDxfInEntity()` 在 `dxfIn` 之后统一调用 `applyDxfFileDefaults()`；普通实体与 POLYLINE / DIMENSION 组装器两条路径全覆盖（模型空间与块定义均经此入口） |

设计要点：

- **只在 DXF 加载路径生效**：工厂函数在 `dxfIn` 后立即调用，先于 `appendEntity → resolveEffectiveProperties`，后者看到 `_color` 已非空便不再用 CECOLOR 覆盖；
- **API 新建实体语义不变**：`resolveEffectiveProperties` 保留 CECOLOR 种子行为（对齐 AutoCAD `setDatabaseDefaults`）；
- **HATCH 顺带修正**：`AcDbHatch.color` 原会在无显式色时回退 HPCOLOR→CECOLOR；文件加载的 HATCH 现在 `_color=ByLayer`，与 DXF 语义一致（HPCOLOR 仅是新建填充的 UI 默认值）。

## 5. 验证

新增回归测试 `packages/data-model/__tests__/AcDbDxfEntityColorDefault.spec.ts`（3 例）：

- 缺失 62 → ByLayer，且解析到所在图层色（WALLS=ACI 1）；
- 显式 62=30 保持不变；
- 编程新建实体 append 后仍从 CECOLOR 取色（语义不被破坏）。

| 项 | 结果 |
| --- | --- |
| data-model 全套件 | 115 套件 / 877 用例全部通过，无回归 |
| 真实图纸端到端（118MB 全量加载，统计模型空间 `resolvedColor` 分布） | 修复后按图层正确分色：ACI 43（DGX 等高线层）288,366、ACI 7（前景色）78,668、ACI 25（计曲线层）70,032；解析为青色（ACI 4）的从约 40.8 万降至 9,301，且全部来自本就该是青色的图层（DLSS/COMPONENT/WJS/保护煤柱）或显式 62=4（852 个），均为正确颜色 |

## 6. 遗留与说明

1. **ByBlock 块打散实体（44,607 个，`62=0`）**：无 INSERT 宿主时按 AutoCAD 规则显示前景色（黑/白），本库行为与 AutoCAD 一致，未改动。若希望块打散后保留原 INSERT 颜色，需在 `cad-tools/process_dxf.py` 打散时把 ByBlock 解析成 INSERT 颜色再写出。
2. **图层/线型的同类兜底**（`layer` 缺省用 `clayer`、`lineType` 缺省用 `celtype`）与 CECOLOR 是同一模式；DXF 规范默认值实为图层 "0" / ByLayer。本图 CLAYER 未造成可见问题，暂未改动，后续如有同类投诉可一并按 DXF 默认值修正。
3. 重新加载图纸即可生效；若运行环境缓存了转换结果需先清理缓存。

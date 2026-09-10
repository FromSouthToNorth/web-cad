# @hy/cad-tunnel-plugin

「绘制巷道」规划插件：**不解析任何 DWG/DXF 文件**，直接从 GeoJSON 数据（HTTP 请求返回，例如 axios/fetch）绘制自定义对象——点、线（巷道中心线 `TunnelRoadway`）、面（闭合多段线 + SOLID 填充）、文字标注。

- 命令：`drawtunnel`（别名 `tunnel`）、`tunnelclear`
- Ribbon：自动注入「实用工具」分组的 **读取巷道**、**巷道设置** 按钮（Home → Utilities）
- 设置面板：巷道线宽、名称大小（0 = 自动）、名称碰撞避让，控件变化即防抖自动应用（合并为一次可撤销事务）
- 名称标注：默认按数据范围自动定高，并做**碰撞避让**（重叠名称自动隐藏，长者优先）
- 巷道属性：选中巷道实体后，属性面板展示「巷道信息」分组（巷道名称 / 巷道类型 / 煤层），随 DXF 往返
- 特殊巷道符号：`tunnelType` 为 1/2/9/15 的要素绘制为**立井巷道**（双圆 + 直径线符号，
  属性面板展示「立井信息」：巷道 id / 名称 / 井底、井口坐标）；`tunnelType` 为 3 的要素绘制为
  **煤仓**符号（双圆 + 直径线 + 4 条竖向刻度线）。`tunnelType` 支持数字或数字字符串
- 数据：支持标准 GeoJSON `FeatureCollection` 及业务接口包装格式
  `{ data: { params: { data: <FeatureCollection> } } }`（示例数据见
  `cad-viewer-example/public/geojson/tunnel.json`）
- 语言：zh / en / tr / cs

## 快速开始

```bash
cd cad-viewer
pnpm --filter @hy/cad-tunnel-plugin build
```

应用侧注册（参考 `cad-viewer-example/src/App.vue`）：

```typescript
import { registerTunnelPlugin } from '@hy/cad-tunnel-plugin/register'

void registerTunnelPlugin(AcApDocManager.instance.pluginManager, {
  url: `${import.meta.env.BASE_URL}geojson/tunnel.json`
})
```

点击 Ribbon「读取巷道」按钮（或在命令行输入 `drawtunnel`）即从配置的 URL 拉取数据并绘制；
「巷道设置」按钮打开设置面板；`tunnelclear` 清除插件绘制的全部对象。

## GeoJSON → 实体映射

| GeoJSON | 实体 | 图层（默认） |
| --- | --- | --- |
| `Point` / `MultiPoint` | `AcDbPoint` | 巷道点 |
| `LineString`（含 `tunnelType`/`tunnelName`/`coalbed` 属性） | `TunnelRoadway`（中心线 + 宽度 + 巷道属性） | 巷道线 |
| 其他 `LineString` / `MultiLineString` | `AcDbPolyline` | 巷道线 |
| `Polygon` / `MultiPolygon` | 闭合 `AcDbPolyline` + `AcDbHatch`(SOLID) | 巷道面 |
| `Point` / `LineString` 且 `tunnelType` ∈ {1, 2, 9, 15} | `ShaftRoadway`（立井符号：双圆 + 直径线） | 巷道点 |
| `Point` / `LineString` 且 `tunnelType` = 3 | `CoalBunker`（煤仓符号：立井 + 4 条竖向刻度线） | 巷道点 |
| 属性 `tunnelName`（可配置字段）非空 | `AcDbText` 居中标注（碰撞避让） | 巷道文字 |

- 颜色取 `properties.color`（CSS hex）；Z（高程）默认归零（2D 矿图语义，避免相机深度裁剪），
  可选 `elevationMode: 'relative'` 保留相对高差。
- `TunnelRoadway` 是插件自定义实体（`AcDbRoadway` 子类），`tunnelName/tunnelType/coalbed`
  以 XDATA（应用名 `TUNNEL`）随 DXF 往返，加载插件后即可读回。
- `ShaftRoadway`（DXF 记录 `SHAFTCIRCLE`）/ `CoalBunker`（`COALBUNKER`）同为插件自定义实体：
  立井取线两端 Z 较高者为井口、较低者为井底（点要素则井口 = 井底）；符号半径与外圈宽度由
  `shaftRadius`（默认 15）/ `shaftOuter`（默认 5）选项控制，`id`/`name` 以 XDATA
  （应用名 `SHAFT`/`BUNKER`）随 DXF 往返。
- 详细使用说明见 [docs/05-使用手册/绘制巷道插件使用说明.md](../../../docs/05-使用手册/绘制巷道插件使用说明.md)；
  插件架构设计见 [docs/绘制巷道插件设计.md](docs/绘制巷道插件设计.md)。

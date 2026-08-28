# CAD 命令行操作命令说明

> 本文档汇总 bw-cad-view 项目中 CAD 命令行（命令窗口）可用的全部操作命令及其详细说明。
> 整理时间：2026-08-27。

## 一、命令系统概览

所有命令注册在 `AcEdCommandStack` 命令栈中，来源有三处：

1. **内置命令**：`cad-simple-viewer` 的 `AcApDocManager.registerCommands()`（`cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:1224`），约 80 个绘制/编辑/图层/测量/批注命令，全部挂在 `ACAD` 命令组下。
2. **系统变量命令**：`AcDbSysVarManager` 中登记的 55 个系统变量（如 `CLAYER`、`LTSCALE`）也各注册为一个命令，可在命令行直接输入变量名查询/设置。
3. **面板类命令**：`cad-viewer` 的 `register.ts` 补充注册 18 个 UI 面板/对话框命令；各插件（PDF/SVG/HTML/搜索/反选/图层右键/AI）注册 10 余个插件命令。

命令特性：

- 大小写不敏感；
- 支持别名（如 `L` → `LINE`）；
- 可通过命令行输入、`sendStringToExecute()` API 或 AutoCAD 风格 `.scr` 脚本（`runScript`，脚本中 `QUIT`/`EXIT` 终止）执行；
- 写入类命令要求文档为可写模式。

---

## 二、文件与视图操作

| 命令 | 别名 | 说明 |
|---|---|---|
| `open` | `op` | 打开图纸（内置文件选择对话框） |
| `qnew` | | 使用内置模板新建空白图纸 |
| `regen` | `re` | 重绘图纸 |
| `pan` | `p` | 平移视图 |
| `zoom` | `z` | 缩放以显示所有对象 |
| `switchbg` | | 切换绘图区背景颜色（白/黑之间） |
| `quit` / `exit` | | 退出（仅在示例应用 `App.vue` 注册） |
| `about` | | 显示 mlightcad 产品信息 |
| `cachefont` | | 将本地字体文件缓存到 IndexedDB 供文字渲染 |
| `log` | | 在控制台输出调试信息 |
| `openprof` | | 系统变量：控制是否在控制台记录文件打开阶段耗时分析 |
| `openperf` | `openprofile`, `openprofui` | 打开"打开性能"面板，显示最近一次打开图纸的关键耗时 |
| `md` | | 打开丢失字体/缺失数据处理面板 |
| `mem` | `memstat` | 显示内存统计信息 |

## 三、文件导出/转换

| 命令 | 说明 |
|---|---|
| `cdxf` | 导出当前图纸为 DXF 格式（内置） |
| `cpdf` | 导出为 PDF（PDF 插件，懒加载） |
| `ipdf` | 从 PDF 文件导入矢量几何 |
| `csvg` | 转换当前图纸为 SVG 格式（SVG 插件） |
| `chtml` | 将图纸导出为可离线打开的 HTML 文件（`cad-viewer` 注册的是对话框版本；HTML 插件注册 `-chtml` 命令行版） |
| `-chtml` | 通过命令行选项导出 HTML 文件 |
| `pngout` | 导出为 PNG 图片 |
| `entout` | 导出所选对象的合并预览图（提示"选择对象"） |

## 四、绘图命令

| 命令 | 别名 | 说明 |
|---|---|---|
| `line` | `l` | 在指定点之间绘制直线段 |
| `arc` | `a` | 创建圆弧 |
| `circle` | `c` | 使用圆心和半径创建圆 |
| `ellipse` | `el` | 通过轴端点或中心点创建椭圆/椭圆弧 |
| `pline` | `pl` | 通过指定多个点创建多段线 |
| `polygon` | `pol` | 通过中心和半径或指定一条边创建正多边形 |
| `rectang` | `rec` | 通过两个对角点创建矩形 |
| `ray` | `ra` | 创建单向无限延伸的射线 |
| `xline` | `xl` | 创建双向无限延伸的构造线 |
| `mline` | `ml` | 创建多条平行线组成的多线对象 |
| `spline` | `spl` | 通过控制点创建平滑样条曲线 |
| `point` | `po` | 连续创建点 |
| `sketch` | | 创建一系列徒手线段 |
| `mtext` | `t` | 创建多行文本 |
| `-hatch` | `-h` | 通过命令行选项创建填充（不显示 Ribbon 界面） |
| `hatch` | | 用填充图案填充封闭区域（打开 Ribbon 填充界面，`cad-viewer` 注册） |
| `dimlinear` | `dli` | 创建线性尺寸标注 |
| `revcloud` | | 创建或修改修订云线 |
| `-insert` | `i` | 将块定义插入到当前图形（命令行模式） |
| `insert` | `blockspalette` | 打开块插入面板（`cad-viewer` 注册） |
| `imageattach` | `iat` | 将光栅图像作为外部参照附着到当前图形 |
| `xattach` | `xa` | 将 DWG/DXF 图形作为外部参照附着 |

## 五、修改命令

| 命令 | 别名 | 说明 |
|---|---|---|
| `erase` | `e` | 删除所选对象（提示"选择对象"） |
| `copy` | `co` | 克隆所选图元到新位置 |
| `move` | `m` | 通过位移向量移动所选图元 |
| `rotate` | `ro` | 绕基点旋转所选图元 |
| `offset` | `o` | 按指定距离创建平行曲线、多段线或圆 |
| `undo` | `u` | 撤销上一次数据库编辑操作 |
| `redo` | | 重做上一次撤销的操作 |
| `hideobjects` | | 临时隐藏所选对象的显示 |
| `unisolateobjects` | | 重新显示 HIDEOBJECTS 隐藏的所有对象 |

## 六、选择命令

| 命令 | 说明 |
|---|---|
| `select` | `se`，选择图元 |
| `qselect` | 打开快速选择对话框（按属性过滤选择，`cad-viewer` 注册） |
| `invertsel` | 反选当前图元（`cad-invertsel-plugin` 插件，快捷键 Ctrl/Cmd+Shift+I） |

## 七、图层命令

| 命令 | 别名 | 说明 |
|---|---|---|
| `-layer` | `-la` | 通过命令行选项管理图层 |
| `layer` | `la` | 打开图层属性管理器（`cad-viewer`/UI 插件注册） |
| `laycur` | | 将所选对象的图层改为当前图层 |
| `laydel` | | 删除图层及该图层上的所有对象 |
| `layfrz` | | 冻结所选对象所在的图层 |
| `layiso` | | 隔离所选对象所在的图层 |
| `laylck` | | 锁定所选对象所在的图层 |
| `layon` | | 打开图纸中的所有图层 |
| `layoff` | | 关闭所选对象所在的图层 |
| `laythw` | | 解冻图纸中的所有冻结图层 |
| `layulk` | | 解锁所选对象所在的图层 |
| `layuniso` | | 恢复由 LAYISO 隐藏或锁定的图层 |
| `layerp` | | 撤销对图层设置的最后一次更改 |
| `layerclose` | | 关闭图层属性管理器 |
| `layctxdel` | | 删除当前选中的实体（`cad-layerctx-plugin` 插件，图层管理器右键菜单配套命令） |
| `layctxscale` | | 缩放当前选中的实体：指定基点后输入比例或拖动 |
| `layctxdsel` | | 取消当前选择集 |

## 八、测量命令

| 命令 | 别名 | 说明 |
|---|---|---|
| `measuredistance` | `di`, `dist` | 测量两点间距离及坐标增量 |
| `measurearea` | `aa`, `area` | 计算所选对象或点定义区域的面积和周长 |
| `measureangle` | `ang` | 测量两条线或三个点之间的夹角 |
| `measurearc` | | 测量圆弧段的弧长 |
| `measurepoint` | | 测量拾取点的 X/Y 坐标 |
| `clearmeasurements` | | 清除当前布局上的所有测量标注 |
| `measurementvis` | | 显示/隐藏当前布局上的测量标注 |
| `measurementexport` | | 将测量标注导出为 sidecar JSON 文件 |
| `measurementimport` | | 从 sidecar JSON 文件导入测量标注 |

## 九、批注（Markup）命令

| 命令 | 说明 |
|---|---|
| `markuptext` | 放置文字批注 |
| `markupline` | 创建直线批注 |
| `markuparrow` | 创建箭头批注 |
| `markupcloud` | 创建修订云线批注 |
| `markuprect` | 创建矩形批注 |
| `markupcircle` | 创建圆形批注 |
| `markuphighlight` | 创建高亮矩形批注 |
| `markupcallout` | 创建标注：指定引线尖端 → 放置文字框 → 输入文字 |
| `markupstamp` | 放置图章或自定义符号 |
| `markupvis` | 显示/隐藏批注 |
| `clearmarkups` | 清除当前布局上的所有批注 |
| `markupexport` | 将批注导出为 sidecar JSON 文件 |
| `markupimport` | 从 sidecar JSON 文件导入批注 |
| `markuppanel` | 打开批注面板 |

## 十、其他面板/对话框命令（`cad-viewer` 层注册）

| 命令 | 别名 | 说明 |
|---|---|---|
| `properties` | | 打开特性面板 |
| `xref` | | 打开外部参照管理器 |
| `pttype` | | 打开点样式设置对话框 |
| `units` | | 打开图形单位设置对话框 |
| `style` | `st` | 打开文字样式管理器 |
| `countlist` | | 打开图元计数列表面板 |
| `attedit` | `eattedit`, `ate` | 编辑块属性 |
| `attdef` | `ddattdef` | 定义块属性 |
| `search` | `find` | 打开/切换内容搜索面板，搜索图纸中文字（TEXT/MTEXT/属性/引线/标注，`cad-search-plugin`） |
| `agent` | | 打开 AI 助手面板（`cad-agent-plugin`，可选依赖） |

## 十一、系统变量命令（55 个，可在命令行直接输入）

这些系统变量全部注册为命令（`AcApDocManager.registerCommands()` 中遍历 `AcDbSysVarManager` 注册），输入变量名可查询/修改当前值：

- **单位与格式**：`lunits`（坐标/距离显示格式）、`luprec`（线性精度）、`unitmode`（建筑/分数格式显示）、`aunits`（角度格式）、`auprec`（角度精度）、`angbase`（0 度基准角）、`angdir`（正角度方向）、`insunits`（插入图形单位）、`measurement`（英制/公制）
- **当前实体属性**：`cecolor`（默认颜色）、`celtype`（线型）、`celweight`（线宽）、`cetransparency`（透明度）、`celtscale`（线型比例）、`clayer`（当前图层）
- **线型/线宽显示**：`ltscale`（全局线型比例）、`lwdisplay`（是否显示线宽）
- **填充默认值**：`hpname`、`hpang`、`hpscale`、`hpcolor`、`hpbackgroundcolor`、`hpassoc`、`hpdouble`、`hpislanddetection`、`hplayer`、`hpseparate`、`hptransparency`
- **捕捉/追踪/动态输入**：`osmode`（对象捕捉位码）、`orthomode`（正交）、`polarang`、`polaraddang`、`polarmode`（极轴追踪）、`dynmode`、`dynprompt`（动态输入）
- **夹点**：`grips`（显示开关）、`gripcolor`、`griphot`、`gripsize`、`gripobjlimit`
- **选择**：`pickbox`（拾取框大小）、`shortcutmenu`（右键快捷菜单）
- **样式名称**：`textstyle`、`dimstyle`、`cmlstyle`、`cmlscale`、`cmleaderstyle`
- **外观**：`colortheme`（UI 深/浅主题）、`modelbkcolor`（模型空间背景色）、`paperbkcolor`（图纸空间背景色）、`measurementcolor`（测量标注颜色）
- **点样式**：`pdmode`、`pdsize`
- **只读信息**：`acadver`（图形版本）、`dwgname`（当前文件名）、`loginname`（登录名）、`extmin` / `extmax`（模型空间图形范围）

## 十二、命令别名表（内置默认）

`AcApDocManager` 中的 `DEFAULT_COMMAND_ALIASES`（`AcApDocManager.ts:154`）定义了 32 个 AutoCAD 风格默认别名：

`A`=ARC、`C`=CIRCLE、`EL`=ELLIPSE、`E`=ERASE、`DLI`=DIMLINEAR、`DI/DIST`=MEASUREDISTANCE、`AA/AREA`=MEASUREAREA、`ANG`=MEASUREANGLE、`-H`=-HATCH、`IAT`=IMAGEATTACH、`I`=-INSERT、`XA`=XATTACH、`LA`=LAYER、`-LA`=-LAYER、`L`=LINE、`ML`=MLINE、`T`=MTEXT、`M`=MOVE、`O`=OFFSET、`CO`=COPY、`RO`=ROTATE、`OP`=OPEN、`P`=PAN、`PO`=POINT、`POL`=POLYGON、`PL`=PLINE、`RA`=RAY、`REC`=RECTANG、`RE`=REGEN、`SE`=SELECT、`SPL`=SPLINE、`XL`=XLINE、`Z`=ZOOM、`U`=UNDO、`REDO`=REDO。

别名可被 `AcApDocManager.createInstance({ commandAliases })` 的宿主配置整体覆盖，且查找时大小写不敏感。

## 十三、核心源码位置

| 内容 | 位置 |
|---|---|
| 内置命令注册 | `cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:1224` |
| 命令实现 | `cad-simple-viewer/src/command/{draw,modify,layer,measure,markup,convert}` |
| 面板命令注册 | `cad-viewer/packages/cad-viewer/src/app/register.ts:49` |
| 命令说明 i18n | `cad-simple-viewer/src/i18n/zh/command.ts` |
| 系统变量定义 | `cad-viewer/packages/data-model/src/database/AcDbSystemVariables.ts` |

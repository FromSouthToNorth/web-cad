# 文字（MTEXT）绘制审计 · 代码事实包

> 只读侦察产物，供后续审计单元使用。路径相对仓库根 `D:\myDome\CAD\web-cad`。
> 标「未验证」者为本轮未取得代码依据。本文件不下缺陷结论，只给事实与线索。

## 0. 范围与口径

- **审计对象**：工具栏「文字」→ 编辑 → 入库 → 渲染全链路（§1）。
- **不重复**：渲染性能（字形缓存/worker/内存）既有结论，见 `docs/02-性能优化/优化计划.md:216-240`、`docs/02-性能优化/渲染与解析性能瓶颈分析.md:118`。
- **例外**：仅当性能取舍直接导致绘制结果不准时记录；本轮暂无此类线索。

## 1. 完整调用链

### 1.1 工具栏点击 → 命令名

按钮 `cad-viewer/packages/cad-viewer-example/src/shell/ribbon/ribbonModel.ts:218`：`btn('mtext','mtext',iconMtext,'MText','large','MT')`，id=`mtext`；面板 `annotationPanel` 在 `:214`，panels 在 `:342`。
本地化 key = `shell.ribbon.button.${id}`（`.../ribbon/AntdRibbonPanel.vue:161-165`）；中文值 `.../src/locale/zh.ts:92`(button) `:114` → `mtext: '文字'`。
点击派发：`.../ribbon/AntdRibbon.vue:390` → `:515-516` `run()` → `commandQueue.enqueue(command)`；`.../ribbon/commandQueue.ts:79-86` 未阻塞则立即 `hooks.execute(command)`；`.../ribbon/AntdRibbon.vue:491-493` → `AcApDocManager.instance.sendStringToExecute(command)`。

### 1.2 命令查找 → `trigger`（含 undo mark 事务边界）

| 步骤 | 位置 | 事实 |
| --- | --- | --- |
| 入口 + 解析 | `cad-viewer/packages/cad-simple-viewer/src/app/AcApDocManager.ts:1509-1515`、`:1529-1539` | `sendStringToExecute`（fire-and-forget，错误弹提示）；首行=命令名，余行入 script 输入队列（`:1536-1537`） |
| 查找 | `.../app/AcApDocManager.ts:1581-1592` | `lookupGlobalCmd` → `lookupLocalCmd(name, openMode)` → 失败则 `pluginManager.loadByTrigger` 后重查 |
| 校验 + 互斥 + 触发 | `.../app/AcApDocManager.ts:1599-1603`、`:1609`、`:1611` | `documentMode < cmd.mode` 报错（mtext 为 `Write`）；`await this._commandManager.cancelActive()`；`cmd.trigger(this.context)` |
| **undo mark** | `.../editor/command/AcEdCommand.ts:234-270` | `:240-244` `startUndoMark(name)` + `startTransaction()`；`:249` `await execute(context)`；`:259-266` 正常 `commitTransaction()` + `endUndoMark()` + `session-db-edit-committed` + `acapNotifyUndoStackChanged()`；`:250-257` 异常 `abortTransaction()` + `cancelUndoMark()` |
| 判定 + 注册 | `.../editor/command/AcEdCommand.ts:275-283`；`.../app/AcApDocManager.ts:1355` | `recordsUndoStack !== false && doc.openMode >= Review && cmd.mode >= Review`；`addSystemCommand('mtext','mtext', new AcApMTextCmd())`，无别名 |

> 事实（非结论）：框选与编辑器交互（可长时间挂起）全部发生在 undo mark / transaction 打开期间（`AcEdCommand.ts:240-249` × `AcApMTextCmd.ts:32-55`）。

### 1.3 框选 → 编辑器 open

| 步骤 | 位置 | 事实 |
| --- | --- | --- |
| 取框 + 取消 | `.../command/draw/AcApMTextCmd.ts:30-33` | `editor.getBox(boxPrompt)`，`useBasePoint=false`、`useDashedLine=false`；`status !== OK \|\| !value` 直接 return（不建实体、不弹错） |
| getBox 实现 | `.../editor/input/ui/AcEdInputManager.ts:1548-1613` | 两次 `getPoint`；`:1607` `new AcGeBox2d().expandByPoint(p1).expandByPoint(p2)`（**已归一化**的 WCS 轴对齐框） |
| 宽 + 字高 + 插入点 | `.../AcApMTextCmd.ts:36,38,39,71-75` | `width = max(\|max.x-min.x\|, 1e-4)`（世界单位）；`textHeight = pixelsToWorldY(view,24)` = `screenToWorld(0,0)`/`(0,24)` 的 Δy，下限 `1e-4`；`location = { x: box.min.x, y: box.max.y, z: 0 }`（框左上角） |
| 字体项 + open + 实例 | `.../AcApMTextCmd.ts:40-54`、`:18` | `avaiableFonts`（getter `.../app/AcApDocManager.ts:857-858`）去重去空；`mtextEditor.open({view, location, width, textHeight, toolbarFontFamilies})`；命令对象持有实例级 `AcEdMTextEditor`（跨多次执行复用） |
| open 实现 + 字高归一 | `.../editor/input/ui/AcEdMTextEditor.ts:388,400,432` | `new THREE.Vector3(location.x, location.y, location.z ?? 0)`；`normalizedTextHeight = Math.max(1, textHeight)`（下限 **1**，与源侧 1e-4 不一致） |
| 文本样式 + 建输入框 | `.../AcEdMTextEditor.ts:428-440`、`:451-484` | `textStyleTable.getAt(database.textstyle)`，覆写 `fixedTextHeight`/`lastHeight`，取不到传 `textStyle: undefined`；`new MTextInputBox({ scene: view.internalScene, camera: view.internalCamera, width, position, textStyle, ... })` |
| 关闭回填 + 默认行距 | `.../AcEdMTextEditor.ts:530-548`、`:155`、`:541-543` | `contents=getText()`、`location=getMTextInsertionPoint()`、`width`（入参原样）、`height=normalizedTextHeight`、`lineSpacingFactor`、`attachmentPoint`；`static readonly defaultLineSpacingFactor = 0.3` 作回退 |

### 1.4 入库 → 渲染对象

| 步骤 | 位置 | 事实 |
| --- | --- | --- |
| 空内容 + 建实体 + 入库 | `.../command/draw/AcApMTextCmd.ts:57-68` | `contents.trim()` 为空则 return（无提示）；只赋 `location/contents/width/height/lineSpacingFactor/attachmentPoint`；`blockTable.modelSpace.appendEntity(mtext)` |
| 世界绘制 | `.../data-model/src/entity/AcDbMText.ts:786-798` | 组 `AcGiMTextData{text,height,width,position,rotation,directionVector,attachmentPoint,drawingDirection,lineSpaceFactor}`；样式由 `getTextStyle()`（`:768-775`，按 `styleName` 解析，失败**抛错**） |
| 渲染器入口 + 显示对象 + 平面化 | `.../three-renderer/src/renderer/AcTrRenderer.ts:646-658`；`.../object/AcTrMText.ts:15-39,51-62` | `new AcTrMText(mtext, traits, style, context, delay)`；继承 `AcTrGlyphEntity`（`.../object/AcTrGlyphEntity.ts:38`），构造期不绘制；`position.z` 强制置 0 |
| 绘制 + 渲染器单例 + 初始化 | `.../object/AcTrMText.ts:74-91` → `.../object/AcTrGlyphEntity.ts:141-146`(sync) `:161-166`(async)；`.../renderer/AcTrMTextRenderer.ts:99,238,180,335`；`.../app/AcApDocManager.ts:2029-2033,238` | 调 `syncRenderMText`/`asyncRenderMText`；`AcTrMTextRenderer` 单例包装 `UnifiedRenderer`；`initialize(workerUrl ?? DEFAULT_WEBWORKER_FILE_URLS.mtextRender)`、`void setDefaultFonts('modern')`、`DEFAULT_FONTS_PRESET='modern'` |

## 2. 数据契约：`AcDbMText`

`cad-viewer/packages/data-model/src/entity/AcDbMText.ts`。**单位统一为图纸世界单位（WCS/OCS），代码中无单位枚举。**

| 属性 | 默认值 | 语义 | 依据 |
| --- | --- | --- | --- |
| `location` `AcGePoint3d` | (0,0,0) | WCS 插入点 | `:86,138,352-357` |
| `contents` `string` | `''` | MTEXT 源码串（内联格式码、`\P` 段落符） | `:67,126,158-174` |
| `height` `number` | `0` | **字高（字符高度）**，非文本框高 | `:61-62,127,187-203`（`:42` 示例 `=2.5`） |
| `width` `number` | `0` | **换行参考宽度**：「maximum width for word wrap」，超宽单词不折断 | `:63-64,128,206-236` |
| `extentsWidth` `number` | `0` | 源文件实测渲染宽度，优先于 `width` 参与 `geometricExtents` | `:65-66,129,238-250,457-481` |
| `rotation` `number` | `0` | **弧度**，相对 OCS X 轴，逆时针为正 | `:81-82,136,252-271` |
| `attachmentPoint` | `TopLeft`(1) | DXF 71，枚举 1–12 | `:88,139,359-370`；枚举 `.../graphic-interface/src/AcGiTextStyle.ts:22-38` |
| `lineSpacingFactor` | `1.0` | DXF 44，相对单倍行距（`5/3` 字高）的比值，典型 0.25–4.0 | `:71-72,130,273-284` |
| `lineSpacingStyle` | `0` | DXF 73 | `:69-70,131,286-294` |
| `styleName` `string` | `''` | 文字样式表记录名（DXF 7） | `:83-84,137,339-347` |
| `direction` `AcGeVector3d` | (1,0,0) | 文字 X 轴（DXF 11/21/31） | `:89-90,140,372-381` |
| `normal` `AcGeVector3d` | (0,0,1) | DXF 210 | `:93-94,390-396` |
| `drawingDirection` | `LEFT_TO_RIGHT`(1) | DXF 72 | `:91-92,141,383-388` |

### 2.1 DXF 组码映射（出 `dxfOutFields` / 入 `dxfInFields`）

| 组码 | 字段（出/入行号） | 组码 | 字段（出/入行号） |
| --- | --- | --- | --- |
| 10/20/30 | location（出 `:814`；入 `:874-882`） | 71 | attachmentPoint（`:827`；`:932-934`） |
| 40 | height（`:815`；`:902-904`） | 72 | drawingDirection（`:828`；`:935-937`） |
| 41 | width（`:816`；`:905-907`） | 73 | lineSpacingStyle（`:829`；`:938-940`） |
| 42 | extentsWidth，>0 才写（`:817-819`；`:908-910`） | 44 | lineSpacingFactor（`:830`；`:914-916`） |
| 43 | 垂直字高，注释「AutoCAD 未使用」，跳过（入 `:911-913`） | 1 / 3 | contents，>250 字符分块，末段入组 1（出 `:823`；入 `:895-898`） |
| 7 | styleName（`:824`；`:899-901`） | 50 | rotation，**度↔弧度**（`:825`；`:929-931`） |
| 11/21/31 | direction（`:826`；`:883-894`） | 210/220/230 | normal（`:848`；`:969-977`） |
| 90/63/441/45 | backgroundFill/color/transparency/scale（`:831-836`；`:953-961`） | 46 | annotationHeight（`:837-839`；`:920-922`） |
| 75/76/78/79/48/49 | 分栏（`:840-847`；`:941-952`） | 101 | 嵌入对象：丢弃其后所有 pair（入 `:962-968`）；未知码静默忽略（`:995-997`） |

### 2.2 「height 是字高、width 是换行宽度」的依据

| 依据 | 位置 | 原文 |
| --- | --- | --- |
| data-model | `.../data-model/src/entity/AcDbMText.ts:61` / `:63` | `/** The height of the text */` / `/** The maximum width for word wrap formatting */` |
| data-model 文档 | `.../AcDbMText.ts:206-212` | 「maximum width setting used by the MText object for word wrap formatting」 |
| 渲染器契约 | `.../mtext-renderer/lib/renderer/types.d.ts:159-162` | height：「height of the text characters in drawing units」；width：「Text will wrap if it exceeds this width」 |
| 传递 | `.../AcDbMText.ts:787-797` | `height→MTextData.height`、`width→width`、`lineSpacingFactor→lineSpaceFactor` |
| 属性面板命名 | `.../AcDbMText.ts:647-657` / `:680-690` | `height` 暴露为 `textHeight`；`width` 暴露为 `definedWidth` |
| **反向事实** | `.../cad-simple-viewer/src/editor/input/ui/AcEdMTextEditor.ts:101-102` vs `:432,540` | 结果字段 `height` 注释为「Final **text box** height in world units」，实际取值是 `normalizedTextHeight`（= 入参字高）→ **同字段在编辑器标注为「文本框高」、在实体语义为「字高」** |

## 3. 绑定 API：`@mlightcad/mtext-renderer@0.12.4`

`<lib>` = `cad-viewer/node_modules/.pnpm/@mlightcad+mtext-renderer@0.12.4_three@0.172.0/node_modules/@mlightcad/mtext-renderer/lib/`。以下为 `.d.ts` 抄录。

```ts
// <lib>/renderer/mtext.d.ts
declare class MText extends THREE.Object3D {
  constructor(text: MTextData, style: TextStyle, styleManager: StyleManager,
              fontManager: FontManager, colorSettings?: ColorSettings)   // :66
  static getFonts(mtext: string, removeExtension?: boolean): Set<string>  // :57
  get fontManager(): FontManager   // :71      get styleManager(): StyleManager // :96
  get textStyle(): TextStyle       // :101
  get box(): THREE.Box3; set box(b) // :107-108  不含变换矩阵的局部包围盒
  dispose(): void                  // :76
  asyncDraw(o?: MTextDrawOptions): Promise<void> // :86  awaitFonts?: boolean (:8-19)
  syncDraw(): void                 // :91  假定字体已加载，缺字体用默认字体
  createLayoutData(): MTextLayout  // :110 按需构建，可能内部缓存
  raycast(raycaster, intersects): void // :117
  loadShape(shapeData, style): THREE.Object3D | undefined  // :128
}
// loadMText / finalizePlacement / createMTextGroup / measureAnchorMetrics /
// calculateAnchorPoint / updateBoxFromObject 均为 private (:124-223)。
// MText 无公开 fastDeepClone；AcTrMText.fastDeepClone 是本仓库自实现（.../object/AcTrMText.ts:106-119）。
```

```ts
// <lib>/renderer/types.d.ts
interface MTextLayout { lines: LineLayout[]; chars: CharBox[] }          // :113-118
interface LineLayout { y: number; height: number; breakIndex?: number }  // :94-109
//   y=行中心Y(游标/命中)；height=行高；breakIndex=可视换行索引，i 表示在 char i-1 与 i
//   之间换行；最后一行 undefined；重复索引=空行
interface CharBox { type: CharBoxType; box: THREE.Box3; char: string; children: CharBox[] } // :81-90（box 为本地 MText 坐标）
enum CharBoxType { CHAR = "CHAR", STACK = "STACK" }   // :122-127
//   CHAR: char=渲染字符, box 有定义, children 空；STACK: char='', box=分量并集, children=分量
const STACK_DIVIDER_CHAR = "\uE000"                   // :131
enum MTextFlowDirection { LEFT_TO_RIGHT=1, RIGHT_TO_LEFT=2, TOP_TO_BOTTOM=3, BOTTOM_TO_TOP=4, BY_STYLE=5 } // :26-37
enum MTextAttachmentPoint { // :48-73；注释(:38-47)：1-9 对应 DXF 71，10-12 为 TEXT/ATTRIB 基线扩展
  TopLeft=1, TopCenter=2, TopRight=3, MiddleLeft=4, MiddleCenter=5, MiddleRight=6,
  BottomLeft=7, BottomCenter=8, BottomRight=9, BaselineLeft=10, BaselineCenter=11, BaselineRight=12 }
interface MTextData {   // :156-183
  text: string; height: number; width: number; position: Point3d
  rotation?: number      // 弧度，默认 0            directionVector?: Point3d
  attachmentPoint?: MTextAttachmentPoint           drawingDirection?: MTextFlowDirection
  lineSpaceFactor?: number  // DXF 44，默认 1.0      widthFactor?: number  // 默认 1.0
  collectCharBoxes?: boolean  // 默认 true
}
interface ColorSettings { byLayerColor: number; byBlockColor: number; layer?: string; color: MTextColor } // :136-147
const createDefaultColorSettings: () => ColorSettings   // :151
interface TextStyle {  // :208-229
  name: string; standardFlag: number; fixedTextHeight: number
  widthFactor: number; obliqueAngle: number; textGenerationFlag: number
  lastHeight: number; font: string; bigFont: string; extendedFont?: string
}
```

| 类/接口 | 位置 | 关键事实 |
| --- | --- | --- |
| `StyleManager` | `<lib>/renderer/styleManager.d.ts:6-20` | **是 `interface`，无构造/单例**：`unsupportedTextStyles`、`getMeshBasicMaterial(ColorSettings)`、`getLineBasicMaterial(ColorSettings)` |
| `DefaultStyleManager` | `<lib>/renderer/defaultStyleManager.d.ts:8-23` | `class ... implements StyleManager`，另有 `getMaterialStats()`、`protected buildKey()` |
| 本仓库实现 | `.../three-renderer/src/renderer/AcTrMTextRenderer.ts:25-51` | `class AcTrMTextStyleManager implements StyleManager`，材质走 `AcTrStyleManager` |
| `FontManager` | `<lib>/font/fontManager.d.ts:33-362` | `private constructor()` `:97`；`static get instance()` `:102`；`get/set baseUrl` `:106-107`；`cacheFont(data: ArrayBuffer\|File, fileName?, aliases?, encoding?)` `:210`；`loadFontsByNames` `:182`；`findAndReplaceFont` `:230`；`getFontByName` `:238`；`release` `:348`。开关/状态：`lazyFontLoading`、`awaitFontsBeforeDraw`、`defaultFonts`、`symbolFonts`（`:57,66,71,77`），事件 `fontNotFound`/`fontLoaded`（`:79-84`） |

```ts
// <lib>/worker/unifiedRenderer.d.ts
constructor(defaultMode?: RenderMode, workerConfig?: WebWorkerRendererConfig)  // :29；RenderMode='main'|'worker' (:7)
asyncRenderMText(c: MTextData, s: TextStyle, color?: ColorSettings, mode?: RenderMode): Promise<MTextObject>  // :62
syncRenderMText(c: MTextData, s: TextStyle, color?: ColorSettings): MTextObject  // :68 始终主线程
asyncRenderShape / syncRenderShape   // :69-70        setStyleManager(v): void  // :42
setFontUrl(v: string): Promise<void> // :52           setDefaultFonts(f): Promise<void> // :74
setLazyFontLoading / setAwaitFontsBeforeDraw // :79 / :84
loadFonts(fonts): Promise<{loaded: string[]}>                  // :96
getAvailableFonts(): Promise<{fonts: Array<{name: string[]}>}> // :102
cacheFont(data, fileName?, aliases?, encoding?)               // :125
terminateWorkers(): void / destroy(): void                    // :133 / :137
// MTextObject 契约（<lib>/worker/baseRenderer.d.ts:8-20）：
//   interface MTextObject extends THREE.Object3D { box: THREE.Box3; createLayoutData(): MTextLayout }
```

## 4. 现有测试与基建清单

| 测试文件 | 验证了什么 | **没有**验证什么（尤其「文字绘制结果准确性」） |
| --- | --- | --- |
| `.../cad-simple-viewer/__tests__/AcApMTextCmd.spec.ts:60-119` | 1 条：open 入参（`location={10,80,0}`、`width=100`、`textHeight=12`，`:103-109`）、`appendEntity` 1 次（`:110`）、实体字段透传（`:112-118`） | 全量 mock：`../src/app`(`:4-13`)、`../src/editor`(`:15-46`)、`../src/i18n`、`../src/view`。未验证真实 getBox/编辑器/几何；未验证 `styleName`/`layer`/`rotation`；`textHeight` 由 mock 的 `screenToWorld` 造出（`:70`，24px→12 世界单位）；未断言 `attachmentPoint`/`lineSpacingFactor` |
| `.../cad-simple-viewer/__tests__/AcEdMTextEditor.spec.ts:179-258` | 2 条：`:187` 禁用内置工具栏时隐藏宿主保活；`:223` 格式变更监听通知 | `@mlightcad/mtext-input-box` 以 `virtual:true` 全量 mock（`:68-74`）、`mtext-renderer` mock（`:76-79`）、`@hy/data-model` mock（`:81-102`）、`app`/`view` mock。**未验证 `open()` 返回的 height/width/location/lineSpacingFactor/attachmentPoint**，未验证 `normalizedTextHeight` 语义 |
| `.../three-renderer/__tests__/AcTrMText.spec.ts:52-232` | wcsBbox（`:53-110`）、raycast 命中/回退（`:112-161`）、批/非批层级（`:163-219`）、`fastDeepClone` 保型（`:220`） | mock `../src/renderer`（`:4`）。**未真实调用 mtext-renderer**；不验证字形位置/尺寸/朝向/字面对错 |
| `.../three-renderer/__tests__/AcTrMTextRenderer.spec.ts:28-140` | UnifiedRenderer 生命周期：延迟/即时 fontUrl、main/worker 模式、重建销毁、默认字体预设转发 | mock `@mlightcad/mtext-renderer`（`:21`）。**不产生任何几何** |
| `.../three-renderer/__tests__/AcTrMTextGlyphCache.spec.ts:73-215` | 缓存键（排除 position、区分内容/样式/颜色）、LRU 与字节预算逐出、克隆重定位、几何隔离、Box3 原型恢复 | 纯数据结构；不验证渲染像素/字形正确性 |
| `.../three-renderer/__tests__/AcTrMTextRendererGlyphCache.spec.ts:84-230` | 二次命中晋升、sync 走同缓存、独有内容不缓存、开关旁路、字体加载失效、并发合并 | mock mtext-renderer（`:27`）。不验证字形内容 |
| `.../three-renderer/__tests__/AcTrMTextAci7WorkerReconstruct.spec.ts:21-110` + `AcTrMTextColorUtil.spec.ts:14-490` | 颜色/材质重绑定：worker 重建后 ACI-7/ACI-255 前景反转；16 条 ByLayer/ByBlock/ACI7/ACI255、图层色变更、stashed mtextColor | 颜色材质；不验证几何 |
| 其他含 MText 的 three-renderer 测试：`AcTrBatchedBounds.spec.ts:301,340`（MTEXT 放置根克隆/小坐标合批）、`AcTrBatchedGroupLayerText.spec.ts:24-138`、`AcTrBatchedGroupLayerStyle.spec.ts`、`AcTrBatchedGroupUnbatchedOps.spec.ts`、`AcTrFontLoader.spec.ts:39-44`、`AcTrShape.spec.ts` | 批容器内文字放置、材质重绑定、字体 URL 通知 | 均为放置/材质/生命周期；不验证字形本身 |
| `.../data-model/__tests__/AcDbMText.spec.ts:25-400` | 17 条：属性读写、`geometricExtents`（含行距、extentsWidth 优先）、osnap/grip、`transformBy`、DXF 出入（250 字符分块、组 42） | `geometricExtents` 用**估算函数** `acdbEstimateMTextHeight`/`acdbEstimatePlainTextWidth`（`AcDbMText.ts:457-481`），非真实字形度量 |
| `.../cad-svg-plugin/__tests__/AcSvgMText.spec.ts:51-360` | **20 条**：段落 tspan、特殊字符、字高/内联字高、按 width 换行（含 CJK）、9 点 attachment 锚定、rotation、竖排、颜色、SHX→CSS 字体映射、上下划线、分数/上标堆叠 | 测的是 **SVG 插件路径**（`../src/AcSvgMTextUtil`，`:10-14`），与 three-renderer/mtext-renderer 主链无关；不验证 canvas 像素 |
| `.../cad-viewer-example/e2e/tests/main-thread-mtext.spec.ts:57-142` | 3 条：main 模式不建 mtext worker（`:71`）、worker 模式建 worker（`:88`）、worker 脚本无错 + 画布非空像素 >20（`:141`） | 用 `minimal-line.dxf`（`:8-13`，**无 MTEXT 实体**）。**完全未验证文字绘制结果**：不检查中文/字形、位置与尺寸 |

| 像素脚本 | 能力 | 局限 |
| --- | --- | --- |
| `.../cad-viewer-example/bench/analyze-png.cjs:1-111` | Playwright chromium 解码 `out/*.png`：`nonBgPct`/`coloredPct`/`meanLuma`（`:26-44`）+ 两两 diff（`:47-60`） | 仅全局像素占比/差异率；**无文本定位、无字形比对、无基线图集** |
| `.../cad-viewer-example/bench/png-view.cjs:1-121` | Node zlib 解码 8-bit RGB/RGBA PNG，打印降采样 ASCII 亮度图 + 通道统计 | 仅支持「是否有东西被画出来」的人工肉眼确认 |

## 5. 测试基建事实

| 项 | 事实 | 依据 |
| --- | --- | --- |
| 环境 | `testEnvironment: 'node'`（`cad-viewer/jest.config.ts:32`）→ **无 jsdom / canvas / WebGL**，无 jsdom 依赖；DOM 由各 spec 自建 fake element 模拟（`AcEdMTextEditor.spec.ts:129-144`） | `jest.config.ts:32` |
| 模块映射 | `three` → CJS `packages/three-renderer/node_modules/three/build/three.cjs`（`:58`）；`three/examples/jsm` 的 LineMaterial / LineSegments2 / LineSegmentsGeometry / CSS2DRenderer / BufferGeometryUtils / OrbitControls → `test/mocks/three/*`（`:59-70`）；`lodash-es` → pnpm store 内 CJS `lodash`（`findStorePackage` `:13-27`，映射 `:57`） | `jest.config.ts:13-27,57-70` |
| 过滤 | `transformIgnorePatterns: ['/node_modules/(?!.*(mtext-parser\|rbush\|quickselect))']`（`:49-51`）；`testPathIgnorePatterns: ['/e2e/','/__tests__/helpers/']`（`:52-55`） | 同左 |
| **mtext-renderer 未全局 mock** | 无 `moduleNameMapper` 级 mock（`:56-71`）；仅 4 个 spec 文件内 `jest.mock`：`AcEdMTextEditor.spec.ts:76`、`AcTrMTextRenderer.spec.ts:21`、`AcTrMTextRendererGlyphCache.spec.ts:27`、`AcTrFontLoader.spec.ts:3` | `jest.config.ts:56-71` |
| ts-jest | `tsconfig.jest.json`：ES2020 / commonjs / `noUnusedLocals,noUnusedParameters:false` | `cad-viewer/tsconfig.jest.json:3-11` |
| `@mlightcad/mtext-input-box` 在 node | 包**已安装**（`cad-viewer/packages/cad-simple-viewer/node_modules/@mlightcad/mtext-input-box`，`^0.2.23`）；编辑器 spec 仍用 `{ virtual: true }`。其构造需 scene/camera/DOM（`dist/viewer/viewer.d.ts:92,129-132`）→ **node 下无法真实实例化** | 未验证其能否在无 DOM 下仅 import |

## 6. 字体加载事实

| 项 | 事实 | 依据 |
| --- | --- | --- |
| baseUrl | 默认 `DEFAULT_BASE_URL = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data'`（`.../app/AcApDocManager.ts:140`）；`this._baseUrl = options.baseUrl ?? DEFAULT_BASE_URL`（`:463`）；`resolveFontsBaseUrl()` → `${base}/fonts/`（补尾斜杠，`:1185-1190`）；注入 `_fontLoader.baseUrl` 与 `FontManager.instance.baseUrl`（`:515-518`） | 同左 |
| 示例应用 | `AntdCadViewer.vue:196` `baseUrl: undefined` → `useAntdCadShell.ts:277` 透传 → **实际走 jsDelivr CDN** | `.../cad-viewer-example/src/shell/AntdCadViewer.vue:186-218`、`.../shell/useAntdCadShell.ts:38,277` |
| 本地资产与注册 | `cad-viewer/assets/hztxt.shx` 与 `.../cad-viewer-example/public/fonts/hztxt.shx` 均为 1 171 621 B，`public/fonts/` 下**仅此一个文件**；`onViewerCreate` 中 `fetch('./fonts/hztxt.shx')` → `arrayBuffer()` → `FontManager.instance.cacheFont(fontData,'hztxt.shx')` → `setDefaultFonts(['hztxt'])` | 文件系统枚举；`.../cad-viewer-example/src/App.vue:172-186` |
| `AcApFontUtil.cacheFont` | `static async cacheFont(data: ArrayBuffer\|File, fileName?: string, aliases?: string[], encoding?: string): Promise<FontLoadStatus>`，转调 `FontManager.instance.cacheFont`；命令入口 `cachefont` → `AcApCacheFontCmd.cacheFontFile`（注册 `.../app/AcApDocManager.ts:1298`） | `.../cad-simple-viewer/src/util/AcApFontUtil.ts:149-156`；`.../command/AcApCacheFontCmd.ts:40-48,89` |
| 默认链 | `DEFAULT_FONTS_PRESET='modern'`，注释称 text=`hztxt → simsun`、symbol=`amgdt`；`FontManager.instance.setDefaultFonts('modern')`（`:473`）与 `mtextRenderer.setDefaultFonts('modern')`（`:2033`） | `.../app/AcApDocManager.ts:238,473,880-881,2033` |
| 离线可渲染性（推断，**未实测**） | 示例把 hztxt 本地缓存并设为唯一默认字体 → 默认链中文字形可离线渲染；其他字体名（`simsun`、图纸 style 引用的 ttf/otf）仍会请求 CDN，离线预期 404 后落 `defaultFonts`(hztxt) | 同上；`FontManager.getAvailableFonts` 文档：「throws if font metadata cannot be loaded from the CDN」(`<lib>/font/fontManager.d.ts:164-166`) |
| CI/E2E 网络 | Playwright `baseURL` 指向本地 dev/preview server（`.../playwright.config.ts:19,25`），CI 用系统 Chrome（`:36`）。仓库内**未发现**字体网络屏蔽或离线开关；E2E fixture 全为纯线框 DXF（`.../e2e/fixtures/`，无 MTEXT） | `.../playwright.config.ts:19-36`；fixture 目录枚举 |

## 7. 已确认的疑似缺陷线索（只列线索 + 行号，不下结论）

| # | 线索 | 位置 |
| --- | --- | --- |
| L1 | 编辑器返回的 `height` 来自 `normalizedTextHeight`（= 入参字高），命令直接赋给 `mtext.height`（字高）；该字段在编辑器侧注释为「text box height」 | `.../command/draw/AcApMTextCmd.ts:62-66`；`.../editor/input/ui/AcEdMTextEditor.ts:540`、`:432`、`:101-102` |
| L2 | `textHeight = pixelsToWorldY(view,24)`：把「屏幕 24 像素」当世界字高（随缩放变化；视图无效时量级不可控） | `.../AcApMTextCmd.ts:38`、`:71-75` |
| L3 | 字高下限不一致：命令侧 `1e-4` vs 编辑器侧 `Math.max(1, ...)` | `.../AcApMTextCmd.ts:74`；`.../AcEdMTextEditor.ts:432` |
| L4 | `location = { x: box.min.x, y: box.max.y }`：取轴对齐框左上角，与拖框方向解耦（`AcGeBox2d` 已归一化） | `.../AcApMTextCmd.ts:39`；`.../editor/input/ui/AcEdInputManager.ts:1607` |
| L5 | `appendEntity` 前**未设置** `styleName`、`layer`、`rotation`、`direction`、`drawingDirection` → 取构造默认（`styleName=''`、`rotation=0`）。`layer` 默认惰性解析为 `database.clayer ?? '0'`。`:57-58` 空内容 return 无用户提示 | `.../AcApMTextCmd.ts:57-68`；默认值 `.../data-model/src/entity/AcDbMText.ts:126-141`；layer 默认 `.../data-model/src/entity/AcDbEntity.ts:186-190` |
| L6 | `pixelsToWorldY` 在命令与视图**逐字重复实现**；复开编辑器时 `AcTrView2d.resolveMTextEditorTextHeight` 用 `mtext.height` 作字高，且该编辑路径走 `acapRunDatabaseEdit`（与命令的 trigger 事务不同） | `.../AcApMTextCmd.ts:71-75`；`.../view/AcTrView2d.ts:1609-1625`、`:1560-1607`（`:1590` `acapRunDatabaseEdit`） |
| L7 | `AcApDocManager.ts` 存在 UTF-8 被按 GBK 解读的乱码注释（`鈥?`）。**确认范围：仅 4 处** —— `881`（`hztxt 鈫?simsun`）与 `1745`、`1756`、`1762`（同一段 view framing 注释内，均为 `//` 行） | `.../app/AcApDocManager.ts:881,1745,1756,1762` |
| L8 | 命令持实例级 `AcEdMTextEditor`，而编辑器用静态 `activeInputBox` 管理活动框；重复触发/并发未被现有测试覆盖 | `.../AcApMTextCmd.ts:18`；`.../AcEdMTextEditor.ts:157,486,509-511` |
| L9 | 编辑器返回的 `width` 是入参原样回传（「框选宽度」）；用户若在编辑器内改变实际宽度，实体 `width`（DXF 41）仍为初始框宽 | `.../AcEdMTextEditor.ts:539` |
| L10 | `AcDbMText.geometricExtents` 用估算（`acdbEstimatePlainTextWidth`/`acdbEstimateMTextHeight`）而非真实字形度量，选择框/缩放范围可能与实际绘制不符 | `.../data-model/src/entity/AcDbMText.ts:457-481` |

## 8. 与性能优化的边界

- 不重复已有结论：MTEXT 内容级字形缓存（M4-1）、worker 往返合并、字体内存占用。见 `docs/02-性能优化/优化计划.md:216-240`、`docs/02-性能优化/渲染与解析性能瓶颈分析.md:118`。
- 可能间接影响「结果准确性」的已知取舍（仅登记，不判定）：
  1. `lazyFontLoading`/`awaitFontsBeforeDraw` 默认语义：未 await 字体时**首帧用回退字形**，需在 `fontLoaded` 后重绘才能得到最终字面（`<lib>/font/fontManager.d.ts:51-66`；`<lib>/renderer/mtext.d.ts:78-91`）。文字命令路径是否触发重绘 → **未验证**。
  2. 字形缓存键**有意排除 `position`**（`docs/02-性能优化/优化计划.md:237`；`AcTrMTextGlyphCache.spec.ts:74`）。位置在根变换上，理论上不影响字形；若存在「位置参与布局」的路径则可能不准 → **未验证**。
  3. `AcTrMText.toPlanViewMTextData` 强制 `z=0`（`.../object/AcTrMText.ts:51-62`）：渲染正确性取舍，非性能。

## 9. 未验证 / 待确认

1. 真实浏览器下「框选 → 输入中文 → 提交」后实体 `height` 的世界值与用户直觉字高是否一致（L1/L2）——需 E2E 或手工量测。
2. `textStyleTable.getAt` 返回 undefined 时（`AcEdMTextEditor.ts:428-440` 传 `textStyle: undefined`）与绘制期 `AcDbMText.getTextStyle()` 抛错（`AcDbMText.ts:768-775`）之间的行为差。
3. `MTextInputBox` 是否有未公开的实测几何：`getCursorLayoutData()` 仅返回游标布局（`dist/viewer/viewer.d.ts:141-142`），高度相关方法 `computeEditorVerticalBounds`/`updateBoundingBoxGeometry` 均为 `private`（`:239,245`）→ **编辑器无法通过公开 API 取得文本框高**。
4. `mtext-renderer` 能否在 Jest/node 中真实跑通（字形解析/worker 依赖）——现有 spec 一律 mock，无证据。
5. 离线环境下 `hztxt.shx` 的字符覆盖范围（哪些汉字缺字 → `getNotFoundTextShape`），未测绘。
6. `AcTrView2d` 双击编辑已有 MText 的完整链路（`.../view/AcTrView2d.ts:1560-1607`）与新建链路是否一致，未逐行核对。

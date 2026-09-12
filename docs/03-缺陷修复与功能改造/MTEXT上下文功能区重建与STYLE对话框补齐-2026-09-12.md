# MTEXT 上下文功能区重建 + 文字样式对话框对标 AutoCAD 补齐（2026-09-12）

> 背景：`docs/03-缺陷修复与功能改造/text-audit/工具栏-注释-文字-无颜色与无字体面板-调查报告.md`
> 判定「写模式下内置 MTEXT 工具栏被挂进 `display:none` 容器，替代品上下文功能区在
> `809e4fe` 删除旧 Element Plus 壳时整体删除、从未在 Antd 壳重建」，导致**全应用不存在
> 任何字体/颜色/字高控件**（既有审计 P2-7）。本次按「对照 AutoCAD 补齐」的要求同时处理
> 两条线：STYLE 文字样式对话框的缺口，以及被删除的 MTEXT「文字编辑器」上下文功能区。

## 1. 交付范围

| 线 | 文件 | 增量 |
| --- | --- | --- |
| STYLE 对话框 | `cad-viewer/src/composable/useTextStyle.ts` | 倾斜角上下限、自定义字体候选 |
| STYLE 对话框 | `cad-viewer/src/component/dialog/MlTextStyleDlg.vue` | 倾斜角 min/max、「应用」按钮、字体名手输 |
| STYLE i18n | `cad-viewer/src/locale/{zh,en,tr,cs}/dialog.ts` | `customFont` / `apply` / `applied` / `obliqueRange` |
| MTEXT 状态桥 | `cad-viewer-example/src/shell/ribbon/mtext/useMTextRibbon.ts` | 新增 |
| MTEXT 格式面板 | `cad-viewer-example/src/shell/ribbon/mtext/AntdMTextFormatPanel.vue` | 新增 |
| MTEXT 段落面板 | `cad-viewer-example/src/shell/ribbon/mtext/AntdMTextParagraphPanel.vue` | 新增 |
| MTEXT 插入/关闭 | `cad-viewer-example/src/shell/ribbon/mtext/AntdMTextInsertPanel.vue` / `AntdMTextClosePanel.vue` | 新增 |
| MTEXT 基础库 | `.../mtext/mtextRibbonTypes.ts` / `mtextRibbonIcons.ts` | 新增 |
| 功能区接线 | `cad-viewer-example/src/shell/ribbon/ribbonModel.ts` / `AntdRibbon.vue` | 上下文标签 + 可见性/自动切换 + 面板槽位 |
| i18n / 样式 | `cad-viewer-example/src/locale/{zh,en}.ts` / `src/shell/shell.css` | 标签与面板标题、MTEXT 控件样式 |
| 测试 | `cad-viewer/__tests__/useTextStyle.spec.ts`（13 条）、`cad-viewer-example/__tests__/mtextRibbon.spec.ts`（17 条） | 新增 |

## 2. STYLE 对话框（对标 AutoCAD）

现状复核结论：对话框主体**早已完整**（字体/字体样式/使用大字体+大字体文件/高度/颠倒/
反向/垂直/宽度因子/倾斜角度/预览/新建/删除/置为当前）。本次只补三处真实缺口：

1. **倾斜角度夹取 ±85**：AutoCAD 只接受 -85..85，此前表单与写库都无任何夹取
   （`a-input-number` 无 min/max，`applyTextStyleForm` 直写）。现三处统一：
   表单控件 `:min/-85 :max/85`、读入 `readTextStyleForm` 夹取、写库 `applyTextStyleForm`
   夹取，并导出 `clampTextStyleObliqueAngle` 供复用；「应用」时若发现越界会先夹取再提示
   `dialog.textStyleDlg.obliqueRange`。
2. **「应用」按钮**：AutoCAD 的「应用」= 保存但不关闭对话框。新增按钮复用
   `saveSelectedStyle()`（本就不关闭对话框），成功后提示 `applied`。
3. **字体名可手输自定义**：AutoCAD 允许输入图纸尚未引用的字体名。`a-select` 的
   `@search` 现在把输入值作为一条带 `custom: true` 标记的候选置顶（`.shx` 判定为 SHX，
   否则按 TrueType），UI 上标注「(自定义)」，切换样式/选中字体后清空该候选。

未做（明确记录）：**「注释性(Annotative)」复选框**——`AcDbTextStyleTableRecord` 目前
没有该字段，DXF 侧的存储位置（XDATA/扩展字典）也未实现，加一个只改 UI 不改数据的勾选框
会变成假功能，故留待数据模型支持后再补。

## 3. MTEXT「文字编辑器」上下文功能区

### 3.1 结构

- `ribbonModel.ts` 新增 `contextual` 标签 `mtextEditorContext`（4 个面板：格式/段落/插入/关闭）。
  面板不携带 ribbon item：格式控件需要活的编辑器状态，因此由 `AntdRibbon.vue` 把专用组件
  渲染进每个面板的 leading slot（与既有 `layer` / `properties` 面板同一机制）。
- **激活方式改为编辑器桥驱动**（`AcEdMTextEditor.getActiveInputBox()` +
  `addActiveInputBoxChangeListener`），而不是命令事件：双击就地编辑并不会派发 MTEXT
  命令，命令事件会漏掉这条路径。`ribbonModel.contextual.commands` 仅作说明保留。
- 打开编辑器 → 自动切到该标签并记住原标签；关闭 → 恢复原标签。切换用直接赋值
  `activeTabId`（不走 `activateTab`），以免把用户刻意折叠的功能区强行展开。
- 内置 `MTextInputBox` 浮条维持既有行为（写模式下被挂进隐藏容器）。**注意**：
  `AcEdMTextEditor` 里硬编码的 `toolbar: { enabled: true, container: 隐藏容器 }` 是有意为之
  （输入框要用共享工具栏对象做内部格式同步），本次未改，符合调查报告 §1.4 的告诫。

> **审计状态**：调查报告里 P2-7「富文本级格式控件无入口」到此**已修复**，其建议的
> 「1 行最小改动（写模式保留内置浮条）」被本方案取代——现已提供对标 AutoCAD 的上下文
> 功能区，且补了浏览器级回归测试（§6.2）。P1-8（离线字体）仍按调查报告 §2 的建议，
> 由 `cad-data` 本地镜像与 worker 字体缓存那条线单独处理，不在本次范围。

### 3.2 面板内容（对照 AutoCAD）

| 面板 | 控件 |
| --- | --- |
| 格式 | 文字样式、字体（可搜索下拉）、颜色（ByLayer/ByBlock + 7 标准色）、高度（预设 + 手输）、倾斜角度（±85）、追踪、宽度因子；3×3 字符效果：粗体/斜体/删除线、下划线/上划线/上标、下标/堆叠/大小写 |
| 段落 | 对正（九宫格 9 项）、项目符号（数字/字母/项目符号）、行距（1.0/1.5/2.0/2.5/清除）、段落对齐（默认/左/中/右/对正/分散） |
| 插入 | 常用工程符号 19 项（`%%d`/`%%p`/`%%c` 与 `\U+hhhh`；后者插入前解码成真实字符） |
| 关闭 | 关闭内联编辑器（提交当前 MTEXT） |

### 3.3 依赖私有 API 的边界

`toggleScriptSelection` / `toggleStackSelection` 在 `@mlightcad/mtext-input-box` 里是
**私有**方法，也是唯一能「就地转换当前选区」的入口（与 `AcEdMTextEditor` 的 format bridge
同一处理方式）。本次用**独立结构化接口** `MTextEditorRuntime` + `as unknown as` 访问，
**不能**写成 `AcEdMTextEditorActiveInputBox & {...}`：`MTextInputBox` 含私有成员，求交会让
整个类型塌成 `never`（已由 `vue-tsc` 实测确认）。上标/下标优先走 `toggleScriptSelection`，
返回 false 时回退为「后续输入格式」。

## 4. 明确的取舍与未做项

1. **项目符号只提供 3 项**（数字/字母/项目符号）。旧实现里「关闭/起点/连续/自动/允许列表」
   是空操作（无编辑器 API 支撑），故不再摆出无效菜单项。
2. **行距不提供「更多…」**（旧实现同样是空操作）。
3. **符号菜单不含「其他…」**：它需要旧壳的 `MlCharacterMapDialog.vue`（696 行，随旧壳删除），
   本次不重建字符映射表。
4. **不做格式刷（匹配文字格式）**：按范围确认排除。
5. **STYLE 对话框未做「注释性(Annotative)」**：见 §2 末尾，需先补数据模型字段。
6. UI 细节（功能区折叠态下的上下文标签、移动端 compact 模式）只做了浏览器功能级验证，
   未做视觉走查。

## 5. 验证过程中新发现并修掉的既有缺陷

写 E2E 时 STYLE 对话框**根本打不开**，顺线查出三个与本次功能直接相关的既有缺陷，均已修复：

### 5.1 观看器重挂载后「对话框类」命令全部丢失（阻断性）

- **现象**：命令栈实测 136 条，**没有 `STYLE`**（只有自动注册的 `TEXTSTYLE` 系统变量命令）；
  上传界面打开任意图纸后，`STYLE` / `UNITS` / `QSELECT` / `ATTDEF` / `ATTEDIT` / `INSERT` /
  `PROPERTIES` / `PTTYPE` / `CHTML` 全部缺失 → 这些功能区的按钮点了没有任何反应。
- **根因**：`AcApDocManager.destroy()` 会 `_instance = undefined`（`AcApDocManager.ts:721`），
  而 Antd 壳在 `onUnmounted` 里调用它（`useAntdCadShell.ts:305`）；`registerCmds()` 却用
  **模块级布尔量** `isCommandRegistered` 守幂等（`register.ts:41`）。重新挂载时新实例的命令栈是空的，
  但布尔量仍为 `true`（模块不随实例重建）→ 注册被整体跳过。
- **修法**：幂等键从「模块级布尔量」改为「注册目标本身」——`registerCmds` 记录
  `AcEdCommandStack` 实例，`registerLazyPlugins` 记录 `AcApPluginManager` 实例，目标是新实例时重新注册。
- **同类第二处**：`registerLazyPlugins` 的 `isLazyPluginRegistered` 有同样问题，导致重挂载后
  `cpdf`/`ipdf`/`csvg`/`chtml`/`agent`/`search` 惰性触发器全部丢失（插件管理器内部
  `_lazyRegistrations`/`_triggerToPluginName` 都是**每实例**的 Map）。修法同上；同时把
  「只需一次」的 UI 接线（面板 opener、i18n 合并）与「每个管理器都要做」的注册拆开，缓存已加载的
  registrar 模块后对每个新管理器重新注册。
- **验证**：修复后命令栈 136 → **146**，`STYLE`/`UNITS`/`QSELECT`/`ATTDEF`/`ATTEDIT`/`INSERT`/
  `PROPERTIES`/`PTTYPE`/`CHTML` 全部在位；`getLazyPluginTriggers()` 返回
  `["CPDF","IPDF","-CHTML","CHTML","CSVG","AGENT","SEARCH","FIND"]`。
- **未改**：`registerDialogs` / `registerMTextColorPicker` 的目标是模块级对象（对话框 store 是
  模块级响应式、颜色拾取器挂在 `AcEdMTextEditor` 静态字段），不随实例销毁，保持原样。

### 5.2 字体下拉里一打字就全空（阻断自定义字体名）

- **现象**：在「字体名」下拉里输入任意字符 → 选项列表**全部消失**（下拉里连原有字体也不显示）。
- **根因**：`filterOptionByLabel` 只比较 `String(option.label)`。`a-select-option` 模板渲染出的
  选项，其 `label` 是 VNode，`String()` 得到 `"[object Object]"`，永远不包含输入内容。
- **修法**：过滤时同时比较 `label` 与 `value`，并只在值是字符串/数字时参与比较。
  打字输入自定义字体名正是本次新增的能力，不修则不可用。

### 5.3 E2E 侧的两处自身问题（记录以免误判）

- `MlBaseDialog` 的页脚在 `.ml-text-style-dlg` **之外**（后者是 `MlBaseDialog` 插槽内容的 class），
  E2E 里必须从 `.ml-base-dialog`（`:has(.ml-text-style-dlg)`）定位页脚按钮。
- `window.AcApDocManager` 暴露的是**类**（`App.vue:131`，仅 DEV），读活动文档必须走
  `.instance.curDocument`；直接读 `.curDocument` 会永远得到空结果。

## 6. 验证结果

### 6.1 单测 / 类型 / 构建

| 命令 | 结果 |
| --- | --- |
| `npx jest packages/cad-viewer-example/__tests__/mtextRibbon.spec.ts` | 17/17 通过 |
| `npx jest packages/cad-viewer/__tests__/useTextStyle.spec.ts` | 13/13 通过 |
| `npx jest packages/cad-viewer packages/cad-viewer-example packages/cad-simple-viewer` | 517 测试全过；2 个套件**运行前**即失败，见 §6.3 |
| `pnpm --filter @hy/cad-viewer exec vue-tsc --noEmit` | exit 0 |
| `pnpm --filter @hy/cad-viewer-example exec vue-tsc --noEmit` | exit 0 |
| `pnpm build`（`npx nx reset` 后全量） | exit 0，19 个项目成功 |
| `eslint`（改动/新增文件） | 无新增错误；新增文件零告警 |

> `pnpm build` 首次因 nx 项目图缓存引用了已删除的
> `three-renderer/__tests__/zz-adversarial-*.spec.ts` 而报
> `Failed to process project graph`；按提示 `npx nx reset` 后恢复正常（属工作区缓存陈旧，
> 与本次改动无关）。

### 6.2 E2E（真实浏览器，Chrome headless + SwiftShader）

在 `e2e/tests/mtext-draw-accuracy.spec.ts` 新增回归用例
「opening the MTEXT editor reveals the Text Editor contextual ribbon tab」，
断言：编辑器打开后上下文标签可见且被选中、格式面板 7 个字段 + 3×3 效果按钮、
段落/插入/关闭面板渲染、点击粗体后 `aria-pressed=true`、Esc 后标签消失。

新增 `e2e/tests/text-style-dialog.spec.ts`（STYLE 对话框对标项）：

```
npx playwright test e2e/tests/text-style-dialog.spec.ts
✓ Text Style dialog limits the oblique angle to ±85 and writes it to the database
    （输入 130 → 字段回夹 85；「应用」提示 applied 且对话框不关闭；
      数据库记录 obliqueAngle 实测 85；Cancel 关闭）
✓ Text Style dialog accepts a font name the drawing does not reference
    （输入 MyCustomFont.ttf → 出现唯一带 (Custom) 标记的候选；Cancel 不入库）
2 passed
```

```
npx playwright test e2e/tests/mtext-draw-accuracy.spec.ts
✓ opening the MTEXT editor reveals the Text Editor contextual ribbon tab
✓ ribbon Text tool commits the typed Chinese string as an MTEXT entity
✓ rendered Chinese MTEXT passes the ink / glyph-component criteria
✓ the text region is blank before the command and inked after it
4 passed
```

功能区相邻回归（`property-bar-selection.spec.ts`）：**通过**，其中 1 条被判 flaky（重试后绿），
属本机软件渲染下选择拾取的抖动。

**顺带修好的既有 E2E 缺陷**：`typeAndCommitChineseMText` 原本用 **Esc** 提交，而 `cc3164d`
已把 Esc 定为取消路径（「取消路径不再写库」是那一轮的交付项），于是该文件 3 条用例
（含 2 条像素判据）长期红灯——该轮文档明确「不跑 E2E」，所以一直没被发现。现改为点击本
次新增的「关闭」面板按钮提交，3 条全绿；这也顺带证明了新面板的提交链路真实可用。

### 6.3 既有失败（与本次改动无关，已复核）

| 失败项 | 判定依据 |
| --- | --- |
| `polarTrackingMenu.spec.ts` / `AcApHatchRibbonCmd.spec.ts` 套件无法运行 | 引用 `809e4fe` 删除旧壳时一并删掉的 `polarTrackingMenu.ts` / `AcApHatchRibbonCmd.ts` / `hatchPatternPreview.ts`，是遗留死测试 |
| `smoke.spec.ts`「zero pageerror」 | `TunnelPlugin` 重复注册 `TUNNELROADWAY`；`text-audit/文字绘制检查与优化报告.md:573` 已记录该现象在本次改动之前就已存在，属既有插件缺陷 |
| `layer-select-selection.spec.ts` 2 条（重试 2 次仍红） | 断言选择器 `.antd-layer-select .ant-select-selection-item`，但 `AntdLayerSelect.vue` 已重写为自定义拾取器 `.antd-layer-select-trigger`、内部**没有** `a-select` → 针对旧实现的过期测试，永远不可能通过。且本次改动前 `test-results/` 中已存在同两条用例的失败产物 |
| `property-bar-selection.spec.ts` 选择同步类用例 | 选择→属性栏路径在本机（无 GPU）拾取抖动：同一文件在重试运行中 3 passed / 1 flaky，两次运行的失败集合不相同 |

### 6.4 单测覆盖范围

符号 `\U+` 解码（含越界/畸形输入）、格式快照比较、段落对齐映射、编辑器命令路由
（格式/上标回退/堆叠/大小写/对正/对齐/行距/插入）、高度非法值忽略、编辑器关闭后状态复位、
编辑器事件驱动刷新，以及桥的引用计数与监听释放（防止多挂载重复绑定）；STYLE 侧覆盖
倾斜角夹取（读/写/边界/非有限值）、生成标志重建、大字体与垂直互斥，以及自定义字体候选
（新增/`.shx` 判定/不重复）。

## 7. 后续修正：面板标签显示原始 i18n key（2026-09-12）

- **症状**（用户截图）：文字编辑器功能区各面板的标签显示成
  `ribbon.mtext.field.textStyle`、`ribbon.mtext.command.attachment` 等原始 key。
- **根因**：`cad-viewer` 的 locale 文件是按**文件即命名空间**注册的
  （`packages/cad-viewer/src/locale/i18n.ts`：`zh: { main: zhMain, command, dialog, entity }`），
  所以 `locale/zh/main.ts` 里那套文案的运行时路径是 `main.ribbon.mtext.*`。
  本次实现照旧壳文案表引用时漏了 `main.` 前缀，vue-i18n 查不到便回退显示 key。
  （`dialog.textStyleDlg.*` 之所以正常，是因为 `dialog.ts` 正好挂在 `dialog` 命名空间下。）
- **修法**：4 个 MTEXT 面板组件共 **79 处** key 补上 `main.` 前缀，直接复用既有 zh/en/tr/cs
  四语言译文，**不新增任何文案**。
- **为什么此前的 E2E 没抓到**：`mtext-draw-accuracy.spec.ts` 的上下文标签用例只断言了
  「元素个数 + 可见性 + aria-pressed」，没有断言**文案**——key 未解析时这些断言全绿。
  现补上：
  1. 格式面板 7 个字段标签的**精确文案**（`toHaveText(['Text Style','Font','Color',
     'Height','Oblique angle','Tracking','Width factor'])`）；
  2. 四个面板均 `not.toContainText('ribbon.mtext')`（原始 key 的通用哨兵）；
  3. 段落的 `Justify` / `Line Spacing`、插入的 `Symbol`、关闭的 `Close` 命令标签；
  4. toggles 与对正按钮的 `title` 属性（tooltip 文案不在文本节点里，前三条覆盖不到）。
- **量纲核实（未改语义）**：`defaultCharFormat()` 中 `widthFactor`/`tracking` 均为 **1 基**
  （实测新建编辑器显示 `1.00 / 1.00 / 0`），面板 `0.1–5` / `0.1–10` 的范围与之一致；
  截图里出现的 `100.0` 来自**文档侧读回值**（`CharFormat` 直接取
  `style.widthFactor.value`，非相对量为百分制），旧实现同样是这套范围，本次未改动。

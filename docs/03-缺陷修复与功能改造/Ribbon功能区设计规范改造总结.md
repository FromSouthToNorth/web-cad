# Ribbon 功能区设计规范改造总结：Ant Design 与 AutoCAD 交互规范对齐

- 日期：2026-09-04
- 涉及包：`cad-viewer-example`（`src/shell/ribbon/*`、`src/shell/shell.css`、`src/locale/en.ts`、`src/locale/zh.ts`）
- 目标：按 Ant Design 设计规范（亲密性/对齐/对比/巧用过渡/即时反应等原则）与 AutoCAD Ribbon 交互规范（Keytips、SuperTip、禁用而非隐藏、图标尺寸、无障碍）重构功能区界面

## 1. 改造背景与设计依据

改造前 Ribbon 已具备「选项卡 → 面板 → 控件」三层结构与双层提示（大按钮 + 面板标题下拉承载小工具），但存在以下与规范不符的问题：

| 问题 | 对应规范 |
| --- | --- |
| 折叠/展开用 `v-if` 直接隐藏，无过渡动画，且丢失面板内控件状态 | Ant Design「巧用过渡」；AutoCAD 折叠面板 |
| 只有 tooltip 里的 `(keyTip)` 文本，无真正的 Alt 键提示导航 | AutoCAD「5.3 按键提示（Keytips）」 |
| 拆分按钮禁用时箭头仍可打开菜单并执行命令 | AutoCAD「3.1 禁用而非隐藏」（且是实际漏洞） |
| 禁用按钮是原生 `disabled`，鼠标事件不触发，tooltip 失效 | Ant Design「反馈」模式 |
| 大图标 20px、小图标 14px，与 AutoCAD 16/32 像素双尺寸约定不一致 | AutoCAD「4.1 图标尺寸」 |
| tabpanel 区域缺 `role="tabpanel"` 关联，折叠后隐藏控件仍在 Tab 序中 | WAI-ARIA；Ant Design 无障碍 |
| QAT 缺「保存」，应用菜单按钮 aria-label 硬编码英文 | AutoCAD QAT 约定；「5.4 辅助功能」 |

## 2. 实现

### 2.1 Alt 键提示导航（`AntdRibbon.vue`）

参照 AutoCAD「Alt 显示键提示 → 输入字母直达命令」的交互，实现两级状态机：

- **状态**：`keytipActive`（是否处于键提示模式）、`keytipLevel: 1 | 2`（一级选选项卡 / 二级选命令）、`keytipBuffer`（已输入前缀）
- **进入**：全局捕获 `keydown`，按 `Alt`（不带修饰键，忽略 `repeat`）切换，`preventDefault` 阻止浏览器菜单
- **一级匹配**：候选 = 带 `keyTip` 的选项卡（常用 H / 插入 I / 审阅 R / 测量 M / 视图 V，定义在 `ribbonModel.ts` 的 `RibbonTabDef.keyTip` 新字段）。前缀匹配，精确命中即切选项卡并进入二级，缓冲区清空
- **二级匹配**：候选 = 当前选项卡中 `size: 'large'`（面板内可见）且带 `keyTip` 的控件。精确命中 → `run(command)` 执行并退出键提示模式；前缀仍有候选 → 继续累积；无候选 → 退出
- **退出**：`Esc`、任意 `pointerdown`（捕获阶段，先退出再让点击正常生效）、命令执行后
- **前缀高亮**：`is-pending` 类标记输入已匹配前缀的徽标（实测 `r` → REC/RO 亮起，`re` → 仅 REC）。支持 `Backspace` 回退
- **与键盘导航共存**：方向键/Home/End 切换选项卡时重置键提示到一级；键提示模式下 Alt+字母、Ctrl/Meta 组合键不参与匹配
- **徽标渲染**：选项卡徽标内联在文字右侧；按钮徽标绝对定位在右下角（拆分按钮位于箭头条上方 `bottom: 13px`）；`aria-hidden="true"` 避免读屏重复朗读；样式见 `shell.css` 的 `.antd-ribbon-keytip`

### 2.2 折叠过渡动画（`AntdRibbon.vue` + `shell.css`）

- 面板区由 `v-if` 改为**常驻挂载**，高度在 0 与内容自然高度之间过渡（CSS `transition: height var(--ml-motion-base) ease` + JS 显式起始/目标高度），图层/特性面板控件状态在折叠后保留
- `prefers-reduced-motion` 用户直接吸附无动画（临时禁用内联 transition，同帧提交高度变化后恢复）
- 折叠时对面板区设置 `inert`（Vue 3.4+ 原生布尔属性）：视觉隐藏的同时从 Tab 序与辅助技术树移除
- 点击选项卡自动展开、双击选项卡折叠（AutoCAD 最小化手势）都走同一个 `setCollapsed()`，动画与内联高度状态一致

**踩坑记录（实测捕获）**：

1. **`grid-template-rows: 1fr → 0fr` 折叠动画在不定高容器中塌陷**：`1fr` 在不定高 grid 容器中按内容的「最小贡献」解析，内层 `min-height: 0` + `overflow-y: hidden` 使其最小贡献 = 0（仅剩 4px 内边距），面板区被压成 4px 细条、内容全被裁掉。改用 JS 测量高度 + `transition: height` 方案。
2. **`requestAnimationFrame` 提交样式在隐藏标签页中暂停**：最初用 rAF 分帧提交「起始高度 → 目标高度」，浏览器实测发现文档隐藏时 rAF 不触发，动画卡在起始帧。改为**强制回流**（`void element.offsetHeight`）提交，不依赖动画帧。
3. 内边距必须从容器移到各面板（`.antd-ribbon-panel` 的 `padding-top`），否则折叠后残留 4px 内边距缝隙。
4. 展开动画结束监听 `transitionend`（校验 `propertyName === 'height'`），中途被打断时移除残留监听，避免下次过渡被提前清空高度导致面板弹开。

### 2.3 SuperTip 增强提示（`AntdRibbonPanel.vue` + locale）

提示内容升级为 AutoCAD SuperTip 两级结构：第一行「名称 (键提示)」，第二行「命令：command」（如实测渲染为 `直线 (L) 命令：line`）。命令文案参数化 i18n：`shell.ribbon.command = 'Command: {command}'` / `'命令：{command}'`，消除模板中的裸文本冒号。

### 2.4 禁用而非隐藏（`AntdDropdownButton.vue`）

修复拆分按钮禁用态漏洞：原来 `props.disabled` 时主区域 `@click` 有守卫，但箭头 `@click.stop="dropdownOpen = !dropdownOpen"` 无守卫、`handleOptionClick` 无守卫、`a-dropdown` 未设 `:disabled`——禁用期间箭头仍可打开菜单并执行命令。现三处统一：

- `a-dropdown` 加 `:disabled="props.disabled"`
- 原生按钮加 `:disabled`
- `toggleMenu` 与 `handleOptionClick` 补守卫
- CSS 补 `.antd-ribbon-dropdown:disabled` 样式（与 `.is-disabled` 并列）

### 2.5 禁用态 tooltip 修复（`AntdRibbonPanel.vue` / `AntdQat.vue`）

原生 `disabled` 按钮不派发鼠标事件，antd Tooltip 无法弹出。按钮外包一层 `<span class="antd-ribbon-tooltip-host">`，tooltip 挂在 span 上，禁用时照常显示（符合 AutoCAD「3.1 用增强工具提示解释命令被禁用的原因」）。

**踩坑（用户反馈定位）**：宿主 span 初版用 `display: contents`（不产生盒子），但 rc-trigger 用触发元素的 `getBoundingClientRect()` 计算弹层锚点，`display: contents` 元素的矩形为空（0×0），tooltip 被钉在视口左上角 (0,0)。改为 `display: inline-flex`（真实盒子、紧贴按钮尺寸）后定位恢复正常。

### 2.6 图标尺寸对齐（`shell.css`）

- 大按钮/下拉按钮图标 20px → **24px**（对标 AutoCAD 32px 大图标按 Web 密度缩放）
- 小按钮图标 14px → **16px**（AutoCAD 16×16 小图标标准）
- QAT 图标 13px → 16px，应用按钮 SVG 14 → 16

### 2.7 按压即时反馈（`shell.css`）

所有自定义按钮（QAT、大/小功能区按钮、拆分按钮、面板标题下拉、选项卡）补 `:active:not(:disabled)` 主色反馈：`color-mix(in srgb, var(--ml-theme-primary) 14%, transparent)`，与既有选中态同色系，暗黑模式随主题令牌自动适配。

### 2.8 ARIA 与无障碍（`AntdRibbon.vue`）

- tablist 补 `aria-label="Ribbon tabs"`（本地化）
- 每个选项卡补 `id`、`aria-controls`、`aria-keyshortcuts="Alt+X"`；面板区补 `role="tabpanel"`、`:id`、`:aria-labelledby` 与活动选项卡关联
- 语言选择器补 `aria-label="Language"`
- 折叠态 `inert` 见 2.2

### 2.9 QAT 补全与本地化（`ribbonModel.ts` / `AntdQat.vue` / locale）

- QAT 按 AutoCAD 默认顺序补「保存」：新建 / 打开 / **保存** / 撤销 / 重做
- 应用菜单按钮 aria-label 由硬编码 `"Application menu"` 改为 `t('shell.ribbon.fileMenu')`
- QAT tooltip 走 `shell.ribbon.qat.<id>` 查找，缺键回退数据模型英文文案（与面板按钮 `labelFor` 同一模式）
- locale 新增键：`tablist`、`locale`、`command`（带参数）、`qat.qnew/open/qsave/undo/redo`（en/zh 双语）

### 2.10 图层快速选择器改造（`AntdLayerSelect.vue`）

原实现是 `a-select` 纯选择框（仅色点 + 名称）；改造为自定义下拉：触发钮（色点 + 当前图层名 + 三态步进图标 + 箭头）+ 弹出面板（搜索框 + 可滚动图层列表），对齐 AutoCAD 图层管理三态操作：

- **触发钮内置三态步进器**：触发钮结构为 `● 名称 [👁][❄][🔒] ▾`。三个图标切换**当前显示图层**的隐藏/冻结/锁定状态，随后自动步进切换到下一个图层（循环遍历），实现"逐步点击逐层处理"的批处理工作流；步进复用 `onLayerChange`（无选中实体时切 CLAYER，有选中时按选择语义移动实体）。图标状态随当前图层联动（隐藏时交叉眼、冻结时雪花、锁定时锁形，激活主色高亮），tooltip/aria 动态描述（"隐藏图层 X"等）
- **三态切换（下拉列表行）**：每行三个图标按钮（隐藏/冻结/锁定），调用 `useLayers` 的 `toggleLayerState(name, 'on'|'frozen'|'locked')`（与侧边图层面板同一 store 通道）。激活态（图层隐藏/冻结/锁定）图标以主题主色高亮 + 浅主色背景，正常态灰显；隐藏用 `EyeInvisibleOutlined`、冻结用 CAD 雪花 SVG（`iconLayerFreeze/iconLayerThawed`，补 `fill: currentColor` 映射适配暗色主题）、锁定用 `LockOutlined/UnlockOutlined`
- **搜索**：实时大小写不敏感过滤（`computed` 缓存），`allow-clear` 清除按钮，无匹配时 `a-empty` 空状态；打开时自动聚焦搜索框（popup 懒挂载，用重试循环聚焦）
- **当前图层高亮**：`is-current` 行加主色浅背景 + 名称主色加粗
- **性能**：行用 `v-memo`（依赖 name/三态/颜色/当前标识），列表仅渲染过滤结果；弹层 `destroy-popup-on-hide` 避免 DOM 堆积
- **无障碍**：图标按钮带动态 aria-label（"隐藏图层 X" 等，本地化）；新交互元素补充 `:focus-visible` 焦点环

## 3. 验证

### 3.1 静态检查

- `vue-tsc --noEmit`：通过（0 错误）
- `vite build`：通过（16s 生产构建成功）
- `eslint`：仅剩 `@intlify/vue-i18n/no-dynamic-keys` 一类错误——其中 5 处与 master 基线一致（ribbon 目录既有模式），AntdQat 的 `labelFor` 新增 1 处同类错误，为与 `AntdRibbonPanel`/`AntdDropdownButton` 既有写法保持一致而保留（见 4.1）

### 3.2 浏览器实测（dev server + DOM 断言）

| 用例 | 结果 |
| --- | --- |
| 按 Alt → 选项卡键提示徽标 | 显示 H / I / R / M / V，面板徽标为 0（一级正确） |
| 一级输入 `v` | 切到「视图」选项卡，二级徽标显示 ZA / ZW / P |
| 二级前缀匹配 `r` → `re` | `is-pending` 分别为 [REC, RO] → [REC] |
| 二级完整输入 `c`（RECTANG） | 命令执行、键提示全部退出（徽标归零） |
| `Esc` 退出 | 徽标归零 |
| 折叠按钮 | 高度 91px → 0px，`is-collapsed` + `inert` 生效 |
| 展开按钮 | 高度恢复 91px，内联高度清除 |
| 折叠态点击选项卡 | 自动展开（高度 87.8px）并切换选项卡 |
| 双击选项卡 | 折叠（AutoCAD 最小化手势） |
| 悬停「直线」按钮 | SuperTip 渲染 `直线 (L) 命令：line` |
| 大图标计算尺寸 | 24×24px |

## 4. 遗留与后续

### 4.1 lint 动态 key 现状

`@intlify/vue-i18n/no-dynamic-keys` 规则与 ribbon 的「数据模型 id → i18n key」查表模式天然冲突，master 基线已带 5 处同类错误（`t(\`shell.ribbon.tab.${tab.id}\`)` 等），本次新增 1 处（AntdQat `labelFor`）。如需彻底清零，可把 labelFor 改为字面量 switch/map，但会与面板/下拉按钮的既有写法不一致，暂未处理。

### 4.2 可继续增强项（未纳入本次）

- 上下文选项卡（`RibbonTabDef.contextual`）数据模型与 CSS 彩条已就绪，但尚无选项卡实际使用，可按 AutoCAD「5.1 上下文选项卡颜色」接入命令激活逻辑
- 面板内图库（In-ribbon Gallery）与实时预览未实现（AutoCAD「3.4」），当前以拆分按钮下拉替代
- 键盘逐控件移动（Tab/Shift+Tab 在面板间移动）可进一步完善，当前焦点管理以选项卡 roving tabindex 为主

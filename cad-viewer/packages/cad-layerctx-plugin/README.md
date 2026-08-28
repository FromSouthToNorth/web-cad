# @mlightcad/cad-layerctx-plugin

画布对象右键上下文菜单插件，面向基于 [`@mlightcad/cad-simple-viewer`](../cad-simple-viewer) 的 CAD 查看器应用。功能完整内聚于本包，宿主库仅含一处配套修复（见下「宿主配套修复」）：

- 画布中右键任意实体弹出上下文菜单（先自动选中该实体，标准 CAD 右键语义），六项操作全部作用于**当前选中对象**：
  | 菜单项 | 命令 | 快捷键 | 说明 |
  | --- | --- | --- | --- |
  | 复制 | `copy`（宿主命令） | `Ctrl/Cmd+Shift+C` | 交互式复制：指定基点 → 点击落点放置副本，带实时预览，支持连续多次放置 |
  | 移动 | `move`（宿主命令） | `Ctrl/Cmd+Shift+M` | 交互式移动：指定基点 → 点击落点，带实时预览 |
  | 缩放 | `layctxscale`（插件命令） | `Ctrl/Cmd+Shift+S` | 交互式缩放：指定基点 → 拖动鼠标（光标到基点距离 = 比例）或直接输数值，带实时预览 |
  | 旋转 | `rotate`（宿主命令） | `Ctrl/Cmd+Shift+R` | 交互式旋转：指定基点 → 拖动或输入角度，带实时预览，支持 Copy/Reference 子选项 |
  | 取消选择 | `layctxdsel` | `Ctrl/Cmd+Shift+A` | 清除当前所有选中实体 |
  | 删除 | `layctxdel` | `Del` | 删除选中实体（与 Delete 键 / `ERASE` 同语义，实体级操作，不受图层 `0`/当前图层限制）；置底红色样式防误点 |
- 复制/移动/旋转直接复用宿主内置交互命令（自动把当前选择集作为预选对象）；缩放为插件自建交互命令（宿主无 `scale`），同样走「基点 → 拖 Mouse 定比例」的 AutoCAD SCALE 语义
- **操作后保留选择**：复制/移动/缩放/旋转执行完毕自动恢复执行前的选择集（AutoCAD 语义），可对同一批对象连续右键做 复制 → 旋转 → 缩放 等连招；删除/取消选择保持清空
- 菜单支持键盘导航：打开即聚焦首项，↑/↓ 循环、Home/End 跳转、Enter 激活、Esc 关闭；macOS 下快捷键提示自动显示为 ⌘⇧ 形式
- 三个自有命令（`layctxdel` / `layctxscale` / `layctxdsel`）均可在命令行直接执行，空选择时给出提示
- 右键空白画布：若已有选中对象则弹出菜单；无选中则不弹
- 界面文案：English / 简体中文 / Türkçe / Čeština，随宿主语言切换
- 所有数据库修改支持撤销（undo 分组单步回退）

> 📖 **开发维护文档（机制详解 / 已知限制 / 回退清单）**：
> [`docs/对象右键菜单插件开发文档.md`](./docs/对象右键菜单插件开发文档.md)
>
> 开发新的功能插件请遵循公共标准：[`docs/功能插件开发标准.md`](../../../docs/04-开发规范/功能插件开发标准.md)

## 使用

在应用启动、文档管理器创建之后注册一次（例如在 viewer 的 `create` 回调中）：

```ts
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { registerLayerCtxPlugin } from '@mlightcad/cad-layerctx-plugin/register'

void registerLayerCtxPlugin(AcApDocManager.instance.pluginManager)
```

本插件采用**急切加载**（而非 svg/pdf 插件的命令触发懒加载）：快捷键监听与右键菜单必须在首次交互前就绪。从 `/register` 子路径导入可让插件主包不进入应用首屏 chunk。

移除功能 = 删掉这一行注册调用，宿主应用不含任何右键菜单代码。

## 宿主配套修复（一处）

选中实体的夹点手柄（`AcEdGripHandle`）是覆盖在画布上的 DOM 元素，会吞掉落在夹点上的画布点击。修复分两处：

- **宿主**（`cad-simple-viewer/src/editor/grip/AcEdGripManager.ts`）：`commandWillStart` 时无条件隐藏全部夹点（AutoCAD 语义，命令期间夹点本就不可交互），`commandEnded` 再按选择集恢复。这同时修复了宿主自带命令（功能区移动/复制/旋转）在夹点位置点击基点无效的问题。
- **插件**（`layerCtxPick.ts`）：右键命中夹点元素时同样视为画布事件，保证选中对象后对同一位置再次右键也能弹出菜单。

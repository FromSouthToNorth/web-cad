# @mlightcad/cad-invertsel-plugin

图元反选插件，面向基于 [`@mlightcad/cad-simple-viewer`](../cad-simple-viewer) 的 CAD 查看器应用。功能完整内聚于本包，**宿主库源码零修改**：

- `invertsel` / `INVERTSEL` 命令（命令行可执行）
- Ribbon 按钮：常用 → 实用工具组，位于「快速选择」之后
- 快捷键：`Ctrl+Shift+I`（Windows/Linux）、`Cmd+Shift+I`（macOS）
- 界面文案：English / 简体中文 / Türkçe / Čeština，随宿主语言切换

反选语义：当前选择集中已选图元取消选择，其余模型空间图元全部选中。

> 📖 **开发维护文档（机制详解 / 工作流 / 已知限制 / 扩展指南）**：
> [`docs/反选功能插件化开发文档.md`](./docs/反选功能插件化开发文档.md)
>
> 开发新的功能插件请遵循公共标准：[`docs/功能插件开发标准.md`](../../../docs/04-开发规范/功能插件开发标准.md)

## 使用

在应用启动、文档管理器创建之后注册一次（例如在 viewer 的 `create` 回调中）：

```ts
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import { registerInvertSelPlugin } from '@mlightcad/cad-invertsel-plugin/register'

void registerInvertSelPlugin(AcApDocManager.instance.pluginManager)
```

本插件采用**急切加载**（而非 svg/pdf 插件的命令触发懒加载）：快捷键监听与 Ribbon 按钮必须在首次交互前就绪。从 `/register` 子路径导入可让插件主包不进入应用首屏 chunk。

移除功能 = 删掉这一行注册调用，宿主应用不含任何反选代码。

## 实现速览

| 能力 | 机制 |
| --- | --- |
| 命令 | `onLoad` 中 `commandManager.addCommand('invertsel')`，`onUnload` 对称移除 |
| 反选逻辑 | 仅用公开 API：`view.editor.selectAll()` + `view.selectionSet.has/add/delete` |
| 快捷键 | 插件自持 document 级 `keydown` 监听，守卫与宿主一致（IME / 输入框 / 空命令行放行 / MText 内联编辑 / 命令采集中） |
| Ribbon 按钮 | `MutationObserver` 监听 `[data-group-id="home-utilities"]`，克隆「快速选择」按钮保持样式，换 id/文案/图标后注入；宿主重渲染后自动重注入 |
| 多语言 | 插件自带文案表；初始语言按宿主优先级解析（localStorage `preferred_lang` → 浏览器 → zh），运行时订阅 `AcApI18n.events.localeChanged` |

## 卸载

```ts
await AcApDocManager.instance.pluginManager.unloadPlugin('InvertSelPlugin')
```

`onUnload` 会移除命令、摘除快捷键监听、断开 Ribbon 观察器并移除注入按钮。

## 构建

```bash
# 先构建 cad-simple-viewer（插件 tsc 依赖其 lib 类型产物）
pnpm --filter @mlightcad/cad-simple-viewer build
pnpm --filter @mlightcad/cad-invertsel-plugin build
```

注意：example 应用 dev 模式把宿主库别名到源码，但本插件从 `dist/` 解析——**修改插件代码后需重新 build 才会在 dev server 生效**（详见开发文档第 5.2 节）。

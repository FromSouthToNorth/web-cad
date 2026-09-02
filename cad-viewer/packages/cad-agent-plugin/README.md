# CAD Agent Plugin

基于 LLM 的自然语言 CAD 绘图助手，嵌入在 2D CAD 查看器中。用户通过自然语言描述或上传工程图参考图，由 AI 调用 CAD 绘图工具自动绘制精确的 2D 几何图形。

---

## 目录

- [整体架构](#整体架构)
- [模块结构](#模块结构)
- [插件注册与生命周期](#插件注册与生命周期)
- [LLM 服务商与模型配置](#llm-服务商与模型配置)
- [Agent 运行模式](#agent-运行模式)
- [对话传输层](#对话传输层)
- [视觉验证循环](#视觉验证循环)
- [系统提示词](#系统提示词)
- [CAD 工具集](#cad-工具集)
- [绘图执行器](#绘图执行器)
- [绘图上下文](#绘图上下文)
- [文档访问控制](#文档访问控制)
- [API Key 安全存储](#api-key-安全存储)
- [国际化](#国际化)
- [UI 面板](#ui-面板)
- [错误处理](#错误处理)
- [数据流概览](#数据流概览)
- [关键文件索引](#关键文件索引)

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  AgentChatPanel.vue (Vue 3 UI)                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │  Settings UI   │  │  Chat UI       │  │  Image Attach    │   │
│  │  Provider/Model│  │  Message List  │  │  Pending Previews│   │
│  └────────────────┘  └────────────────┘  └──────────────────┘   │
│          │                     │                                  │
│          ▼                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  useAgentChat  →  Chat (AI SDK Vue)                      │    │
│  │       │                                                  │    │
│  │       ▼                                                  │    │
│  │  createAgentChatTransport (in-process, no HTTP server)   │    │
│  │       │                                                  │    │
│  │       ├── simple mode → streamAgentRound → Agent.stream  │    │
│  │       │                                                  │    │
│  │       └── high-inference mode → verify loop:             │    │
│  │             Agent.stream → capturePreview → verifyDrawing│    │
│  │             → feedback → loop until pass or max attempts │    │
│  └──────────────────────────────────────────────────────────┘    │
│          │                     │                                  │
│          ▼                     ▼                                  │
│  ┌────────────────┐  ┌──────────────────────────────────────┐    │
│  │  createCadAgent│  │  CAD Tools (ai-sdk tool definitions) │    │
│  │  - system prom │  │  get_drawing_context                 │    │
│  │  - tools       │  │  draw_line / circle / arc / rect ... │    │
│  │  - stopWhen(10)│  │  delete_entities / zoom_extents      │    │
│  └────────────────┘  └──────────────────────────────────────┘    │
│          │                     │                                  │
│          ▼                     ▼                                  │
│  ┌────────────────┐  ┌──────────────────────────────────────┐    │
│  │ createModel    │  │  CadActionExecutor (singleton)       │    │
│  │ Anthropic /    │  │  - requireDocument / requireView     │    │
│  │ OpenAI /       │  │  - runEdit (undoable transactions)   │    │
│  │ OpenAI-compat  │  │  - appendEntity to model space       │    │
│  └────────────────┘  └──────────────────────────────────────┘    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Storage Layer (localStorage)                                │ │
│  │  LlmSettingsStore  │  AgentModeStore  │  apiKeyCrypto       │ │
│  │  (AES-GCM encrypted API key, PBKDF2 100k iterations)         │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 模块结构

```
src/
├── index.ts                    插件入口，导出 AgentChatPanel 组件
├── register.ts                 懒加载注册（registerLazyAgentPlugin）
├── createAgentPlugin.ts        工厂函数，返回 AcApAgentPlugin 实例
├── AcApAgentPlugin.ts          插件类，注册 agent 命令
│
├── agent/                      Agent 核心逻辑
│   ├── createCadAgent.ts       构建 AI SDK Agent + 对话传输层
│   ├── createModel.ts          根据 provider 创建 LanguageModel
│   ├── systemPrompt.ts         系统提示词（~400 行）
│   ├── conversationContext.ts  提取用户请求文本和参考图
│   ├── drawingVerifier.ts      截图验证（generateObject + Zod）
│   ├── drawingPreviewCapture.ts截图捕获（实体渲染 + PNG）
│   ├── openAiCompatibleFetch.ts fetch 包装，developer→system 角色转换
│   └── uiMessageStreamHelpers.ts  流式写入辅助函数
│
├── tools/                      CAD 工具定义与执行
│   ├── cadTools.ts             AI SDK tool 定义（Zod schema）
│   ├── CadActionExecutor.ts    几何实体创建/删除实现
│   ├── DrawingContextProvider.ts  图层/单位/范围快照
│   └── documentAccess.ts       文档/视图可用性守卫
│
├── storage/                    持久化与加密
│   ├── LlmSettingsStore.ts     LLM 设置（provider/model/baseUrl/apiKey）
│   ├── modelCatalog.ts         预设模型列表 + 视觉模型启发式匹配
│   ├── AgentModeStore.ts       Agent 模式（simple / high-inference）
│   ├── apiKeyCrypto.ts         AES-GCM 加密 API Key
│   └── settingsEquality.ts     设置浅比较
│
├── ui/                         Vue 组件
│   ├── AgentChatPanel.vue      主聊天面板（settings + chat + images）
│   ├── agent-panel.css         面板样式
│   ├── useAgentChat.ts         Chat 会话管理（Vue shallowRef）
│   └── formatChatError.ts      错误消息格式化
│
├── command/
│   └── AcApAgentCmd.ts         agent 命令，打开调色板标签页
│
├── palette/
│   └── agentPaletteIntegration.ts  调色板开关注册（宿主注入）
│
└── i18n/                       国际化
    ├── index.ts                注册 + agentT 翻译函数
    ├── en.ts / zh.ts           英文 / 中文
    ├── cs.ts / tr.ts           捷克语 / 土耳其语
    └── useAgentI18n.ts         响应式标签（监听 localeChanged）
```

---

## 插件注册与生命周期

### 懒加载注册

在应用启动时通过 `registerLazyAgentPlugin(pluginManager)` 注册。此函数：

1. 调用 `registerAgentI18n()` 注册四语言 UI 字符串。
2. 通过 `pluginManager.registerLazyPlugin()` 注册插件元信息：
   - 名称：`AgentPlugin`
   - 触发命令：`agent`
   - 加载器：动态 `import('./createAgentPlugin')` 避免主包膨胀

### 插件加载（onLoad）

当 `agent` 命令被触发时：

1. 动态导入 `createAgentPlugin`，创建 `AcApAgentPlugin` 实例。
2. `onLoad` 在系统命令组注册 `agent` 命令（`AcApAgentCmd`）。
3. `AcApAgentCmd.execute()` 调用 `openAgentPalette()`，打开/聚焦工具调色板中的 Agent 标签页。

### 插件卸载（onUnload）

遍历 `registeredCommands` 数组，逐个调用 `commandManager.removeCmd()` 注销命令。

### 宿主集成

```typescript
import { registerLazyAgentPlugin } from '@mlightcad/cad-agent-plugin/register'

registerLazyAgentPlugin(AcApDocManager.instance.pluginManager)
```

在 cad-viewer 中通过 `setAgentPaletteOpener(opener)` 注入调色板打开回调，使 `agent` 命令能够正确打开面板。

---

## LLM 服务商与模型配置

### 支持的 Provider

| Provider ID         | 默认 Base URL                      | 默认 Model                    |
| ------------------- | ---------------------------------- | ----------------------------- |
| `openai`            | `https://api.openai.com/v1`        | `gpt-4o-mini`                 |
| `anthropic`         | `https://api.anthropic.com/v1`     | `claude-3-5-haiku-latest`     |
| `openai-compatible` | `https://api.openai.com/v1`        | `gpt-4o-mini`                 |
| `deepseek`          | `https://api.deepseek.com`         | `deepseek-v4-flash`           |
| `kimi`              | `https://api.kimi.com/coding/v1`   | `k3`                          |

### 预设模型列表

每个 Provider 下挂载若干 `LlmModelOption`，包含 `value`（API model id）、`labelEn` / `labelZh`（显示名）、`supportsVision`（是否支持图片输入）。

**视觉模型**（`supportsVision: true`）：

| Provider            | Model                          |
| ------------------- | ------------------------------ |
| openai              | `gpt-4o`、`gpt-4o-mini`、`gpt-4-turbo` |
| anthropic           | `claude-3-5-sonnet-latest`、`claude-3-5-haiku-latest`、`claude-3-opus-latest` |
| deepseek            | `deepseek-v4-flash-vision-exp` |
| openai-compatible   | `gpt-4o`、`gpt-4o-mini` |
| kimi                | `k3`、`k3-256k`、`kimi-for-coding`、`kimi-for-coding-highspeed` |

### 视觉模型启发式匹配

对于用户手动输入的自定义模型名，`VISION_MODEL_PATTERNS` 提供正则回退检测：

```
/gpt-4o/i, /gpt-4-turbo/i, /gpt-4-vision/i, /claude-3/i,
/claude-sonnet-4/i, /claude-opus-4/i, /claude-haiku-4/i,
/gemini/i, /qwen.*vl/i, /deepseek.*vision/i, /^k3$/i,
/kimi/i, /glm-4v/i, /llava/i, /pixtral/i
```

### Provider 切换

用户在 UI 中切换 Provider 时，`watch` 监听器自动将 `baseUrl` 和 `model` 重置为该 Provider 的默认值，并更新模型下拉选项。

### 历史迁移

`RETIRED_PROVIDERS` 映射表处理已废弃的 Provider。当 `localStorage` 中保存了旧的 `deepseek-vl` 时，`loadLlmSettings` 会自动迁移为 `deepseek`，重置 baseUrl 和 model，避免 UI 异常。

---

## Agent 运行模式

存储在 `AgentModeStore`，持久化到 `localStorage`。

| 模式              | 说明                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `high-inference`  | 默认模式。每轮绘图完成后截图，发送给视觉模型验证，最多循环 5 次。 |
| `simple`          | 简单模式。单轮对话，不执行截图验证。                              |

---

## 对话传输层

`createAgentChatTransport` 构建一个**进程内**的 `ChatTransport`（无 HTTP 服务器），由 `@ai-sdk/vue` 的 `Chat` 组件直接消费。

### 数据流

```
用户消息
  ↓
validateUIMessages()
  ↓
[high-inference 模式]
  ↓
循环:
  ├── Agent.stream(messages)         ← LLM 推理 + 工具调用
  ├── 流式写入 UIMessageStream       ← 实时展示文本/工具调用
  ├── captureDrawingPreview()        ← 渲染截图 (1024px)
  ├── verifyDrawing()                ← generateObject (Zod schema)
  ├── 通过 → 结束
  └── 失败 → 追加反馈消息 → 继续循环（最多 5 次）
  ↓
[simple 模式]
  ↓
单轮 Agent.stream() → 结束
```

### 关键参数

| 参数                                  | 值      | 说明                           |
| ------------------------------------- | ------- | ------------------------------ |
| `stopWhen`                            | `stepCountIs(10)` | 单次 Agent 最多 10 步推理    |
| `MAX_VERIFICATION_ATTEMPTS`           | `5`     | 截图验证最大重试次数           |
| `VERIFICATION_PREVIEW_LONG_SIDE_PX`   | `1024`  | 截图长边像素                   |
| `SCENE_READY_TIMEOUT_MS`              | `15000` | 等待场景渲染就绪超时（毫秒）   |

### AbortSignal 支持

所有轮次都接受 `abortSignal`，用户可随时中断对话。验证失败、截图中断时都会检查 `abortSignal.aborted` 并提前退出。

### OpenAI 兼容适配

`createOpenAiCompatibleFetch` 包装原生 `fetch`，将 AI SDK 5 可能发出的 `developer` 角色自动转为 `system`，兼容 DeepSeek 等 OpenAI 兼容 API。

---

## 视觉验证循环

### 截图捕获（drawingPreviewCapture.ts）

1. `waitForDrawingSceneReady()` — 等待 `AcTrView2d` 空闲 + `accmYieldForPaint()` 让出渲染帧。
2. `getModelSpaceEntityIds()` — 遍历模型空间块表获取全部实体 ObjectId。
3. `AcApEntityPreviewConvertor.capture(entityIds, 1024)` — 渲染为 PNG data URL。

若场景未就绪，返回 `{ ok: false, reason: 'scene-not-ready' }`，跳过本次验证。

### 验证调用（drawingVerifier.ts）

使用 `generateObject` 进行结构化输出，Zod schema：

```typescript
{
  passed: boolean    // 绘图是否通过验证
  feedback: string   // 未通过时的具体问题与修复建议
}
```

验证系统提示词要求 LLM：

- 关注整体几何、拓扑、比例、布局，而非像素对齐。
- 忽略尺寸标注、尺寸线、尺寸文字。
- 忽略缺失的注释/标签（除非用户明确要求绘制文本）。
- 当图形合理地表达了请求的形状和布局时通过。
- 仅当重要几何缺失、错误或明显错位时失败。

### 反馈消息构造

验证失败时，`buildVerificationFeedbackMessage` 生成后续用户消息：

```
Drawing verification failed (attempt N/5).
<feedback>
Please update the drawing to address these issues.
```

Agent 收到该消息后继续调用工具修改图形，进入下一轮验证。

### 验证结果展示

验证过程中通过 `appendVerificationReview` 将以下内容注入聊天流：

- 标题（"Drawing Verification"）+ 尝试次数
- 状态文字（"Verifying..." / "Skipped: scene-not-ready" / "Passed"）
- 用户参考图（如有）
- 当前绘图截图

---

## 系统提示词

`systemPrompt.ts` 导出 `CAD_AGENT_SYSTEM_PROMPT`（约 400 行），定义 Agent 的行为规范。核心章节：

| 章节                          | 内容                                                 |
| ----------------------------- | ---------------------------------------------------- |
| GENERAL PRINCIPLES            | 像专业 CAD 工程师思考；几何正确性优先于外观          |
| OVERALL WORKFLOW              | 理解 → 分析 → 规划 → 绘图 → 验证 → 修正 → 总结    |
| STEP 1 — UNDERSTAND           | 读取图框/标题栏，判断图纸类型                        |
| STEP 2 — IDENTIFY VIEWS       | 识别所有投影视图（主视、俯视、剖面等）              |
| VISION UNDERSTANDING STRATEGY | 12 步视觉理解策略（读标题栏 → 识别投影 → 对称检测…）|
| STEP 3 — PLAN                 | 将视图分解为 CAD 基元，按外轮廓→内形→孔→倒角顺序   |
| STEP 4 — TOOL USAGE           | 先调用 `get_drawing_context`，复用已有图层           |
| IMAGE INTERPRETATION          | 处理低质量/遮挡/噪声参考图                           |
| DIMENSIONS / TEXT             | 忽略尺寸标注和文字，除非用户明确要求                 |
| DRAWING EXECUTION STRATEGY    | 复杂图纸增量绘制，逐视图完成                         |
| HIGH REASONING MODE           | 截图验证 → 比较 → 修改 → 再验证循环                  |
| SELF-CHECK                    | 完成前 12 项自检清单                                |
| ENTITY MANAGEMENT             | 跟踪 entityIds，用 `delete_entities` 删除错误图形    |
| ERROR HANDLING                | 读取 `success=false` 的 error 字段，修正参数重试     |
| DRAWING PRIORITY              | 拓扑 > 连接性 > 相对位置 > 形状 > 比例 > 细节       |

---

## CAD 工具集

`cadTools.ts` 定义 17 个 AI SDK tool，每个 tool 使用 Zod 校验输入，委托给 `cadActionExecutor`。

### 工具列表

| 工具名                | 描述                             | 关键参数                                              |
| --------------------- | -------------------------------- | ----------------------------------------------------- |
| `get_drawing_context` | 获取当前绘图上下文               | 无                                                    |
| `draw_line`           | 绘制直线段                       | `start`, `end`                                        |
| `draw_circle`         | 绘制圆                           | `center`, `radius`                                    |
| `draw_arc`            | 绘制圆弧（角度制）               | `center`, `radius`, `startAngleDeg`, `endAngleDeg`    |
| `draw_rectangle`      | 绘制矩形（对角点）               | `corner1`, `corner2`                                  |
| `draw_polyline`       | 绘制多段线                       | `points` (≥2), `closed`                               |
| `draw_ellipse`        | 绘制椭圆/椭圆弧                  | `center`, `majorRadius`, `minorRadius`, `rotationDeg` |
| `draw_hatch`          | 绘制填充图案                     | `boundary` (≥3), `patternName`, `patternScale`        |
| `draw_point`          | 绘制点                           | `position`                                            |
| `draw_ray`            | 绘制射线（半无限线）             | `start`, `through`                                    |
| `draw_xline`          | 绘制构造线（双向无限线）         | `start`, `through`                                    |
| `draw_spline`         | 绘制样条曲线                     | `points` (≥2), `closed`                               |
| `draw_text`           | 绘制单行 MTEXT                   | `position`, `text`, `height`                          |
| `set_current_layer`   | 设置当前图层 (CLAYER)            | `layerName`                                           |
| `create_layer`        | 创建新图层（已存在则跳过）       | `layerName`                                           |
| `delete_entities`     | 删除实体（验证失败后用于修正）   | `entityIds`                                           |
| `zoom_extents`        | 缩放到全图范围                   | 无                                                    |

所有几何工具均支持可选的 `layer` 参数，指定实体所在图层。

### 返回值结构（ToolResult）

```typescript
{
  success: boolean       // 操作是否成功
  message: string        // 人类可读摘要（返回给 LLM）
  entityIds?: string[]   // 创建的实体 ObjectId 列表
  error?: string         // 失败时的错误码/消息
}
```

---

## 绘图执行器

`CadActionExecutor` 是单例类，所有 CAD 操作的实际执行者。

### 核心机制

- **文档访问守卫**：每个操作入口调用 `requireDocument(requireWrite)` / `requireView()` 检查文档和视图可用性。
- **图层校验**：`validateLayer(layer)` 在创建实体前检查图层是否存在，避免在无效图层上绘图。
- **可撤销事务**：`runEdit(label, fn)` 通过 `acapRunDatabaseEdit` 将数据库变更包装为可撤销的编辑事务，支持 Undo/Redo。
- **模型空间写入**：所有几何实体通过 `db.tables.blockTable.modelSpace.appendEntity()` 添加到模型空间。
- **2D → 3D 映射**：工具接收 `{ x, y }` 坐标，通过 `toPoint3d(point, z=0)` 转为 WCS 3D 点（Z 固定为 0）。

### 特殊处理

| 实体类型 | 实现细节                                                    |
| -------- | ----------------------------------------------------------- |
| 矩形     | 4 个顶点的闭合 `AcDbPolyline`                               |
| 射线     | `resolveUnitDirection` 计算单位方向向量，重合点返回错误     |
| 构造线   | 同射线的方向计算，双向无限                                  |
| 椭圆     | 旋转角度计算主轴方向（`majorAxis`），支持椭圆弧             |
| 填充     | `AcDbHatch` + `AcGeLoop2d` 构建闭合边界，支持 `SOLID` 和预定义图案 |
| 样条     | `AcDbSpline` Chord 参数化，degree 自适应 `min(3, n-1)`      |

---

## 绘图上下文

`DrawingContextProvider.ts` 提供 `getDrawingContext()` 函数，返回当前文档的快照：

```typescript
{
  currentLayer: string      // 当前图层名 (CLAYER)
  layers: string[]          // 文档中所有图层名
  insunits: number          // 绘图单位代码 (INSUNITS)
  extents: {
    min: { x, y, z }       // 数据库范围最小点
    max: { x, y, z }       // 数据库范围最大点
    isEmpty: boolean        // 范围是否为空（无实体）
  }
  documentTitle: string     // 文档标题
}
```

Agent 在绘图前必须先调用 `get_drawing_context` 以了解单位和可用图层。

---

## 文档访问控制

`documentAccess.ts` 提供两个守卫函数：

| 函数                              | 用途                                                            | 失败错误码        |
| --------------------------------- | --------------------------------------------------------------- | ----------------- |
| `requireDocument(requireWrite)`   | 检查是否有打开的文档；`requireWrite=true` 时还检查是否只读      | `no_document` / `read_only` |
| `requireView()`                   | 检查视图是否可用                                                | `no_view`         |

---

## API Key 安全存储

`apiKeyCrypto.ts` 使用 Web Crypto API 对 API Key 进行加密后存入 `localStorage`。

### 加密流程

```
原始 API Key
  ↓
TextEncoder.encode → 字节
  ↓
AES-GCM 加密
  密钥：PBKDF2(SHA-256, 100k 次, salt="cad-agent-plugin-api-key-v1")
  密码来源：`${location.origin}:cad-agent-plugin-api-key-v1`
  IV：12 字节随机数
  ↓
拼接 IV + 密文 → Base64 编码
  ↓
前缀 "enc:v1:" → 存入 localStorage (apiKeyEnc 字段)
```

### 解密流程

1. 检查前缀 `enc:v1:`。无前缀时视为旧版明文，直接返回（向后兼容迁移）。
2. Base64 解码 → 拆分 IV（前 12 字节）+ 密文。
3. AES-GCM 解密 → TextDecoder → 明文字符串。
4. 解密失败返回空字符串。

### 安全特性

- **Origin 绑定**：密钥绑定页面 origin，不同域名无法互相解密。
- **随机 IV**：每次加密使用随机 IV，相同 Key 存储结果不同。
- **无缝迁移**：支持明文 → 密文的自动迁移（保存时加密旧版明文 Key）。
- **版本前缀**：`enc:v1:` 预留未来加密方案升级空间。

### 存储结构

`localStorage` 中的 key 为 `cad-agent-plugin.llm-settings`，JSON 格式：

```json
{
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-v4-flash",
  "apiKeyEnc": "enc:v1:..."
}
```

---

## 国际化

### 支持语言

| 语言     | 文件     | Locale ID |
| -------- | -------- | --------- |
| 英文     | `en.ts`  | `en`      |
| 中文     | `zh.ts`  | `zh`      |
| 捷克语   | `cs.ts`  | `cs`      |
| 土耳其语 | `tr.ts`  | `tr`      |

### 注册机制

1. `registerAgentI18n()` 在插件注册时调用，将四语言字符串通过 `AcApI18n.mergeLocaleMessage()` 注入到 `main.toolPalette.agent` 命名空间。
2. 使用 `isRegistered` 标志防止重复注册。
3. `mergeAgentI18nIntoVueI18n()` 供宿主应用（cad-viewer）将字符串合并到自己的 vue-i18n 实例。

### 响应式翻译

`useAgentI18n()` 组合式函数返回 `labels` 计算属性和 `t()` 翻译函数：

- 监听 `AcApI18n.events.localeChanged` 事件。
- 语言切换时自动失效 `localeVersion` ref，触发 `computed` 重新计算所有标签。
- 组件卸载时移除监听器。

### 类型安全

`AgentChatLabelKey` 类型从 `agentEn` 的键推断，确保所有语言的 key 完全一致（编译期检查）。新增字符串只需在 `en.ts` 中添加，其余语言文件必须同步。

---

## UI 面板

`AgentChatPanel.vue` 是主聊天界面组件。

### Props

| Prop       | 类型      | 默认值 | 说明                           |
| ---------- | --------- | ------ | ------------------------------ |
| `embedded` | `boolean` | `false`| `true` 时嵌入工具调色板标签页 |
| `visible`  | `boolean` | `true` | 覆盖模式下是否显示             |

### Emits

| 事件    | 说明                         |
| ------- | ---------------------------- |
| `close` | 用户点击关闭按钮（覆盖模式） |

### 主要区域

1. **标题栏**：显示标题 + 设置按钮 + 清空按钮。
2. **设置区域**（`showSettings` 控制显隐）：
   - Provider 下拉选择
   - Base URL 输入框
   - Model 下拉选择（分视觉模型/纯文本模型两个 `optgroup`）
   - 自定义模型名输入框（选择 "Custom model…" 时出现）
   - API Key 输入框（密码类型）
   - Agent Mode 切换（simple / high-inference）
   - 保存按钮
3. **消息列表**：渲染 UIMessage 历史，支持文本/图片/工具调用/文件附件展示。
4. **输入区域**：文本输入 + 图片附件按钮 + 发送按钮。
5. **图片预览**：待发送图片的缩略图条，支持单张移除。

### 状态管理

| Ref                  | 类型                 | 说明                          |
| -------------------- | -------------------- | ----------------------------- |
| `settings`           | `LlmSettings`        | 当前编辑中的设置              |
| `activeSettings`     | `LlmSettings`        | 当前会话实际使用的设置        |
| `modelSelection`     | `string`             | 模型下拉选中值                |
| `pendingImages`      | `File[]`             | 待发送的图片文件              |
| `pendingPreviewUrls` | `string[]`           | 图片预览 URL（Object URL）    |
| `agentMode`          | `AgentMode`          | 运行模式                      |
| `chat`               | `ShallowRef<Chat>`   | AI SDK Vue Chat 实例          |
| `showSettings`       | `boolean`            | 是否展示设置区域              |

### 设置保存流程

1. 比较 `settings` 和 `activeSettings`（`areLlmSettingsEqual`）。
2. 若有变化，调用 `saveLlmSettings(settings)` 持久化。
3. 更新 `activeSettings`。
4. 调用 `resetChat()` 重新创建 Chat 会话（新 Agent + 新传输层）。

### 图片附件处理

- 用户选择图片后生成 `URL.createObjectURL()` 预览。
- 发送时通过 `chat.appendFiles()` 将图片作为 `file` 部件附加到用户消息。
- 组件卸载时通过 `URL.revokeObjectURL()` 释放内存。

---

## 错误处理

`formatChatError.ts` 将 AI SDK 或网络层抛出的错误转换为用户可读消息：

1. **APICallError**：优先从 response body 中提取 `error.message` / `detail` / `error` 字段。
2. 回退到 `statusCode` + 缩短后的 URL（去掉协议和查询参数）。
3. 尝试解析 `error.message` 中嵌入的 JSON 字符串。
4. 最终回退到 `error.name` / `error.cause` / `String(error)`。

---

## 数据流概览

### 启动流程

```
App 启动
  ↓
registerLazyAgentPlugin(pluginManager)
  ├── registerAgentI18n()         // 注入四语言字符串
  └── pluginManager.registerLazyPlugin({
        name: 'AgentPlugin',
        triggers: ['agent'],
        loader: () => import('./createAgentPlugin')
      })
```

### 用户打开 Agent 面板

```
用户输入 "agent" 命令
  ↓
AcApAgentCmd.execute()
  ↓
openAgentPalette()
  ↓
AgentChatPanel.vue 挂载
  ↓
onMounted:
  ├── loadLlmSettings()         → 填充 settings ref
  ├── loadAgentMode()           → 填充 agentMode ref
  └── (迁移：若旧 provider=deepseek-vl → 迁移为 deepseek)
```

### 用户发送消息

```
用户输入文本 + 可选图片 → 点击发送
  ↓
chat.appendFiles(pendingImages) 或 chat.appendMessage(...)
  ↓
Chat transport 触发
  ↓
createAgentChatTransport.sendMessages()
  ↓
validateUIMessages()
  ↓
[high-inference]
  ↓
Agent.stream({ messages })
  ├── LLM 推理
  ├── 调用 CAD tools
  ├── 工具执行 → CadActionExecutor → 写入模型空间
  └── 流式返回 UIMessage chunks
  ↓
captureDrawingPreview() → PNG data URL
  ↓
verifyDrawing(settings, userRequest, referenceImages, screenshot)
  ↓
generateObject(Zod schema) → { passed, feedback }
  ↓
passed=true  → 显示 "验证通过" → 结束
passed=false → 显示反馈 → 追加用户消息 → 下一轮循环
```

### 设置保存

```
用户修改设置 → 点击保存
  ↓
areLlmSettingsEqual(settings, activeSettings)?
  ├── 相同 → 无操作
  └── 不同 → saveLlmSettings(settings)
              ↓
              encryptApiKey(apiKey)
              ↓
              localStorage.setItem('...', JSON)
              ↓
              activeSettings = settings
              ↓
              resetChat() → 重建 Chat 实例
```

---

## 关键文件索引

| 文件                               | 职责                                    |
| ---------------------------------- | --------------------------------------- |
| `agent/createCadAgent.ts`          | Agent 构建 + 传输层 + 验证循环          |
| `agent/systemPrompt.ts`            | 系统提示词（Agent 行为规范）            |
| `agent/createModel.ts`             | Provider → LanguageModel 映射           |
| `agent/drawingVerifier.ts`         | 截图验证（generateObject + Zod）        |
| `agent/drawingPreviewCapture.ts`   | 绘图截图捕获                            |
| `agent/openAiCompatibleFetch.ts`   | fetch 包装（developer→system 角色转换） |
| `agent/conversationContext.ts`     | 提取用户请求文本和参考图                |
| `agent/uiMessageStreamHelpers.ts`  | 流式写入辅助函数                        |
| `tools/cadTools.ts`                | 17 个 AI SDK tool 定义                  |
| `tools/CadActionExecutor.ts`       | 几何实体创建/删除实现                   |
| `tools/DrawingContextProvider.ts`  | 图层/单位/范围快照                      |
| `tools/documentAccess.ts`          | 文档/视图可用性守卫                     |
| `storage/LlmSettingsStore.ts`      | LLM 设置持久化 + 废弃 Provider 迁移     |
| `storage/modelCatalog.ts`          | 预设模型列表 + 视觉模型启发式匹配       |
| `storage/apiKeyCrypto.ts`          | AES-GCM API Key 加密/解密              |
| `storage/AgentModeStore.ts`        | Agent 模式持久化                        |
| `storage/settingsEquality.ts`      | 设置浅比较                              |
| `ui/AgentChatPanel.vue`            | 主 UI 组件                              |
| `ui/useAgentChat.ts`               | Chat 会话生命周期管理                   |
| `ui/formatChatError.ts`            | 错误消息格式化                          |
| `i18n/index.ts`                    | 国际化注册 + 翻译函数                   |
| `i18n/useAgentI18n.ts`             | 响应式标签（监听 localeChanged）        |
| `palette/agentPaletteIntegration.ts` | 调色板开关注册（宿主注入回调）        |
| `command/AcApAgentCmd.ts`          | agent 命令实现                          |
| `AcApAgentPlugin.ts`               | 插件类（onLoad/onUnload）               |
| `register.ts`                      | 懒加载注册入口                          |

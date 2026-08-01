# Pi Coding Agent SDK 调研与 0.83.0 升级说明

> 范围：为 oneShare 的连续代码生成与“渲染失败自动修复（最多两次）”重构提供依据。本文只记录已核实的 Pi SDK 能力与迁移结论，不直接修改运行时依赖。
>
> 调研日期：2026-08-01。

## 版本基线

- 升级前项目锁定 `0.80.6`；现已在 [agent-runtime/package.json](../agent-runtime/package.json) 与 lockfile 中同步升级为 `0.83.0`。已通过 npm registry 核实两个包均存在该版本；运行环境要求仍为 Node `>=22.19.0`。
- 本文的行为结论以 `0.83.0` 发布包的 `.d.ts`、`CHANGELOG.md` 和官方 `v0.83.0` 文档为准。不要用 `main` 分支文档替代，因为其 SDK 已继续演进。

## 结论摘要

1. `AgentSession` 已经是可持续多轮会话的 Module：它持有完整消息历史、模型状态、流事件、队列与取消能力。一次代码生成完成后，自动修复应向**同一个** `AgentSession.prompt()` 发送修复指令，而不是重建 session 后从前端截断历史回放。
2. 现有运行时每个 HTTP 请求都创建 `SessionManager.inMemory()`、种子化历史，并在请求结束时 `dispose()` session。因此它当前只有“逻辑连续会话”，没有真正持续的 Pi 会话；自动修复和后续手动修复无法受益于 Pi 保留的思考块、工具结果和完整上下文。
3. `0.83.0` 的唯一阻塞性升级是模型/认证层：SDK 的 `AuthStorage` 不再从包根导出，`CreateAgentSessionOptions` 与 `createAgentSessionServices()` 不再接收 `authStorage`、`modelRegistry`，改为异步 `ModelRuntime`。现有 [pi-provider.ts](../agent-runtime/src/pi-provider.ts) 必须改写后才可编译。
4. Pi 自带 `auto_retry_*` 只覆盖 agent/provider 层的传输或运行重试；“生成的代码能否在 oneShare 渲染器运行”是业务语义，必须由 oneShare 的恢复 Module 负责，不能把两类重试混为一个计数器。
5. `/v1/models` 仍应由现有 `ModelCatalog` 作为产品事实来源。0.83.0 虽增加动态 Provider catalog，但若用它替换现有目录会引入 `models-store.json` 持久化和第二套刷新策略，反而扩大 Interface；应只用其承载当前 catalog snapshot。

## 已核实的 SDK 能力

### 1. 持久会话与队列

`createAgentSession()` 创建的 `AgentSession` 负责历史、流、压缩和模型状态。`SessionManager.create/open/continueRecent` 保存 JSONL 会话；`SessionManager.inMemory()` 用于无文件会话与测试。会话运行中：

- `session.prompt(text)` 启动一个 agent run；空闲时再次调用它就是同一 Pi 会话的下一轮。
- 运行中使用 `session.steer(text)` 让下一轮尽快接受新指令，使用 `session.followUp(text)` 等当前 agent 停止后再执行；直接无选项调用 `prompt()` 会报错。
- `session.messages` 与 `session.agent.state.messages` 是已保留的完整上下文。重新创建 in-memory session 并手工种子化字符串，会丢失 `ThinkingContent`、工具调用和其他结构化消息。
- session 文件支持树、分支和压缩；本产品不需要把这些 CLI 功能暴露到前端，但它们证明 session 的自然粒度是“用户工作会话”，不是单个 HTTP 请求。

来源：[SDK 文档（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/docs/sdk.md)、[会话文档（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/docs/sessions.md)、发布包 `dist/core/agent-session.d.ts` 与 `dist/core/session-manager.d.ts`。

### 2. 流事件与“思考”展示

`session.subscribe()` 返回解除订阅函数。`AgentSessionEvent` 至少包含：

- `message_update`：其 `assistantMessageEvent` 具有 `thinking_delta`、`text_delta` 等增量事件；这正是当前 SSE `thinking` / `delta` 的正确来源。
- `message_start`、`message_end`：`message_end` 取得最终 `AssistantMessage` 与 usage、`stopReason`。
- `agent_start`、`agent_end`、`agent_settled`：后者表示 agent run、自动重试、自动压缩和已排队延续都已稳定，适合作为服务端的最终收尾信号。
- `auto_retry_start`、`auto_retry_end`：provider/agent 重试的可观察状态。
- 工具事件 `tool_execution_start/update/end`：若以后开放受限的校验工具，可映射为稳定的 UI 状态，不必猜测模型文本。

Pi AI 的 `ThinkingContent` 有 `thinkingSignature`，部分 Provider 需要其不透明签名维持多轮连续性。因此真实持续 session 是比“把思考文本拼入 prompt”更可靠的做法。

来源：[SDK events（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/docs/sdk.md#events)、[Pi AI types（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/ai/src/types.ts)、发布包 `dist/core/agent-session.d.ts`、`@earendil-works/pi-ai/dist/types.d.ts`。

### 3. 取消

`await session.abort()` 会取消当前 agent operation 和内部 retry，然后等待 `session.waitForIdle()`；它不是仅停止浏览器读取 SSE。Pi AI 的 `StreamOptions` 同样接受 `AbortSignal`，Provider 请求可以在网络层取消。

运行时应保留一条取消链：浏览器停止按钮 -> HTTP/SSE disconnect 或显式 cancel -> 本次 run 的 `AbortController` -> `session.abort()`。取消后：

- 不发送 `failed`，而发送可区分的 `aborted` 终态或直接关闭 SSE；前端将其作为正常停止。
- 不在 `finally` 里再次用未 await 的取消覆盖正常完成状态。
- 用 `runId` 防止已被取消 run 的迟到事件写入随后启动的 run。

来源：发布包 `dist/core/agent-session.d.ts`、`dist/core/agent-session.js`（`abort()` 调用 `abortRetry()`、`agent.abort()`、`waitForIdle()`）；[Pi AI StreamOptions（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/ai/src/types.ts)。

### 4. Provider、目录与认证

Pi AI 的 `Models` / `Provider` 是实际的 Provider Module：Provider 持有模型、认证和流实现。`0.83.0` 允许 Provider 实现 `refreshModels(context)`，其刷新支持 `AbortSignal`，并可用模型存储缓存动态目录。

然而 oneShare 已有明确的上游目录约定：`GET {PI_PROVIDER_BASE_URL}/models`，并且要向前端公开 `defaultModel` 与 catalog 版本。保留 `ModelCatalog` 有更好的 Locality：认证、TTL、默认模型校验和 API 输出只在一个 Module 内，而不是让 Pi 的持久 catalog 与业务目录相互竞争。

推荐连接方式：每个 catalog version 构造或缓存一个无磁盘的 `ModelRuntime`，注册一个 OpenAI-compatible Provider，模型列表由 `ModelCatalogSnapshot` 提供。已有 session 固定使用创建时的 runtime；新 catalog 只影响后续新 session。这样不会让模型选择器在一次修复 run 中途改变模型定义。

来源：[Provider 文档（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/docs/custom-provider.md)、[Pi AI Models interface（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/ai/src/models.ts)、发布包 `dist/core/model-runtime.d.ts`、`dist/core/provider-composer.d.ts`。

### 5. Extension 与请求钩子

Pi extension 能注册 Provider、工具和生命周期事件；`StreamOptions` 提供 `signal`、`onPayload`、`onResponse`、headers、timeout 和 retry 选项。它们适合 Provider 协议兼容、请求观测或未来受控工具，但不适合承载 oneShare 的渲染恢复策略：扩展跟随 Pi 生命周期，不知道浏览器 preview 是否成功，也不应访问前端状态。

结论：本次不新增 Pi extension。渲染校验保持在 oneShare 的 `RenderAdapter`，并把结构化失败交给会话编排 Module。

来源：[Extension 文档（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/docs/extensions.md)、[Pi AI StreamOptions（v0.83.0）](https://github.com/earendil-works/pi/blob/v0.83.0/packages/ai/src/types.ts)。

## 0.80.6 -> 0.83.0：本项目的迁移清单

| 现状 | 0.83.0 变化 | 必须采取的修改 |
| --- | --- | --- |
| `AuthStorage.inMemory()` | `AuthStorage` 不再从 coding-agent 根入口导出 | 移除该 import；使用 `ModelRuntime`，必要时从 `pi-ai` 注入 `InMemoryCredentialStore`。 |
| `ModelRegistry.inMemory(authStorage)`、`registry.registerProvider()` | `ModelRegistry` 变为同步兼容 facade；canonical Module 是异步 `ModelRuntime` | 在 [pi-provider.ts](../agent-runtime/src/pi-provider.ts) 新建 `await ModelRuntime.create({ credentials, modelsPath: null, allowModelNetwork: false })`，改用 `modelRuntime.registerProvider()`、`getModel()`、`setRuntimeApiKey()`。 |
| `createAgentSessionServices({ authStorage, modelRegistry, ... })` | 两参数被 `modelRuntime` 替代 | 改为 `createAgentSessionServices({ modelRuntime, ... })`。 |
| `createAgentSessionFromServices()` | 仍可用，`noTools: 'all'`、in-memory `SessionManager` 均保留 | 保持这层调用，只改 services 的构造与 model 查找。 |
| `streamOpenAICompletions` Provider adapter | `@earendil-works/pi-ai/api/openai-completions` 导出仍存在 | 可继续作为自定义 Provider 的 `streamSimple`，并保留 timeout / maxRetries / temperature 注入。 |
| 现有 `ModelCatalog` 请求 `/v1/models` | 0.83.0 增加 Provider 动态 catalog 与 `models-store.json` | 不迁移到 Pi catalog；`ModelCatalog` 继续作为前端模型选择器的唯一目录来源。 |

`0.83.0` changelog 明确说明：`authStorage` / `modelRegistry` SDK options 被异步 `modelRuntime` 替换；`ModelRuntime.getAuth(model)` 负责将认证与模型 headers 组合；动态目录的 canonical refresh 是 `ModelRuntime.refresh()` / `Models.refresh()`。这不是可选重构，而是此项目编译通过升级的前提。

来源：[0.83.0 Changelog](https://github.com/earendil-works/pi/blob/v0.83.0/packages/coding-agent/CHANGELOG.md)（“Unified model runtime and provider authentication”）、发布包 `CHANGELOG.md` 第 217-241 行。

## 为自愈流程采用的 Module 设计

### 外部 Interface

不要让 React 组件、SSE 路由或渲染器各自决定何时重试。新增客户端 `CodeRunModule`，调用方只消费单一事件流；服务端的 `PiConversationModule` 只负责真实 Pi 会话的生命周期与流转发：

```ts
type CodeRunEvent =
  | { type: 'thinking'; runId: string; text: string }
  | { type: 'code_delta'; runId: string; text: string }
  | { type: 'rendering'; runId: string }
  | { type: 'repairing'; runId: string; attempt: 1 | 2; failure: RenderFailure }
  | { type: 'ready'; runId: string; code: string }
  | { type: 'exhausted'; runId: string; attempts: 2; failure: RenderFailure }
  | { type: 'aborted'; runId: string }
  | { type: 'failed'; runId: string; failure: RunFailure };

interface CodeRunModule {
  execute(input: CodeRunInput, signal: AbortSignal): AsyncIterable<CodeRunEvent>;
}
```

这是一个深 Module：调用方不用理解 Pi session、目录刷新、代码收集、渲染失败分类、两次上限、取消和过期事件抑制。删除它后这些复杂性会回到聊天、preview 和 HTTP 层，说明它具备真实的 Depth 与 Locality。

### 内部 Seam

只保留两个会变化的 Adapter：

- `PiConversationAdapter`：`open(sessionId, model)` 返回或创建真实 `AgentSession`；它负责转发 Pi events、调用 `prompt()` 和 `abort()`。session 以应用会话 ID 为键，**每会话串行**，闲置 TTL 后 `dispose()`。自动修复与用户手动修复都取得同一个 session。
- `RenderAdapter`：执行当前 HTML/TSX 预览验证，返回值为 `RenderOutcome`，而不是吞错、直接写 React state。

```ts
type RenderOutcome =
  | { ok: true }
  | { ok: false; failure: { kind: 'source' | 'dependency' | 'runtime' | 'infrastructure'; message: string; diagnostic?: string } };
```

只有 `source`、`dependency`、`runtime` 允许消耗自动修复次数。网络、编译服务不可用、认证失败、用户取消均是 `infrastructure` 或 `aborted`，绝不请求模型“修复”。

### 正确的 Pi 调用顺序

1. 以用户 session ID 取得 `AgentSession`，订阅 `thinking_delta` / `text_delta`；为本次请求建立 `runId`。
2. 调用 `session.prompt(userPrompt)`；只在代码缓冲完成并且 session 已稳定后进入 `RenderAdapter`。Pi 内部 `auto_retry_*` 只作为观测事件透传。
3. 渲染失败且 `attempt < 2` 时，构造一条内部修复 prompt：包含当前完整代码、语言和**结构化且有长度上限**的诊断。再次调用同一 session 的 `prompt(repairPrompt)`。
4. 成功发 `ready`；第二次修复后仍失败发 `exhausted`，保留最后代码和诊断，允许用户继续发送下一轮手动修复。
5. 任一时刻 signal abort：标记该 `runId` 不再接受事件，`await session.abort()`，发 `aborted`，不启动 repair。

自动修复消息可记录在 Pi session，但前端消息应标记为 `internal`，只显示“正在自动修复 1/2”，不伪造用户输入。

## 升级后验证

### 编译与协议

1. 升级两个 Pi 包到严格的 `0.83.0`，更新 lockfile；执行 `npm --prefix agent-runtime run type-check` 与 `npm --prefix agent-runtime run build`。
2. 对 `GET /v1/models`（上游）和 `GET /api/ai/models`（本应用）做契约测试：认证 header、默认模型校验、排序、缓存过期回退均保持不变。
3. 以模拟 Provider 验证 `thinking_delta`、`text_delta`、最终 usage、Provider abort 被正确映射到 SSE。

### 自愈 Module

用 fake `PiConversationAdapter` 与 fake `RenderAdapter` 从公开 `CodeRunModule.execute()` 测试，不穿透其内部实现：

- 首次代码失败、第一次自动修复成功：刚好发生两次 Pi prompt，最终 `ready`。
- 连续三次可修复渲染失败：只发生初始生成加两次修复，最终 `exhausted`。
- `infrastructure` 失败：零次自动修复。
- 在初始生成、渲染、修复阶段取消：`session.abort()` 一次、没有下一次 prompt、没有 `failed`。
- 同一 session 自动修复后用户继续修复：第二轮可读取前一轮真实 Pi message history。
- 新 `runId` 启动后旧 run 的迟到 `thinking_delta` / `text_delta` 被丢弃。

### 浏览器集成

- 思考阶段不出现代码悬浮框或“正在生成代码”。
- 自动修复阶段只显示稳定的 `正在自动修复 1/2`，停止按钮一直可用。
- 修复成功后预览更新；耗尽后显示最终诊断，并且仍可继续对话。

## 不做的事

- 不把浏览器 `AbortController` 当作唯一取消机制；它无法保证 Pi session 与 provider 请求停止。
- 不把渲染错误写到 `useCodeRenderer` 的 `catch` 中再直接发模型请求；那会让 UI hook 同时拥有渲染、会话和重试策略。
- 不使用 Pi extension 承担 preview 自愈；它缺少 oneShare 的渲染结果语义。
- 不开启 session 文件持久化作为第一步。先用有 TTL 的进程内 `SessionStore` 获得真实连续会话；若未来需要跨 runtime 重启恢复，再以 `SessionManager.create/open` 作为 `PiConversationAdapter` 的替换实现，外部 Interface 不变。

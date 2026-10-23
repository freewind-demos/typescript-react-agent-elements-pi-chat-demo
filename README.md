## 简介

用 React 19 + Agent Elements 做一个 AI 聊天页面，后端用 ts-rest 驱动本机的 `pi` agent。页面上可以直接选模型、选 thinking 等级、换皮肤、贴图片、发消息，agent 用它自己的全部工具（bash、edit、write、read、grep、find、ls 以及已装的扩展与 MCP）在 `playground/` 里干活。

整个页面只有一个对外组件 `PiChatPage`，设置、换肤、对话全在这一个页面里，不是一堆散装组件的拼装示例。

## 快速开始

### 环境要求

- Node 22+
- pnpm
- 本机已安装并登录 `pi`（`pi --version` 能跑通），且至少配置了一个模型

### 运行

```bash
# 装依赖
pnpm install

# 终端一：后端（ts-rest + pi 子进程），默认 8787
pnpm start

# 终端二：前端（Vite），默认 5173
pnpm dev
```

浏览器打开 Vite 打印的地址即可。类型检查用 `pnpm typecheck`。

## 注意事项

- agent 的工作目录是 `playground/`，不是项目根。它的 bash 与 edit 只会动这里，不会改 demo 源码。该目录已在 `.gitignore` 里。
- 会话文件落在 `playground/.pi-sessions/`，重启后仍能接着上一轮上下文；页面刷新会通过接口把历史文本拉回来。
- 图片以 base64 走 HTTP，单张限制 5MB，只接受图片类型。
- agent 加载的是你本机的 `pi` 配置：`~/.pi` 下的模型、扩展、MCP、`SYSTEM.md` 全部照旧生效。所以它输出的风格取决于你自己的配置，demo 不改它。
- pi 的扩展交互请求（`extension_ui_request`）本 demo 按要求原样忽略，不做应答。如果某个扩展弹确认框，agent 会停在等待状态。
- 后端端口固定 8787（`PORT` 可覆盖），前端通过 Vite 的 `/api` 代理访问，不需要 CORS。

## 教程

### 1. 关键概念

三层结构，从上到下：

- 前端只认 `UIMessage[]` 与 `ChatStatus`。这是 Vercel AI SDK 的类型，Agent Elements 的组件就是按它写的。
- 中间层是 ts-rest：命令（读设置、改设置、发消息、中断）走 JSON 接口，契约在 `src/shared/contract.ts`，前后端共用一份。
- 底层是 `pi --mode rpc` 子进程：长驻进程，stdin 收 JSON 命令，stdout 吐 JSON 事件。

流式输出不走 ts-rest，走 SSE（`GET /api/pi/events`）。ts-rest 负责请求响应，SSE 负责增量事件，两者共用 `contract.ts` 里的事件类型。

### 2. demo 原理

发一条消息的完整链路：

1. 前端 `usePiChat.send()` 把用户消息塞进列表，`POST /api/pi/messages`。
2. 后端 `PiAgent.send()` 生成 `runId`，广播 `run_started`，再向 pi 发 `prompt` 命令。
3. pi 开始跑，边跑边在 stdout 上吐 `message_update` / `tool_execution_start` / `tool_execution_end` / `agent_settled`。
4. `PiRpc` 按 `\n` 切分记录，`response` 按 id 配给等待中的命令，其余当事件交给 `PiAgent.translate()`。
5. `translate()` 把 pi 事件翻成前端事件：文本增量、工具开始、工具结束、本轮结束。
6. 前端收到后更新 `UIMessage` 的 parts：文本累加，工具按 `toolCallId` 更新状态，最后 `run_end` 把状态切回 `ready`。

工具卡片能显示对，靠的是 part 的 `type` 与 `state` 两个字段。`type` 必须是 `tool-Bash`、`tool-Edit`、`tool-Write`、`tool-Grep`、`tool-Glob` 这类库认得的名字，`state` 必须是 `input-streaming`（运行中）或 `output-available`（已完成）。映射表在 `src/server/tool-part.ts`。

### 3. 关键代码解读

`src/server/pi-rpc.ts` 是最需要小心的一层。pi 的 stdout 是严格 JSONL，但不能用 Node 的 `readline`：它会把 `U+2028`、`U+2029` 也当换行，而这两个字符在 JSON 字符串里是合法的。所以这里自己攒 buffer，只按 `\n` 切。

命令与响应靠 `id` 关联，不是靠顺序：`send()` 给每条命令编号，超时抛错，进程退出时把等待中的命令全部失败掉，避免请求悬挂。

`src/server/pi-agent.ts` 里的 `ensure()` 做懒启动：第一次请求才 spawn 进程，并发请求共用一个 promise。`currentRunId` 记录当前这一轮，工具事件与文本增量都挂在它下面。

`src/server/tool-part.ts` 是 pi 工具名到库卡片名的映射。`bash` 映射成 `tool-Bash`，`edit` 成 `tool-Edit`，`write` 成 `tool-Write`，`grep` 成 `tool-Grep`，`find` 与 `ls` 成 `tool-Glob`，`tool_search` 成 `tool-WebSearch`，`mcp__` 开头的原样保留（库会识别成 MCP 工具），其余转大驼峰后落到通用卡片。

`src/components/pi-chat-page.tsx` 是唯一对外组件。它把 `AgentChat` 的 `slots.InputBar` 换成一个带工具栏的输入框：左边是模型下拉（带搜索）与 thinking 下拉，右边是皮肤下拉。图片用隐藏的 `input[type=file]` 选，粘贴也支持。

样式方面有一处必须知道：Agent Elements 的 registry 除了组件，还会装一份 `src/components/agent-elements/agent-ui.css`，并在 `src/index.css` 里自动加一行 `@import`。这份 CSS 是 `--an-*` 变量与 `@theme` 映射的来源，删掉它组件就会掉样式。换肤只改 `src/styles/themes.css` 里的变量值，不动组件 class。

10 套皮肤是 `neutral`、`zinc`、`slate`、`stone`、`gray`、`red`、`rose`、`orange`、`green`、`blue`。每套同时给 shadcn 变量（`--background`、`--primary` 等）与 Agent Elements 变量（`--an-background`、`--an-primary-color` 等）赋值，所以外壳与聊天组件会一起变色。切换只是把 `data-theme` 写到 `<html>` 上，并记进 `localStorage`。

全项目只有一处自定义样式：`#root { height: 100dvh }`。原因是 `AgentChat` 是 flex 布局，父容器没高度就会塌成 0。除此之外没有任何自定义 class 或装饰样式。

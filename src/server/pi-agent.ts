// 会话编排：管一个 pi 进程，读设置、改设置、发消息、取历史，并把 pi 事件翻成前端事件
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Settings, PiEvent, StoredMessage } from "../shared/contract";
import { PiRpc } from "./pi-rpc";
import { toPartType } from "./tool-part";

// agent 的工作目录：它的 bash/edit/write 只会动这里，不会碰 demo 源码
const PLAYGROUND = path.resolve(process.cwd(), "playground");
// 会话文件落盘位置，重启后还能接着上一轮上下文
const SESSION_DIR = path.join(PLAYGROUND, ".pi-sessions");

// pi 返回的模型对象里我们关心的字段
type RawModel = {
  id: string;
  name?: string;
  provider: string;
  reasoning?: boolean;
  input?: string[];
};

// 把 provider 与 modelId 拼成一个可还原的字符串，用第一个斜线切开
function joinModelId(provider: string, modelId: string) {
  return `${provider}/${modelId}`;
}

export class PiAgent extends EventEmitter {
  private readonly rpc: PiRpc;
  private starting: Promise<void> | null = null;
  private started = false;
  // 当前这次运行 id：SSE 事件都挂在它下面
  private currentRunId: string | null = null;

  constructor() {
    super();
    // 第一次用到时把目录建好，避免 pi 起不来
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    this.rpc = new PiRpc(
      process.env.PI_BIN ?? "pi",
      PLAYGROUND,
      SESSION_DIR,
    );
    // pi 的原始事件统一在这里翻译
    this.rpc.on("event", (event: Record<string, unknown>) =>
      this.translate(event),
    );
  }

  // 懒启动：真正的进程与首次 get_state 只做一次，并发调用共用同一个 promise
  private ensure(): Promise<void> {
    if (this.started) return Promise.resolve();
    if (!this.starting) {
      this.starting = (async () => {
        this.rpc.start();
        await this.rpc.send({ type: "get_state" });
        this.started = true;
      })().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  // pi 事件 → 前端事件；run_end 之后清掉 runId
  private translate(event: Record<string, unknown>) {
    const runId = this.currentRunId ?? "";
    const type = event.type;

    if (type === "message_update") {
      const inner = event.assistantMessageEvent as
        | { type?: string; delta?: string }
        | undefined;
      if (!inner) return;
      if (inner.type === "text_delta" && inner.delta) {
        this.emit("pi-event", {
          type: "text_delta",
          runId,
          text: inner.delta,
        } satisfies PiEvent);
      }
      if (inner.type === "thinking_delta" && inner.delta) {
        this.emit("pi-event", {
          type: "thinking_delta",
          runId,
          text: inner.delta,
        } satisfies PiEvent);
      }
      return;
    }

    // 工具开始执行：把参数原样带给前端，卡片自己决定怎么展示
    if (type === "tool_execution_start") {
      this.emit("pi-event", {
        type: "tool_start",
        runId,
        toolCallId: String(event.toolCallId),
        toolName: String(event.toolName),
        partType: toPartType(String(event.toolName)),
        input: event.args,
      } satisfies PiEvent);
      return;
    }

    // 工具执行结束：结果与是否出错
    if (type === "tool_execution_end") {
      this.emit("pi-event", {
        type: "tool_end",
        runId,
        toolCallId: String(event.toolCallId),
        toolName: String(event.toolName),
        partType: toPartType(String(event.toolName)),
        output: event.result,
        isError: Boolean(event.isError),
      } satisfies PiEvent);
      return;
    }

    // agent_settled 表示 pi 不会再自动继续，这一轮真正结束
    if (type === "agent_settled") {
      this.emit("pi-event", { type: "run_end", runId } satisfies PiEvent);
      this.currentRunId = null;
    }
  }

  // 读设置：模型清单 + 当前模型 + 当前模型的 thinking 等级
  async getSettings(): Promise<Settings> {
    await this.ensure();
    const [modelsData, stateData, levelsData] = await Promise.all([
      this.rpc.send({ type: "get_available_models" }),
      this.rpc.send({ type: "get_state" }),
      this.rpc.send({ type: "get_available_thinking_levels" }),
    ]);

    const models = ((modelsData as { models: RawModel[] }).models ?? []).map(
      (model) => ({
        id: joinModelId(model.provider, model.id),
        name: model.name ?? model.id,
        provider: model.provider,
        modelId: model.id,
        supportsImages: (model.input ?? []).includes("image"),
        supportsThinking: Boolean(model.reasoning),
      }),
    );

    const state = stateData as {
      model?: RawModel;
      thinkingLevel?: string;
    };

    return {
      models,
      currentModelId: state.model
        ? joinModelId(state.model.provider, state.model.id)
        : null,
      thinkingLevel: state.thinkingLevel ?? "off",
      thinkingLevels:
        (levelsData as { levels: string[] }).levels ?? ["off"],
    };
  }

  // 改设置：先切模型再设 thinking，最后回一份最新设置
  async updateSettings(input: {
    modelId?: string;
    thinkingLevel?: string;
  }): Promise<Settings> {
    await this.ensure();

    if (input.modelId) {
      // 用第一个斜线切分：provider 自身不含斜线，modelId 里可能含
      const slash = input.modelId.indexOf("/");
      if (slash <= 0) throw new Error(`模型 id 不合法：${input.modelId}`);
      await this.rpc.send({
        type: "set_model",
        provider: input.modelId.slice(0, slash),
        modelId: input.modelId.slice(slash + 1),
      });
    }

    if (input.thinkingLevel) {
      await this.rpc.send({
        type: "set_thinking_level",
        level: input.thinkingLevel,
      });
    }

    return this.getSettings();
  }

  // 发消息：先广播 run_started，再把 prompt 交给 pi，立即返回 runId
  async send(
    text: string,
    images?: { mimeType: string; data: string }[],
  ): Promise<string> {
    await this.ensure();
    const runId = randomUUID();
    this.currentRunId = runId;
    this.emit("pi-event", { type: "run_started", runId } satisfies PiEvent);

    await this.rpc.send({
      type: "prompt",
      message: text,
      ...(images?.length
        ? {
            images: images.map((image) => ({
              type: "image",
              data: image.data,
              mimeType: image.mimeType,
            })),
          }
        : {}),
    });

    return runId;
  }

  // 中断：pi 会等会话真正空闲后再回，所以给足超时
  async abort(): Promise<void> {
    await this.ensure();
    await this.rpc.send({ type: "abort" }, 120_000);
  }

  // 开新会话：上下文清空，前端也会清屏
  async newSession(): Promise<void> {
    await this.ensure();
    await this.rpc.send({ type: "new_session" });
  }

  // 读历史：只还原用户与助手的文本，工具调用历史不重放
  async getHistory(): Promise<StoredMessage[]> {
    await this.ensure();
    const data = await this.rpc.send({ type: "get_messages" });
    const messages = (data as { messages: unknown[] }).messages ?? [];

    return messages.flatMap((message, index) => {
      const item = message as {
        role?: string;
        content?: unknown;
        timestamp?: number;
      };
      if (item.role !== "user" && item.role !== "assistant") return [];

      const text = extractText(item.content);
      if (!text) return [];

      return [
        {
          id: `history-${index}`,
          role: item.role,
          text,
          createdAt: item.timestamp ?? Date.now(),
        },
      ];
    });
  }
}

// 从 pi 的消息内容里取纯文本：可能是字符串，也可能是内容块数组
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const item = block as { type?: string; text?: string };
      return item.type === "text" ? (item.text ?? "") : "";
    })
    .join("")
    .trim();
}

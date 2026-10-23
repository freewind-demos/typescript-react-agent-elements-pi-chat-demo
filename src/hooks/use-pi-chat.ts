// 对话状态：SSE 收事件、组装 UIMessage、发消息、中断、改设置
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus, UIMessage } from "ai";
import type { PiEvent, Settings } from "../shared/contract";
import { api } from "../lib/api";

// 输入框里待发送的一张图片：url 给预览用，data 是 base64 给 pi 用
export type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  data: string;
};

// parts 用宽松类型，避免为每个工具卡片写一套 TS 结构
type AnyPart = Record<string, unknown> & { type: string };
type LooseMessage = { id: string; role: "user" | "assistant"; parts: AnyPart[] };

export function usePiChat() {
  // 全部消息，直接喂给 AgentChat
  const [messages, setMessages] = useState<UIMessage[]>([]);
  // 请求状态，库用它决定发送按钮是停止还是发送
  const [status, setStatus] = useState<ChatStatus>("ready");
  // 当前设置：模型清单、当前模型、thinking 等级
  const [settings, setSettings] = useState<Settings | null>(null);
  // 出错时交给 AgentChat 渲染错误卡片
  const [error, setError] = useState<Error | null>(null);
  // 记住当前运行 id，停止与事件归组都靠它
  const runIdRef = useRef<string | null>(null);

  // 把一条事件合进消息列表：文本累加，工具卡片按 toolCallId 更新
  const applyEvent = useCallback((event: PiEvent) => {
    setMessages((prev) => {
      const list = prev as unknown as LooseMessage[];
      const last = list[list.length - 1];
      // 助手消息还没有就补一条，让后续增量有地方落
      const base: LooseMessage[] =
        last && last.role === "assistant"
          ? list
          : [...list, { id: crypto.randomUUID(), role: "assistant", parts: [] }];
      const assistant = base[base.length - 1];
      const parts = [...assistant.parts];

      if (event.type === "text_delta") {
        const tail = parts[parts.length - 1];
        // 紧跟文本就续写，否则新开一段（工具调用之后要分段）
        if (tail && tail.type === "text") {
          parts[parts.length - 1] = {
            ...tail,
            text: String(tail.text ?? "") + event.text,
          };
        } else {
          parts.push({ type: "text", text: event.text });
        }
      }

      if (event.type === "tool_start") {
        parts.push({
          type: event.partType,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          // 运行中：库按这个状态显示 shimmer
          state: "input-streaming",
          input: event.input,
        });
      }

      if (event.type === "tool_end") {
        const index = parts.findIndex(
          (part) => part.toolCallId === event.toolCallId,
        );
        if (index >= 0) {
          parts[index] = {
            ...parts[index],
            state: event.isError ? "output-error" : "output-available",
            output: event.output,
          };
        }
      }

      const next = [...base];
      next[next.length - 1] = { ...assistant, parts };
      return next as unknown as UIMessage[];
    });
  }, []);

  // 订阅事件流；EventSource 自己会重连，这里只负责关掉
  useEffect(() => {
    const source = new EventSource("/api/pi/events");
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as PiEvent;

      if (event.type === "run_started") {
        runIdRef.current = event.runId;
        setStatus("streaming");
        return;
      }
      if (event.type === "run_end") {
        runIdRef.current = null;
        setStatus("ready");
        return;
      }
      if (event.type === "error") {
        setStatus("error");
        setError(new Error(event.message));
        return;
      }
      applyEvent(event);
    };
    return () => source.close();
  }, [applyEvent]);

  // 首次进入：拉设置与历史，刷新后能接着看
  useEffect(() => {
    void (async () => {
      const settingsResult = await api.getSettings();
      if (settingsResult.status === 200) setSettings(settingsResult.body);

      const historyResult = await api.getMessages();
      if (historyResult.status !== 200) return;
      const history = historyResult.body.messages.map(
        (item) =>
          ({
            id: item.id,
            role: item.role,
            parts: [{ type: "text", text: item.text }],
          }) as unknown as UIMessage,
      );
      // 只在还没有任何消息时回填：否则拉历史的慢请求会回来把刚发出的消息冲掉
      setMessages((prev) => (prev.length > 0 ? prev : history));
    })();
  }, []);

  // 发消息：先把用户消息与图片放进列表，再交给后台
  const send = useCallback(async (text: string, images: Attachment[]) => {
    setError(null);
    setStatus("submitted");

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        ...(text.trim() ? [{ type: "text", text }] : []),
        // 图片走 file part，库的 UserMessage 会渲染缩略图
        ...images.map((image) => ({
          type: "file",
          mediaType: image.mimeType,
          url: image.url,
          filename: image.filename,
        })),
      ],
    } as unknown as UIMessage;

    setMessages((prev) => [...prev, userMessage]);

    const result = await api.sendMessage({
      body: {
        text,
        images: images.map((image) => ({
          mimeType: image.mimeType,
          data: image.data,
        })),
      },
    });

    if (result.status !== 202) {
      setStatus("error");
      setError(new Error("发送失败"));
    }
  }, []);

  // 停止：让 pi 中断当前运行
  const stop = useCallback(async () => {
    await api.abort({ body: {} });
  }, []);

  // 改设置：切模型或切 thinking，接口会回最新设置
  const updateSettings = useCallback(
    async (patch: { modelId?: string; thinkingLevel?: string }) => {
      const result = await api.updateSettings({ body: patch });
      if (result.status === 200) setSettings(result.body);
    },
    [],
  );

  return {
    messages,
    status,
    settings,
    error,
    send,
    stop,
    updateSettings,
  };
}

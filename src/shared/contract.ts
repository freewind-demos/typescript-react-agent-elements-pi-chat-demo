// 前后端共享的接口契约：ts-rest contract + SSE 事件类型 + 各种结构定义
import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

// 一个可选模型：id 用 "provider/modelId" 拼，前端按第一个斜线切开还原
export const ModelOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  modelId: z.string(),
  supportsImages: z.boolean(),
  supportsThinking: z.boolean(),
});
export type ModelOption = z.infer<typeof ModelOptionSchema>;

// 页面需要的一整套设置：模型清单 + 当前模型 + thinking 等级清单与当前值
export const SettingsSchema = z.object({
  models: z.array(ModelOptionSchema),
  currentModelId: z.string().nullable(),
  thinkingLevel: z.string(),
  thinkingLevels: z.array(z.string()),
});
export type Settings = z.infer<typeof SettingsSchema>;

// 改设置：两个字段都可选，只改传进来的那个
export const UpdateSettingsBody = z.object({
  modelId: z.string().optional(),
  thinkingLevel: z.string().optional(),
});

// 发消息：文本 + 可选图片（base64，不带 data: 前缀）
export const SendMessageBody = z.object({
  text: z.string(),
  images: z
    .array(z.object({ mimeType: z.string(), data: z.string() }))
    .optional(),
});

// 发消息只回一个 runId，内容靠 SSE 推
export const RunStarted = z.object({ runId: z.string() });

// 通用成功标记
export const Ok = z.object({ ok: z.boolean() });

// 会话历史里的一条消息，只保留能直接渲染的文本
export const StoredMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.number(),
});
export type StoredMessage = z.infer<typeof StoredMessageSchema>;

// 历史消息列表
export const StoredMessages = z.object({
  messages: z.array(StoredMessageSchema),
});

export const contract = c.router({
  // 读设置
  getSettings: {
    method: "GET",
    path: "/api/pi/settings",
    responses: { 200: SettingsSchema },
  },
  // 改设置
  updateSettings: {
    method: "PATCH",
    path: "/api/pi/settings",
    body: UpdateSettingsBody,
    responses: { 200: SettingsSchema },
  },
  // 发一条消息给 agent
  sendMessage: {
    method: "POST",
    path: "/api/pi/messages",
    body: SendMessageBody,
    responses: { 202: RunStarted },
  },
  // 取历史消息，刷新页面时用来回填
  getMessages: {
    method: "GET",
    path: "/api/pi/messages",
    responses: { 200: StoredMessages },
  },
  // 中断当前运行
  abort: {
    method: "POST",
    path: "/api/pi/abort",
    body: z.object({}),
    responses: { 200: Ok },
  },
  // 开一个新会话
  newSession: {
    method: "POST",
    path: "/api/pi/session",
    body: z.object({}),
    responses: { 200: Ok },
  },
});

// SSE 事件：服务端把 pi 的事件翻成这几种，前端按 runId 归组
export type PiEvent =
  | { type: "run_started"; runId: string }
  | { type: "text_delta"; runId: string; text: string }
  | { type: "thinking_delta"; runId: string; text: string }
  | {
      type: "tool_start";
      runId: string;
      toolCallId: string;
      toolName: string;
      // 已翻译成库认的 part 类型，例如 tool-Bash
      partType: string;
      input: unknown;
    }
  | {
      type: "tool_end";
      runId: string;
      toolCallId: string;
      toolName: string;
      partType: string;
      output: unknown;
      isError: boolean;
    }
  | { type: "run_end"; runId: string }
  | { type: "error"; runId: string | null; message: string };

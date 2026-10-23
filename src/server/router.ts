// ts-rest 的 router 实现：每个端点只做转发，业务都在 PiAgent 里
import { initServer } from "@ts-rest/express";
import { contract } from "../shared/contract";
import type { PiAgent } from "./pi-agent";

const s = initServer();

// 把 agent 注入进来，方便以后换实现
export function createRouter(agent: PiAgent) {
  return s.router(contract, {
    // 读设置
    getSettings: async () => {
      return { status: 200, body: await agent.getSettings() };
    },
    // 改设置
    updateSettings: async ({ body }) => {
      return { status: 200, body: await agent.updateSettings(body) };
    },
    // 发消息，立刻回 runId
    sendMessage: async ({ body }) => {
      const runId = await agent.send(body.text, body.images);
      return { status: 202, body: { runId } };
    },
    // 取历史，刷新页面时回填
    getMessages: async () => {
      return { status: 200, body: { messages: await agent.getHistory() } };
    },
    // 中断当前运行
    abort: async () => {
      await agent.abort();
      return { status: 200, body: { ok: true } };
    },
    // 开新会话
    newSession: async () => {
      await agent.newSession();
      return { status: 200, body: { ok: true } };
    },
  });
}

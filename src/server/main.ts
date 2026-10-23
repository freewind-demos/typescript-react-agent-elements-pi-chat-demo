// 服务入口：挂 ts-rest 的命令接口，再挂一条 SSE 事件流
import express from "express";
import { createExpressEndpoints } from "@ts-rest/express";
import { contract, type PiEvent } from "../shared/contract";
import { PiAgent } from "./pi-agent";
import { createRouter } from "./router";

const app = express();
// 图片是 base64 传的，放宽 body 上限
app.use(express.json({ limit: "20mb" }));

// 全局唯一的 agent：demo 就是单会话单进程
const agent = new PiAgent();

// 命令型接口全部交给 ts-rest
createExpressEndpoints(contract, createRouter(agent), app);

// 事件型接口：SSE 不属于 ts-rest 的 JSON 契约，单独一条路由
app.get("/api/pi/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // 先发一行注释，让浏览器立刻认为连接已建立
  res.write(": connected\n\n");

  const onEvent = (event: PiEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  agent.on("pi-event", onEvent);

  // 心跳，避免中间层把空闲连接掐掉
  const ping = setInterval(() => res.write(": ping\n\n"), 15_000);

  req.on("close", () => {
    clearInterval(ping);
    agent.off("pi-event", onEvent);
  });
});

// 端口固定，Vite 的 /api 代理指向这里
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`pi chat server: http://127.0.0.1:${port}`);
});

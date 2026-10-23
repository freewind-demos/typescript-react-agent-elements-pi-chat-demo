import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// 前端只有 Vite；后端单独用 pnpm start 跑，这里把 /api 代理过去，避免跨域
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 与 tsconfig 的 paths 一致：@/ 指向 src
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    // 后端端口固定 8787，见 src/server/main.ts
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});

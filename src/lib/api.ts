// ts-rest 客户端：同源请求，开发时由 Vite 把 /api 代理到后端的 8787
import { initClient } from "@ts-rest/core";
import { contract } from "../shared/contract";

export const api = initClient(contract, {
  baseUrl: window.location.origin,
  baseHeaders: {},
});

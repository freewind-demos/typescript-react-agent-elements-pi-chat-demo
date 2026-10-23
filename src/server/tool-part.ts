// 把 pi 的工具名翻译成 Agent Elements 认得的 part 类型
// 库内部按 tool-Bash / tool-Edit / tool-Write / tool-Grep / tool-Glob 等硬编码分发，
// 名字对不上就只会落到通用的 GenericTool 卡片。

const KNOWN: Record<string, string> = {
  bash: "Bash", // 终端命令卡片
  edit: "Edit", // 展示 diff 的编辑卡片
  write: "Write", // 复用编辑卡片
  read: "Read", // 通用卡片
  grep: "Grep", // 搜索卡片
  find: "Glob", // 搜索卡片
  ls: "Glob", // 搜索卡片
  tool_search: "WebSearch", // 搜索卡片
};

// 返回形如 tool-Bash 的字符串，直接塞进 UIMessage 的 part.type
export function toPartType(toolName: string): string {
  const known = KNOWN[toolName];
  if (known) return `tool-${known}`;

  // MCP 工具名本身是 mcp__server__tool，库用 tool-mcp__ 前缀识别
  if (toolName.startsWith("mcp__")) return `tool-${toolName}`;

  // 其余工具转成大驼峰，落到通用卡片，标题用工具名
  const pascal = toolName.replace(/(^|_)([a-z])/g, (_, __, ch: string) =>
    ch.toUpperCase(),
  );
  return `tool-${pascal}`;
}

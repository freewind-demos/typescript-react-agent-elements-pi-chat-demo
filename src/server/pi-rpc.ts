// pi 的 RPC 客户端：把子进程的 stdin/stdout 当成 JSONL 通道
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

type Pending = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class PiRpc extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  // 收到的不完整行先攒着，按 \n 切开；不能用 readline，它会误切 U+2028
  private buffer = "";
  private seq = 0;
  private pending = new Map<string, Pending>();

  constructor(
    private readonly bin: string,
    private readonly cwd: string,
    private readonly sessionDir: string,
  ) {
    super();
  }

  // 启动子进程；重复调用是安全的
  start() {
    if (this.proc) return;
    this.proc = spawn(
      this.bin,
      ["--mode", "rpc", "--session-dir", this.sessionDir],
      { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.proc.stderr.setEncoding("utf8");
    // pi 的诊断信息走 stderr，原样转给服务端日志，不当协议数据
    this.proc.stderr.on("data", (chunk: string) => {
      process.stderr.write(`[pi] ${chunk}`);
    });
    this.proc.on("exit", (code) => {
      this.failAll(new Error(`pi 进程退出，code=${code}`));
      this.proc = null;
    });
  }

  // 按 LF 切分记录，解析出的响应按 id 配对，其余当事件广播
  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf("\n");
      if (!line.trim()) continue;

      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const id = record.id as string | undefined;
      if (record.type === "response" && id && this.pending.has(id)) {
        const pending = this.pending.get(id)!;
        this.pending.delete(id);
        clearTimeout(pending.timer);
        if (record.success === false) {
          pending.reject(new Error(String(record.error ?? "pi 命令失败")));
        } else {
          pending.resolve(record.data);
        }
        continue;
      }

      // 扩展发来的交互请求按要求原样忽略：不回应，pi 自己等待
      if (record.type === "extension_ui_request") continue;

      this.emit("event", record);
    }
  }

  // 发一条命令并等它的 response；超时抛错
  send(command: Record<string, unknown>, timeoutMs = 60_000): Promise<unknown> {
    this.start();
    const id = `req-${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`pi 命令超时：${String(command.type)}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin.write(JSON.stringify({ ...command, id }) + "\n");
    });
  }

  // 进程结束时把等待中的命令全部失败掉，避免请求悬挂
  private failAll(error: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  // 有序关闭：关 stdin 让 pi 自己收尾
  stop() {
    this.proc?.stdin.end();
    this.proc = null;
  }
}

import type { JsonRpcMessage } from "../types/mcp.types";

/** MCP stdio 传输的 JSON-RPC 换行分帧器 */
export class JsonRpcFramer {
  private buffer = "";

  /** 接收数据块，解析出完整的 JSON-RPC 消息 */
  onData(chunk: Buffer | string): JsonRpcMessage[] {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    const messages: JsonRpcMessage[] = [];

    for (const line of lines) {
      if (line.trim() === "") {
        continue;
      }

      try {
        messages.push(JSON.parse(line) as JsonRpcMessage);
      } catch {
        // 忽略无效 JSON
      }
    }

    return messages;
  }

  /** 将 JSON-RPC 消息序列化为带换行符的字符串 */
  serialize(message: JsonRpcMessage): string {
    return `${JSON.stringify(message)}\n`;
  }

  /** 清空内部缓冲区 */
  reset(): void {
    this.buffer = "";
  }
}

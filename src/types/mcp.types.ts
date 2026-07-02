/** JSON-RPC 2.0 请求消息 */
export interface JsonRpcRequest {
  /** 协议版本，固定为 "2.0" */
  jsonrpc: "2.0";
  /** 请求唯一标识，用于匹配响应 */
  id: number | string;
  /** 调用的方法名 */
  method: string;
  /** 方法参数（可选） */
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 响应消息 */
export interface JsonRpcResponse {
  /** 协议版本，固定为 "2.0" */
  jsonrpc: "2.0";
  /** 与请求对应的标识 */
  id: number | string;
  /** 成功时的返回结果（与 error 互斥） */
  result?: unknown;
  /** 失败时的错误信息（与 result 互斥） */
  error?: {
    /** 错误码 */
    code: number;
    /** 错误描述信息 */
    message: string;
    /** 附加错误数据（可选） */
    data?: unknown;
  };
}

/** JSON-RPC 2.0 通知消息（无 id 字段，不期望响应） */
export interface JsonRpcNotification {
  /** 协议版本，固定为 "2.0" */
  jsonrpc: "2.0";
  /** 通知的方法名 */
  method: string;
  /** 方法参数（可选） */
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 消息（请求、响应或通知） */
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

/** MCP 工具定义 */
export interface McpTool {
  /** 工具名称 */
  name: string;
  /** 工具描述（可选） */
  description?: string;
  /** 工具输入参数的 JSON Schema */
  inputSchema: Record<string, unknown>;
}

/** MCP 工具调用请求 */
export interface McpToolCallRequest {
  /** 固定为 "tools/call" */
  method: "tools/call";
  /** 调用参数 */
  params: {
    /** 要调用的工具名称 */
    name: string;
    /** 传递给工具的参数（可选） */
    arguments?: Record<string, unknown>;
  };
}

/** MCP 工具调用结果 */
export interface McpToolCallResult {
  /** 返回内容列表 */
  content: Array<{
    /** 内容类型，如 "text" */
    type: string;
    /** 文本内容（可选） */
    text?: string;
  }>;
  /** 是否为错误结果（可选） */
  isError?: boolean;
}

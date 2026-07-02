import { spawn, ChildProcess } from "child_process";
import { AuditLogger } from "../audit/audit-logger";
import { ConfigManager } from "../config/config-manager";
import type {
  JsonRpcMessage,
  JsonRpcRequest,
  JsonRpcResponse,
} from "../types/mcp.types";
import type { RiskDecision } from "../types/shield.types";
import { RiskEngine } from "../risk/risk-engine";
import { TransactionClassifier } from "../risk/transaction-classifier";
import { JsonRpcFramer } from "./json-rpc-framer";

/** MCP 代理：在 Agent 与 OKX MCP Server 之间插入风控与审计 */
export class McpProxy {
  private upstream: ChildProcess | null = null;
  private readonly configManager: ConfigManager;
  private readonly riskEngine: RiskEngine;
  private readonly auditLogger: AuditLogger;
  private readonly classifier: TransactionClassifier;
  private readonly agentFramer: JsonRpcFramer;
  private readonly serverFramer: JsonRpcFramer;
  private isRunning = false;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.riskEngine = new RiskEngine(configManager);
    this.auditLogger = new AuditLogger(configManager);
    this.classifier = new TransactionClassifier();
    this.agentFramer = new JsonRpcFramer();
    this.serverFramer = new JsonRpcFramer();
  }

  async start(): Promise<void> {
    this.upstream = spawn("npx", ["@okx_ai/okx-trade-mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    process.stdin.on("data", (chunk: Buffer | string) => {
      const messages = this.agentFramer.onData(chunk);

      for (const message of messages) {
        void this.handleAgentMessage(message);
      }
    });

    this.upstream.stdout?.on("data", (chunk: Buffer | string) => {
      const messages = this.serverFramer.onData(chunk);

      for (const message of messages) {
        this.handleServerMessage(message);
      }
    });

    this.upstream.stderr?.on("data", (chunk: Buffer | string) => {
      process.stderr.write(chunk);
    });

    this.upstream.on("exit", (code, signal) => {
      this.isRunning = false;
      process.stderr.write(
        `[okx-agent-shield] upstream exited: code=${code ?? "null"} signal=${signal ?? "null"}\n`,
      );
    });

    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;

    if (this.upstream) {
      this.upstream.kill();
      this.upstream = null;
    }

    process.stdin.pause();
    this.agentFramer.reset();
    this.serverFramer.reset();
  }

  private async handleAgentMessage(message: JsonRpcMessage): Promise<void> {
    if (!this.isRequest(message)) {
      this.forwardToServer(message);
      return;
    }

    if (message.method !== "tools/call") {
      this.forwardToServer(message);
      return;
    }

    const toolName = String(message.params?.name ?? "");
    const classification = this.classifier.classify(toolName);

    if (!classification.requiresInterception) {
      this.forwardToServer(message);
      return;
    }

    const decision = await this.riskEngine.evaluate(message);
    this.riskEngine.persistRuntime();

    if (decision.action === "BLOCK") {
      this.sendBlockResponse(message, decision);
      this.auditLogger.logBlocked(message, decision);
      return;
    }

    if (decision.action === "WARN") {
      this.forwardToServer(message);
      this.auditLogger.logWarned(message, decision);
      return;
    }

    this.forwardToServer(message);
    this.auditLogger.logAllowed(message, decision);
  }

  private handleServerMessage(message: JsonRpcMessage): void {
    this.forwardToAgent(`${JSON.stringify(message)}\n`);
  }

  private sendBlockResponse(
    request: JsonRpcRequest,
    decision: RiskDecision,
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32001,
        message: "🛡️ OKX Agent Shield 已拦截此交易",
        data: {
          shield_action: "BLOCKED",
          shield_reason: decision.violations
            .map((violation) => violation.message)
            .join("; "),
          shield_details: decision.violations
            .map(
              (violation) =>
                `[${violation.severity}] ${violation.ruleId}: ${violation.message} (当前: ${violation.currentValue}, 限制: ${violation.limitValue})`,
            )
            .join("\n"),
          shield_suggestion: "请修改交易参数或调整风控策略",
        },
      },
    };

    process.stdout.write(`${JSON.stringify(response)}\n`);
  }

  private forwardToServer(message: JsonRpcMessage): void {
    if (this.upstream?.stdin?.writable) {
      this.upstream.stdin.write(`${JSON.stringify(message)}\n`);
    }
  }

  private forwardToAgent(data: string): void {
    process.stdout.write(data);
  }

  private isRequest(message: JsonRpcMessage): message is JsonRpcRequest {
    return "method" in message && "id" in message;
  }
}

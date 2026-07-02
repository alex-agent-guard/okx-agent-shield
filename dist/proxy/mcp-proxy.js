"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpProxy = void 0;
const child_process_1 = require("child_process");
const audit_logger_1 = require("../audit/audit-logger");
const risk_engine_1 = require("../risk/risk-engine");
const transaction_classifier_1 = require("../risk/transaction-classifier");
const json_rpc_framer_1 = require("./json-rpc-framer");
/** MCP 代理：在 Agent 与 OKX MCP Server 之间插入风控与审计 */
class McpProxy {
    constructor(configManager) {
        this.upstream = null;
        this.isRunning = false;
        this.configManager = configManager;
        this.riskEngine = new risk_engine_1.RiskEngine(configManager);
        this.auditLogger = new audit_logger_1.AuditLogger(configManager);
        this.classifier = new transaction_classifier_1.TransactionClassifier();
        this.agentFramer = new json_rpc_framer_1.JsonRpcFramer();
        this.serverFramer = new json_rpc_framer_1.JsonRpcFramer();
    }
    async start() {
        this.upstream = (0, child_process_1.spawn)("npx", ["@okx_ai/okx-trade-mcp"], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        process.stdin.on("data", (chunk) => {
            const messages = this.agentFramer.onData(chunk);
            for (const message of messages) {
                void this.handleAgentMessage(message);
            }
        });
        this.upstream.stdout?.on("data", (chunk) => {
            const messages = this.serverFramer.onData(chunk);
            for (const message of messages) {
                this.handleServerMessage(message);
            }
        });
        this.upstream.stderr?.on("data", (chunk) => {
            process.stderr.write(chunk);
        });
        this.upstream.on("exit", (code, signal) => {
            this.isRunning = false;
            process.stderr.write(`[okx-agent-shield] upstream exited: code=${code ?? "null"} signal=${signal ?? "null"}\n`);
        });
        this.isRunning = true;
    }
    stop() {
        this.isRunning = false;
        if (this.upstream) {
            this.upstream.kill();
            this.upstream = null;
        }
        process.stdin.pause();
        this.agentFramer.reset();
        this.serverFramer.reset();
    }
    async handleAgentMessage(message) {
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
    handleServerMessage(message) {
        this.forwardToAgent(`${JSON.stringify(message)}\n`);
    }
    sendBlockResponse(request, decision) {
        const response = {
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
                        .map((violation) => `[${violation.severity}] ${violation.ruleId}: ${violation.message} (当前: ${violation.currentValue}, 限制: ${violation.limitValue})`)
                        .join("\n"),
                    shield_suggestion: "请修改交易参数或调整风控策略",
                },
            },
        };
        process.stdout.write(`${JSON.stringify(response)}\n`);
    }
    forwardToServer(message) {
        if (this.upstream?.stdin?.writable) {
            this.upstream.stdin.write(`${JSON.stringify(message)}\n`);
        }
    }
    forwardToAgent(data) {
        process.stdout.write(data);
    }
    isRequest(message) {
        return "method" in message && "id" in message;
    }
}
exports.McpProxy = McpProxy;

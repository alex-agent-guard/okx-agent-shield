import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { ConfigManager } from "../config/config-manager";
import type { JsonRpcRequest } from "../types/mcp.types";
import type {
  AgentDecisionRecord,
  RiskDecision,
  ShieldAction,
} from "../types/shield.types";

const SHIELD_VERSION = "0.1.0";

/** Agent 决策记录（ADR）审计日志器 */
export class AuditLogger {
  private readonly enabled: boolean;
  private readonly sessionId: string;
  private readonly logDir: string;
  private readonly logFile: string;
  private readonly configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.enabled = configManager.load().global.auditEnabled;
    this.sessionId = this.generateSessionId();
    this.logDir = path.join(
      os.homedir(),
      ".okx",
      "shield",
      "audit",
      this.getCurrentMonth(),
    );
    this.logFile = path.join(
      this.logDir,
      `ADR_${this.getCurrentDate()}.jsonl`,
    );
    this.ensureLogDir();
  }

  /** 记录放行决策 */
  logAllowed(request: JsonRpcRequest, decision: RiskDecision): void {
    if (!this.enabled) {
      return;
    }

    this.write(this.createADR(request, decision));
  }

  /** 记录拦截决策 */
  logBlocked(request: JsonRpcRequest, decision: RiskDecision): void {
    if (!this.enabled) {
      return;
    }

    this.write(this.createADR(request, decision));
  }

  /** 记录警告决策 */
  logWarned(request: JsonRpcRequest, decision: RiskDecision): void {
    if (!this.enabled) {
      return;
    }

    this.write(this.createADR(request, decision));
  }

  private createADR(
    request: JsonRpcRequest,
    decision: RiskDecision,
  ): AgentDecisionRecord {
    const now = new Date();
    const { tool, params } = this.extractTransactionRequest(request);
    const config = this.configManager.load();
    const primaryViolation = decision.violations[0];

    return {
      adr_id: this.generateAdrId(now),
      timestamp: now.toISOString(),
      session_id: this.sessionId,
      shield_version: SHIELD_VERSION,
      shield_decision: {
        action: decision.action,
        rule_id: primaryViolation?.ruleId,
        reason: this.buildReason(decision.action, decision),
        confidence: this.buildConfidence(decision.action),
      },
      transaction_request: {
        tool,
        params,
      },
      risk_assessment: this.buildRiskAssessment(decision),
      shield_config_version: config.version,
    };
  }

  private write(adr: AgentDecisionRecord): void {
    this.ensureLogDir();
    fs.appendFileSync(this.logFile, `${JSON.stringify(adr)}\n`, "utf-8");
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private generateSessionId(): string {
    return `sess_${this.randomAlphanumeric(8)}`;
  }

  private generateAdrId(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `adr_${year}${month}${day}_${hours}${minutes}${seconds}_${this.randomAlphanumeric(6)}`;
  }

  private getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  private getCurrentDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private extractTransactionRequest(request: JsonRpcRequest): {
    tool: string;
    params: Record<string, unknown>;
  } {
    const requestParams = request.params ?? {};
    const tool = String(requestParams.name ?? requestParams.toolName ?? "");
    const nestedParams = requestParams.arguments;

    const params =
      nestedParams && typeof nestedParams === "object"
        ? (nestedParams as Record<string, unknown>)
        : requestParams;

    return { tool, params };
  }

  private buildReason(action: ShieldAction, decision: RiskDecision): string {
    if (decision.violations.length === 0) {
      switch (action) {
        case "PASS":
          return "All risk checks passed";
        case "WARN":
          return "Request allowed with warnings";
        case "BLOCK":
          return "Request blocked by shield policy";
      }
    }

    return decision.violations.map((violation) => violation.message).join("; ");
  }

  private buildConfidence(action: ShieldAction): number {
    switch (action) {
      case "PASS":
        return 1;
      case "WARN":
        return 0.75;
      case "BLOCK":
        return 0.95;
    }
  }

  private buildRiskAssessment(
    decision: RiskDecision,
  ): AgentDecisionRecord["risk_assessment"] {
    if (decision.notionalUsd === undefined && decision.violations.length === 0) {
      return undefined;
    }

    return {
      notional_usd: decision.notionalUsd ?? 0,
      category: decision.category,
      triggered_rules: decision.violations.map((violation) => violation.ruleId),
    };
  }

  private randomAlphanumeric(length: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.randomBytes(length);
    let result = "";

    for (let i = 0; i < length; i += 1) {
      result += chars[bytes[i] % chars.length];
    }

    return result;
  }
}

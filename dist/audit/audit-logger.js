"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const SHIELD_VERSION = "0.1.0";
/** Agent 决策记录（ADR）审计日志器 */
class AuditLogger {
    constructor(configManager) {
        this.configManager = configManager;
        this.enabled = configManager.load().global.auditEnabled;
        this.sessionId = this.generateSessionId();
        this.logDir = path_1.default.join(os_1.default.homedir(), ".okx", "shield", "audit", this.getCurrentMonth());
        this.logFile = path_1.default.join(this.logDir, `ADR_${this.getCurrentDate()}.jsonl`);
        this.ensureLogDir();
    }
    /** 记录放行决策 */
    logAllowed(request, decision) {
        if (!this.enabled) {
            return;
        }
        this.write(this.createADR(request, decision));
    }
    /** 记录拦截决策 */
    logBlocked(request, decision) {
        if (!this.enabled) {
            return;
        }
        this.write(this.createADR(request, decision));
    }
    /** 记录警告决策 */
    logWarned(request, decision) {
        if (!this.enabled) {
            return;
        }
        this.write(this.createADR(request, decision));
    }
    createADR(request, decision) {
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
    write(adr) {
        this.ensureLogDir();
        fs_1.default.appendFileSync(this.logFile, `${JSON.stringify(adr)}\n`, "utf-8");
    }
    ensureLogDir() {
        if (!fs_1.default.existsSync(this.logDir)) {
            fs_1.default.mkdirSync(this.logDir, { recursive: true });
        }
    }
    generateSessionId() {
        return `sess_${this.randomAlphanumeric(8)}`;
    }
    generateAdrId(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `adr_${year}${month}${day}_${hours}${minutes}${seconds}_${this.randomAlphanumeric(6)}`;
    }
    getCurrentMonth() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
    }
    getCurrentDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    extractTransactionRequest(request) {
        const requestParams = request.params ?? {};
        const tool = String(requestParams.name ?? requestParams.toolName ?? "");
        const nestedParams = requestParams.arguments;
        const params = nestedParams && typeof nestedParams === "object"
            ? nestedParams
            : requestParams;
        return { tool, params };
    }
    buildReason(action, decision) {
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
    buildConfidence(action) {
        switch (action) {
            case "PASS":
                return 1;
            case "WARN":
                return 0.75;
            case "BLOCK":
                return 0.95;
        }
    }
    buildRiskAssessment(decision) {
        if (decision.notionalUsd === undefined && decision.violations.length === 0) {
            return undefined;
        }
        return {
            notional_usd: decision.notionalUsd ?? 0,
            category: decision.category,
            triggered_rules: decision.violations.map((violation) => violation.ruleId),
        };
    }
    randomAlphanumeric(length) {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        const bytes = crypto_1.default.randomBytes(length);
        let result = "";
        for (let i = 0; i < length; i += 1) {
            result += chars[bytes[i] % chars.length];
        }
        return result;
    }
}
exports.AuditLogger = AuditLogger;

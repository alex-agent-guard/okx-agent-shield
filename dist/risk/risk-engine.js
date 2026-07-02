"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskEngine = void 0;
exports.estimateNotionalUsd = estimateNotionalUsd;
const transaction_classifier_1 = require("./transaction-classifier");
/** 根据工具参数估算名义金额（USD） */
function estimateNotionalUsd(toolName, params) {
    const sz = Number(params.sz || params.size || 0);
    const px = Number(params.px || params.price || 0);
    const instId = String(params.instId || "");
    if (px > 0) {
        return sz * px;
    }
    if (instId.includes("BTC")) {
        return sz * 65000;
    }
    if (instId.includes("ETH")) {
        return sz * 3500;
    }
    if (instId.includes("SOL")) {
        return sz * 150;
    }
    return sz * 100;
}
/** 风控规则引擎 */
class RiskEngine {
    constructor(configManager) {
        this.orderTimestamps = [];
        this.configManager = configManager;
        configManager.load();
        this.config = configManager.getActivePolicy().rules;
        this.runtime = configManager.loadRuntime();
        if (configManager.shouldResetDailyCounters(this.runtime)) {
            this.runtime = configManager.resetDailyCounters(this.runtime);
        }
        this.classifier = new transaction_classifier_1.TransactionClassifier();
    }
    /** 评估 MCP 工具调用请求的风险 */
    async evaluate(request) {
        const startTime = Date.now();
        if (this.configManager.shouldResetDailyCounters(this.runtime)) {
            this.runtime = this.configManager.resetDailyCounters(this.runtime);
        }
        const { toolName, params } = this.extractToolRequest(request);
        const classification = this.classifier.classify(toolName);
        if (classification.category === "query_only") {
            const decision = {
                action: "PASS",
                toolName,
                category: classification.category,
                violations: [],
                processingTimeMs: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            };
            this.updateRuntime(decision);
            return decision;
        }
        if (!this.config.enabled) {
            const decision = {
                action: "PASS",
                toolName,
                category: classification.category,
                violations: [],
                processingTimeMs: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            };
            this.updateRuntime(decision);
            return decision;
        }
        const notionalUsd = estimateNotionalUsd(toolName, params);
        const partialDecision = {
            action: "PASS",
            toolName,
            category: classification.category,
            violations: [],
            notionalUsd,
            processingTimeMs: 0,
            timestamp: new Date().toISOString(),
        };
        const violations = [
            this.checkAmountLimit(toolName, params),
            this.checkDailyVolume(partialDecision),
            this.checkLeverage(toolName, params),
            this.checkFrequency(),
            this.checkWhitelist(toolName, params),
            this.checkBlacklist(toolName, params),
            this.checkStoploss(toolName, params),
            this.checkCategoryAllowed(classification.category),
            this.checkDailyLoss(),
        ].filter((violation) => violation !== null);
        const action = this.determineAction(violations);
        const decision = {
            action,
            toolName,
            category: classification.category,
            violations,
            notionalUsd,
            processingTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
        };
        this.updateRuntime(decision);
        return decision;
    }
    /** 根据决策结果更新运行时计数器 */
    updateRuntime(decision) {
        this.runtime.totalRequests += 1;
        switch (decision.action) {
            case "BLOCK":
                this.runtime.blockedRequests += 1;
                break;
            case "WARN":
                this.runtime.warnedRequests += 1;
                this.recordOrderActivity(decision);
                break;
            case "PASS":
                this.runtime.allowedRequests += 1;
                this.recordOrderActivity(decision);
                break;
        }
    }
    /** 将运行时状态持久化到磁盘 */
    persistRuntime() {
        this.configManager.saveRuntime(this.runtime);
    }
    extractToolRequest(request) {
        const requestParams = request.params ?? {};
        const toolName = String(requestParams.name ?? requestParams.toolName ?? "");
        const nestedParams = requestParams.arguments;
        const params = nestedParams && typeof nestedParams === "object"
            ? nestedParams
            : requestParams;
        return { toolName, params };
    }
    determineAction(violations) {
        const blockingSeverities = ["critical", "high"];
        const warningSeverities = ["medium", "low"];
        if (violations.some((violation) => blockingSeverities.includes(violation.severity))) {
            return "BLOCK";
        }
        if (violations.some((violation) => warningSeverities.includes(violation.severity))) {
            return "WARN";
        }
        return "PASS";
    }
    recordOrderActivity(decision) {
        if (decision.category === "query_only") {
            return;
        }
        this.runtime.dailyOrdersCount += 1;
        this.runtime.dailyVolumeUsd += decision.notionalUsd ?? 0;
        this.orderTimestamps.push(Date.now());
    }
    checkAmountLimit(toolName, params) {
        const notionalUsd = estimateNotionalUsd(toolName, params);
        if (notionalUsd <= this.config.maxSingleOrderUsd) {
            return null;
        }
        return {
            ruleId: "RULE_MAX_SINGLE_ORDER",
            ruleName: "单笔订单金额限制",
            severity: "critical",
            message: `单笔订单金额 $${notionalUsd.toFixed(2)} 超过上限`,
            currentValue: `$${notionalUsd.toFixed(2)}`,
            limitValue: `$${this.config.maxSingleOrderUsd}`,
        };
    }
    checkDailyVolume(decision) {
        const notionalUsd = decision.notionalUsd ?? 0;
        const projectedVolume = this.runtime.dailyVolumeUsd + notionalUsd;
        if (projectedVolume <= this.config.maxDailyVolumeUsd) {
            return null;
        }
        return {
            ruleId: "RULE_MAX_DAILY_VOLUME",
            ruleName: "日累计成交量限制",
            severity: "critical",
            message: `日累计成交量 $${projectedVolume.toFixed(2)} 将超过上限`,
            currentValue: `$${projectedVolume.toFixed(2)}`,
            limitValue: `$${this.config.maxDailyVolumeUsd}`,
        };
    }
    checkLeverage(toolName, params) {
        const leverage = Number(params.lever ?? params.leverage ?? 1);
        if (leverage <= this.config.maxLeverage) {
            return null;
        }
        return {
            ruleId: "RULE_MAX_LEVERAGE",
            ruleName: "最大杠杆限制",
            severity: "critical",
            message: `杠杆 ${leverage}x 超过上限`,
            currentValue: `${leverage}x`,
            limitValue: `${this.config.maxLeverage}x`,
        };
    }
    checkFrequency() {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const recentOrders = this.orderTimestamps.filter((timestamp) => timestamp >= oneHourAgo).length;
        if (recentOrders < this.config.maxOrdersPerHour) {
            return null;
        }
        return {
            ruleId: "RULE_MAX_ORDERS_PER_HOUR",
            ruleName: "每小时订单数限制",
            severity: "high",
            message: `近 1 小时订单数 ${recentOrders} 已达上限`,
            currentValue: String(recentOrders),
            limitValue: String(this.config.maxOrdersPerHour),
        };
    }
    checkWhitelist(toolName, params) {
        if (this.config.allowedInstIds.length === 0) {
            return null;
        }
        const instId = String(params.instId ?? "");
        if (!instId) {
            return null;
        }
        if (this.config.allowedInstIds.includes(instId)) {
            return null;
        }
        return {
            ruleId: "RULE_WHITELIST",
            ruleName: "交易对白名单",
            severity: "critical",
            message: `交易对 ${instId} 不在允许列表中`,
            currentValue: instId,
            limitValue: this.config.allowedInstIds.join(", "),
        };
    }
    checkBlacklist(toolName, params) {
        if (this.config.blockedInstIds.length === 0) {
            return null;
        }
        const instId = String(params.instId ?? "");
        if (!instId) {
            return null;
        }
        const matchedPattern = this.config.blockedInstIds.find((pattern) => this.matchesInstPattern(instId, pattern));
        if (!matchedPattern) {
            return null;
        }
        return {
            ruleId: "RULE_BLACKLIST",
            ruleName: "交易对黑名单",
            severity: "critical",
            message: `交易对 ${instId} 匹配黑名单规则 ${matchedPattern}`,
            currentValue: instId,
            limitValue: matchedPattern,
        };
    }
    checkStoploss(toolName, params) {
        if (!this.config.requireStoploss) {
            return null;
        }
        if (toolName.includes("cancel") || toolName.includes("amend")) {
            return null;
        }
        const hasStoploss = Boolean(params.stopLoss ??
            params.stop_loss ??
            params.slTriggerPx ??
            params.slOrdPx ??
            params.attachAlgoOrds);
        if (hasStoploss) {
            return null;
        }
        return {
            ruleId: "RULE_REQUIRE_STOPLOSS",
            ruleName: "强制止损",
            severity: "high",
            message: "订单缺少止损参数",
            currentValue: "none",
            limitValue: "required",
        };
    }
    checkCategoryAllowed(category) {
        if (this.config.allowedCategories.includes(category)) {
            return null;
        }
        return {
            ruleId: "RULE_ALLOWED_CATEGORY",
            ruleName: "允许的操作类别",
            severity: "high",
            message: `操作类别 ${category} 不在允许范围内`,
            currentValue: category,
            limitValue: this.config.allowedCategories.join(", "),
        };
    }
    checkDailyLoss() {
        if (this.runtime.dailyLossUsd <= this.config.maxDailyLossUsd) {
            return null;
        }
        return {
            ruleId: "RULE_MAX_DAILY_LOSS",
            ruleName: "日最大亏损限制",
            severity: "critical",
            message: `日累计亏损 $${this.runtime.dailyLossUsd.toFixed(2)} 超过上限`,
            currentValue: `$${this.runtime.dailyLossUsd.toFixed(2)}`,
            limitValue: `$${this.config.maxDailyLossUsd}`,
        };
    }
    matchesInstPattern(instId, pattern) {
        if (pattern.includes("*")) {
            const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
            return regex.test(instId);
        }
        return instId === pattern;
    }
}
exports.RiskEngine = RiskEngine;

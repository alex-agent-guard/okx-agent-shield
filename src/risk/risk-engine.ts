import { ConfigManager } from "../config/config-manager";
import type { JsonRpcRequest } from "../types/mcp.types";
import type {
  RiskDecision,
  RiskLevel,
  RiskRuleConfig,
  RuleViolation,
  ShieldAction,
  ShieldRuntime,
  TransactionCategory,
} from "../types/shield.types";
import { TransactionClassifier } from "./transaction-classifier";

/** 根据工具参数估算名义金额（USD） */
export function estimateNotionalUsd(
  toolName: string,
  params: Record<string, unknown>,
): number {
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
export class RiskEngine {
  private config: RiskRuleConfig;
  private runtime: ShieldRuntime;
  private readonly classifier: TransactionClassifier;
  private readonly configManager: ConfigManager;
  private readonly orderTimestamps: number[] = [];

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    configManager.load();
    this.config = configManager.getActivePolicy().rules;
    this.runtime = configManager.loadRuntime();

    if (configManager.shouldResetDailyCounters(this.runtime)) {
      this.runtime = configManager.resetDailyCounters(this.runtime);
    }

    this.classifier = new TransactionClassifier();
  }

  /** 评估 MCP 工具调用请求的风险 */
  async evaluate(request: JsonRpcRequest): Promise<RiskDecision> {
    const startTime = Date.now();

    if (this.configManager.shouldResetDailyCounters(this.runtime)) {
      this.runtime = this.configManager.resetDailyCounters(this.runtime);
    }

    const { toolName, params } = this.extractToolRequest(request);
    const classification = this.classifier.classify(toolName);

    if (classification.category === "query_only") {
      const decision: RiskDecision = {
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
      const decision: RiskDecision = {
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
    const partialDecision: RiskDecision = {
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
    ].filter((violation): violation is RuleViolation => violation !== null);

    const action = this.determineAction(violations);
    const decision: RiskDecision = {
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
  updateRuntime(decision: RiskDecision): void {
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
  persistRuntime(): void {
    this.configManager.saveRuntime(this.runtime);
  }

  private extractToolRequest(request: JsonRpcRequest): {
    toolName: string;
    params: Record<string, unknown>;
  } {
    const requestParams = request.params ?? {};
    const toolName = String(requestParams.name ?? requestParams.toolName ?? "");
    const nestedParams = requestParams.arguments;

    const params =
      nestedParams && typeof nestedParams === "object"
        ? (nestedParams as Record<string, unknown>)
        : requestParams;

    return { toolName, params };
  }

  private determineAction(violations: RuleViolation[]): ShieldAction {
    const blockingSeverities: RiskLevel[] = ["critical", "high"];
    const warningSeverities: RiskLevel[] = ["medium", "low"];

    if (violations.some((violation) => blockingSeverities.includes(violation.severity))) {
      return "BLOCK";
    }

    if (violations.some((violation) => warningSeverities.includes(violation.severity))) {
      return "WARN";
    }

    return "PASS";
  }

  private recordOrderActivity(decision: RiskDecision): void {
    if (decision.category === "query_only") {
      return;
    }

    this.runtime.dailyOrdersCount += 1;
    this.runtime.dailyVolumeUsd += decision.notionalUsd ?? 0;
    this.orderTimestamps.push(Date.now());
  }

  private checkAmountLimit(
    toolName: string,
    params: Record<string, unknown>,
  ): RuleViolation | null {
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

  private checkDailyVolume(decision: RiskDecision): RuleViolation | null {
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

  private checkLeverage(
    toolName: string,
    params: Record<string, unknown>,
  ): RuleViolation | null {
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

  private checkFrequency(): RuleViolation | null {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentOrders = this.orderTimestamps.filter(
      (timestamp) => timestamp >= oneHourAgo,
    ).length;

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

  private checkWhitelist(
    toolName: string,
    params: Record<string, unknown>,
  ): RuleViolation | null {
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

  private checkBlacklist(
    toolName: string,
    params: Record<string, unknown>,
  ): RuleViolation | null {
    if (this.config.blockedInstIds.length === 0) {
      return null;
    }

    const instId = String(params.instId ?? "");
    if (!instId) {
      return null;
    }

    const matchedPattern = this.config.blockedInstIds.find((pattern) =>
      this.matchesInstPattern(instId, pattern),
    );

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

  private checkStoploss(
    toolName: string,
    params: Record<string, unknown>,
  ): RuleViolation | null {
    if (!this.config.requireStoploss) {
      return null;
    }

    if (toolName.includes("cancel") || toolName.includes("amend")) {
      return null;
    }

    const hasStoploss = Boolean(
      params.stopLoss ??
        params.stop_loss ??
        params.slTriggerPx ??
        params.slOrdPx ??
        params.attachAlgoOrds,
    );

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

  private checkCategoryAllowed(
    category: TransactionCategory,
  ): RuleViolation | null {
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

  private checkDailyLoss(): RuleViolation | null {
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

  private matchesInstPattern(instId: string, pattern: string): boolean {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`,
      );
      return regex.test(instId);
    }

    return instId === pattern;
  }
}

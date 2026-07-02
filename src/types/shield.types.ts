/** 交易/工具操作类别 */
export type TransactionCategory =
  | "spot_order"
  | "swap_order"
  | "futures_order"
  | "transfer"
  | "algo_order"
  | "bot_operation"
  | "earn_operation"
  | "query_only"
  | "unknown";

/** 风险等级 */
export type RiskLevel = "critical" | "high" | "medium" | "low" | "none";

/** Shield 决策动作 */
export type ShieldAction = "PASS" | "BLOCK" | "WARN";

/** MCP 工具分类结果 */
export interface ToolClassification {
  /** 工具名称 */
  toolName: string;
  /** 操作类别 */
  category: TransactionCategory;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 是否需要拦截检查 */
  requiresInterception: boolean;
}

/** 规则违规详情 */
export interface RuleViolation {
  /** 规则 ID */
  ruleId: string;
  /** 规则名称 */
  ruleName: string;
  /** 违规严重程度 */
  severity: RiskLevel;
  /** 违规描述信息 */
  message: string;
  /** 当前实际值 */
  currentValue: string;
  /** 规则限制值 */
  limitValue: string;
}

/** 风险评估决策结果 */
export interface RiskDecision {
  /** 最终决策动作 */
  action: ShieldAction;
  /** 被评估的工具名称 */
  toolName: string;
  /** 操作类别 */
  category: TransactionCategory;
  /** 触发的规则违规列表 */
  violations: RuleViolation[];
  /** 名义金额（USD，可选） */
  notionalUsd?: number;
  /** 处理耗时（毫秒） */
  processingTimeMs: number;
  /** 决策时间戳（ISO 8601） */
  timestamp: string;
}

/** Agent 决策记录（Agent Decision Record） */
export interface AgentDecisionRecord {
  /** ADR 唯一标识 */
  adr_id: string;
  /** 记录时间戳（ISO 8601） */
  timestamp: string;
  /** 会话 ID */
  session_id: string;
  /** Shield 版本号 */
  shield_version: string;
  /** Shield 决策详情 */
  shield_decision: {
    /** 决策动作 */
    action: ShieldAction;
    /** 触发的规则 ID（可选） */
    rule_id?: string;
    /** 决策原因说明 */
    reason: string;
    /** 决策置信度（0–1） */
    confidence: number;
  };
  /** 原始交易/工具请求 */
  transaction_request: {
    /** 工具名称 */
    tool: string;
    /** 工具参数 */
    params: Record<string, unknown>;
  };
  /** 风险评估摘要（可选） */
  risk_assessment?: {
    /** 名义金额（USD） */
    notional_usd: number;
    /** 操作类别 */
    category: TransactionCategory;
    /** 触发的规则 ID 列表 */
    triggered_rules: string[];
  };
  /** 当时生效的配置版本 */
  shield_config_version: string;
}

/** 风险规则配置 */
export interface RiskRuleConfig {
  /** 是否启用规则 */
  enabled: boolean;
  /** 单笔订单最大金额（USD） */
  maxSingleOrderUsd: number;
  /** 日累计成交量上限（USD） */
  maxDailyVolumeUsd: number;
  /** 最大杠杆倍数 */
  maxLeverage: number;
  /** 每小时最大订单数 */
  maxOrdersPerHour: number;
  /** 允许交易的 instrument ID 白名单 */
  allowedInstIds: string[];
  /** 禁止交易的 instrument ID 黑名单 */
  blockedInstIds: string[];
  /** 是否强制要求止损 */
  requireStoploss: boolean;
  /** 日最大亏损上限（USD） */
  maxDailyLossUsd: number;
  /** 允许的操作类别 */
  allowedCategories: TransactionCategory[];
}

/** Shield 策略（一组规则配置） */
export interface ShieldPolicy {
  /** 策略名称 */
  name: string;
  /** 策略描述 */
  description: string;
  /** 策略下的风险规则 */
  rules: RiskRuleConfig;
}

/** Shield 全局配置 */
export interface ShieldConfig {
  /** 配置版本号 */
  version: string;
  /** 当前激活的策略名称 */
  activePolicy: string;
  /** 策略集合，键为策略名称 */
  policies: Record<string, ShieldPolicy>;
  /** 全局开关与上游命令 */
  global: {
    /** 是否启用审计日志 */
    auditEnabled: boolean;
    /** 是否启用通知 */
    notificationEnabled: boolean;
    /** 上游 MCP 命令标识 */
    upstreamMcpCommand: string;
  };
}

/** Shield 运行时统计状态 */
export interface ShieldRuntime {
  /** 会话开始时间（ISO 8601） */
  sessionStartTime: string;
  /** 累计请求总数 */
  totalRequests: number;
  /** 被拦截的请求数 */
  blockedRequests: number;
  /** 放行的请求数 */
  allowedRequests: number;
  /** 警告但未拦截的请求数 */
  warnedRequests: number;
  /** 当日累计成交量（USD） */
  dailyVolumeUsd: number;
  /** 当日累计订单数 */
  dailyOrdersCount: number;
  /** 当日累计亏损（USD） */
  dailyLossUsd: number;
  /** 上次日统计重置日期（YYYY-MM-DD） */
  lastResetDate: string;
}

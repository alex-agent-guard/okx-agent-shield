import type {
  RiskLevel,
  ToolClassification,
  TransactionCategory,
} from "../types/shield.types";

type ToolRegistryEntry = Omit<ToolClassification, "toolName">;

/** OKX MCP 工具交易分类器 */
export class TransactionClassifier {
  private readonly registry = new Map<string, ToolRegistryEntry>();

  constructor() {
    this.registerTools(
      [
        "spot_order",
        "spot_batch_orders",
        "spot_amend_order",
        "spot_cancel_order",
        "spot_close_position",
      ],
      "spot_order",
      "critical",
      true,
    );

    this.registerTools(
      [
        "swap_order",
        "swap_batch_orders",
        "swap_amend_order",
        "swap_cancel_order",
        "swap_close_position",
      ],
      "swap_order",
      "critical",
      true,
    );

    this.registerTools(
      [
        "futures_order",
        "futures_amend_order",
        "futures_cancel_order",
      ],
      "futures_order",
      "critical",
      true,
    );

    this.registerTools(
      ["account_transfer", "account_withdrawal"],
      "transfer",
      "critical",
      true,
    );

    this.registerTools(
      ["algo_order", "attach_algo_order", "cancel_algo_order"],
      "algo_order",
      "high",
      true,
    );

    this.registerTools(
      [
        "bot_grid_create",
        "bot_grid_cancel",
        "bot_dca_create",
        "bot_dca_cancel",
      ],
      "bot_operation",
      "high",
      true,
    );

    this.registerTools(
      ["earn_subscribe", "earn_redeem"],
      "earn_operation",
      "medium",
      true,
    );

    this.registerTools(
      [
        "market_ticker",
        "market_candles",
        "market_orderbook",
        "market_tickers",
        "account_balance",
        "account_positions",
        "account_bills",
        "account_get_balance",
      ],
      "query_only",
      "none",
      false,
    );
  }

  /** 返回工具的完整分类信息 */
  classify(toolName: string): ToolClassification {
    const entry = this.registry.get(toolName);

    if (entry) {
      return { toolName, ...entry };
    }

    return {
      toolName,
      category: "unknown",
      riskLevel: "high",
      requiresInterception: true,
    };
  }

  /** 判断工具是否需要 Shield 拦截检查 */
  requiresInterception(toolName: string): boolean {
    return this.classify(toolName).requiresInterception;
  }

  /** 获取工具风险等级 */
  getRiskLevel(toolName: string): RiskLevel {
    return this.classify(toolName).riskLevel;
  }

  /** 注册或覆盖自定义工具分类 */
  registerTool(name: string, classification: ToolRegistryEntry): void {
    this.registry.set(name, classification);
  }

  private registerTools(
    tools: string[],
    category: TransactionCategory,
    riskLevel: RiskLevel,
    requiresInterception: boolean,
  ): void {
    for (const tool of tools) {
      this.registry.set(tool, { category, riskLevel, requiresInterception });
    }
  }
}

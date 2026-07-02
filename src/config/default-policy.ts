import type { ShieldPolicy } from "../types/shield.types";

/** 保守策略：低限额、仅现货、强制止损 */
export const conservativePolicy: ShieldPolicy = {
  name: "conservative",
  description: "保守策略：低限额、仅现货、强制止损",
  rules: {
    enabled: true,
    maxSingleOrderUsd: 500,
    maxDailyVolumeUsd: 2000,
    maxLeverage: 1,
    maxOrdersPerHour: 3,
    allowedInstIds: ["BTC-USDT", "ETH-USDT"],
    blockedInstIds: [],
    requireStoploss: true,
    maxDailyLossUsd: 200,
    allowedCategories: ["spot_order", "query_only"],
  },
};

/** 稳健策略：中等限额、支持现货与永续 */
export const moderatePolicy: ShieldPolicy = {
  name: "moderate",
  description: "稳健策略：中等限额、支持现货与永续",
  rules: {
    enabled: true,
    maxSingleOrderUsd: 5000,
    maxDailyVolumeUsd: 25000,
    maxLeverage: 3,
    maxOrdersPerHour: 15,
    allowedInstIds: ["BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT"],
    blockedInstIds: [],
    requireStoploss: false,
    maxDailyLossUsd: 2000,
    allowedCategories: ["spot_order", "swap_order", "query_only"],
  },
};

/** 演示策略：极低限额，用于演示与测试 */
export const demoPolicy: ShieldPolicy = {
  name: "demo",
  description: "演示策略：极低限额，用于演示与测试",
  rules: {
    enabled: true,
    maxSingleOrderUsd: 100,
    maxDailyVolumeUsd: 500,
    maxLeverage: 1,
    maxOrdersPerHour: 1,
    allowedInstIds: ["BTC-USDT"],
    blockedInstIds: ["*SHIB*", "*PEPE*", "*DOGE*"],
    requireStoploss: true,
    maxDailyLossUsd: 50,
    allowedCategories: ["spot_order", "query_only"],
  },
};

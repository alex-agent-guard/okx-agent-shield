import fs from "fs";
import os from "os";
import path from "path";
import type {
  ShieldConfig,
  ShieldPolicy,
  ShieldRuntime,
} from "../types/shield.types";
import {
  conservativePolicy,
  demoPolicy,
  moderatePolicy,
} from "./default-policy";

const SHIELD_DIR = path.join(os.homedir(), ".okx", "shield");
const CONFIG_PATH = path.join(SHIELD_DIR, "config.json");
const RUNTIME_PATH = path.join(SHIELD_DIR, "runtime.json");

/** 返回本地时区的 YYYY-MM-DD 日期字符串 */
function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultConfig(): ShieldConfig {
  return {
    version: "1.0.0",
    activePolicy: conservativePolicy.name,
    policies: {
      [conservativePolicy.name]: conservativePolicy,
      [moderatePolicy.name]: moderatePolicy,
      [demoPolicy.name]: demoPolicy,
    },
    global: {
      auditEnabled: true,
      notificationEnabled: true,
      upstreamMcpCommand: "okx-mcp",
    },
  };
}

function createDefaultRuntime(): ShieldRuntime {
  return {
    sessionStartTime: new Date().toISOString(),
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    warnedRequests: 0,
    dailyVolumeUsd: 0,
    dailyOrdersCount: 0,
    dailyLossUsd: 0,
    lastResetDate: todayDateString(),
  };
}

/** Shield 配置与运行时状态管理器 */
export class ConfigManager {
  private config: ShieldConfig | null = null;

  private ensureDir(): void {
    if (!fs.existsSync(SHIELD_DIR)) {
      fs.mkdirSync(SHIELD_DIR, { recursive: true });
    }
  }

  /** 从磁盘加载配置；文件不存在或解析失败时使用默认配置并写入 */
  load(): ShieldConfig {
    this.ensureDir();

    if (!fs.existsSync(CONFIG_PATH)) {
      const defaultConfig = createDefaultConfig();
      this.save(defaultConfig);
      return defaultConfig;
    }

    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw) as ShieldConfig;
      this.config = parsed;
      return parsed;
    } catch {
      const defaultConfig = createDefaultConfig();
      this.save(defaultConfig);
      return defaultConfig;
    }
  }

  /** 将配置写入磁盘 */
  save(config: ShieldConfig): void {
    this.ensureDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    this.config = config;
  }

  /** 获取当前激活的策略 */
  getActivePolicy(): ShieldPolicy {
    const config = this.config ?? this.load();
    const policy = config.policies[config.activePolicy];

    if (!policy) {
      throw new Error(`Active policy not found: ${config.activePolicy}`);
    }

    return policy;
  }

  /** 切换激活策略并持久化 */
  switchPolicy(name: string): void {
    const config = this.config ?? this.load();

    if (!config.policies[name]) {
      throw new Error(`Policy not found: ${name}`);
    }

    config.activePolicy = name;
    this.save(config);
  }

  /** 从磁盘加载运行时状态；文件不存在或解析失败时使用默认值并写入 */
  loadRuntime(): ShieldRuntime {
    this.ensureDir();

    if (!fs.existsSync(RUNTIME_PATH)) {
      const defaultRuntime = createDefaultRuntime();
      this.saveRuntime(defaultRuntime);
      return defaultRuntime;
    }

    try {
      const raw = fs.readFileSync(RUNTIME_PATH, "utf-8");
      return JSON.parse(raw) as ShieldRuntime;
    } catch {
      const defaultRuntime = createDefaultRuntime();
      this.saveRuntime(defaultRuntime);
      return defaultRuntime;
    }
  }

  /** 将运行时状态写入磁盘 */
  saveRuntime(runtime: ShieldRuntime): void {
    this.ensureDir();
    fs.writeFileSync(RUNTIME_PATH, JSON.stringify(runtime, null, 2), "utf-8");
  }

  /** 检查是否已进入新的一天，需要重置日计数 */
  shouldResetDailyCounters(runtime: ShieldRuntime): boolean {
    return runtime.lastResetDate !== todayDateString();
  }

  /** 重置日计数并更新 lastResetDate */
  resetDailyCounters(runtime: ShieldRuntime): ShieldRuntime {
    return {
      ...runtime,
      dailyVolumeUsd: 0,
      dailyOrdersCount: 0,
      dailyLossUsd: 0,
      lastResetDate: todayDateString(),
    };
  }
}

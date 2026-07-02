"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const default_policy_1 = require("./default-policy");
const SHIELD_DIR = path_1.default.join(os_1.default.homedir(), ".okx", "shield");
const CONFIG_PATH = path_1.default.join(SHIELD_DIR, "config.json");
const RUNTIME_PATH = path_1.default.join(SHIELD_DIR, "runtime.json");
/** 返回本地时区的 YYYY-MM-DD 日期字符串 */
function todayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function createDefaultConfig() {
    return {
        version: "1.0.0",
        activePolicy: default_policy_1.conservativePolicy.name,
        policies: {
            [default_policy_1.conservativePolicy.name]: default_policy_1.conservativePolicy,
            [default_policy_1.moderatePolicy.name]: default_policy_1.moderatePolicy,
            [default_policy_1.demoPolicy.name]: default_policy_1.demoPolicy,
        },
        global: {
            auditEnabled: true,
            notificationEnabled: true,
            upstreamMcpCommand: "okx-mcp",
        },
    };
}
function createDefaultRuntime() {
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
class ConfigManager {
    constructor() {
        this.config = null;
    }
    ensureDir() {
        if (!fs_1.default.existsSync(SHIELD_DIR)) {
            fs_1.default.mkdirSync(SHIELD_DIR, { recursive: true });
        }
    }
    /** 从磁盘加载配置；文件不存在或解析失败时使用默认配置并写入 */
    load() {
        this.ensureDir();
        if (!fs_1.default.existsSync(CONFIG_PATH)) {
            const defaultConfig = createDefaultConfig();
            this.save(defaultConfig);
            return defaultConfig;
        }
        try {
            const raw = fs_1.default.readFileSync(CONFIG_PATH, "utf-8");
            const parsed = JSON.parse(raw);
            this.config = parsed;
            return parsed;
        }
        catch {
            const defaultConfig = createDefaultConfig();
            this.save(defaultConfig);
            return defaultConfig;
        }
    }
    /** 将配置写入磁盘 */
    save(config) {
        this.ensureDir();
        fs_1.default.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
        this.config = config;
    }
    /** 获取当前激活的策略 */
    getActivePolicy() {
        const config = this.config ?? this.load();
        const policy = config.policies[config.activePolicy];
        if (!policy) {
            throw new Error(`Active policy not found: ${config.activePolicy}`);
        }
        return policy;
    }
    /** 切换激活策略并持久化 */
    switchPolicy(name) {
        const config = this.config ?? this.load();
        if (!config.policies[name]) {
            throw new Error(`Policy not found: ${name}`);
        }
        config.activePolicy = name;
        this.save(config);
    }
    /** 从磁盘加载运行时状态；文件不存在或解析失败时使用默认值并写入 */
    loadRuntime() {
        this.ensureDir();
        if (!fs_1.default.existsSync(RUNTIME_PATH)) {
            const defaultRuntime = createDefaultRuntime();
            this.saveRuntime(defaultRuntime);
            return defaultRuntime;
        }
        try {
            const raw = fs_1.default.readFileSync(RUNTIME_PATH, "utf-8");
            return JSON.parse(raw);
        }
        catch {
            const defaultRuntime = createDefaultRuntime();
            this.saveRuntime(defaultRuntime);
            return defaultRuntime;
        }
    }
    /** 将运行时状态写入磁盘 */
    saveRuntime(runtime) {
        this.ensureDir();
        fs_1.default.writeFileSync(RUNTIME_PATH, JSON.stringify(runtime, null, 2), "utf-8");
    }
    /** 检查是否已进入新的一天，需要重置日计数 */
    shouldResetDailyCounters(runtime) {
        return runtime.lastResetDate !== todayDateString();
    }
    /** 重置日计数并更新 lastResetDate */
    resetDailyCounters(runtime) {
        return {
            ...runtime,
            dailyVolumeUsd: 0,
            dailyOrdersCount: 0,
            dailyLossUsd: 0,
            lastResetDate: todayDateString(),
        };
    }
}
exports.ConfigManager = ConfigManager;

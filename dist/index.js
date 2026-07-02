#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk = __importStar(require("chalk"));
const config_manager_1 = require("./config/config-manager");
const mcp_proxy_1 = require("./proxy/mcp-proxy");
function showBanner() {
    console.error(chalk.cyan("🛡️ OKX Agent Shield"));
    console.error(chalk.gray("   Transaction Security Middleware for OKX Agent Trade Kit"));
    console.error("");
}
async function main() {
    commander_1.program
        .name("okx-agent-shield")
        .description("OKX Agent Trade Kit 交易安全中间件")
        .version("0.1.0")
        .option("--policy <name>", "使用指定风控策略", "conservative")
        .option("--upstream <command>", "上游OKX MCP Server命令", "npx @okx_ai/okx-trade-mcp")
        .action(async (options) => {
        showBanner();
        const configManager = new config_manager_1.ConfigManager();
        configManager.load();
        if (options.policy) {
            configManager.switchPolicy(options.policy);
        }
        const activePolicy = configManager.getActivePolicy().name;
        console.error(chalk.blue("🛡️ 启动 OKX Agent Shield"));
        console.error(chalk.gray(`   策略: ${activePolicy}`));
        console.error(chalk.gray("   日志: ~/.okx/shield/audit/"));
        console.error("");
        const proxy = new mcp_proxy_1.McpProxy(configManager);
        process.on("SIGINT", () => {
            console.error("\n👋 Shield 正在关闭...");
            proxy.stop();
            process.exit(0);
        });
        process.on("SIGTERM", () => {
            proxy.stop();
            process.exit(0);
        });
        await proxy.start();
    });
    await commander_1.program.parseAsync(process.argv);
}
main().catch((err) => {
    console.error(chalk.red("错误:", err));
    process.exit(1);
});

#!/usr/bin/env node

import { program } from "commander";
import * as chalk from "chalk";
import { ConfigManager } from "./config/config-manager";
import { McpProxy } from "./proxy/mcp-proxy";

function showBanner(): void {
  console.error(chalk.cyan("🛡️ OKX Agent Shield"));
  console.error(
    chalk.gray(
      "   Transaction Security Middleware for OKX Agent Trade Kit",
    ),
  );
  console.error("");
}

async function main(): Promise<void> {
  program
    .name("okx-agent-shield")
    .description("OKX Agent Trade Kit 交易安全中间件")
    .version("0.1.0")
    .option("--policy <name>", "使用指定风控策略", "conservative")
    .option(
      "--upstream <command>",
      "上游OKX MCP Server命令",
      "npx @okx_ai/okx-trade-mcp",
    )
    .action(async (options) => {
      showBanner();

      const configManager = new ConfigManager();
      configManager.load();

      if (options.policy) {
        configManager.switchPolicy(options.policy);
      }

      const activePolicy = configManager.getActivePolicy().name;

      console.error(chalk.blue("🛡️ 启动 OKX Agent Shield"));
      console.error(chalk.gray(`   策略: ${activePolicy}`));
      console.error(chalk.gray("   日志: ~/.okx/shield/audit/"));
      console.error("");

      const proxy = new McpProxy(configManager);

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

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red("错误:", err));
  process.exit(1);
});

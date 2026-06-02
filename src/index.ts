#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { daemon } from "./daemon-client.js";

import { registerRepoTools } from "./tools/repos.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerPrTools } from "./tools/prs.js";
import { registerCicdTools } from "./tools/cicd.js";
import { registerAgentTools } from "./tools/agents.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  pkgVersion = pkg.version ?? pkgVersion;
} catch { /* fallback to default */ }

const server = new McpServer({
  name: "gitant",
  version: pkgVersion,
});

// Register all tools
registerRepoTools(server);
registerIssueTools(server);
registerPrTools(server);
registerCicdTools(server);
registerAgentTools(server);

async function main() {
  // Check daemon connectivity before starting
  try {
    await daemon.get("/health");
    console.error(`[gitant] daemon reachable at ${process.env.GITANT_DAEMON_URL || "http://localhost:7777"}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    console.error(`[gitant] WARNING: daemon not reachable: ${msg}`);
    console.error("[gitant] MCP server will start anyway — tool calls will fail until daemon is running");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gitant MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

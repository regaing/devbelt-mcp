#!/usr/bin/env node
/**
 * devbelt-mcp — AI 工具 MCP server
 *
 * 提供 53 个在线工具：
 *   encode(7) / crypto(5) / code(5) / json(3) / data(4) / text(14) / unit(1) / net(9) / misc(5)
 *
 * 启动：stdio 直连（本地桌面客户端），node dist/index.js
 */
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerEncodeTools } from "./tools/encode.js";
import { registerCryptoTools } from "./tools/crypto.js";
import { registerCodeTools } from "./tools/code.js";
import { registerJsonTools } from "./tools/json.js";
import { registerDataTools } from "./tools/data.js";
import { registerTextTools } from "./tools/text.js";
import { registerUnitTools } from "./tools/unit.js";
import { registerNetTools } from "./tools/net.js";
import { registerMiscTools } from "./tools/misc.js";

/** 创建并注册全部工具的 MCP server（供 index 与测试复用） */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "devbelt-mcp",
    version: "1.0.0",
  });

  registerEncodeTools(server); // 7
  registerCryptoTools(server); // 5
  registerCodeTools(server); // 5
  registerJsonTools(server); // 3
  registerDataTools(server); // 4
  registerTextTools(server); // 14
  registerUnitTools(server); // 1
  registerNetTools(server); // 9
  registerMiscTools(server); // 5
  return server;
}

// 直接运行时（node dist/index.js）连接 stdio
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

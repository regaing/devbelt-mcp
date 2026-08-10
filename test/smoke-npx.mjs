// 冒烟：模拟 MCP 客户端通过 npx 拉取并调用已发布的包
import { spawn } from "node:child_process";

const child = spawn("npx", ["-y", "@lingxi-agent/devbelt-mcp"], { shell: true });
let buf = "";
const timer = setTimeout(() => {
  console.log("TIMEOUT: 90s 内未完成握手");
  child.kill();
  process.exit(1);
}, 90000);

child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const m = JSON.parse(line);
      if (m.id === 1) {
        console.log("INIT_OK:", m.result.serverInfo.name, m.result.serverInfo.version);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
      }
      if (m.id === 2) {
        console.log("TOOLS:", m.result.tools.length);
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "crypto_hash", arguments: { text: "abc", algorithm: "md5" } },
          }) + "\n",
        );
      }
      if (m.id === 3) {
        console.log("CALL:", m.result.content[0].text);
        clearTimeout(timer);
        child.kill();
        process.exit(0);
      }
    } catch {
      // 非 JSON 行，忽略
    }
  }
});

child.stderr.on("data", (d) => {
  const s = d.toString();
  if (/npm|error|404/i.test(s)) console.log("STDERR:", s.trim().slice(0, 150));
});

child.stdin.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  }) + "\n",
);

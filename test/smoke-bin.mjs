// 冒烟：运行真实安装的 devbelt-mcp bin，验证 MCP 握手与调用
import { spawn } from "node:child_process";

const root = `${process.env.TEMP}\\npm-install-test`;
const pkg = `${root}\\node_modules\\@lingxi-agent\\devbelt-mcp`;
const mode = process.argv[2] ?? "node";
// mode=node: 直接运行包内入口（验证包代码）；mode=cmd: 通过 .cmd shim（验证 bin 链接）
const child =
  mode === "cmd"
    ? spawn("cmd", ["/c", `${root}\\node_modules\\.bin\\devbelt-mcp.cmd`], { cwd: root })
    : spawn("node", [`${pkg}\\dist\\index.js`]);
let buf = "";
const timer = setTimeout(() => {
  console.log("TIMEOUT");
  child.kill();
  process.exit(1);
}, 30000);

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
            params: { name: "unit_convert", arguments: { category: "temperature", value: 100, from: "C", to: "F" } },
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
      // ignore non-JSON
    }
  }
});
child.stderr.on("data", (d) => console.log("STDERR:", d.toString().slice(0, 200)));

child.stdin.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  }) + "\n",
);

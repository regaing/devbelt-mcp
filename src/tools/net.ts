/**
 * 网络查询族：net_whois / net_icp / net_url_status / net_gzip_check /
 * net_dead_link / net_fetch / net_meta_analyze / net_keyword_density /
 * net_websocket_test
 *
 * 全部 TypeScript 原生实现。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import net from "node:net";
import { createHash } from "node:crypto";
import WebSocket from "ws";
import { fetchText, fetchHeaders } from "../utils/fetch.js";
import { McpToolError, guard } from "../utils/errors.js";

/* ---------------- WHOIS（原生，不依赖第三方接口） ---------------- */
function whoisQuery(server: string, query: string, port = 43, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: server, port });
    let data = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; sock.destroy(); reject(new Error(`whois 服务器 ${server} 响应超时`)); }
    }, timeout);
    sock.on("connect", () => sock.write(query + "\r\n"));
    sock.on("data", (chunk) => { data += chunk.toString("utf8"); });
    sock.on("end", () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(data); }
    });
    sock.on("error", (e) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`whois 查询失败：${e.message}`)); }
    });
  });
}

async function whoisLookup(domain: string): Promise<string> {
  const iana = await whoisQuery("whois.iana.org", domain);
  const m = iana.match(/whois:\s*([^\s]+)/i);
  if (!m) return iana;
  return whoisQuery(m[1], domain);
}

/* ---------------- ICP（工信部接口，Node fetch 重写） ---------------- */
async function icpQuery(domain: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const authKey = createHash("md5").update(`testtest${ts}`).digest("hex");
  const base = "https://hlwicpfwc.miit.gov.cn/icpproject_query/api";
  const common = {
    Origin: "https://beian.miit.gov.cn",
    Referer: "https://beian.miit.gov.cn/",
  };
  const authRes = await fetch(`${base}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...common },
    body: `authKey=${authKey}&timeStamp=${ts}`,
  });
  const authJson: any = await authRes.json();
  if (authJson.code !== 200) {
    throw new McpToolError(`工信部认证失败：${authJson.msg ?? "未知错误"}`, "ICP_AUTH");
  }
  const token = authJson.params?.bussiness;
  if (!token) throw new McpToolError("工信部认证未返回 token", "ICP_AUTH");
  const qRes = await fetch(`${base}/icpAbbreviateInfo/queryByCondition`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", token, ...common },
    body: JSON.stringify({ pageNum: "", pageSize: "", unitName: domain, serviceType: 1 }),
  });
  const qJson: any = await qRes.json();
  if (qJson.code !== 200) {
    throw new McpToolError(`ICP 查询失败：${qJson.msg ?? "未知错误"}`, "ICP_QUERY");
  }
  const total = qJson.params?.total ?? 0;
  if (total === 0) return `域名 ${domain} 未查询到备案信息`;
  const list = (qJson.params?.list ?? []).map((r: any) =>
    [
      `网站域名：${r.domain ?? "-"}`,
      `ICP备案号：${r.serviceLicence ?? "-"}`,
      `主办单位：${r.unitName ?? "-"}`,
      `单位性质：${r.natureName ?? "-"}`,
      `审核日期：${r.updateRecordTime ?? "-"}`,
      `是否限制接入：${r.limitAccess ?? "-"}`,
    ].join("\n"),
  );
  return `共 ${total} 条备案信息：\n\n${list.join("\n\n")}`;
}

/* ---------------- 死链检测 ---------------- */
async function checkDeadLinks(url: string, limit: number): Promise<string> {
  const html = await fetchText(url);
  const base = new URL(url);
  const matches = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/g)];
  const hrefs = [...new Set(matches.map((m) => m[1]))]
    .slice(0, limit);
  const absUrls = hrefs.map((h) => {
    try { return new URL(h, base).href; } catch { return null; }
  }).filter((u): u is string => !!u);
  if (absUrls.length === 0) return "页面中未提取到有效链接";
  const out: string[] = [`从 ${url} 提取到 ${absUrls.length} 个链接（限 ${limit} 个），检测中…`];
  for (const u of absUrls) {
    try {
      const { status } = await fetchHeaders(u, { timeout: 8000 });
      const mark = status >= 400 ? "🔴" : "🟢";
      out.push(`${mark} [${status}] ${u}`);
    } catch (e: any) {
      out.push(`🔴 [ERR] ${u}（${e?.message ?? e}）`);
    }
  }
  return out.join("\n");
}

/* ---------------- WebSocket 完整会话测试 ---------------- */
function wsTest(opts: {
  url: string;
  messages: string[];
  ping: boolean;
  waitFor?: string;
  timeout: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const log: string[] = [];
    const ws = new WebSocket(opts.url, { handshakeTimeout: opts.timeout });
    const totalTimer = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      reject(new McpToolError(`会话总超时（${opts.timeout * 3}ms）`, "WS_TIMEOUT"));
    }, opts.timeout * 3);
    let idleTimer: NodeJS.Timeout | null = null;
    let active = false;

    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        log.push(`◼ 空闲超时（${opts.timeout}ms 无活动），自动关闭`);
        ws.close();
      }, opts.timeout);
    };

    ws.on("open", () => {
      log.push(`✓ 连接成功：${opts.url}`);
      log.push(`  协议：${ws.protocol || "-"}；扩展：${ws.extensions || "-"}`);
      active = true;
      // 发送消息
      for (const msg of opts.messages) {
        ws.send(msg);
        log.push(`→ 发送：${msg}`);
      }
      if (opts.ping) {
        ws.ping();
        log.push("→ 发送协议级 ping");
      }
      armIdle();
    });
    ws.on("pong", () => {
      log.push("✓ 收到 pong（连接存活）");
      armIdle();
    });
    ws.on("message", (data) => {
      const text = typeof data === "string" ? data : data.toString();
      log.push(`← 收到：${text}`);
      if (opts.waitFor && text.includes(opts.waitFor)) {
        log.push("✓ 命中 wait_for 期望响应");
        clearTimeout(totalTimer);
        ws.close();
        return;
      }
      armIdle();
    });
    ws.on("close", (code, reason) => {
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      log.push(`◼ 连接关闭：code=${code}${reason ? `，reason=${reason.toString()}` : ""}`);
      resolve(log.join("\n"));
    });
    ws.on("error", (e) => {
      clearTimeout(totalTimer);
      reject(new McpToolError(`WebSocket 连接失败：${e.message}`, "WS_CONNECT"));
    });
  });
}

export function registerNetTools(server: McpServer): void {
  server.tool(
    "net_whois",
    "WHOIS 域名信息查询（原生实现：连接 whois.iana.org 递归查询权威服务器，不依赖第三方接口）",
    { domain: z.string().describe("域名，如 example.com") },
    guard(async ({ domain }) => {
      const d = domain.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}(\.[a-zA-Z0-9-]{1,63})+$/.test(d)) {
        throw new McpToolError(`域名格式不正确：${domain}`, "INVALID_PARAM");
      }
      const raw = await whoisLookup(d);
      if (raw.includes("No match") || /NOT FOUND/i.test(raw)) return `域名 ${d} 未注册或 WHOIS 无记录`;
      const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("%") && !l.startsWith("#"));
      return `域名：${d}\n\n${lines.slice(0, 80).join("\n")}`;
    }),
  );

  server.tool(
    "net_icp",
    "ICP 备案查询（工信部官方接口）：输入域名查询备案号、主办单位等信息",
    { domain: z.string() },
    guard(async ({ domain }) => {
      const d = domain.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}(\.[a-zA-Z0-9-]{1,63})+$/.test(d)) {
        throw new McpToolError(`域名格式不正确：${domain}`, "INVALID_PARAM");
      }
      return await icpQuery(d);
    }),
  );

  server.tool(
    "net_url_status",
    "URL 状态检测：返回 HTTP 状态码、关键响应头、最终地址",
    { url: z.string() },
    guard(async ({ url }) => {
      const { status, headers, finalUrl } = await fetchHeaders(url);
      const picks = ["content-type", "content-length", "content-encoding", "server", "location", "cache-control", "last-modified", "etag"];
      const headLines = picks
        .filter((k) => headers[k.toLowerCase()])
        .map((k) => `  ${k}: ${headers[k.toLowerCase()]}`);
      const mark = status >= 400 ? "🔴" : status >= 300 ? "🟡" : "🟢";
      return [`${mark} HTTP ${status} ${url}`, `  最终地址：${finalUrl}`, ...headLines].join("\n");
    }),
  );

  server.tool(
    "net_gzip_check",
    "Gzip 压缩检测：检查服务器是否开启 gzip 及压缩前后大小对比",
    { url: z.string() },
    guard(async ({ url }) => {
      const { status, headers } = await fetchHeaders(url, {
        headers: { "Accept-Encoding": "gzip, deflate" },
      });
      const encoding = headers["content-encoding"] ?? "";
      const compressed = headers["content-length"] ? Number(headers["content-length"]) : null;
      let rawSize = 0;
      try {
        rawSize = Buffer.byteLength(await fetchText(url));
      } catch { /* ignore */ }
      if (!encoding) {
        return `HTTP ${status}\nContent-Encoding：无\n❌ 服务器未开启 Gzip 压缩`;
      }
      const rate = compressed && rawSize > 0 ? Math.round((1 - compressed / rawSize) * 1000) / 10 : null;
      return [
        `HTTP ${status}`,
        `Content-Encoding：${encoding}`,
        `压缩后大小：${compressed ?? "-"} bytes`,
        `压缩前大小（解压后）：${rawSize} bytes`,
        rate !== null ? `压缩率：${rate}%` : "压缩率：无法计算（缺少 Content-Length）",
      ].join("\n");
    }),
  );

  server.tool(
    "net_dead_link",
    "网站死链检测：抓取页面提取链接并逐个检查 HTTP 状态（默认最多检查 20 个）",
    {
      url: z.string(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    guard(({ url, limit }) => checkDeadLinks(url, limit)),
  );

  server.tool(
    "net_fetch",
    "网页抓取/内容采集：抓取 URL 返回解码后的文本（自动处理 GBK/GB2312 编码）。fake_ip=true 时可伪装国内 IP（谨慎使用）",
    {
      url: z.string(),
      fake_ip: z.boolean().default(false),
      max_chars: z.number().int().min(100).max(200000).default(20000).describe("返回内容截断长度"),
    },
    guard(async ({ url, fake_ip, max_chars }) => {
      const text = await fetchText(url, { fakeIp: fake_ip });
      const titleM = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleM ? titleM[1].trim() : "";
      const stripped = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const head = title ? `标题：${title}\n\n` : "";
      const body = stripped.length > max_chars ? stripped.slice(0, max_chars) + `\n…（已截断，总 ${stripped.length} 字符）` : stripped;
      return head + body || "（页面无可提取文本）";
    }),
  );

  server.tool(
    "net_meta_analyze",
    "网页 Meta 标签分析：抓取页面提取 title/keywords/description 并给出长度建议",
    { url: z.string() },
    guard(async ({ url }) => {
      const html = await fetchText(url);
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1]?.trim() ?? "";
      const keywords = (html.match(/<meta\s+name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i) ?? [])[1]?.trim() ?? "";
      const description = (html.match(/<meta\s+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ?? [])[1]?.trim() ?? "";
      const len = (s: string) => Array.from(s).length;
      return [
        `标题（${len(title)} 字符${len(title) > 60 ? " ⚠️ 建议 ≤60" : ""}）：${title || "（无）"}`,
        `关键词（${len(keywords)} 字符${len(keywords) > 100 ? " ⚠️ 建议 ≤100" : ""}）：${keywords || "（无）"}`,
        `描述（${len(description)} 字符${len(description) > 150 ? " ⚠️ 建议 ≤150" : ""}）：${description || "（无）"}`,
      ].join("\n");
    }),
  );

  server.tool(
    "net_keyword_density",
    "网页关键词密度检测：抓取页面统计指定关键词出现次数与密度",
    { url: z.string(), keyword: z.string() },
    guard(async ({ url, keyword }) => {
      const html = await fetchText(url);
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, "");
      const total = text.length;
      const count = text.split(keyword).length - 1;
      const kwLen = keyword.length;
      const density = total > 0 ? Math.round((count * kwLen) / total * 1000) / 10 : 0;
      return [
        `页面文本总长度：${total} 字符`,
        `关键词「${keyword}」出现次数：${count}`,
        `关键词密度：${density}%（建议 2%~8%）`,
      ].join("\n");
    }),
  );

  server.tool(
    "net_websocket_test",
    "WebSocket 完整会话测试：连接（显示握手协议/扩展）→ 按序发送消息 → 协议级 ping（RTT）→ 收集全部响应 → wait_for 匹配期望响应 → 空闲自动关闭。支持文本/JSON 消息",
    {
      url: z.string().describe("ws:// 或 wss:// 地址"),
      messages: z.array(z.string()).optional().describe("按序发送的消息列表"),
      ping: z.boolean().default(true).describe("是否发送协议级 ping"),
      wait_for: z.string().optional().describe("等待包含此内容的响应后关闭"),
      timeout: z.number().int().min(1000).max(60000).default(5000).describe("空闲超时毫秒"),
    },
    guard(({ url, messages, ping, wait_for, timeout }) => {
      if (!/^wss?:\/\//i.test(url)) throw new McpToolError("URL 需以 ws:// 或 wss:// 开头", "INVALID_PARAM");
      return wsTest({ url, messages: messages ?? [], ping, waitFor: wait_for, timeout });
    }),
  );
}

/**
 * 网络查询族：net_whois / net_icp / net_url_status / net_gzip_check /
 * net_dead_link / net_fetch / net_meta_analyze / net_keyword_density /
 * net_websocket_test / net_ip_info / net_dns_query / net_http_request /
 * net_ssl_check / net_port_check
 *
 * 全部 TypeScript 原生实现（net_ip_info/net_dns_query/net_port_check 纯本地）。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import fs from "node:fs";
import { createHash } from "node:crypto";
import WebSocket from "ws";
import { fetchText, fetchHeaders } from "../utils/fetch.js";
import { McpToolError, guard } from "../utils/errors.js";
import { ipLookup } from "../lib/ipdata.js";

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
  server.tool(
    "net_ip_info",
    "IP 信息查询（纯本地，无三方接口）：不传 ip 返回本机网卡信息；传 ip 查询归属地/类型（内置精简段表）",
    { ip: z.string().optional().describe("IPv4 地址，省略则查本机网卡") },
    guard(({ ip }) => {
      if (!ip) {
        const ifaces = os.networkInterfaces();
        const list: Array<{ interface: string; family: string; address: string; internal: boolean }> = [];
        for (const [name, addrs] of Object.entries(ifaces)) {
          for (const a of addrs ?? []) {
            list.push({ interface: name, family: a.family, address: a.address, internal: a.internal });
          }
        }
        return JSON.stringify({ mode: "本机网卡", interfaces: list }, null, 2);
      }
      if (net.isIP(ip) !== 4) throw new McpToolError("仅支持 IPv4 地址查询", "INVALID_PARAM");
      return JSON.stringify(ipLookup(ip), null, 2);
    }),
  );

  server.tool(
    "net_dns_query",
    "DNS 解析查询（node:dns 原生实现，零三方接口）。支持 A/AAAA/CNAME/MX/TXT/NS/SOA/PTR/ANY，可指定自定义 DNS 服务器",
    {
      domain: z.string().describe("域名"),
      type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "ANY"]).default("A").describe("记录类型"),
      server: z.string().optional().describe("自定义 DNS 服务器 IP（默认系统 DNS）"),
    },
    guard(async ({ domain, type, server }) => {
      const dnsModule = await import("node:dns/promises");
      const resolver: any = server ? new dnsModule.Resolver() : dnsModule;
      if (server) resolver.setServers([server]);
      const methodMap: Record<string, string> = {
        A: "resolve4", AAAA: "resolve6", CNAME: "resolveCname", MX: "resolveMx",
        TXT: "resolveTxt", NS: "resolveNs", SOA: "resolveSoa", PTR: "resolvePtr", ANY: "resolveAny",
      };
      try {
        const result = await resolver[methodMap[type]](domain);
        return JSON.stringify({ domain, type, server: server ?? "系统默认", records: result }, null, 2);
      } catch (e: any) {
        throw new McpToolError(`DNS 查询失败（${type} ${domain}）：${e?.code ?? e?.message ?? e}`, "DNS_QUERY");
      }
    }),
  );

  /* ---------------- HTTP 请求调试（curl 等价，原生 fetch） ---------------- */
  server.tool(
    "net_http_request",
    "HTTP 请求调试（curl 等价）：支持 GET/POST/PUT/DELETE/PATCH/HEAD、自定义 header/body、JSON 自动序列化、multipart/form-data 文件上传、重定向控制、超时",
    {
      url: z.string().describe("请求 URL"),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]).default("GET"),
      headers: z.record(z.string()).optional().describe("自定义请求头（对象，如 {\"Authorization\": \"Bearer xxx\"}）"),
      body: z.string().optional().describe("请求体字符串（自定义 content-type 时使用）"),
      json: z.record(z.any()).optional().describe("JSON 对象，自动序列化并设 Content-Type: application/json"),
      form: z.object({
        fields: z.record(z.string()).optional().describe("普通表单字段"),
        file_path: z.string().optional().describe("要上传的文件路径（multipart/form-data）"),
        file_field: z.string().default("file").describe("文件字段名"),
      }).optional().describe("multipart/form-data 表单/文件上传"),
      timeout: z.number().int().min(1000).max(60000).default(15000).describe("超时毫秒"),
      follow_redirects: z.boolean().default(true).describe("是否跟随重定向"),
    },
    guard(async ({ url, method, headers, body, json, form, timeout, follow_redirects }) => {
      if (!/^https?:\/\//i.test(url)) throw new McpToolError("URL 需以 http:// 或 https:// 开头", "INVALID_PARAM");
      const started = Date.now();
      try {
        const init: any = { method, redirect: follow_redirects ? "follow" : "manual", signal: AbortSignal.timeout(timeout), headers: { ...(headers ?? {}) } };
        // JSON 自动序列化
        if (json !== undefined) {
          init.body = JSON.stringify(json);
          init.headers["Content-Type"] = "application/json";
        } else if (form) {
          // multipart/form-data
          const boundary = `----devbelt${Date.now()}${Math.random().toString(16).slice(2)}`;
          const parts: Buffer[] = [];
          for (const [k, v] of Object.entries(form.fields ?? {})) {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
          }
          if (form.file_path) {
            if (!fs.existsSync(form.file_path)) throw new McpToolError(`文件不存在：${form.file_path}`, "FILE_NOT_FOUND");
            const fileBuf = fs.readFileSync(form.file_path);
            const fileName = form.file_path.split(/[\\/]/).pop() ?? "file";
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${form.file_field}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
            parts.push(fileBuf);
            parts.push(Buffer.from(`\r\n`));
          }
          parts.push(Buffer.from(`--${boundary}--\r\n`));
          init.body = Buffer.concat(parts);
          init.headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        } else if (body !== undefined) {
          init.body = body;
        }
        const res = await fetch(url, init);
        const buf = Buffer.from(await res.arrayBuffer());
        const text = buf.toString("utf8");
        const result: any = {
          status: res.status,
          status_text: res.statusText,
          final_url: res.url,
          content_type: res.headers.get("content-type") ?? "",
          elapsed_ms: Date.now() - started,
          size: buf.length,
          headers: Object.fromEntries(res.headers.entries()),
          body: text.slice(0, 100000),
        };
        if (text.length > 100000) result.truncated = true;
        return JSON.stringify(result, null, 2);
      } catch (e: any) {
        throw new McpToolError(`HTTP 请求失败：${e?.message ?? e}`, "HTTP_REQUEST");
      }
    }),
  );

  /* ---------------- SSL 证书检查（node:tls） ---------------- */
  server.tool(
    "net_ssl_check",
    "SSL 证书检查（node:tls）：查询域名证书有效期/剩余天数/签发者/主题/证书链",
    {
      host: z.string().describe("域名或 IP"),
      port: z.number().int().min(1).max(65535).default(443).describe("端口（默认 443）"),
    },
    guard(({ host, port }) => {
      return new Promise((resolve) => {
        const started = Date.now();
        let settled = false;
        const finish = (data: unknown) => { if (!settled) { settled = true; resolve(JSON.stringify(data, null, 2)); } };
        const timer = setTimeout(() => finish({ error: "连接超时（10s）" }), 10000);
        const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
          const cert = sock.getPeerCertificate(true);
          const now = Date.now();
          const validFrom = new Date(cert.valid_from).getTime();
          const validTo = new Date(cert.valid_to).getTime();
          const daysRemaining = Math.floor((validTo - now) / 86400000);
          clearTimeout(timer);
          finish({
            host, port,
            valid: validTo > now && validFrom < now,
            days_remaining: daysRemaining,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
            subject: cert.subject,
            issuer: cert.issuer,
            serial: cert.serialNumber,
            fingerprint256: cert.fingerprint256,
            chain_length: cert.issuerCertificate ? 2 : 1,
            elapsed_ms: Date.now() - started,
          });
        });
        sock.on("error", (e) => { clearTimeout(timer); finish({ error: `TLS 连接失败：${e.message}` }); });
      });
    }),
  );

  /* ---------------- 端口连通检测（node:net） ---------------- */
  server.tool(
    "net_port_check",
    "TCP 端口连通性检测（node:net）：检测目标主机端口是否开放（tcping 等价）",
    {
      host: z.string().describe("目标主机名或 IP"),
      port: z.number().int().min(1).max(65535).describe("目标端口"),
      timeout: z.number().int().min(500).max(30000).default(5000).describe("超时毫秒"),
    },
    guard(({ host, port, timeout }) => {
      return new Promise((resolve) => {
        const started = Date.now();
        const sock = net.createConnection({ host, port });
        let settled = false;
        const finish = (data: unknown) => { if (!settled) { settled = true; resolve(JSON.stringify(data, null, 2)); } };
        sock.setTimeout(timeout, () => { finish({ host, port, open: false, error: `超时（${timeout}ms）`, elapsed_ms: Date.now() - started }); sock.destroy(); });
        sock.on("connect", () => { finish({ host, port, open: true, elapsed_ms: Date.now() - started }); sock.destroy(); });
        sock.on("error", (e: any) => { finish({ host, port, open: false, error: e?.code ?? e?.message, elapsed_ms: Date.now() - started }); });
      });
    }),
  );
}

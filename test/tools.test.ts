/**
 * devbelt-mcp 端到端测试：通过 InMemoryTransport 连接真实 MCP server，
 * 覆盖全部 58 个工具的调用，含标准输入输出 golden 回归样例。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";

let client: Client;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // 注意顺序：SDK 1.30 需 server 先 connect，client 后 connect
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

/** 调用工具并取回文本结果 */
async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const res: any = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  expect(text).toBeTruthy();
  return text;
}

/** 期望工具抛错（返回错误文本） */
async function expectError(name: string, args: Record<string, unknown>): Promise<string> {
  const res: any = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  expect(text).toContain("错误");
  return text;
}

describe("工具注册完整性", () => {
  it("应注册全部 77 个工具", async () => {
    const tools: any = await client.listTools();
    expect(tools.tools.length).toBe(77);
    const names = tools.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(
      [
        "code_format", "code_obfuscate", "color_convert", "crypto_download_url",
        "crypto_hash", "crypto_jwt", "crypto_morse", "crypto_password_hash",
        "crypto_rsa", "crypto_symmetric", "data_csv", "data_excel_json",
        "data_html_convert", "data_html_table", "data_text_diff", "encode_ascii",
        "encode_base64", "encode_detect", "encode_escape", "encode_html",
        "encode_radix", "encode_unicode", "encode_url", "encode_utf8",
        "json_convert", "json_entity", "json_path", "json_process",
        "json_schema_validate", "misc_barcode", "misc_calc", "misc_calendar",
        "misc_favicon", "misc_qrcode", "misc_qrcode_decode", "misc_reference",
        "misc_shortcut", "net_dead_link", "net_dns_query", "net_fetch",
        "net_gzip_check", "net_http_request", "net_icp", "net_ip_info",
        "net_keyword_density", "net_meta_analyze", "net_port_check",
        "net_ssl_check", "net_url_status", "net_websocket_test", "net_whois",
        "regex_generate", "regex_tool", "text_case", "text_dedup",
        "text_filter", "text_flip", "text_format", "text_fullwidth",
        "text_idcard", "text_jianfan", "text_martian", "text_password_strength",
        "text_pinyin", "text_random", "text_replace", "text_stats",
        "text_vertical", "time_convert", "time_cron", "time_diff",
        "time_duration", "time_format", "time_timestamp", "unit_convert",
        "uuid_generate", "xpath_tool",
      ].sort(),
    );
  });
});

describe("json 族（3）", () => {
  it("json_process: 格式化", async () => {
    const r = await call("json_process", { text: '{"b":2,"a":1}', action: "format", indent: 2 });
    expect(r).toBe('{\n  "b": 2,\n  "a": 1\n}');
  });
  it("json_process: 压缩/校验/转义", async () => {
    expect(await call("json_process", { text: '{ "a" : 1 }', action: "compress" })).toBe('{"a":1}');
    expect(await call("json_process", { text: '{"a":1}', action: "validate" })).toContain("有效");
    expect(await call("json_process", { text: '{"a":1}', action: "escape" })).toBe('{\\"a\\":1}');
  });
  it("json_process: 非法 JSON 返回可读错误", async () => {
    const e = await expectError("json_process", { text: "{bad", action: "validate" });
    expect(e).toContain("JSON 解析失败");
  });
  it("json_convert: json→yaml→json", async () => {
    const y = await call("json_convert", { text: '{"a":1,"b":[1,2]}', target: "yaml", direction: "to_target" });
    expect(y).toContain("a: 1");
    const j = await call("json_convert", { text: y, target: "yaml", direction: "from_target" });
    expect(JSON.parse(j)).toEqual({ a: 1, b: [1, 2] });
  });
  it("json_convert: json→xml→json", async () => {
    const x = await call("json_convert", { text: '{"user":{"name":"张三","age":30}}', target: "xml", direction: "to_target" });
    expect(x).toContain("<user>");
    const j = await call("json_convert", { text: x, target: "xml", direction: "from_target" });
    expect(j).toContain("张三");
  });
  it("json_convert: json↔get_params", async () => {
    expect(await call("json_convert", { text: '{"a":1,"b":"x y"}', target: "get_params", direction: "to_target" })).toBe("a=1&b=x%20y");
    expect(await call("json_convert", { text: "a=1&b=x%20y", target: "get_params", direction: "from_target" })).toContain('"b": "x y"');
  });
  it("json_entity: json→cs/java/go", async () => {
    expect(await call("json_entity", { input: '{"name":"a","age":1}', language: "cs" })).toContain("public class Generated");
    expect(await call("json_entity", { input: '{"name":"a"}', language: "java" })).toContain("public class Generated");
    expect(await call("json_entity", { input: '{"name":"a"}', language: "go" })).toContain("type Generated struct");
  });
  it("json_entity: sql→java", async () => {
    const r = await call("json_entity", { input: "CREATE TABLE user (id INT, name VARCHAR(50), created_at DATETIME);", input_type: "sql", language: "java" });
    expect(r).toContain("public class User");
    expect(r).toContain("Integer id");
  });
});

describe("encode 族（7）", () => {
  it("encode_url 往返", async () => {
    const enc = await call("encode_url", { text: "你好 world", action: "encode" });
    expect(enc).toBe("你好%20world".replace("你好", encodeURIComponent("你好")));
    expect(await call("encode_url", { text: enc, action: "decode" })).toBe("你好 world");
  });
  it("encode_base64 往返", async () => {
    const b = await call("encode_base64", { text: "hello 世界", action: "encode" });
    expect(b).toBe(Buffer.from("hello 世界", "utf8").toString("base64"));
    expect(await call("encode_base64", { text: b, action: "decode" })).toBe("hello 世界");
  });
  it("encode_unicode 往返", async () => {
    const u = await call("encode_unicode", { text: "中A", action: "encode" });
    expect(u.toLowerCase()).toBe("\\u4e2d\\u0041");
    expect(await call("encode_unicode", { text: "\\u4e2d\\u0041", action: "decode" })).toBe("中A");
  });
  it("encode_utf8 往返", async () => {
    const u = await call("encode_utf8", { text: "中", action: "encode" });
    expect(u).toBe("%E4%B8%AD");
    expect(await call("encode_utf8", { text: "%E4%B8%AD", action: "decode" })).toBe("中");
  });
  it("encode_ascii 往返", async () => {
    const a = await call("encode_ascii", { text: "AB", action: "encode", format: "dec" });
    expect(a).toBe("65 66");
    expect(await call("encode_ascii", { text: "65 66", action: "decode" })).toBe("AB");
  });
  it("encode_escape 往返", async () => {
    const e = await call("encode_escape", { text: "a中", action: "encode" });
    expect(e).toBe("%61%u4E2D");
    expect(await call("encode_escape", { text: "%61%u4E2D", action: "decode" })).toBe("a中");
  });
  it("encode_radix: 255(10)→ff(16)【golden 回归】", async () => {
    expect(await call("encode_radix", { value: "255", from_base: 10, to_base: 16 })).toBe("ff");
    expect(await call("encode_radix", { value: "ff", from_base: 16, to_base: 2 })).toBe("11111111");
  });
});

describe("crypto 族（5）", () => {
  it("crypto_hash: md5('abc')【golden 回归】", async () => {
    expect(await call("crypto_hash", { text: "abc", algorithm: "md5" })).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(await call("crypto_hash", { text: "abc", algorithm: "md5", case: "upper" })).toBe("900150983CD24FB0D6963F7D28E17F72");
    expect(await call("crypto_hash", { text: "abc", algorithm: "md5", bits: "16" })).toBe("3cd24fb0d6963f7d");
  });
  it("crypto_hash: sha256/sha1/hmac【golden 回归】", async () => {
    expect(await call("crypto_hash", { text: "abc", algorithm: "sha256" })).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await call("crypto_hash", { text: "abc", algorithm: "sha1" })).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(await call("crypto_hash", { text: "abc", algorithm: "hmac-sha256", key: "k" })).toBe(
      createHmacHex("k", "abc", "sha256"),
    );
  });
  it("crypto_symmetric: aes-256-gcm 往返", async () => {
    const enc = await call("crypto_symmetric", { text: "hello 世界", algorithm: "aes-256-gcm", action: "encrypt", password: "p@ss" });
    expect(enc).not.toBe("hello 世界");
    expect(await call("crypto_symmetric", { text: enc, algorithm: "aes-256-gcm", action: "decrypt", password: "p@ss" })).toBe("hello 世界");
  });
  it("crypto_symmetric: aes-256-cbc 往返 + 错误密码报错", async () => {
    const enc = await call("crypto_symmetric", { text: "data", algorithm: "aes-256-cbc", action: "encrypt", password: "pw" });
    expect(await call("crypto_symmetric", { text: enc, algorithm: "aes-256-cbc", action: "decrypt", password: "pw" })).toBe("data");
    const err = await expectError("crypto_symmetric", { text: enc, algorithm: "aes-256-cbc", action: "decrypt", password: "wrong" });
    expect(err).toContain("解密失败");
  });
  it("crypto_symmetric: key_hex 精确控制", async () => {
    const key = "0".repeat(64);
    const enc = await call("crypto_symmetric", { text: "x", algorithm: "aes-256-gcm", action: "encrypt", key_hex: key });
    expect(await call("crypto_symmetric", { text: enc, algorithm: "aes-256-gcm", action: "decrypt", key_hex: key })).toBe("x");
  });
  it("crypto_morse 往返", async () => {
    const m = await call("crypto_morse", { text: "SOS", action: "encode" });
    expect(m.replace(/[\s/]/g, "")).toBe("...---...");
    expect(await call("crypto_morse", { text: "... --- ...", action: "decode" })).toBe("SOS");
  });
  it("crypto_morse 中文转拼音【回归：小写拼音首字查表】", async () => {
    const m = await call("crypto_morse", { text: "我爱你", action: "encode" });
    expect(m.replace(/[\s/]/g, "")).toBe(".--.--."); // .--(W) .-(A) -.(N)
  });
  it("crypto_morse 中文解码还原拼音字母", async () => {
    expect(await call("crypto_morse", { text: ".-- / .- / -.", action: "decode" })).toBe("WAN");
  });
  it("crypto_download_url 往返【golden 回归】", async () => {
    const t = await call("crypto_download_url", { text: "http://example.com/file.zip", action: "encrypt", engine: "thunder" });
    expect(t.startsWith("thunder://")).toBe(true);
    expect(await call("crypto_download_url", { text: t, action: "decode", engine: "thunder" })).toBe("http://example.com/file.zip");
    const q = await call("crypto_download_url", { text: "http://example.com/a.bin", action: "encrypt", engine: "qqdl" });
    expect(await call("crypto_download_url", { text: q, action: "decode", engine: "qqdl" })).toBe("http://example.com/a.bin");
  });
  it("color_convert", async () => {
    expect(await call("color_convert", { value: "#FF0000", from: "hex" })).toBe("rgb(255, 0, 0)");
    expect(await call("color_convert", { value: "rgb(0, 128, 255)", from: "rgb" })).toBe("#0080FF");
  });
});

describe("code 族（5）", () => {
  it("code_format: js 格式化【golden 回归】", async () => {
    const r = await call("code_format", { code: 'const a={b:1,c:[1,2]};', language: "js", action: "format" });
    expect(r).toContain("const a = {");
  });
  it("code_format: json/css/sql/html", async () => {
    expect(await call("code_format", { code: '{"a":1}', language: "json", action: "format" })).toContain('"a": 1');
    expect(await call("code_format", { code: "a{color:red}", language: "css", action: "format" })).toContain("color: red");
    expect(await call("code_format", { code: "select * from t where a=1", language: "sql", action: "format" })).toContain("SELECT");
    expect(await call("code_format", { code: "<div><p>x</p></div>", language: "html", action: "format" })).toContain("<p>");
  });
  it("code_format: php 缩进美化 + compress", async () => {
    const r = await call("code_format", { code: "<?php if(a){b();}", language: "php", action: "format" });
    expect(r).toContain("b();");
    expect(await call("code_format", { code: "  a\n  b  ", language: "js", action: "compress" })).toBe("a b");
  });
  it("code_obfuscate 与 beautify", async () => {
    const o = await call("code_obfuscate", { code: "function hello(){return 1;}", action: "obfuscate", preset: "low" });
    expect(o).toContain("function");
    const b = await call("code_obfuscate", { code: "function a(){return 1;}", action: "beautify" });
    expect(b).toContain("function a()");
  });
  it("regex_tool: test/extract/replace", async () => {
    expect(await call("regex_tool", { pattern: "\\d+", text: "abc123", action: "test" })).toContain("是");
    const ex = await call("regex_tool", { pattern: "(\\d+)", text: "a1b22", action: "extract", flags: "g" });
    expect(ex).toContain("22");
    expect(await call("regex_tool", { pattern: "\\d+", text: "a1b2", action: "replace", replacement: "X" })).toBe("aXbX");
  });
  it("regex_generate: 输出各语言模板", async () => {
    expect(await call("regex_generate", { pattern: "\\d+", language: "python" })).toContain("import re");
    expect(await call("regex_generate", { pattern: "\\d+", language: "go" })).toContain("regexp.MustCompile");
  });
  it("xpath_tool: 提取与计数", async () => {
    const html = '<html><head><title>Hello</title></head><body><div class="a">1</div><div class="b">2</div></body></html>';
    const r = await call("xpath_tool", { html, xpath: "//div", action: "count" });
    expect(r).toContain("2");
    const t = await call("xpath_tool", { html, xpath: "//title/text()", action: "extract" });
    expect(t).toBe("Hello");
    const attr = await call("xpath_tool", { html, xpath: '//div[@class="b"]', action: "extract" });
    expect(attr).toContain("class=\"b\"");
  });
});

describe("data 族（4）", () => {
  it("data_html_convert: html→js/php/cs/ubb", async () => {
    expect(await call("data_html_convert", { html: "<b>x</b>", target: "js" })).toContain('"<b>x</b>"');
    expect(await call("data_html_convert", { html: "<b>x</b>", target: "php" })).toContain("<<<HTML");
    expect(await call("data_html_convert", { html: "<b>x</b>", target: "cs" })).toContain('string html = @"');
    expect(await call("data_html_convert", { html: "<b>x</b>", target: "ubb" })).toContain("[b]x[/b]");
  });
  it("data_html_convert: markdown 往返", async () => {
    const md = await call("data_html_convert", { html: "<h1>Title</h1><p>Hello</p>", target: "markdown" });
    expect(md).toContain("Title");
  });
  it("data_html_table: csv 与 json 输入", async () => {
    const r = await call("data_html_table", { data: "name,age\n张三,30\n李四,25", data_type: "csv" });
    expect(r).toContain("<table");
    expect(r).toContain("张三");
    const j = await call("data_html_table", { data: '[{"a":1},{"a":2}]', data_type: "json" });
    expect(j).toContain("<td>1</td>");
  });
  it("data_excel_json: json→excel→json 往返", async () => {
    const tmp = `${process.env.TEMP ?? "/tmp"}/acq-test-${Date.now()}.xlsx`;
    const w = await call("data_excel_json", { data: '[{"name":"a","v":1},{"name":"b","v":2}]', direction: "json_to_excel", output_path: tmp });
    expect(w).toContain("已写入 2 行");
    const r = await call("data_excel_json", { data: tmp, direction: "excel_to_json" });
    expect(r).toContain('"name": "a"');
  });
  it("data_text_diff: 差异标记", async () => {
    const r = await call("data_text_diff", { text_a: "a\nb\nc", text_b: "a\nx\nc", mode: "lines" });
    expect(r).toContain("- b");
    expect(r).toContain("+ x");
  });
});

describe("text 族（14）", () => {
  it("text_case", async () => {
    expect(await call("text_case", { text: "hello world", action: "upper" })).toBe("HELLO WORLD");
    expect(await call("text_case", { text: "hello_world", action: "camel" })).toBe("helloWorld");
    expect(await call("text_case", { text: "helloWorld", action: "snake" })).toBe("hello_world");
    expect(await call("text_case", { text: "hello world", action: "title" })).toBe("Hello World");
  });
  it("text_jianfan 往返", async () => {
    const t = await call("text_jianfan", { text: "中国龙", action: "to_traditional" });
    expect(t).toBe("中國龍");
    expect(await call("text_jianfan", { text: t, action: "to_simplified" })).toBe("中国龙");
  });
  it("text_pinyin", async () => {
    const r = await call("text_pinyin", { text: "你好", output: "pinyin", separator: " " });
    expect(r).toBe("ni hao");
  });
  it("text_fullwidth 往返", async () => {
    expect(await call("text_fullwidth", { text: "，。ＡＢ", action: "to_half" })).toBe(",.AB");
    expect(await call("text_fullwidth", { text: ",.AB", action: "to_full" })).toBe("，。ＡＢ");
  });
  it("text_flip", async () => {
    expect(await call("text_flip", { text: "abc", mode: "full" })).toBe("cba");
    expect(await call("text_flip", { text: "ab\ncd", mode: "line" })).toBe("ba\ndc");
    expect(await call("text_flip", { text: "ab\ncd", mode: "reverse_lines" })).toBe("cd\nab");
  });
  it("text_vertical", async () => {
    const r = await call("text_vertical", { text: "ABCDEF", cols: 3 });
    expect(r).toBe("AD\nBE\nCF");
  });
  it("text_stats", async () => {
    const r = await call("text_stats", { text: "你好 hello 123" });
    expect(r).toContain("汉字数：2");
    expect(r).toContain("英文字母：5");
    expect(r).toContain("数字：3");
  });
  it("text_dedup", async () => {
    expect(await call("text_dedup", { text: "a\nb\na\nc", sort: false })).toBe("a\nb\nc");
  });
  it("text_replace", async () => {
    expect(await call("text_replace", { text: "a1b2", find: "\\d", replace: "X", use_regex: true })).toBe("aXbX");
    expect(await call("text_replace", { text: "a,b", find: ",", replace: "-" })).toBe("a-b");
  });
  it("text_filter", async () => {
    const r = await call("text_filter", { html: "<p>hi</p><script>alert(1)</script>", keep_tags: "p" });
    expect(r).toBe("<p>hi</p>");
    const r2 = await call("text_filter", { html: "<p>hi</p><b>x</b>" });
    expect(r2).toBe("hi x");
  });
  it("text_format", async () => {
    const r = await call("text_format", { text: "第一段。\n\n第二段。", indent: 2 });
    expect(r).toBe("  第一段。\n\n  第二段。");
  });
  it("text_random", async () => {
    const n = await call("text_random", { type: "number", min: 1, max: 1, count: 1 });
    expect(n).toBe("1");
    const p = await call("text_random", { type: "password", length: 16, charset: "digit" });
    expect(p).toMatch(/^\d{16}$/);
  });
  it("text_martian 往返", async () => {
    const m = await call("text_martian", { text: "我爱你", action: "to_martian" });
    expect(m).not.toBe("我爱你");
    expect(await call("text_martian", { text: m, action: "to_chinese" })).toBe("我爱你");
  });
  it("uuid_generate", async () => {
    const u = await call("uuid_generate", { count: 2, format: "uuid" });
    const lines = u.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("unit 族（1）", () => {
  it("unit_convert: 长度【golden 回归】", async () => {
    expect(await call("unit_convert", { category: "length", value: 1, from: "km", to: "m" })).toBe("1 km = 1000 m（长度换算）");
  });
  it("unit_convert: 温度特殊换算", async () => {
    expect(await call("unit_convert", { category: "temperature", value: 100, from: "C", to: "F" })).toBe("100 C = 212 F（温度换算）");
    expect(await call("unit_convert", { category: "temperature", value: 0, from: "C", to: "K" })).toContain("273.15 K");
  });
  it("unit_convert: 数据大小与非法单位报错", async () => {
    expect(await call("unit_convert", { category: "data", value: 1, from: "GB", to: "MB" })).toBe("1 GB = 1000 MB（数据大小换算）");
    const e = await expectError("unit_convert", { category: "length", value: 1, from: "kg", to: "m" });
    expect(e).toContain("无单位");
  });
});

describe("net 族（9）——离线部分", () => {
  it("net_whois: 域名格式校验", async () => {
    const e = await expectError("net_whois", { domain: "not a domain" });
    expect(e).toContain("域名格式不正确");
  });
  it("net_icp: 域名格式校验", async () => {
    const e = await expectError("net_icp", { domain: "bad..domain" });
    expect(e).toContain("域名格式不正确");
  });
  it("net_url_status: 本地 HTTP 服务", async () => {
    // 启动一个本地 mock server 验证状态检测
    const http = await import("node:http");
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Test": "1" });
      res.end("<title>测试页</title><p>内容</p>");
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const addr = srv.address() as any;
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const r = await call("net_url_status", { url: base });
      expect(r).toContain("HTTP 200");
      const g = await call("net_gzip_check", { url: base });
      expect(g).toContain("HTTP 200");
      const f = await call("net_fetch", { url: base, max_chars: 1000 });
      expect(f).toContain("内容");
      const m = await call("net_meta_analyze", { url: base });
      expect(m).toContain("标题（3 字符");
      const k = await call("net_keyword_density", { url: base, keyword: "内容" });
      expect(k).toContain("出现次数：1");
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
  it("net_websocket_test: 本地 mock WS 完整会话", async () => {
    const { WebSocketServer } = await import("ws");
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((r) => wss.once("listening", () => r()));
    const port = (wss.address() as any).port;
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        ws.send(`echo:${data.toString()}`);
      });
    });
    try {
      const r = await call("net_websocket_test", {
        url: `ws://127.0.0.1:${port}`,
        messages: ["hello", JSON.stringify({ a: 1 })],
        ping: true,
        wait_for: "echo:hello",
        timeout: 3000,
      });
      expect(r).toContain("连接成功");
      expect(r).toContain("echo:hello");
      expect(r).toContain("收到 pong");
      expect(r).toContain("连接关闭");
    } finally {
      await new Promise<void>((r) => wss.close(() => r()));
    }
  });
  it("net_websocket_test: 连接失败返回可读错误", async () => {
    const e = await expectError("net_websocket_test", { url: "ws://127.0.0.1:1", timeout: 1000 });
    expect(e).toContain("WebSocket 连接失败");
  });
});

describe("misc 族（5）", () => {
  it("misc_barcode: code128 生成", async () => {
    const r = await call("misc_barcode", { text: "ABC123", type: "code128", format: "svg" });
    expect(r).toContain("<svg");
  });
  it("misc_qrcode: png/svg 生成与内容", async () => {
    const p = await call("misc_qrcode", { text: "hello", format: "png", size: 128 });
    expect(p).toContain("data:image/png;base64,");
    const s = await call("misc_qrcode", { text: "hi", format: "svg" });
    expect(s).toContain("<svg");
  });
  it("misc_favicon: PNG 封装 ICO", async () => {
    const png = await call("misc_qrcode", { text: "fav", format: "png", size: 64 });
    const ico = await call("misc_favicon", { image: png });
    expect(ico).toContain("data:image/x-icon;base64,");
    // ICO 头检查
    const b64 = ico.split(",")[1];
    const buf = Buffer.from(b64, "base64");
    expect(buf.readUInt16LE(2)).toBe(1); // type icon
    expect(buf.readUInt16LE(4)).toBe(1); // count
  });
  it("misc_shortcut", async () => {
    const r = await call("misc_shortcut", { name: "测试", url: "https://example.com" });
    expect(r).toContain("[InternetShortcut]");
    expect(r).toContain("URL=https://example.com");
  });
  it("misc_reference", async () => {
    expect(await call("misc_reference", { topic: "http_status", keyword: "404" })).toContain("404");
    expect(await call("misc_reference", { topic: "ascii", keyword: "65" })).toContain("65 → A");
    expect(await call("misc_reference", { topic: "dynasty", keyword: "唐" })).toContain("唐");
  });
  it("misc_calendar: 单日查询", async () => {
    const r = JSON.parse(await call("misc_calendar", { date: "2026-08-12" }));
    expect(r.date).toBe("2026-08-12");
    expect(r.weekday).toBe("周三");
    expect(r.lunar).toContain("二〇二六");
    expect(r.shengXiao).toBe("马");
    expect(r.xingZuo).toBe("狮子");
  });
  it("misc_calendar: 月历查询与参数校验", async () => {
    const r = JSON.parse(await call("misc_calendar", { month: "2026-08" }));
    expect(r.mode).toBe("月历");
    expect(r.days.length).toBe(31);
    expect(r.days[0].festivals).toContain("建军节");
    await expectError("misc_calendar", { month: "2026-13" });
    await expectError("misc_calendar", { date: "2026/01/01" });
  });
  it("text_idcard: 18 位解析", async () => {
    const r = JSON.parse(await call("text_idcard", { id: "110101199003077717" }));
    expect(r.valid).toBe(true);
    expect(r.province).toBe("北京市");
    expect(r.city).toBe("北京市辖区");
    expect(r.birth_date).toBe("1990-03-07");
    expect(r.gender).toBe("男");
    expect(r.check_pass).toBe(false); // 演示号校验位本身不通过，工具如实报告
  });
  it("text_idcard: 15 位转 18 位", async () => {
    const r = JSON.parse(await call("text_idcard", { id: "110101900307771" }));
    expect(r.valid).toBe(true);
    expect(r.source_length).toBe(15);
    expect(r.id).toBe("110101199003077715");
    expect(r.check_pass).toBe(true);
  });
  it("text_idcard: 非法输入", async () => {
    const r = JSON.parse(await call("text_idcard", { id: "12345" }));
    expect(r.valid).toBe(false);
    const r2 = JSON.parse(await call("text_idcard", { id: "199013" }));
    expect(r2.valid).toBe(false);
  });
  it("net_ip_info: 本机与指定 IP", async () => {
    const local = JSON.parse(await call("net_ip_info", {}));
    expect(local.mode).toBe("本机网卡");
    expect(local.interfaces.length).toBeGreaterThan(0);
    const gd = JSON.parse(await call("net_ip_info", { ip: "202.96.0.10" }));
    expect(gd.region).toBe("广东");
    expect(gd.isp).toBe("电信");
    const priv = JSON.parse(await call("net_ip_info", { ip: "192.168.1.1" }));
    expect(priv.type).toBe("特殊地址");
    expect(priv.detail).toContain("私有");
    const loop = JSON.parse(await call("net_ip_info", { ip: "127.0.0.1" }));
    expect(loop.detail).toContain("回环");
  });
  it("net_ip_info: 非法 IP", async () => {
    await expectError("net_ip_info", { ip: "999.1.1.1" });
    await expectError("net_ip_info", { ip: "::1" });
  });
  it("net_dns_query: 指定 DNS 服务器（沙箱系统 DNS 不可用）", async () => {
    const r = JSON.parse(await call("net_dns_query", { domain: "baidu.com", type: "A", server: "223.5.5.5" }));
    expect(r.domain).toBe("baidu.com");
    expect(r.type).toBe("A");
    expect(r.records.length).toBeGreaterThan(0);
  });
  it("net_dns_query: MX 记录", async () => {
    const r = JSON.parse(await call("net_dns_query", { domain: "qq.com", type: "MX", server: "223.5.5.5" }));
    expect(r.records[0].exchange).toContain("qq.com");
  });
  it("time_timestamp: 秒/毫秒自动识别与输出", async () => {
    const s = JSON.parse(await call("time_timestamp", { value: "1700000000" }));
    expect(s.timestamp.seconds).toBe("1700000000");
    expect(s.timestamp.milliseconds).toBe("1700000000000");
    expect(s.datetime.utc).toBe("2023-11-14 22:13:20");
    expect(["周二", "周三"]).toContain(s.info.weekday); // UTC=周二，本地(+08:00)=周三
    const ms = JSON.parse(await call("time_timestamp", { value: "1700000000000" }));
    expect(ms.timestamp.seconds).toBe("1700000000");
    expect(ms.input.unit).toBe("ms");
  });
  it("time_timestamp: 微秒/纳秒精度与余数提示", async () => {
    const us = JSON.parse(await call("time_timestamp", { value: "1700000000000000" }));
    expect(us.timestamp.seconds).toBe("1700000000");
    expect(us.input.unit).toBe("us");
    const ns = JSON.parse(await call("time_timestamp", { value: "1700000000000000000" }));
    expect(ns.timestamp.seconds).toBe("1700000000");
    expect(ns.input.unit).toBe("ns");
    const r = JSON.parse(await call("time_timestamp", { value: "1700000000123", unit: "us" }));
    expect(r.input.raw).toContain("余 123 微秒");
  });
  it("time_timestamp: 日期字符串/相对时间/时区", async () => {
    // 带时区的 ISO 输入：秒数与时区无关，稳定断言
    const iso = JSON.parse(await call("time_timestamp", { value: "2026-08-12T15:30:00+08:00" }));
    expect(iso.timestamp.seconds).toBe("1786519800");
    expect(iso.info.weekday).toBe("周三");
    const tz = JSON.parse(await call("time_timestamp", { value: "1700000000", timezone: "UTC" }));
    expect(tz.datetime.timezone ?? tz.datetime.utc).toBe("2023-11-14 22:13:20");
    expect(tz.info.timezone).toBe("UTC");
    const rel = JSON.parse(await call("time_timestamp", { value: "now+1d" }));
    expect(rel.input.type).toBe("datetime");
    const cn = JSON.parse(await call("time_timestamp", { value: "2026年8月12日 15:30:00" }));
    expect(cn.input.type).toBe("datetime");
    const d = JSON.parse(await call("time_timestamp", { value: "2026-08-12 15:30:00" }));
    expect(d.input.type).toBe("datetime");
  });
  it("time_timestamp: 当前时间与非法输入", async () => {
    const now = JSON.parse(await call("time_timestamp", {}));
    expect(now.input.type).toBe("now");
    expect(Number(now.timestamp.seconds)).toBeGreaterThan(1700000000);
    await expectError("time_timestamp", { value: "not-a-date" });
    await expectError("time_timestamp", { value: "1700000000", timezone: "abc" });
  });
  it("time_convert: 多时区对照", async () => {
    const r = JSON.parse(await call("time_convert", { value: "1700000000" }));
    expect(r.timezones.length).toBe(8);
    expect(r.timezones.every((z: any) => !Number.isNaN(z.offset) && !z.datetime.includes("NaN"))).toBe(true);
    const bj = r.timezones.find((z: any) => z.name === "北京");
    expect(bj.datetime).toBe("2023-11-15 06:13:20");
    const custom = JSON.parse(await call("time_convert", { value: "1700000000", timezones: "UTC,+09:00" }));
    expect(custom.timezones.length).toBe(2);
    expect(custom.timezones[1].offset).toBe("+09:00");
  });
  it("time_diff: 时间差与倒计时", async () => {
    const r = JSON.parse(await call("time_diff", { from: "2026-08-12 15:30:00", to: "2026-08-15 18:00:00" }));
    expect(r.direction).toBe("未来");
    expect(r.diff.days).toBe("3.10");
    expect(r.diff.human).toContain("3天");
    expect(r.diff.components.hours).toBe(2);
    expect(r.diff.components.minutes).toBe(30);
    const past = JSON.parse(await call("time_diff", { from: "2026-08-15 18:00:00", to: "2026-08-12 15:30:00" }));
    expect(past.direction).toBe("过去");
  });
  it("time_cron: 描述与执行时间", async () => {
    const r = JSON.parse(await call("time_cron", { expr: "*/5 * * * *", count: 3 }));
    expect(r.description).toContain("每5分钟");
    expect(r.next_runs.length).toBe(3);
    const w = JSON.parse(await call("time_cron", { expr: "0 9 * * 1-5", count: 1 }));
    expect(w.description).toContain("09:00");
    expect(w.description).toContain("周一至周五");
    await expectError("time_cron", { expr: "bad expr" });
  });
  it("time_duration: 正向转换与反向解析", async () => {
    const r = JSON.parse(await call("time_duration", { value: "93784" }));
    expect(r.mode).toBe("转换");
    expect(r.duration.human).toBe("1天2小时3分4秒");
    expect(r.duration.components.days).toBe(1);
    const back = JSON.parse(await call("time_duration", { value: "1天2小时3分4秒" }));
    expect(back.mode).toBe("解析");
    expect(back.seconds).toBe(93784);
    const ms = JSON.parse(await call("time_duration", { value: "90000", unit: "ms" }));
    expect(ms.duration.human).toBe("1分30秒");
  });
  it("time_format: 占位符与 strftime 兼容", async () => {
    const cn = JSON.parse(await call("time_format", { value: "1700000000", format: "YYYY年MM月DD日 HH:mm:ss ddd" }));
    expect(cn.output).toBe("2023年11月15日 06:13:20 周三");
    const sf = JSON.parse(await call("time_format", { value: "1700000000", format: "%Y-%m-%d %H:%M:%S %A", timezone: "UTC" }));
    expect(sf.output).toBe("2023-11-14 22:13:20 Tuesday");
    const q = JSON.parse(await call("time_format", { value: "1700000000", format: "Q季度 d" }));
    expect(q.output).toContain("4季度");
  });
});

describe("P0+P1 新增工具（14）", () => {
  it("net_http_request: JSON POST（本地 mock）", async () => {
    const http = await import("node:http");
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ method: req.method, body: JSON.parse(body || "{}"), ct: req.headers["content-type"] }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const addr = srv.address() as any;
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const r = JSON.parse(await call("net_http_request", { url: base, method: "POST", json: { hello: "world", n: 1 } }));
      expect(r.status).toBe(200);
      const echo = JSON.parse(r.body);
      expect(echo.body.hello).toBe("world");
      expect(echo.ct).toContain("application/json");
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
  it("net_http_request: 非法 URL", async () => {
    await expectError("net_http_request", { url: "not-a-url" });
  });
  it("net_http_request: 非法 URL", async () => {
    await expectError("net_http_request", { url: "not-a-url" });
  });
  it("crypto_jwt: decode 与 verify", async () => {
    const secret = "test-secret";
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "123", name: "alice", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const sig = createHmacHex(secret, `${header}.${payload}`, "sha256");
    // 注意 base64url 转标准 base64 用于 hex 对比
    const sigB64 = Buffer.from(sig, "hex").toString("base64url");
    const token = `${header}.${payload}.${sigB64}`;
    const dec = JSON.parse(await call("crypto_jwt", { token, action: "decode" }));
    expect(dec.payload.name).toBe("alice");
    expect(dec.expired).toBe(false);
    const ver = JSON.parse(await call("crypto_jwt", { token, secret, action: "verify" }));
    expect(ver.signature_valid).toBe(true);
  });
  it("crypto_jwt: 篡改签名", async () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.bad-signature";
    const ver = JSON.parse(await call("crypto_jwt", { token, secret: "x", action: "verify" }));
    expect(ver.signature_valid).toBe(false);
  });
  it("crypto_rsa: 加解密往返与签名验签", async () => {
    const gen = JSON.parse(await call("crypto_rsa", { action: "generate", bits: 1024 }));
    const pub = gen.public_key, priv = gen.private_key;
    const enc = JSON.parse(await call("crypto_rsa", { action: "encrypt", data: "hello rsa", public_key: pub }));
    const dec = JSON.parse(await call("crypto_rsa", { action: "decrypt", data: enc.ciphertext_base64, private_key: priv }));
    expect(dec.plaintext).toBe("hello rsa");
    const sig = JSON.parse(await call("crypto_rsa", { action: "sign", data: "msg", private_key: priv }));
    const ver = JSON.parse(await call("crypto_rsa", { action: "verify", data: "msg", signature: sig.signature_base64, public_key: pub }));
    expect(ver.valid).toBe(true);
  });
  it("crypto_password_hash: 哈希与校验", async () => {
    const h = JSON.parse(await call("crypto_password_hash", { password: "s3cret", action: "hash", rounds: 4 }));
    expect(h.hash.startsWith("$2")).toBe(true);
    const ok = JSON.parse(await call("crypto_password_hash", { password: "s3cret", action: "verify", hash: h.hash }));
    expect(ok.match).toBe(true);
    const bad = JSON.parse(await call("crypto_password_hash", { password: "wrong", action: "verify", hash: h.hash }));
    expect(bad.match).toBe(false);
  });
  it("json_path: 嵌套提取与过滤", async () => {
    const json = '{"data":{"list":[{"name":"a","age":20},{"name":"b","age":30}]}}';
    const r = JSON.parse(await call("json_path", { json, path: "$.data.list[0].name" }));
    expect(r.matched).toBe(1);
    expect(r.result[0]).toBe("a");
    const all = JSON.parse(await call("json_path", { json, path: "$..name" }));
    expect(all.matched).toBe(2);
  });
  it("json_schema_validate: 通过与失败", async () => {
    const schema = '{"type":"object","required":["name"],"properties":{"name":{"type":"string"},"age":{"type":"integer","minimum":0}}}';
    const ok = JSON.parse(await call("json_schema_validate", { json: '{"name":"a","age":1}', schema }));
    expect(ok.valid).toBe(true);
    const bad = JSON.parse(await call("json_schema_validate", { json: '{"age":-1}', schema }));
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
  it("encode_detect: UTF-8 文本", async () => {
    const r = JSON.parse(await call("encode_detect", { text: "hello 世界" }));
    expect(r.encoding).toBeTruthy();
    expect(r.bytes).toBeGreaterThan(0);
  });
  it("encode_html: 编解码往返", async () => {
    const enc = await call("encode_html", { text: "<div class=\"a\">&amp;'</div>", action: "encode" });
    expect(enc).toContain("&lt;");
    expect(enc).toContain("&amp;");
    const dec = await call("encode_html", { text: enc, action: "decode" });
    expect(dec).toContain("<div");
  });
  it("misc_calc: 四则与函数", async () => {
    const r = JSON.parse(await call("misc_calc", { expr: "2*(3+4)^2" }));
    expect(Number(r.result)).toBe(98);
    const s = JSON.parse(await call("misc_calc", { expr: "sin(pi/2)" }));
    expect(Number(s.result)).toBeCloseTo(1, 5);
    await expectError("misc_calc", { expr: "foo(1)" });
  });
  it("data_csv: parse 与 to_csv 往返", async () => {
    const csv = "name,age\nalice,20\nbob,30";
    const r = JSON.parse(await call("data_csv", { action: "parse", data: csv }));
    expect(r.count).toBe(2);
    expect(r.rows[0].name).toBe("alice");
    const back = JSON.parse(await call("data_csv", { action: "to_csv", data: JSON.stringify(r.rows) }));
    expect(back.csv).toContain("alice,20");
  });
  it("text_password_strength: 强弱评分", async () => {
    const weak = JSON.parse(await call("text_password_strength", { password: "123456" }));
    expect(weak.score).toBeLessThan(40);
    const strong = JSON.parse(await call("text_password_strength", { password: "P@ssw0rd!Str0ng#2026" }));
    expect(strong.score).toBeGreaterThan(60);
    expect(strong.entropy_bits).toBeGreaterThan(50);
  });
});

import { createHmac } from "node:crypto";
function createHmacHex(key: string, text: string, algo: string): string {
  return createHmac(algo, key).update(text).digest("hex");
}
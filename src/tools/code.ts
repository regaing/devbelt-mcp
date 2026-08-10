/**
 * 代码工具族：code_format / code_obfuscate / regex_tool / regex_generate / xpath_tool
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { format as prettierFormat } from "prettier";
import { format as sqlFormat } from "sql-formatter";
import JavaScriptObfuscator from "javascript-obfuscator";
import { McpToolError, guard } from "../utils/errors.js";

const LANGUAGES = [
  "js", "ts", "json", "css", "html", "yaml", "markdown", "sql",
  "php", "java", "cs", "c", "cpp", "python", "ruby", "perl", "vbs", "go",
] as const;

/** prettier 可处理的语言 */
const PRETTIER_PARSERS: Record<string, string> = {
  js: "babel", ts: "typescript", json: "json", css: "css", html: "html",
  yaml: "yaml", markdown: "markdown",
};

/** 花括号缩进美化（c/cpp/java/cs/php 等） */
function bracketIndent(code: string): string {
  const lines = code.split("\n");
  let level = 0;
  const out: string[] = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (line === "") continue;
    // 行首的右括号先减缩进
    const leadingClosers = (line.match(/^[}\])]+/) ?? [""])[0].length;
    if (leadingClosers) level = Math.max(0, level - 1);
    out.push("  ".repeat(level) + line);
    // 统计行内括号增量（忽略字符串内，简化处理）
    const opens = (line.match(/\{[^{}]*$/g) ?? []).length;
    const closes = (line.match(/^\s*\}/g) ?? []).length;
    const net = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (net > 0) level += net;
  }
  return out.join("\n");
}

/** 简单压缩：去空行与行首尾空格 */
function compressCode(code: string): string {
  return code
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
}

export function registerCodeTools(server: McpServer): void {
  server.tool(
    "code_format",
    `代码格式化/压缩。language 可选：${LANGUAGES.join("、")}。js/ts/json/css/html/yaml/markdown 走 prettier，sql 走 sql-formatter，其余语言为基础缩进美化`,
    {
      code: z.string().describe("要格式化的代码"),
      language: z.enum([...LANGUAGES]).describe("代码语言"),
      action: z.enum(["format", "compress"]).default("format"),
      indent: z.number().int().min(2).max(8).default(2).describe("缩进空格数"),
    },
    guard(async ({ code, language, action, indent }) => {
      if (action === "compress") return compressCode(code);
      if (PRETTIER_PARSERS[language]) {
        try {
          return await prettierFormat(code, {
            parser: PRETTIER_PARSERS[language],
            tabWidth: indent,
            semi: true,
            singleQuote: false,
          });
        } catch (e: any) {
          throw new McpToolError(`代码格式化失败（语法可能不完整）：${e?.message ?? e}`, "FORMAT");
        }
      }
      if (language === "sql") {
        try {
          return (sqlFormat as any)(code, { language: "sql", keywordCase: "upper", indent: " ".repeat(indent) });
        } catch (e: any) {
          throw new McpToolError(`SQL 格式化失败：${e?.message ?? e}`, "FORMAT");
        }
      }
      return bracketIndent(code);
    }),
  );

  server.tool(
    "code_obfuscate",
    "JS 代码混淆（单向操作，无法还原）与还原美化。obfuscate 使用 javascript-obfuscator；beautify 仅做格式化还原（不恢复混淆语义）。禁止用于隐藏恶意逻辑",
    {
      code: z.string(),
      action: z.enum(["obfuscate", "beautify"]).default("obfuscate"),
      preset: z.enum(["low", "high"]).default("low").describe("混淆强度：low 保留可读性，high 最大混淆"),
    },
    guard(async ({ code, action, preset }) => {
      if (action === "beautify") {
        try {
          return await prettierFormat(code, { parser: "babel", tabWidth: 2 });
        } catch (e: any) {
          throw new McpToolError(`美化失败：${e?.message ?? e}`, "FORMAT");
        }
      }
      try {
        return JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: preset === "high",
          deadCodeInjection: preset === "high",
          identifierNamesGenerator: "hexadecimal",
          renameGlobals: false,
          selfDefending: preset === "high",
          stringArray: true,
          stringArrayThreshold: preset === "high" ? 0.75 : 0.1,
        }).getObfuscatedCode();
      } catch (e: any) {
        throw new McpToolError(`混淆失败：${e?.message ?? e}`, "OBFUSCATE");
      }
    }),
  );

  server.tool(
    "regex_tool",
    "正则表达式测试/提取/替换。action=test 返回是否匹配；extract 返回所有匹配与捕获组；replace 用 replacement 替换",
    {
      pattern: z.string(),
      text: z.string(),
      action: z.enum(["test", "extract", "replace"]).default("test"),
      flags: z.string().default("g").describe("如 g/i/m/s"),
      replacement: z.string().default("").describe("replace 时的替换文本（$1 为捕获组）"),
    },
    guard(({ pattern, text, action, flags, replacement }) => {
      let re: RegExp;
      try {
        re = new RegExp(pattern, flags);
      } catch (e: any) {
        throw new McpToolError(`正则无效：${e?.message ?? e}`, "REGEX");
      }
      if (action === "replace") {
        try {
          return text.replace(re, replacement);
        } catch (e: any) {
          throw new McpToolError(`替换失败：${e?.message ?? e}`, "REGEX");
        }
      }
      if (action === "test") {
        const count = flags.includes("g") ? (text.match(re) ?? []).length : re.test(text) ? 1 : 0;
        return `匹配：${count > 0 ? "是 ✓" : "否 ✗"}，共 ${count} 处`;
      }
      re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g");
      const results: string[] = [];
      let m: RegExpExecArray | null;
      let idx = 0;
      while ((m = re.exec(text)) !== null && idx < 500) {
        results.push(`[${m.index}] ${JSON.stringify(m[0])}${m.length > 1 ? ` → 组: ${m.slice(1).map((g) => JSON.stringify(g)).join(", ")}` : ""}`);
        if (m.index === re.lastIndex) re.lastIndex++;
        idx++;
      }
      return results.length ? results.join("\n") : "无匹配";
    }),
  );

  server.tool(
    "regex_generate",
    "为正则表达式生成各语言代码（js/java/go/php/ruby/python/cs）",
    {
      pattern: z.string(),
      language: z.enum(["js", "java", "go", "php", "ruby", "python", "cs"]).default("js"),
      flags: z.string().default("g"),
    },
    guard(({ pattern, language, flags }) => {
      const esc = pattern.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      switch (language) {
        case "js":
          return `const regex = new RegExp('${esc}', '${flags}');\n// 或字面量：/${pattern.replace(/\//g, "\\/")}/${flags}`;
        case "python":
          return `import re\npattern = re.compile(r'${pattern}', re.IGNORECASE)  # 按需调整 flag`;
        case "java":
          return `import java.util.regex.Pattern;\nPattern pattern = Pattern.compile("${pattern.replace(/"/g, '\\"')}");`;
        case "go":
          return `import "regexp"\nre := regexp.MustCompile(\`${pattern}\`)`;
        case "php":
          return `$pattern = '/${pattern.replace(/\//g, "\\/")}/${flags.includes("i") ? "i" : ""}';`;
        case "ruby":
          return `regex = /${pattern.replace(/\//g, "\\/")}/${flags}`;
        case "cs":
          return `using System.Text.RegularExpressions;\nvar regex = new Regex(@"${pattern.replace(/"/g, '""')}");`;
        default:
          return `// 不支持的语言：${language}`;
      }
    }),
  );

  server.tool(
    "xpath_tool",
    "简易 XPath 提取：支持 //tag、tag、tag[@attr=\"value\"]、/text() 形式（基于正则的轻量实现，不支持复杂轴表达式）",
    {
      html: z.string(),
      xpath: z.string().describe("如 //div、//a[@href] 或 //title/text()"),
      action: z.enum(["extract", "count"]).default("extract"),
    },
    guard(({ html, xpath, action }) => {
      const tagM = xpath.match(/([a-zA-Z][a-zA-Z0-9_-]*)/);
      if (!tagM) throw new McpToolError("XPath 中未找到标签名", "XPATH");
      const tag = tagM[1];
      const attrM = xpath.match(/@([a-zA-Z0-9_-]+)(?:\s*=\s*["']([^"']*)["'])?/);
      const attr = attrM?.[1];
      const attrVal = attrM?.[2];
      const wantText = xpath.endsWith("/text()");
      const tagRe = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "g");
      const results: string[] = [];
      let m: RegExpExecArray | null;
      let idx = 0;
      while ((m = tagRe.exec(html)) !== null && idx < 200) {
        const attrs = m[1];
        if (attr) {
          const attrRe = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`);
          const am = attrs.match(attrRe);
          if (!am) continue;
          if (attrVal && am[1] !== attrVal) continue;
        }
        const inner = m[2];
        const text = inner
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        results.push(wantText ? text : `<${tag}${attrs}>${inner}</${tag}>`);
        idx++;
      }
      if (action === "count") return `共 ${results.length} 个节点`;
      return results.length ? results.join("\n---\n") : "无匹配节点";
    }),
  );
}

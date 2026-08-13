/**
 * 编码转换族：encode_url / encode_base64 / encode_unicode / encode_utf8 /
 * encode_ascii / encode_escape / encode_radix
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import jschardet from "jschardet";
import { McpToolError, guard } from "../utils/errors.js";

export function registerEncodeTools(server: McpServer): void {
  server.tool(
    "encode_url",
    "URL 编码/解码（encodeURIComponent 风格，中文与特殊字符转 %XX）",
    { text: z.string(), action: z.enum(["encode", "decode"]).default("encode") },
    guard(({ text, action }) => {
      if (action === "encode") return encodeURIComponent(text);
      try {
        return decodeURIComponent(text);
      } catch (e: any) {
        throw new McpToolError(`URL 解码失败：${e?.message ?? e}`, "DECODE");
      }
    }),
  );

  server.tool(
    "encode_base64",
    "Base64 编码/解码。mode=text 处理字符串；mode=image 时：encode 将本地图片转为 dataURL，decode 将 base64 写回图片文件（需 output_path）",
    {
      text: z.string(),
      action: z.enum(["encode", "decode"]).default("encode"),
      mode: z.enum(["text", "image"]).default("text"),
      output_path: z.string().optional().describe("image 模式 decode 时的输出文件路径"),
    },
    guard(({ text, action, mode, output_path }) => {
      if (mode === "text") {
        if (action === "encode") return Buffer.from(text, "utf8").toString("base64");
        try {
          return Buffer.from(text, "base64").toString("utf8");
        } catch {
          throw new McpToolError("Base64 解码失败：内容不是合法的 base64", "DECODE");
        }
      }
      // image 模式
      if (action === "encode") {
        const abs = path.resolve(text);
        if (!fs.existsSync(abs)) throw new McpToolError(`文件不存在：${text}`, "FILE_NOT_FOUND");
        const buf = fs.readFileSync(abs);
        const ext = path.extname(abs).slice(1).toLowerCase().replace("jpg", "jpeg");
        return `data:image/${ext};base64,${buf.toString("base64")}`;
      }
      if (!output_path) throw new McpToolError("image 模式 decode 需要 output_path 参数", "INVALID_PARAM");
      const b64 = text.includes(",") ? text.split(",")[1] : text;
      const buf = Buffer.from(b64, "base64");
      fs.writeFileSync(path.resolve(output_path), buf);
      return `已写入 ${buf.length} 字节到 ${output_path}`;
    }),
  );

  server.tool(
    "encode_unicode",
    "Unicode（\\uXXXX）与字符互转。encode=中文/字符转 \\uXXXX 形式；decode=\\uXXXX 还原为字符",
    { text: z.string(), action: z.enum(["encode", "decode"]).default("encode") },
    guard(({ text, action }) => {
      if (action === "encode") {
        return Array.from(text)
          .map((c) => {
            const code = c.codePointAt(0)!;
            return code > 0xffff
              ? String.fromCodePoint(0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff))
                  .split("")
                  .map((ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
                  .join("")
              : "\\u" + code.toString(16).padStart(4, "0");
          })
          .join("");
      }
      try {
        return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      } catch {
        throw new McpToolError("Unicode 解码失败", "DECODE");
      }
    }),
  );

  server.tool(
    "encode_utf8",
    "UTF-8 编码与中文互转。encode=中文转 %XX 十六进制字节串；decode=字节串还原中文",
    { text: z.string(), action: z.enum(["encode", "decode"]).default("encode") },
    guard(({ text, action }) => {
      if (action === "encode") {
        return Buffer.from(text, "utf8").toString("hex").replace(/(..)/g, "%$1").toUpperCase();
      }
      const hex = text.replace(/%/g, "");
      if (!/^[0-9a-fA-F]+$/.test(hex)) throw new McpToolError("UTF-8 解码失败：非十六进制串", "DECODE");
      return Buffer.from(hex, "hex").toString("utf8");
    }),
  );

  server.tool(
    "encode_ascii",
    "ASCII 编码/解码。encode=字符转十进制与十六进制码；decode=码值转字符（支持 10 进制或 0x 前缀 16 进制）",
    {
      text: z.string(),
      action: z.enum(["encode", "decode"]).default("encode"),
      format: z.enum(["dec", "hex"]).default("dec").describe("encode 时的输出格式"),
    },
    guard(({ text, action, format }) => {
      if (action === "encode") {
        return Array.from(text)
          .map((c) => {
            const code = c.codePointAt(0)!;
            return format === "hex" ? `0x${code.toString(16)}` : String(code);
          })
          .join(" ");
      }
      const parts = text.split(/[\s,]+/).filter(Boolean);
      return parts
        .map((p) => {
          const code = /^0x/i.test(p) ? parseInt(p, 16) : parseInt(p, 10);
          if (Number.isNaN(code) || code < 0 || code > 0x10ffff) {
            throw new McpToolError(`无效码值：${p}`, "DECODE");
          }
          return String.fromCodePoint(code);
        })
        .join("");
    }),
  );

  server.tool(
    "encode_escape",
    "Escape 编码/解码（JS escape 风格：%XX / %uXXXX）",
    { text: z.string(), action: z.enum(["encode", "decode"]).default("encode") },
    guard(({ text, action }) => {
      if (action === "encode") {
        return Array.from(text)
          .map((c) => {
            const code = c.codePointAt(0)!;
            if (code > 0xff) return "%u" + code.toString(16).padStart(4, "0").toUpperCase();
            return "%" + code.toString(16).padStart(2, "0").toUpperCase();
          })
          .join("");
      }
      try {
        return text.replace(/%u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(
          /%([0-9a-fA-F]{2})/g,
          (_, hex) => String.fromCharCode(parseInt(hex, 16)),
        );
      } catch {
        throw new McpToolError("Escape 解码失败", "DECODE");
      }
    }),
  );

  server.tool(
    "encode_radix",
    "任意进制互转（2~36 进制，支持大数）。例：value=255, from_base=10, to_base=16 → ff",
    {
      value: z.string().describe("要转换的数值（字符串形式）"),
      from_base: z.number().int().min(2).max(36),
      to_base: z.number().int().min(2).max(36),
    },
    guard(({ value, from_base, to_base }) => {
      try {
        if (from_base !== 10) {
          // 按 from_base 解析（支持非十进制输入，如 "ff"）
          const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
          let acc = 0n;
          for (const ch of value.toLowerCase()) {
            const d = BigInt(digits.indexOf(ch));
            if (d < 0n || d >= BigInt(from_base)) throw new Error(`字符 ${ch} 不是 ${from_base} 进制`);
            acc = acc * BigInt(from_base) + d;
          }
          return acc.toString(to_base);
        }
        const big = BigInt(value);
        return big.toString(to_base);
      } catch (e: any) {
        if (e instanceof McpToolError) throw e;
        throw new McpToolError(`进制转换失败：${e?.message ?? e}`, "RADIX");
      }
    }),
  );

  /* ---------------- 文本编码检测（jschardet） ---------------- */
  server.tool(
    "encode_detect",
    "文本编码检测（jschardet）：检测字符串/文件的字符编码（UTF-8/GBK/GB2312/UTF-16 等）",
    {
      text: z.string().optional().describe("待检测文本（与 file_path 二选一）"),
      file_path: z.string().optional().describe("待检测文件路径（与 text 二选一）"),
    },
    guard(({ text, file_path }) => {
      let buf: Buffer;
      if (file_path) {
        if (!fs.existsSync(file_path)) throw new McpToolError(`文件不存在：${file_path}`, "FILE_NOT_FOUND");
        buf = fs.readFileSync(file_path);
      } else if (text !== undefined) {
        buf = Buffer.from(text, "utf8");
      } else {
        throw new McpToolError("需要 text 或 file_path 参数", "INVALID_PARAM");
      }
      const r = jschardet.detect(buf);
      return JSON.stringify({
        encoding: r.encoding,
        confidence: r.confidence,
        source: file_path ?? "text",
        bytes: buf.length,
      }, null, 2);
    }),
  );

  /* ---------------- HTML 实体编解码 ---------------- */
  server.tool(
    "encode_html",
    "HTML 实体编解码：<>&\"' 与 &lt;&gt;&amp;&quot;&#39; 互转（支持数字实体）",
    {
      text: z.string().describe("待处理文本"),
      action: z.enum(["encode", "decode"]).default("encode"),
    },
    guard(({ text, action }) => {
      if (action === "encode") {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }
      return text
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, "\"")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
    }),
  );
}

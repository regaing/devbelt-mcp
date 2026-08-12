/**
 * 文本工具族：text_case / text_jianfan / text_pinyin / text_fullwidth /
 * text_flip / text_vertical / text_stats / text_dedup / text_replace /
 * text_filter / text_format / text_random / text_martian / uuid_generate / text_idcard
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "node:crypto";
import OpenCC from "opencc-js";
import { pinyin } from "pinyin-pro";
import { McpToolError, guard } from "../utils/errors.js";
import { parseIdCard } from "../lib/idcard.js";

const jianfan = {
  toTraditional: OpenCC.Converter({ from: "cn", to: "tw" }),
  toSimplified: OpenCC.Converter({ from: "tw", to: "cn" }),
};

/** 火星文映射（常用字 → 火星变体） */
const MARTIAN_MAP: Record<string, string> = {
  我: "莪", 你: "伱", 他: "彵", 她: "娚", 的: "菂", 是: "湜", 不: "卜", 了: "ㄋ",
  吗: "玛", 啊: "錒", 一: "⑴", 二: "⑵", 三: "⑶", 十: "⑩", 爱: "璦", 心: "杺",
  好: "恏", 想: "湘", 会: "浍", 说: "説", 话: "話", 人: "亽", 生: "泩", 活: "萿",
  天: "兲", 地: "哋", 上: "仩", 下: "芐", 中: "ф", 大: "汏", 小: "尐", 高: "髙",
  快: "侩", 乐: "泺", 开: "閞", 关: "関", 门: "閅", 们: "們",
};
const MARTIAN_REV = Object.fromEntries(Object.entries(MARTIAN_MAP).map(([k, v]) => [v, k]));

export function registerTextTools(server: McpServer): void {
  server.tool(
    "text_case",
    "英文大小写转换：upper 全大写 / lower 全小写 / title 首字母大写 / camel 驼峰 / snake 下划线",
    { text: z.string(), action: z.enum(["upper", "lower", "title", "camel", "snake"]).default("upper") },
    guard(({ text, action }) => {
      switch (action) {
        case "upper": return text.toUpperCase();
        case "lower": return text.toLowerCase();
        case "title": return text.replace(/(^|\s)([a-zA-Z])/g, (_, p, c) => p + c.toUpperCase());
        case "camel":
          return text
            .toLowerCase()
            .replace(/[_\-\s]+([a-z])/g, (_, c) => c.toUpperCase())
            .replace(/^[a-z]/, (c) => c.toLowerCase());
        case "snake":
          return text
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .replace(/[\s\-]+/g, "_")
            .toLowerCase();
      }
    }),
  );

  server.tool(
    "text_jianfan",
    "简体/繁体互转。action=to_traditional 简体转繁体；to_simplified 繁体转简体",
    { text: z.string(), action: z.enum(["to_traditional", "to_simplified"]).default("to_traditional") },
    guard(({ text, action }) => {
      return action === "to_traditional" ? jianfan.toTraditional(text) : jianfan.toSimplified(text);
    }),
  );

  server.tool(
    "text_pinyin",
    "汉字转拼音。output=pinyin 返回拼音；tone 带声调；initial 仅声母/首字母",
    {
      text: z.string(),
      output: z.enum(["pinyin", "tone", "initial"]).default("pinyin"),
      separator: z.string().default(" ").describe("拼音之间的分隔符"),
    },
    guard(({ text, output, separator }) => {
      const opts: any = { type: "array", nonZh: "consecutive" };
      if (output === "tone") opts.toneType = "symbol";
      else if (output === "pinyin") opts.toneType = "none";
      else opts.pattern = "first";
      const arr = pinyin(text, opts) as unknown as string[];
      return arr.join(separator);
    }),
  );

  server.tool(
    "text_fullwidth",
    "全角/半角互转。to_full=半角转全角；to_half=全角转半角（含中文标点：。、《》等）",
    { text: z.string(), action: z.enum(["to_full", "to_half"]).default("to_half") },
    guard(({ text, action }) => {
      // CJK 专用标点映射（不在 FF01-FF5E 通用区间内）
      const CJK_TO_HALF: Record<string, string> = {
        "\u3002": ".", // 。
        "\u300a": "<", // 《
        "\u300b": ">", // 》
        "\u201c": '"', // “
        "\u201d": '"', // ”
        "\u2018": "'", // ‘
        "\u2019": "'", // ’
      };
      const HALF_TO_CJK: Record<string, string> = {
        ".": "\u3002", "<": "\u300a", ">": "\u300b",
        '"': "\u201c", "'": "\u2018",
      };
      if (action === "to_half") {
        return Array.from(text)
          .map((c) => {
            const code = c.codePointAt(0)!;
            if (CJK_TO_HALF[c]) return CJK_TO_HALF[c];
            if (code === 0x3000) return " ";
            if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
            return c;
          })
          .join("");
      }
      return Array.from(text)
        .map((c) => {
          const code = c.charCodeAt(0);
          if (HALF_TO_CJK[c]) return HALF_TO_CJK[c];
          if (code === 0x20) return "\u3000";
          if (code >= 0x21 && code <= 0x7e) return String.fromCharCode(code + 0xfee0);
          return c;
        })
        .join("");
    }),
  );

  server.tool(
    "text_flip",
    "文本翻转/倒序。full=全文反转；line=每行内反转；reverse_lines=行序反转",
    { text: z.string(), mode: z.enum(["full", "line", "reverse_lines"]).default("full") },
    guard(({ text, mode }) => {
      if (mode === "full") return Array.from(text).reverse().join("");
      if (mode === "line") {
        return text.split("\n").map((l) => Array.from(l).reverse().join("")).join("\n");
      }
      return text.split("\n").reverse().join("\n");
    }),
  );

  server.tool(
    "text_vertical",
    "文字竖排（传统中文排版）：将文本按指定列数从上到下竖排输出",
    { text: z.string(), cols: z.number().int().min(1).max(20).default(6) },
    guard(({ text, cols }) => {
      const chars = text.replace(/\r?\n/g, "").split("");
      const rows = Math.ceil(chars.length / cols);
      const grid: string[][] = [];
      for (let i = 0; i < rows; i++) {
        grid.push(chars.slice(i * cols, (i + 1) * cols));
      }
      const out: string[] = [];
      for (let c = 0; c < cols; c++) {
        out.push(grid.map((row) => row[c] ?? "　").join(""));
      }
      return out.join("\n");
    }),
  );

  server.tool(
    "text_stats",
    "字数统计：总字符、汉字、字母、数字、空格、标点、行数、单词数",
    { text: z.string() },
    guard(({ text }) => {
      const total = Array.from(text).length;
      const han = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
      const letters = (text.match(/[a-zA-Z]/g) ?? []).length;
      const digits = (text.match(/[0-9]/g) ?? []).length;
      const spaces = (text.match(/\s/g) ?? []).length;
      const punct = (text.match(/[，。！？；：、""''（）《》〈〉【】\[\]{}.,!?;:'"()<>\/\\\-_+*&^%$#@~`|]/g) ?? []).length;
      const lines = text.split("\n").length;
      const words = (text.trim().match(/[a-zA-Z0-9]+/g) ?? []).length;
      return [
        `总字符数：${total}`,
        `汉字数：${han}`,
        `英文字母：${letters}`,
        `数字：${digits}`,
        `空白字符：${spaces}`,
        `标点符号：${punct}`,
        `行数：${lines}`,
        `单词数：${words}`,
      ].join("\n");
    }),
  );

  server.tool(
    "text_dedup",
    "文本行去重。sort=true 时结果排序，keep_first=false 保留最后一次出现",
    {
      text: z.string(),
      sort: z.boolean().default(false),
      keep_first: z.boolean().default(true),
    },
    guard(({ text, sort, keep_first }) => {
      const lines = text.split("\n");
      let unique = keep_first
        ? [...new Set(lines)]
        : [...new Set([...lines].reverse())].reverse();
      if (sort) unique = unique.sort();
      return unique.join("\n");
    }),
  );

  server.tool(
    "text_replace",
    "文本查找替换。use_regex=true 时 find 作为正则表达式处理",
    {
      text: z.string(),
      find: z.string(),
      replace: z.string().default(""),
      use_regex: z.boolean().default(false),
    },
    guard(({ text, find, replace, use_regex }) => {
      if (find === "") throw new McpToolError("find 不能为空", "INVALID_PARAM");
      if (use_regex) {
        try {
          return text.replace(new RegExp(find, "g"), replace);
        } catch (e: any) {
          throw new McpToolError(`正则无效：${e?.message ?? e}`, "REGEX");
        }
      }
      return text.split(find).join(replace);
    }),
  );

  server.tool(
    "text_filter",
    "HTML 标签过滤：移除 script/style 与标签，可选保留指定标签，可选替换为自定义文本",
    {
      html: z.string(),
      keep_tags: z.string().optional().describe("逗号分隔的保留标签，如 'p,b,strong'"),
      replace_with: z.string().default("").describe("被移除标签替换成的文本（默认空格）"),
    },
    guard(({ html, keep_tags, replace_with }) => {
      let s = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
      const keep = (keep_tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      const rep = replace_with || " ";
      if (keep.length > 0) {
        const keepRe = new RegExp(`<(/?)(${keep.join("|")})(\\s[^>]*)?>`, "gi");
        const parts = s.split(/(<[^>]+>)/g);
        s = parts
          .map((part) => {
            if (!part.startsWith("<")) return part;
            if (keepRe.test(part)) {
              keepRe.lastIndex = 0;
              return part;
            }
            keepRe.lastIndex = 0;
            return rep;
          })
          .join("");
      } else {
        s = s.replace(/<[^>]+>/g, rep);
      }
      return s.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    }),
  );

  server.tool(
    "text_format",
    "文章自动排版：首行缩进、段落合并、清理多余空行与行首尾空格",
    {
      text: z.string(),
      indent: z.number().int().min(0).max(4).default(2).describe("每段首行缩进空格数"),
      merge_lines: z.boolean().default(true).describe("合并段落内换行"),
    },
    guard(({ text, indent, merge_lines }) => {
      let paras = text
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s*\n\s*/g, merge_lines ? "" : "\n").trim())
        .filter(Boolean);
      const pad = " ".repeat(indent);
      return paras.map((p) => pad + p).join("\n\n");
    }),
  );

  server.tool(
    "text_random",
    "随机数/密码生成。type=number：min/max/count/unique；type=password：length/charset",
    {
      type: z.enum(["number", "password"]).default("number"),
      min: z.number().default(0),
      max: z.number().default(100),
      count: z.number().int().min(1).max(1000).default(1),
      unique: z.boolean().default(false),
      length: z.number().int().min(4).max(256).default(16),
      charset: z.enum(["all", "upper", "lower", "digit", "symbol"]).default("all"),
    },
    guard(({ type, min, max, count, unique, length, charset }) => {
      if (type === "number") {
        if (max < min) throw new McpToolError("max 不能小于 min", "INVALID_PARAM");
        const range = max - min;
        const out: number[] = [];
        while (out.length < count) {
          const v = min + Math.floor(Math.random() * (range + 1));
          if (unique && out.includes(v)) continue;
          out.push(v);
        }
        return out.join("\n");
      }
      const sets: Record<string, string> = {
        upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        lower: "abcdefghijklmnopqrstuvwxyz",
        digit: "0123456789",
        symbol: "!@#$%^&*()_+-=[]{}|;:,.<>?",
        all: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()",
      };
      const pool = sets[charset];
      let pwd = "";
      for (let i = 0; i < length; i++) {
        pwd += pool[Math.floor(Math.random() * pool.length)];
      }
      return pwd;
    }),
  );

  server.tool(
    "text_martian",
    "火星文转换：to_martian 汉字转火星文；to_chinese 火星文还原汉字（仅支持映射表内字符）",
    { text: z.string(), action: z.enum(["to_martian", "to_chinese"]).default("to_martian") },
    guard(({ text, action }) => {
      if (action === "to_martian") {
        return Array.from(text)
          .map((c) => MARTIAN_MAP[c] ?? c)
          .join("");
      }
      return Array.from(text)
        .map((c) => MARTIAN_REV[c] ?? c)
        .join("");
    }),
  );

  server.tool(
    "uuid_generate",
    "UUID/GUID 批量生成。format=uuid（8-4-4-4-12）或 guid；case 控制大小写",
    {
      count: z.number().int().min(1).max(100).default(1),
      format: z.enum(["uuid", "guid"]).default("uuid"),
      case: z.enum(["lower", "upper"]).default("lower"),
    },
    guard(({ count, format, case: outCase }) => {
      const out: string[] = [];
      while (out.length < count) {
        const hex = crypto.randomBytes(16).toString("hex");
        let v = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        if (format === "guid") v = `{${v}}`;
        out.push(outCase === "upper" ? v.toUpperCase() : v.toLowerCase());
      }
      return out.join("\n");
    }),
  );
  server.tool(
    "text_idcard",
    "身份证号解析（GB 11643-1999 纯本地算法，零三方接口）：校验 18/15 位、解析省市区/生日/性别/年龄、15 位转 18 位",
    { id: z.string().describe("15 或 18 位身份证号") },
    guard(({ id }) => JSON.stringify(parseIdCard(id), null, 2)),
  );
}

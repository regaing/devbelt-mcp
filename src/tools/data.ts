/**
 * 数据转换族：data_html_convert / data_html_table / data_excel_json / data_text_diff
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { diffLines, diffChars, diffWords } from "diff";
import TurndownService from "turndown";
import { marked } from "marked";
import { McpToolError, guard } from "../utils/errors.js";

function htmlToJs(html: string): string {
  return html
    .split("\n")
    .map((l) => `"${l.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(" +\n");
}

function htmlToPhp(html: string): string {
  return `$html = <<<HTML\n${html}\nHTML;`;
}

function htmlToCs(html: string): string {
  return `string html = @"${html.replace(/"/g, '""')}";`;
}

function htmlToJsp(html: string): string {
  return html
    .split("\n")
    .map((l) => `out.println("${l.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}");`)
    .join("\n");
}

function htmlToAsp(html: string): string {
  return html
    .split("\n")
    .map((l) => `response.write("${l.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`)
    .join("\n");
}

function htmlToPerl(html: string): string {
  return `print <<"HTML";\n${html}\nHTML`;
}

function htmlToUbb(html: string): string {
  return html
    .replace(/<b>(.*?)<\/b>/gis, "[b]$1[/b]")
    .replace(/<strong>(.*?)<\/strong>/gis, "[b]$1[/b]")
    .replace(/<i>(.*?)<\/i>/gis, "[i]$1[/i]")
    .replace(/<u>(.*?)<\/u>/gis, "[u]$1[/u]")
    .replace(/<a\s+href=["'](.*?)["'][^>]*>(.*?)<\/a>/gis, "[url=$1]$2[/url]")
    .replace(/<img\s+src=["'](.*?)["'][^>]*>/gis, "[img]$1[/img]")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function ubbToHtml(ubb: string): string {
  return ubb
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<b>$1</b>")
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<i>$1</i>")
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>")
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1">$2</a>')
    .replace(/\[img\]([\s\S]*?)\[\/img\]/gi, '<img src="$1" />')
    .replace(/\n/g, "<br />");
}

/** 简单 CSV 解析（支持引号） */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur); cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csv[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function csvToHtmlTable(csv: string, style?: string): string {
  const rows = parseCsv(csv);
  const styleAttr = style ? ` style="${style}"` : "";
  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const thead = `<thead><tr>${head.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table${styleAttr} border="1" cellpadding="4" cellspacing="0">\n${thead}\n${tbody}\n</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function registerDataTools(server: McpServer): void {
  server.tool(
    "data_html_convert",
    "HTML 与其他代码/标记格式互转。target 可选 js/php/cs/jsp/asp/perl/ubb/markdown；ubb 支持双向（direction=to_html 时输入 UBB）",
    {
      html: z.string().describe("HTML 内容（direction=to_html 时输入 UBB）"),
      target: z.enum(["js", "php", "cs", "jsp", "asp", "perl", "ubb", "markdown"]),
      direction: z.enum(["from_html", "to_html"]).default("from_html"),
    },
    guard(({ html, target, direction }) => {
      if (target === "ubb" && direction === "to_html") return ubbToHtml(html);
      if (target === "markdown") {
        if (direction === "from_html") {
          const md = new TurndownService();
          return md.turndown(html);
        }
        return marked.parse(html);
      }
      switch (target) {
        case "js": return htmlToJs(html);
        case "php": return htmlToPhp(html);
        case "cs": return htmlToCs(html);
        case "jsp": return htmlToJsp(html);
        case "asp": return htmlToAsp(html);
        case "perl": return htmlToPerl(html);
        case "ubb": return htmlToUbb(html);
        default: throw new McpToolError(`不支持的 target：${target}`, "NOT_SUPPORTED");
      }
    }),
  );

  server.tool(
    "data_html_table",
    "生成 HTML 表格：输入 CSV（首行为表头）或 JSON 数组，输出 <table> 代码",
    {
      data: z.string().describe("CSV 文本或 JSON 数组字符串"),
      data_type: z.enum(["csv", "json"]).default("csv"),
      style: z.string().optional().describe("table 标签的 style 属性"),
    },
    guard(({ data, data_type, style }) => {
      if (data_type === "csv") return csvToHtmlTable(data, style);
      let arr: unknown;
      try {
        arr = JSON.parse(data);
      } catch (e: any) {
        throw new McpToolError(`JSON 解析失败：${e?.message ?? e}`, "JSON_PARSE");
      }
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new McpToolError("JSON 需要是非空数组", "JSON_TYPE");
      }
      const heads = Object.keys(arr[0] as Record<string, unknown>);
      const rows = arr.map((item: any) => heads.map((h) => String(item?.[h] ?? "")));
      const csv = [heads.join(","), ...rows.map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(","))].join("\n");
      return csvToHtmlTable(csv, style);
    }),
  );

  server.tool(
    "data_excel_json",
    "Excel/CSV ↔ JSON 转换。json_to_excel：JSON 数组写入 xlsx 文件（需 output_path）；excel_to_json：读取 xlsx/csv 文件输出 JSON",
    {
      data: z.string().describe("JSON 字符串（json_to_excel）或文件路径（excel_to_json）"),
      direction: z.enum(["json_to_excel", "excel_to_json"]),
      output_path: z.string().optional().describe("json_to_excel 的输出 .xlsx 文件路径"),
    },
    guard(({ data, direction, output_path }) => {
      if (direction === "json_to_excel") {
        if (!output_path) throw new McpToolError("json_to_excel 需要 output_path 参数", "INVALID_PARAM");
        let arr: unknown;
        try {
          arr = JSON.parse(data);
        } catch (e: any) {
          throw new McpToolError(`JSON 解析失败：${e?.message ?? e}`, "JSON_PARSE");
        }
        const rows = Array.isArray(arr) ? arr : [arr];
        if (rows.length === 0) throw new McpToolError("JSON 数组不能为空", "JSON_TYPE");
        const ws = XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        const abs = path.resolve(output_path);
        XLSX.writeFile(wb, abs);
        return `已写入 ${rows.length} 行到 ${abs}`;
      }
      const abs = path.resolve(data);
      if (!fs.existsSync(abs)) throw new McpToolError(`文件不存在：${data}`, "FILE_NOT_FOUND");
      const wb = XLSX.readFile(abs);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      return JSON.stringify(json, null, 2);
    }),
  );

  server.tool(
    "data_text_diff",
    "文本/代码差异比较。mode 可选 lines（按行）/chars（按字符）/words（按词）",
    {
      text_a: z.string(),
      text_b: z.string(),
      mode: z.enum(["lines", "chars", "words"]).default("lines"),
    },
    guard(({ text_a, text_b, mode }) => {
      const parts =
        mode === "chars" ? diffChars(text_a, text_b) :
        mode === "words" ? diffWords(text_a, text_b) :
        diffLines(text_a, text_b);
      return parts
        .map((part) => {
          const marker = part.added ? "+ " : part.removed ? "- " : "  ";
          return part.value
            .split("\n")
            .filter((l, i, arr) => !(l === "" && i === arr.length - 1))
            .map((l) => marker + l)
            .join("\n");
        })
        .join("");
    }),
  );
}

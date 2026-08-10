/**
 * JSON 工具族：json_process / json_convert / json_entity
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import yaml from "js-yaml";
import { McpToolError, guard } from "../utils/errors.js";

/** 解析 JSON，抛可读错误 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new McpToolError(`JSON 解析失败：${e?.message ?? e}`, "JSON_PARSE");
  }
}

function jsonStringify(v: unknown, space: number | string = 2): string {
  return JSON.stringify(v, null, space);
}

/* ---------------- JSON → XML（简化实现） ---------------- */
function jsonToXml(key: string, value: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  if (value === null || value === undefined) {
    return `${pad}<${key} />`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<${key} />`;
    return value
      .map((v) => jsonToXml(key.replace(/s$/, "") || "item", v, depth))
      .join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => jsonToXml(k, v, depth + 1))
      .join("\n");
    return `${pad}<${key}>\n${entries}\n${pad}</${key}>`;
  }
  return `${pad}<${key}>${escapeXml(String(value))}</${key}>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 极简 XML → JSON（只处理无属性的标签树） */
function xmlToJson(xml: string): unknown {
  const clean = xml
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const stack: any[] = [{ name: "#root", children: [] }];
  const tagRe = /<(\/?)([a-zA-Z0-9_\-]+)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(clean)) !== null) {
    const text = clean.slice(lastIndex, m.index).trim();
    if (text) stack[stack.length - 1].children.push(text);
    const [, closing, name] = m;
    if (!closing) {
      if (m[0].endsWith("/>")) {
        stack[stack.length - 1].children.push({ name, children: [] });
      } else {
        stack.push({ name, children: [] });
      }
    } else {
      const node = stack.pop();
      if (!node) throw new McpToolError("XML 标签不匹配", "XML_PARSE");
      stack[stack.length - 1].children.push(node);
    }
    lastIndex = tagRe.lastIndex;
  }
  const text = clean.slice(lastIndex).trim();
  if (text) stack[stack.length - 1].children.push(text);

  function build(node: any): unknown {
    const textNodes = node.children.filter((c: any) => typeof c === "string");
    const elemNodes = node.children.filter((c: any) => typeof c !== "string");
    if (elemNodes.length === 0) {
      const t = textNodes.join(" ").trim();
      return t === "" ? {} : t;
    }
    if (textNodes.join(" ").trim() !== "") {
      return { "#text": textNodes.join(" ").trim(), ...groupElems(elemNodes) };
    }
    return groupElems(elemNodes);
  }

  function groupElems(nodes: any[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const n of nodes) {
      const val = build(n);
      if (out[n.name] === undefined) {
        out[n.name] = val;
      } else if (Array.isArray(out[n.name])) {
        (out[n.name] as unknown[]).push(val);
      } else {
        out[n.name] = [out[n.name], val];
      }
    }
    return out;
  }
  return build(stack[0]);
}

/* ---------------- JSON → GET 参数 ---------------- */
function jsonToGetParams(v: unknown): string {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new McpToolError("GET 参数转换需要 JSON 对象", "JSON_TYPE");
  }
  return Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`)
    .join("&");
}

function getParamsToJson(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split("&")) {
    if (!pair) continue;
    const [k, ...rest] = pair.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(rest.join("="));
  }
  return out;
}

/* ---------------- 实体类生成 ---------------- */
function jsonToEntityCode(jsonText: string, lang: "cs" | "java" | "go"): string {
  const data = parseJson(jsonText);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new McpToolError("实体类生成需要 JSON 对象（数组请先包一层对象）", "JSON_TYPE");
  }
  const obj = data as Record<string, unknown>;
  const className = "Generated";
  const fields = Object.entries(obj);

  const tsType = (v: unknown): string => {
    if (v === null) return "object";
    if (Array.isArray(v)) return `[]${v.length ? tsType(v[0]) : "any"}`;
    switch (typeof v) {
      case "number": return "number";
      case "boolean": return "boolean";
      case "string": return "string";
      default: return "object";
    }
  };
  const csType = (v: unknown): string => {
    const t = tsType(v);
    if (t === "number") return "double";
    if (t === "boolean") return "bool";
    if (t.startsWith("[]")) return "List<" + csTypeOfElem(v) + ">";
    return t === "string" ? "string" : "object";
  };
  const csTypeOfElem = (v: unknown): string => {
    if (Array.isArray(v) && v.length) return csType(v[0]);
    return "object";
  };
  const javaType = (v: unknown): string => {
    const t = tsType(v);
    if (t === "number") return "Double";
    if (t === "boolean") return "Boolean";
    if (t === "string") return "String";
    if (t.startsWith("[]")) return "List<" + javaType((v as any[])[0] ?? "") + ">";
    return "Object";
  };
  const goType = (v: unknown): string => {
    const t = tsType(v);
    if (t === "number") return "float64";
    if (t === "boolean") return "bool";
    if (t === "string") return "string";
    if (t.startsWith("[]")) return "[]" + goType((v as any[])[0] ?? "");
    return "interface{}";
  };
  const propName = (k: string): string => k.replace(/[^a-zA-Z0-9_]/g, "_");
  const pascal = (k: string): string => {
    const p = propName(k).replace(/(?:^|_)([a-z])/g, (_, c) => c.toUpperCase());
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  if (lang === "cs") {
    const lines = fields.map(([k, v]) => {
      const t = csType(v);
      const name = pascal(k);
      return `        public ${t} ${name} { get; set; } // ${k}`;
    });
    return `public class ${className}\n{\n${lines.join("\n")}\n}\n`;
  }
  if (lang === "java") {
    const lines = fields.map(([k, v]) => {
      const t = javaType(v);
      const name = pascal(k);
      return `    private ${t} ${propName(k)}; // ${k}\n\n    public ${t} get${name}() { return ${propName(k)}; }\n    public void set${name}(${t} value) { this.${propName(k)} = value; }`;
    });
    return `public class ${className} {\n${lines.join("\n\n")}\n}\n`;
  }
  // go
  const lines = fields.map(([k, v]) => {
    const t = goType(v);
    const name = pascal(k);
    return `    ${name} ${t} \`json:"${propName(k)}"\` // ${k}`;
  });
  return `type ${className} struct {\n${lines.join("\n")}\n}\n`;
}

/** SQL CREATE TABLE → Java 实体类（简化：常用 MySQL 类型映射） */
function sqlToJava(sql: string): string {
  const clean = sql.replace(/`/g, "").replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const tableRe = /create\s+table\s+([a-zA-Z0-9_\.]+)\s*\(([\s\S]*?)\)/i;
  const m = tableRe.exec(clean);
  if (!m) throw new McpToolError("未找到 CREATE TABLE 语句", "SQL_PARSE");
  const tableName = m[1].split(".").pop()!;
  const body = m[2];
  const className = tableName
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const rows = body
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f && !/^(primary|unique|key|index|constraint|foreign)/i.test(f));
  const typeMap: Record<string, string> = {
    int: "Integer", integer: "Integer", bigint: "Long", smallint: "Short", tinyint: "Byte",
    varchar: "String", char: "String", text: "String", longtext: "String", mediumtext: "String",
    date: "Date", datetime: "Date", timestamp: "Date", time: "Date",
    decimal: "BigDecimal", float: "Float", double: "Double", blob: "byte[]",
  };
  const fields = rows.map((row) => {
    const parts = row.split(/\s+/);
    const col = parts[0];
    const sqlType = (parts[1] ?? "varchar").replace(/\(.*/, "").replace(/[;,)]+/g, "").toLowerCase();
    const javaType = typeMap[sqlType] ?? "Object";
    const name = col
      .split("_")
      .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
      .join("");
    return `    private ${javaType} ${name};`;
  });
  return `public class ${className} {\n${fields.join("\n")}\n}\n`;
}

export function registerJsonTools(server: McpServer): void {
  server.tool(
    "json_process",
    "JSON 格式化/压缩/转义/去除转义/校验。action 可选 format（美化）、compress（压缩）、escape（转义）、unescape（去除转义）、validate（仅校验）",
    {
      text: z.string().describe("JSON 字符串"),
      action: z
        .enum(["format", "compress", "escape", "unescape", "validate"])
        .default("format")
        .describe("操作类型"),
      indent: z.number().int().min(0).max(8).default(2).describe("format 时的缩进空格数"),
    },
    guard(({ text, action, indent }) => {
      switch (action) {
        case "format": {
          const v = parseJson(text);
          return jsonStringify(v, indent);
        }
        case "compress": {
          const v = parseJson(text);
          return jsonStringify(v, 0);
        }
        case "escape":
          return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
        case "unescape":
          return text
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
        case "validate": {
          parseJson(text);
          return "JSON 格式有效 ✓";
        }
      }
    }),
  );

  server.tool(
    "json_convert",
    "JSON 与其他格式互转。target 可选 xml（JSON↔XML）、yaml（JSON↔YAML）、get_params（JSON 对象↔GET 参数字符串）",
    {
      text: z.string().describe("输入内容（JSON 或目标格式内容）"),
      target: z.enum(["xml", "yaml", "get_params"]).describe("目标格式"),
      direction: z
        .enum(["to_target", "from_target"])
        .default("to_target")
        .describe("转换方向：to_target=将 JSON 转成目标格式；from_target=将目标格式解析为 JSON"),
    },
    guard(({ text, target, direction }) => {
      if (target === "xml") {
        if (direction === "to_target") {
          const v = parseJson(text);
          if (typeof v !== "object" || v === null || Array.isArray(v)) {
            throw new McpToolError("JSON→XML 需要 JSON 对象", "JSON_TYPE");
          }
          return Object.entries(v as Record<string, unknown>)
            .map(([k, val]) => jsonToXml(k, val, 0))
            .join("\n");
        }
        return jsonStringify(xmlToJson(text));
      }
      if (target === "yaml") {
        if (direction === "to_target") {
          return yaml.dump(parseJson(text), { noRefs: true, lineWidth: 120 });
        }
        return jsonStringify(yaml.load(text));
      }
      // get_params
      if (direction === "to_target") {
        return jsonToGetParams(parseJson(text));
      }
      return jsonStringify(getParamsToJson(text));
    }),
  );

  server.tool(
    "json_entity",
    "从 JSON 或 SQL CREATE TABLE 生成实体类代码。input_type 可选 json/sql，language 可选 cs（C#）/java/go",
    {
      input: z.string().describe("JSON 或 SQL 输入"),
      input_type: z.enum(["json", "sql"]).default("json"),
      language: z.enum(["cs", "java", "go"]).default("cs").describe("目标语言"),
      class_name: z.string().optional().describe("自定义类名（默认 Generated / 表名）"),
    },
    guard(({ input, input_type, language }) => {
      if (input_type === "sql") {
        if (language !== "java") {
          throw new McpToolError("SQL 转实体类当前仅支持 Java", "NOT_SUPPORTED");
        }
        return sqlToJava(input);
      }
      let code = jsonToEntityCode(input, language);
      return code;
    }),
  );
}

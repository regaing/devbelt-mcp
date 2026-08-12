/**
 * 时间工具族：time_timestamp
 *
 * 时间戳转换（全面版）：
 * - 支持秒/毫秒/微秒/纳秒 4 级精度（微秒/纳秒用字符串避免精度丢失）
 * - 支持 ISO 8601 / RFC 2822 / 常见日期格式 / 中文格式 / 相对时间（now±1d 等）
 * - 支持 UTC / 本地 / 自定义时区偏移三种输出
 * - 附带扩展信息：星期、ISO 周、年内第几天、闰年、时区
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { McpToolError, guard } from "../utils/errors.js";

type Unit = "s" | "ms" | "us" | "ns";

/** 根据时间戳位数自动推断单位 */
function detectUnit(digits: string): Unit {
  const len = digits.replace(/^[+-]/, "").replace(/\.\d*$/, "").length;
  if (len <= 10) return "s";
  if (len <= 13) return "ms";
  if (len <= 16) return "us";
  return "ns";
}

/** 解析相对时间：now / now+1d / now-2h / now+30m / now+1w / now+1M / now+1y */
function parseRelative(raw: string): number | null {
  const m = raw.match(/^now\s*([+-])\s*(\d+)\s*([smhdwMy])$/i);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const n = parseInt(m[2], 10) * sign;
  const unit = m[3].toLowerCase();
  const now = Date.now();
  const add = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[unit];
  if (add) return now + n * add;
  if (unit === "M") {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()).getTime();
  }
  // y
  const d2 = new Date(now);
  return new Date(d2.getFullYear() + n, d2.getMonth(), d2.getDate()).getTime();
}

/** 解析日期时间字符串 → 毫秒时间戳。支持多种格式 */
function parseDateString(raw: string): number | null {
  const s = raw.trim();
  // 相对时间
  if (/^now$/i.test(s)) return Date.now();
  const rel = parseRelative(s);
  if (rel !== null) return rel;

  // ISO 8601（含 T/Z/±hh:mm 时区）
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;

  // "YYYY-MM-DD HH:mm:ss" / "YYYY/MM/DD HH:mm:ss" / "YYYY年M月D日 HH:mm:ss" 等（本地时区解释）
  const cn = s.match(/^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (cn) {
    const [, y, mo, d, h = "0", mi = "0", se = "0"] = cn;
    return new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime();
  }

  // "HH:mm:ss"（今天）
  const hm = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hm) {
    const [, h, mi, se = "0"] = hm;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), +h, +mi, +se).getTime();
  }

  return null;
}

/** 解析时间戳字符串（可能含小数/负号/微秒纳秒）→ { secondsStr, msBigInt } */
function parseTimestamp(raw: string, unit: Unit): { ms: bigint; extraText: string } {
  const neg = raw.startsWith("-");
  const clean = raw.replace(/^[+-]/, "");
  const [intPart, fracPart = ""] = clean.split(".");
  const digits = intPart;

  let value: bigint;
  let extra: bigint;
  if (unit === "s") {
    value = BigInt(digits) * 1000n + BigInt(fracPart.padEnd(3, "0").slice(0, 3) || "0");
    extra = 0n;
  } else if (unit === "ms") {
    value = BigInt(digits) + BigInt(fracPart.padEnd(3, "0").slice(0, 3) || "0");
    extra = 0n;
  } else if (unit === "us") {
    // 微秒 → 毫秒：除以 1000，余数为微秒精度损失
    value = BigInt(digits) / 1000n;
    extra = BigInt(digits) % 1000n;
  } else {
    // 纳秒 → 毫秒：除以 1000000，余数为纳秒精度损失
    value = BigInt(digits) / 1000000n;
    extra = BigInt(digits) % 1000000n;
  }
  const extraText = extra ? `（余 ${extra} ${unit === "us" ? "微秒" : "纳秒"}）` : "";
  return {
    ms: neg ? -value : value,
    extraText,
  };
}

/** 带时区偏移格式化日期 */
function formatDate(d: Date, offsetMinutes: number): string {
  const t = d.getTime() + offsetMinutes * 60000;
  const dt = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}`;
}

function isoWithOffset(d: Date, offsetMinutes: number): string {
  const t = d.getTime() + offsetMinutes * 60000;
  const dt = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}T${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:${p(dt.getUTCSeconds())}.${String(dt.getUTCMilliseconds()).padStart(3, "0")}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

/** 解析时区参数 → 分钟偏移（本地时区返回 null 表示跟随系统） */
function parseTimezone(tz: string | undefined): number | null {
  if (!tz) return null;
  if (/^z$/i.test(tz) || /^utc$/i.test(tz)) return 0;
  const m = tz.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) throw new McpToolError(`时区格式无效：${tz}（支持 UTC / Z / ±HH:mm）`, "INVALID_PARAM");
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function registerTimeTools(server: McpServer): void {
  server.tool(
    "time_timestamp",
    "时间戳转换（全面版）：时间戳↔日期互转。支持秒/毫秒/微秒/纳秒（自动识别位数或指定 unit）、ISO8601/RFC2822/中文/相对时间（now±1d）输入、UTC/本地/自定义时区输出，附带星期/ISO周/闰年等信息。省略 value 返回当前时间",
    {
      value: z.string().optional().describe("时间戳数字或日期字符串（如 1700000000 / 1700000000000 / 2026-08-12 15:30:00 / 2026-08-12T15:30:00+08:00 / now+1d），省略则当前时间"),
      unit: z.enum(["s", "ms", "us", "ns"]).optional().describe("时间戳单位（默认按位数自动识别：10位=秒 13位=毫秒 16位=微秒 19位=纳秒）"),
      timezone: z.string().optional().describe("输出时区：UTC / Z / ±HH:mm（如 +08:00），省略用本地时区"),
    },
    guard(({ value, unit, timezone }) => {
      const tzOffset = parseTimezone(timezone);
      let ms: bigint;
      let inputDesc: string;
      let inputType: string;

      if (!value) {
        ms = BigInt(Date.now());
        inputDesc = "当前时间";
        inputType = "now";
      } else if (/^[+-]?\d+(\.\d+)?$/.test(value)) {
        // 时间戳数字
        const u = unit ?? detectUnit(value);
        const parsed = parseTimestamp(value, u);
        ms = parsed.ms;
        inputDesc = `${value}（${u}${unit ? "" : "，自动识别"}）${parsed.extraText}`;
        inputType = "timestamp";
      } else {
        const parsed = parseDateString(value);
        if (parsed === null) throw new McpToolError(`无法识别的日期/时间格式：${value}`, "INVALID_PARAM");
        ms = BigInt(parsed);
        inputDesc = value;
        inputType = "datetime";
      }

      const d = new Date(Number(ms));
      if (Number.isNaN(d.getTime())) throw new McpToolError("时间戳超出 Date 可表示范围", "RANGE");
      const localOffset = -d.getTimezoneOffset();
      const outOffset = tzOffset ?? localOffset;

      // 各精度时间戳（字符串防精度丢失）
      const sec = ms / 1000n;
      const ts = {
        seconds: sec.toString(),
        milliseconds: ms.toString(),
        microseconds: (ms * 1000n).toString(),
        nanoseconds: (ms * 1000000n).toString(),
      };

      const weekday = WEEKDAYS[new Date(Number(ms)).getDay()];
      const now = new Date(Number(ms));
      const dayOfYear = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 0)) / 86400000);
      const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      // ISO 周号
      const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const week1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1 + ((4 - jan1.getUTCDay() + 7) % 7) - 3));
      const isoWeek = Math.ceil(((now.getTime() - week1.getTime()) / 86400000 + 1) / 7);
      const tzLabel = outOffset === 0 ? "UTC" : `${outOffset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(outOffset) / 60)).padStart(2, "0")}:${String(Math.abs(outOffset) % 60).padStart(2, "0")}`;

      return JSON.stringify({
        input: { type: inputType, raw: inputDesc, unit: unit ?? (inputType === "timestamp" ? detectUnit(value!) : "s") },
        timestamp: ts,
        datetime: {
          utc: formatDate(d, 0),
          local: formatDate(d, localOffset),
          timezone: tzOffset ? formatDate(d, tzOffset) : undefined,
        },
        iso8601: {
          utc: isoWithOffset(d, 0),
          local: isoWithOffset(d, localOffset),
          timezone: tzOffset ? isoWithOffset(d, tzOffset) : undefined,
        },
        info: {
          weekday,
          iso_week: isoWeek,
          day_of_year: dayOfYear,
          is_leap_year: isLeap(now.getFullYear()),
          timezone: tzLabel,
          timezone_offset_minutes: outOffset,
        },
      }, null, 2);
    }),
  );
}

/* ---------------- 公共辅助（time 族多工具复用） ---------------- */

/** 解析任意 value → 毫秒时间戳（BigInt），供各工具复用 */
function resolveMs(value: string | undefined): { ms: bigint; type: string; desc: string; unit: string } {
  if (!value) return { ms: BigInt(Date.now()), type: "now", desc: "当前时间", unit: "s" };
  if (/^[+-]?\d+(\.\d+)?$/.test(value)) {
    const u = detectUnit(value);
    const p = parseTimestamp(value, u);
    return { ms: p.ms, type: "timestamp", desc: `${value}（${u}，自动识别）${p.extraText}`, unit: u };
  }
  const parsed = parseDateString(value);
  if (parsed === null) throw new McpToolError(`无法识别的日期/时间格式：${value}`, "INVALID_PARAM");
  return { ms: BigInt(parsed), type: "datetime", desc: value, unit: "s" };
}

/** 偏移 → 时区标签（如 +08:00 / UTC） */
function offsetLabel(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** 常用时区名 → 偏移分钟 */
const TZ_ALIASES: Record<string, number> = {
  utc: 0, z: 0, gmt: 0, "英国": 0, 伦敦: 0, 巴黎: 60, "柏林": 60, 莫斯科: 180,
  迪拜: 240, 印度: 330, 北京: 480, 上海: 480, 香港: 480, 新加坡: 480, "中国": 480,
  东京: 540, 首尔: 540, 悉尼: 600, 纽约: -300, "美东": -300, 芝加哥: -360,
  洛杉矶: -480, "美西": -480, 旧金山: -480, 温哥华: -480,
};

/** 解析时区列表参数（逗号分隔：UTC / ±HH:mm / 常用名）→ 偏移分钟数组 */
function parseTimezoneList(raw: string | undefined): Array<{ name: string; offset: number }> {
  if (!raw) {
    return ["UTC", "北京", "东京", "伦敦", "纽约", "悉尼", "迪拜", "洛杉矶"].map((n) => ({
      name: n,
      offset: TZ_ALIASES[n.toLowerCase()]!,
    }));
  }
  return raw.split(/[,，;；\s]+/).filter(Boolean).map((item) => {
    const key = item.toLowerCase();
    if (key in TZ_ALIASES) return { name: item, offset: TZ_ALIASES[key]! };
    const off = parseTimezone(item);
    if (off === null) throw new McpToolError(`时区无效：${item}`, "INVALID_PARAM");
    return { name: offsetLabel(off), offset: off };
  });
}

/** 秒数 → 人类可读中文（组件分解） */
function humanDuration(totalSeconds: bigint): { human: string; components: Record<string, number> } {
  let s = totalSeconds < 0n ? -totalSeconds : totalSeconds;
  const days = s / 86400n; s %= 86400n;
  const hours = s / 3600n; s %= 3600n;
  const minutes = s / 60n; s %= 60n;
  const seconds = s;
  const parts: string[] = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小时`);
  if (minutes) parts.push(`${minutes}分`);
  if (seconds || parts.length === 0) parts.push(`${seconds}秒`);
  return {
    human: parts.join(""),
    components: {
      days: Number(days), hours: Number(hours), minutes: Number(minutes), seconds: Number(seconds),
    },
  };
}

/** 毫秒数 → 各精度字符串 */
function durationBreakdown(ms: bigint): Record<string, string> {
  const s = ms / 1000n;
  const m = ms / 60000n;
  const h = ms / 3600000n;
  const d = ms / 86400000n;
  return {
    milliseconds: ms.toString(),
    seconds: (s + (ms % 1000n) / 100n).toString(),
    minutes: (m + (ms % 60000n) / 6000n).toString(),
    hours: (h + (ms % 3600000n) / 360000n).toString(),
    days: (d + (ms % 86400000n) / 8640000n).toString(),
  };
}

/** cron 表达式 → 人类可读中文描述 */
function cronDescribe(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  const hasSec = parts.length === 6;
  const [sec, min, hour, dom, mon, dow] = hasSec ? parts : ["0", ...parts];
  const f = (field: string, unit: string, units: string[]): string => {
    if (field === "*") return `每${unit}`;
    if (field.startsWith("*/")) {
      const n = field.slice(2);
      return n === "1" ? `每${unit}` : `每${n}${unit}`;
    }
    if (field.includes("-")) {
      const [a, b] = field.split("-");
      const va = units[+a] ?? a, vb = units[+b] ?? b;
      return `${va}至${vb}`;
    }
    if (field.includes(",")) {
      return field.split(",").map((x) => units[+x] ?? x).join("、");
    }
    if (field.includes("/")) {
      const [base, step] = field.split("/");
      const bv = base === "*" ? "" : units[+base] ?? base;
      return `从${bv || "起始"}起每${step}${unit}`;
    }
    return units[+field] ?? `${field}${unit}`;
  };
  const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  // 固定时+分 → 合并为 "HH:MM"
  const isFixed = (f: string) => /^\d+$/.test(f);
  let timePart = "";
  if (isFixed(min) && isFixed(hour)) {
    timePart = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  } else {
    if (sec !== "0") timePart += f(sec, "秒", []);
    timePart += f(min, "分钟", []);
    timePart += f(hour, "小时", []);
  }
  const desc: string[] = [];
  if (timePart) desc.push(timePart);
  if (dom === "*") desc.push("每天");
  else desc.push(f(dom, "日", []));
  if (mon !== "*") desc.push(f(mon, "月", []));
  if (dow !== "*") desc.push(f(dow, "", weekNames));
  return desc.join("，");
}

/** strftime 风格格式化 */
function strftime(d: Date, fmt: string, offsetMinutes: number): string {
  const t = d.getTime() + offsetMinutes * 60000;
  const dt = new Date(t);
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const h12 = dt.getUTCHours() % 12 || 12;
  const y = dt.getUTCFullYear();
  const mon = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  const doy = Math.floor((Date.UTC(y, dt.getUTCMonth(), day) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const map: Record<string, string> = {
    YYYY: String(y), YY: p(y % 100), MM: p(mon), DD: p(day),
    HH: p(dt.getUTCHours()), hh: p(h12), mm: p(dt.getUTCMinutes()), ss: p(dt.getUTCSeconds()),
    SSS: String(dt.getUTCMilliseconds()).padStart(3, "0"),
    d: String(dt.getUTCDay()), ddd: "周" + ["日", "一", "二", "三", "四", "五", "六"][dt.getUTCDay()],
    dddd: weekdays[dt.getUTCDay()], Q: String(Math.floor((mon - 1) / 3) + 1),
    MMM: months[dt.getUTCMonth()].slice(0, 3), MMMM: months[dt.getUTCMonth()],
    // strftime 兼容
    "%Y": String(y), "%y": p(y % 100), "%m": p(mon), "%d": p(day),
    "%H": p(dt.getUTCHours()), "%I": p(h12), "%M": p(dt.getUTCMinutes()), "%S": p(dt.getUTCSeconds()),
    "%L": String(dt.getUTCMilliseconds()).padStart(3, "0"), "%w": String(dt.getUTCDay()),
    "%a": weekdays[dt.getUTCDay()].slice(0, 3), "%A": weekdays[dt.getUTCDay()],
    "%b": months[dt.getUTCMonth()].slice(0, 3), "%B": months[dt.getUTCMonth()], "%j": p(doy, 3),
    "%q": String(Math.floor((mon - 1) / 3) + 1), "%%": "%",
  };
  // 先替换多字符占位符（按长度降序，避免 YYYY 被 YY 误替换）
  const keys = Object.keys(map).filter((k) => k.length > 1).sort((a, b) => b.length - a.length);
  let out = fmt;
  for (const k of keys) out = out.split(k).join(map[k]);
  // 单字符占位符（d 星期数 / Q 季度）用单词边界正则，避免污染文本中的字母
  out = out.replace(/\bd\b/g, map["d"]).replace(/\bQ\b/g, map["Q"]);
  return out;
}

export function registerMoreTimeTools(server: McpServer): void {
  server.tool(
    "time_convert",
    "多时区时间显示：同一时刻在 UTC/本地/常用城市时区的时间对照（支持自定义 ±HH:mm 或时区名，逗号分隔）",
    {
      value: z.string().optional().describe("时间戳或日期字符串，省略则当前时间"),
      timezones: z.string().optional().describe("逗号分隔的时区列表：UTC / ±HH:mm / 时区名（北京/东京/伦敦/纽约等），省略用 8 个常用时区"),
    },
    guard(({ value, timezones }) => {
      const r = resolveMs(value);
      const d = new Date(Number(r.ms));
      if (Number.isNaN(d.getTime())) throw new McpToolError("时间戳超出 Date 可表示范围", "RANGE");
      const zones = parseTimezoneList(timezones);
      const list = zones.map(({ name, offset }) => ({
        name,
        offset: offsetLabel(offset),
        datetime: formatDate(d, offset),
        iso8601: isoWithOffset(d, offset),
      }));
      return JSON.stringify({
        input: { type: r.type, raw: r.desc },
        base: { utc: formatDate(d, 0), local: formatDate(d, -d.getTimezoneOffset()) },
        timezones: list,
      }, null, 2);
    }),
  );

  server.tool(
    "time_diff",
    "时间差/倒计时：计算两个时间点的差值（各精度 + 人类可读 + 组件分解），支持时间戳/日期/相对时间",
    {
      from: z.string().optional().describe("起始时间（默认现在）"),
      to: z.string().describe("目标时间"),
    },
    guard(({ from, to }) => {
      const a = resolveMs(from);
      const b = resolveMs(to);
      const diffMs = b.ms - a.ms;
      const direction = diffMs >= 0n ? "未来" : "过去";
      const abs = diffMs < 0n ? -diffMs : diffMs;
      const totalSec = abs / 1000n;
      const human = humanDuration(totalSec);
      const seconds = Number(totalSec);
      return JSON.stringify({
        input: { from: a.desc, to: b.desc },
        direction,
        diff: {
          milliseconds: abs.toString(),
          seconds: String(seconds),
          minutes: (seconds / 60).toFixed(2),
          hours: (seconds / 3600).toFixed(2),
          days: (seconds / 86400).toFixed(2),
          human: human.human,
          components: human.components,
        },
      }, null, 2);
    }),
  );

  server.tool(
    "time_cron",
    "cron 表达式解析：人类可读描述 + 未来 N 次执行时间（cron-parser 纯本地）",
    {
      expr: z.string().describe("cron 表达式（5 段或 6 段含秒，如 '*/5 * * * *'）"),
      count: z.number().int().min(1).max(20).default(5).describe("返回未来执行次数"),
    },
    guard(async ({ expr, count }) => {
      let it;
      try {
        const cp = await import("cron-parser");
        it = cp.CronExpressionParser.parse(expr);
      } catch (e: any) {
        throw new McpToolError(`cron 表达式无效：${e?.message ?? e}`, "INVALID_PARAM");
      }
      const runs: Array<{ utc: string; local: string }> = [];
      for (let i = 0; i < count; i++) {
        const d = it.next().toDate();
        runs.push({ utc: formatDate(d, 0), local: formatDate(d, -d.getTimezoneOffset()) });
      }
      return JSON.stringify({ expression: expr, description: cronDescribe(expr), next_runs: runs }, null, 2);
    }),
  );

  server.tool(
    "time_duration",
    "时长人类可读化（双向）：秒数 → '1天2小时3分4秒' + 各精度换算；或可读字符串 → 秒数",
    {
      value: z.string().describe("秒数值（如 93784）或可读时长字符串（如 '1天2小时3分4秒'）"),
      unit: z.enum(["s", "ms", "min", "h", "day"]).default("s").describe("数值输入时的单位"),
    },
    guard(({ value, unit }) => {
      // 反向：可读字符串 → 秒
      const parsed = value.match(/(\d+(?:\.\d+)?)\s*(毫秒|ms|秒|s|分钟|分|min|小时|时|h|天|日|d|周|星期|w)/g);
      if (parsed) {
        const units: Record<string, number> = {
          毫秒: 0.001, ms: 0.001, 秒: 1, s: 1, 分钟: 60, 分: 60, min: 60,
          小时: 3600, 时: 3600, h: 3600, 天: 86400, 日: 86400, d: 86400, 周: 604800, 星期: 604800, w: 604800,
        };
        let total = 0;
        for (const part of parsed) {
          const m = part.match(/([\d.]+)\s*(\D+)/)!;
          total += parseFloat(m[1]) * (units[m[2].trim()] ?? 0);
        }
        return JSON.stringify({ input: value, mode: "解析", seconds: total, human: value }, null, 2);
      }
      // 正向：数值 → 人类可读
      const num = parseFloat(value);
      if (Number.isNaN(num)) throw new McpToolError(`无法解析时长：${value}`, "INVALID_PARAM");
      const factor = { s: 1000n, ms: 1n, min: 60000n, h: 3600000n, day: 86400000n }[unit]!;
      const ms = BigInt(Math.round(num)) * factor;
      const h = humanDuration(ms / 1000n);
      return JSON.stringify({
        input: value,
        mode: "转换",
        duration: {
          ...durationBreakdown(ms),
          human: h.human,
          components: h.components,
        },
      }, null, 2);
    }),
  );

  server.tool(
    "time_format",
    "时间自定义格式化（strftime 风格）：支持 YYYY/MM/DD/HH/mm/ss/ddd/Q 等占位符与 %Y-%m-%d 兼容格式，可指定时区",
    {
      value: z.string().optional().describe("时间戳或日期字符串，省略则当前时间"),
      format: z.string().describe("格式模板，如 'YYYY-MM-DD HH:mm:ss ddd' 或 '%Y-%m-%d %H:%M:%S'"),
      timezone: z.string().optional().describe("时区：UTC / ±HH:mm（默认本地时区）"),
    },
    guard(({ value, format, timezone }) => {
      const r = resolveMs(value);
      const d = new Date(Number(r.ms));
      if (Number.isNaN(d.getTime())) throw new McpToolError("时间戳超出 Date 可表示范围", "RANGE");
      const tzOffset = timezone ? (parseTimezone(timezone) ?? 0) : -d.getTimezoneOffset();
      return JSON.stringify({
        input: { raw: r.desc, format },
        output: strftime(d, format, tzOffset),
        timezone: offsetLabel(tzOffset),
      }, null, 2);
    }),
  );
}
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

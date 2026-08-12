/**
 * 手机号归属地查询（内置完整号段库 phone.dat，纯本地，无三方接口）
 *
 * 数据源：xluohome/phonedata（https://github.com/xluohome/phonedata）
 * - 497,191 条前 7 位号段记录（2023-02 更新），含省/市/邮编/区号/运营商
 * - phone.dat 格式：头部 8 字节（版本 4B + 索引偏移 4B），记录区 + 索引区（每条 9B）
 * - 运行时二分查找，O(log n)
 *
 * 卡类型映射（xluohome 标准）：
 *   1=中国移动 2=中国联通 3=中国电信 4=中国电信(虚商) 5=中国联通(虚商)
 *   6=中国移动(虚商) 7=中国广电 0=未知
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DATA_PATH = fileURLToPath(new URL("../data/phone.dat", import.meta.url));

/** 卡类型 → 运营商名称 */
const CARD_ISP: Record<number, string> = {
  0: "未知",
  1: "中国移动",
  2: "中国联通",
  3: "中国电信",
  4: "中国电信(虚拟运营商)",
  5: "中国联通(虚拟运营商)",
  6: "中国移动(虚拟运营商)",
  7: "中国广电",
};

interface PhoneDb {
  buffer: Buffer;
  indexOffset: number;
  entries: number;
}

let db: PhoneDb | null = null;

/** 懒加载 phone.dat */
function loadDb(): PhoneDb {
  if (db) return db;
  const buffer = fs.readFileSync(DATA_PATH);
  const indexOffset = buffer.readUInt32LE(4);
  const entries = Math.floor((buffer.length - indexOffset) / 9);
  db = { buffer, indexOffset, entries };
  return db;
}

/** 读取记录区字符串（\0 结尾） */
function readRecord(buffer: Buffer, offset: number): string {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end++;
  return buffer.subarray(offset, end).toString("utf8");
}

export interface PhoneLookupResult {
  phone: string;
  valid: boolean;
  carrier: string | null;
  segment: string;
  province: string | null;
  city: string | null;
  area_code: string | null;
  zip_code: string | null;
  note: string;
}

/** 手机号归属查询（内置完整号段库，纯本地） */
export function phoneLookup(phone: string): PhoneLookupResult {
  const cleaned = phone.trim();
  if (!/^1[3-9]\d{9}$/.test(cleaned)) {
    return {
      phone: cleaned, valid: false, carrier: null, segment: "",
      province: null, city: null, area_code: null, zip_code: null,
      note: "无效手机号（需 11 位，1[3-9] 开头）",
    };
  }
  const seg7 = parseInt(cleaned.slice(0, 7), 10);
  const d = loadDb();
  let lo = 0, hi = d.entries - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const base = d.indexOffset + mid * 9;
    const cur = d.buffer.readUInt32LE(base);
    if (cur === seg7) {
      const recOffset = d.buffer.readUInt32LE(base + 4);
      const card = d.buffer.readUInt8(base + 8);
      const [province, city, zipCode, areaCode] = readRecord(d.buffer, recOffset).split("|");
      const carrier = CARD_ISP[card] ?? "未知";
      const note = card >= 4 && card <= 6 ? "虚拟运营商号段" : "号段有效";
      return {
        phone: cleaned, valid: true, carrier, segment: cleaned.slice(0, 7),
        province: province || null, city: city || null,
        area_code: areaCode || null, zip_code: zipCode || null, note,
      };
    } else if (cur < seg7) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return {
    phone: cleaned, valid: true, carrier: null, segment: cleaned.slice(0, 7),
    province: null, city: null, area_code: null, zip_code: null,
    note: "号段未收录（数据版本 2023-02）",
  };
}

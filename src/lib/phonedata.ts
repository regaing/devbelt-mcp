/**
 * 手机号段内置数据（纯本地，无三方接口）
 *
 * 数据说明：
 * - 运营商判定（前 3 位）：工信部号段分配规则，准确
 * - 虚拟运营商（17x 段）按第 4 位细分，准确
 * - 省份归属：按 1990s-2000s 号段初始分配规律整理的"代表性归属"，
 *   仅供参考（携号转网/二次放号后可能与实际不符）
 */

/** 前 3 位号段 → 运营商（准确） */
const PHONE_ISP: Record<string, string> = {
  "130": "中国联通", "131": "中国联通", "132": "中国联通", "145": "中国联通", "146": "中国联通",
  "155": "中国联通", "156": "中国联通", "166": "中国联通", "167": "中国联通", "171": "中国联通",
  "175": "中国联通", "176": "中国联通", "185": "中国联通", "186": "中国联通", "196": "中国联通",
  "133": "中国电信", "149": "中国电信", "153": "中国电信", "162": "中国电信", "173": "中国电信",
  "174": "中国电信", "177": "中国电信", "180": "中国电信", "181": "中国电信", "189": "中国电信",
  "190": "中国电信", "191": "中国电信", "193": "中国电信", "199": "中国电信",
  "134": "中国移动", "135": "中国移动", "136": "中国移动", "137": "中国移动", "138": "中国移动",
  "139": "中国移动", "147": "中国移动", "148": "中国移动", "150": "中国移动", "151": "中国移动",
  "152": "中国移动", "157": "中国移动", "158": "中国移动", "159": "中国移动", "165": "中国移动",
  "172": "中国移动", "178": "中国移动", "182": "中国移动", "183": "中国移动", "184": "中国移动",
  "187": "中国移动", "188": "中国移动", "195": "中国移动", "197": "中国移动", "198": "中国移动",
  "192": "中国广电",
  "170": "虚拟运营商",
};

/** 虚拟运营商 170 段按第 4 位细分 */
const PHONE_170: Record<string, string> = {
  "1700": "中国电信", "1701": "中国电信", "1702": "中国电信",
  "1703": "中国移动", "1705": "中国移动", "1706": "中国移动",
  "1704": "中国联通", "1707": "中国联通", "1708": "中国联通", "1709": "中国联通",
};

/** 前 4 位号段 → 代表性省份（按 GSM 号段初始分配规律，仅供参考） */
// 移动 135-139 段区域分配规律（1990s 原邮电部统一规划，流传广泛的号段对照表）：
// 第 4 位 0/1→北京 2→上海 3/4→广东 5→江苏 6→浙江 7→四川 8→山东 9→河南
// 注意：联通/电信老号段（130-133）不适用此规律，仅收录确认条目，避免错误信息
const MOBILE_REGION_BY_DIGIT: Record<string, string> = {
  "0": "北京", "1": "北京", "2": "上海", "3": "广东", "4": "广东",
  "5": "江苏", "6": "浙江", "7": "四川", "8": "山东", "9": "河南",
};
const PHONE_PROVINCE: Record<string, string> = {};
for (const p3 of ["135", "136", "137", "138", "139"]) {
  for (let d = 0; d <= 9; d++) PHONE_PROVINCE[p3 + String(d)] = MOBILE_REGION_BY_DIGIT[String(d)];
}
PHONE_PROVINCE["1319"] = "四川"; // 用户实测：四川南充联通
PHONE_PROVINCE["1331"] = "北京"; // 电信 133 段北京
PHONE_PROVINCE["1300"] = "北京"; // 联通 130 段北京

export interface PhoneLookupResult {
  phone: string;
  valid: boolean;
  carrier: string | null;
  segment: string;
  representative_region: string | null;
  note: string;
}

/** 手机号归属查询（纯本地） */
export function phoneLookup(phone: string): PhoneLookupResult {
  const cleaned = phone.trim();
  if (!/^1[3-9]\d{9}$/.test(cleaned)) {
    return { phone: cleaned, valid: false, carrier: null, segment: "", representative_region: null, note: "无效手机号（需 11 位，1[3-9] 开头）" };
  }
  const seg3 = cleaned.slice(0, 3);
  const seg4 = cleaned.slice(0, 4);
  let carrier = PHONE_ISP[seg3] ?? null;
  let note = "号段有效";
  if (seg3 === "170") {
    carrier = PHONE_170[seg4] ?? "虚拟运营商";
    note = "虚拟运营商号段";
  } else if (seg3 === "171") {
    carrier = "中国联通（虚拟）";
    note = "虚拟运营商号段";
  } else if (seg3 === "174") {
    note = "卫星/应急通信号段";
  }
  const region = PHONE_PROVINCE[seg4] ?? null;
  return {
    phone: cleaned,
    valid: true,
    carrier,
    segment: seg4,
    representative_region: region,
    note: region ? `${note}；省份为代表性归属（初始分配规律），仅供参考` : `${note}；省份未收录（仅内置主要号段）`,
  };
}

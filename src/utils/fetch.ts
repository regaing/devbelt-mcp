/**
 * 抓取封装：统一超时、UA、编码探测（GBK/GB2312 → UTF-8）。
 */
import iconv from "iconv-lite";

export interface FetchOptions {
  /** 超时毫秒，默认 10000 */
  timeout?: number;
  /** 是否伪造国内 IP 头（默认关闭，仅 net_fetch 可选开启） */
  fakeIp?: boolean;
  /** 额外请求头 */
  headers?: Record<string, string>;
}

/** 随机国内 IP 段（用于 fakeIp） */
const FAKE_IP_SEGMENTS: Array<[number, number]> = [
  [607649792, 608174079], // 36.56.0.0-36.63.255.255
  [1038614528, 1039007743], // 61.232.0.0-61.237.255.255
  [1783627776, 1784676351], // 106.80.0.0-106.95.255.255
  [2035023872, 2035154943], // 121.76.0.0-121.77.255.255
  [2078801920, 2079064063], // 123.232.0.0-123.235.255.255
];

function randomFakeIp(): string {
  const seg = FAKE_IP_SEGMENTS[Math.floor(Math.random() * FAKE_IP_SEGMENTS.length)];
  const long = Math.floor(Math.random() * (seg[1] - seg[0]) + seg[0]);
  return [(long >>> 24) & 255, (long >>> 16) & 255, (long >>> 8) & 255, long & 255].join(".");
}

/** 从 Buffer 探测并解码文本（UTF-8 优先，失败回退 GBK） */
export function decodeBuffer(buf: Buffer): string {
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return iconv.decode(buf, "gbk");
  } catch {
    return utf8;
  }
}

/** 抓取 URL 并返回解码后的文本 */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { timeout = 10000, fakeIp = false } = opts;
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`URL 格式不正确（需以 http:// 或 https:// 开头）：${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
    ...opts.headers,
  };
  if (fakeIp) {
    const ip = randomFakeIp();
    headers["X-Forwarded-For"] = ip;
    headers["CLIENT-IP"] = ip;
  }
  try {
    const res = await fetch(url, { signal: controller.signal, headers, redirect: "follow" });
    const buf = Buffer.from(await res.arrayBuffer());
    return decodeBuffer(buf);
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`请求超时（${timeout}ms）：${url}`);
    throw new Error(`请求失败：${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 获取响应头（跟随重定向） */
export async function fetchHeaders(url: string, opts: FetchOptions = {}): Promise<{
  status: number;
  headers: Record<string, string>;
  finalUrl: string;
}> {
  const { timeout = 10000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...opts.headers,
      },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, headers, finalUrl: res.url };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`请求超时（${timeout}ms）：${url}`);
    throw new Error(`请求失败：${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
}

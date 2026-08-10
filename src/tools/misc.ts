/**
 * 其他工具族：misc_barcode / misc_qrcode / misc_favicon / misc_shortcut / misc_reference
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import { McpToolError, guard } from "../utils/errors.js";

/* ---------------- ICO 封装（PNG 数据直接嵌入，Vista+ 支持） ---------------- */
function pngToIco(png: Buffer): Buffer {
  if (png.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new McpToolError("仅支持 PNG 输入（请先用 image_process 或 encode_base64 转为 PNG）", "FORMAT");
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > 256 || height > 256) {
    throw new McpToolError(`图片尺寸 ${width}x${height} 超出 256px 限制`, "INVALID");
  }
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(width >= 256 ? 0 : width, 6);
  header.writeUInt8(height >= 256 ? 0 : height, 7);
  header.writeUInt8(0, 8); // palette
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bpp
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

/* ---------------- 静态参考表 ---------------- */
const HTTP_STATUS: Record<string, string> = {
  "100": "Continue 继续", "101": "Switching Protocols 切换协议", "200": "OK 成功",
  "201": "Created 已创建", "202": "Accepted 已接受", "204": "No Content 无内容",
  "301": "Moved Permanently 永久重定向", "302": "Found 临时重定向", "304": "Not Modified 未修改",
  "307": "Temporary Redirect 临时重定向", "308": "Permanent Redirect 永久重定向",
  "400": "Bad Request 请求错误", "401": "Unauthorized 未认证", "403": "Forbidden 禁止访问",
  "404": "Not Found 未找到", "405": "Method Not Allowed 方法不允许", "408": "Request Timeout 请求超时",
  "409": "Conflict 冲突", "410": "Gone 已删除", "413": "Payload Too Large 负载过大",
  "415": "Unsupported Media Type 不支持的媒体类型", "429": "Too Many Requests 请求过多",
  "500": "Internal Server Error 服务器内部错误", "501": "Not Implemented 未实现",
  "502": "Bad Gateway 网关错误", "503": "Service Unavailable 服务不可用",
  "504": "Gateway Timeout 网关超时", "505": "HTTP Version Not Supported 版本不支持",
};
const HTTP_METHODS = ["GET 获取资源", "POST 提交数据", "PUT 更新资源", "DELETE 删除资源", "PATCH 部分更新", "HEAD 仅响应头", "OPTIONS 查询支持方法", "TRACE 回显请求", "CONNECT 建立隧道"];
const CONTENT_TYPES: Record<string, string> = {
  html: "text/html", css: "text/css", js: "text/javascript", json: "application/json",
  xml: "application/xml", txt: "text/plain", csv: "text/csv", pdf: "application/pdf",
  zip: "application/zip", gz: "application/gzip", png: "image/png", jpg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon",
  mp3: "audio/mpeg", mp4: "video/mp4", wav: "audio/wav", doc: "application/msword",
  xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
};
const PORTS: Record<string, string> = {
  "20/21": "FTP 文件传输", "22": "SSH 安全外壳", "23": "Telnet", "25": "SMTP 邮件发送",
  "53": "DNS 域名解析", "80": "HTTP", "110": "POP3 邮件接收", "143": "IMAP",
  "443": "HTTPS", "3306": "MySQL", "3389": "RDP 远程桌面", "5432": "PostgreSQL",
  "6379": "Redis", "27017": "MongoDB", "8080": "HTTP 备选/代理", "8888": "常用 Web 面板",
};
const DNS_LIST = [
  "114.114.114.114（114DNS）", "223.5.5.5 / 223.6.6.6（阿里）", "119.29.29.29（腾讯）",
  "8.8.8.8 / 8.8.4.4（Google）", "1.1.1.1 / 1.0.0.1（Cloudflare）", "180.76.76.76（百度）",
  "208.67.222.222 / 208.67.220.220（OpenDNS）",
];
const DYNASTY = [
  "夏（约前2070-前1600）", "商（约前1600-前1046）", "周·西周（前1046-前771）",
  "周·东周/春秋战国（前770-前221）", "秦（前221-前207）", "汉·西汉（前202-9）",
  "汉·新（9-23）", "汉·东汉（25-220）", "三国（220-280）", "晋·西晋（265-316）",
  "晋·东晋/十六国（317-420）", "南北朝（420-589）", "隋（581-618）", "唐（618-907）",
  "五代十国（907-960）", "宋·北宋（960-1127）", "宋·南宋（1127-1279）", "辽（916-1125）",
  "金（1115-1234）", "元（1271-1368）", "明（1368-1644）", "清（1636-1912）",
];
const ETHNIC = ["汉族", "壮族", "回族", "满族", "维吾尔族", "苗族", "彝族", "土家族", "藏族", "蒙古族", "侗族", "布依族", "瑶族", "白族", "朝鲜族", "哈尼族", "黎族", "哈萨克族", "傣族", "畲族", "傈僳族", "仡佬族", "东乡族", "高山族", "拉祜族", "水族", "佤族", "纳西族", "羌族", "土族", "仫佬族", "锡伯族", "柯尔克孜族", "达斡尔族", "景颇族", "毛南族", "撒拉族", "布朗族", "塔吉克族", "阿昌族", "普米族", "鄂温克族", "怒族", "京族", "基诺族", "德昂族", "保安族", "俄罗斯族", "裕固族", "乌孜别克族", "门巴族", "鄂伦春族", "独龙族", "塔塔尔族", "赫哲族", "高山族"];
const KEYCODE: Record<string, string> = {
  "8": "Backspace 退格", "9": "Tab", "13": "Enter 回车", "16": "Shift", "17": "Ctrl",
  "18": "Alt", "20": "Caps Lock", "27": "Esc", "32": "Space 空格", "33": "PageUp",
  "34": "PageDown", "35": "End", "36": "Home", "37": "← 左", "38": "↑ 上", "39": "→ 右",
  "40": "↓ 下", "45": "Insert", "46": "Delete", "48-57": "0-9", "65-90": "A-Z",
  "112-123": "F1-F12",
};
const GLYPHICONS = ["glyphicon-home 首页", "glyphicon-search 搜索", "glyphicon-user 用户", "glyphicon-cog 设置", "glyphicon-download 下载", "glyphicon-upload 上传", "glyphicon-refresh 刷新", "glyphicon-edit 编辑", "glyphicon-trash 删除", "glyphicon-plus 加", "glyphicon-minus 减", "glyphicon-ok 正确", "glyphicon-remove 移除", "glyphicon-star 星标", "glyphicon-heart 心形", "glyphicon-envelope 邮件", "glyphicon-phone 电话", "glyphicon-print 打印", "glyphicon-save 保存", "glyphicon-lock 锁定", "glyphicon-eye-open 可见", "glyphicon-zoom-in 放大", "glyphicon-zoom-out 缩小", "glyphicon-calendar 日历", "glyphicon-time 时间", "glyphicon-bell 铃铛", "glyphicon-comment 评论", "glyphicon-share 分享", "glyphicon-link 链接", "glyphicon-globe 地球"];

function buildReference(topic: string, keyword?: string): string {
  const kw = (keyword ?? "").toLowerCase();
  const filter = (lines: string[]): string => {
    const list = kw ? lines.filter((l) => l.toLowerCase().includes(kw)) : lines;
    return list.length ? list.join("\n") : `「${keyword}」在 ${topic} 中无匹配条目`;
  };
  switch (topic) {
    case "http_status": return filter(Object.entries(HTTP_STATUS).map(([k, v]) => `${k} ${v}`));
    case "http_method": return filter(HTTP_METHODS);
    case "content_type": return filter(Object.entries(CONTENT_TYPES).map(([k, v]) => `${k} → ${v}`));
    case "ports": return filter(Object.entries(PORTS).map(([k, v]) => `端口 ${k}：${v}`));
    case "dns": return filter(DNS_LIST);
    case "ascii": {
      const rows: string[] = [];
      for (let i = 32; i <= 126; i++) {
        rows.push(`${i} → ${String.fromCharCode(i)}`);
      }
      return filter(rows);
    }
    case "dynasty": return filter(DYNASTY);
    case "ethnic": return filter(ETHNIC.map((e, i) => `${i + 1}. ${e}`));
    case "keycode": return filter(Object.entries(KEYCODE).map(([k, v]) => `KeyCode ${k}：${v}`));
    case "glyphicons": return filter(GLYPHICONS);
    case "currency":
      return filter(["CNY 人民币 ¥", "USD 美元 $", "EUR 欧元 €", "JPY 日元 ¥", "GBP 英镑 £", "HKD 港币 HK$", "KRW 韩元 ₩", "SGD 新加坡元 S$", "AUD 澳元 A$", "CAD 加元 C$", "CHF 瑞郎 Fr", "RUB 卢布 ₽"]);
    case "capital":
      return filter(["中国-北京", "美国-华盛顿", "英国-伦敦", "法国-巴黎", "德国-柏林", "日本-东京", "韩国-首尔", "俄罗斯-莫斯科", "印度-新德里", "澳大利亚-堪培拉", "加拿大-渥太华", "意大利-罗马", "西班牙-马德里", "巴西-巴西利亚", "埃及-开罗", "泰国-曼谷", "新加坡-新加坡", "荷兰-阿姆斯特丹", "瑞士-伯尔尼", "瑞典-斯德哥尔摩"]);
    case "areacode":
      return filter(["中国大陆 +86", "香港 +852", "澳门 +853", "台湾 +886", "美国/加拿大 +1", "英国 +44", "日本 +81", "韩国 +82", "新加坡 +65", "德国 +49", "法国 +33", "俄罗斯 +7", "澳大利亚 +61", "意大利 +39", "西班牙 +34", "泰国 +66", "马来西亚 +60", "印度 +91"]);
    case "symbols":
      return filter(["❤ ♥ 心形", "★ ☆ 星形", "☀ ☁ ☂ 天气", "✓ ✔ ✗ 对勾", "→ ← ↑ ↓ 箭头", "♪ ♫ 音符", "♠ ♣ ♥ ♦ 扑克", "© ® ™ 商标", "①②③ 编号", "℃ ℉ 温度", "№ § ¶ 特殊"]);
    case "android_manifest":
      return filter(["INTERNET 网络访问", "ACCESS_NETWORK_STATE 网络状态", "ACCESS_WIFI_STATE WiFi状态", "READ_EXTERNAL_STORAGE 读外部存储", "WRITE_EXTERNAL_STORAGE 写外部存储", "CAMERA 相机", "RECORD_AUDIO 录音", "READ_CONTACTS 读联系人", "SEND_SMS 发短信", "CALL_PHONE 拨打电话", "LOCATION 定位", "VIBRATE 振动", "BLUETOOTH 蓝牙"]);
    case "ua":
      return filter(["Chrome: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", "Firefox: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0", "Edge: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edge/120.0 Chrome/120.0 Safari/537.36", "iPhone: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1", "Android: Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"]);
    case "festival":
      return filter(["元旦 1月1日", "春节 农历正月初一", "元宵节 农历正月十五", "妇女节 3月8日", "劳动节 5月1日", "青年节 5月4日", "儿童节 6月1日", "端午节 农历五月初五", "建党节 7月1日", "建军节 8月1日", "七夕 农历七月初七", "中秋节 农历八月十五", "教师节 9月10日", "国庆节 10月1日", "重阳节 农历九月初九", "圣诞节 12月25日"]);
    default:
      throw new McpToolError(`未知 topic：${topic}`, "INVALID_PARAM");
  }
}

export function registerMiscTools(server: McpServer): void {
  server.tool(
    "misc_barcode",
    "条形码生成。type 可选 ean8/ean13/code39/code128/upca，format 可选 png（base64）或 svg。output_path 可保存文件",
    {
      text: z.string().describe("条形码内容"),
      type: z.enum(["ean8", "ean13", "code39", "code128", "upca"]).default("code128"),
      format: z.enum(["png", "svg"]).default("png"),
      height: z.number().int().min(10).max(200).default(40),
      output_path: z.string().optional(),
    },
    guard(async ({ text, type, format, height, output_path }) => {
      if (!text.trim()) throw new McpToolError("text 不能为空", "INVALID_PARAM");
      try {
        if (format === "svg") {
          const svg = bwipjs.toSVG({ bcid: type, text, scale: 2, height });
          if (output_path) {
            fs.writeFileSync(path.resolve(output_path), svg);
            return `已写入 SVG 到 ${output_path}`;
          }
          return svg;
        }
        const png = await bwipjs.toBuffer({ bcid: type, text, scale: 2, height });
        if (output_path) {
          fs.writeFileSync(path.resolve(output_path), png);
          return `已写入 PNG（${png.length} 字节）到 ${output_path}`;
        }
        return `data:image/png;base64,${png.toString("base64")}`;
      } catch (e: any) {
        throw new McpToolError(`条形码生成失败：${e?.message ?? e}（${type} 类型对内容格式有要求，如 EAN13 需 12 位数字）`, "BARCODE");
      }
    }),
  );

  server.tool(
    "misc_qrcode",
    "二维码生成。format 可选 png（base64 dataURL）/svg；error_level 纠错等级 L/M/Q/H；output_path 可保存文件",
    {
      text: z.string().describe("二维码内容（URL/文本/JSON 均可）"),
      size: z.number().int().min(64).max(2048).default(256),
      margin: z.number().int().min(0).max(50).default(2).describe("边距模块数"),
      error_level: z.enum(["L", "M", "Q", "H"]).default("M"),
      format: z.enum(["png", "svg"]).default("png"),
      output_path: z.string().optional(),
    },
    guard(async ({ text, size, margin, error_level, format, output_path }) => {
      if (!text.trim()) throw new McpToolError("text 不能为空", "INVALID_PARAM");
      const opts = { width: size, margin, errorCorrectionLevel: error_level };
      if (format === "svg") {
        const svg = await QRCode.toString(text, { ...opts, type: "svg" });
        if (output_path) {
          fs.writeFileSync(path.resolve(output_path), svg);
          return `已写入 SVG 到 ${output_path}`;
        }
        return svg;
      }
      const buf = await QRCode.toBuffer(text, opts);
      if (output_path) {
        fs.writeFileSync(path.resolve(output_path), buf);
        return `已写入 PNG（${buf.length} 字节，${size}x${size}）到 ${output_path}`;
      }
      return `data:image/png;base64,${buf.toString("base64")}`;
    }),
  );

  server.tool(
    "misc_favicon",
    "favicon.ico 生成：将 PNG 图片封装为 ICO（Vista+ PNG-ICO 格式）。image 支持本地路径或 base64（dataURL）。尺寸由 PNG 决定（≤256px）",
    {
      image: z.string().describe("PNG 文件路径或 data:image/png;base64,..."),
      output_path: z.string().optional().describe("输出 .ico 文件路径"),
    },
    guard(({ image, output_path }) => {
      let png: Buffer;
      if (image.startsWith("data:")) {
        const b64 = image.split(",")[1] ?? "";
        png = Buffer.from(b64, "base64");
      } else {
        const abs = path.resolve(image);
        if (!fs.existsSync(abs)) throw new McpToolError(`文件不存在：${image}`, "FILE_NOT_FOUND");
        png = fs.readFileSync(abs);
      }
      const ico = pngToIco(png);
      if (output_path) {
        fs.writeFileSync(path.resolve(output_path), ico);
        return `已生成 ICO（${ico.length} 字节）到 ${output_path}`;
      }
      return `data:image/x-icon;base64,${ico.toString("base64")}`;
    }),
  );

  server.tool(
    "misc_shortcut",
    "生成 Windows 桌面快捷方式（.url 文件内容）。output_path 可保存为 .url 文件",
    { name: z.string(), url: z.string(), output_path: z.string().optional() },
    guard(({ name, url, output_path }) => {
      if (!/^https?:\/\//i.test(url)) throw new McpToolError("url 需以 http:// 或 https:// 开头", "INVALID_PARAM");
      const content = `[InternetShortcut]\nURL=${url}\nProp3=19,2\nIconIndex=1\n`;
      if (output_path) {
        fs.writeFileSync(path.resolve(output_path), content);
        return `已写入 ${output_path}`;
      }
      return content;
    }),
  );

  server.tool(
    "misc_reference",
    "常用参考表查询。topic 可选：http_status/http_method/content_type/ports/dns/ascii/dynasty/ethnic/keycode/glyphicons/currency/capital/areacode/symbols/android_manifest/ua/festival。keyword 可选过滤",
    {
      topic: z.enum(["http_status", "http_method", "content_type", "ports", "dns", "ascii", "dynasty", "ethnic", "keycode", "glyphicons", "currency", "capital", "areacode", "symbols", "android_manifest", "ua", "festival"]),
      keyword: z.string().optional().describe("过滤关键词"),
    },
    guard(({ topic, keyword }) => buildReference(topic, keyword)),
  );
}

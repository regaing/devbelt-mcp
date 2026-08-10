/**
 * 加解密族：crypto_hash / crypto_symmetric / crypto_morse /
 * crypto_download_url / color_convert
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pinyin } from "pinyin-pro";
import { McpToolError, guard } from "../utils/errors.js";

const HASH_ALGOS = [
  "md5", "sha1", "sha224", "sha256", "sha384", "sha512",
  "hmac-md5", "hmac-sha1", "hmac-sha224", "hmac-sha256", "hmac-sha384", "hmac-sha512",
] as const;

export function registerCryptoTools(server: McpServer): void {
  server.tool(
    "crypto_hash",
    `散列/哈希计算（不可逆）。algorithm 可选：${HASH_ALGOS.join("、")}。MD5 支持 16/32 位输出`,
    {
      text: z.string(),
      algorithm: z.enum(HASH_ALGOS).default("md5"),
      case: z.enum(["lower", "upper"]).default("lower").describe("输出大小写"),
      bits: z.enum(["16", "32"]).default("32").describe("仅 MD5 有效：16 位取中间段"),
      key: z.string().optional().describe("hmac-* 算法的密钥"),
    },
    guard(({ text, algorithm, case: outCase, bits, key }) => {
      let digest: string;
      if (algorithm.startsWith("hmac-")) {
        if (!key) throw new McpToolError("hmac 算法需要 key 参数", "INVALID_PARAM");
        const algo = algorithm.slice(5);
        digest = createHmac(algo, key).update(text).digest("hex");
      } else {
        digest = createHash(algorithm).update(text).digest("hex");
      }
      if (algorithm === "md5" && bits === "16") digest = digest.slice(8, 24);
      return outCase === "upper" ? digest.toUpperCase() : digest;
    }),
  );

  const SYM_ALGOS = [
    "aes-128-gcm", "aes-192-gcm", "aes-256-gcm",
    "aes-128-cbc", "aes-192-cbc", "aes-256-cbc",
  ] as const;

  server.tool(
    "crypto_symmetric",
    `对称加解密（现代标准，node:crypto AES）。algorithm 可选：${SYM_ALGOS.join("、")}。密码经 SHA-256 派生密钥，或直接传 key_hex。GCM 输出格式 base64(iv|tag|密文)，CBC 为 base64(iv|密文)`,
    {
      text: z.string().describe("明文（encrypt）或 base64 密文（decrypt）"),
      algorithm: z.enum(SYM_ALGOS).default("aes-256-gcm"),
      action: z.enum(["encrypt", "decrypt"]).default("encrypt"),
      password: z.string().optional().describe("口令，用于派生密钥"),
      key_hex: z.string().optional().describe("十六进制密钥（优先于 password）"),
      iv_hex: z.string().optional().describe("十六进制 IV（默认随机生成）"),
    },
    guard(({ text, algorithm, action, password, key_hex, iv_hex }) => {
      const keyBytes =
        algorithm.startsWith("aes-128") ? 16 :
        algorithm.startsWith("aes-192") ? 24 :
        algorithm.startsWith("aes-256") ? 32 : 16;
      const isGcm = algorithm.endsWith("-gcm");
      const ivBytes = isGcm ? 12 : 16;
      const iv = iv_hex ? Buffer.from(iv_hex, "hex") : randomBytes(ivBytes);
      if (iv_hex && iv.length !== ivBytes) {
        throw new McpToolError(`iv_hex 需要 ${ivBytes} 字节（${ivBytes * 2} hex 字符）`, "IV");
      }
      const key = key_hex ? Buffer.from(key_hex, "hex") : deriveKey(password ?? "", keyBytes);
      if (key.length !== keyBytes) {
        throw new McpToolError(`key_hex 需要 ${keyBytes} 字节（${keyBytes * 2} hex 字符）`, "KEY");
      }

      if (action === "encrypt") {
        const cipher = createCipheriv(algorithm, key, iv);
        let ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
        if (isGcm) {
          const tag = (cipher as any).getAuthTag();
          ct = Buffer.concat([iv, tag, ct]);
        } else {
          ct = Buffer.concat([iv, ct]);
        }
        return ct.toString("base64");
      }

      // decrypt
      let buf: Buffer;
      try {
        buf = Buffer.from(text, "base64");
      } catch {
        throw new McpToolError("密文不是合法 base64", "DECODE");
      }
      let useIv: Buffer;
      let data: Buffer;
      if (isGcm) {
        if (buf.length <= 12 + 16) throw new McpToolError("密文过短", "DECODE");
        useIv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        data = buf.subarray(28);
        const decipher = createDecipheriv(algorithm, key, useIv);
        (decipher as any).setAuthTag(tag);
        try {
          return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
        } catch (e: any) {
          throw new McpToolError(`解密失败（密钥/IV 错误或密文被篡改）：${e?.message ?? e}`, "DECRYPT");
        }
      }
      if (buf.length <= 16) throw new McpToolError("密文过短", "DECODE");
      useIv = buf.subarray(0, 16);
      data = buf.subarray(16);
      const decipher = createDecipheriv(algorithm, key, useIv);
      try {
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
      } catch (e: any) {
        throw new McpToolError(`解密失败（密钥/IV 错误或密文被篡改）：${e?.message ?? e}`, "DECRYPT");
      }
    }),
  );

  const MORSE: Record<string, string> = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
    I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
    Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
    Y: "-.--", Z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--",
    "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.", "@": ".--.-.",
    "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-",
    "+": ".-.-.", "-": "-....-", _: "..--.-", '"': ".-..-.", "'": ".----.", $: "...-..-",
  };
  const MORSE_REV: Record<string, string> = Object.fromEntries(
    Object.entries(MORSE).map(([k, v]) => [v, k]),
  );

  server.tool(
    "crypto_morse",
    "摩尔斯电码加密/解密。支持英文、数字、常用标点；中文先转拼音再编码",
    { text: z.string(), action: z.enum(["encode", "decode"]).default("encode") },
    guard(({ text, action }) => {
      if (action === "encode") {
        const tokens = text
          .toUpperCase()
          .split("")
          .map((ch) => {
            if (ch === " ") return "";
            if (MORSE[ch]) return MORSE[ch];
            // 中文 → 拼音首字
            try {
              const py = pinyin(ch, { toneType: "none" });
              return MORSE[py.charAt(0)] ?? "";
            } catch {
              return "";
            }
          })
          .filter((t) => t !== "");
        return tokens.join(" / ").replace(/\s+\/\s+/g, " / ");
      }
      return text
        .split(/\s*\/\s*|\s+/)
        .filter(Boolean)
        .map((code) => MORSE_REV[code] ?? `?(${code})`)
        .join("");
    }),
  );

  server.tool(
    "crypto_download_url",
    "下载地址加解密：迅雷(thunder://)、快车(flashget://)、旋风(qqdl://)。输入普通 http(s) 地址或对应前缀的密文",
    {
      text: z.string(),
      action: z.enum(["encrypt", "decode"]).default("encrypt"),
      engine: z.enum(["thunder", "flashget", "qqdl"]).default("thunder"),
    },
    guard(({ text, action, engine }) => {
      if (action === "encrypt") {
        const url = /^https?:\/\//i.test(text) ? text : `http://${text}`;
        if (engine === "thunder") {
          return "thunder://" + Buffer.from("AA" + url + "ZZ", "utf8").toString("base64");
        }
        if (engine === "flashget") {
          return "flashget://" + Buffer.from("FLASHGET" + url + "YY", "utf8").toString("base64");
        }
        return "qqdl://" + Buffer.from(url, "utf8").toString("base64");
      }
      const prefixes: Record<string, RegExp> = {
        thunder: /^thunder:\/\//i,
        flashget: /^flashget:\/\//i,
        qqdl: /^qqdl:\/\//i,
      };
      const re = prefixes[engine];
      if (!re.test(text)) throw new McpToolError(`输入不是 ${engine}:// 前缀的地址`, "DECODE");
      const b64 = text.replace(re, "");
      let decoded: string;
      try {
        decoded = Buffer.from(b64, "base64").toString("utf8");
      } catch {
        throw new McpToolError("Base64 解码失败", "DECODE");
      }
      if (engine === "thunder") decoded = decoded.replace(/^AA/, "").replace(/ZZ$/, "");
      if (engine === "flashget") decoded = decoded.replace(/^FLASHGET/, "").replace(/YY$/, "");
      return decoded;
    }),
  );

  server.tool(
    "color_convert",
    "颜色格式互转：HEX（#RRGGBB）↔ RGB（rgb(r,g,b) 或 r,g,b）",
    { value: z.string(), from: z.enum(["hex", "rgb"]).default("hex") },
    guard(({ value, from }) => {
      if (from === "hex") {
        const hex = value.replace(/^#/, "");
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new McpToolError("HEX 格式应为 #RRGGBB", "INVALID");
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgb(${r}, ${g}, ${b})`;
      }
      const m = value.match(/\d{1,3}/g);
      if (!m || m.length !== 3) throw new McpToolError("RGB 格式应为 rgb(r,g,b) 或 r,g,b", "INVALID");
      const [r, g, b] = m.map((n) => {
        const v = parseInt(n, 10);
        if (v < 0 || v > 255) throw new McpToolError("RGB 分量需在 0-255 之间", "INVALID");
        return v;
      });
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
    }),
  );
}

function deriveKey(password: string, bytes: number): Buffer {
  if (!password) throw new McpToolError("需要 password 或 key_hex 参数", "KEY");
  return createHash("sha256").update(password).digest().subarray(0, bytes);
}

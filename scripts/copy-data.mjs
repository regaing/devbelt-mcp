/**
 * 构建后复制内置数据文件（phone.dat）到 dist/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src", "data", "phone.dat");
const dest = path.join(root, "dist", "data", "phone.dat");

if (!fs.existsSync(src)) {
  console.error(`[copy-data] 源文件不存在: ${src}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-data] ${path.basename(src)} → dist/data/ (${fs.statSync(dest).size} bytes)`);

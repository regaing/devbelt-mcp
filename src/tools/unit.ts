/**
 * 单位换算族：unit_convert（13 类单位换算）
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UNIT_CATEGORIES, UNIT_CATEGORY_NAMES, convertUnit } from "../lib/units.js";
import { guard } from "../utils/errors.js";

const categoryDesc = Object.entries(UNIT_CATEGORIES)
  .map(([k, v]) => `${k}(${v.name}：${Object.keys(v.units).join("/")})`)
  .join("；");

export function registerUnitTools(server: McpServer): void {
  server.tool(
    "unit_convert",
    `单位换算。category 可选：${categoryDesc}。温度单位：C=摄氏度 F=华氏度 K=开氏度 R=兰氏度 Re=列氏度`,
    {
      category: z.enum(UNIT_CATEGORY_NAMES as [string, ...string[]]).describe("单位类别"),
      value: z.number(),
      from: z.string().describe("源单位"),
      to: z.string().describe("目标单位"),
    },
    guard(({ category, value, from, to }) => {
      const result = convertUnit(category, value, from, to);
      const cat = UNIT_CATEGORIES[category];
      // 对极小/极大值做精度整理
      const formatted = Math.abs(result) >= 1e15 || (Math.abs(result) < 1e-10 && result !== 0)
        ? result.toExponential(6)
        : String(Math.round(result * 1e10) / 1e10);
      return `${value} ${from} = ${formatted} ${to}（${cat.name}换算）`;
    }),
  );
}

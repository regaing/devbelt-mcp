# About This Project

> 灵犀会自动参考本文件中的说明来协助开发。

## 仓库结构

- **根目录即主项目** — AI 工具 MCP server（包名 `@lingxi-agent/devbelt-mcp`），TypeScript + Node.js ≥18，
  提供 77 个在线工具（编码/加解密/代码格式化/JSON/文本/单位换算/网络查询/二维码等），零数据库。
  - `src/tools/` 按功能族组织（encode/crypto/code/json/data/text/unit/net/misc/time）
  - `src/lib/units.ts` 单位换算常量表
  - `test/tools.test.ts` 97 个端到端测试
  - 开发命令：`npm run build`（tsc）、`npm test`（vitest）、`npm run dev`（tsx）
  - 产物：`dist/index.js`（stdio server）

## 开发约定

- 所有 MCP 工具用 `server.tool(name, desc, schema, guard(callback))` 注册，
  回调统一用 `guard()` 包装（异常自动转可读错误文本，不抛堆栈）
- 工具命名 `<族>_<动作>`（如 `crypto_hash`、`unit_convert`），参数枚举用 zod + describe 写清可选值
- 对称加密走现代标准（node:crypto AES-GCM/CBC）
- 新增工具必须补测试（test/tools.test.ts，端到端 InMemoryTransport 方式）
- 外部接口（工信部 ICP 等）变动时降级为可读错误，不抛裸异常

## 技术栈

TypeScript（ESM, NodeNext）/ @modelcontextprotocol/sdk / zod / vitest /
prettier / sql-formatter / ws / qrcode / bwip-js / opencc-js / pinyin-pro / xlsx / js-yaml / marked / turndown / diff / iconv-lite / javascript-obfuscator / lunar-typescript / cron-parser / jsonpath-plus / mathjs / bcryptjs / ajv / jschardet / jsqr / pngjs

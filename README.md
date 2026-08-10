<div align="center">

# 🧰 devbelt-mcp

**为 LLM 提供 53 个工具 · 164 项细分能力的 MCP server**

JSON 处理 · 加解密 · 代码格式化 · 文本转换 · 单位换算 · 网络查询 · 二维码生成

![npm version](https://img.shields.io/npm/v/@lingxi-agent/devbelt-mcp?color=cb3837&label=npm)
![license](https://img.shields.io/badge/license-MIT-brightgreen)
![language](https://img.shields.io/badge/language-TypeScript-3178c6)
![node](https://img.shields.io/badge/node-%3E%3D18-339933)
![mcp](https://img.shields.io/badge/MCP-stdio-8b5cf6)
![tools](https://img.shields.io/badge/tools-53%20tools%20%7C%20164%20capabilities-4fc3f7)
![tests](https://img.shields.io/badge/tests-63%20passing-2ea44f)

</div>

## 📖 项目简介

`devbelt-mcp` 是一个 **MCP（Model Context Protocol）server**，将 53 个常用在线工具（**164 项细分能力**，按算法/语言/类别维度展开）封装为可被 AI 直接调用的接口：

- **JSON 工具**：格式化/压缩/校验、JSON↔XML/YAML/GET 参数、生成 C#/Java/Go 实体类
- **加解密**：MD5/SHA/HMAC 哈希、AES-GCM/CBC 对称加解密、摩尔斯电码、迅雷/快车 URL 加解密
- **代码工具**：18 种语言格式化与压缩、JS 混淆、正则测试/生成、XPath 提取
- **文本转换**：简繁互转、拼音、全角半角、竖排、去重、火星文、UUID 生成等 14 种
- **单位换算**：长度/面积/温度/速度/压力/数据大小等 13 类
- **网络查询**：WHOIS、ICP 备案、HTTP 状态、Gzip 检测、死链检测、网页抓取、WebSocket 完整会话测试
- **其他**：二维码/条形码/ICO 图标生成、17 类参考表查询

LLM 通过 MCP 协议调用即可，无需编写任何代码；本地 stdio 直连、零数据库、无外部服务依赖（除工信部 ICP 接口）。

## ✨ 特性

- 🚀 **53 个工具 · 164 项细分能力**：编码转换 / 加解密 / 代码格式化 / JSON / 文本处理 / 单位换算 / 网络查询 / 二维码（如 `crypto_hash` 一个工具覆盖 12 种哈希算法，`code_format` 覆盖 18 种语言）
- 🧩 **现代加密标准**：AES-GCM/CBC（`node:crypto`），无历史算法残留
- ⚡ **stdio 直连**：本地运行、零数据库、无状态
- 🛡️ **统一错误处理**：异常自动转为可读文本，不抛裸堆栈
- ✅ **63 个端到端测试**：InMemoryTransport 连接真实 server，含 golden 回归

## 🚀 快速开始

```bash
npm install
npm run build        # 编译到 dist/
npm test             # 运行 63 个端到端测试
node dist/index.js   # 启动 stdio server
```

### 调用示例

```json
{
  "mcpServers": {
    "devbelt-mcp": {
      "command": "npx",
      "args": ["-y", "@lingxi-agent/devbelt-mcp"]
    }
  }
}
```

接入后 LLM 可直接调用，例如：

```
crypto_hash(text: "abc", algorithm: "md5")
  → 900150983cd24fb0d6963f7d28e17f72

unit_convert(category: "temperature", value: 100, from: "C", to: "F")
  → 100 C = 212 F（温度换算）

net_websocket_test(url: "wss://echo.websocket.org", messages: ["hello"], ping: true)
  → ✓ 连接成功 / → 发送：hello / ← 收到：hello / ✓ 收到 pong / ◼ 连接关闭
```

## 📦 客户端接入（LingXi / Claude Desktop 等）

**方式一：npx（推荐）**

```json
{
  "mcpServers": {
    "devbelt-mcp": {
      "command": "npx",
      "args": ["-y", "@lingxi-agent/devbelt-mcp"]
    }
  }
}
```

**方式二：本地 node 直接运行（开发/未发布时）**

```json
{
  "mcpServers": {
    "devbelt-mcp": {
      "command": "node",
      "args": ["W:/Project/devbelt-mcp/dist/index.js"]
    }
  }
}
```

## 🧰 工具清单（53 个工具 · 164 项细分能力）

### 编码转换 `encode_*`（7）
| 工具 | 功能 |
|---|---|
| `encode_url` | URL 编码/解码 |
| `encode_base64` | Base64 文本/图片互转 |
| `encode_unicode` | Unicode（\uXXXX）互转 |
| `encode_utf8` | UTF-8 编码/解码（%XX 形式） |
| `encode_ascii` | ASCII 编码/解码 |
| `encode_escape` | Escape 编码/解码 |
| `encode_radix` | 任意进制互转（2~36，支持大数） |

### 加解密 `crypto_*`（5）
| 工具 | 功能 |
|---|---|
| `crypto_hash` | MD5（16/32位）/SHA 系列/HMAC |
| `crypto_symmetric` | AES 对称加解密：GCM/CBC（现代标准） |
| `crypto_morse` | 摩尔斯电码（中文自动转拼音） |
| `crypto_download_url` | 迅雷/快车/旋风下载地址加解密 |
| `color_convert` | HEX ↔ RGB 颜色转换 |

### 代码工具 `code_*`（5）
| 工具 | 功能 |
|---|---|
| `code_format` | 18 种语言格式化/压缩（prettier + sql-formatter） |
| `code_obfuscate` | JS 混淆/美化（单向，禁止恶意用途） |
| `regex_tool` | 正则测试/提取/替换 |
| `regex_generate` | 7 种语言正则代码生成 |
| `xpath_tool` | 简易 XPath 提取 |

### JSON `json_*`（3）
`json_process`（格式化/压缩/转义/校验）、`json_convert`（↔XML/YAML/GET 参数）、`json_entity`（生成 C#/Java/Go 实体类，SQL→Java）

### 数据转换 `data_*`（4）
`data_html_convert`（HTML↔JS/PHP/C#/JSP/ASP/Perl/UBB/Markdown）、`data_html_table`（CSV/JSON→HTML 表格）、`data_excel_json`（Excel↔JSON）、`data_text_diff`（文本差异）

### 文本处理 `text_*`（14）
大小写、简繁互转、拼音、全角半角、翻转、竖排、字数统计、去重、替换、HTML 过滤、自动排版、随机数/密码、火星文、UUID/GUID 生成

### 单位换算 `unit_convert`（1）
13 类单位：长度/面积/体积/速度/压力/功率/热量/力/时间/数据大小/角度/密度/温度

### 网络查询 `net_*`（9）
| 工具 | 功能 | 依赖 |
|---|---|---|
| `net_whois` | WHOIS 查询（**原生实现**，连 whois.iana.org 递归） | 无第三方 |
| `net_icp` | ICP 备案查询（工信部官方接口） | 工信部 |
| `net_url_status` | HTTP 状态/响应头检测 | 直接请求 |
| `net_gzip_check` | Gzip 压缩检测 | 直接请求 |
| `net_dead_link` | 网站死链检测 | 直接请求 |
| `net_fetch` | 网页抓取（自动 GBK/UTF-8 解码） | 直接请求 |
| `net_meta_analyze` | Meta 标签分析 | 直接请求 |
| `net_keyword_density` | 关键词密度检测 | 直接请求 |
| `net_websocket_test` | WebSocket 完整会话（消息收发/ping RTT/wait_for） | ws 包 |

### 其他 `misc_*`（5）
`misc_barcode`（条形码）、`misc_qrcode`（二维码）、`misc_favicon`（PNG→ICO）、`misc_shortcut`（桌面快捷方式）、`misc_reference`（17 类参考表查询）

## 🏗️ 设计说明

- **聚合粒度**：算法同族共用 schema（如 `crypto_hash(text, algorithm)` 覆盖 MD5/SHA 全家），53 个工具覆盖全部工具类型
- **统一错误处理**：所有工具异常返回可读错误文本（含可选参数提示），不会抛裸堆栈
- **现代加密**：对称加密基于 `node:crypto`（AES-GCM/CBC 等现代标准）
- **静态参考表**：17 类对照表（HTTP 状态码/端口/DNS/朝代/民族等）收敛为 `misc_reference` 一个工具

## 🧪 测试

```bash
npm test
```

63 个端到端测试（InMemoryTransport 连接真实 server）覆盖：
- 全部 53 个工具调用
- 标准输入输出回归（`md5('abc')`、进制转换、单位换算等）
- 本地 mock HTTP/WebSocket 服务验证网络工具
- 错误路径（非法参数、解密失败、连接失败）

## ⚠️ 已知限制

- `net_icp` 依赖工信部接口（`hlwicpfwc.miit.gov.cn`），接口变动时工具会返回可读错误
- `code_format` 对 php/java/c/cpp 等语言为基础缩进美化（非完整 AST 格式化）
- `xpath_tool` 为轻量正则实现，不支持复杂轴表达式

## 📄 License

[MIT](./LICENSE) © 2026 [@lingxi-agent](https://www.npmjs.com/org/lingxi-agent)

<p align="center">
  <a href="README.md">中文</a> · <a href="README.en.md">English</a>
</p>

<div align="center">

# 🧰 devbelt-mcp

**An online toolbox for AI assistants — 77 everyday utilities, callable with plain language**

JSON · Encryption · Code Formatting · Text Conversion · Unit Conversion · Network Lookup · QR Code

![npm version](https://img.shields.io/npm/v/@lingxi-agent/devbelt-mcp?color=cb3837&label=npm)
![license](https://img.shields.io/badge/license-MIT-brightgreen)
![language](https://img.shields.io/badge/language-TypeScript-3178c6)
![node](https://img.shields.io/badge/node-%3E%3D18-339933)
![mcp](https://img.shields.io/badge/MCP-stdio-8b5cf6)
![tools](https://img.shields.io/badge/tools-77%20tools%20%7C%20170%2B%20capabilities-4fc3f7)
![tests](https://img.shields.io/badge/tests-97%20passing-2ea44f)

</div>

## 📖 What is this?

`devbelt-mcp` packages **77 everyday online utilities** (with **170+ granular capabilities**) into interfaces **AI can call directly** — think of it as equipping an AI with an online toolbox.

Once connected to an AI client (LingXi / Claude Desktop / etc.), just talk to the AI in plain language:

> "Format this JSON for me" → `json_process`
> "What's the MD5 of abc?" → `crypto_hash`
> "How many Fahrenheit is 100 Celsius?" → `unit_convert`
> "Look up the WHOIS info for example.com" → `net_whois`
> "Generate a QR code" → `misc_qrcode`

The AI automatically invokes the right tool and returns the result — **no code required from you**.

More examples in [💬 Example Prompts](#-example-prompts) below.

### What's in the toolbox

- **JSON tools**: format/compress/validate, JSON↔XML/YAML/GET params, generate C#/Java/Go entity classes
- **Encryption & hashing**: MD5/SHA/HMAC hashing, AES-GCM/CBC symmetric encryption, Morse code, Thunder/FlashGet download URL encode/decode
- **Code tools**: format & minify in 18 languages, JS obfuscation, regex testing, regex code generation, XPath extraction
- **Text conversion**: simplified/traditional Chinese, pinyin, fullwidth/halfwidth, text flip, vertical text, dedup, Martian text, UUID generation, ID-card parsing (15 tools)
- **Unit conversion**: 13 categories — length, area, temperature, speed, pressure, data size, etc.
- **Network lookup**: WHOIS, ICP filing, IP geolocation, DNS lookup, HTTP status, Gzip check, dead-link detection, web scraping, full WebSocket session testing
- **Time tools**: timestamp conversion, multi-timezone comparison, time diff/countdown, cron parsing, duration humanization, strftime formatting
- **Others**: QR code / barcode / ICO icon generation, lunar calendar, 17 reference tables

### Under the hood

Built on **MCP** (Model Context Protocol, the open standard for AI tools — think of it as "USB-C for AI"), connected to local AI clients via **stdio**. Everything runs locally: zero database, no external service dependencies (except the MIIT ICP interface).

> 💡 For the best experience, use the **LingXi AI Assistant** ([https://lingxi.regaing.com](https://lingxi.regaing.com)) to connect to this server and get the full AI experience across 77 tools · 170+ capabilities.

## 💬 Example Prompts

Ask the AI in plain language — it will pick the right tool automatically:

### JSON & Encoding

| Prompt | Tool |
|---|---|
| "Format this JSON / minify it into one line" | `json_process` |
| "Is this JSON valid?" | `json_process` |
| "Convert JSON to YAML / XML / GET params" | `json_convert` |
| "Generate Java / C# / Go entity classes from this JSON" | `json_entity` |
| "Base64 / URL-encode this text" | `encode_base64` / `encode_url` |
| "Convert 255 to hexadecimal" | `encode_radix` |

### Encryption & Hashing

| Prompt | Tool |
|---|---|
| "Compute the MD5 / SHA-256 of hello" | `crypto_hash` |
| "Encrypt this text with password abc123" | `crypto_symmetric` |
| "Decrypt this AES ciphertext (key is xxx)" | `crypto_symmetric` |
| "Convert SOS to Morse code" | `crypto_morse` |
| "Decode this Thunder download link" | `crypto_download_url` |
| "What color is #FF0000 in RGB?" | `color_convert` |

### Code

| Prompt | Tool |
|---|---|
| "Format this Python / JS / SQL code" | `code_format` |
| "Minify this CSS / HTML" | `code_format` |
| "Does this regex match this text?" | `regex_tool` |
| "Extract all email addresses with regex" | `regex_tool` |
| "Generate Go regex code" | `regex_generate` |
| "Extract the page title with XPath" | `xpath_tool` |

### Text

| Prompt | Tool |
|---|---|
| "Convert this to traditional / simplified Chinese" | `text_jianfan` |
| "Convert these Chinese characters to pinyin" | `text_pinyin` |
| "Count the characters in this text" | `text_stats` |
| "Generate a random 16-character password" | `text_random` |
| "Generate 5 UUIDs" | `uuid_generate` |
| "Deduplicate these lines" | `text_dedup` |

### Unit Conversion

| Prompt | Tool |
|---|---|
| "How many kilometers is 1 mile?" | `unit_convert` |
| "How many Fahrenheit is 100 Celsius?" | `unit_convert` |
| "How many MB is 5 GB?" | `unit_convert` |

### Network Lookup

| Prompt | Tool |
|---|---|
| "Look up the WHOIS info for example.com" | `net_whois` |
| "Does example.com have an ICP filing?" | `net_icp` |
| "Check if this site has Gzip enabled" | `net_gzip_check` |
| "Fetch the content of this page" | `net_fetch` |
| "Check https://example.com for dead links" | `net_dead_link` |
| "Test if this WebSocket service is reachable" | `net_websocket_test` |

### Generation & Reference

| Prompt | Tool |
|---|---|
| "Generate a QR code containing xxx" | `misc_qrcode` |
| "Generate a CODE128 barcode" | `misc_barcode` |
| "Convert this PNG to an ICO icon" | `misc_favicon` |
| "What does HTTP 404 mean?" | `misc_reference` |
| "What are the common public DNS servers?" | `misc_reference` |

## ✨ Features

- 🚀 **77 tools · 170+ granular capabilities**: encoding / encryption / code formatting / JSON / text / units / network / QR codes (e.g. one `crypto_hash` tool covers 12 hashing algorithms; `code_format` covers 18 languages)
- 🧩 **Modern crypto standards**: AES-GCM/CBC (`node:crypto`), no legacy algorithms
- ⚡ **stdio direct connection**: runs locally, zero database, stateless
- 🛡️ **Unified error handling**: exceptions become readable text, never raw stack traces
- ✅ **97 end-to-end tests**: real server via InMemoryTransport, including golden regression

## 🚀 Quick Start

```bash
npm install
npm run build        # compile to dist/
npm test             # run the 97 end-to-end tests
node dist/index.js   # start the stdio server
```

### Example call

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

Once connected, the AI can call tools directly, e.g.:

```
crypto_hash(text: "abc", algorithm: "md5")
  → 900150983cd24fb0d6963f7d28e17f72

unit_convert(category: "temperature", value: 100, from: "C", to: "F")
  → 100 C = 212 F

net_websocket_test(url: "wss://echo.websocket.org", messages: ["hello"], ping: true)
  → ✓ connected / → sent: hello / ← received: hello / ✓ pong / ◼ closed
```

## 📦 Client Setup (LingXi / Claude Desktop / etc.)

**Option 1: npx (recommended)**

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

**Option 2: local node (development / before publishing)**

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

## 🧰 Tool Inventory (77 tools · 170+ capabilities)

### Encoding `encode_*` (9)
| Tool | Description |
|---|---|
| `encode_url` | URL encode/decode |
| `encode_base64` | Base64 text/image conversion |
| `encode_unicode` | Unicode (\uXXXX) conversion |
| `encode_utf8` | UTF-8 encode/decode (%XX form) |
| `encode_ascii` | ASCII encode/decode |
| `encode_escape` | Escape encode/decode |
| `encode_radix` | Base conversion (2~36, big numbers) |
| `encode_detect` | Text encoding detection (UTF-8/GBK/GB2312 etc.) |
| `encode_html` | HTML entity encode/decode (&lt;&gt;&amp; etc.) |

### Encryption & Hashing `crypto_*` (8)
| Tool | Description |
|---|---|
| `crypto_hash` | MD5 (16/32-bit) / SHA family / HMAC |
| `crypto_symmetric` | AES symmetric encryption: GCM/CBC (modern standards) |
| `crypto_morse` | Morse code (Chinese auto-converted to pinyin) |
| `crypto_download_url` | Thunder/FlashGet/QQ download URL encode/decode |
| `color_convert` | HEX ↔ RGB conversion |
| `crypto_jwt` | JWT decode & verify (HS256) |
| `crypto_rsa` | RSA asymmetric crypto/signature (keygen/encrypt/decrypt/sign/verify) |
| `crypto_password_hash` | bcrypt password hash & verify |

### Code `code_*` (5)
| Tool | Description |
|---|---|
| `code_format` | Format/minify in 18 languages (prettier + sql-formatter) |
| `code_obfuscate` | JS obfuscation/beautify (one-way; no malicious use) |
| `regex_tool` | Regex test/extract/replace |
| `regex_generate` | Regex code generation in 7 languages |
| `xpath_tool` | Lightweight XPath extraction |

### JSON `json_*` (5)
`json_process` (format/minify/escape/validate), `json_convert` (↔XML/YAML/GET params), `json_entity` (generate C#/Java/Go entity classes; SQL→Java), `json_path` (JSONPath extraction), `json_schema_validate` (JSON Schema validation)

### Data `data_*` (5)
`data_html_convert` (HTML↔JS/PHP/C#/JSP/ASP/Perl/UBB/Markdown), `data_html_table` (CSV/JSON→HTML table), `data_excel_json` (Excel↔JSON), `data_text_diff` (text diff), `data_csv` (CSV parse/generate)

### Text `text_*` (16)
Case conversion, simplified/traditional Chinese, pinyin, fullwidth/halfwidth, flip, vertical text, char count, dedup, replace, HTML filter, auto-format, random numbers/passwords, Martian text, UUID/GUID generation, `text_idcard` (ID-card parse), `text_password_strength` (password strength scoring)

### Unit Conversion `unit_convert` (1)
13 categories: length / area / volume / speed / pressure / power / heat / force / time / data size / angle / density / temperature

### Network Lookup `net_*` (14)
| Tool | Description | Dependency |
|---|---|---|
| `net_whois` | WHOIS lookup (**native implementation**, recursive via whois.iana.org) | none |
| `net_icp` | ICP filing lookup (MIIT official API) | MIIT |
| `net_ip_info` | IP info (local NICs / geolocation, built-in compact segment table) | **local** |
| `net_dns_query` | DNS lookup (A/AAAA/CNAME/MX/TXT/NS/SOA/PTR, custom DNS supported) | **node:dns native** |
| `net_url_status` | HTTP status / response header check | direct request |
| `net_gzip_check` | Gzip compression check | direct request |
| `net_dead_link` | Dead-link detection | direct request |
| `net_fetch` | Web scraping (auto GBK/UTF-8 decode) | direct request |
| `net_meta_analyze` | Meta tag analysis | direct request |
| `net_keyword_density` | Keyword density check | direct request |
| `net_websocket_test` | Full WebSocket session (message exchange / ping RTT / wait_for) | ws package |
| `net_http_request` | HTTP request debugging (curl-equivalent: JSON auto-serialize/multipart upload/redirect/timeout) | native fetch |
| `net_ssl_check` | SSL certificate check (validity/issuer/chain) | node:tls |
| `net_port_check` | TCP port connectivity (tcping equivalent) | node:net |

### Misc `misc_*` (8)
`misc_barcode` (barcode), `misc_qrcode` (QR code), `misc_qrcode_decode` (QR decode), `misc_calc` (math expression evaluation), `misc_favicon` (PNG→ICO), `misc_shortcut` (desktop shortcut), `misc_reference` (17 reference tables), `misc_calendar` (lunar calendar: lunar/ganzhi/zodiac/solar terms/festivals/yiji, lunar-typescript local)

### Time `time_*` (6)
| Tool | Description |
|---|---|
| `time_timestamp` | Timestamp↔datetime (s/ms/us/ns auto-detect, multi-format input, UTC/local/custom timezone) |
| `time_convert` | Multi-timezone comparison (Beijing/Tokyo/London/NY etc. + custom ±HH:mm) |
| `time_diff` | Time diff / countdown (all precisions + human-readable + components) |
| `time_cron` | Cron expression parse (human description + next N run times) |
| `time_duration` | Duration humanization (two-way: seconds ↔ "1天2小时3分4秒") |
| `time_format` | strftime-style formatting (YYYY/MM/DD/ddd/Q + %Y-%m-%d compatible) |

## 🏗️ Design Notes

- **Aggregated granularity**: tools of the same family share one schema (e.g. `crypto_hash(text, algorithm)` covers the whole MD5/SHA family); 77 tools cover every tool category
- **Unified error handling**: every tool returns a readable error text (with valid option hints), never a raw stack trace
- **Modern crypto**: symmetric encryption built on `node:crypto` (AES-GCM/CBC)
- **Reference tables**: 17 lookup tables (HTTP status codes / ports / DNS / dynasties / ethnic groups, etc.) consolidated into a single `misc_reference` tool

## 🧪 Testing

```bash
npm test
```

97 end-to-end tests (real server via InMemoryTransport) cover:
- All 77 tool invocations
- Standard input/output golden regression (`md5('abc')`, base conversion, unit conversion, etc.)
- Network tools verified against local mock HTTP/WebSocket servers
- Error paths (invalid params, decryption failure, connection failure)

## ⚠️ Known Limitations

- `net_icp` depends on the MIIT API (`hlwicpfwc.miit.gov.cn`); the tool returns a readable error if the API changes
- `code_format` applies basic indentation beautification for php/java/c/cpp (not full AST formatting)
- `xpath_tool` is a lightweight regex-based implementation; complex axis expressions are not supported

## 📄 License

[MIT](./LICENSE) © 2026 [@lingxi-agent](https://www.npmjs.com/org/lingxi-agent)

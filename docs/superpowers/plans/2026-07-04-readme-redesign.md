# AstraChat README Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brief English README with the approved product-first documentation and add a content-matched Traditional Chinese README.

**Architecture:** `README.md` remains the canonical English entry point and `README.zh-TW.md` mirrors its structure in Traditional Chinese. Both files use the renamed `NHZallen/Astra-chat` repository URLs, link to each other, and rely only on verified project behavior and existing local documents.

**Tech Stack:** GitHub Flavored Markdown, npm/Vite project scripts, PowerShell link and content checks.

---

## File Map

- Modify `README.md`: canonical English product documentation.
- Create `README.zh-TW.md`: Traditional Chinese counterpart with identical scope and link targets.
- Read `package.json`, `.env.example`, `PRIVACY.md`, and `ROADMAP.md`: sources of truth for commands, environment configuration, privacy, and project direction.

### Task 1: Replace the English README

**Files:**
- Modify: `README.md`

- [x] **Step 1: Replace `README.md` with this exact content**

````markdown
# AstraChat

[![CI](https://github.com/NHZallen/Astra-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/NHZallen/Astra-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-6D5CE7.svg)](./LICENSE)

**Think beyond one model.**

AstraChat is a local-first AI workspace that brings multiple AI providers, model collaboration, web search, image generation, and reusable AI assistants into one focused interface.

[Try the live demo](https://astranos-chatbot.vercel.app/) · [Quick start](#quick-start) · [繁體中文](./README.zh-TW.md)

---

## Why AstraChat?

Most AI chat interfaces are built around one model at a time. AstraChat is designed for workflows that benefit from choice, comparison, and collaboration.

- **Think with more than one model.** Compare responses or use Model Council to combine multiple perspectives into one synthesized answer.
- **Keep control of your workspace.** Conversations, preferences, Astras, and API credentials are stored locally in your browser by default.
- **Work without switching tools.** Chat, search the web, analyze attachments, generate images, and organize reusable assistants from one interface.

## Live demo

Open the hosted version:

**https://astranos-chatbot.vercel.app/**

AstraChat uses local browser profiles instead of a hosted account system. The username, password verification data, conversations, settings, and API credentials remain in the current browser environment by default.

To send real model requests, add an API key for at least one supported provider in **Settings**.

## Features

### Multi-provider chat

Use models from different providers without moving conversations between separate applications.

AstraChat currently supports:

- Google Gemini
- OpenRouter
- NVIDIA API Catalog
- Step Plan
- Tavily web search

You only need to configure the providers you intend to use.

### Model Council

Model Council allows several AI models to work on the same request.

- Select between 2 and 5 participant models
- Choose a separate synthesizer model
- Compare different model perspectives
- Use consensus or discussion workflows
- Produce one final synthesized response

This makes it easier to examine difficult questions, compare reasoning approaches, and reduce dependence on a single model response.

### Search and attachments

AstraChat supports workflows involving:

- Web search
- Images
- Documents
- Media attachments
- Search-assisted model responses

Gemini models can use their supported native search capabilities. Other supported providers can use Tavily when a Tavily API key is configured.

Attachment support depends on the selected model and provider.

### Image generation

Supported image models can generate images directly inside a conversation.

Generated images can be previewed, downloaded, reused, or opened in the image editing workflow.

### Astras

Astras are reusable assistants with their own:

- Name
- Description
- Instructions
- Avatar
- Specialized behavior

They can be used for writing, planning, language learning, analysis, creative work, and other repeatable workflows.

### Conversation workspace

AstraChat also includes:

- Conversation folders and archives
- Temporary conversations
- Searchable conversation history
- Markdown rendering
- Mathematical formulas
- Charts and structured visual output
- Media previews
- Model reasoning controls
- Import and export
- Peer-to-peer data transfer
- English, Traditional Chinese, and French interfaces
- Progressive Web App installation

## Local-first by default

AstraChat stores the following data in your browser by default:

- Conversations
- Folders and archives
- Application settings
- Astras
- Provider API credentials
- Appearance preferences
- Local profile information

When you send a message, the required prompt, conversation context, and attachments are transmitted to the AI provider you selected.

Web search requests may be sent to the configured search provider. Provider requests are governed by the terms and privacy policies of those services.

Local-first means your workspace is controlled from your device. It does not mean every AI request runs offline.

Read the full [Privacy Policy](./PRIVACY.md).

## Quick start

### Requirements

- Node.js `20.19+` or `22.12+`
- npm
- An API key for at least one supported AI provider

### Run locally

```bash
git clone https://github.com/NHZallen/Astra-chat.git
cd Astra-chat
npm ci
npm run dev
```

Open the local URL printed by Vite, normally:

```text
http://localhost:5173
```

Then:

1. Create a local AstraChat profile.
2. Open **Settings**.
3. Add an API key for the provider you want to use.
4. Select a model and start a conversation.

Provider API keys do not need to be added to `.env`.

## Provider configuration

| Service | Purpose | Configuration |
| --- | --- | --- |
| Google Gemini | Native Gemini models and supported search | AstraChat Settings |
| OpenRouter | Models from multiple AI labs and image generation | AstraChat Settings |
| NVIDIA | Supported NVIDIA-hosted models | AstraChat Settings |
| Step Plan | StepFun reasoning models | AstraChat Settings |
| Tavily | Web search for supported non-native providers | AstraChat Settings |

Model availability, pricing, rate limits, and regional access are determined by each provider.

AstraChat does not provide or resell model access.

## Environment variables

Most installations do not require server-side environment variables.

The optional `.env` configuration is used for self-hosted feedback and Astra proposal forms:

```env
GOOGLE_FORM_ENDPOINT=
PORT=5173
```

Do not commit real service endpoints, API keys, or other sensitive values.

## Production build

Create a production build with:

```bash
npm run build
```

Preview it locally:

```bash
npm run preview
```

The generated frontend is written to `dist/`.

The included serverless API route can optionally proxy feedback and Astra proposal submissions when `GOOGLE_FORM_ENDPOINT` is configured by the deployment platform.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run the regression test suite |
| `npm run check:legacy-runtime` | Validate legacy runtime boundaries |
| `npm run check:sizes` | Check source file size budgets |
| `npm audit --omit=dev` | Audit production dependencies |

Before submitting a change, run:

```bash
npm run build
npm test
npm run check:legacy-runtime
npm run check:sizes
npm audit --omit=dev
```

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/runtime/` | Application runtime, features, state, and UI coordination |
| `src/app/legacy-runtime/` | Legacy functionality being migrated into smaller modules |
| `src/data/` | Languages, Astras, demo conversations, and update information |
| `src/styles/` | Application styles organized by feature |
| `api/` | Optional serverless endpoints |
| `tests/` | Regression, rendering, security, and behavior tests |
| `scripts/` | Boundary, size, and development checks |
| `public/` | PWA assets and static files |

## Project status

AstraChat is under active development.

Core chat, Model Council, search, image, PWA, personalization, and data portability workflows are available. The project is also migrating legacy runtime modules into smaller feature boundaries while maintaining regression coverage.

Interfaces, model availability, and internal architecture may continue to evolve.

See the public [Roadmap](./ROADMAP.md) for current direction.

## Feedback and contributions

Found a bug or have an idea?

[Open an issue](https://github.com/NHZallen/Astra-chat/issues).

For larger changes, please start with an issue so the scope and direction can be discussed before implementation.

## License

AstraChat is released under the [MIT License](./LICENSE).
````

- [x] **Step 2: Check English document requirements**

Run:

```powershell
$readme = Get-Content -Raw README.md
@(
  'Think beyond one model.',
  'https://astranos-chatbot.vercel.app/',
  'https://github.com/NHZallen/Astra-chat.git',
  './README.zh-TW.md',
  './PRIVACY.md',
  './ROADMAP.md',
  './LICENSE'
) | ForEach-Object { if (-not $readme.Contains($_)) { throw "README.md missing: $_" } }
if ($readme -match 'astranos-chatbot\.git') { throw 'README.md contains the old repository clone URL' }
```

Expected: command exits successfully with no output.

- [x] **Step 3: Commit the English README**

```bash
git add README.md
git commit -m "docs: rewrite project README"
```

### Task 2: Add the Traditional Chinese README

**Files:**
- Create: `README.zh-TW.md`

- [x] **Step 1: Create `README.zh-TW.md` with this exact content**

````markdown
# AstraChat

[![CI](https://github.com/NHZallen/Astra-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/NHZallen/Astra-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-6D5CE7.svg)](./LICENSE)

**Think beyond one model.**

AstraChat 是一個 local-first 的 AI 工作空間，將多家 AI 供應商、模型協作、網路搜尋、圖片生成與可重複使用的 AI 助手整合在同一個專注的介面中。

[開啟線上版本](https://astranos-chatbot.vercel.app/) · [快速開始](#快速開始) · [English](./README.md)

---

## 為什麼選擇 AstraChat？

多數 AI 聊天介面一次只圍繞一個模型設計。AstraChat 則適合需要選擇、比較與協作的工作流程。

- **不只用一個模型思考。** 比較不同回覆，或透過模型議會整合多個觀點，產生一份綜合答案。
- **保有工作空間的控制權。** 對話、偏好設定、Astras 與 API 憑證預設儲存在你的瀏覽器中。
- **不必在工具之間切換。** 在同一個介面完成聊天、網路搜尋、附件分析、圖片生成與可重複使用的助手管理。

## 線上版本

開啟已部署的版本：

**https://astranos-chatbot.vercel.app/**

AstraChat 使用瀏覽器本機個人檔案，而不是雲端帳號系統。使用者名稱、密碼驗證資料、對話、設定與 API 憑證預設保留在目前的瀏覽器環境中。

若要傳送實際的模型請求，請在 **設定** 中加入至少一家支援供應商的 API 金鑰。

## 功能

### 多供應商聊天

在不同供應商的模型之間切換，不必將對話搬到其他應用程式。

AstraChat 目前支援：

- Google Gemini
- OpenRouter
- NVIDIA API Catalog
- Step Plan
- Tavily 網路搜尋

你只需要設定實際打算使用的服務。

### 模型議會

模型議會讓多個 AI 模型共同處理同一個請求。

- 選擇 2 至 5 個參與模型
- 指定一個獨立的綜合模型
- 比較不同模型的觀點
- 使用共識或討論工作流程
- 產生一份最終綜合回覆

這讓你更容易檢視複雜問題、比較推理方式，並降低對單一模型回覆的依賴。

### 搜尋與附件

AstraChat 支援以下工作流程：

- 網路搜尋
- 圖片
- 文件
- 媒體附件
- 搜尋輔助的模型回覆

Gemini 模型可以使用其支援的原生搜尋能力。其他受支援的供應商可在設定 Tavily API 金鑰後使用 Tavily。

附件支援範圍取決於所選的模型與供應商。

### 圖片生成

受支援的圖片模型可以直接在對話中生成圖片。

生成的圖片可以預覽、下載、再次使用，或在圖片編輯流程中開啟。

### Astras

Astras 是可重複使用的助手，並可擁有自己的：

- 名稱
- 描述
- 指令
- 頭像
- 專門行為

你可以將它們用於寫作、規劃、語言學習、分析、創作與其他重複性工作流程。

### 對話工作空間

AstraChat 也包含：

- 對話資料夾與封存
- 臨時對話
- 可搜尋的對話紀錄
- Markdown 渲染
- 數學公式
- 圖表與結構化視覺輸出
- 媒體預覽
- 模型推理控制
- 匯入與匯出
- 點對點資料傳輸
- 英文、繁體中文與法文介面
- Progressive Web App 安裝

## 預設採用 local-first

AstraChat 預設將以下資料儲存在你的瀏覽器中：

- 對話
- 資料夾與封存
- 應用程式設定
- Astras
- 供應商 API 憑證
- 外觀偏好
- 本機個人檔案資訊

當你傳送訊息時，必要的提示詞、對話上下文與附件會傳送給你所選擇的 AI 供應商。

網路搜尋請求可能會傳送給已設定的搜尋供應商。供應商請求受各服務的條款與隱私權政策約束。

Local-first 代表工作空間由你的裝置控制，不代表所有 AI 請求都在離線環境中執行。

請閱讀完整的[隱私權政策](./PRIVACY.md)。

## 快速開始

### 系統需求

- Node.js `20.19+` 或 `22.12+`
- npm
- 至少一家受支援 AI 供應商的 API 金鑰

### 在本機執行

```bash
git clone https://github.com/NHZallen/Astra-chat.git
cd Astra-chat
npm ci
npm run dev
```

開啟 Vite 顯示的本機網址，通常是：

```text
http://localhost:5173
```

接著：

1. 建立 AstraChat 本機個人檔案。
2. 開啟 **設定**。
3. 加入你要使用之供應商的 API 金鑰。
4. 選擇模型並開始對話。

供應商 API 金鑰不需要加入 `.env`。

## 供應商設定

| 服務 | 用途 | 設定位置 |
| --- | --- | --- |
| Google Gemini | 原生 Gemini 模型與受支援的搜尋 | AstraChat 設定 |
| OpenRouter | 多家 AI 實驗室的模型與圖片生成 | AstraChat 設定 |
| NVIDIA | 受支援的 NVIDIA 託管模型 | AstraChat 設定 |
| Step Plan | StepFun 推理模型 | AstraChat 設定 |
| Tavily | 為受支援的非原生供應商提供網路搜尋 | AstraChat 設定 |

模型供應情況、價格、速率限制與地區存取均由各供應商決定。

AstraChat 不提供或轉售模型存取服務。

## 環境變數

多數安裝情境不需要伺服器端環境變數。

選用的 `.env` 設定用於自行託管的意見回饋與 Astras 提案表單：

```env
GOOGLE_FORM_ENDPOINT=
PORT=5173
```

請勿提交真實的服務端點、API 金鑰或其他敏感值。

## 正式版建置

建立正式版：

```bash
npm run build
```

在本機預覽：

```bash
npm run preview
```

生成的前端會寫入 `dist/`。

當部署平台設定 `GOOGLE_FORM_ENDPOINT` 時，內附的 serverless API 路由可選擇性代理意見回饋與 Astras 提案送出。

## 開發

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vite 開發伺服器 |
| `npm run build` | 建立正式版 |
| `npm run preview` | 預覽正式版 |
| `npm test` | 執行回歸測試 |
| `npm run check:legacy-runtime` | 驗證 legacy runtime 邊界 |
| `npm run check:sizes` | 檢查原始碼檔案大小預算 |
| `npm audit --omit=dev` | 稽核正式環境依賴套件 |

提交變更前請執行：

```bash
npm run build
npm test
npm run check:legacy-runtime
npm run check:sizes
npm audit --omit=dev
```

## 專案結構

| 路徑 | 用途 |
| --- | --- |
| `src/app/runtime/` | 應用程式 runtime、功能、狀態與 UI 協調 |
| `src/app/legacy-runtime/` | 正在遷移至較小模組的既有功能 |
| `src/data/` | 語言、Astras、示範對話與更新資訊 |
| `src/styles/` | 依功能整理的應用程式樣式 |
| `api/` | 選用的 serverless 端點 |
| `tests/` | 回歸、渲染、安全性與行為測試 |
| `scripts/` | 邊界、檔案大小與開發檢查 |
| `public/` | PWA 資產與靜態檔案 |

## 專案狀態

AstraChat 正在積極開發中。

核心聊天、模型議會、搜尋、圖片、PWA、個人化與資料可攜工作流程已可使用。專案也持續將 legacy runtime 模組遷移至較小的功能邊界，同時維持回歸測試涵蓋。

介面、模型供應情況與內部架構仍可能持續演進。

目前方向請參閱公開的[開發路線圖](./ROADMAP.md)。

## 意見與貢獻

發現錯誤或有新的想法？

[開啟 Issue](https://github.com/NHZallen/Astra-chat/issues)。

若要進行較大型的變更，請先建立 Issue，讓實作前能先討論範圍與方向。

## 授權

AstraChat 依 [MIT License](./LICENSE) 發布。
````

- [x] **Step 2: Check Chinese document requirements and cross-links**

Run:

```powershell
$en = Get-Content -Raw README.md
$zh = Get-Content -Raw README.zh-TW.md
@(
  'Think beyond one model.',
  'https://astranos-chatbot.vercel.app/',
  'https://github.com/NHZallen/Astra-chat.git',
  './README.md',
  './PRIVACY.md',
  './ROADMAP.md',
  './LICENSE'
) | ForEach-Object { if (-not $zh.Contains($_)) { throw "README.zh-TW.md missing: $_" } }
if (-not $en.Contains('./README.zh-TW.md')) { throw 'English README does not link to Chinese README' }
if (-not $zh.Contains('./README.md')) { throw 'Chinese README does not link to English README' }
```

Expected: command exits successfully with no output.

- [x] **Step 3: Commit the Traditional Chinese README**

```bash
git add README.zh-TW.md
git commit -m "docs: add Traditional Chinese README"
```

### Task 3: Validate documentation against the project

**Files:**
- Verify: `README.md`
- Verify: `README.zh-TW.md`
- Read: `package.json`
- Read: `.env.example`
- Read: `PRIVACY.md`
- Read: `ROADMAP.md`
- Read: `LICENSE`

- [x] **Step 1: Validate every documented npm command**

Run:

```powershell
$package = Get-Content -Raw package.json | ConvertFrom-Json
@('dev', 'build', 'preview', 'test', 'check:legacy-runtime', 'check:sizes') | ForEach-Object {
  if (-not $package.scripts.PSObject.Properties.Name.Contains($_)) { throw "Missing package script: $_" }
}
```

Expected: command exits successfully with no output.

- [x] **Step 2: Validate local relative links**

Run:

```powershell
@('README.md', 'README.zh-TW.md', 'PRIVACY.md', 'ROADMAP.md', 'LICENSE', '.env.example') | ForEach-Object {
  if (-not (Test-Path $_)) { throw "Missing local documentation target: $_" }
}
```

Expected: command exits successfully with no output.

- [x] **Step 3: Run whitespace and stale-name checks**

Run:

```powershell
git diff --check
$matches = rg -n 'NHZallen/astranos-chatbot|git clone .*astranos-chatbot' README.md README.zh-TW.md
if ($LASTEXITCODE -eq 0) { throw "Old repository name remains:`n$matches" }
if ($LASTEXITCODE -gt 1) { throw 'rg failed while scanning repository names' }
```

Expected: `git diff --check` succeeds and the stale-name scan finds no matches.

- [x] **Step 4: Run the project verification commands**

Run:

```bash
npm run build
npm test
npm run check:legacy-runtime
npm run check:sizes
```

Expected: all four commands exit successfully.

- [x] **Step 5: Review the final diff**

Run:

```bash
git diff -- README.md README.zh-TW.md
git status --short
```

Expected: the documentation changes match the approved spec; `.superpowers/` may remain as an unrelated untracked brainstorming artifact and must not be staged.

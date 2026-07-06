<p align="center">
  <img src="./public/logo.png" alt="Noureon logo" width="220">
</p>

<h1 align="center">Noureon</h1>

<p align="center"><strong>不只與一個模型思考。</strong></p>

<p align="center">
  一個 local-first AI 工作空間，整合多模型對話、模型協作、網路搜尋、圖片生成與可重複使用的助手。
</p>

<p align="center">
  <a href="https://noureon.com/">線上體驗</a>
  ·
  <a href="#快速開始">快速開始</a>
  ·
  <a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/NHZallen/Noureon/actions/workflows/ci.yml"><img src="https://github.com/NHZallen/Noureon/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6D5CE7.svg" alt="MIT License"></a>
</p>

---

## 為什麼選擇 Noureon？

多數 AI 聊天介面一次只圍繞一個模型設計。Noureon 則適合需要選擇、比較與協作的工作流程。

- **不只用一個模型思考。** 比較不同回覆，或透過模型議會整合多個觀點，產生一份綜合答案。
- **保有工作空間的控制權。** 對話、偏好設定、Nouras 與 API 憑證預設儲存在你的瀏覽器中。
- **不必在工具之間切換。** 在同一個介面完成聊天、網路搜尋、附件分析、圖片生成與可重複使用的助手管理。

## 線上版本

開啟已部署的版本：

**https://noureon.com/**

Noureon 使用瀏覽器本機個人檔案，而不是雲端帳號系統。使用者名稱、密碼驗證資料、對話、設定與 API 憑證預設保留在目前的瀏覽器環境中。

若要傳送實際的模型請求，請在 **設定** 中加入至少一家支援供應商的 API 金鑰。

## 功能

### 多供應商聊天

在不同供應商的模型之間切換，不必將對話搬到其他應用程式。

Noureon 目前支援：

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

Noureon 支援以下工作流程：

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

### Nouras

Nouras 是可重複使用的助手，並可擁有自己的：

- 名稱
- 描述
- 指令
- 頭像
- 專門行為

你可以將它們用於寫作、規劃、語言學習、分析、創作與其他重複性工作流程。

### 對話工作空間

Noureon 也包含：

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

Noureon 預設將以下資料儲存在你的瀏覽器中：

- 對話
- 資料夾與封存
- 應用程式設定
- Nouras
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
git clone https://github.com/NHZallen/Noureon.git
cd Noureon
npm ci
npm run dev
```

開啟 Vite 顯示的本機網址，通常是：

```text
http://localhost:5173
```

接著：

1. 建立 Noureon 本機個人檔案。
2. 開啟 **設定**。
3. 加入你要使用之供應商的 API 金鑰。
4. 選擇模型並開始對話。

供應商 API 金鑰不需要加入 `.env`。

## 供應商設定

| 服務 | 用途 | 設定位置 |
| --- | --- | --- |
| Google Gemini | 原生 Gemini 模型與受支援的搜尋 | Noureon 設定 |
| OpenRouter | 多家 AI 實驗室的模型與圖片生成 | Noureon 設定 |
| NVIDIA | 受支援的 NVIDIA 託管模型 | Noureon 設定 |
| Step Plan | StepFun 推理模型 | Noureon 設定 |
| Tavily | 為受支援的非原生供應商提供網路搜尋 | Noureon 設定 |

模型供應情況、價格、速率限制與地區存取均由各供應商決定。

Noureon 不提供或轉售模型存取服務。

## 環境變數

多數安裝情境不需要伺服器端環境變數。

選用的 `.env` 設定用於自行託管的意見回饋與 Nouras 提案表單：

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

當部署平台設定 `GOOGLE_FORM_ENDPOINT` 時，內附的 serverless API 路由可選擇性代理意見回饋與 Nouras 提案送出。

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
| `src/data/` | 語言、Nouras、示範對話與更新資訊 |
| `src/styles/` | 依功能整理的應用程式樣式 |
| `api/` | 選用的 serverless 端點 |
| `tests/` | 回歸、渲染、安全性與行為測試 |
| `scripts/` | 邊界、檔案大小與開發檢查 |
| `public/` | PWA 資產與靜態檔案 |

## 專案狀態

Noureon 正在積極開發中。

核心聊天、模型議會、搜尋、圖片、PWA、個人化與資料可攜工作流程已可使用。專案也持續將 legacy runtime 模組遷移至較小的功能邊界，同時維持回歸測試涵蓋。

介面、模型供應情況與內部架構仍可能持續演進。

目前方向請參閱公開的[開發路線圖](./ROADMAP.md)。

## 意見與貢獻

發現錯誤或有新的想法？

[開啟 Issue](https://github.com/NHZallen/Noureon/issues)。

若要進行較大型的變更，請先建立 Issue，讓實作前能先討論範圍與方向。

## 授權

Noureon 依 [MIT License](./LICENSE) 發布。

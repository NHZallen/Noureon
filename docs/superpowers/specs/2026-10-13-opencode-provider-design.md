# OpenCode 供應商（Go 先做，Zen／主控台推論之後）

**狀態：** 設計，等 Allen 確認後再動程式（2026-10-13）。區塊 02「模型供應商與模型管理」，Allen 負責；五種語言的文字、價格與隱私說明與 Sun 在 Linear 討論。

## 1. Allen 的決定（2026-10-13）

- 先做 **OpenCode Go**；Zen（主控台推論）之後再做，但設計預留位置。
- Go 的**三種格式一次做完**（chat／responses／messages），在 `staging` 測完才一起上線，不分批。
- 搜尋：**模型能用工具就一律由模型自己搜**（`research`），只有不能用工具的模型才退回「搜一包」（`packet`）。
- Muse Spark Contributor（會用提示與回應訓練 Meta 的模型）**收錄**，清楚標示即可。
- Go 的用量**以 OpenCode Go 後台限額為準**，不自己計算，畫面這樣寫。
- 思考內容照現有畫面顯示（三種格式都要解析）；`x-opencode-session` 用對話編號。
- 伺服器共用 IP **不特別處理**（其他供應商也是這樣）；條款的疑慮由 Allen 自行決定要不要寫信問 OpenCode，不是上線的前提。

## 2. OpenCode 的事實

### 文件有寫的（Go：`https://opencode.ai/docs/go/`；主控台推論：Inference API 頁）
- Go 端點：`https://opencode.ai/inference/go/v1/chat/completions`、`.../responses`、`.../messages`；模型清單 `.../inference/go/v1/models`（文件範例沒有帶金鑰）。每個模型只走一種格式（見 §5 表）。
- 主控台推論（Zen 那一側，之後才做）：`/inference/openai/v1/chat/completions`、`/inference/openai/v1/responses`、`/inference/anthropic/v1/messages`、`/inference/google/v1beta/models/<模型>:generateContent`（串流 `:streamGenerateContent`），清單 `/inference/v1/models`；金鑰是主控台建的服務帳號金鑰（`oc_sk_`），一律 `Authorization: Bearer`；付費模型要帶、免費聊天模型可以不帶。Messages 格式**一定要帶 `max_tokens`**。
- Go 對用戶端的要求：送典型的程式開發代理流量；用自己的 `User-Agent`（不用通用 SDK 名稱）；每個對話送固定的 `x-opencode-session`（優化路由與提示快取）。
- 用量：每個模型各有每月美元限額，5 小時 20%、每週 50%、每月 100%；用完會擋，除非主控台開了「用餘額」。Go 與 Go Plus 的字數價格相同，限額不同。
- 隱私（Go 文件的表）：Grok、GPT Luna 保留 30 天；Claude Haiku 5.5 保留 30 天；Muse Spark 1.3／1.2 Contributor **會用於訓練**且不是零保留（限 Meta 地理使用政策允許的區域）；其餘多數 0 天；DeepSeek 的零保留協議到 2026-10-31（每月續約）。
- 價格表有輸入／輸出／快取讀寫價；DeepSeek 有尖峰（UTC 週一到週五 01:00–04:00、06:00–10:00）與離峰價；Qwen3.7 Plus、Grok、GPT Luna、Claude Haiku 依輸入長度分兩段價。

### 文件沒寫的（要用探測工具與測試站實測）
錯誤的狀態碼與內容、每分鐘限制、串流逾時、思考參數是否被轉送、思考內容的欄位、各模型的工具與圖片支援、上下文長度、快取細節、Messages 格式是否要 `anthropic-version`、地理限制怎麼判斷。

### 實測：CORS（Allen 在 `https://example.com` 的 Console，2026-10-13）
- `GET /inference/go/v1/models` → 200（可從瀏覽器讀取，是公開資料）。
- `POST /inference/go/v1/chat/completions`（帶 `Authorization`、`x-opencode-session`）→ **預檢被擋**（回應沒有 `Access-Control-Allow-Origin`）。
- 結論：**瀏覽器不能直接呼叫 OpenCode 的推論端點**。所有請求都要經過我們這一端。

## 3. 供應商與通道

供應商 id：`opencode-go`（網址 `https://opencode.ai/inference/go/v1`）。預留 `opencode`（主控台推論：網址依格式分三條，金鑰是服務帳號金鑰），兩者共用轉接器與模型登錄的格式，網址、金鑰標籤、價格說明分開。金鑰欄位標籤「OpenCode Go API 金鑰」，保存與遮蔽的方式同 NVIDIA（`sensitive-config-store`、`sensitive-config-redaction`）。

**請求標頭（一律由我們這一端送出）：** `Authorization: Bearer <金鑰>`、`User-Agent: Noureon/<版本> (+https://noureon.com)`、`x-opencode-session: <對話編號>`；`/messages` 先照主控台文件只送 Bearer，並測 `anthropic-version` 是否需要。

**通道：**
- **伺服器上跑的回覆**（關頁繼續、Python、連接器、技能、CLI、理事會、深度研究）：共用的 `stream-api-call.js` 在伺服器上執行，請求從伺服器出去；`server/upstream-fetch.js` 加 OpenCode 的路徑；`COUNCIL_PROVIDERS`（`server/run-spec.js`）加 `opencode-go`；金鑰驗證與遮蔽照現有。
- **瀏覽器裡跑的回覆**（暫時對話、沒有帳號、設定為本機）：因為 CORS，經過網站函式 `api/opencode-chat.js`（像 `api/nvidia-chat.js`），瀏覽器以同源送 `x-opencode-session` 給它，由函式加上 User-Agent 轉給 OpenCode。需要在 `vercel.json` 設這個函式的 `maxDuration`（長思考不被切斷）。待 Allen 確認這條通道（見 §10）。
- **逾時：** `createUpstreamFetch` 現在對每個請求有 45 秒的**總時間**上限（`AbortSignal.timeout`）。OpenCode（與長思考）要改成「等第一個位元組」與「串流中斷」才逾時，不用總時間；其他供應商維持原行為。

## 4. 搜尋、工具與其他功能

- 回覆的搜尋方式由 `planServerReply`（`server-reply.js`）決定：模型標記「支援工具」就 `research`（模型自己呼叫搜尋工具，仍需要搜尋金鑰），不支援才 `packet`。所以**每個模型的「支援工具」標記必須正確**，來源是探測工具的實測（§7）。
- Python 進階、連接器、技能、CLI 工具都靠工具呼叫，只對標記支援工具的模型開放。
- 圖片輸入：每個模型標記是否支援，格式依端點（見 §6）。
- 圖片生成：Go 沒有，維持只用 OpenRouter。

## 5. 模型登錄（Go，2026-10-13 文件）

每個模型一筆：`id`、顯示名稱、`provider: 'opencode-go'`、端點格式、價格、隱私、`supportsTools`、`supportsVision`、思考方式、上下文與輸出上限、說明文字（五語言，由 Sun）。**能力欄位不憑文件猜，用探測工具的結果填。** 價格與隱私照文件填。

端點格式：
- **chat**：glm-5.3-flash、glm-5.3、glm-5.2、kimi-k3、kimi-k2.7-code、kimi-k2.6、longcat-2.0、deepseek-v4.1-flash、deepseek-v4-pro、deepseek-v4-flash、deepseek-v4-flash-vision-exp、mimo-v2.6-flash、mimo-v2.6-pro、mimo-v2.5、mimo-v2.5-pro、hy4-preview、hy3、space-bunny、longcat-2.5-preview-free、step-5-preview-free。
- **responses**：grok-4.7、grok-4.6、gpt-6-luna、gpt-5.6-luna、muse-spark-1.3-contributor、muse-spark-1.2-contributor。
- **messages**：claude-haiku-5-5、minimax-m3、minimax-m2.7、qwen3.8-max、qwen3.8-flash、qwen3.7-plus。

清單會變動（文件說明如此）：登錄是我們手寫的，`GET /v1/models`（公開，瀏覽器也能讀）只用來檢查哪些模型下架或新增，不取代登錄。

**標示與提醒：** Muse Spark 兩個要在選單與詳細說明清楚寫「你的提示與回應會被用來訓練 Meta 的模型、保留非零、僅限特定地區」；選單上每個模型帶保留天數；Go 的說明寫「用量以 OpenCode Go 後台限額為準」；這些文字五種語言（Sun）。

## 6. 三種格式的轉接器

| | chat | responses | messages |
|---|---|---|---|
| 請求 | 現有的 OpenAI 相容請求 | 現有的 Responses 請求（OpenRouter 在用） | **新寫**：`system` 分開放、內容區塊、`max_tokens` 必填、圖片 `base64` 區塊、工具與工具結果的對應 |
| 串流收取 | `createOpenAiCollector`（已讀 `reasoning`、`reasoning_content`、`reasoning_details`） | `createResponsesCollector` | **新寫** `createAnthropicCollector`：文字、`thinking`、`tool_use` 區塊的串流事件 |
| 工具 | `applyOpenAiTools` | `applyResponsesTools` | **新寫** `applyAnthropicTools` |
| 思考 | `reasoning_content` 等欄位 | 推理摘要 | `thinking` 區塊 |

共用模組在 `src/app/legacy-runtime/features/tool-call-formats.js` 與 `stream-api-call.js`；新增的 Messages 轉接器放在**新檔**（不塞進已接近大小上限的核心檔，`legacy-core.js` 只加一行註冊），並檢查 `npm run check:sizes`（首頁主檔案壓縮後已貼著 155 KB 上限，新程式要動態載入）。

## 7. 思考參數（先不帶，驗證後再開）

OpenCode 自己的 `variant.ts` 是一份對照（OpenCode 用戶端的設定，**不保證 Go 閘道轉送**）：
- Responses（GPT、Muse）：`reasoning.effort`（none 到 xhigh）、`reasoning.summary: auto`、`include: ['reasoning.encrypted_content']`；Grok：effort low／medium／high。
- Messages：Claude 用 `thinking: adaptive` 加 effort；MiniMax 的 `thinking` 是 adaptive／disabled；Qwen（阿里）用 `thinking: enabled|disabled` 加 effort 或預算（上限 64,000）。
- chat：DeepSeek `thinking: {type}` 加 `reasoning_effort`（low／high／max）；Kimi k2.6 開關、k3 effort（low／high／max）、k2.7-code 固定開；GLM（Z.ai）`thinking: {type, clear_thinking:false}`，5.2 是 high／max、5.3 以上 low／high／max；其他走 `reasoning_effort`。

做法：第一版**不帶任何思考參數**（供應商預設），先確認各格式與模型能正常回答；探測工具確認哪些參數被接受之後，再依模型加「思考強度」選項。

## 8. 錯誤與用量顯示

文件沒有 Go 的錯誤格式，所以先實測。顯示規則：非 2xx 一律把 OpenCode 的訊息文字（去掉金鑰）顯示出來；401 提示金鑰；429 或訊息含 budget／limit 時加一行「用量以 OpenCode Go 後台限額為準」；錯誤訊息要過 `scrubMessage`（不含金鑰）。主控台預算用完是 429 `Upstream request failed: Account budget exceeded`。

## 9. 探測工具 `scripts/opencode-probe.mjs`

由 Allen 在自己的電腦跑（金鑰只放環境變數 `OPENCODE_GO_KEY`，不印出、不寫檔）。對每個模型送最小請求（`max_tokens` 很小，先跑免費模型，付費模型每個約幾分錢內），記錄：一般請求、串流、工具呼叫（是否回 `tool_calls`／`tool_use`）、圖片輸入（一張很小的圖）、各種思考參數是否被接受、串流裡思考內容的欄位名稱、用量資料是否出現、`/messages` 缺少 `anthropic-version` 會怎樣、錯誤（壞金鑰、不存在的模型）的狀態碼與內容。輸出是不含金鑰的 JSON，貼回來填模型登錄。可用 `--only <模型>`、`--free` 限制範圍與花費。

## 10. 需要 Allen 確認（A 已決定：2026-10-13）

**決定：瀏覽器裡跑的回覆走 Vercel 函式 `api/opencode-chat`（A）**，並在 `vercel.json` 設這個函式的 `maxDuration`。

1. ~~瀏覽器裡跑的回覆走哪條通道~~ → **已決定 A：Vercel 函式**（跟 NVIDIA 一致、最簡單；出口 IP 會變，Allen 不在意；`maxDuration` 要設）。
2. 思考強度選項的外觀（第一版沒有，探測之後再加）。
3. 條款的疑慮：照 §1 的決定不擋上線；選單裡仍寫一行「使用 OpenCode Go 須遵守 OpenCode 的條款」。

## 11. 要改的檔案（依 NVIDIA 的前例）

設定頁金鑰（`settings-api-key-controls.js`、`dom-registry.js`、`config-store.js`、`config-normalization.js`、`03-shell.fragment.js`）、金鑰加密與遮蔽（`sensitive-config-store.js`、`sensitive-config-redaction.js`）、模型登錄與選模型畫面（`model-registry.js`、`model-picker-groups.js`、`model-switcher-lifecycle.js`）、呼叫（`stream-api-call.js`、`tool-call-formats.js`、新檔的 Messages 轉接器）、網站函式 `api/opencode-chat.js` 與 `vercel.json`、伺服器（`upstream-fetch.js`、`run-spec.js`、`model-access.js`）、`connect-src`（`vercel.json` 的 CSP，只需要 `'self'`，因為都經過我們）、五語言文字（`src/data/i18n/parts/`）、隱私政策／使用條款／協助中心的供應商清單與保留天數（五語言，`PRIVACY.md` 重新產生）、第三方服務清單、更新日誌（Allen 發版時寫）。
- 共用模組的規則：新模組不能用 `window`／`document`；`scripts/server-shared-modules.json` 要列出伺服器會 import 的新模組（Allen 確認）。

## 12. 測試與驗證

- 單元測試：三種格式的請求組裝、串流收取（含思考、工具呼叫、取消、錯誤）、標頭（`User-Agent`、`x-opencode-session`）、逾時不切斷長串流、金鑰不進日誌與訊息、模型登錄的欄位檢查（五語言說明、價格、保留天數、Muse 標示）。
- 探測工具的結果進入 `docs/` 的一份記錄。
- `staging` 實測：每種格式至少一個模型，各測文字、串流、工具（研究搜尋、Python、連接器）、圖片、思考顯示、中途取消、用量用完的錯誤。通過才一起上線。

## 13. 進度

- 2026-10-13：設計完成；探測工具 `scripts/opencode-probe.mjs` 與測試 `tests/opencode-probe.test.js` 完成（用假網路測過，還沒用真的金鑰跑）。下一步：Allen 用 Go 金鑰跑探測（`OPENCODE_GO_KEY=… node scripts/opencode-probe.mjs --free` 先跑免費模型），把輸出貼回來，用它填模型登錄。

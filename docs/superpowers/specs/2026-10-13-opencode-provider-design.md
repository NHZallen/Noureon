# OpenCode 供應商（只做 Go；Zen／主控台推論不做）

**狀態：** 設計，等 Allen 確認後再動程式（2026-10-13）。區塊 02「模型供應商與模型管理」，Allen 負責；五種語言的文字、價格與隱私說明與 Sun 在 Linear 討論。

## 1. Allen 的決定（2026-10-13）

- 只做 **OpenCode Go**。**Zen（主控台推論）不做**（Allen 決定，2026-10-14；原本是「之後再做、設計預留位置」，現在不預留）。
- Go 的**三種格式一次做完**（chat／responses／messages），在 `staging` 測完才一起上線，不分批。
- 搜尋：**模型能用工具就一律由模型自己搜**（`research`），只有不能用工具的模型才退回「搜一包」（`packet`）。
- Muse Spark Contributor（會用提示與回應訓練 Meta 的模型）**收錄**，清楚標示即可。
- Go 的用量**以 OpenCode Go 後台限額為準**，不自己計算，畫面這樣寫。
- 思考內容照現有畫面顯示（三種格式都要解析）；`x-opencode-session` 用對話編號。
- 伺服器共用 IP **不特別處理**（其他供應商也是這樣）；條款的疑慮由 Allen 自行決定要不要寫信問 OpenCode，不是上線的前提。

## 2. OpenCode 的事實

### 文件有寫的（Go：`https://opencode.ai/docs/go/`；主控台推論：Inference API 頁）
- Go 端點：`https://opencode.ai/inference/go/v1/chat/completions`、`.../responses`、`.../messages`；模型清單 `.../inference/go/v1/models`（文件範例沒有帶金鑰）。每個模型只走一種格式（見 §5 表）。
- 主控台推論（Zen 那一側，**不做**，只留紀錄）：`/inference/openai/v1/chat/completions`、`/inference/openai/v1/responses`、`/inference/anthropic/v1/messages`、`/inference/google/v1beta/models/<模型>:generateContent`（串流 `:streamGenerateContent`），清單 `/inference/v1/models`；金鑰是主控台建的服務帳號金鑰（`oc_sk_`），一律 `Authorization: Bearer`；付費模型要帶、免費聊天模型可以不帶。Messages 格式**一定要帶 `max_tokens`**。
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
- 2026-10-13：探測跑完（免費、全部 Go 付費模型、錯誤），結果與模型登錄用的實測表在 §14。還缺：DeepSeek 與 Muse Spark（被帳號隱私設定擋住）。下一步：寫程式（轉接器、`api/opencode-chat`、模型登錄、設定頁金鑰、五語言文字、隱私文件）。
- 2026-10-13：程式與文件完成（§15），推 `staging`，等 Allen 實測；實測表在 §12。

## 14. 探測結果（2026-10-13，Allen 用 Go 金鑰跑；原始結果檔 `all.json` 在 Allen 的電腦）

請求都用 `max_tokens` 96 左右，所以「文字是空的」多半是思考把額度用完，**不等於不支援**（標「待定」）。

### 共通事實
- **上游對不認識的參數嚴格拒絕（400 `unknown field` / `unsupported_parameter`）。** 所以思考參數必須逐模型登記，不能一律多送；第一版仍照 §7 不帶，之後只送該模型登記過的那一種。
- 錯誤格式：金鑰錯 401 `Invalid credential`；沒金鑰 401 `Go requires a credential`；模型不存在 400 `Model is unavailable.`；上游錯誤都有前綴 `Upstream request failed:`。免費或暫時掛掉的模型回 404 或 429 `Endpoint is unavailable.`（過一陣子會好，不是帳號額度）。
- **帳號隱私設定會擋模型（每位使用者自己的 OpenCode 工作區設定）：**
  - DeepSeek V4 Pro、V4 Flash、V4.1 Flash：400「This Go model requires Global regions. Select Global in your workspace's Privacy settings to use it.」
  - Muse Spark 1.2／1.3 Contributor：400「This Go model trains on request data. Allow paid endpoints that train on request data in your workspace's Privacy settings to use it.」
  - 做法：錯誤文字原樣顯示，再加一行說明（「到 OpenCode 工作區的 Privacy 設定開啟後再試」，五語言）。這兩種模型 Allen 的工作區目前都沒開，**所以還沒測到**（見下方待測）。
- Messages 格式只要 `Authorization: Bearer`，不需要 `anthropic-version`（三種標頭組合都 200）。
- 回應很快（多數 1 到 5 秒），但 mimo-v2.5 的一次串流花了 62 秒：伺服器與 Vercel 函式的逾時不能用 45 秒。
- 串流結尾：chat 有 `[DONE]`；responses 與 messages 沒有 `[DONE]`，以 `response.completed`／`message_stop` 為結尾。
- 用量欄位：chat 是 `prompt_tokens`／`completion_tokens`（部分有 `completion_tokens_details.reasoning_tokens`）；responses 是 `input_tokens`／`output_tokens`；messages 是 `input_tokens`／`output_tokens`（含 `cache_*`）。

### 思考內容在哪裡
- chat：`reasoning_content`（GLM、Kimi K2.7、LongCat、DeepSeek、MiMo 2.6、Hy、Cat Jam、Space Bunny）或 `reasoning`（Kimi K3、MiMo 2.5、Step 5、Hy 部分回應），串流另有 `reasoning_details`。同一個模型兩種都可能出現（Hy、Kimi K3 的工具回應），**兩個欄位都要讀**（收集器已經會）。
- responses：`output[]` 的 reasoning 項目，串流是 `response.reasoning_summary_text.delta`（Grok 有；GPT Luna 預設沒有摘要）。
- messages：`content[]` 的 `thinking` 區塊，串流 `thinking_delta`（MiniMax、Qwen 有；Claude Haiku 5.5 預設沒有）。

### 模型登錄用的實測表
工具：全部通過，除了 kimi-k3 的工具測試只回了一句文字沒有呼叫（待定，請在測試站用真實請求確認）。圖片：✓ 回答正確、✗ 被拒、？ 被接受但答不出（待定）。

| 模型 | 格式 | 圖片 | 思考怎麼控制（實測） |
|---|---|---|---|
| glm-5.3-flash | chat | ✓ | 預設開；`reasoning_effort: low` 會關掉；`thinking` 被拒 |
| glm-5.3、glm-5.2 | chat | ✗（「does not support image inputs」） | 只能思考（thinking-only）；`thinking:{type:enabled}` 與 `reasoning_effort` 可用；關掉會被拒 |
| kimi-k3 | chat | ✓ | 關不掉；所有參數都被接受但一直思考 |
| kimi-k2.7-code | chat | ✓ | 只接受 `thinking:{type:enabled}`，關閉被拒 |
| longcat-2.0 | chat | ✗（Allen 確認不支援圖片） | `thinking:{type:disabled}` 可關 |
| deepseek-v4-flash-vision-exp | chat | ✓ | `thinking:{type:disabled}` 可關 |
| mimo-v2.6-flash、mimo-v2.6-pro | chat | ✓ | `thinking:{type:disabled}` 可關 |
| mimo-v2.5 | chat | ✓ | 關不掉；串流可能很慢（62 秒） |
| mimo-v2.5-pro | chat | ✗（Allen 確認不支援圖片） | `thinking:{type:disabled}` 可關 |
| hy4-preview、hy3 | chat | ✗（Allen 確認不支援圖片） | `thinking:{type:disabled}` 可關，但關掉後 hy4 的回答會亂接下去（品質問題，預設不關） |
| space-bunny | chat | ✓ | 預設不思考；`enable_thinking: true` 才會開；`thinking:{disabled}` 被拒 |
| step-5-preview-free（免費） | chat | ✓ | `reasoning_effort: low` 會關掉；`thinking:{disabled}` 沒作用 |
| longcat-2.5-preview-free（免費） | chat | ✓（Allen 確認支援；探測答成 Black 只是答錯） | `thinking:{type:disabled}` 可關 |
| cat-jam-free（Go 清單裡有、文件沒寫） | chat | ✗（只收文字） | 只有 `reasoning_effort` 被接受 |
| deepseek-v4.1-flash | chat | ✓（Red） | `thinking:{type:disabled}` 可關，`enabled`／`reasoning_effort`／`enable_thinking` 都接受 |
| deepseek-v4-pro、deepseek-v4-flash | chat | 目錄標純文字，登記為✗（v4-flash 探測答出 Red、v4-pro 逾時，都不採信） | 同上：`thinking:{type:disabled}` 可關 |
| grok-4.7、grok-4.6 | responses | ✓ | `reasoning.effort` low 可用；`none` 被拒；摘要有 |
| gpt-6-luna、gpt-5.6-luna | responses | ✓ | `reasoning.effort` none／low 都接受；預設沒有推理摘要 |
| muse-spark-1.3、1.2 Contributor | responses | ✓，工具 ✓（Allen 確認；探測因 96 個 token 被推理用完回 `response.incomplete`，不再重測） | `reasoning.effort` 值為 minimal／low／medium／high／xhigh／max，**不支援 none**；關不掉思考 |
| claude-haiku-5-5 | messages | ✓ | 只接受 `thinking:{type:adaptive}`（加 `output_config.effort`）；`enabled`＋預算被拒；`disabled` 也可 |
| minimax-m3 | messages | ✓（Allen 確認支援；探測答成 Brown 只是答錯） | `adaptive`／`enabled`＋預算會思考；`disabled` 可關 |
| minimax-m2.7 | messages | ✗（目錄：純文字） | 關不掉（`disabled` 無效） |
| qwen3.8-max、qwen3.8-flash、qwen3.7-plus | messages | ✓ | 預設思考；`thinking:{type:disabled}` 可關；`enabled`＋預算可用 |

清單裡有、文件沒寫的模型（`deepseek-flash`、`glm-5.1`、`omen-alpha`、`minimax-m2.5`、`qwen3.6-plus`、`qwen3.7-max`）：Allen 決定先只做 Go 文件列的模型，這些之後再說（`cat-jam-free` 已測，2026-10-14 Allen 要求加入：chat、不收圖片、可用工具；思考用 `reasoning_effort`，取 Pi 的對照 low／medium／high／xhigh／max，預設 high；off／minimal 在 API 沒有對應值所以不給；xhigh／max 尚未實測，登記的模型共 32 個）。

### 待測／待決定
1. ~~Allen 打開 Privacy 設定後重測~~ → 已測（09:24）：DeepSeek 三個全部正常；Muse Spark 兩個都連得上，但推理用完 96 token，工具與圖片沒測成，要 `--max-tokens 1500` 重測。使用者各自的工作區設定不同，所以這兩類錯誤一定要有明確提示。
2. 圖片與工具的標記已全部確定（Allen 確認）；仍在測試站用真實請求各試一次。Muse Spark 的探測結果因 token 上限不採信，不需重測。
3. 思考強度選項（§10 第 2 點）：第一版不做；上表是之後逐模型加選項的依據。

## 15. 實作（2026-10-13，已推 `staging`，等 Allen 在測試站實測）

**做了什麼**
- 模型登記：新檔 `src/app/runtime/legacy-core/opencode-models.js`（31 個模型：id、顯示名稱 `OpenCode …`、廠商、格式、圖片）。供應商 id `opencode-go`，模型 id `opencode-go/<OpenCode 的 id>`；格式與圖片由這份表決定，不信任瀏覽器送來的欄位（伺服器也用同一份）。工具一律標支援（探測：呼叫與工具答案送回都通過）。價格欄用「Go 訂閱，依後台限額」，資料保留 30 天（Grok、GPT Luna、Claude Haiku）與 Muse 訓練的警示放在每個模型的說明行；免費兩個標「限時免費」並註明資料政策以 OpenCode 公告為準（官方文件的隱私表沒有列這兩個，**請 Allen 查證**）。
- 金鑰：`opencode-go`（設定頁新欄位、`config-store`、`sensitive-config-store`／`-redaction`、`dom-registry`、`settings-api-key-controls`、`03-shell` 片段）。五語言文字在 `i18n/parts/settings.js`、`model-descriptions.js`、`dialogs.js`（匯出金鑰說明）；搜尋說明也加上 OpenCode Go。
- 轉接器（新檔，`stream-api-call.js` 只加註冊與分支）：`opencode-request.js`（三種格式的請求、標頭 `Authorization`、`x-opencode-session`＝對話編號）、`anthropic-messages-format.js`（Messages 的訊息、工具、串流收集器）、`opencode-errors.js` 與 `src/data/opencode-error-texts.js`（錯誤提示五語言，**動態載入**，不佔主檔案）。chat 格式重用 NVIDIA 的訊息組裝（影片不送、不帶 `detail`）、responses 重用 OpenRouter 的輸入組裝與收集器。
- **不帶**思考參數、`temperature`、`top_p`（上游對未知欄位直接 400；用各模型自己的預設）。Messages 的 `max_tokens` 預設 16384（探測用 16384 回 200 前請見 §14 待確認）。chat 的工具回合不送回 `reasoning_details`（OpenRouter 專屬，上游可能拒絕）；探測確認「有／無思考內容送回」兩種都被接受。
- 通道：瀏覽器走 `api/opencode-chat.js`（`?format=chat|responses|messages`，加 `User-Agent: Noureon/1` 與 `x-opencode-session`，串流轉送，頁面關閉就中止上游）；`vercel.json` 為它設 `maxDuration` 300；伺服器 `server/upstream-fetch.js` 同一路徑直接送到 OpenCode（沒有總時間上限，只有該次回覆的訊號）；`COUNCIL_PROVIDERS` 加 `opencode-go`；`model-access.js` 把對話編號交給請求。
- 錯誤：OpenCode 的訊息去掉 `Upstream request failed:` 前綴，已知原因前面加一行處理方法（五語言）：Global 區域、允許訓練資料、金鑰無效、端點暫時離線、用量以後台限額為準。
- 文件：協助中心、使用條款、隱私政策（含 `PRIVACY.md` 重新產生）、README 兩份；首頁的數字（69 個模型、18 家廠商）依測試跟著改。
- 測試：`tests/opencode-provider.test.js`（登記表、請求、Messages 組裝與收集器、三格式串流、錯誤提示、伺服器路徑、Vercel 函式）；`tests/opencode-probe.test.js`（探測工具）。

**注意事項**
- 首頁主 JS 壓縮後剛好 155.0 KB（上限 155.0）：錯誤提示改成動態載入才壓回來。下一次加文字就會超過，**要決定**：把更新日誌改成延遲載入，或放寬上限（待 Allen）。
- 建議上線前確認：免費兩個模型的資料政策、Space Bunny 的廠商（目前標為 OpenCode）、`max_tokens` 預設 16384 對每個 Messages 模型是否合適（探測的 `params` 測試，Allen 尚未跑）。

### 15.1 各模型思考程度（NOU-8，2026-10-13；探測 `--tests effort`，每個強度值單獨試一次，題目是一道小算術）

現有的思考滑桿直接用（`MODEL_REASONING_CONFIGS`，`providerParameter: 'opencodeThinking'`）。表在 `opencode-models.js` 的 `THINKING`，送出的欄位由 `opencodeThinkingFields` 決定；**探測看到被拒的值一律不放進選項**，沒有選擇的模型不給滑桿（照舊不送任何欄位）。

| 做法 | 模型（選項；預設） |
|---|---|
| chat `reasoning_effort` | Kimi K3（none、low、medium、high、max；high）、Kimi K2.7 Code（low、medium、high、max；high；none 被拒）、GLM-5.3／5.2（low、high、max；high；none 被拒，只能思考）、DeepSeek V4 Pro／V4 Flash／V4.1 Flash／V4 Flash Vision Exp（none、low、high、max；high；`minimal` 會讓 V4.1 Flash 停不下來，不放）、MiMo V2.6 Pro／Flash、V2.5 Pro、V2.5（none、high；low／medium／high 效果相同，只做開關；`minimal`／`xhigh`／`max` 被拒）、Hy4 Preview（low、medium、high、max；high）、Hy3（none、high）、Step 5 Preview（low、medium、high、max；high；none 被拒，強制思考） |
| chat 只有開關：`thinking:{type:'disabled'}` | LongCat 2.0、LongCat 2.5 Preview（none、high；強度值不起作用） |
| responses `reasoning.effort` | Grok 4.7／4.6（low、medium、high、xhigh；high；none、max 被拒）、GPT-6 Luna／GPT-5.6 Luna（none、low、medium、high、xhigh、max；medium；minimal 被拒）、Muse Spark 1.3（minimal…max；medium；none 被拒）、Muse Spark 1.2（minimal…xhigh；medium；none、max 被拒） |
| messages `thinking:{type:'adaptive'}`＋`output_config.effort` | Claude Haiku 5.5（low、medium、high、xhigh、max；medium；low 幾乎不思考） |
| messages，none 用 `thinking:{type:'disabled'}`，其他用 adaptive＋effort | Qwen3.8 Max／Flash（none、low、medium、high、xhigh；high） |
| messages 只有開關 | MiniMax M3、Qwen3.7 Plus（none、high） |
| 沒有滑桿 | GLM-5.3 Flash（none 也照樣思考，值的效果是隨機的）、Space Bunny（強度值的效果隨機，none 被拒）、MiniMax M2.7（關不掉） |

預設值會跟著請求送出（開關型的預設不送任何欄位）；請求只在人選了模型之後才帶強度，`disableReasoning` 的請求（視覺檢查等）一律不帶。

### 文件（PDF）直接讀（2026-10-14）
探測腳本新增 `document` 測試：一頁 PDF（內容 "The secret word is MANGO."）依各格式的樣子直接送給模型（chat `file`、responses `input_file`、messages `document`）。結果（`--max-tokens` 預設 200）：

* **答 MANGO（已登記為直接讀 PDF）**：chat：deepseek-v4.1-flash、deepseek-v4-flash、mimo-v2.5、hy4-preview、hy3、step-5-preview-free；responses：grok-4.7、grok-4.6、gpt-6-luna、gpt-5.6-luna；messages：claude-haiku-5-5、minimax-m3、qwen3.8-max、qwen3.8-flash、qwen3.7-plus。
* **拒絕檔案（400）**：glm-5.3-flash、glm-5.3、glm-5.2、kimi-k3、kimi-k2.7-code、deepseek-v4-flash-vision-exp、mimo-v2.6-flash、mimo-v2.6-pro、mimo-v2.5-pro、longcat-2.5-preview-free、cat-jam-free。這些繼續走「文件轉譯」。
* **用 `--max-tokens 1500` 重測**：muse-spark-1.3／1.2、minimax-m2.7 答對，加進名單（共 18 個）；deepseek-v4-pro 答「Unknown」、space-bunny 答「Please attach the document.」，收了檔案但沒讀，不登記；longcat-2.0 仍回「Endpoint is unavailable」，之後再測。

程式：`opencode-models.js` 的 `PDF_API_IDS`／`opencodeModelReadsPdf`；`modelSupportsUploadedFile` 對這些模型只放行 `application/pdf`（只測過 PDF），其他檔案類型仍轉譯；`modelSupportsDocumentUpload` 不變（它同時決定誰能當「文件轉譯模型」，這些模型只收 PDF，所以不能）。chat 的 `file`、responses 的 `input_file` 沿用既有 builder 的形狀，messages 加 `document` 區塊（`anthropic-messages-format.js`）。

## 2026-10-14：Gemini 4 Argon Contributor 與 `x-opencode-session`

- Allen 回報：OpenCode Go 加了 `gemini-4-argon-contributor`，**只有 `/v1/models/gemini-4-argon-contributor:generateContent` 通**（Google 原生格式，整段回答一次回來，沒有串流）；另外**所有請求現在都必須帶 `x-opencode-session`**，沒帶會被擋。
- 新增第四種格式 `gemini`：`OPENCODE_FORMATS` 加 `gemini`；`opencode-request.js` 回傳 `/api/opencode-chat?format=gemini&model=<id>`，body 用頁面原本的 Gemini 組裝（`buildGeminiRequest(..., viaOpencode: true)`：不送取樣數字、不送思考設定、不送 Google 搜尋，圖片用 `inlineData`，工具用 `functionDeclarations`）；`api/opencode-chat.js` 與 `server/upstream-fetch.js` 轉成 `/models/<id>:generateContent`（模型編號只允許 `[A-Za-z0-9._-]`），`Accept: application/json`，金鑰同時放在 `Authorization` 與 `x-goog-api-key`（還沒確認 OpenCode 要哪個）。回答用 `response.text()` 一次讀完，餵給原本的 Gemini 收集器。
- 標示：Contributor＝會用提示與回應訓練 Google 的模型（沿用 Muse 的寫法，隱私政策／協助中心五語言補上）；沒有寫「限特定地區」（未確認）。圖片輸入：有（Allen 確認）。PDF、思考程度、工具：**未測**，PDF 先不送、思考不送設定、工具照 Gemini 格式送但沒實測。
- `x-opencode-session`：頁面與兩條代理都**一律送**——對話編號合法就用它，沒有就用「整個頁面同一個」的備用編號（代理端沒收到就自己產生）。原本沒有對話編號的請求（例如背景工作）會被擋，這次一併修掉。
- 模型數 32 → 33，首頁與協助中心的「70 個模型」改成 71。

### 2026-10-14 探測結果（Allen 執行 `argon-probe.json`），已套用

- **串流可用**（`streamGenerateContent?alt=sse` 與不帶 `alt=sse` 的 JSON 清單兩種都 200），所以改成串流：代理與伺服器轉到 `:streamGenerateContent?alt=sse`，沿用原本的 Gemini 串流讀取（先前「只有 generateContent 通」不準確，以此為準）。
- **金鑰**：只放 `Authorization: Bearer` 就通（只放 `x-goog-api-key`、兩個都放也通）；拿掉 `x-goog-api-key`，只送 Bearer。
- **思考等級**：`low`／`medium`／`high` 可用，`minimal` 被拒（400「Thinking level MINIMAL is not supported」）；預設 `medium`；關不掉（`thinkingBudget` 0 或 1024 都沒有改變）。`low` 幾乎不思考（沒有思考 token）、`medium` 約 25、`high` 約 200（一道小算術）。選單的思考程度滑桿：低／中／高，預設中。請求放 `generationConfig.thinkingConfig.thinkingLevel`。
- **思考摘要**：`includeThoughts: true` 配 `medium`／`high` 會回傳 `thought: true` 的文字部分，所以要摘要時送 `includeThoughts`（顯示為「摘要」）。
- **文件**：PDF 以 `inlineData`（`application/pdf`）直接讀，答對 MANGO，加進直接讀 PDF 的名單。
- **工具**：函式呼叫可用；工具回合三種送回方式（全部 parts、去掉思考、只留呼叫）都成功，沿用原本 Gemini 的送回方式（保留 `thoughtSignature`）。
- 圖片：可用（回答 Red）。

### 2026-10-14 Word 與 PowerPoint 探測（`--tests office`，Allen 執行），已套用

- 把同一句「The secret word is MANGO.」的 `.docx` 與 `.pptx`（`scripts/probe-files/`）照各模型的格式直接送：
  - **兩種都答 MANGO（直接讀）**：grok-4.7、grok-4.6、gpt-6-luna、gpt-5.6-luna、gemini-4-argon-contributor。
  - **拒絕（400）**：muse-spark-1.3／1.2-contributor（unsupported file type）、claude-haiku-5-5（只收 PDF）、deepseek-v4.1-flash、deepseek-v4-flash、mimo-v2.5、hy4-preview、step-5-preview-free。
  - **收下但沒讀到**：hy3、minimax-m3、minimax-m2.7、qwen3.8-max、qwen3.8-flash、qwen3.7-plus（答「看不到文件」或亂答）。
- 套用：`opencode-models.js` 的 `OFFICE_API_IDS`（上面五個）與 `opencodeModelReadsFile(model, mimeType)`；`modelSupportsUploadedFile` 對這五個放行 docx、pptx，其餘 OpenCode 模型仍先轉譯。只試了 docx、pptx，xlsx 與其他格式未試，仍轉譯。Responses 沒有檔名時依類型補 `.docx`／`.pptx`。

### 2026-10-14 轉成 PDF 的探測（`--tests converted`，Allen 跑了三輪）與 PDF 名單修正

- Word／PowerPoint 轉成的 PDF，**兩種都穩定答 MANGO**：hy4-preview、hy3、muse-spark-1.3／1.2-contributor、claude-haiku-5-5、minimax-m3、minimax-m2.7、qwen3.8-max、qwen3.8-flash、qwen3.7-plus（共 10 個）。這 10 個就是「先轉 PDF 再送」（NOU-25）的對象。
- **不穩定的四個**：deepseek-v4-flash（兩份 PDF 都 400「file must have a file_id or file_data」）、deepseek-v4.1-flash（有時 400、有時答對）、mimo-v2.5（有時說打不開）、step-5-preview-free（端點常暫停 429）。三輪下來結果不一致，**從「直接讀 PDF」名單拿掉**（`opencode-models.js` 的 `PDF_API_IDS`），這四個的檔案一律先轉譯。
- 直接讀 PDF 的 OpenCode 模型因此從 19 個變 15 個；Word／PowerPoint 直接讀的仍是 5 個。

### 2026-10-20 新增兩個免費模型前的探測：MiniMax M3.1 Flash Free、Beam Free

- Allen 要加這兩個（OpenCode Go，免費）。這個環境連不到 opencode.ai，查不到模型 id 與 API 格式，所以先給探測程式，結果要由 Allen 在自己的電腦跑。
- 探測程式（`scripts/opencode-probe.mjs`）做了三件事：
  - `MODELS` 多了兩筆猜測的項目：`minimax-m3.1-flash-free`（猜 Messages 格式，MiniMax 其他模型都是）與 `beam-free`（猜 chat）。猜的格式被拒絕時，探測會自動改試其他格式。
  - `--new`：讀服務的模型清單（公開、不用金鑰），印出探測程式還沒有的 id。id 的拼法對不對，用這個看。
  - `--model id[:格式]`：直接試任意 id；有寫格式（`:chat`、`:responses`、`:messages`）就不猜。
- 執行（要全部能力一次測完）：
  ```
  node scripts/opencode-probe.mjs --new
  OPENCODE_GO_KEY=... node scripts/opencode-probe.mjs --only minimax-m3.1-flash-free,beam-free --max-tokens 1500 --out probe-new.json
  ```
  - 預設會跑全部測試：基本回答、串流、工具呼叫、工具迴圈、參數、思考深度、看圖、PDF（含 PDF 裡的圖片）、Word／PowerPoint 原檔、思考設定、金鑰與錯誤。
  - `--new` 顯示的 id 如果不同，改用 `--model <實際的 id>`。
- 結果出來之後，才依結果填模型登記表（`opencode-models.js`：格式、工具、看圖、PDF、思考深度）。
- OpenRouter 的 `minimax/minimax-m3.1-flash:free`（Allen 要一起加）用 `scripts/nvidia-probe.mjs --openrouter`（預設就是這個 id）：
  ```
  OPENROUTER_API_KEY=... node scripts/nvidia-probe.mjs --openrouter --only list,info,endpoints
  OPENROUTER_API_KEY=... node scripts/nvidia-probe.mjs --openrouter
  ```
  - 第一行指令是不花錢的：
    - `list` 看 id 對不對，不對時列出同一家的 id。
    - `info` 看服務說這個模型收什麼（文字、圖、影片、檔案）、吃哪些設定、context 與價格。
    - `endpoints` 看背後有哪些供應商、各自支援什麼。
  - 第二行跑全部：基本、串流、工具、參數、看圖、影片、PDF、PDF 裡的圖、思考深度。
  - `:free` 的模型被供應商限速，偶爾回 429 不代表 App 有問題。

### 2026-10-20 探測結果與套用（Allen 跑的 `probe-new.json` 與 OpenRouter 的輸出），已加入模型登記表

OpenCode Go 兩個免費模型（id 猜對了）：

| | `minimax-m3.1-flash-free` | `beam-free` |
|---|---|---|
| 格式 | messages | chat |
| 工具 | 可用（呼叫、工具迴圈兩種都過） | 可用（工具迴圈有思考、沒思考都過） |
| 參數 | temperature、top_p、16384 都收 | 都收 |
| 看圖 | 可用（回答 Red） | 不能：400「Beam supports text input only」 |
| PDF | 讀（MANGO），而且看得到 PDF 裡的圖片（BANANA） | 不收：檔案區塊被拒（400） |
| Word、PowerPoint 原檔 | 沒讀到（答 Unreadable、Unknown） | 不收 |
| 思考 | 一定會思考：`thinking: disabled` 被拒（400）；`adaptive` 加 `output_config.effort` 的 low 到 max 都收 | 一定會思考（`reasoning_content`）：`none`、`minimal` 被拒；`reasoning_effort` 的 low 到 max 都收；`thinking`、`enable_thinking` 不認得 |

- 套用（`opencode-models.js`）：
  - 兩個都是 `free`，名稱不寫 Free（標籤另外標），不是隱藏模型。
  - MiniMax M3.1 Flash 加進 PDF 名單，而且加進「Word／PowerPoint 先轉 PDF」名單，等於 Claude Haiku 的做法（思考方式也同它）。`converted` 這項沒有跑，請在測試站用 Word、PowerPoint 驗收。
  - Beam 是純文字模型，公司歸在 `opencode`（和 Space Bunny、Cat Jam 同一個），思考方式是 `reasoning_effort`，預設 high。
- OpenRouter 的 `minimax/minimax-m3.1-flash:free`：全部項目都過。
  - `info`：輸入文字、圖片、影片，context 1,000,000，最大輸出 524,288，價格 0。
  - 工具、看圖、影片、PDF、PDF 裡的圖都過。
  - 思考：`none` 被拒（400「Reasoning is mandatory」），low 到 max 和 enabled 都收。
  - 套用（`model-registry.js`）：加進模型清單、看圖名單、工具名單，思考深度 low 到 max、預設 medium。
- 模型數 77 個變成 80 個（`npm run sync:counts`）；協助中心（五語言）的「轉 PDF 模型」名單加上 MiniMax M3.1 Flash。

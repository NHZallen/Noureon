# OpenAI 官方供應商（文字與圖片，用使用者自己的金鑰直連）

**狀態：** 設計，探測結果出來後才動程式（2026-10-29）。區塊 02「模型供應商與模型管理」，Allen 負責。OpenAI 的模型頁（`developers.openai.com`）不在開發環境允許的網域內，這份文件沒有讀到原文；能力、價格、上下文長度要靠探測工具（§8）和 Allen 貼的頁面重點補。

## 1. Allen 的決定（2026-10-29）

- 新增供應商 `openai`（OpenAI API，使用者自己的金鑰），四個文字模型：`gpt-6-astra`、`gpt-6.1-sol`、`gpt-6.1-terra`、`gpt-6-luna`。
- **圖片也做**：`gpt-image-2.5-sunburst`（編輯精準度優先）與 `gpt-image-2.5-flare`（快、日常高品質）。用最好的格式：文字與圖片都走 Responses API，圖片用 Responses 的 `image_generation` 工具（可多輪編輯），Images API 只在探測顯示 Responses 工具不夠用時才補。
- 測試用最便宜的模型：文字 `gpt-6-luna`、圖片 `gpt-image-2.5-flare` 的 `quality: low`。
- 顯示名稱全部標供應商名稱（細節見 §4，等 Allen 確認）。
- 送 `safety_identifier`，**讓使用者在設定自己開關**。
- **不做額度顯示**（沒有圓環）。
- 顯示名稱：**全部模型**都標供應商，格式 `GPT-6 Astra · OpenAI`、`GPT-6 Astra · OpenRouter`（Allen，2026-10-29）。
- 圖片模型和文字模型擺在一起，依公司分組，和 OpenRouter 的圖片模型一樣的做法（Allen，2026-10-29）。
- **網路搜尋讓使用者選**：OpenAI 直連的模型可以用 OpenAI 官方內建搜尋（Responses 的 `web_search` 工具），或用設定裡原有的搜尋服務（Tavily／TinyFish）。實測官方搜尋一次約 8,400 個輸入 token，使用者要知道會比較貴。
- 其他三個文字模型（Terra、Sol、Astra）**不另外實測**，思考程度等能力照 OpenRouter 登錄和 Luna 的結果；上測試站後由 Allen 用真金鑰試，錯了再改（Allen，2026-10-29）。

## 2. 事實與限制

- 四個文字模型已在 OpenRouter 供應商下（`openai/gpt-6-astra` 等，見 `model-registry.js`），`gpt-6-luna` 也在 OpenCode Go（Responses 格式）。直連的 id 是不帶前綴的 `gpt-6-astra`，不會和 OpenRouter 的 id 衝突，對話裡記的模型 id 也不會混。
- 圖片生成現在只有 OpenRouter。OpenAI 官方文件：用 GPT Image 模型可能需要先完成 API 組織驗證（使用者端的事，錯誤訊息要講清楚）。
- 圖片模型的品質選項：`low / medium / high / xhigh / max / auto`；尺寸 `WIDTHxHEIGHT`（16 的倍數、長寬比 1:3 到 3:1、單邊不超過 3840、總像素 655,360 到 8,294,400）；格式 `png / jpeg / webp`，透明背景要 `png` 或 `webp`。兩個 GPT Image 2.5 模型的 token 價格相同（圖片輸出 $30 / 百萬 token），但同品質下用的 token 數可能不同。
- Responses 的圖片工具：主模型（如 `gpt-6-astra`）呼叫，`action` 可設 `auto / generate / edit`；回傳 `image_generation_call`，內含 `result`（base64）與 `revised_prompt`。串流可收 0 到 3 張部分圖，每張部分圖多收 100 個圖片輸出 token。
- 使用者金鑰；請求一律 `store: false`（我們每次都送完整歷史，不靠 OpenAI 保存對話）。因此多輪編輯**不能用圖片 id**，要把上一張圖當 `input_image` 的 data URL 送回去（探測的 `image` 測試會確認這樣行）。

## 3. 通道

- **瀏覽器直連是否可行：未知。** 要先用 `node scripts/openai-probe.mjs --cors-snippet` 印出的片段在網頁 Console 實測。能直連就和 Gemini 一樣由瀏覽器送（`vercel.json` 的 `connect-src` 要加 `https://api.openai.com`）；被擋就像 NVIDIA／OpenCode 一樣走網站函式轉送。
- **伺服器上跑的回覆**（關頁繼續、Python、連接器、技能、CLI、理事會、深度研究）：共用的 `stream-api-call.js` 在伺服器上執行，`server/upstream-fetch.js` 加 OpenAI 的路徑；`COUNCIL_PROVIDERS`（`server/run-spec.js`）加 `openai`。
- 請求格式：Responses API（`/v1/responses`），重用 OpenCode 的 `responses` 轉接器；Chat Completions 只在探測顯示某個模型不收 Responses 時才當退路。

## 4. 顯示名稱

選單按「公司」分組（`model-picker-groups.js`），所以直連的 OpenAI 模型和 OpenRouter 的 OpenAI 模型會落在同一個「OpenAI」組，名稱都叫 `OpenAI GPT-6 Astra`，只有第二行小字（`providerLabel`）不同。要在名稱上標供應商，建議顯示成 `GPT-6 Astra · OpenAI`、`GPT-6 Astra · OpenRouter` 這種形式。「全部模型」都標還是「同一個模型出現在兩個供應商時才標」，等 Allen 確認（全部都標會動到所有模型名稱和相關測試）。

## 5. 隱私

- `safety_identifier`：用帳號 id（雲端帳號用 Supabase 使用者 id，本機帳號用本機 id）做 SHA-256 取前 32 字元；設定 → 隱私有開關，預設開（Allen 的決定）。不送姓名、信箱。
- `store: false`：永遠送。隱私政策要寫：OpenAI 仍會依自己的規則保留一段時間做濫用偵測。
- 五種語言的隱私政策、協助中心與 `PRIVACY.md` 要補 OpenAI（金鑰存在哪、請求送到哪、`safety_identifier` 與開關）。

## 6. 要改的檔案（依 OpenCode 的前例，實作時再逐一確認）

供應商順序與設定（`model-switcher-lifecycle.js`、`config-store.js`）、金鑰欄位（`settings-api-key-controls.js`、`03-shell.fragment.js`、`dom-registry.js`）、敏感設定加密與遮蔽（`sensitive-config-store.js`、`sensitive-config-redaction.js`）、請求轉接（`stream-api-call.js`、`provider-request-support.js`、`model-request-engine.js`）、模型登錄（新檔 `openai-models.js`＋`model-registry.js`）、圖片生成路徑、伺服器（`upstream-fetch.js`、`run-spec.js`）、`vercel.json`、i18n 五語言、法律文字五語言。

## 7. 不做

額度圓環、Batch／Flex／優先處理、Assistants、Realtime、語音、Fine-tuning。

## 8. 探測工具 `scripts/openai-probe.mjs`

Allen 在自己的電腦跑（金鑰只放環境變數 `OPENAI_API_KEY`，不印出、不寫檔）。預設只用最便宜的 `gpt-6-luna`，約 25 個小請求。記錄：Responses 與 Chat Completions 各自能不能用、串流事件（思考摘要在哪個事件）、每個思考程度（`none` 到 `max`）是否被接受、函式呼叫與工具結果回送（`store: false` 下）、圖片輸入、PDF 輸入、內建網路搜尋、`safety_identifier`、錯誤格式（錯金鑰／沒金鑰／不存在的模型／錯的思考程度）、金鑰可用的模型清單。`--tests image` 用 `gpt-image-2.5-flare` 低品質各畫一張（Responses 工具、接著編輯、Images API），`--tests imagequality` 試各品質（`xhigh`、`max` 較貴）。測試：`tests/openai-probe.test.js`（假服務，不連網）。

## 8.1 探測結果（2026-10-29，Allen 用自己的金鑰跑）

`gpt-6-luna`：Responses 與 Chat Completions 都 200；思考程度 `none / low / medium / high / xhigh / max` 接受，`minimal` 被拒（400）；串流沒有思考摘要事件（即使要求 `summary: auto`），所以 OpenAI 直連**不顯示思考內容**；函式呼叫與 `store: false` 下送回結果成功；圖片輸入（`input_image` data URL）、PDF（`input_file` base64）成功；`safety_identifier` 接受；內建 `web_search` 成功但一次約 8,421 輸入 token。`gpt-image-2.5-flare`（低品質）：Responses 圖片工具成功（約 6.7 秒、約 31 KB jpeg）；用 data URL 把圖送回編輯成功（約 7.7 秒），不需要圖片 id；Images API 成功（1024×1024 低品質約 196 個圖片輸出 token，約 0.006 美元）。限額（這把金鑰）：5000 請求／分、2,000,000 token／分。**還沒有的：** 瀏覽器 CORS 結果、錯誤格式、金鑰可用的模型清單、Sunburst。

## 9. 待 Allen 確認

1. 瀏覽器 CORS 結果（決定要不要做轉送函式）。
2. 官方搜尋和 Tavily／TinyFish 的選擇放哪裡、預設是誰：建議放在「OpenAI 金鑰」那一塊的下面，一個選單「OpenAI 模型的網路搜尋：官方內建／使用上面選的搜尋服務」，預設官方內建（不需要另外的搜尋金鑰）。
3. 價格：先用 OpenRouter 登錄的數字（Astra 50、Terra 5、Luna 0.5 美元／百萬輸出 token），OpenAI 官方價格若不同再改。

## 10. Implementation (2026-10-29, on `staging`, waiting for the owner to try it with a real key)

Decided with Allen on 2026-10-29 (after the probe): the browser calls OpenAI straight (CORS answers `*`, the owner tested it from `noureon.com`'s origin: preflight, streaming POST `/responses`, `GET /models` all 200), so there is no function that passes the request on; `vercel.json` `connect-src` has `https://api.openai.com`. Pictures sit with the text models in the picker (by company, like OpenRouter's). Web search is chosen in the Web search card of the settings (`openaiWebSearch`: `official` by default, or `provider` = the search service below it).

- **Models**: `src/app/runtime/shell/openai-models.js` (shared with the server; listed in `scripts/server-shared-modules.json`). Ids are `openai-api/<id at OpenAI>`, provider `openai`. Names shown with the provider after them everywhere in the picker (`getModelDisplayName` in `model-registry.js`: "GPT-6 Astra · OpenAI", "OpenAI GPT-6 Astra · OpenRouter"; a name that already starts with the provider is left as it is).
- **Text**: `reply/openai-request.js` builds the Responses request (`store: false`, `include: ['reasoning.encrypted_content']`, no temperature/top_p, no thinking summary because the probe showed none comes, `safety_identifier` unless turned off, `tools: [{type:'web_search'}]` when OpenAI's own search is chosen and a search is wanted). `stream-api-call.js` has the `openai` branch; the Responses collector now returns the pages OpenAI cited (`url_citation`) as the search sources, and `applyResponsesTools` keeps the provider's own tools beside the functions and does not send `web_search_call` items back.
- **Search**: `modelUsesNativeWebSearch` / `modelUsesTavilySearch` / `modelSupportsWebSearch` take an optional config (the page's registry reads the settings each time); `openAiUsesOfficialSearch` is in `openai-models.js`. The planner of server replies makes OpenAI's own search a `grounding` reply; Python with OpenAI's search is made on the page.
- **The identifier**: the hash of `noureon-user:<account id>` (first 32 hex characters), `setOpenAiUserId` (from `announceUser`, the page) or the account of the run (the server). The setting `openaiSafetyIdentifier` (default on) is read through `setOpenAiConfigReader`.
- **Server (contract for Allen to confirm, Linear label `contract`)**: the run spec accepts `openai` as a model provider (reply, council, picture), `tools.openaiSafetyId` (false only, reply and council), `tools.openaiWebSearch` (council, `provider` only) and `image.safetyId` (false only). A server that does not know them refuses the request and the page makes the reply itself.
- **Pictures**: `images/openai-image-generation.js` (generations as JSON, edits as a form with the pictures as files; the size comes from the shape and the tier: `openAiImageSize`), `images/image-generators.js` picks OpenAI's or OpenRouter's maker by the `provider` of the request; used by the page (`generated-image-runtime.js`) and the server (`image-run.js`, `image-tool.js`).
- **Not done / not tried**: nothing was tried against the real service from the development environment (`api.openai.com` is not reachable from it); the depths of thinking of Astra, Sol and Terra, the form of the edits endpoint, the sizes the service accepts, the cost of the built-in search and the images with `xhigh` / `max` quality need the owner's key on the test site. The wrong key / no key probes returned no error in the owner's run (probably a gateway between the machine and OpenAI); the normal 401 is shown with OpenAI's own words.

# 「先搜一包」搬到伺服器（關掉頁面也會搜完、答完）

**日期：** 2026-10-07
**狀態：** 設計草案，**等 owner 確認 §2 的幾個決定後才開始寫程式**。尚無任何程式變更。
**前置閱讀：** [`AGENTS.md`](../../../AGENTS.md)、[伺服器執行設計](2026-10-03-server-runtime-design.md)、[圖片生成搬到伺服器](2026-10-06-server-image-generation-design.md)（新增一種任務類型的做法、§12 §13 的教訓）、[交接文件](../plans/2026-10-04-session-handoff.md)。

## 1. 現況與要解決的事

**哪些回覆是「先搜一包」。** 開了網路搜尋、但模型不會自己呼叫工具搜尋的回覆：

- 4 個不支援工具的 NVIDIA 模型（`NON_TOOL_CALLING_MODEL_IDS`）。
- 不在 `TOOL_CALLING_MODEL_IDS` 的 OpenRouter 模型。
- 支援工具、但沒設搜尋金鑰（或供應商拒絕工具）的模型。

（Gemini 用自己的搜尋，會呼叫工具的模型自己搜，這兩種伺服器早就能做。）

**現在怎麼做（全在瀏覽器）。** 使用者訊息 → 用回覆模型改寫成 ≤15 字的搜尋詞（8 秒逾時，失敗改用規則式）→ 瀏覽器經 Vercel 的 `/api/tavily-search`（或 TinyFish）搜尋 → 組成 `# Web search packet`（最多 7000 字，含 `[n]` 編號的來源）放在請求最前面 → 一般串流呼叫模型 → 答案前面加 `noureon-run` 區塊（來源），畫面顯示「已搜尋 N 個網站」與 `[n]` 小標籤。

**問題。** `planServerReply` 對這種回覆回傳 `packet-search`，靜默退回瀏覽器：頁面一關，搜尋和回覆都中斷。

**目標。** 搜尋也由伺服器做，頁面關掉照樣搜完、答完；畫面上看到的東西（進度、來源列、`[n]` 標籤）**完全不變**。

## 2. 要請 owner 決定的事（附建議）

1. **搜尋深度。** 設定裡有 Tavily 的「basic／advanced」。伺服器現在寫死 `basic`（連已經在伺服器上跑的「模型自己搜」也是），所以選 advanced 的人在伺服器上其實沒生效。**建議：** 把深度放進 RunSpec，伺服器照設定走（順便修好既有的落差）。
2. **搜尋金鑰。** 伺服器目前一次只收一把搜尋金鑰（選定的供應商，沒有就用另一家的）。瀏覽器版在選定的供應商沒結果時會改用另一家（兩把都有才行）。**建議：** 維持一把，和既有「模型自己搜」一致，不新增行為；兩家備援留給之後有需要再說。
3. **搜尋失敗時。** 沿用瀏覽器現在的行為（見 P0 要確認的細節），不發明新的提示。
4. **本機版保留。** 選「回覆在這個裝置上」、沒有雲端帳號、暫時對話、請求太大、伺服器連不上或協定不符時，照現在的做法在瀏覽器裡搜、裡答，使用者不會看到任何提示（和文字、圖片一樣）。
5. **不包含：** 多模型會議的共用搜尋包（會議最後做、另寫設計）、搜尋加 Python（不支援工具的模型本來就沒有 Python）、文件翻譯與網址內容讀取（仍在瀏覽器準備好再送）。

## 3. 現成可用的零件（已讀程式確認）

- `server/run-spec.js`：`tools.webSearch` 現有 `off／research／grounding／briefing`，`tools.searchProvider`，`secrets.searchKey`。
- `server/upstream-fetch.js`：已認得 `/api/tavily-search`、`/api/tinyfish-search` 等路徑直接打到供應商，瀏覽器的搜尋程式 `createWebResearchTools`（`web-research-tools.js`）在伺服器上原樣可用（10 分鐘快取也照用）。
- `server/executor.js`：已用 `addNumberedSources` 收集來源，並用 `formatSandboxRunBlock` 寫出與瀏覽器相同的 `noureon-run` 區塊，**顯示端不用改**。
- 組搜尋包的共用模組：`model-request-formatting.js`（`buildTavilySearchQuery`、`formatTavilySearchPacket`、`normalizeTinyfishSearch`）、`search-query-rewriter.js`（改寫搜尋詞；需加進 `scripts/server-shared-modules.json` 並確認沒有瀏覽器全域物件）。
- RunSpec 的 `request.history` 本來就由客戶端送上去，改寫搜尋詞需要的對話歷史伺服器拿得到。
- 金鑰信封、停止、重啟接續、訊息寫入、客戶端 `reattach.js`、失敗說明（17.9.2）都不用動。

## 4. 設計

**伺服器端。** `tools.webSearch` 新增值 `'packet'`（缺少搜尋金鑰就拒絕，客戶端本來就不會送）。`executeReply` 在這個模式下，串流呼叫模型**之前**做：改寫搜尋詞 → `searchWeb`（最多 6 筆）→ `onSources`（最多 8 筆）→ `formatTavilySearchPacket` → 照瀏覽器的格式放進請求最前面的那一段文字（`# System-generated supporting context … # User request follows`），其餘與一般回覆相同。進度用既有的即時事件送出「搜尋中」，其他裝置看到和現在本機一樣的「正在搜尋」。

**客戶端。** 

- `planServerReply`：這種情況改回 `{ ok: true, webSearch: 'packet' }`，不再回 `packet-search`（Python 加搜尋包仍然是本機）。
- `single-model-response-lifecycle.js`：目前先在瀏覽器組搜尋包、再問伺服器收不收。要改成**先決定計畫，計畫是伺服器時不在瀏覽器搜**，只準備文件翻譯與網址內容；若伺服器沒收（連不上、426、`invalid_run_spec`），再於瀏覽器補做搜尋包，維持「靜默退回本機」。避免重複搜尋，也避免重複翻譯文件。
- `begin` 照既有方式送搜尋金鑰與 `tools.searchProvider`，並新增搜尋深度欄位。

**相容性。** 只新增 `tools.webSearch` 的一個值與一個欄位，**不升協定版本**：舊伺服器收到會回 `invalid_run_spec`，客戶端本來就會靜默退回本機（圖片做的時候已驗證過這條路）。

**重啟接續。** 搜尋只有一次呼叫，重啟後直接重搜，不做檢查點；和圖片一樣可能重複扣一次搜尋額度，只在隱私說明提一句。

**隱私。** 搜尋詞與搜尋結果會經過伺服器（「模型自己搜」早就這樣）。`PRIVACY.md` 補一段，五語言更新紀錄補一句。

## 5. 風險與要先確認的事（P0）

- 搜尋詞改寫要用「回覆模型」多打一次請求：伺服器上要確認用同一把模型金鑰、逾時與失敗退回規則式的行為與瀏覽器一致。
- 瀏覽器在搜尋失敗（沒金鑰、供應商錯誤）時的現行行為與訊息要查清楚，伺服器版逐一對齊（§2 第 3 點）。
- 搜尋包與其他字串長度計入 25MB 請求上限的方式；客戶端組好的請求不變。
- 17.9.1 的教訓：伺服器寫入的訊息 `sequence` 必須是 `conversation.messages.length`；搜尋包模式走既有回覆路徑，不新增寫入，但測試要覆蓋。

## 6. 階段（一次一個階段，做完回報，owner 說「推」才推）

- **P0：** 小實驗與核對（上面 §5 的幾點；在伺服器程式碼上用假的搜尋與模型跑一遍，不接真實帳號）。
- **P1：** 伺服器端：`run-spec.js`、`executor.js`、共用模組清單與邊界檢查、測試（`tests/server/`）。
- **P2：** 客戶端：`planServerReply`、生命週期的順序調整與退回、搜尋深度欄位、測試。
- **P3：** 隱私說明、更新紀錄（五語言）、版本 17.10.0（新功能算次要版本）、全套檢查、交接文件。真實帳號驗收清單交給 owner（關掉頁面再回來，看來源列與 `[n]` 標籤）。

文字與五語言：本功能沒有新的畫面文字（進度與錯誤文字沿用），只有更新紀錄與隱私說明需要五語言。

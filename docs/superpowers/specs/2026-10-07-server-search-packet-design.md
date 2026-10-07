# 「先搜一包」搬到伺服器（關掉頁面也會搜完、答完）

**日期：** 2026-10-07
**狀態：** owner 已決定 §2（2026-10-07：深度照設定、要備援、失敗行為沿用現狀）。**P0（§7）、P1 伺服器端（§8）、P2 客戶端（§9）已完成**；P3（隱私說明、更新紀錄、版本 17.10.0）也已完成；**尚未推上線，真實帳號驗收清單見 §10**。
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

## 2. owner 的決定（2026-10-07）

1. **搜尋深度照設定。** 把 Tavily 的 basic／advanced 放進 RunSpec，伺服器照設定走。這同時修好既有的落差：「模型自己搜」在伺服器上一直寫死 basic，忽略 advanced。
2. **要備援。** 選定的供應商沒結果（或出錯）時，改用另一家，和瀏覽器現在一樣。所以伺服器要收**兩把**搜尋金鑰：`secrets.searchKey`（選定的供應商）加新的 `secrets.searchKeyAlt`（另一家，沒設就不送）。`keyFor` 兩家都回得出金鑰，瀏覽器共用的 `searchAcross` 就原樣有備援。這也讓已經在伺服器上的「模型自己搜」有了備援（與瀏覽器一致，不是新行為）。
3. **搜尋失敗時沿用現狀。** 瀏覽器現在的做法（P0 讀程式確認）：沒有搜尋金鑰、搜尋詞是空的、或搜尋出錯，整則回覆就以那個錯誤結束，不會「不搜直接答」；伺服器版一樣丟出錯誤，由既有的錯誤寫入顯示。沒有金鑰的情況客戶端本來就不會交給伺服器（維持在瀏覽器，顯示現有的「需要金鑰」訊息）。
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
- `begin`：送選定供應商的金鑰與 `tools.searchProvider`（現在 `searchKeyFor` 找不到選定的就換另一家，改成兩家都有就兩把都送，`searchKeyAlt` 放另一把），並送 `tools.searchDepth`。`research`、`packet` 都用。

**搜尋包放在哪裡。** 客戶端在 packet 模式送出的 `requestParts` 沒有搜尋包，但可能已經有開頭那一段「`# System-generated supporting context …`」（文件轉譯、網址內容）。伺服器的做法：有這一段就把 `# Web search packet` 插在它的 `# User request follows` 之前，沒有就新建這一段，格式與瀏覽器一致（順序：文件轉譯、網址內容、搜尋包）。

**相容性。** 新增 `tools.webSearch` 的一個值，以及欄位 `tools.searchDepth`、`secrets.searchKeyAlt`，**不升協定版本**：舊伺服器收到會回 `invalid_run_spec`，客戶端本來就會靜默退回本機（圖片做的時候已驗證過這條路）。兩邊同時部署，中間幾分鐘的請求可能退回本機，無害。

**重啟接續。** 搜尋只有一次呼叫，重啟後直接重搜，不做檢查點；和圖片一樣可能重複扣一次搜尋額度，只在隱私說明提一句。

**隱私。** 搜尋詞與搜尋結果會經過伺服器（「模型自己搜」早就這樣）。`PRIVACY.md` 補一段，五語言更新紀錄補一句。

## 5. 風險

- 搜尋詞改寫要用「回覆模型」多打一次請求（8 秒逾時、失敗退回規則式）：已在 P0 確認伺服器上可行（§7）。
- 搜尋包與其他字串長度計入 25MB 請求上限的方式不變；客戶端組好的請求只是少了搜尋包。
- 17.9.1 的教訓：伺服器寫入的訊息 `sequence` 必須是 `conversation.messages.length`；搜尋包模式走既有回覆路徑，不新增寫入，但測試要覆蓋。
- 重啟接續：packet 模式的檢查點只有「搜尋包已組好」之前的部分都重做；P1 要確認既有的一般回覆接續行為，不重複寫出文字。

## 6. 階段（一次一個階段，做完回報，owner 說「推」才推）

- **P0：** 小實驗與核對（上面 §5 的幾點；在伺服器程式碼上用假的搜尋與模型跑一遍，不接真實帳號）。
- **P1：** 伺服器端：`run-spec.js`、`executor.js`、共用模組清單與邊界檢查、測試（`tests/server/`）。
- **P2：** 客戶端：`planServerReply`、生命週期的順序調整與退回、搜尋深度欄位、測試。
- **P3：** 隱私說明、更新紀錄（五語言）、版本 17.10.0（新功能算次要版本）、全套檢查、交接文件。真實帳號驗收清單交給 owner（關掉頁面再回來，看來源列與 `[n]` 標籤）。

文字與五語言：本功能沒有新的畫面文字（進度與錯誤文字沿用），只有更新紀錄與隱私說明需要五語言。

## 7. P0 結果（2026-10-07）

在 scratchpad 寫了一支腳本，用伺服器自己的 `createModelAccess`（假的 fetch）跑一遍：

- 瀏覽器的搜尋詞改寫（`createSearchQueryRewriter`）、搜尋（`createWebResearchTools` 加 `createUpstreamFetch`）、組搜尋包（`formatTavilySearchPacket`）**在伺服器上原封不動可用**：改寫打一次 `openrouter.ai` 串流（用 `spec.request.history` 加目前訊息當對話），搜尋打 `api.tavily.com/search`，預設深度 basic、6 筆。例：「and the pro plan?」接在 Vercel 價格的對話後，改寫成「Vercel Pro plan price」，搜尋包格式與瀏覽器相同。
- 唯一要加進 `scripts/server-shared-modules.json` 的新模組是 `search-query-rewriter.js`（它引用的 `nouras-policy.js` 已在清單上，沒有瀏覽器全域物件）。
- `truncateCouncilText`（7000 字截斷）是 `provider-request-support.js` 裡的區域函式，伺服器版要自己寫同樣的兩行（含 `\n\n[truncated]` 結尾），並用測試與瀏覽器的輸出對照。
- 瀏覽器版的失敗行為見 §2 第 3 點。

## 8. P1 伺服器端完成（2026-10-07）

- `server/run-spec.js`：`tools.webSearch` 多了 `'packet'`（不可搭 Python、一定要有 `secrets.searchKey`）；新欄位 `tools.searchDepth`（`basic`／`advanced`，沒給就是 `basic`）與 `secrets.searchKeyAlt`（只能和 `searchKey` 一起出現）。
- `server/model-access.js`：`keyFor` 兩家搜尋服務都回得出金鑰（選定的用 `searchKey`，另一家用 `searchKeyAlt`），所以共用的 `searchAcross` 備援在伺服器上也有效（包含既有的「模型自己搜」）；搜尋深度照 `tools.searchDepth`（以前寫死 basic）。
- `server/search-packet.js`（新）：`withSearchPacket`。從請求去掉頁面放的開頭上下文後取出人寫的字、用 `request.history` 加目前訊息改寫搜尋詞、搜尋、把頁面找到的網頁交給 `onSources`、組出與頁面相同格式的 `# Web search packet`，放進開頭上下文那一段（頁面已做過文件轉譯或讀過網址就插在其中，順序不變），沒有就新建。缺金鑰、沒有可搜的字，丟出和頁面相同文字的錯誤；搜尋出錯照一般錯誤處理（金鑰會被遮蔽）。
- `server/executor.js`：`packet` 模式先搜尋再串流；搜尋途中被停止就不再問模型。
- `scripts/server-shared-modules.json`：加入 `search-query-rewriter.js`、`runtime-texts.js`（已讀過，沒有瀏覽器全域物件）。
- 測試（`tests/server/server-search-packet.test.js`，9 項）：查詢由對話改寫、深度、備援金鑰（另一家的金鑰只送給另一家）、失敗與金鑰遮蔽、空訊息、搜尋中停止、上下文合併，以及**與頁面自己的 `buildSingleModelTranslatedRequestParts` 逐字對照**（除了「Retrieved at」時間）；改壞深度或備援金鑰，測試會失敗。
- 還沒做：接續（重啟）時 packet 模式沿用一般回覆的行為（沒有檢查點，整則重做）；P2 之前客戶端不會送 `packet`，所以現在沒有任何使用者受影響。

## 9. P2 客戶端完成（2026-10-07）

- `server-reply.js`：`planServerReply` 對「沒有工具、不是 Gemini、沒有 Python」的搜尋回覆回傳 `{ ok: true, webSearch: 'packet' }`（搜尋加 Python 仍留在本機）。`searchKeyFor` 回傳選定供應商的金鑰、另一家的金鑰（`searchKeyAlt`）與 Settings 的搜尋深度；`research`、`packet` 兩種都送。沒有任何搜尋金鑰時仍留在本機（顯示現有的「需要金鑰」訊息）。
- `single-model-response-lifecycle.js`：計畫（原本在翻譯之後）移到準備請求之前。計畫是伺服器搜尋時，頁面只準備文件與網址，不搜尋；伺服器沒收（連不上、協定不符、請求太大……）才在本機補搜，而且只補搜尋，不重做文件轉譯與網址讀取。
- `search-packet-parts.js`（新共用模組，伺服器也引用）：搜尋包怎麼放進請求的唯一寫法（開頭上下文、`# Web search packet` 區塊、七千字截斷、插進頁面已做過的上下文），頁面與伺服器不會各寫各的；`provider-request-support.js` 改用它，並多一個 `baseParts` 選項（只補搜尋）。
- 測試：`tests/server-reply.test.js`（計畫、兩把金鑰與深度）、`tests/single-model-response-lifecycle.test.js`（伺服器搜尋時頁面不搜、沒收時補搜且只補搜尋、有檔案時頁面準備檔案伺服器搜尋；改壞任一處測試會失敗）、`tests/server/server-search-packet.test.js`（頁面補搜與伺服器組出同一段上下文）。
- owner 要求顯示「正在使用 Tavily 搜尋」（2026-10-07），見 §10。

## 10. 搜尋中的顯示、P3 與驗收清單（2026-10-07）

- **「正在使用 Tavily／TinyFish 搜尋」：** 伺服器在搜尋開始時送新的即時事件 `{ ss: '<來源>' }`，搜尋結束（含失敗）送 `{ ss: '' }`；`runs.js` 的鏡像記住它，晚加入的頁面在快照 `r.ss` 就得知；頁面 `follow({ onSearching })` 在答案出現前顯示與本機搜尋相同的進度文字（`searchingTavily`／`searchingTinyfish`，五語言本來就有）。
- **隱私：** `PRIVACY.md` 新增一段；設定的隱私頁清單新增 `sent7`（五語言，`server-reply-texts.js`）。
- **版本 17.10.0**（`version.js`、`package.json`、`package-lock.json`、更新紀錄第 115 筆）。更新紀錄只有繁體中文（慣例）。
- **真實帳號驗收清單（由 owner 做）：**
  1. 選一個不會呼叫工具的模型（例如 NVIDIA 的 4 個之一），開網路搜尋，送一個需要最新資料的問題：看到「正在使用 Tavily 搜尋」，再看到答案、「已搜尋 N 個網站」與 [n] 標籤。
  2. 送出後立刻關掉頁面（或鎖手機），過一分鐘再開：答案與來源都在。
  3. 設定改成「回覆在這個裝置上」再送一次：行為和以前相同（在瀏覽器搜）。
  4. 搜尋深度改成「進階」再送：Tavily 後台的用量應顯示 advanced 搜尋。
  5. 只設一把搜尋金鑰（Tavily 或 TinyFish）與設兩把各試一次；故意把選定服務的金鑰寫錯，看是否改用另一家。
  6. 搜尋途中按停止：回覆停住、沒有錯誤訊息。

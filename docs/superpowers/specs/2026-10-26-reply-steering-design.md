# 回覆中引導（模型回答或思考時，還能發訊息引導它）

狀態：設計，等 Allen 決定（§7）。沒有程式改動。Allen 在 2026-10-26 提出：「各大廠都有引導功能，模型在回答或思考中還能發訊息引導，我也想做」。

## 1. 目標

在一則回覆還在進行（串流、思考、呼叫工具）時，使用者可以送出新訊息，影響這則回覆的後半段，而不是只能「停止」再重打。

## 2. 各家的做法（2026-10-26 查的）

沒有任何模型 API 能在**一次生成進行到一半**時塞入新輸入。各家的「引導」都是它們自己的代理迴圈做的，只有三種：

| 做法 | 誰這樣做 | 怎麼運作 |
|---|---|---|
| 排隊 | Claude Code（Enter）、Cursor（Enter） | 訊息先排著，這一輪結束才送出 |
| 在邊界引導 | OpenAI Codex（`turn/steer`）、Cursor（Cmd/Ctrl+Enter「現在引導」）、Claude Code 互動介面 | 不中斷這一輪，在下一個「邊界」（下一次工具呼叫的結果送回模型時）併進輸入 |
| 中斷再接續 | Claude Code（新版「立刻送出」鍵）、Cursor 的「停止並送出」、Claude 的程式介面（只有 `interrupt` 再重送） | 中止目前的生成，保留已輸出的，加上新訊息再繼續 |

細節：

* Codex app-server 的 `turn/steer`：參數 `threadId`、`input`、`expectedTurnId`（要等於目前這輪的 ID，否則失敗），回傳 turn ID；審查與壓縮的輪不能引導（`activeTurnNotSteerable`）；沒有進行中的輪時失敗。實作者的慣例：有輪就 `turn/steer`，沒有或 ID 對不上（競態）就改 `turn/start`。官方文件標示 app-server 為實驗性。來源：developers.openai.com/codex/app-server、github.com/tiann/hapi/issues/888。
* Claude Agent SDK 的串流輸入模式支援排隊訊息與中斷（code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode）；stream-json 沒有不中斷的引導，只能中斷再重送（hapi 的測試）。
* Cursor：排隊與「現在引導」兩種，另有設定可改成「停止並送出」（cursor.com/docs/agent/tools、forum.cursor.com）。
* ChatGPT 的「Update」（長時間的 GPT-5 Pro、深度研究）：只看到新聞報導（TechRadar），沒看到 OpenAI 自己的文件，細節未確認。
* Gemini 深度研究：只能在開始前來回修改計畫，執行中沒找到補充方式。
* 研究：Berkeley 的〈Are Large Reasoning Models Interruptible?〉（arXiv 2510.11713）測出，越晚補充新資訊，表現下降最多 60%，模型還會懷疑自己。所以「中斷推理」不是免費的。

## 3. Noureon 現況（讀程式確認的）

* 回覆進行中，送出鈕變成**停止鈕**（`settings-auth-provider-lifecycle.js` 的 `updateSubmitButtonState`），輸入欄不能送新訊息。停止會保留已寫的字（`runSkillsReply` 等：停止時保留已輸出的 text），所以現在要「改方向」只能：停止、再打一則新訊息。
* 所有回覆迴圈長得一樣（`runSkillsReply`、`runSandboxReply`、網路研究的迴圈）：`streamApiCall(requestParts, …, { tools, toolTurns })` → 模型回 `toolCalls` → 執行工具 → `toolTurns.push({ assistant, results })` → 再呼叫。**邊界就是 `toolTurns.push` 之後、下一次 `streamApiCall` 之前。**
* `toolTurns` 在各家格式（`applyGeminiTools`、`applyOpenAiTools`、`applyResponsesTools`、`applyAnthropicTools`）轉成請求。**工具結果之後本來就會接一則使用者訊息**（工具秀圖給模型看時，圖片就是這樣放在結果後面的 user 訊息）。所以「在工具結果後接一段使用者文字」每種格式都做得到，不是新機制。
* 沒有工具呼叫的純文字回覆**沒有邊界**（一次生成就結束），只能排隊或中斷。
* 深度研究已經有補充指示：`POST /v1/runs/:id/steer` → `controls.send('steer', { instruction })`，存在 `steering` 清單（最多 20 則、每則 2000 字），之後每一次模型呼叫都帶著（`research.js` 的 `steerText()`）。這是「在邊界引導」的先例。
* 伺服器的回覆在伺服器跑，頁面可能關掉；頁面透過 `runs.control` 找到本機的執行（`active` 表）。多個分頁看同一個回覆（直播通道）。

## 4. 三種模式在 Noureon 的樣子

### A. 排隊（只改頁面，沒有 contract）

回覆進行中輸入欄可以打字，送出的訊息放進「待送出」，回覆結束時自動送出。沒有伺服器改動。要處理：待送出的顯示與取消、回覆被停止或失敗時怎麼辦（建議：不自動送出，留在輸入欄）、重新整理頁面時是否保留（建議：存在對話的草稿）。

### B. 在邊界引導（伺服器 + 共用迴圈，有 contract）

* 伺服器：`POST /v1/runs/:id/steer` 目前只給深度研究，擴充給一般回覆：body `{ text }`（沿用 `instruction` 也可）；`runs.control` 對一般回覆找不到 `controls` 時，改放進這則回覆的 `steerQueue`（最多 20 則、每則 2000 字，同深度研究）。
* 迴圈：每次 `toolTurns.push` 之後，取走 `steerQueue` 裡的文字，放進這一輪的 `turn.steer`（一個新欄位）；四種 `apply*Tools` 在結果之後接一則使用者文字（`The user added this while you were working: …`，與工具結果分開，不混進結果）。迴圈在沒有工具呼叫要結束之前，也檢查一次：有待處理的引導，就再多跑一輪（模型看到引導再回答），而不是丟掉。
* 競態：引導在最後一個邊界之後才到（回覆已經在結束）→ 伺服器回 `{ ok: false, reason: 'late' }`，頁面把它改成「排隊」（A）。沒有進行中的回覆 → `not_running`，同樣改成一般送出。
* 顯示：引導訊息在這則回覆裡以一個小標記顯示（「你補充了：……」），放在它被模型看到的位置；也寫進直播事件（`{ type: 'steer', text }`），其他分頁看得到。**不另存成一則獨立的使用者訊息**，避免訊息順序倒置（我還沒讀訊息序號的寫入程式去確認，但伺服器的回覆列是回覆開始就存在，之後才寫的使用者訊息很可能排在回覆後面，顯示的順序就和模型看到的順序相反；實作 P2 前要先確認）。存在回覆的 `metadata.steers`，之後的對話歷史把它轉成回覆開頭的一段文字，讓模型下一輪知道發生過。
* 支援範圍：普通、搜尋、進階三種回覆；一般模型回覆的瀏覽器本機版（共用迴圈，頁面直接 push 進 `steerQueue`）。**不支援**：理事會（多個模型，不知道該引導誰）、圖片生成（一次呼叫）、看圖檢查。

### C. 中斷再接續（頁面為主）

「立刻送出」＝停止目前的回覆（保留已輸出的字）＋把新訊息當一般訊息送出，上一則回覆留在對話裡，標示為「被打斷」。現在使用者手動就能做到，這個模式只是一個按鈕。沒有伺服器改動。代價：目前這一步的工具工作被丟掉；推理模型的思考被丟掉（論文：越晚補充越差）。

## 5. 建議

**先做 A + B，C 當作一個按鈕附上。**

* A 沒有風險，B 利用現成的迴圈和先例，改動集中在三個地方：共用迴圈的邊界、`tool-call-formats` / `anthropic-messages-format` 的 `turn.steer`、伺服器的 `/steer` 與 `steerQueue`。
* 一次只做到可以試的階段：**P1 = A（頁面）**、**P2 = B（伺服器 + 迴圈 + 顯示）**、**P3 = C 按鈕**。每階段跑完整檢查、推 `staging`，Allen 試過再做下一階段。

## 6. 風險與限制

* 純文字回覆沒有邊界，B 對它不會立刻生效，會等於排隊；要讓使用者知道（按鈕上說明：「模型下一次使用工具後會看到」）。
* 「模型看到引導」不等於「模型照做」：推理模型在長推理之後才收到引導，效果可能打折（論文）。提示詞要明說「使用者在你工作時補充了這些，從現在起照著做」（深度研究已有類似文字）。
* 引導內容是使用者的話，不是第三方資料，所以不放進「不可信資料」區塊，也不能影響工具權限（權限仍是使用者的設定）。
* 訊息格式：`/steer` 的 body、直播事件 `steer`、`metadata.steers` 是新增，舊頁面看不懂會忽略；舊伺服器對 `/steer` 一般回覆回 `not_running` 或 `not_found`，頁面退回排隊。**這屬於 `contract`，要先在 Linear 寫相容說明，Allen 確認。**
* 隱私：沒有新的資料流（引導文字跟一般訊息一樣只送到使用者選的模型供應商）；隱私與協助文件加一句說明，五語。

## 7. 要 Allen 決定的

1. 做哪幾個：只 A？A + B（建議）？A + B + C？
2. **輸入欄長什麼樣**（畫面要 Allen 決定，我不自己定）：
   * 回覆進行中輸入欄照常可打字；Enter 預設做哪一個：**排隊**（像 Claude Code、Cursor）或**引導**（像 Codex）？另一個用什麼鍵或按鈕？
   * 送出鈕在回覆中現在是停止鈕：改成「停止」「送出」兩個鈕，還是長按／選單？
   * 小標記的位置：回覆裡的哪一格（工具步驟列旁邊？）。
3. 預設值與設定：要不要在設定裡讓使用者選 Enter 的預設行為？
4. 手機：回覆中輸入欄變可用，鍵盤與停止鈕的位置要不要調整（之前鍵盤抖動的歷史，這部分要小心）。

## 8. 先不做

理事會的引導、圖片生成的引導、回覆結束後的「重新生成並帶上補充」、引導的附件（先只有文字）。

## 9. 決定（Allen，2026-10-26）與實作計畫

Linear：NOU-138（相容說明 `contract` 在工單裡）。

1. **A、B、C 都做**（沒有工具呼叫的對話只能靠 A 與 C）。
2. **預設是引導，設定可改。** 回覆進行中：輸入框有文字（或附件、引用）時，按鈕是「傳送」；沒有時是「中斷」（現在的停止鈕）。
3. 設定裡有一個選項：回覆中按傳送時做什麼，**引導**（預設）／**排隊**／**立刻送出**（欄位 `replyInputMode`：`steer`｜`queue`｜`send-now`）。
4. 手機的鍵盤與按鈕位置不另外調整。
5. **沒有邊界的回覆（沒有呼叫工具）：「引導」的退路是立刻送出（C）**：中止、保留已寫的字、帶著新訊息繼續。畫面用一行小字說明這次怎麼處理的。設定選「排隊」或「立刻送出」時，一律照那個做，不分有沒有工具。
6. 引導訊息不另存成獨立訊息（訊息順序會倒過來；回覆的列從回覆開始就有固定位置，`message-writer.js`），存在回覆的 `metadata.steers`，顯示成回覆裡的標記。

### 頁面現況（為 P1 讀的）

* `composer-input-bindings.js`：送出鈕 click 在回覆中就是 `getAbortController().abort()`；Enter 在回覆中走 `submitChatForm()`，被 `prepareSubmitResponse` 的 `already-generating` 擋掉，什麼都不發生。輸入框在回覆中本來就可以打字（只有沒有 API 金鑰時才停用）。
* `settings-update-input-state-helper.js` 的 `updateInputState`：回覆中固定顯示停止圖示，所以要改成「有內容 → 傳送圖示」。
* `runSubmitFinalCleanupLifecycle`（回覆結束的清理）是排隊訊息送出的時機。
* 設定放在「隱私」那一頁以外的地方不合適；要選一個放「回覆中的傳送方式」的位置（P1 的 UI 預覽時請 Allen 決定）。

### 階段

* **P1 頁面**：新模組 `reply-steering.js`（回覆中的傳送行為、排隊、立刻送出；引導在 P2 之前先走立刻送出）、設定欄位與選項、五語文字、按鈕圖示切換、排隊的顯示與取消、測試。
* **P2 伺服器與共用迴圈**：`/steer` 擴充、`steerQueue`、`turn.steer`、四種格式、顯示與 `metadata.steers`。
* **P3 收尾**：隱私與協助文件（五語）、更新紀錄（Allen 發版時寫）。

## 10. P2 實作紀錄（2026-10-26）

* **共用佇列** `src/app/runtime/reply/steer-queue.js`（頁面與伺服器共用，已列入 `scripts/server-shared-modules.json`）：`createSteerQueue({ onTaken })`，`push`／`take`／`taken`／`left`，`support()` 表示「有邊界的迴圈正在跑」。三個迴圈（`runSkillsReply`、`runSandboxReply`、`runWebResearchReply`）在 `toolTurns.push` 時取走，四種格式（Gemini、OpenAI 聊天、Responses、Anthropic）把一則使用者訊息接在工具結果後面（`steerNote`）。
* **伺服器** `server/runs.js`：一般回覆（不含議會、圖片、看圖檢查、深度研究）建立佇列；`POST /v1/runs/:id/steer` 走 `control()`，沒有邊界的回覆回 `409 wrong_phase`（頁面據此退到立刻送出）、空白 `400`、超過 20 則 `400`。取走時送即時事件 `{ st: { text, at } }`（晚加入的頁面在快照的 `r.st` 拿到）；取走的存在回覆的執行紀錄 `steers: [{ text }]`（跟處理步驟一起存，重新載入還在），沒被取走的存在訊息 `metadata.steersLeft`。**與 §9-6 的差別**：取走的不放 `metadata.steers`，而放執行紀錄，因為已存檔的處理列本來就由執行紀錄畫。
* **頁面** `features/reply-steering.js`：「引導」模式下只有純文字（沒有附件、引用）才放進回覆——伺服器回覆打 `/steer`，本機回覆放進本機佇列（`createLocalReply().steer`）；被拒、沒有邊界、有附件或打不通時退回立刻送出。成功後輸入框清空；（2026-10-26 Allen 試過後改了）補充的訊息畫成跟一般使用者訊息一樣的泡泡（`ui/sandbox/steer-bubbles.js`），放在回覆那一則訊息裡、回覆氣泡的上方，不放進處理列（處理列收合後會看不到，重新接上時位置也會跑掉）；送出當下就出現（模型看到之前略淡），模型看到後恢復；其他分頁與重新接上的頁面在模型看到時才出現。已存檔的回覆由執行紀錄的 `steers` 在 `message-markup-renderer.js` 畫出同樣的泡泡；給之後輪次的歷史摘要加一行「While this reply was being made the user added: …」。
* **沒被取走的引導**：回覆結束時（`hold`）若輸入框是空的而且回覆不是被使用者中斷的，就自動當下一則訊息送出；輸入框有內容時放到內容前面，被中斷時放回輸入框（不送）。
* **已知取捨**：迴圈有在跑但模型最後不再呼叫工具時，引導會留到回覆結束才送出（等同「排隊」），不會中斷回覆。

## 11. 補充的訊息是真的訊息：回覆在邊界切段（2026-10-26，Allen 看過 ChatGPT 的做法後決定）

**決定（Allen）**：補充的訊息不放在回覆裡面，是跟一般使用者訊息一樣的訊息（可以編輯），排在它發生的位置；回覆被它切成一段一段，每一段是一則普通的回覆訊息、有自己的處理紀錄。重整、換裝置後看到的跟進行中一樣。編輯機制不動；沒有工具的回覆和本機產生的回覆不能引導，照舊退回立刻送出。這一節取代 §10 中「執行紀錄的 `steers`、泡泡放在回覆上方」的做法（已拿掉）。

**流程（伺服器回覆）**
1. 使用者在回覆中按傳送（引導）：頁面產生訊息 id，`POST /v1/runs/:id/steer { instruction, id }`；成功後頁面在回覆下方畫一個半透明的泡泡（`ui/sandbox/steer-bubbles.js`，只是待處理，不是訊息）。
2. 迴圈在下一個工具邊界取走（`steer.take(context)`，`context.steps` 是 Python 到目前為止的步驟），佇列的 `batchHandler` 通知執行器 `executor.js` 的切段處理：把這一段的紀錄（`segment: true`、這一段的搜尋／思考／連接器／步驟與步驟做出的檔案）做成一則訊息的內容，並把狀態歸零（答案、思考、連接器、圖片、計時、`stepBase`）；搜尋到的網頁累積保留（答案的 [n] 要用）。
3. `runs.js` 的 `cut`：換掉寫入器；舊訊息收尾（`status: complete`，`metadata.segment = { next, sequence, users: [{ id, text, sequence }] }`）；伺服器用 `server_upsert_workspace_message` 寫使用者的訊息（`role: 'user'`、`metadata: { steer: true }`、序號接在後面）；`server_runs.message_id` 改成新訊息（這樣重新載入後找得到）；最後廣播 `{ seg }` 事件。新訊息的寫入要等切段完成。切段到 `seg` 之間，即時事件只記在鏡像、不廣播（`live.holding`）。
4. 頁面：`follow()` 讀到 `seg`（或讀到訊息的 `metadata.segment`）就把這一則收尾，結果帶著 `cut`；`completePreparedReply` 照常存下這一則，然後 `reply-cut.js` 把使用者的訊息變成對話的訊息（已經有的不重複），再用 `reattach.js` 的 `followRun` 跟著同一個 run 在新訊息裡接著寫（同一個 AbortController，停止鈕不變；中間不做清理）。還沒被取走的泡泡移到新訊息下面。
5. 沒被取走的補充（模型最後沒再用工具）照舊：存在最後那則訊息的 `metadata.steersLeft`，結束時變成下一則訊息。

**給模型的歷史**：`stream-api-call.js` 的 `mergeAdjacentModelMessages` 現在會略過沒有內容的回覆訊息（只有處理列的那種），並把標了 `metadata.steer` 的使用者訊息併進它前面的使用者訊息。`steer` 在雲端同步的 metadata 白名單裡。

**限制與取捨**
* 只有伺服器回覆能引導；伺服器重啟後接手的 run 若已切過段，金鑰的訊息 id 對不上，會以「伺服器重啟」結束（切段前的內容都已存好）。
* 搜尋到的網頁在每一段都是累積的（「搜尋了 N 個網站」會重複算前面的）；Python 的步驟與檔案則依段分開。
* 回覆訊息的底部動作列（複製等）每一段都有；只有處理列的那一段複製出來是空的。
* 沒有新的資料庫遷移：用既有的 `server_runs.message_id` 更新和 `server_upsert_workspace_message` 的 `role`、`sequence` 參數。

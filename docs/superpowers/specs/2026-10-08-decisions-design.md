# 判斷模型（Decisions）設計與實作紀錄（2026-10-08，17.16.0）

## 1. 做什麼

送出訊息時，用 OpenRouter 的 Decisions API（alpha，`POST https://openrouter.ai/api/alpha/decisions`）問一個小判斷模型
`typesafe/jev-1.14`，一次問四件事，取代原本只看關鍵字／正規表示式的猜法：

| 問題 | 取代什麼 | 判斷為「否」時 |
| --- | --- | --- |
| `search` 需要最新資訊嗎 | `shouldAutoEnableWebSearch`（自動上網搜尋） | 不自動開搜尋（網址仍一律開） |
| `file` 要做成檔案嗎 | `mayNeedFileGuidance`（檔案撰寫指引） | 不注入指引（剛做過檔案的追問仍注入） |
| `chart` 要圖表嗎 | 圖表指引的關鍵字 | 不注入圖表指引 |
| `tool` 要命令工具嗎 | 「允許模型自己使用」的工具一律給 | 本輪不給這些工具（用 `@` 選的一律給） |

規則：機率 ≥ 0.6 為「是」（`DECISION_THRESHOLD`）；有判斷就採用，沒有（null）就退回舊的關鍵字清單；沒有開關；
只在有 OpenRouter 金鑰時呼叫；圖片對話不送；逾時 1 秒（`DECISION_TIMEOUT_MS`）；連續失敗 2 次暫停 10 分鐘；失敗一律靜默。

## 2. 檔案

- `src/app/runtime/decisions/decision-client.js`：請求組裝（`buildDecisionRequest`）、回應解析（`parseDecisionResponse`）、`verdictOf`、`createDecisionService`（逾時、斷路器、永不 reject）。
- `src/app/runtime/decisions/decision-store.js`：以訊息文字為鍵暫存最後一次的判斷（10 分鐘），因為指引函式只拿得到文字。
- `src/app/runtime/decisions/decision-request.js`：從設定與對話組出請求（命令工具只列「允許模型自己使用」的）。
- 接線：`legacy-core.js` 建立 `requestDecisions` → `submit-input-council-lifecycle.js`（依賴）→ `submit-input-preparation-lifecycle.js`（送出時先發出請求，在「載入中訊息」顯示後才等結果，所以畫面不會因此空等）。
- 使用處：自動搜尋（準備階段）、`stream-api-call.js` 的圖表與檔案指引、`single-model-response-lifecycle.js` 的檔案判斷與 `cliIdsForReply(..., { ownAllowed })`。

## 3. 隱私

訊息文字（加上前兩則訊息各最多 300 字的節錄、是否附檔、允許模型自己使用的命令工具名稱與簡述）從瀏覽器送到 OpenRouter，
用使用者自己的 OpenRouter 金鑰，Noureon 不保存。已寫入五語 `privacyPolicyDesc` 與 `PRIVACY.md`。

## 4. 還沒驗證的事

- 這個環境連不到 openrouter.ai，**沒有測過真實的 alpha 端點，也沒測過瀏覽器的 CORS**。回應格式依 OpenRouter 文件
  （`answers.<name>.noul` 為機率）。失敗時靜默退回舊行為，所以最壞情況是「沒有任何改變」。
- owner 需用真實 OpenRouter 金鑰測：開瀏覽器網路面板，送一則訊息，看 `alpha/decisions` 是否 200、各題機率是否合理。
- `noul` 的臨界值 0.6 是 owner 的選擇，之後可依實測調整。

## 5. 實測結果（2026-10-15，`scripts/decisions-probe.mjs`，模型 `typesafe/jev-1.14`，owner 用真實金鑰跑）

- 端點可用（HTTP 200，格式與解析相符）；每次約 165 到 220 ms，遠低於 1 秒的逾時。
- CORS：從 `https://noureon.com` 與 `https://staging.noureon.com` 預檢都是 204，`allow-origin=*`，允許 `Authorization`、`Content-Type`。
- 6 則訊息、24 個答案裡有 21 個與預期相符。三個不同：
  - 「寫 3 頁簡報（pptx）」`search=0.77`（主題是 2026 年的市場，自動開搜尋說得通）。
  - 「把三季營收畫成圖表」`file=0.83`（會多注入檔案撰寫指引）。
  - 「把影片下載成 mp3」`file=0.86`（同上，工具的產物是檔案）。
- 樣本很小（6 則）。若實際使用中常看到多餘的檔案指引，可調整 `file` 題的說明（排除「只在對話裡畫圖表」與「只是跑命令工具」），或讓 `file` 用較高的臨界值（例如 0.9）；目前沒有改。

## 6. 新增三題（2026-10-15，owner 選的「網址要不要讀」與「舊對話回憶」）

同一次呼叫多問三題（題目不多一次呼叫；探測腳本 `scripts/decisions-probe.mjs` 已加上這些案例，**待 owner 用真實金鑰實測**）：

| 問題 | 何時問 | 取代什麼 | 判斷為「否」時 |
| --- | --- | --- | --- |
| `url` 要打開網址讀內容嗎 | 訊息裡有 http(s) 網址 | 「有網址就一律讀網頁、一律自動開搜尋」（`provider-request-support.js` 的 `readLinkedPages`、`single-model-response-lifecycle.js`、`submit-input-preparation-lifecycle.js`） | 不讀那個網址、不因網址自動開搜尋（例如只是範例、程式碼裡的網址）；沒有判斷時照舊一律讀 |
| `exact` 要把舊對話的東西照原樣拿回來嗎 | 開了「歷史回憶」 | `history-retrieval-service.js` 的 `EXACT_RECALL_PATTERNS` | 不走「原樣回憶」路徑（走一般語意回憶） |
| `verbatim` 要逐字原文嗎 | 開了「歷史回憶」 | `VERBATIM_RECALL_PATTERNS` | 回憶模式為 `faithful-rewrite`（可改寫），否則 `verbatim` |

`exact`、`verbatim` 兩題都有答案才採用判斷（`verbatim` 為是時一定算原樣回憶）；只有一題有答案或沒有答案就用原本的關鍵字。「原樣回憶」的主題（subject）仍由原本的正規式抽取，抽不到時走既有的空主題路徑。

限制：判斷存在瀏覽器（`decision-store.js`），伺服器端繼續執行（關掉頁面）的回覆讀不到，會照舊（網址一律讀）。

## 7. 圖片對話的口語判斷（2026-10-17，NOU-48）

圖片對話原本不送判斷；現在另送一組只給圖片請求的題目（`src/app/runtime/decisions/image-decisions.js`），用來聽懂「給我兩張 9:16 草原」「一張 9:16 的拼貼圖」。

- 探測（`scripts/decisions-image-probe.mjs`，owner 用真金鑰跑）：API 的題型有 `noul`（機率）、`choice`（要 `criteria`）、`score`、`box`；沒有數字題，所以張數用「剛好 N 張嗎」（N=2 到 10）加「明說一張」「拼貼」；是非題 14 句、五種語言 39／40 符合預期，每次 140 到 240 毫秒。
- 題目：`collage`、`single`、`exactly_2`…`exactly_10`、`more_than_limit`（限制寫在題目與 state 裡）、`ratio_stated`、`portrait`、`landscape`、`square`。比例若寫成數字（9:16、9：16、9比16）由程式讀，但只有 `ratio_stated` 為是才採用（避免「比分 2:1」「3:30 開會」）。
- 規則（`legacy-runtime/features/image-spoken-request.js`）：口語只管這一則，不改存的設定；拼貼＝張數 1，提示詞加一句要求單張拼貼；沒說張數就用設定的數字；超出模型上限（張數、不支援的比例、參考圖張數）**不送出請求**並提示（五語言，`imageCountOverLimit` 等），不再自動改成最接近的比例或截斷參考圖；判斷沒回應（沒金鑰、逾時、暫停中）就照設定送出。
- 判斷與翻譯同時進行，不增加等待；生成中的佔位框與縮圖佔位格會依說出的比例與張數更新。
- 隱私：圖片提示詞、模型的張數與參考圖上限、附了幾張參考圖（不含圖片本身）送到 Decisions API；五語言隱私政策與 PRIVACY.md 已改。
- 待 owner 驗證：重跑 `decisions-image-probe.mjs`（現在跑的是頁面真正用的題目與讀法），看「Sentences read as expected」。

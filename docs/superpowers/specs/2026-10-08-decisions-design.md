# 判斷模型（Decisions）設計與實作紀錄（2026-10-08，17.16.0）

## 1. 做什麼

送出訊息時，用 OpenRouter 的 Decisions API（alpha，`POST https://openrouter.ai/api/alpha/decisions`）問一個小判斷模型
`openai/gpt-6-luna-decisions`，一次問四件事，取代原本只看關鍵字／正規表示式的猜法：

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

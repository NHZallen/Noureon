# 伺服器替對話命名（頁面來不及命名時的保險）

狀態：做完，在 `staging`（Allen 2026-11-13 要求「搬到伺服器」，免確認直接做）。

## 問題

新對話的標題由頁面在送出第一則訊息的那一刻自己命名（`submit-input-preparation-lifecycle.js` → `generateTitleAndSummary`，現在用使用者選的模型，見 `shell/current-model-json.js`）。回覆在伺服器上進行時，使用者可能在那幾秒內關掉分頁或鎖屏，命名就沒做完，標題一直停在預設名稱，之後也不會補（只有「第一次送出」會命名）。

## 決定

做成「保險」，不是取代頁面命名：

- 頁面照舊自己命名。伺服器接下回覆之後，頁面再多送一個請求 `POST /v1/runs/:id/naming { prompt, placeholder }`（只在這個對話還在命名中、命名開著、不是視覺檢查時送；伺服器比較舊就 404，頁面不理會）。`prompt` 是頁面用同一個 `buildTitleSummaryPrompt` 做好的，伺服器不重做提示詞，也不需要讀對話。
- 伺服器（`server/conversation-naming.js`，在 `runs.js` 的 `run()` 裡每個單一模型回覆與深度研究各做一個）收到後等 30 秒，或回覆先結束就立刻做：先問資料庫這個對話的標題（`server_conversation_title_state`）。標題已經不是 `placeholder`、被使用者改過名、或對話已刪除，就什麼都不做（連模型都不問，所以頁面正常命名時沒有額外費用）。
- 還是 `placeholder` 才用這則回覆的模型與金鑰（這個回覆本來就握著，不多保存任何東西）問一個標題，用 `server_set_conversation_title` 寫回，函式內以原子方式比對：只在標題還是 `placeholder`、沒被改名、沒刪除時才改，所以頁面或使用者後來寫的標題絕不會被蓋掉。寫入走 `sync_seq`，其他頁面照一般同步收到。

## 範圍與限制

- 只有單一模型的回覆與深度研究。圖片（模型畫圖，不寫標題）、議會（成員各有金鑰）、視覺檢查不做，這些仍只有頁面命名。
- 送出之前就被殺掉的頁面仍然沒命名：請求是在伺服器接下回覆之後才送，窗口從「幾秒」縮到「幾百毫秒」。
- 金鑰只存在記憶體裡（隨回覆），沒有新增保存；提示詞最長 6000 字元、標題最長 120 字元；請求不帶任何金鑰。

## 契約（要記在 Linear 的 contract 單）

- 新路由 `POST /v1/runs/:id/naming`（回 202；run 不存在或不是該使用者的 404；請求格式不對 400）。
- 新資料庫函式（只給 service_role）：`server_conversation_title_state(p_user_id, p_conversation_id) → jsonb`、`server_set_conversation_title(p_user_id, p_conversation_id, p_placeholder, p_title) → boolean`，migration `20261113100000_server_conversation_title.sql`（Allen 先套測試專案，再套正式專案）。
- `scripts/server-shared-modules.json` 新增 `src/app/runtime/shell/current-model-json.js`（無瀏覽器依賴、無 import）。
- 隱私政策五語與 `PRIVACY.md` 加了一條「替對話命名」。

## 測試

`tests/server/server-conversation-naming.test.js`（等待、略過、立即命名、格式、失敗、日誌無金鑰）、`server-runs.test.js`（只有本人、一次、回覆結束時做）、`server-app.test.js`（路由）、`server-reply.test.js`（頁面何時送）、`tests/database/migrations.test.js`（真實 SQL：只改 placeholder、不改被改名或刪除的、不給人呼叫、`sync_seq` 前進）。

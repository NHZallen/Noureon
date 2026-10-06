# 圖片生成搬到伺服器（關掉頁面也會畫完）

**日期：** 2026-10-06
**狀態：** 討論完成，owner 已決定 §2 的事項；**尚未寫任何程式**，下一步是 §6 的 P0 小實驗，要 owner 說開始才做。
**前置閱讀：** [`AGENTS.md`](../../../AGENTS.md)、[伺服器執行設計](2026-10-03-server-runtime-design.md)（RunSpec、金鑰暫存、接續、§5 訊息寫入）、[交接文件](../plans/2026-10-04-session-handoff.md)。

## 1. 為什麼要做

圖片生成現在完全在瀏覽器裡做：`submit-input-council-lifecycle.js` 判斷是圖片模型後，交給 `image-generation-response-lifecycle.js`，由瀏覽器用使用者的 OpenRouter 金鑰直接呼叫 `https://openrouter.ai/api/v1/images`（`openrouter-image-generation.js`，`legacy-core.js` 注入瀏覽器的 `fetch`）。生圖途中關頁面、手機鎖屏、網頁被系統暫停，這張圖就可能中斷；文字回覆已經有「伺服器回覆」（17.5.0），圖片沒有。

## 2. owner 的決定（2026-10-06）

1. **雲端空間不為圖片設限（選項 A）。** 伺服器寫的圖不受 500MB 檢查，和現在客戶端同步上傳的圖一致（客戶端同步本來就沒檢查額度，只有伺服器存檔會檢查）。**不新做**「刪最久沒用的檔案」：程式裡沒有這個機制（唯一的自動清理是 `asset-sweeper.js`，只清「沒有任何訊息在用」的孤兒檔，每天一次，而且預設只回報、要環境變數 `ASSET_SWEEP=delete` 才真的刪）；刪還在被舊對話引用的圖，會讓沒有本機副本的裝置看到圖片消失。
2. **請求上限維持 25MB。** 客戶端組好請求後若超過（沿用 `server-reply.js` 的 `MAX_REQUEST_CHARS` 20M 字元），就退回本機生成（既有的 `LOCAL_REASONS.tooLarge`），不另外調高。
3. **重啟可能重複收費：不特別處理，** 與文字回覆同一種情況，只在更新紀錄與隱私說明各寫一句。
4. **本機與伺服器都不要預覽圖。** 這會**改掉現在本機的行為**：GPT 模型（`supportsImageStreaming`，且沒附參考圖時）現在會逐步顯示預覽，之後只顯示既有的「生成中」骨架，完成才出現整張圖。要移除的是 `image-generation-response-lifecycle.js` 的 `onPartial`、`openrouter-image-generation.js` 的串流解析（`consumeImageStream`、`stream` 欄位）、模型登錄的 `supportsImageStreaming`。
5. **沿用既有的「回覆在伺服器或這個裝置上產生」選項**（`config.replyRunLocation`）。選本機就走現在的瀏覽器做法；伺服器連不上、協定不符（426）、沒有雲端帳號、暫時對話、請求太大，都退回本機（`planServerReply` 的既有規則，圖片版比照）。

## 3. 現成可用的零件（讀程式確認過）

- `server/run-spec.js`：RunSpec 的驗證，已有 `kind`（`research`、`vision`）可以再加一種。
- `server/runs.js`、`server/executor.js`：建立執行、金鑰信封加密暫存、停止（AbortController）、優雅關機與重啟接續（`maxResumes: 3`）、額度（`maxRunsPerUser: 5`、每分鐘 10 次）。
- `server/message-writer.js`：以同一個訊息 ID 寫回（`server_upsert_workspace_message`），其他裝置透過既有的同步即時看到。
- `server/file-store.js`：把檔案存進使用者自己的雲端空間（`user-assets/<使用者>/<SHA-256>`），回傳標記；客戶端 `cloud-assets.js` 的 `hydrate` 看到訊息裡的 `generatedImage.cloudAsset` 加 `storageKey`，會把圖下載回本機並存進 `storageKey`。
- `src/app/legacy-runtime/features/openrouter-image-generation.js`：不碰 DOM，`fetchImpl` 可注入，伺服器可以直接重用同一份呼叫與錯誤處理。
- 客戶端 `src/app/runtime/server-reply/`：`planServerReply`、`createServerReply`（`flushSync`、`hydrateParts`、`externalizeParts`、`findLiveRun`）、`reattach.js`（重新開頁時接回進行中的執行）。

## 4. 設計

**任務類型。** RunSpec 加 `kind: 'image'`，與 `research` 一樣有自己的欄位與驗證：

```jsonc
{
  "protocol": 1, "kind": "image",
  "clientVersion": "...", "conversationId": "<uuid>", "assistantMessageId": "<uuid>", "sequence": 12,
  "model": { "provider": "openrouter", "id": "...", "info": { /* 模型登錄的必要欄位 */ } },
  "image": {
    "prompt": "...",                         // 客戶端組好的最終提示詞（含標註編輯的補充說明）
    "config": { "aspectRatio": "16:9", "resolution": "2K" /* + 進階設定：n、quality、outputFormat、background、outputCompression、seed、provider */ },
    "references": [ "data:image/png;base64,..." ]   // 參考圖；沒附圖時帶上一張生成圖（現有行為）
  },
  "secrets": { "providerKey": "<OpenRouter 金鑰>" }
}
```

其他 RunSpec 欄位（`request.history` 等）對圖片不需要，驗證時 `kind: 'image'` 不要求它們。

**伺服器流程。**
1. 驗證登入與對話歸屬、檢查上限，金鑰信封加密暫存（沿用 §6）。
2. 先以 `status: 'streaming'` 寫一筆沒有圖片的訊息，讓其他裝置看到「生成中」。
3. 呼叫 OpenRouter（`createOpenRouterImageGenerator`，不串流）。
4. 每張圖用 `file-store.save` 存進使用者的雲端空間（**這次要用 `encoding: 'blob'` 的標記，且不做 500MB 檢查**），訊息寫成 `generatedImage: { id, storageKey, mediaType, size, aspectRatio, cloudAsset }`（與客戶端同步寫出的格式一樣）。
5. 寫 `complete`；失敗寫 `error`（沿用錯誤碼 `provider_error`、`time_limit`、`server_restarted`、`stopped` 等）。
6. 結束時刪除暫存金鑰。

**停止。** 沿用 `/v1/runs/:id/stop`：中止傳給對 OpenRouter 的請求。OpenRouter 可能仍然計費，與文字回覆相同。

**重啟。** 沒有檢查點可存（只有一次呼叫）：接續時重送請求，可能重複收費（見 §2-3）。

**客戶端。**
- `submit-input-council-lifecycle.js` 的圖片分支（`modelGeneratesImages` 為真時）改成先問「伺服器還是本機」（圖片版的 `planServerReply`），伺服器就送出 `kind: 'image'` 並跟著執行（既有的 `createServerReply` 流程），結果訊息經 `hydrateParts` 把圖下載回本機；不行就走原來的瀏覽器生成。
- 送出前先 `flushSync`（已有），確保對話已在雲端。
- 重新開啟頁面時，`reattach.js` 接回進行中的圖片執行。

**文字與說明（五語言）。** 隱私分頁（`server-reply-texts.js`）加：圖片的提示詞與參考圖會經過 Noureon 伺服器、金鑰加密暫存、結果存進你的雲端空間；伺服器重啟時可能重複計費一次。更新紀錄用白話寫。

## 5. 風險與要注意的

- **記憶體：** 伺服器要同時收 OpenRouter 回傳的 base64 圖（4K、一次最多 4 張，可能上百 MB）。`maxRunsPerUser: 5` 對圖片可能太高；P1 要量測，必要時給圖片任務一個較低的同時上限。
- **雲端空間會持續增長：** 沒有額度上限，也沒有「刪最久沒用」。建議到 Zeabur 確認 `ASSET_SWEEP` 的設定（`report` 或 `delete`），並日後再決定要不要做空間管理。
- **逾時：** 圖片一次呼叫，4K 可能要一兩分鐘。建議給圖片任務一個專用逾時（提議 10 分鐘，實測後調整），不用文字回覆的 2 小時。
- **單檔大小：** 4K PNG 一張可能數十 MB，要確認 `user-assets` 儲存桶的單檔上限（沙盒檔案有 50MB 的限制，不確定圖片是否共用）。
- **參考圖上限：** 各模型不同（Nano Banana 14、FLUX.3 10、GPT Image 16，來源是搜尋摘要，官方頁面讀不到）。本設計不處理；超過時由上游回錯誤（owner 已決定不做這個提示，2026-10-06）。

## 6. 階段（一次只做一個，每階段完成後回報，由 owner 決定是否推 `main`）

**P0 小實驗（不改產品行為）。** 確認三個沒有親眼驗證的假設，不通就先改設計：
1. 伺服器寫入的 `generatedImage.cloudAsset`（`encoding: 'blob'`、路徑格式、`storageKey` 命名 `generatedImage:supabase:<使用者>:<id>`）能被另一台裝置與同一台裝置的 `hydrate` 還原並顯示。
2. 一筆 `streaming` 狀態、還沒有圖的訊息，客戶端會畫成「生成中」骨架（而不是空白或壞掉）。
3. `reattach.js` 能接回圖片執行。

**P1 伺服器。** `kind: 'image'` 的驗證與執行、不檢查額度的 `file-store` 存圖、圖片專用的逾時與同時上限、假的 OpenRouter 做的測試（成功、失敗、停止、重啟接續、金鑰刪除、多張圖）。

**P2 客戶端。** 圖片版 `planServerReply`、組 RunSpec、交給伺服器並跟著、退回本機、移除本機預覽（§2-4）、五語言文字、隱私說明、測試。

**P3 文件、版本與發布。** 更新紀錄（白話）、版本（owner 決定）、交接文件；是否推 `main` 由 owner 決定。

## 7. 尚待 owner 決定

- 圖片任務的逾時（提議 10 分鐘）與每人同時上限（P1 量測後提議）。
- 版本號（這是新功能，提議 17.9.0，需要打標籤）。
- 是否現在就開始 P0。

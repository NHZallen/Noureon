# 圖片生成搬到伺服器（關掉頁面也會畫完）

**日期：** 2026-10-06
**狀態：** 討論完成，owner 已決定 §2 的事項（逾時 10 分鐘、版本 17.9.0 也已同意，2026-10-06）；**P0 小實驗已完成（§8）；P1 伺服器端已完成（§9），客戶端（P2）還沒做，所以網站上的行為完全沒變**；下一步是 P2，要 owner 說開始才做。另外 owner 已決定（2026-10-07）：圖片生成先做、「先搜一包」用完整做法（伺服器自己搜）排第二、多模型會議最後（需另寫設計）。
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
- 重新開啟頁面時，`reattach.js` 要**新增一個圖片的分支**接回進行中的圖片執行（P0 實驗 3 證明現有程式不會自己處理，見 §8）。

**文字與說明（五語言）。** 隱私分頁（`server-reply-texts.js`）加：圖片的提示詞與參考圖會經過 Noureon 伺服器、金鑰加密暫存、結果存進你的雲端空間；伺服器重啟時可能重複計費一次。更新紀錄用白話寫。

## 5. 風險與要注意的

- **記憶體：** 伺服器要同時收 OpenRouter 回傳的 base64 圖（4K、一次最多 4 張，可能上百 MB）。`maxRunsPerUser: 5` 對圖片可能太高；P1 要量測，必要時給圖片任務一個較低的同時上限。
- **雲端空間會持續增長：** 沒有額度上限，也沒有「刪最久沒用」。建議到 Zeabur 確認 `ASSET_SWEEP` 的設定（`report` 或 `delete`），並日後再決定要不要做空間管理。
- **逾時：** 圖片一次呼叫，4K 可能要一兩分鐘。建議給圖片任務一個專用逾時（提議 10 分鐘，實測後調整），不用文字回覆的 2 小時。
- **單檔大小：** 4K PNG 一張可能數十 MB，要確認 `user-assets` 儲存桶的單檔上限（沙盒檔案有 50MB 的限制，不確定圖片是否共用）。
- **參考圖上限：** 各模型不同（Nano Banana 14、FLUX.3 10、GPT Image 16，來源是搜尋摘要，官方頁面讀不到）。本設計不處理；超過時由上游回錯誤（owner 已決定不做這個提示，2026-10-06）。

## 6. 階段（一次只做一個，每階段完成後回報，由 owner 決定是否推 `main`）

**P0 小實驗（不改產品行為）— 已完成，結果見 §8。** 確認三個沒有親眼驗證的假設，不通就先改設計：
1. 伺服器寫入的 `generatedImage.cloudAsset`（`encoding: 'blob'`、路徑格式、`storageKey` 命名 `generatedImage:supabase:<使用者>:<id>`）能被另一台裝置與同一台裝置的 `hydrate` 還原並顯示。
2. 一筆 `streaming` 狀態、還沒有圖的訊息，客戶端會畫成「生成中」骨架（而不是空白或壞掉）。
3. `reattach.js` 能接回圖片執行。（結果：不能，需要新分支。）

**P1 伺服器。** `kind: 'image'` 的驗證與執行、不檢查額度的 `file-store` 存圖、圖片專用的逾時與同時上限、假的 OpenRouter 做的測試（成功、失敗、停止、重啟接續、金鑰刪除、多張圖）。

**P2 客戶端。** 圖片版 `planServerReply`、組 RunSpec、交給伺服器並跟著、退回本機、移除本機預覽（§2-4）、五語言文字、隱私說明、測試。

**P3 文件、版本與發布。** 更新紀錄（白話）、版本（owner 決定）、交接文件；是否推 `main` 由 owner 決定。

## 7. 尚待 owner 決定

- 每人同時上限（P1 量測後提議）。
- 是否現在就開始 P1。
- 已決定：逾時 10 分鐘、版本 17.9.0（新功能，依規定要打標籤 `v17.9.0`）。

## 8. P0 結果（2026-10-06）

實驗腳本沒有放進專案（在工作暫存區）；它們用的是**真的**程式模組（伺服器的 `file-store.js`、客戶端的 `cloud-assets.js`、同步編解碼 `cloud-sync-v2-codecs.js`、訊息渲染 `message-markup-renderer.js`、`reattach.js`），只有網路與資料庫是假的。P1／P2 要把它們改寫成正式測試。

**實驗 1：伺服器存的圖，客戶端能還原 — 通過。**
- 伺服器用 `file-store.save` 存圖，得到的路徑 `<使用者>/<SHA-256>` 與客戶端自己同步同一張圖時的路徑**完全相同**（內容定址）。
- 把標記放進 `generatedImage.cloudAsset`，在一台什麼都沒有的裝置上跑客戶端的 `hydrate`：圖被下載並存到 `storageKey`、位元組逐一相同、型別正確、`cloudAsset` 欄位被移除。
- `file-store.save` 目前回傳的標記是 `encoding: 'base64'`，客戶端自己寫 generatedImage 用的是 `'blob'`。兩種都能還原（這條路徑直接存下載到的 blob），但為了和客戶端一致，P1 要讓伺服器存圖時用 `'blob'`。
- `storageKey` 用客戶端同步慣用的 `generatedImage:supabase:<使用者>:<圖片 id>`。

**實驗 2：「生成中」的顯示 — 通過，而且不用發明新東西。**
- 訊息裡本來就有一種佔位的 part：`{ imageGenerationLoading: true, imageAspectRatio: '16:9' }`，提交圖片對話時瀏覽器就是這樣畫出「正在建立圖像」骨架（`submit-input-preparation-lifecycle.js`，已有測試）。
- 伺服器第一次寫入就寫這個 part；經過真的同步編解碼後，另一台裝置收到一模一樣的 part 並畫成對應比例的骨架。最後寫 `generatedImage` 就變成圖片卡片，骨架消失；失敗寫 `error` 加文字 part，骨架也消失。
- 要注意：別台裝置收到的 `streaming` 會被當成 `complete`（`messageFromRow`）。所以如果伺服器在中途掛掉又沒寫結束狀態，骨架會一直留著；伺服器一定要寫結束狀態（P1 的測試要涵蓋，文字回覆也是同樣情況）。

**實驗 3：重新開頁面接回進行中的任務 — 不通過，需要新分支。**
- `reattach.js` 現在只特別處理 `vision` 與 `research`；其他種類一律走一般回覆流程（`completeReply` 加 `resumeRun`）。
- 一個 `image` 任務會落進這條一般流程，但 `completePreparedReply` 的圖片分支**不看 `resumeRun`**，會在瀏覽器裡重新生成一張圖，而且 `userParts` 是空的，提示詞為空會直接報錯；若有提示詞則會重複生圖、重複收費。
- 所以 P2 要在 `reattach.js` 加 `run.kind === 'image'` 的分支（只跟著執行、等完成後用 `hydrateParts` 把圖還原，不啟動本機生成），P1 要讓 `server_runs` 的 `flags` 記 `{ kind: 'image' }`，讓 `find` 看得出來。

**另外查到的事實**
- **雲端儲存桶 `user-assets` 的單檔上限是 50MB**（`file_size_limit = 52428800`，不限檔案型別）。4K PNG 通常低於此值，但極端情況可能超過；超過時存圖會失敗，P1 要把這當成一個明確的錯誤（圖畫好了卻存不進去，要告訴使用者，而不是靜默失敗）。專案層級的全域上限我沒有看到，不確定。
- 目前整個儲存桶：122 個檔案、約 74MB、最大一個 8MB（所有使用者合計）。
- **參考圖可以只送標記：** 客戶端已有 `externalizeParts`（文字回覆用它先把附件存進雲端、請求裡只放位置）。圖片任務可以比照，先把參考圖存進雲端，請求只帶標記，伺服器再用 `file-store.load` 讀出來。這樣請求幾乎一定遠小於 25MB，上限實際上不太會卡到；owner 決定維持 25MB 不變，這只是讓「太大就退回本機」很少發生的做法，是否採用留到 P1／P2 決定。

## 9. P1 完成紀錄（2026-10-07，伺服器端）

只改伺服器與測試；客戶端（P2）還沒接，所以使用者看到的行為沒有任何改變。

**新增與修改**
- `server/run-spec.js`：`kind: 'image'` 的驗證（`validateImageSpec`）。模型提供商必須是 `openrouter`；`image.prompt`（最多 40,000 字）、`image.config`（比例必須是 App 的比例清單之一、畫質是清單之一或空字串＝不送、`n` 1 到 4、`quality`／`outputFormat`／`background`／`size`／`reasoningEffort`／`seed`／`outputCompression`／`provider` 有各自的限制，未知欄位拒絕）、`image.references`（最多 32 張，每張是 `data:image/…;base64,…` 或雲端空間裡的檔案標記）、金鑰只收 `providerKey`。回傳的 spec 補上其餘伺服器程式會讀的東西（`request.language`、空的歷史、`tools` 預設），所以 `runs.js` 的寫訊息與錯誤文字不用改。
- `server/image-run.js`（新）：`executeImage`。先寫佔位 `{ imageGenerationLoading, imageAspectRatio }`；參考圖若是標記就用 `file-store.load` 讀出；用 `createOpenRouterImageGenerator`（和瀏覽器同一份程式，不串流）呼叫 OpenRouter；每張圖用 `file-store.save`（`encoding: 'blob'`、`quota: false`）存起來，失敗重試 2 次，仍失敗就丟 `image_not_saved`；回傳 `{ generatedImage: { id, storageKey: 'generatedImage:supabase:<使用者>:<id>', mediaType, size, aspectRatio, cloudAsset } }`。停止或逾時：放下請求、不存任何東西，回傳空文字與 `stopped`（和文字回覆一致）。供應商的錯誤訊息保留，金鑰會被遮蔽。
- `server/runs.js`：`kind: 'image'` 走 `executeImage`；逾時 10 分鐘（`LIMITS.maxImageRunMs`）；金鑰存活 30 分鐘（`imageKeyTtlMs`）；`server_runs` 記 `{ kind: 'image' }`（P2 的 `reattach` 要靠它辨認）；`imageAvailable()`；新增建構參數 `files`（`main.js` 把已有的檔案儲存傳進去，不再只經由沙盒）。
- `server/app.js`：`POST /v1/runs` 收圖片請求；沒有檔案儲存時回 422 `unsupported_mode`，讓頁面自己生圖。
- `server/protocol.js`：新錯誤碼 `image_not_saved`、`LIMITS` 的圖片上限；`server/error-texts.js`：`image_not_saved` 的五語言文字（「圖片畫好了，但沒能存進你的雲端空間，請再試一次。」）。
- `server/file-store.js`：`save` 多了 `encoding`（預設 `'base64'`，不變）與 `quota`（預設 `true`，不變）兩個選項。
- `scripts/server-shared-modules.json`：伺服器新增使用兩個共用模組 `image-generation-config.js`、`openrouter-image-generation.js`（都看過，沒有瀏覽器全域）。

**測試**（`tests/server/server-image.test.js`，13 項）：驗證接受與拒絕（含不重複值）、對 OpenRouter 的請求內容、存圖與回傳的部件、標記參考圖、供應商錯誤與沒有圖片、停止（含「圖片剛到的同時按停止」）、存圖重試與 `image_not_saved`、整個 run（佔位先寫、完成、金鑰 30 分鐘並在結束時清除、錯誤五語言文字不含金鑰、停止、10 分鐘逾時）、沒有儲存時不能做、`file-store` 的額度行為，以及 `POST /v1/runs` 的收與拒。全部 2964 項測試（不含卡住的 `runner.test.js`）、build、體積、舊執行層與伺服器邊界、版本、`npm audit` 通過。

**沒做／留給 P2 與之後**
- 客戶端：圖片版的「伺服器還是本機」、組 RunSpec、跟著執行、`reattach` 的圖片分支、移除本機預覽、五語言文字與隱私說明、更新紀錄與版本。
- 每人同時上限：現在圖片和文字共用同一個上限（5）。尚未量記憶體，P2 完成、真實使用後再決定要不要為圖片另設。
- 還沒有用真的 OpenRouter 與真的 Supabase 儲存桶實測；只有假的。


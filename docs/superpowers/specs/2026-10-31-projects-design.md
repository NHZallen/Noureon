# 專案（資料夾改成專案）設計

2026-10-31，Allen 與 Claude 討論後的版本。**只是設計，還沒有寫程式。** 參考：ChatGPT 的 Projects（研究報告 `chatgpt-projects.md`，官方來源為主；Allen 提供了 ChatGPT 手機版淺色與深色的畫面）。

## 1. 目標

現在的「資料夾」只有名稱、顏色、圖示，把對話放在一起。改成「專案」：一個專案是一組對話，加上
- **專案指示**：專案內每個對話都會帶。
- **資料來源**：檔案與貼上的文字，專案內每個對話都能用。
- 一個專案頁，有聊天與資料來源兩個頁籤。

## 2. 已決定（Allen，2026-10-31）

| 項目 | 決定 |
|---|---|
| 名稱 | 介面全部改叫「專案」（五語：專案 / Projects / Projets / Проекты / Proyectos）。程式與資料表內部名稱維持 `folder`、`workspace_folders`，不改名 |
| 指示順序 | 全域（語言指示）→ Noura → 學習模式 → 記憶筆記 → **專案指示** → 圖表與檔案製作說明 → 其他附加。專案指示放在 Noura 與記憶之後，所以專案內它最強 |
| 記憶 | 只有「預設」一種：專案內的對話照常用全域記憶。**不做**「只用專案記憶」，**不做**專案專屬筆記 |
| 檔案上限 | 每個專案 20 個 |
| 刪除專案 | 讓使用者選：對話移出專案保留（現在的做法），或對話連同專案一起進垃圾桶、可復原（見 §6） |
| 專案清單頁 | 保留三個頁籤「全部 / 由你建立 / 與你共享」，之後會做分享；分享做出來之前「與你共享」是空的，顯示「目前沒有與你分享的專案」 |
| 側邊欄 | 只多一個「專案」入口（開專案清單頁），原本資料夾在側邊欄的顯示與操作不動 |
| 建立時的預設選項 | 照 ChatGPT 放（研究、規劃、程式碼、會議） |
| 專案預設模型 | 不做 |
| 分享專案 | 不做（Noureon 已有對話分享） |
| 畫面風格 | 照 Allen 給的 ChatGPT 手機畫面的結構；**不要學那個半透明（毛玻璃）效果**，那是 Apple 系統的。顏色一律用 `src/styles/tokens.css` 的名稱，淺色與深色都要 |

## 3. 資料

- `workspace_folders` 加一欄 `instructions text not null default ''`（上限見 §4）。其他欄位不動：`name`、`color`、`icon`、`text_color`、`deleted_at`。現有資料夾直接成為指示是空的專案，不用搬資料。
- 資料來源：新表 `workspace_project_sources`（`id`、`user_id`、`folder_id`、`kind`：`file` 或 `text`、`title`、`mime`、`size_bytes`、`storage_path`（檔案）、`text_content`（文字）、`created_at`、`deleted_at`）。RLS 與其他工作空間表一樣，只有本人。
- 檔案放在現有的使用者檔案儲存（`user-assets`），**計入每人 500 MB 的額度**（`user_asset_usage`），超過時拒絕並說明。每個專案最多 20 筆來源（檔案與文字合計）。
- 同步：`cloud-sync-v2` 的 codec 帶 `instructions`；來源表比照其他表用 upsert 與 tombstone。這會動到同步格式，上線前依規則要在 Linear 寫相容性說明（標籤 `contract`），並由 Allen 確認。
- 資料庫 migration 由 Claude 寫、Allen 套（先測試專案、再正式專案）。

## 4. 專案指示怎麼進回覆

回覆時的系統指示由**頁面**組成（`src/app/runtime/reply/stream-api-call.js` 的 `resolveSystemInstruction`），伺服器版（關掉頁面也會答完）、議會、深度研究都是從頁面拿現成的文字（`systemInstructionText` / `run-spec.js` 的 `systemInstruction`）。所以**只要在頁面這一個地方加進去，伺服器版自動帶到，不用改伺服器的回覆格式**。

- 位置：記憶筆記之後、圖表與檔案製作說明之前（§2 的順序）。
- 條件：對話在某個專案內才加。臨時對話不能放進專案，所以不會有。
- 上限：8000 字元（Allen 2026-10-31 要求，跟 ChatGPT 一樣；資料庫欄位本來就允許 8000，不用 migration）。起初定 4000 字元（伺服器的 `LIMITS.maxSystemInstructionChars` 要確認夠大，不夠就調或在頁面截斷並提示）。
- 專案指示的文字不進記憶、不被「用過去的對話建立記憶」讀成筆記（它是設定，不是對話內容）。

## 5. 資料來源怎麼被用（P2）

照 ChatGPT 的做法分兩種，但用 Noureon 已有的東西：
- **小的直接放進上下文**：總量依該次回覆所用模型的上下文長度決定預算，超過的部分不放。
- **其餘用檢索**：沿用記憶重做時做好的向量索引（Gemini embedding、pgvector），每次提問檢索與問題相關的片段。檔案切塊與索引的表另設計，P2 動工前補在這份文件。
- 試算表：進階模式的 Python 沙盒可以讀，P2 決定掛載方式。
- 回覆下方的「來源」要能看到用了哪個專案來源（沿用記憶與對話的來源分頁籤）。
- 專案內的對話也能搜尋同專案其他對話（現有「查過去對話」的範圍加專案條件）。

## 6. 對話與刪除

- 移入專案：拖曳或選單「移到專案」。臨時對話不能放進專案。
- 專案內單一對話的長按選單（`從專案中移除` 與 `刪除` 是兩個不同動作）：釘選、重新命名、從專案中移除（對話回到沒有專案的對話）、封存、刪除（對話進垃圾桶）。
- **刪除專案**（程式現況：`folder-lifecycle.js` 的 `deleteFolder` 目前是把對話的 `folderId` 設成空，對話保留，專案刪掉）。新做法由使用者在確認視窗選：
  - 「只刪專案，對話保留」：對話移出專案（現在的行為）；
  - 「連對話一起刪除」：對話進垃圾桶，可復原。
  專案的資料來源隨專案刪除（檔案的額度釋放）。確認視窗要寫清楚兩個選項各會發生什麼。

## 7. 畫面（手機版，依 Allen 的畫面）

**專案清單頁**：標題「專案」，右上「＋」建立，三個頁籤「全部 / 由你建立 / 與你共享」，列表每列是圖示方塊 + 名稱 + 時間，底部搜尋框「搜尋專案」。「與你共享」在沒有分享功能前是空的。

**專案頁**：左上返回，標題是圖示 + 名稱，右上「•••」選單：釘選、編輯專案、編輯指令、刪除專案。下面兩個頁籤「聊天」「資料來源」，底部固定輸入框「傳送訊息給 專案名稱」，在這裡送出會在這個專案內開新對話。
- 聊天頁籤：對話列表，每列標題 + 內容預覽；長按選單見 §6。
- 資料來源頁籤：第一列「＋ 新增資料來源」，下面每列圖示 + 檔名 + 類型 + 垃圾桶。新增選單：拍照、新增照片、新增檔案、新增文字。**P2 不做 Google 雲端硬碟與 Slack**；之後可以接已有的 Google 連接器。新增文字有「標題（選填）」和「文字」，右上「儲存」。

**建立專案**：底部彈出的面板，名稱欄左邊是圖示按鈕，下面一排預設選項（研究、規劃、程式碼、會議……，點一下帶入名稱、圖示、顏色），「建立專案」。
**編輯專案**：名稱 + 圖示。ChatGPT 這裡還有記憶選項，Noureon 不做，所以沒有。
**編輯指令**：說明文字 + 文字框 + 「儲存」。
**選擇圖示**：一排顏色加一組單色圖示（ChatGPT 有 30 個）。Noureon 現有的顏色與圖示是 `folder-metadata.js`，不夠的圖示補上，補的圖示要是同一套線條風格。

**側邊欄**：多一個「專案」入口，點了開專案清單頁（ChatGPT 的側欄在「空間」下面有一列「專案」）；原本的資料夾顯示（展開、拖曳）不動。**電腦版的專案清單與專案頁**：Allen 說側邊欄多一個入口即可，頁面本身沿用同一套結構，電腦版的排版（置中欄寬等）在做的時候用現有頁面的做法，做完請 Allen 看。

## 8. 分階段

| 階段 | 內容 | 動到 |
|---|---|---|
| P1 | 介面改叫專案、專案清單與專案頁（聊天頁籤）、建立與編輯、專案指示（回覆時帶進去）、移入移出、刪除、釘選 | 前端、`workspace_folders.instructions`、同步 codec |
| P2 | 資料來源：文字、檔案（20 個、500 MB 額度）、小的放進上下文、其餘檢索、回覆下方顯示用了哪些來源 | 新表、檔案儲存、向量索引 |
| P3 | 專案內搜尋同專案的過去對話 | 現有「查過去對話」加條件 |
| 之後 | 接 Google 連接器當來源、分享專案 | — |

每階段都先在 staging 試，Allen 說「上線」才進 `main`。

## 9. 測試

- 資料庫：新欄位與新表的權限（他人讀不到、不能寫）、20 筆上限、額度。
- 指示組合：專案內的對話有專案指示、順序正確、臨時對話沒有、伺服器版拿到同一段文字。
- 介面：清單、專案頁、兩個頁籤、建立、編輯、刪除；淺色與深色都用 tokens；五語文字 key 齊全（`src/data/i18n/parts/` 新增 `projects.js`，並加進 `parts/index.js`）。
- 舊資料：沒有 `instructions` 的資料夾能正常顯示與同步。

## 10. 狀態

§2 的決定都已由 Allen 確認（2026-10-31），沒有待決的題目。P1 動工前：在 Linear 寫相容性說明（`contract` 標籤，內容是 `instructions` 欄位與同步 codec），由 Allen 確認；migration 由 Claude 寫、Allen 套。

## 11. P1 實作備註（2026-10-31，已推 `staging`，等 Allen 在測試站試）

- 資料：`supabase/migrations/20261031090000_add_project_instructions.sql`（`workspace_folders.instructions`；`upsert_workspace_folders` 收到沒帶 `instructions` 的資料列時保留原值，舊版頁面寫回不會蓋掉）。**要先套 migration 再部署前端**：同步會 select 這一欄。`fetch_workspace_delta` 回整列，不用改。
- 同步：codec、`COMPARABLE_FIELDS`、`FOLDER_COLUMNS` 都加了 `instructions`；缺這個欄位的列視為空字串（沒套 migration 的資料庫不會每次都重傳）。
- 回覆：`runtime/projects/project-instructions.js`（頁面唯一一處加進系統指示，位置見 §2；`shouldApplyNouras` 同一組用途才帶；臨時對話不帶）；伺服器版、議會拿頁面組好的文字，伺服器格式沒變。此模組在 `scripts/server-shared-modules.json`。
- 畫面：`ui/projects/`（`projects-page.js`、`project-sheets.js`、`project-parts.js`、`project-path.js`）、`styles/projects.css`（只用 `tokens.css` 的名稱）、`runtime/projects/`（`project-actions.js`、`start-projects.js`）；網址 `/projects`、`/projects/<id>`（`vercel.json` 加了兩條 rewrite）；側邊欄「專案」入口在「擴充」下面。
- 文字：`i18n/parts/projects.js`（五語）；原本的「資料夾」字樣（選單、對話框、通知、P2P、匯出匯入、隱私權政策與協助中心五語）全部改成「專案」，程式內部名稱不變。圖示補了 16 個（`folder-metadata.js`），共 28 個。
- **沒做**：資料來源頁籤（P2a 做了，見 §13）、電腦版專門的排版（沿用手機同一套，置中窄欄）。
- 附帶修的 bug：切換到沒有金鑰的提供商時輸入框不會先擋、第一個字之後才卡住（單模型的選擇沒有更新輸入框與標頭警告）；現在選的當下就更新、跳出通知，點被擋住的輸入框也會再說一次。


## 12. 試用後的修改（2026-10-31，Allen 在測試站用 iPhone 深色試過）

- **釘選做了**：`workspace_folders.pinned`（`supabase/migrations/20261031100000_add_project_pinned.sql`，沒帶 `pinned` 的舊頁面寫回不會蓋掉；要先套 migration 再部署前端）；codec、`COMPARABLE_FIELDS`、`FOLDER_COLUMNS` 都帶 `pinned`；清單釘選的排前面並有小圖釘。
- **側邊欄舊的資料夾區塊刪掉**：只剩「專案」入口；專案內的對話照常出現在對話歷史（不再因為有 `folderId` 被濾掉）。
- **樣式**：不用粗體（400 與 500）、字級統一、圖示吃使用者選的顏色（全站 `body svg` 要用 `svg { color: inherit }` 蓋掉）、顏色那排滑到螢幕兩邊、清單一列縮小（`2.25rem` 圖示）。規範寫在 `2026-10-31-ui-style-rules.md`，`tests/ui-style-rules.test.js` 檢查。
- **每列右邊 `⋯`**：新的專案對話（開一個空的專案對話並關掉專案頁）、釘選／取消釘選、專案設定（名稱與圖示）、刪除專案。專案頁右上的 `•••` 多一項釘選。
- **面板整頁**：建立、編輯、指示、選圖示都是整頁（像設定頁，沒有遮罩）；刪除確認與重新命名對話維持置中小對話框。

## 13. P2 資料來源：分三步，第一步（P2a）的做法（2026-10-31）

§3 原本寫的是新表 `workspace_project_sources`、檔案放 `user-assets` 並計入 500 MB。動工前看過現有程式後改成分步，P2a 先做「文字與讀出文字的檔案」，不需要新表、不用額度：

- **存法**：`workspace_folders.sources jsonb`（`supabase/migrations/20261031110000_add_project_sources.sql`，最多 20 筆）。一筆來源是 `{ id, kind: 'text' | 'file', title, mime, size, text, addedAt }`。因為它是專案那一列的欄位，雲端同步、本機帳號、匯入匯出、伺服器版都不用另外做；沒帶 `sources` 的舊頁面寫回時保留原值。
- **只存文字**：加檔案時在頁面讀出文字（純文字與程式碼檔、Word / PowerPoint / Excel 用聊天已有的 office 讀取器、PDF 用 `pdfjs-dist` 的文字層），**原檔不保存**。所以 P2a 不碰 `user-assets` 與 500 MB 額度。圖片、掃描檔沒有文字，會明確說讀不了（不是默默丟掉）。
- **上限**：每筆 100 000 字、全部加起來 400 000 字、25 MB 以內的檔案、20 筆。
- **回覆怎麼帶**：`project-source-prompt.js` 把來源組成一段文字，接在專案指示後面，同一個位置（`projectInstructionTextFor`），所以頁面、伺服器版、議會都自動帶到，伺服器格式沒變。預算 60 000 字（約 15 000 token），照加入順序放到放不下為止；放不下的列出標題並告訴模型「沒讀」，專案頁的資料來源頁籤也會寫出有幾個沒帶入。文字被當成參考資料而不是指示（防止檔案內容改寫指令）。
- **P2b（下一步）**：太大放不下的來源改用檢索。沿用記憶的向量（`workspace_memory_vectors`、Gemini embedding 768 維、同步開關），來源切塊後 `piece_id` 用 `src:<來源 id>:<序號>`；提問時檢索相關片段放進回覆，取代「放不下就不讀」。
- **P2c**：圖片與掃描檔（需要保存原檔，才計入 `user-assets` 與 500 MB）、回覆下方「來源」顯示用了哪個專案來源、拍照與新增照片。
- 畫面：專案頁「資料來源」頁籤，第一列「新增資料來源」開選單（新增檔案、新增文字），下面每列圖示＋標題＋類型與大小＋垃圾桶；新增文字是整頁面板（標題選填、文字、儲存）。照 `2026-10-31-ui-style-rules.md`。
- 隱私：資料來源的文字隨專案同步到雲端（和專案指示一樣），回覆時會送給使用者選的模型供應商；五語隱私權政策與使用條款已寫入，`PRIVACY.md` 重新產生。

### 13.1 檔案（2026-10-31，Allen：專案不該比一般模式窄；模型不支援就不用，不要給別的模型先讀；檔案要保存）

- **任何檔案**都收。文字檔與程式碼讀成文字（文字就是來源）；**其他一律保存原檔**（PDF、Word、PowerPoint、Excel、圖片、影片、音訊、壓縮檔…），不在加入時讀文字。
- **回覆時走對話附件同一套流程**：原檔當作這則訊息的附件放在最前面（`single-model-response-lifecycle.js` 一行、議會 `council-response-lifecycle.js` 一行；技能、進階模式 Python、網路研究這些從單一模型回覆分出去的路徑用同一份 `requestParts`，所以也有）。因此：模型看得懂就直接給原檔（PDF 的圖片、Word 的版面都在）；模型讀不了 Word、PowerPoint、Excel 時，本機回覆把它轉成文字，伺服器版轉成 PDF（LibreOffice，見 office-to-pdf 設計）；整個種類都讀不了（例如不看圖的模型遇到圖片）就不放。不用其他模型先讀圖。深度研究只有題目，不帶專案檔案。
- **帶多少**：每則回覆最多 8 MB 的原檔，照加入順序放到放不下為止；放不下的略過，專案頁「資料來源」寫「有 N 個資料來源超過一次回覆能帶的大小」。**不是全部塞進去**：大檔案要靠檢索（見 §13.3）。附件標籤「第 N 個，共 M 個」不計入專案檔案。
- **存在哪**：專案那一列是整份重寫的（工作空間的「共用」記錄），所以原檔**不放在 `sources` 裡**，來源只放小描述 `file: { name, mimeType, size, hash, asset? }`。位元組在本機 IndexedDB（每人一個資料庫 `noureon-project-files:<人>`，鍵是內容的 SHA-256），有雲端帳號時也上傳到使用者檔案儲存（`user-assets`，跟對話附件同一個傳輸層，`asset` 是小標記）；別的裝置本機沒有就從雲端抓、再快取。`orphan_user_assets` 看得到 `workspace_folders` 裡的路徑，不會被當孤兒清掉。
- **上限**：單檔 20 MB，一個專案的原檔加起來 100 MB；刪掉來源或專案時，沒有別處用到的原檔從本機刪掉（雲端的交給孤兒清理）。
- 新增資料來源選單照 Allen 給的 ChatGPT 畫面：底部面板「新增資料來源」，拍照、新增照片、新增檔案、新增文字（T 圖示）、從 Google 雲端硬碟新增（彩色標誌）。

### 13.2 從 Google 雲端硬碟新增（2026-10-31，Allen：要叫出 Google 官方那個頁面，不要自己做）

- 用 **Google 官方選檔器（Google Picker API）**：就是手機與 ChatGPT 彈出來的那個視窗（近期、我的雲端硬碟、與我共用、已加星號、搜尋、資料夾都是 Google 做的）。我們先做過一個用 Google 連接器自己拼的選檔面板，Allen 說不要，已經整個拿掉（連同伺服器端點）。
- 做法：頁面載入 Google 的兩個腳本（`apis.google.com/js/api.js`、`accounts.google.com/gsi/client`），用 Google Identity Services 要一個**只有 `drive.file` 範圍**的令牌（頁面只讀得到使用者自己選的檔案，讀不到其他雲端硬碟內容），顯示 Picker，選好的檔案由頁面用這個令牌直接從 Google 下載（Google 文件、簡報、試算表匯出成 PDF，其他原樣；單檔 20 MB），再當成「從裝置加檔案」同一條流程加入。令牌只放在頁面記憶體一小時；**這跟 Google 連接器是兩回事**（連接器的登入留在伺服器，頁面拿不到），所以不需要連接器、不用動伺服器。
- 選單的「從 Google 雲端硬碟新增」在選單一打開就預先載入腳本（瀏覽器只讓使用者點的當下開登入視窗）；沒設定金鑰時選項不顯示。
- **Allen 要先設定**（`.env.example` 有說明）：在 Google Cloud 專案啟用 Google Picker API 與 Google Drive API；建一個 Web 類型的 OAuth 用戶端，授權的 JavaScript 來源加 `https://noureon.com` 與 `https://staging.noureon.com`（`drive.file` 是非敏感範圍，不用 Google 審查）；建一個限制為 Picker API 與這兩個網址的 API 金鑰；然後在 Vercel 設 `VITE_GOOGLE_PICKER_CLIENT_ID`、`VITE_GOOGLE_PICKER_API_KEY`、`VITE_GOOGLE_PICKER_APP_ID`（專案編號）。
- `vercel.json` 的內容安全政策加了 Google 的網址：script-src（`apis.google.com`、`accounts.google.com/gsi/client`）、frame-src（`docs.google.com`、`accounts.google.com/gsi/`）、connect-src（`www.googleapis.com`、`accounts.google.com/gsi/`）、style-src（`accounts.google.com/gsi/style`）。正式站是「只報告」模式，測試站是強制；**我沒辦法用真的 Google 試**，所以測試站要實際點一次，CSP 若擋掉什麼，瀏覽器主控台會寫是哪個網址。
- 隱私：被選的檔案複製進專案（跟其他資料來源一樣同步到雲端、回覆時送給使用者選的模型）；選檔器與登入的腳本來自 Google（Google 看得到這個請求）；五語隱私權政策已寫入。

### 13.3 檢索（下一步，P2b）

- 超過一次回覆能帶的檔案不再被略過，改成：加入或第一次需要時，在頁面從原檔取出文字（PDF 文字層、Office、純文字；掃描與圖片沒有文字，仍然只能整個給看得懂的模型）、切塊、用記憶已有的向量（Gemini embedding 768 維）建索引，提問時取出相關片段放進回覆。索引存本機，開了「向量同步」就同步（`workspace_memory_vectors`，`piece_id` 用 `src:<來源 id>:<序號>`）。設計細節動工前再補。

## 14. 專案記憶：預設／僅限這個專案（2026-10-31，Allen 決定）

記憶系統是 2026-10-30 剛重做的（筆記清單、常駐頁、小抄、`search_memory`／`memory_write`、策展、整理；`2026-10-30-memory-redesign-design.md`）。專案記憶不改它的做法，只在「筆記屬於哪個範圍」上加一層。

### 14.1 Allen 的決定

1. **建立專案時選，建立後不能改**：「預設記憶」（用帳號的一般記憶，跟現在一樣）或「僅限這個專案」。不能改是因為改了以後筆記該往哪走沒有好答案。
2. 「僅限這個專案」的對話**不讀一般記憶的筆記**，只讀這個專案自己的筆記。
3. 這種對話裡學到的筆記**標上專案**，專案外的對話看不到、搜不到；過去對話的搜尋，專案內的對話只看同一專案的對話；專案外的對話也不會搜到專案內的對話（所以「僅限」是雙向的）。
4. **刪除專案就直接刪它的筆記**（不留墓碑：墓碑是為了「不再學到被刪的東西」，專案沒了，這個考慮也沒了）。
5. 匯入本機資料夾當來源（P2b 檢索做完後再做）不在這一步。

### 14.2 做法

- **範圍的記法**：筆記多一個選填欄位 `projectId`（沒有＝一般記憶）。`memory-notes/scope.js`（頁面與伺服器共用，已列入 `server-shared-modules.json`）有 `noteScopeOf`、`notesInScope`、`scopeOfConversation(對話, 資料夾們)`、`scopedView(store, scopeId)`。筆記存在 `workspace_memory_records` 的 jsonb 內，所以**筆記不需要 migration**。
- **對話的範圍**＝它所在專案的 id（專案的 `memoryScope` 是 `project`、專案沒被刪、對話不是暫時對話），否則是 `''`（一般記憶）。**一般記憶的範圍會排除所有專案筆記**，所以專案筆記不會漏到專案外。
- **資料夾欄位**：`workspace_folders.memory_scope`（`'default'|'project'`，預設 `default`，check 限制），migration `20261031120000_add_project_memory_scope.sql`。`upsert_workspace_folders` 新增時寫入、**更新時不改**（所以「建立後不能改」在資料庫也守住；舊版頁面不送這個欄位也不會改掉）。同步的編碼、解碼、比較、倉庫欄位、收到資料時的欄位都加了 `memoryScope`；沒有這個欄位的舊資料等於 `default`。
- **頁面**：`scopedView` 是「這個範圍看到的筆記庫」：`getNotes` 只回這個範圍的筆記；`commitNotes`／`commitWrite` 把**新**筆記標上範圍、其餘原樣寫回，從不碰範圍外的筆記；`clearAll` 只清這個範圍。用在：首頁小抄與常駐頁（`notes-memory.js` 的 `compose`，`scopeId` 由 `stream-api-call.js` 從對話算出）、工具 `search_memory`／`memory_write`（`page-memory-loader.js`）、策展（`page-curator.js`）。**整理（`page-tidy.js`）與從過去對話重建（`page-rebuild.js`）只做一般記憶**，專案筆記不被合併進去、也不被重建覆蓋；重建時也略過專案內的對話。
- **過去對話搜尋**：`history-index.js`、`page-vectors.js` 的搜尋多一個 `allow(conversationId)`；`page-history.js` 用 `getScopeOf` 把 `scopeId` 變成 `allow`。預設範圍是 `''`，沒帶範圍的呼叫也不會搜進專案內的對話。
- **伺服器**：頁面把 `tools.memory.scope`（專案 id）放進回覆請求（`run-spec.js` 驗證，最多 80 字）；`server/memory-scope.js` 的 `scopedMemory(memory, scopeId)` 包住記憶（`load` 過濾、`saveWrite` 標新筆記、`history.forReply` 帶範圍）；`executor.js` 的記憶區塊整段用它，範圍不為空時**不做整理**。`server_read_history` 多回每個對話的 `folder_id` 和「僅限專案的專案清單」，`memory-history.js` 據此給每個對話 `scopeId`，搜尋只留同範圍的；伺服器版的重建略過專案內的對話。
- **刪除專案**（`project-actions.js` 的 `remove`）：專案的 `memoryScope` 是 `project` 時，雲端刪除成功後呼叫 `dropNotes(id)`（`start-projects.js` 接到 `store.clearAll({ keepTombstones: false, scopeId })`）。在另一台裝置上專案被刪時，專案筆記會留在表裡但沒有任何範圍讀得到，也不會顯示（設定頁只顯示專案還在的筆記）；之後有需要再加清理。
- **畫面**：建立專案的面板多一段「記憶」兩列單選（預設記憶／僅限這個專案），下面寫「建立後無法更改；刪除專案時，它的記憶也會一起刪除」；編輯面板在專案是「僅限」時顯示一行唯讀說明。設定 → 記憶的筆記清單照樣列出專案筆記，筆記列多一個「專案：名稱」標籤；**匯出筆記只含一般記憶**。
- **隱私**：隱私權政策第 9 節與協助中心記憶段（五語）各加一段；`PRIVACY.md` 重新產生。專案筆記的保存與送出方式跟一般筆記一樣，只是範圍不同。

### 14.3 這一步沒有做的

- 沒有「把一般記憶的筆記搬進專案」或反過來；沒有在專案頁上直接管理專案筆記（先在設定 → 記憶）。
- 上限仍是每個範圍各 300 條。

### 14.4 要 Allen 做的

- 先在**測試專案**套用 `supabase/migrations/20261031120000_add_project_memory_scope.sql`（這個檔案也改了 `server_read_history`，伺服器要重新部署才認得 `tools.memory.scope`）；正式專案等「上線」時再套。
- 在測試站試：建一個「僅限這個專案」的專案，在裡面叫它記一件事；到專案外的新對話確認不知道；回專案內的新對話確認記得；在設定 → 記憶看到帶專案標籤；刪掉專案後筆記消失。

### 14.5 補上的兩項（2026-10-31，Allen：不能省）

- **每個範圍各自整理**：`settings.consolidatedScopes`（`{ 專案id: 上次整理時間 }`）加上原本的 `consolidatedAt`（一般記憶）；`scope.js` 的 `scopesOfNotes`、`consolidatedAtOf`、`consolidatedPatch`。頁面 `page-tidy.js` 與伺服器 `memory-tidy.js` 都是先整理一般記憶，再依序整理每個有筆記的專案（頁面只整理還在的專案）；每次只把同一範圍的筆記交給模型，兩個範圍的筆記不會出現在同一個提示裡。伺服器的模型時間預算（20 秒）是整次整理共用一份。
- **刪專案由資料庫清筆記**：migration `20261031130000_drop_project_notes_with_project.sql` 改了 `permanently_delete_workspace_folder`，專案被刪（任何裝置）時，把 `payload.projectId` 等於該專案的筆記列標為刪除並把版本加一（其他裝置聽得到），不留墓碑。頁面端的 `dropNotes` 仍保留，讓這台立刻乾淨。

## 15. 電腦版（2026-10-31，照 Allen 給的 ChatGPT 電腦版影片）

- **斷點**：視窗寬度 ≥ 768px 就是電腦版（`isWide`，CSS 用同一個斷點）；手機維持整頁面板。測試用 `matchMedia` 替身選擇。
- **所有面板變成置中的對話框**（約 40rem 寬、圓角、標題靠左、關閉鈕在右上、按鈕在底部一列）：建立、編輯、指令（進階）、新增文字來源、刪除、改名。純 CSS（`@media (min-width: 768px)`），不改手機版。
- **建立專案**：名稱欄左邊是圖示按鈕，點開是一個浮層（**搜尋圖示**框＋顏色一排＋圖示格，選了就生效，點外面或 Esc 關閉）；下面「來源資料夾」區（新增一個電腦上的資料夾，檔案一次複製進專案）；左下「記憶」下拉（兩個選項各有說明），右下建立。手機仍是整頁面板的圖示選擇與兩列單選。圖示搜尋用 `src/data/project-icon-words.js`（每個圖示五語的關鍵字）。
- **來源資料夾**：`<input webkitdirectory>`，這是**一次性的複製**（不像 ChatGPT 電腦版會持續連結資料夾；網頁做不到）。略過隱藏檔、`node_modules`、`dist`、`build`、`__pycache__`、空檔；最多一個專案能放的 20 個；沒加入的數量寫在畫面上。專案建立後才一個一個讀進來，跟加檔案走同一條路。
- **專案設定（編輯）**：名稱＋圖示、「可用來源」清單（右上新增、每列垃圾桶）、左下「進階」、右下儲存。「進階」是另一個對話框：指令（剩餘字數）、記憶（唯讀，說明建立後不能改）。電腦版的專案頁選單不再有「編輯指令」（在進階裡）。
- **新增來源**：選單同手機（拍照、新增照片、新增檔案、新增文字、Google 雲端硬碟）。**電腦版的「拍照」開電腦的相機**（`getUserMedia`，一個小對話框，按了拍成 JPEG 檔），手機仍開手機自己的相機；相機不能用就說明原因。相機權限 `Permissions-Policy: camera=(self)` 原本就有。
- **Esc**：對話框裡開著圖示浮層或記憶下拉時，Esc 先關它們，不關對話框。
- **左側選單的專案區塊（電腦版，Allen 2026-10-31 同意）**：在「歷史紀錄」上面一個「專案」區塊，每個專案一列（顏色圖示、名稱、⋯），釘選的在前；箭頭展開看最新 5 個對話（還有幾個寫在下面，按了開專案頁），名稱開專案頁，⋯ 選單是釘選／專案設定／刪除。手機仍只有「專案」一個入口。`ui/projects/sidebar-projects.js`，沿用舊資料夾區塊留下的 `.folder-item` 樣式；歷史清單重畫時（對話或專案有變動）一起重畫；展開狀態記在瀏覽器。「專案設定」開專案頁並直接開設定對話框（`go({ id, edit: true })`）。

## 16. 專案檔案檢索：模型自己查，不再一開始全塞（2026-11-01，Allen 決定）

Allen：「全部檔案先檢索，讓模型自己拿需要的，不用一開始塞一堆」；檔案要存雲端，關掉頁面也能用；看不懂圖的模型就不讀圖片（不用別的模型先讀）。這取代 §13.3 原本「系統依問題挑片段塞進去」的想法。

### 16.1 做法

- **工具**（`src/data/project-files-tool.js`，頁面與伺服器共用，同 `search_memory` 的形式，接進 `combineLoaders`）：`search_project_files({ query, file?, k? })` 回最相關的片段（檔名、起訖位置、文字），`read_project_file({ file, start?, length? })` 從某個位置讀一段（最多 12000 字，回應告訴下一段從哪開始）。搜尋是記憶用的 BM25（`memory-notes/bm25.js`，中文也行）加上每約 900 字一段（`passagesOf`，在換行或句號附近切，重疊 120 字）。每次回覆最多 14 次呼叫；每個檔案的文字第一次需要時才讀，一次回覆內只讀一次。找不到時回檔案清單與「沒有文字」的檔案（掃描檔、圖片）；不會編造內容。
- **哪些來源能查**（`project-files-access.js` 的 `searchableKindOf`）：打字加入的文字、讀成文字的文字檔、有文字層的 PDF、Word／PowerPoint／Excel。圖片和沒有文字的檔案查不了（掃描 PDF 也是：建立回覆時先讀一次文字層，沒有字就當成圖片），仍照 §13.1 原樣隨訊息送給看得懂的模型（不佔工具模式的 8 MB 額度的是能查的檔案，不是圖片）。
- **什麼時候用工具模式**：模型會用工具、而且不是「供應商自己搜尋」（那種回覆不給工具）。其他情況（沒有工具的模型）仍是原來的做法：來源文字放進系統指示、檔案原樣附上（60k 字、8 MB 額度）。
- **系統指示**：工具模式下，專案指示照舊，但來源不再塞文字，改放「這個專案的檔案」清單（檔名、類型、大小）加一句說明（`projectInstructionTextFor(conversation, { filesCatalog })`）。
- **取文字**（`runtime/projects/project-file-text.js`，共用）：文字照原樣、PDF 用 pdf.js 讀文字層（每頁前加 `[Page n]`）、Office 用附件那個閱讀器（`office-reader.js`），圖片與其他沒有文字。頁面：從本機（IndexedDB）或雲端取回原檔，pdf.js 與閱讀器都是頁面自己的，讀過的存在記憶體（以檔案雜湊為鍵）。
- **伺服器版（頁面關掉也能用）**：頁面把 `tools.projectFiles = { entries: [{ id, name, size, text | file: { hash, mimeType, name } }] }` 放進回覆請求（`run-spec.js` 驗證：最多 20 個、文字最多 100k 字、合計 400k 字、雜湊 64 位十六進位）。伺服器（`server/project-file-text.js`）對沒有文字的條目，用 `files.load` 從該使用者自己的雲端儲存資料夾（`user-assets/<使用者>/<雜湊>`）取回原檔，取出文字，**暫存在伺服器記憶體**（以使用者與雜湊為鍵，最多 40 個檔案、2000 萬字，不寫到別處），再交給同一個工具。路徑只由使用者 id 與雜湊組成。映像要多裝 `pdfjs-dist`（`Dockerfile`）。
- **步驟顯示**：每次查閱是一列（「正在查閱專案檔案…」→「查閱專案檔案，找到 N 段」，讀取是「閱讀了專案檔案」），存進回覆；沿用記憶步驟的紀錄方式（鍵 `projectFilesSearching`、`projectFilesReading`），圖示用技能列的。
- **來源頁籤的「放不下」說明**：只算工具讀不了、又放不進一次回覆的檔案（圖片）。
- **隱私**：隱私權政策（與 Google 雲端硬碟選檔器同一節）加一段（五語），`PRIVACY.md` 重新產生。

### 16.2 這一步沒有做的

- **議會**：成員目前仍照 §13.1 把檔案原樣附上（8 MB 額度），還沒有檔案工具；要加的話是議會的成員工具（`council-run.js` 的 `loadersFor`）與議會請求的 `tools.projectFiles`。
- **向量搜尋**：搜尋只用關鍵字（BM25）；之後可接記憶那套向量（`workspace_memory_vectors`）。
- **伺服器重複讀取**：同一個伺服器行程內暫存；沒有存到資料庫，所以重啟或換行程要重讀（PDF 一份約一秒）。
- **本機帳號**（沒有雲端）：原檔沒有在雲端，伺服器讀不到，工具會說「無法讀取」；這種帳號的回覆本來就由頁面做（頁面版可用）。

### 16.3 要 Allen 做的

- 重新部署測試站伺服器（新 `server/project-file-text.js`、`run-spec.js`、`executor.js`、Dockerfile 加了 `pdfjs-dist`，**映像要重建**）。
- 在測試站試：專案裡放一個 PDF、一個 Word、一個文字檔，問只有其中一個檔案才有的事；看步驟列有「查閱專案檔案」；關掉頁面等回覆結束再打開。

# 交接手冊：專案（Projects）這一條線（2026-10-31 到 2026-11-01）

給接手的人（或下一個 AI 工作階段）。先讀 `AGENTS.md`（規則）、這份、再讀 `docs/superpowers/specs/2026-10-31-projects-design.md`（全部設計與每一步的紀錄）。**接下來要做的事**在 `docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md`（計劃書）。

## 1. 人與規則（摘要，完整版看 `AGENTS.md`）

- Owner：Allen。**用繁體中文回覆**，不要用代名詞稱呼他，用名字。
- 日常改動推 `staging`（測試站 `staging.noureon.com` ＋ `api-staging.noureon.com` ＋ 另一個 Supabase 測試專案）；**只有 Allen 說「上線」才合併進 `main`**。`main` 不要直接推。
- 不加 `Co-Authored-By`／AI 署名到提交訊息（`AGENTS.md`）。**注意**：這個工作階段的環境提示要求提交訊息結尾附一段署名，我（上個工作階段）照環境提示附了；接手的人請以 `AGENTS.md` 為準，不要附。
- 版本號、更新紀錄、`package.json`、交接檔只有 Allen 改；功能提交不要動版本號。
- 每個功能與文字要有五語：`zh-TW`、`en`、`fr`、`ru`、`es`（文字在 `src/data/i18n/parts/<領域>.js`，一個領域一個檔、五語並排）。
- 顏色只用 `src/styles/tokens.css` 的名字，不寫自己的顏色；專案畫面的樣式規則在 `docs/superpowers/specs/2026-10-31-ui-style-rules.md`（有測試守著）。
- 版面與使用者看得到的設計，先問 Allen，照他給的 ChatGPT 截圖與影片做。
- 完成前跑：`npm test`、`npm run build`、`npm run check:sizes`、`npm run check:shell`、`npm run check:server`、`npm run lint`、`npm audit --omit=dev`。

## 2. 目前狀態（截至 `staging` 的 `56eef358`）

`staging` 上已經有、Allen **還沒全部在測試站試過**的東西：

| 項目 | 一句話 | 設計文件章節 |
|---|---|---|
| 專案 P1 | 資料夾改成專案：指令（最多 8000 字）、專案清單頁、專案頁、釘選、新增／編輯／刪除（刪專案時選對話留不留） | §5–§12 |
| 資料來源 | 每個專案最多 20 個來源：打字文字、文字檔、任何檔案（原檔保存，本機＋雲端）、圖片、Google 雲端硬碟（Google 官方選檔器） | §13 |
| 專案記憶 | 建立時選「預設記憶」或「僅限這個專案」（建立後不能改）；專案筆記只在專案內讀寫、搜尋；每個範圍各自整理；刪專案由資料庫清它的筆記 | §14 |
| 電腦版 | ≥768px 所有面板是置中對話框；圖示浮層有搜尋；記憶下拉；來源資料夾（一次性複製）；設定＋進階對話框；電腦的相機拍照；左側選單的專案區塊 | §15 |
| 檔案檢索 | 模型自己用工具查專案檔案（頁面與伺服器），不再一開始全塞；掃描 PDF 當圖片附上 | §16 |

最近的提交（新到舊）：`56eef358`（掃描 PDF）、`d7fb0e97`（檔案檢索）、`5a54dd35`（左側選單）、`8f7154dc`／`ab44ac41`（電腦版）、`94a642c3`（每範圍整理、資料庫清筆記）、`0503218b`（專案記憶）。全套測試最後一次完整跑是 4607 個（`d7fb0e97` 之前，當時 1 個因打包大小失敗，已修）；`56eef358` 只重跑了專案相關的 72 個測試＋build＋大小檢查。**下一個人先完整跑一次 `npm test`**。

`main` 在 19.1.0。`v19.1.0` 標籤只在本機，**還沒推到遠端**（要 Allen 同意）。

## 3. Allen 在測試站要做的事（還沒做完）

照順序：

1. **資料庫 migration**（測試專案，貼到 Supabase SQL 編輯器；檔案在 `supabase/migrations/`）：
   - `20261031090000_add_project_instructions.sql`（早就套過）
   - `20261031100000_add_project_pinned.sql`
   - `20261031110000_add_project_sources.sql`
   - `20261031120000_add_project_memory_scope.sql`（也改了 `server_read_history`）
   - `20261031130000_drop_project_notes_with_project.sql`（改了 `permanently_delete_workspace_folder`）
   - 確認：`select memory_scope from public.workspace_folders limit 1;` 不報錯。
2. **重建並重新部署測試站伺服器**（Coolify，要**重建映像**，不是只重啟）：映像要多裝 `pdfjs-dist`（`Dockerfile` 已改）。**不重建的後果**：舊伺服器忽略 `tools.projectFiles`，頁面已在系統指示寫「用工具查檔案」，由伺服器作答的回覆就查不到內容；`tools.memory.scope` 也不認得，專案裡的回覆會讀到一般記憶。我沒查到推 `staging` 會不會自動重建，請確認。
3. **Google 雲端硬碟選檔器**的測試站環境變數（Vercel，Preview 環境；說明在 `.env.example`）：`VITE_GOOGLE_PICKER_CLIENT_ID`、`VITE_GOOGLE_PICKER_API_KEY`、`VITE_GOOGLE_PICKER_APP_ID`；Google Cloud 上的 OAuth 用戶端要把 `https://staging.noureon.com` 加進授權的 JavaScript 來源，API 金鑰限制要含 Picker API 與 Drive API。改完環境變數要重新部署。
4. **試用清單**（手機與電腦各一輪）：
   - 專案：建立（含預設與僅限專案記憶）、編輯、釘選、刪除（含對話）。
   - 來源：打字、檔案、照片、拍照（電腦開電腦相機）、Google 雲端硬碟、來源資料夾（電腦版）。
   - 專案記憶：在「僅限這個專案」的專案裡叫它記一件事 → 專案外新對話不知道 → 專案內新對話記得 → 設定 → 記憶看到「專案：名稱」標籤 → 刪專案後筆記消失。
   - 檔案檢索：專案放一個 PDF、一個 Word、一個文字檔，問只有其中一個才有的事；步驟列要有「查閱專案檔案」；關掉頁面等回覆結束再開。掃描 PDF 與圖片要看得到（看得懂圖的模型）。
   - 電腦版左側選單：專案區塊、展開、⋯ 選單。
5. **正式專案**：等 Allen 說「上線」才處理——同樣的 migration 依序套用、Vercel 正式環境變數、Google OAuth 加 `https://noureon.com`、合併 `staging` 到 `main`、版本號與更新紀錄（Allen 改）。

## 4. 還沒做的（優先順序建議）

1. **計劃書那一整套**（`2026-11-01-project-files-multimodal-design.md`）：圖片、影片、聲音也能檢索；接上向量；模型主動拿圖片（`view_project_file`）；議會成員也能查檔案。Allen 要求的，額度用完前沒開工。
2. 側邊欄展開的專案區塊在 Allen 實機上的外觀（我只在測試用的假資料頁截圖看過對話框，**側邊欄沒有實機截圖**）。
3. 專案頁（不是對話框）在電腦版的版面：Allen 只給過對話框的影片，專案頁本身仍是手機版置中的一欄。
4. 來源頁籤的提示字與「放不下」的說明已按工具模式調整，但沒在實機看過。
5. 筆記管理頁（設定 → 記憶）對專案筆記只有一個標籤；沒有從專案頁直接管理專案筆記的地方。
6. 專案筆記上限是每範圍 300 條；沒有「把一般記憶的筆記搬進專案」。

## 5. 重要檔案地圖

- 專案資料與動作：`src/app/runtime/projects/`
  - `project-actions.js`（建立、更新、刪除、來源、釘選；`dropNotes`、`dropFiles` 由 `start-projects.js` 接上）
  - `project-instructions.js`（專案指令文字、`memoryScopeOf`、`memoryProjectName`、`conversationScopeReader`）
  - `project-source-model.js`（來源的形狀與上限）、`project-source-reader.js`（檔案種類判斷）、`project-source-prompt.js`（不用工具時把文字放進系統指示）
  - `project-source-files.js`（原檔的本機＋雲端保存、`withProjectFiles`、8 MB 額度）
  - `project-files-access.js`（工具模式：哪些來源能查、清單、頁面讀文字、給伺服器的快照）、`project-file-text.js`（取文字，頁面與伺服器共用）、`project-pdfjs-page.js`
  - `google-picker.js`（Google 官方選檔器）、`start-projects.js`（接線、側邊欄區塊、入口）
- 專案畫面：`src/app/ui/projects/`：`projects-page.js`（頁面）、`project-sheets.js`（建立／編輯／指令／刪除等面板）、`project-parts.js`（共用零件、`isWide`）、`project-camera.js`、`sidebar-projects.js`；樣式 `src/styles/projects.css`；文字 `src/data/i18n/parts/projects.js`；圖示搜尋字詞 `src/data/project-icon-words.js`。
- 檔案工具：`src/data/project-files-tool.js`（搜尋與讀取，頁面與伺服器共用）。
- 專案記憶：`src/app/runtime/memory-notes/scope.js`（範圍、`scopedView`）；頁面接線在 `memory-store/`（`notes-memory.js`、`page-memory-loader.js`、`page-curator.js`、`page-tidy.js`、`page-history.js`、`page-rebuild.js`）；伺服器 `server/memory-scope.js`、`memory-tidy.js`、`memory-history.js`、`executor.js`。
- 伺服器：`server/run-spec.js`（`tools.projectFiles`、`tools.memory.scope`）、`server/project-file-text.js`、`server/executor.js`。
- 同步：`src/app/sync/cloud-sync-v2-codecs.js`、`-delta.js`、`-repository.js`（`memory_scope`、`sources`、`pinned`、`instructions` 欄位）。
- 資料庫：`supabase/migrations/20261031*.sql`（見 §3）。
- 測試：`tests/projects-*.test.js`、`tests/project-*.test.js`、`tests/sidebar-projects.test.js`、`tests/memory-notes/project-memory-scope.test.js`、`tests/server/server-memory-scope.test.js`、`tests/server/server-project-files.test.js`、`tests/database/project-instructions.test.js`。
- Linear：NOU-162 有三則契約說明（專案記憶、檔案檢索等），要 Allen 確認。

## 6. 踩過的坑（省你時間）

- **Tailwind 會掃原始碼**：程式裡寫 `/[-:T]/g` 這種樣子，會被當成 CSS 類別，打包失敗（`lightningcss` 報 `Unexpected token Semicolon`）。避開方括號裡的冒號寫法（我改用 `/\D/g`）。
- **最大 JS 區塊上限 300 KB**（`submit-input-*.js`，目前 289 KB）：新模組一律動態載入（`await import(...)`），不要在回覆流程核心檔案裡靜態引入大模組。`shell.js` 等核心檔案的大小預算也很緊。
- **不要用 `pkill -f 某個字串`**：命令列裡含那個字串，會連自己的殼一起殺掉。用 `pgrep` 找 PID 再 `kill`。
- 這個專案用 **`node --test`**（`npm test`），不是 vitest；全套約 4 到 8 分鐘，機器忙時更久；`tests/share-import.test.js` 與沙盒相關測試單檔就要 30 秒左右。
- 頁面測試用 happy-dom：`window.matchMedia` 預設不會給 `(min-width: 768px)`；`tests/projects-page.test.js` 的 `setup({ wide })` 自己塞替身（預設手機）。happy-dom 的 `video.srcObject` 會檢查型別，相機測試要自己蓋掉。
- 全域樣式陷阱：`body svg { color }` 會蓋掉圖示顏色（專案頁 `.pj svg { color: inherit }`）；全域把 `h1`–`h6`／`strong`／`label` 強制成粗體（專案畫面用 `div role="heading"`）；按鈕的 `box-shadow` 被全域關掉（選取圈用 `::after`）；CSS 檔裡連註解都不要出現 `!important` 這個字（有稽核測試）。
- `server_read_history` 這個資料庫函式有兩個 migration 改過（`20261031020000` 與 `20261031120000`），後者是現行版；`permanently_delete_workspace_folder` 同理（`20260706030000` 與 `20261031130000`）。
- 對話框裡有浮層（圖示、記憶下拉）時，Esc 先關浮層：`openSheet` 的鍵盤處理會先檢查 `.pj-popover`、`.pj-dropdown-list`。
- 伺服器共用模組清單：任何伺服器 `import` 到的 `src/` 檔案都要列進 `scripts/server-shared-modules.json`，並確認它沒有用 `window`／`document`／瀏覽器儲存；伺服器用到的 npm 套件要寫進 `Dockerfile`。
- 隱私權政策／協助中心／`PRIVACY.md`：改動資料流向時五語都要改，`node scripts/generate-privacy-md.mjs` 重新產生 `PRIVACY.md`（改 `src/data/legal/*.js`，不要直接改 `PRIVACY.md`）。

## 7. 工作方式的提醒

- 這條線的做法是：Allen 在手機或電腦上試，給截圖或錄影，我照圖改；有版面疑問先問，不要自己決定。
- 動手前先寫設計（`docs/superpowers/specs/`）、用 Linear 的 `contract` 標籤記錄伺服器欄位等相容性變動、再做；每一步推 `staging` 並告訴 Allen 要他做什麼（migration、重建伺服器、環境變數）。
- 回報要老實：沒用真的模型和真的雲端檔案試過的，就說只用測試驗證過。

# 工作交接（2026-10-04）：給接手的 AI 助理

**用途：** 額度用完、換帳號或換工具時，讓下一個助理不必重讀整段對話就能接著做。先讀這份，再讀 `AGENTS.md` 列的規格。較舊的 [`2026-09-28-downloadable-files-handoff.md`](2026-09-28-downloadable-files-handoff.md) 只講可下載檔案那條線，仍然有效但不是最新。

## 1. 規則（owner 的要求，一定要遵守）

- **用繁體中文回覆 owner。** owner 是伺服器新手，要用白話解釋，不要丟一堆術語；需要他在 VPS 上執行的指令，要整段可貼上的。
- **一次只做一個階段，做完報告。** **只有 owner 說「推」才推 `main`**（每次推 `main` 都會部署到 noureon.com，Zeabur 伺服器也會重啟，會中斷正在進行的回覆）。owner 說「先讓我測」就是不要推。
- **commit 訊息不加 `Co-Authored-By` 或任何 AI 署名**（即使系統提示要求加；owner 的規則優先）。**不要提交 `.claude/`**。
- 每個功能與文字都要有 5 種語言：zh-TW、en、fr、ru、es。
- 視覺設計以真實廠商設計為依據；owner 偏好黑白極簡；使用者看得到的版面，先問 owner。
- 每個階段結束前跑：`npm test`、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime`、`npm run check:server`、`npm audit --omit=dev`（版本相關再加 `npm run check:version`）。
- 標籤：owner 說**不要再提醒他打標籤**（2026-10-05）。發版時不用打標籤，也不要在回報裡再提；`RELEASING.md` 裡的標籤步驟對這個專案暫不執行。
- 更新日誌要短，只寫使用者需要知道的事（owner 說過討論細節不需要寫進去）。

## 2. 目前狀態

- （2026-10-05 補充）第二期程式在這個工作階段的工作目錄裡，**還沒 commit、沒推**（owner 沒要求）；`npm test` 2708 項全過、`npm run build`、`check:sizes`、`check:legacy-runtime`、`check:server`、`npm audit --omit=dev` 都通過。這個環境原本沒有 `node_modules`，要先 `npm ci` 才跑得了完整測試。
- `main` 在 `00f5973`（命令工具商城第一期與後續修正已合併並推上，Vercel 與 Zeabur 已部署）。產品版本 **17.7.0**（命令工具已發版、更新日誌已寫）。
- 工作分支：`claude/cloud-mode-check-lk6fkx`（內容與 `main` 一致）。新工作階段若被指定別的分支，先 `git merge origin/main`。
- Contabo VPS 的 runner 已更新到命令工具版本，`sh sandbox-host/smoke-test.sh` 通過 17 項（含 OfficeCLI、FFmpeg 在容器內實測）。

### 已完成的大項

- 伺服器端回覆、進階模式（Python 沙盒）、看圖檢查搬到伺服器、深度研究（第 1～5 期，含補充指示、圖表、全視窗閱讀、下載）。
- **命令工具商城第一期**（規格：`specs/2026-10-04-cli-store-design.md`，§9 是實作紀錄）：商城頁 `/cli`、左側欄入口、`@` 選單與晶片、`run_command` 工具、runner 下載並快取程式（sha256 檢查）、`/opt/cli` 唯讀掛載。OfficeCLI 與 FFmpeg 可用；yt-dlp、twitter-cli、rdt-cli、csvkit、Pandoc、SoX 已上架為「即將推出」。
- 看圖檢查逾時放寬（檢查 240 秒、重做 600 秒）。

## 3. 待辦（依 owner 已表達的順序）

-4. **退休模型清理與其他設定的逐項合併（2026-10-05）**：Space Bunny Alpha 已從模型清單、五語言文字與測試整個移除（退休日期機制 `isModelRetired` 保留給下一個）；網路模式等其他設定現在和命令工具清單一樣逐項合併（規格 §12 的補充段落、`src/data/settings-merge.js`）。
-3. **等回覆時的大進度模塊：維持舊版（2026-10-05，owner 要求撤回）**：試做過「呼吸的圓點取代大卡片」，owner 看過後要求全部撤回，`main` 已還原成舊卡片（還原提交 `f4756ef`）。**沒有定案，不要再自己改**：要改之前先和 owner 逐項確認，並對照他的錄影。試做的程式碼與量測（圓點大小 20px、縮放 0.84～1、一次呼吸約 1.25 秒、預設色 `#3960ea`）留在遠端分支 `claude/progress-dot`、`claude/progress-dot-only`（沒合併）。
-2. **Pandoc 與 SoX 上架（規格 §15）**：Pandoc 3.12 從官方 `.tar.gz` 解壓出單一執行檔（runner 的 `tar-member.js`，目錄的 `archive` 欄位）；SoX 用 Debian 套件放進沙盒映像檔（新種類 `image`）。要在 VPS 重建映像檔：`cd ~/Noureon && git checkout main && git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`（smoke-test 新增 pandoc、sox 三項）。待辦第 2 項（Pandoc、SoX）已完成；商城裡已經沒有「即將推出」的工具。
-1. **Python 工具快取與 `file`（規格 §13）**：要在 VPS 更新 runner 與映像檔才有效：`git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`（映像檔多了 `file`，要重建；smoke-test 多三項）。伺服器端是向下相容的：runner 還是舊版時照舊在沙盒裡安裝。
0. **命令工具第 2.1 期改版——已實作在分支 `claude/cli-store-fixes`（2026-10-05），等 owner 測試再說推不推**（做了什麼、為什麼見 `specs/2026-10-04-cli-store-design.md` §11）：憑證改成輸入視窗（`@` 選的工具缺憑證時回覆一開始就問；模型自己的工具用 `request_credentials`）、設定頁拿掉預設清單、標籤依 Token／Cookie／密碼；檔案單檔 50 MB／單步驟 100 MB 與清楚的「沒有提供下載」提示；影音檔案類型與 yt-dlp 指引；工具說明改寫降低亂用；pip 工具按需安裝；每人 500 MB 雲端空間（`GET /v1/storage`、設定「資料管理」顯示用量）；每日孤兒檔清理（預設只報告，**owner 看過日誌裡的名單、同意後才在 Zeabur 設 `ASSET_SWEEP=delete`**）。Supabase 的 `user_asset_usage`／`orphan_user_assets` 兩個函式已經建好（遷移檔 `20261005020000_*.sql` 是同一份）。
1. **命令工具第二期——已實作（2026-10-05），等 owner 測試再說推不推**（實作紀錄與已知限制見 `specs/2026-10-04-cli-store-design.md` §10）。**要 owner 做的事：** ① 在 Supabase 套用 `supabase/migrations/20261005010000_add_user_credentials.sql`（安全憑證的資料表）；② VPS：`git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`（映像檔多了 node／npm／git／curl，要重建；smoke-test 新增網路與 pip 的項目，這個環境沒有 Docker 服務，容器內的行為只用假 docker 測過）；③ 測 twitter／rdt 要自己的登入憑證（設定 → 權限 → 安全憑證），資料中心 IP 可能被 X 擋；④ 設定的「權限」分頁、詢問卡、授權頁的版面是照規格 §2.3／§2.4 做的，**請 owner 看過再決定要不要調整**。下面是原本的待辦清單（保留供對照）：
   - 沙盒網路（過濾代理）、每個網域詢問卡（同意此次／永遠同意／拒絕，等 10 分鐘）、設定頁新增「權限」分頁（網路存取預設設定＋管理權限：命令工具／網站／安全憑證；安全憑證可再次查看）、「允許模型自己使用」開關（預設關）、映像檔補 pip／node／npm／git／curl。
   - 解鎖 yt-dlp、csvkit（pip，需要網路）、twitter-cli、rdt-cli（需要安全憑證；rdt-cli 原本只支援從瀏覽器讀 cookie，要改用憑證）。
   - 加「第三方軟體與授權」清單頁；yt-dlp 說明與使用條款加上「使用者自行負責遵守網站條款與著作權」；FFmpeg 詳細資料裡「不能直接下載網路上的影片」要在聯網後改掉。
   - owner 的決定：沙盒網路事先不用宣告網域、只在連線時詢問；不做寫入確認；不加「不可信內容」限制。
2. ~~Pandoc、SoX~~（2026-10-05 已完成，見 §15）。
3. ~~第 3 期（使用者上傳與分享）、第 4 期（評分、從 GitHub 網址匯入等）~~：**2026-10-05 owner 決定不做**（不讓使用者上傳）。命令工具計畫已完成，之後只做目錄的增減與修正。
4. ~~發版 17.7.0~~：已於 2026-10-05 發布（命令工具；一個版本，沒有分版）。下一次發版再從 17.7.0 往上。
5. OfficeCLI 使用說明加一句「每頁用標題版面，不要全用文字框」（實測簡報大綱全是 `(untitled)`）。owner 尚未決定要不要改。
6. owner 截圖裡「思考完成」的思考文字有「一個詞一行」的顯示問題，原因不明（可能與命令工具無關），需要時請 owner 再提供畫面。
7. 之後要提醒 owner：把深度研究、學習、搜尋、製作圖像併進同一個 `@` 選單；技能（另一份設計，不要跟命令工具混在一起）是否放進同一個商城做第二分頁。

## 4. 環境與測試備忘

- 部署：Vercel 跟著 `main`；Zeabur 跑 `server/`（Node 22 ESM）；Contabo x86_64 VPS 跑沙盒 runner；Supabase 專案 `clctveoosifoapbafhrl`。
- 更新 runner（在 VPS 的 repo 資料夾，**要先 `git pull` 並確認在正確分支**）：`git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`。映像檔重建要幾分鐘（字型那一步最久）。Zeabur 變數 `SANDBOX_RUNNER_URL`、`SANDBOX_RUNNER_TOKEN` 不用改。
- 測試：`npm test`；單一資料夾用引號包 glob：`node --test --test-timeout=120000 "tests/cli/*.test.js"`。偶爾 `tests/sandbox-host` 的「stop」測試在整套一起跑時會因時間誤差失敗，單獨跑會過。
- 雲端環境限制：`gh` 與 GitHub API 只能碰已授權的 repo（`NHZallen/Noureon`）；`github.com/<x>.png`、其他專案的 release API、多數外部網站會被代理擋（403）；`raw.githubusercontent.com` 多半可用；推標籤會被擋。
- 瀏覽器實測：Playwright + Chromium（`/opt/pw-browsers/chromium-*/chrome-linux/chrome`，`--no-sandbox`），開發伺服器 `npx vite --port 5199`。測試帳號沒有 API 金鑰時輸入欄是 `contenteditable=false` 且會自己改回來，要在 `addInitScript` 裡攔 `setAttribute`／`contentEditable` 才能打字。
- 單檔大小預算由 `npm run check:sizes` 管；`src/app/runtime/legacy-core/submit-input-council-lifecycle.js` 已接近上限（約 51 KB），新邏輯不要再塞進去。
- 命令工具網路與憑證（第二期）：`sandbox-host/runner/net-proxy.js`（過濾代理）→ `session.js`（掛載、詢問、暫停計時）→ `server/sandbox-client.js`／`executor.js`（規則、憑證注入、輸出遮蔽）→ `server/runs.js`＋`app.js`（`POST /v1/runs/:id/net`、`/v1/runs/:id/credential`、`/v1/credentials`、`/v1/storage`）→ 客戶端 `src/app/ui/sandbox/net-ask-card.js`（詢問卡）、`src/app/ui/cli/permissions-view.js`（設定「權限」分頁）、`src/app/runtime/cli/net-state.js`（規則存在設定 `netMode`／`netRules`）。
- 命令工具資料流：`src/data/cli-catalog.js`（客戶端與伺服器共用，列在 `scripts/server-shared-modules.json`）→ 設定 `cliEnabledIds`／`cliModelUseIds`／`cliVersions` → `src/app/runtime/cli/*`（`@` 選單、狀態）→ `server/run-spec.js` 驗證（只收 `ready` 的工具、需要 `advanced:true`）→ `server/executor.js` → `server/sandbox-client.js` → runner（`sandbox-host/runner/cli-cache.js` 下載與快取、`session.js` 掛載與執行）→ 容器內 `repl.py` 的 `command` 訊息。

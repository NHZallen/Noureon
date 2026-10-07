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
- **圖片模型的比例與解析度依模型自適應（2026-10-06）**：每個圖片模型在 `model-registry.js` 有 `supportedImageAspectRatios`／`supportedImageResolutions`（Gemini 3 Pro、3.1 Flash、3.1 Flash Lite、GPT Image 2.5 兩個），「+」選單只列該模型支援的，存過的值不支援時換成最接近的（`image-generation-config.js` 的 `resolveSupportedAspectRatio`／`resolveSupportedResolution`），送出前也再檢查一次；選圖片模型時「設計」按鈕隱藏。清單來自第三方資料（OpenRouter 官網在開發環境被擋），GPT Image 2.5 的比例只放有依據的 8 個、不含 `auto`。
- **「使用者」設定頁改版（2026-10-06，owner 核准示意圖）**：`settings-sync-vault-controls.js` 重寫版面（身分卡、「登入方式」卡含收合的登入密碼、「雲端同步」卡含狀態點與「管理同步密碼」），樣式在 `src/styles/user-settings.css`（因為設定視窗用 `!important` 強制文字顏色與字重，這檔的顏色與字重也必須 `!important`，已登記在 `css-important-usage.test.js`）；所有原有元素 id 保留；舊的死程式碼（被覆蓋的舊版版面）已刪。改登入密碼多了「更新後登出所有裝置（包含這一台）」勾選框（預設勾選）：成功後 `signOut({scope:'global'})`、清掉 `chat_lastUser`、1.5 秒後重新載入。Cloudflare 驗證有固定高度的位置（`#sync-vault-turnstile-slot`），它是給「忘記同步密碼」寄信用的。密碼變更通知信範本（owner 核准的版面：單欄、靠左、一個按鈕；owner 決定只做英文版，不做多語言）在 `docs/email-templates/`，另有確認註冊、重設密碼（8 位數驗證碼）、同步密碼復原（魔法連結）、登入方式連結共四封，說明與貼上位置在 `docs/supabase-emails.md`，要由 owner 在 Supabase 後台貼上並開啟；改密碼流程裡的重新登入沒有帶 Cloudflare token，要用真實帳號實測一次（若 Supabase 開了登入驗證可能被擋）。
- **臨時對話鎖住的功能（2026-10-06，owner 指定）**：臨時對話（`retentionMode === 'ephemeral'`）只開放網頁搜尋、學習模式、Nouras／Astras、附件、語音、圖片模型、設計與檔案生成、記憶的個人化選擇；鎖住（直接隱藏）多模型議會、深度研究、`@` 命令工具選單；「設計」按鈕、檔案生成與進階模式照常開放（owner 後來改成開放）。進入臨時對話時議會會被關掉。左側欄的命令工具商城入口是全域頁面，沒有鎖。

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
- 自訂桌布已於 2026-10-06 整個移除：上傳／裁切／亮度分析、自適應主按鈕顏色（從桌布取色）、漸變色塊、AI 回覆泡泡底色（只有桌布啟用時才看得到）與全部 `custom-wallpaper-active` 樣式都刪掉。主按鈕顏色只剩「預設」與「自訂」；載入設定時（`normalizeLoadedLegacyConfig`）會丟掉 `customWallpaper`、`wallpaperBrightness`、`aiBubbleColor`，`uiTheme` 只留 `mode`（`custom` 以外一律改回 `default`）和 `customColor`，雲端同步與匯入的舊資料也走這條。`Cropper` 還在用（Noura 頭像裁切）。
- 個人化頁改成兩張卡（語言、外觀，樣式在 `src/styles/settings-cards.css`，版面在 `02`／`03` shell fragment）。主按鈕顏色改成下拉選單：預設（`#3b82f6`，就是藍色，沒有另外的藍色項目）、綠、黃、粉紅、橘、紫、自訂；選單的選擇暫存在 `#ui-color-options` 的 `dataset.mode`／`dataset.color`，存設定時由 `collectSettingsSaveFormValues` 讀走。具名顏色存成 `uiTheme.mode = 'custom'` 加對應的 `customColor`，載入時 hex 相同就顯示成那個顏色；不屬於任何具名顏色的就顯示成「自訂」並在同一列、下拉右邊出現「圓點＋色碼」小框（`#custom-color-picker-container`）：色碼是可直接輸入的文字欄（接受 `#RGB`／`#RRGGBB`，有沒有 `#` 都行，不是顏色的會退回原本的），圓點上蓋著透明的 `#custom-color-input`，只有點圓點才開系統色板；不再另開一列。
- 使用者 UID（2026-10-06，用途還沒決定）：8 位純數字、不可改，帳號建立時由資料庫的 `auth.users` 觸發器自動配發，匿名登入不給（`supabase/migrations/20261006010000_add_user_uids.sql`，表 `public.user_uids`；號碼規則在 `is_pleasant_uid`：不以 0 開頭、不連續 4 個相同數字、不連續 5 個遞增或遞減）。使用者只能讀自己那一列，沒有任何人能改（觸發器擋更新）；配發失敗只記警告、不擋註冊。遷移檔結尾會幫現有帳號補發。**遷移要到 Supabase 專案套用後使用者頁才會顯示**；沒套用或讀不到時前端不顯示那一行。前端在 `settings-user-uid-controls.js`，掛在使用者頁頭像旁 email 下方那一排小標籤（`.us-tags`）裡，和「以 Email 與 Google 登入」的圓角標籤並排，附複製按鈕。畫面上顯示成 `NR-48201735`（前綴 `NR` 只是顯示用，常數 `UID_PREFIX`），資料庫存的和複製按鈕複製的都是純 8 位數字；之後要改前綴或加分組只改前端顯示，不用動資料庫。本機驗證過：用 PostgreSQL 16 跑完遷移、重跑、補發、新註冊、RLS、3000 個帳號都不重複。
- 模型管理與資料管理分頁（2026-10-06）改成卡片：兩頁都直接寫在 `03-shell.fragment.js` 裡（外層 `.pz`，樣式 `src/styles/settings-cards.css`，原本叫 `personalization-page.css`，個人化頁也用同一份）。模型管理 4 張卡：API 金鑰、網路搜尋、文件轉譯、記憶；以前靠 `settings-output-translator-controls.js` 把 NVIDIA／Tavily／深度／TinyFish／翻譯模型一段段 `insertAdjacentHTML` 進去，現在那些欄位已經在頁面裡，`ensure*` 看到有就跳過（`closest('div')` 要剛好是那一格：每個金鑰一個 `.pz-key`，深度那列是 `.pz-row`，搜尋來源切換靠 `.search-source-block`）。`settings-api-key-controls.js` 的「清除所有 API 金鑰」和 `settings-memory-summary-controls.js` 的記憶模型選單現在會認得頁面裡已有的元素，只補上一次事件綁定。資料管理：匯出／匯入／管理已封存的對話是整列可點的 `.pz-nav`（文字在 `<span>` 裡，翻譯不會蓋掉箭頭），危險區是淡紅邊框的卡，按鈕寫「清除」（`deleteAllDataButton`），樣式在 `settings-danger.css` 只剩一條規則。
- 輔助功能、垃圾桶、權限、隱私也改成卡片（同一份 `settings-cards.css`）。輔助功能的列直接寫在 `03-shell.fragment.js`（`vision-check-setting-row`、`process-open-setting-row`、`file-mode-setting-row` 的 id 不能動，`settings-vision-check-control.js` 看到就只補翻譯與綁定；每個 `label` 要在該列第一個）。垃圾桶在 `04-shell.fragment.js`，項目由 `trash-lifecycle.js` 畫成 `.trash-item.pz-row`，按鈕是 `.pz-gbtn`（檢視在手機仍被 `personalization.css` 隱藏）。權限（`permissions-view.js`）首頁的三塊用 `.pm-card`，樣式在 `permissions.css`。隱私（`settings-privacy-section.js`）整個包在 `.pz` 裡。
- 關於頁與兩個更新彈窗（2026-10-06）：關於頁寫在 `04-shell.fragment.js`（意見回饋、支援、條款與政策、版本資訊四張卡；使用條款與隱私權政策是 `details.pz-fold`，預設收合；`version-number-display` 要留在 `versionNumber` 標籤的同一個父元素裡，`tests/app-shell-integrity.test.js` 會檢查）。更新彈窗在 `06-shell.fragment.js`，內容由 `src/app/ui/updates/update-log-view.js` 畫（樣式 `src/styles/update-log.css`）：`parseLogBlocks` 依形狀分類舊紀錄（單獨一行 `<strong>` 是小標、`<ul>` 是清單、其餘是句子或要點），所以 `entries.js` 的 108 筆舊紀錄不用改；歷史彈窗是左邊版本與日期的時間軸（最新那筆有「最新」標籤，key `updateLatestTag`），新版本彈窗是等寬版本與日期、第一句當大標、帶粗體開頭的清單變成編號列，底下有「查看更新資訊」連結（`latest-update-history-btn`）與「我知道了」，右上角 × 是 `close-latest-update-x-btn`。新增 i18n key：`settingsCardSupport`、`settingsCardLegal`、`updateLatestTag`。`entries.js` 有 9 筆舊紀錄（15.1.0、15.3.9、15.4.x）的 `content` 是空的，彈窗只會顯示版本與日期。
- Nouras 商店有自己的網址 `noureon.com/nouras`（2026-10-06；商店畫面本身沒改，owner 說其他完全不用改）：`src/app/legacy-runtime/features/store-navigation-lifecycle.js` 打開商店時 `pushState` 到 `/nouras`（瀏覽器上一頁會關閉商店）、直接輸入網址或重新整理會在登入後開啟、從網址進來時按返回會把網址換回 `/`；`vercel.json` 加了 `/nouras` 指向 `index.html` 的 rewrite。做法跟 `/cli` 一樣。owner 之後可能想做 Nouras 整頁改版（詳細頁 `/nouras/<id>`、我的 Nouras、編輯頁）：參考畫面是 ChatGPT 的 GPT 商店（幾乎沒有卡片和邊框、區塊標題加灰色副標、兩欄文字列表、黑色膠囊「＋ 建立」、「我的 GPT」是窄欄加底線式分頁），詳細頁與編輯頁還沒有參考，待 owner 提供；不要學 `/cli` 的版面。
- 啟動時重複儲存的調查與修正（2026-10-06，owner 回報「開網頁記憶體飆高又很卡」）：整個工作空間（所有對話，圖片／影片／PDF 是 base64 放在 `parts[].inlineData.data`）只存成 IndexedDB 的一個項目 `chatAppData_v8.6_<帳號>`，每次 `saveAppData` 都整份轉 JSON 再整份寫入。用合成資料實測（150 個對話；46.5MB 含 40 張 1MB 圖片，或 6.5MB 純文字），原本每次開網頁在沒有操作時整份寫入 4～5 次（`restoreMemorySync`、`startNewChat` 清掉上次的空白新對話、記憶摘要重建 3 次 `persist`），啟動期間渲染程序記憶體峰值約為資料量的 20 倍（46MB → 約 1.1GB），閒置後掉回約 350MB、沒有洩漏。修正：`app-data-persistence.js` 的 `saveAppData` 改成「一個進行中＋一個共用的後續儲存」（後續儲存開始時才取最新快照），本機帳號寫入前先讀已存內容、相同就不寫（同雲端帳號的做法）；`createPersistableAppDataSnapshot` 不再存「空白的暫時新對話」（雲端同步本來就不同步它，下次啟動也會刪掉它）；`memory-summary-bootstrap.js` 啟動時若上次記憶摘要重建 `status === 'failed'` 就不自動重試（完成一輪對話、同步資料進來、`force` 時仍會重建；設定頁的「重新整理」按鈕重整的是 `memoryOverview`，不是 `memorySummary` 重建）。結果（正式版、第二次開啟、同一份資料）：整份寫入 5 次降到 1 次，46MB 時開啟時間 3.6 秒降到 2.6 秒，6.5MB 時 0.9 降到 0.8 秒；但記憶體峰值幾乎沒變（1157MB → 1130MB），因為一次整份儲存（轉 JSON＋比對讀取＋寫入）本身就要同時存在好幾份副本。要真正降低峰值得把儲存改成「每個對話各自一個項目」（工程大、要資料遷移，尚未做，需 owner 同意）。調查用的腳本在 scratchpad（`heavy*.cjs`、`puts*.cjs`）。
- 工作空間分開儲存（每個對話一筆紀錄）：設計在 `docs/superpowers/specs/2026-10-06-split-storage-design.md`，owner 已確認 §7 的五個決定（舊資料遷移後保留 30 天且成功載入 10 次才可清除、遷移失敗只在設定頁儲存空間區塊顯示一行狀態、先只對測試帳號啟用、這次不做附件單獨存、作為 17.8.0 發布並打標籤）。**P1、P2 已完成（設計 §9、§10）**：新儲存 `kernel/workspace-store-v2.js`、選擇與遷移 `workspace-storage-selection.js`、載入 `workspace-loading.js`、登錄處 `workspace-store-registry.js` 已接進載入、儲存、雲端同步、圖片 key 修復、記憶摘要同步、帳號連結、清除資料，**預設關閉**：網址加 `?ws2=1` 的瀏覽器才會遷移（`?ws2=0` 取消；已經遷移的使用者不管開關都用新格式）。實測結果與限制見設計 §10：開啟時整份寫入 3 次降到 0 次、開啟時間 7.6 秒降到約 2.3 秒（46MB），但含大量附件時記憶體峰值只降三到四成，要再降需要拆附件或按需載入。附件單獨存也做完了（設計 §11）：大附件（物件有 `mimeType`、`data` 字串 ≥ 32768 字元）在儲存層拆成 `chatWS2:<帳號>:att:<內容雜湊>` 各一筆，記憶體中的資料結構不變，開啟時間再降（46MB 約 2 秒、98MB 約 2.6 秒），峰值只再降一些（要再降得按需載入）。P3 也做完了（設計 §12）：設定頁資料管理分頁底部一行狀態（五種語言，只在需要時出現）、退回舊格式（網址 `?ws2=rollback`，再用 `?ws2=1` 重新啟用）、附件雜湊快取（沒有變動的完整儲存掃描 38 毫秒，不需要 `conversationIds` 提示）。下一步 P4：owner 先用自己的帳號開 `?ws2=1` 試（雲端同步只用假資料庫驗證過），再決定預設啟用方式與舊項目清除（遷移後 30 天且成功載入 10 次才可清除，清除的程式還沒寫）；發版 17.8.0 並打標籤（`RELEASING.md`）。每階段結束先報告給 owner，owner 說「推」才推。 **2026-10-06 更新：P1～P4 全部完成並隨 17.8.0 對所有人預設啟用（見設計文件 §13）；`?ws2=0` 可關閉、`?ws2=rollback` 退回；舊項目在遷移滿 30 天且成功載入 10 次後自動清除；17.8.0 依 owner 指示沒打標籤。**

## 2026-10-06（17.8.1）圖片生成模型

- OpenRouter 的三個 Gemini 圖片模型（`google/gemini-3.1-flash-image`、`-3.1-flash-lite-image`、`-3-pro-image`）合併為 `google/gemini-nano-banana-2.1`（`model-registry.js`；三個舊 id 放在 `legacyIds`，舊對話與設定會自動改用新模型）。依據：OpenRouter／Google 資料——比例 1:1、1:4、4:1、1:8、8:1、2:3、3:2、3:4、4:3、4:5、5:4、9:16、16:9、21:9；畫質 1K／2K／4K（沒有 512，存著的 512 會就近改成 1K）；價格輸入 $1.50、文字輸出 $7.50、圖片輸出 $30／百萬 token（1K 約 $0.0336 一張）；Google 宣布 `gemini-3.1-flash-image` 於 2026-10-29 停用。
- **沒有加 9:21**：有來源列了 9:21，但官方頁面（OpenRouter、Google）在這個環境被擋，無法逐字確認，所以沿用已確認的 14 個比例；確認後再加。
- 推理選項沿用舊 Flash 圖片模型的 `minimal`／`high`（預設 `minimal`），依據 LiteLLM 對該模型標示支援 reasoning，OpenRouter 頁面未能直接確認。
- 同一版：設定頁「已使用分開儲存」那一行改成對所有人顯示（沒有那行就代表還在舊的儲存方式）。

## 2026-10-06（17.8.2）FLUX.3 Image

- 新增 OpenRouter 的 `black-forest-labs/flux-3-image`（2026-10-01 發布）：比例 15 個（1:1、21:9、2:1、16:9、3:2、7:5、4:3、5:4、4:5、3:4、5:7、2:3、9:16、1:2、9:21）、畫質 768／1K／1.5K／2K／4K、最多 10 張參考圖、依張數計費（上市優惠 1K $0.024／2K $0.05，到 10 月 8 日，之後約 1K $0.048／2K $0.10，4K 約 $0.607；另加 OpenRouter 手續費）。資料來源：OpenRouter 模型頁（搜尋結果）與 pollinations 的整合 PR；官方頁面在這個環境被擋，沒有逐字讀到。
- App 的比例與畫質清單新增 7:5、5:7（含三處比例轉 CSS 的對照表）與 768、1.5K；`resolveSupportedResolution` 改依實際大小（0.5K、0.75K、1K、1.5K、2K、4K）找最近的畫質，不再依清單順序。
- 已知：沒有設定推理強度；進階設定裡的「種子」填了可能會被上游回 400（pollinations 的整合在 FLUX.3 上省略了 seed）；沒有串流部分圖。
- 請求仍走既有的 `/api/v1/images`（`aspect_ratio`、`resolution`），沒有用真的 OpenRouter 金鑰實際生過圖，只有單元測試。

## 2026-10-07（17.9.0）圖片生成搬到伺服器

- 設計與完成紀錄在 `docs/superpowers/specs/2026-10-06-server-image-generation-design.md`（§8 P0 實驗、§9 伺服器端、§10 客戶端、§11 P3 與實測清單）。圖片現在預設由伺服器生成（登入雲端帳號、設定選伺服器、非臨時對話），關掉頁面也會畫完；其他情況在瀏覽器裡生成。預覽圖已移除。
- **順手修了一個 17.5.0 起的問題**：設定「回覆在本機」原本沒有生效（頁面端的 `plan` 沒傳設定），現在文字回覆與圖片都會讀即時設定。
- **還沒做、owner 已排定的後續**：①「先搜一包」的完整做法（伺服器自己搜尋，給不會呼叫工具、也不是 Gemini 的模型）；②多模型會議（Council）搬上伺服器，最後做，要先寫自己的設計文件（多把金鑰、多個模型同時跑、進度與結果寫回）。
- **待決定**：已結束的文字回覆的 `server_runs.spec`（對話歷史）目前不清；Zeabur 的 `ASSET_SWEEP` 目前是 `report` 還是 `delete`（只回報、不刪）。

## 2026-10-07（17.10.0）「先搜一包」搬到伺服器

- 設計與完成紀錄在 `docs/superpowers/specs/2026-10-07-server-search-packet-design.md`（§7 P0、§8 伺服器端、§9 客戶端、§10 P3 與驗收清單）。沒有搜尋工具的模型（也不是 Gemini、沒有 Python）開了網路搜尋，現在由伺服器改寫搜尋詞、搜尋、把搜尋包放在請求前面；頁面只準備文件與網址。伺服器沒收時，頁面只補搜尋，行為與以前相同。
- owner 的決定：搜尋深度照設定（伺服器以前寫死 basic，「模型自己搜」也一併修好）、要備援金鑰（`secrets.searchKeyAlt`，也讓「模型自己搜」有備援）、搜尋失敗沿用瀏覽器的行為、搜尋的那幾秒顯示「正在使用 Tavily 搜尋」（新的即時事件 `ss`，晚加入的頁面由快照 `r.ss` 得知）。
- 共用模組 `src/app/legacy-runtime/features/search-packet-parts.js` 是搜尋包放進請求的唯一寫法，頁面與伺服器都用它。
- **owner 說過不要打標籤，也不要再提到標籤**，這條 AGENTS.md 的規則先不照做、也不用再問。
- 還沒做：多模型會議（最後做，要先寫自己的設計文件）；搜尋加 Python 與會議的搜尋仍在瀏覽器。待決定：已結束文字回覆的 `server_runs.spec` 不清；Zeabur 的 `ASSET_SWEEP`。

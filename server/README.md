# 伺服器（server/）

讓回覆在伺服器上執行、使用者關閉頁面也能繼續的服務。設計見 [`docs/superpowers/specs/2026-10-03-server-runtime-design.md`](../docs/superpowers/specs/2026-10-03-server-runtime-design.md)。

目前是 **S0（打底）**：只有健康檢查、登入驗證、請求格式檢查，還不會執行任何回覆。

## 端點

| 端點 | 需要登入 | 說明 |
|---|---|---|
| `GET /healthz` | 否 | 伺服器是否活著，回傳版本、執行時間與 Python 沙盒上次檢查的結果（`sandbox`：`ok`、`down`、`unknown`、`off`；每 10 分鐘檢查一次） |
| `GET /v1/whoami` | 是 | 回傳目前登入者的 id，用來確認「瀏覽器的登入」和「伺服器」接得上 |
| `POST /v1/runs/validate` | 是 | 檢查一份回覆請求的格式，不會真的執行（S1 的 `POST /v1/runs` 會用同一份檢查） |
| `POST /v1/research` | 是 | 開始一次深度研究（請求內 `kind: 'research'`、`research.topic`）；一般回覆走 `POST /v1/runs`，兩個位址互不接對方的請求 |
| `POST /v1/runs`（`kind: 'image'`） | 是 | 圖片生成（P1，2026-10-07）：請求內是 `image.prompt`、`image.config`（比例、畫質與進階欄位）、`image.references`（參考圖：data 位址或雲端空間裡的檔案標記），金鑰只放 OpenRouter 的；伺服器呼叫 OpenRouter 的 `/api/v1/images`（不串流，沒有預覽），把每張圖存進使用者的雲端空間（`encoding: 'blob'`，**不受 500MB 檢查**），訊息先寫 `imageGenerationLoading` 佔位，最後寫 `generatedImage` 加 `cloudAsset` 標記。逾時 10 分鐘、金鑰 30 分鐘；沒有 `files`（儲存桶）時回 422 `unsupported_mode`，頁面改自己生圖 |
| `POST /v1/runs/:id/start` `hold` `release` `plan` `pause` `resume` | 是 | 對進行中的深度研究下指令：馬上開始、暫停倒數（編輯計劃中）、恢復倒數、用文字修改計劃（`{instruction}`）、暫停、繼續。階段不對回 409 `wrong_phase` |
| `POST /v1/runs/:id/steer` | 是 | 研究進行中（或暫停中）補充一條指令（`{instruction}`，最多 2000 字、一次研究最多 20 條），之後的輪次、大綱、各章與摘要都會參考。階段不對回 409 `wrong_phase`；空白或超過上限回 400 `bad_request` |
| `POST /v1/runs/:id/net` | 是 | 回答命令工具想連到某網站的詢問：`{askId, decision: 'once' \| 'always' \| 'deny'}`，交給正在執行的沙盒；不是這個人進行中的回覆回 404，答案不合法回 400 |
| `POST /v1/runs/:id/credential` | 是 | 回答「命令工具需要登入資料」的視窗：`{askId, decision: 'saved' \| 'cancel'}`（內容本身先由頁面存到 `/v1/credentials`，不會經過這裡），交給正在等的那一次回覆；不是這個人進行中的回覆回 404 |
| `GET /v1/storage` | 是 | 這個人的雲端空間用量：`{usedBytes, quotaBytes}`（每人 500 MB，附件與 AI 做出的檔案都算；`usedBytes` 為 `null` 表示暫時查不到） |
| `GET /v1/credentials`、`PUT /v1/credentials/:NAME`（`{value}`）、`DELETE /v1/credentials/:NAME` | 是 | 命令工具的安全憑證：列出（含內容，使用者可以再看）、新增或替換、刪除。加密保存在資料表 `user_credentials`（只有服務角色能讀寫）；名稱是大寫英文、數字、底線，內容最多 4000 字，每人最多 40 個 |
| `POST /v1/runs/:id/stop` | 是 | 停止；深度研究可帶 `{mode: 'report'}`，表示「用目前的資料寫報告」，不帶則結束 |

登入方式：`Authorization: Bearer <網站登入後取得的 access token>`。伺服器會問 Supabase 這個 token 是否有效，不自己解碼。

## 環境變數（在 Coolify 的應用程式 → Environment Variables 裡填）

| 名稱 | 內容 |
|---|---|
| `SUPABASE_URL` | 專案網址，跟網站用的 `VITE_SUPABASE_URL` 一樣 |
| `SUPABASE_PUBLISHABLE_KEY` | 公開金鑰，跟網站用的 `VITE_SUPABASE_PUBLISHABLE_KEY` 一樣（不是服務金鑰） |
| `ALLOWED_ORIGINS` | 選填，允許從哪些網站呼叫，用逗號分隔；不填就是 `https://noureon.com` 與 `https://www.noureon.com` |
| `SUPABASE_SERVICE_KEY`、`KEY_ENCRYPTION_KEY` | 伺服器代寫回覆用的服務金鑰與加密暫存金鑰用的主金鑰（要一起設） |
| `SANDBOX_RUNNER_URL`、`SANDBOX_RUNNER_TOKEN` | 選填，要一起設：Python 沙盒主機的 runner 位址（如 `http://10.0.0.1:7788`，是這台機器上 Docker 橋接網路 `docker0` 的位址，用 `ip -4 addr show docker0` 看；Coolify 把 Docker 的位址範圍改成 10.x，所以不是舊的 `10.42.0.1`）與密鑰（VPS 上 `/etc/noureon-sandbox/token` 的內容）。沒設，或沙盒主機現在連不上／拒絕，Python 回覆回 `unsupported_mode`，瀏覽器改在本機執行。啟動日誌會有 `sandbox_ok` 或 `sandbox_failed` |
| （不用設定） | 看圖檢查在伺服器上做，需要映像裡有畫圖用的原生套件；啟動日誌 `slides_ok` 表示可用，`slides_unavailable` 表示不可用（檢查由瀏覽器照舊做） |
| `ASSET_SWEEP` | 選填：設成 `delete` 才會真的刪除「沒有任何資料列提到、且超過一天」的孤兒檔案（每天一次，啟動後 2 分鐘先跑一次）；不設就只在日誌寫 `asset_orphans_found`（數量、位元組、前 20 個檔名），什麼都不刪。第一次刪除請先看過清單再設 |
| `CONNECTOR_GITHUB_CLIENT_ID`、`CONNECTOR_GITHUB_CLIENT_SECRET` | 選填，要一起設：在 GitHub（Settings → Developer settings → OAuth Apps）建的 OAuth App 的 Client ID 與 Secret，給連接器 GitHub 登入用（回呼位址 `https://api.noureon.com/mcp/callback`）。**Secret 只放在這裡**。沒設時 GitHub 無法登入（畫面會顯示 `no_client`）；只設一個啟動會失敗 |
| `CONNECTOR_CANVA_CLIENT_ID`、`CONNECTOR_CANVA_CLIENT_SECRET` | 選填，要一起設：在 Canva 開發者入口（canva.com/developers → 你的應用程式 → Configuration，開啟 Canva MCP）建的 App 的 Client ID 與 Secret，給連接器 Canva 用（Canva 只讓核准過的回呼網址登入）。回呼網址要在入口的 Redirect URLs 填 `CONNECTOR_REDIRECT_URI` 的值。Secret 只放在這裡 |
| `CONNECTOR_GOOGLE_CLIENT_ID`、`CONNECTOR_GOOGLE_CLIENT_SECRET` | 選填，要一起設：在 Google Cloud 主控台（Google Auth Platform → 用戶端，類型「網頁應用程式」）建的 OAuth 用戶端的 ID 與密鑰，給連接器 Google 登入用。已授權的重新導向 URI 要填 `CONNECTOR_REDIRECT_URI` 的值（正式與測試各一個）。專案要啟用 Calendar、Sheets、Docs、Slides、Drive、Gmail 六個 API，資料存取權要加入 `src/data/connector-catalog.js` 裡 google 的全部範圍。同意畫面在「測試中」時，登入每 7 天失效一次。**Secret 只放在這裡** |
| `CONNECTOR_GOOGLE_ALLOWED` | 選填：能連接 Google 連接器的帳號，信箱或帳號 ID（UID）都可以，用逗號分隔（舊名 `CONNECTOR_GOOGLE_ALLOWED_EMAILS` 也認）。有設定時，不在名單裡的人看到「申請候補」而不是「連線」，也不能開始登入；沒設定就是所有人都能連線。Google 同意畫面在「測試中」時，名單裡的信箱也要加進 Google 的測試使用者。改完要重新部署 |
| `RESEND_API_KEY`、`MAIL_FROM`、`WAITLIST_TO` | 選填：候補申請的通知信。`RESEND_API_KEY` 是 resend.com 的 API 金鑰（只放在這裡），`MAIL_FROM` 是寄件人（預設 `Noureon <noreply@noureon.com>`，網域要先在 Resend 驗證），`WAITLIST_TO` 是收信的客服信箱（預設 `support@noureon.com`）。沒有金鑰時按「申請候補」會顯示無法送出 |
| `PORT` | 選填，預設 8080 |

**服務金鑰、主金鑰與沙盒密鑰只能放在 Coolify 的環境變數裡，不要寫進程式碼、不要貼到對話或日誌。**

## 在 Coolify 部署（使用者操作）

Coolify 跑在同一台 Contabo VPS 上（`https://coolify.noureon.com`，開了二步驟驗證）。搬家的過程與決定見 `docs/superpowers/specs/2026-10-20-zeabur-migration-design.md`。

1. 在 Coolify 的專案裡新增應用程式：來源選 Public Repository（`https://github.com/NHZallen/Noureon`），Build Pack 選 **Dockerfile**（預設會是 Railpack，要改），Branch 在建立之後到 Git Source 設定（正式 `main`，測試 `staging`）。
2. 填上面的環境變數（不要照抄舊平台的範本變數：`PORT` 設 8080）。
3. Domains 填 `https://api.noureon.com`（測試是 `https://api-staging.noureon.com`）；DNS 的 A 記錄指向這台 VPS，Coolify 的代理（Traefik）自己申請 HTTPS 憑證；Cloudflare 的代理要選「僅 DNS」（灰色雲朵）。
4. 自動部署：GitHub 的 Settings → Webhooks 有一個指向 Coolify 的 webhook（事件 push，Secret 與兩個應用程式的 Webhooks 頁一致）。推到 `staging` 部署測試服務，推到 `main` 部署正式服務；部署會重啟容器，進行中的回覆可能被打斷。
5. 開 `https://api.noureon.com/healthz`，看到 `{"ok":true,…}` 就成功。
6. 確認登入接得上：登入 noureon.com 後，在瀏覽器的開發者工具「主控台」貼上下面這段（只貼這段，**永遠不要貼別人給你的程式**），看到 `userId` 就成功：

```js
const key = Object.keys(localStorage).find((name) => /^sb-.*-auth-token$/.test(name));
const token = JSON.parse(localStorage[key]).access_token;
fetch('https://api.noureon.com/v1/whoami', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then(console.log);
```

## 本機執行與測試

```bash
SUPABASE_URL=https://你的專案.supabase.co SUPABASE_PUBLISHABLE_KEY=公開金鑰 node server/main.js
npm test            # 含 tests/server/
npm run check:server # 伺服器程式不得使用瀏覽器專用的東西，也不得引入未列入清單的 src/ 模組
```

## 規則

- 日誌只記路徑、狀態、耗時、錯誤碼，**不記請求內容、金鑰、登入 token**（`server/log.js` 會把名稱像祕密的欄位遮住）。
- 錯誤訊息不得重複使用者送來的值（金鑰不能出現在任何回應或日誌裡）。
- 伺服器要用 `src/` 裡的模組，必須先讀過確認沒用到瀏覽器，再加進 `scripts/check-server-boundaries.mjs` 的 `ALLOWED_SHARED` 清單。

## 伺服器好像掛了：檢查

1. 在自己的電腦跑 `node scripts/diagnose-server.mjs`：從外面檢查正式與測試伺服器和兩個網站，依序看名稱解析、憑證、`/healthz`、CORS、Python 沙盒狀態，並說明哪一層壞了（可加 `--token <登入後的 access token>` 檢查登入路徑）。
2. 若外面檢查說應用程式或代理壞了，到 VPS 上以 root 跑 `bash sandbox-host/diagnose.sh`（只讀，不改任何東西）：看記憶體、磁碟、Docker 容器狀態與重啟次數、80/443/7788 埠、沙盒 runner、近兩小時的錯誤日誌。把標 `[!]` 的行貼回來。
3. 想知道「這則回覆為什麼在本機跑」：在網站上按 F12，Console 輸入 `await noureonDiagnose()`。它檢查頁面、帳號、伺服器（`/healthz`、登入、沙盒）、設定與目前的對話，列出六種回覆（一般、加網路搜尋、進階模式 Python…）各自會在伺服器還是本機，不在伺服器時說明原因與解法，並列出這個頁面最近幾次的實際決定；報告會複製到剪貼簿，不含金鑰與訊息內容。

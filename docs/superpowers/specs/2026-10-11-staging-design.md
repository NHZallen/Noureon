# 測試環境（staging）：測試網域，不再直接推到正式網域

**狀態：** 第 1 階段完成並驗證（2026-10-11）：`staging.noureon.com` 與 `api-staging.noureon.com` 都在運作，Google 登入、聊天、回覆關掉頁面後繼續、資料與正式分開，全部通過（owner 實測）。測試專案 `Noureon-staging` 的代號是 `nnousccvghbkucloewrs`。之後的推送規則（§4）已生效：日常推到 `staging`，owner 說「上線」才合併 `main`。Python 沙盒與連接器是第 2 階段（§5），還沒做。實作時學到的事見 §7。

## 1. 為什麼

以前每次都直接推 `main`，每次推送都會部署到 `noureon.com`（正式網站）給使用者；要先在真實環境看過的改動，只能先上正式。要有一個和正式一樣的測試環境：能 Google 登入、能用伺服器（聊天、回覆關掉頁面還會繼續、技能、命令工具），但資料和使用者都和正式分開。

## 2. 架構

| 部分 | 正式 | 測試 |
|---|---|---|
| 網站（Vercel，專案 `noureon`） | `noureon.com`，分支 `main` | `staging.noureon.com`，分支 `staging`（Vercel 的預覽部署，網域指定給這個分支） |
| 伺服器（Zeabur） | `api.noureon.com`，分支 `main` | `api-staging.noureon.com`，另一個服務，同一個儲存庫，分支 `staging` |
| 資料庫、登入、檔案（Supabase） | 專案 `Noureon`（`clctveoosifoapbafhrl`） | 專案 `Noureon-staging`（免費方案上限 2 個專案，剛好） |
| Google 登入 | Supabase 的 Google 設定 | 新專案裡同樣設定一次（可用同一組 Google 憑證） |
| 沙盒主機（VPS，Python） | `run.noureon.com`、runner | 第 2 階段 |
| 連接器登入 | `api.noureon.com/mcp/callback` | 第 2 階段 |

**使用者資料不通：** 兩個 Supabase 專案是兩份資料庫，測試環境要用 Google 重新登入一次，之前正式的對話、設定都看不到。這是故意的：測試時改資料表、測試帳號和資料都不會碰到正式。

## 3. 設定步驟（owner 做的標 ★）

1. ★ Supabase 建專案 `Noureon-staging`（區域同正式：Northeast Asia (Tokyo)），資料庫密碼自己存。
2. 套用 `supabase/migrations/` 全部檔案到新專案（用 Supabase 工具做；含資料表、函式、儲存桶 `user-skill-bundles` 等）。
3. ★ 新專案：Authentication → Providers → Google 開啟，貼和正式一樣的 Client ID／Secret；Authentication → URL Configuration：Site URL `https://staging.noureon.com`，Redirect URLs 加 `https://staging.noureon.com/**`。
4. ★ Google Cloud（建 Google 憑證的專案）：該 OAuth 用戶端的「已授權的重新導向 URI」加新專案的回呼 `https://<新專案代號>.supabase.co/auth/v1/callback`。
5. 建 `staging` 分支。★ Vercel：Settings → Domains 加 `staging.noureon.com`，指定給 Git 分支 `staging`；Settings → Environment Variables 設 Preview 環境（可限定分支 `staging`）的：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`（新專案的）、`VITE_SERVER_API_URL=https://api-staging.noureon.com`；其他和正式一樣的變數（`/api` 那些函式用的）照抄。Deployment Protection 要讓 `staging.noureon.com` 可以被打開（或只有自己用就保留登入保護）。★ DNS（Cloudflare）：`staging` 的 CNAME 照 Vercel 的指示。
6. ★ Zeabur：在同一個專案新增第二個服務（同一個儲存庫，分支 `staging`），環境變數：

   | 名稱 | 測試的值 |
   |---|---|
   | `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_KEY` | 新專案的（不是正式的） |
   | `KEY_ENCRYPTION_KEY` | **新產生一把**，和正式不同 |
   | `ALLOWED_ORIGINS` | `https://staging.noureon.com` |
   | `APP_URL` | `https://staging.noureon.com` |
   | `CONNECTOR_REDIRECT_URI` | `https://api-staging.noureon.com/mcp/callback`（第 2 階段才會用到） |
   | `CONNECTOR_CLIENT_ID` | `https://staging.noureon.com/.well-known/oauth-client.json`（第 2 階段） |
   | `SANDBOX_RUNNER_URL`、`SANDBOX_RUNNER_TOKEN` | 第 2 階段（先不設：Python 會回「不支援」，改在瀏覽器執行） |
   | `ASSET_SWEEP` | 不設（只記錄，不刪除） |

   綁定網域 `api-staging.noureon.com`，DNS（Cloudflare）選「僅 DNS」灰色雲朵（同正式）。開 `https://api-staging.noureon.com/healthz` 看到 `{"ok":true,…}`。
7. 核對：開 `https://staging.noureon.com` → Google 登入 → 開新對話 → 聊天 → 回覆中關掉頁面再開，回覆還在進行（確認走的是 `api-staging`，不是 `api`）。

**金鑰規則：** 所有服務金鑰、主金鑰、Secret 只放在各平台的環境變數，不貼到對話；測試環境的主金鑰和正式不同。

## 4. 之後的流程（owner 同意，2026-10-11）

- 日常：我推到 `staging` → 部署到 `staging.noureon.com`（與 `api-staging`），owner 在測試網站試。
- owner 說「上線」：我把 `staging` 合併到 `main`（`main` 只有合併，不直接在上面改）→ 部署到 `noureon.com`；依 `RELEASING.md` 的檢查表做版本、標籤。
- 資料表的修改（`supabase/migrations/`）：先套用到測試專案 `Noureon-staging` 驗證，owner 說上線時才套用到正式專案。
- 緊急修正：仍然先推 `staging` 看過；真的緊急且 owner 明說，才直接推 `main`。

## 5. 第 2 階段：Python 沙盒與連接器

- **Python 沙盒（Advanced）：** 沙盒頁 `run.noureon.com` 只接受 `noureon.com` 與 `www.noureon.com` 來嵌入（`vercel.json` 的 `frame-ancestors`、`src/app/runtime/sandbox/sandbox-protocol.js`、`public/sandbox/protocol.js`）；要加上測試網域，並用 `VITE_SANDBOX_ORIGIN` 指向沙盒頁；伺服器端的 Python 用同一台 VPS 的 runner（`SANDBOX_RUNNER_*`），可共用。
- **連接器：**
  - 回呼 `https://api-staging.noureon.com/mcp/callback`；GitHub OAuth App 可以加第二個重定向 URI（上限 10 個）。
  - 用「用戶端描述文件」（CIMD：Notion、Linear、Context7 等）的服務，文件是 `public/.well-known/oauth-client.json`，裡面的回呼網址是正式的；測試要有自己的一份（建置時依環境產生），而且那個網址要能被對方伺服器直接讀到（Vercel 的 Deployment Protection 不能擋它）。
  - Vercel 的連接器：Vercel 只准它核准的回呼網址，測試環境不能用。
- Cloudflare Turnstile（驗證碼）：測試環境不設 `VITE_TURNSTILE_SITE_KEY` 就不啟用；要的話在 Cloudflare 的網域清單加 `staging.noureon.com`，並在測試的 Supabase 設定對應的 Secret。

## 6. 和正式不一樣的地方（不是 bug）

- 使用者與資料分開（§2）。
- 第 2 階段之前：Python 沙盒（伺服器端）與連接器不可用。
- Vercel 的連接器永遠不能用（§5）。
- 網站的 `/api/*`（Vercel 函式：搜尋、網站資訊…）和正式用同一套程式，環境變數另外設。

## 7. 第 1 階段實作筆記（2026-10-11）

- **套用 migrations 的方法：** Supabase 的工具遇到含 `drop` 的陳述式會當成破壞性操作而逾時，所以資料表一律由 owner 在測試專案的 SQL Editor 貼上執行（分成三個檔，依序貼）。貼之前用記事本開檔，確認最後幾行完整（應用程式內的檔案預覽會截斷）。
- **遷移順序修正：** `20260709090000_grant_workspace_sync_sequence.sql` 在空資料庫上會比序列的建立還早執行（`relation "public.workspace_sync_seq" does not exist`）。現在改成條件式：序列存在才授權（commit `1b7ea477`）。正式資料庫不受影響。
- **Vercel 環境變數：** 改完之後要重新部署才會套用。測試站是預覽部署，開啟時要先登入 Vercel（Deployment Protection）。
- **伺服器：** Zeabur 的第二個服務 `noureon-staging`，分支 `staging`，`KEY_ENCRYPTION_KEY` 為新產生的，和正式不同。`/healthz` 回傳 `"build":"dev"` 是正常的。

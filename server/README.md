# 伺服器（server/）

讓回覆在伺服器上執行、使用者關閉頁面也能繼續的服務。設計見 [`docs/superpowers/specs/2026-10-03-server-runtime-design.md`](../docs/superpowers/specs/2026-10-03-server-runtime-design.md)。

目前是 **S0（打底）**：只有健康檢查、登入驗證、請求格式檢查，還不會執行任何回覆。

## 端點

| 端點 | 需要登入 | 說明 |
|---|---|---|
| `GET /healthz` | 否 | 伺服器是否活著，回傳版本與執行時間 |
| `GET /v1/whoami` | 是 | 回傳目前登入者的 id，用來確認「瀏覽器的登入」和「伺服器」接得上 |
| `POST /v1/runs/validate` | 是 | 檢查一份回覆請求的格式，不會真的執行（S1 的 `POST /v1/runs` 會用同一份檢查） |

登入方式：`Authorization: Bearer <網站登入後取得的 access token>`。伺服器會問 Supabase 這個 token 是否有效，不自己解碼。

## 環境變數（在 Zeabur 的服務設定裡填）

| 名稱 | 內容 |
|---|---|
| `SUPABASE_URL` | 專案網址，跟網站用的 `VITE_SUPABASE_URL` 一樣 |
| `SUPABASE_PUBLISHABLE_KEY` | 公開金鑰，跟網站用的 `VITE_SUPABASE_PUBLISHABLE_KEY` 一樣（不是服務金鑰） |
| `ALLOWED_ORIGINS` | 選填，允許從哪些網站呼叫，用逗號分隔；不填就是 `https://noureon.com` 與 `https://www.noureon.com` |
| `PORT` | 選填，預設 8080 |

之後的階段會再加：Supabase 服務金鑰、加密暫存金鑰用的主金鑰。**這些只能放在 Zeabur 的環境變數裡，不要寫進程式碼、不要貼到對話或日誌。**

## 在 Zeabur 部署（使用者操作）

1. 在 Zeabur 建立專案，部署位置選你自己那台伺服器。
2. 在專案裡「新增服務」→ 從 GitHub 選這個儲存庫（Noureon），Zeabur 會偵測到根目錄的 `Dockerfile` 並用它建置。
3. 填上面的環境變數。
4. 綁定網域 `api.noureon.com`：Zeabur 會告訴你要在 DNS 加哪一筆紀錄；到管理 DNS 的地方（Cloudflare）新增，**Cloudflare 的代理要選「僅 DNS」（灰色雲朵）**，讓 Zeabur 自己發 HTTPS 憑證。
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

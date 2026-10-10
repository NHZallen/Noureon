# Notion 自己的 OAuth 登入（Public Connection）：品牌測試

**狀態：** 第 1 步（登入流程、安全保存、解除連接、獨立測試入口）已寫完、已部署，**品牌測試成功**（2026-10-11，owner 從 `noureon.com/notion-test` 看到 Notion 授權畫面顯示 Noureon 的名稱與 Logo）。擴充頁的 Notion「連線」仍然走 Hosted MCP（授權畫面仍顯示 `api.noureon.com`，這是刻意的）。還沒有接到工具執行器：第 2 步的評估在 §5，等 owner 決定做法。原本的 Hosted MCP 連接器（`server/mcp/`、擴充頁「連接器」）完全沒有動。

## 1. 為什麼

Hosted MCP（`https://mcp.notion.com/mcp`）的授權畫面對只用網址認識的用戶端，只顯示重新導向的網址（`api.noureon.com`），註冊（DCR）也沒有改變它（2026-10-10 實測）。owner 在 Notion Developer Portal 建了自己的 **Public Connection「Noureon」**（任何工作空間、有正式 Logo）；用它登入時，Notion 的授權畫面顯示的是這個 Connection 的名稱與 Logo。這個設計只做「用這個 Connection 登入並安全保存 Token」，先用一個獨立測試入口讓 owner 看授權畫面。

## 2. 流程

1. 已登入的使用者在測試頁 `https://noureon.com/notion-test` 按「開始授權」→ 頁面用使用者的登入呼叫 `POST /v1/notion/connect`。
2. 伺服器產生 `state`（32 位元組隨機）：**只存雜湊**，另存一個密封的待辦（綁使用者與用途）在使用者自己的列；回傳 `https://api.notion.com/v1/oauth/authorize?client_id=…&response_type=code&owner=user&redirect_uri=…&state=…`。
3. 整頁前往 Notion（不用彈出視窗），使用者在 Notion 看到 **Noureon** 的名稱與 Logo，選工作空間與要分享的頁面。
4. Notion 導回 `https://api.noureon.com/oauth/notion/callback?code=…&state=…`（不帶登入標頭的頁面導覽）。伺服器用 `state` 的雜湊找到那一列（**使用者是開始登入的那個人，不是請求裡說的任何人**），驗證未過期（10 分鐘）、只能用一次，再用授權碼換 Token：`POST https://api.notion.com/v1/oauth/token`，`Authorization: Basic base64(client_id:client_secret)`，本文只有 `grant_type`、`code`、`redirect_uri`。
5. Token 用金鑰庫（AES-256-GCM）密封後存進該使用者的列，綁定「使用者＋`notion-oauth` 用途」；只留工作空間 id、名稱、圖示與機器人 id（**不留擁有者的 email**）。
6. 導回 `https://noureon.com/notion-test?notion=connected`（或 `?notion_error=denied｜expired｜bad_state｜failed｜busy`）；網址裡沒有任何登入資料。

## 3. 檔案與端點

| 部分 | 內容 |
|---|---|
| `server/notion/oauth.js` | `createNotionOAuth`：`startLogin`、`completeLogin`、`status`（只給工作空間資訊，不給 Token）、`accessToken`（給之後伺服器代使用者呼叫 Notion 用）、`whoami`（問 Notion `GET /v1/users/me`，證明 Token 可用）、`disconnect` |
| `server/app.js` | `GET /oauth/notion/callback`（公開）、`GET /v1/notion/status`、`POST /v1/notion/connect`、`POST /v1/notion/disconnect`、`GET /v1/notion/whoami`（都要登入，一律用「登入者」，沒有任何可以填別人 id 的地方） |
| `server/config.js`、`server/main.js` | 環境變數（見 §4）；沒設定時這些端點回 503，其他功能照常 |
| `public/notion-test.html`、`public/notion-test.js` | 測試頁：靜態、無內嵌指令（CSP）、`noindex`、全部用文字顯示、只會前往 `https://api.notion.com/`；頁面本身看不到 Token。**目前只有繁體中文**（給管理者的測試入口，不是對一般使用者的功能；若將來變成正式功能再做五語言） |
| `vercel.json` | `/notion-test` → `/notion-test.html` |
| 資料表 | **沿用 `user_mcp_connections`**（不用新的 SQL）：連接器代號 `notion-public`（Hosted MCP 的列是 `notion`，兩者不會相遇；Hosted 連接器的清單只認目錄裡的連接器，不會列出這一列）。RLS 與權限一如既往：只有服務角色讀寫，瀏覽器碰不到 |

## 4. 部署步驟（owner）

1. **Zeabur 環境變數**（`api.noureon.com` 那個服務）新增：`NOTION_CLIENT_ID`、`NOTION_CLIENT_SECRET`（從 Notion Developer Portal 的 Noureon Connection 複製；**Secret 只放這裡，不要貼到聊天、程式或截圖**）。`NOTION_REDIRECT_URI` 不用設（預設就是 `https://api.noureon.com/oauth/notion/callback`）。存檔後 Zeabur 會重啟服務。
2. **Notion Developer Portal** 確認 Noureon Connection 的 Redirect URI 有 `https://api.noureon.com/oauth/notion/callback`（完全一致，含 https 與結尾沒有斜線）。
3. 確認 `main` 已部署（Vercel 會有 `/notion-test` 頁面；Zeabur 的 `https://api.noureon.com/healthz` 看到 `build` 是新的）。
4. 登入 `noureon.com`，再開 `https://noureon.com/notion-test`：
   - 看到「尚未連接」→ 按「開始授權」→ **看 Notion 的授權畫面有沒有顯示 Noureon 的名稱與 Logo**（這是這次要驗證的事）。
   - 授權後回到測試頁，顯示「已連接：<工作空間名稱>」→ 按「驗證 Token」應顯示「Token 可用」與機器人、工作空間名稱 → 按「解除連接」會撤銷並刪除。
   - 頁面顯示「伺服器還沒有設定 Notion」＝步驟 1 沒生效。

## 5. 第 2 步（品牌測試成功後再評估）：把 Notion REST API 包成現有的工具

**現有機制：** 回覆裡的連接器工具由 `server/mcp/tool-loader.js` 的兩個工具（`connector_tools`、`connector_call`）提供，權限（允許／每次詢問／拒絕）、確認卡、30 次上限、結果當資料處理都已經有；`forRun()` 給的是 `[{ id, name, tools: [{ name, description, inputSchema, kind, state }] }]`，呼叫由 `callTool(connectorId, toolName, args)` 執行。

**最小做法：** 寫 `server/notion/tools.js`：手寫一組工具定義（名稱、說明、輸入格式、讀／寫）與一個執行器，用 `accessToken(userId)` 呼叫 REST，再在 `forRun()` 多回一個 `notion-public` 的連接器、`callTool` 依代號分流（MCP 或 REST）。權限沿用同一列的 `permissions` 欄位，確認卡與設定畫面不用改。大約是 300 行加測試，不動 Hosted MCP。

**要先決定的事（品牌測試成功後再討論）：**
- Public Connection 的使用者在授權時**要選分享哪些頁面**（和 Hosted MCP 的「沿用你的存取權」不同）；沒分享的頁面模型看不到。
- REST 回傳的是冗長的 JSON（區塊樹、屬性），需要自己轉成精簡文字（Hosted MCP 已經替我們做好）；工具的集合要自己維護（搜尋、讀頁面內容、查資料庫、建立頁面、更新頁面、加留言、加區塊）。
- API 版本：`2022-06-28`（目前用）與 `2025-09-03`（資料庫改成資料來源）的差異要選一個。
- 兩種連線並存時，清單與設定要不要合併成一個「Notion」（和哪一種連線有關的說明）：這是畫面問題，要和 owner 討論。
- Token 效期：Notion 公開連線的 Token 目前不會過期（沒有 refresh token）；被使用者在 Notion 端撤銷時，呼叫會回 401，伺服器會把連接改成「需要重新授權」。

## 6. 已驗證與未驗證

**測試（假 Notion）：** 授權網址的參數、state 只存雜湊且只能用一次、過期、被拒絕、授權碼換 Token 時 Secret 只在 `Authorization` 標頭、Token 密封存放（資料列裡沒有明文、沒有擁有者 email）、不同使用者的 Token 互不相通（搬到別人的列就打不開、換別的主金鑰也打不開、A 解除連接不影響 B）、Hosted MCP 的 state 與這個流程互不接受、撤銷、Token 失效改成需要重新授權、環境變數成對、各端點只看登入者自己的連接、答案與導回網址裡沒有 Secret 或 Token。

**沒有驗證的（要真實登入才知道）：** Notion 授權畫面是否顯示 Noureon 的名稱與 Logo；`/v1/oauth/revoke` 是否真的存在並接受這個格式（失敗時只是沒撤銷，資料照刪）；Notion 的回應欄位名稱（`workspace_name`、`workspace_icon`、`bot_id`）是否如文件。

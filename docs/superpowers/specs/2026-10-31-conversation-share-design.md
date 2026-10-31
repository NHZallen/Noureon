# 對話分享（設計）

2026-10-31。Allen 與 Claude 討論後定案；畫面草稿（八個畫面）Allen 已看過並同意，「閱覽頁」左上角要有 Noureon 圖示。

## 1. 要做什麼

分享者在一段對話的選單按「分享對話」，選權限，得到一個連結。拿到連結的人：

- **唯讀**：不用登入就能看。
- **可接著聊**：登入 Noureon 雲端帳號的人，可以把這份快照複製成自己工作空間裡的新對話，用自己的金鑰接著聊，不影響分享者。沒有帳號或沒登入的人只能看。

## 2. 已定案的決定（Allen）

| 題目 | 決定 |
|---|---|
| 權限 | 建立時選：唯讀／可接著聊。 |
| 內容 | **快照**：按下去那一刻的內容。「更新連結」用目前的內容重做一份，網址不變。 |
| 放什麼 | 記憶完全不公開（記憶筆記、`memoryUsed`／`memoryUpdated`／`memoryHistory`、記憶與回顧步驟的明細）。其他都放：文字、思考、搜尋來源、附加的檔案與圖片、模型產生的檔案、處理過程、模型名稱。**不放** Noura 的指示文字與設定（只顯示名稱）、金鑰、系統指示。 |
| 顯示名稱 | 建立時勾選「顯示我的名稱」，預設不勾。 |
| 刪除對話 | 原對話刪掉（移到垃圾桶或永久刪除）時，這段對話的所有分享**立刻失效**（唯讀與可接著聊都是）。已經複製成自己對話的人不受影響。有分享的對話刪除前先提醒。 |
| 撤銷 | 撤銷後連結立刻失效，列表裡該筆消失；已複製的對話不受影響。 |
| 已分享內容 | 設定 → 資料管理裡一張卡片：網址、對話名稱、當時的權限、日期、撤銷。對話已刪除的那筆留著當紀錄（「此對話已刪除」，連結已失效），可按「移除紀錄」。 |
| 上限 | 同時有效的分享最多 30 個（失效與撤銷的不算）。 |
| 標記 | 分享者側邊欄有效分享的對話標「已分享」；受邀者複製出來的對話標「來自分享」，**永遠保留**。 |
| 搜尋引擎 | 一定不能查到（見 §7）。 |
| 帳號 | 分享者要有雲端帳號（純本機帳號沒有雲端，不能分享）。接著聊也要登入雲端帳號。 |

## 3. 資料

### 3.1 `conversation_shares`

`id`、`owner_id`、`conversation_id`、`code`（猜不到的代號，見 §7）、`mode`（`view`／`continue`）、`show_name`、`owner_name`（快照當時的名稱，只有 `show_name` 才給別人看）、`title`、`snapshot`（jsonb，見 §3.2）、`snapshot_bytes`、`status`（`active`／`conversation_deleted`）、`created_at`、`updated_at`。撤銷＝刪掉那一列。資料表不給 `authenticated` 任何直接權限；全部走函式。

### 3.2 快照

```
{ v: 1, title, model, createdAt, messages: [ { role: 'user'|'model', createdAt, parts: [...] } ] }
```

`parts` 照訊息原樣，但：拿掉每則訊息的 `metadata`；訊息文字開頭的處理紀錄（` ```noureon-run ` 區塊）裡拿掉記憶步驟（`tools` 中 `kind: 'memory'` 的項目）；附件與檔案的雲端標記（`__astraCloudAsset`）改指向分享專用的儲存桶。

### 3.3 附件

儲存桶 `shared-assets`（公開讀取，路徑 `<分享 id>/<原檔 SHA-256>`，分享 id 是猜不到的 uuid）。建立或更新分享時，伺服器把快照裡用到的檔案從 `user-assets/<人>/<hash>` 複製過去；撤銷、對話刪除、更新時不再用到的，由掃除器（`server/asset-sweeper.js` 的另一個階段）刪掉。單一分享的檔案合計上限 100 MB、快照文字 5 MB；超過時分享不建立，並告訴分享者是哪一項。

## 4. 函式與端點

資料庫（migration）：

- `server_read_conversation_for_share(p_user_id, p_conversation_id)`：只給服務金鑰；回傳這段對話與它的訊息（伺服器不直接讀 `workspace_*`）。
- `get_shared_conversation(p_code)`：**匿名可呼叫**；只回有效的分享（標題、權限、顯示名稱時的名稱、日期、快照），沒有就回空。
- `list_my_conversation_shares()`：登入的人，只看自己的，不含快照。
- `report_shared_conversation(p_code, p_reason)`：匿名可呼叫，寫進 `share_reports`（上限 500 字）。
- 觸發器：`workspace_conversations` 的 `deleted_at` 被設定，或該列被刪除時，把這段對話的分享標成 `conversation_deleted` 並清掉 `snapshot`。
- `orphan_shared_assets(...)`：`shared-assets` 裡沒有有效分享指向的檔案（給掃除器）。

伺服器（`server/shares.js`，端點需登入）：

- `POST /v1/shares`：`{ conversationId, mode, showName }` → 建立（檢查上限 30、大小、對話屬於這個人、不是暫時對話）。
- `POST /v1/shares/:id/refresh`：用目前的內容重做快照。
- 撤銷、列表與「移除紀錄」不經伺服器：頁面直接呼叫資料庫函式 `revoke_conversation_share(id)`（刪掉那一列，對話已刪除的紀錄也是同一個）與 `list_my_conversation_shares()`。

## 5. 畫面

照 Allen 看過的草稿（artifact「對話分享草稿」）。補充：

- 閱覽頁左上角是 Noureon 圖示加字樣。
- 分享視窗在建立後可改回「更新連結」「撤銷分享」。
- 「已分享」「來自分享」是同一個小標籤樣式，文字不同。
- 顏色一律用 `tokens.css` 的名稱；淺色、深色都要看過。
- 五語（zh-TW、en、fr、ru、es）；新的字串放在 `src/data/i18n/parts/share.js`（新的 domain，要列進 `parts/index.js`）。

## 6. 接著聊（受邀者）

頁面（不是伺服器）做：用公開函式取得快照，把附件從公開儲存桶抓下來放回訊息（成為受邀者自己的附件，之後由一般同步存進受邀者的雲端空間，算他的容量），建立新對話（新 id、標題照原標題、標記 `metadata.sharedFrom = { code?, name?, at }`），標題旁的小標籤永遠保留。容量不夠時只複製文字並告訴對方。模型由對方自己選。

## 7. 搜尋引擎與其他防護

- 代號：至少 24 個字元、來自 `crypto.getRandomValues` 的 base62（約 143 位元）。不放進任何網站地圖，不從站內其他頁連結。
- 閱覽頁的回應標頭與頁面都帶 `X-Robots-Tag: noindex, nofollow, noarchive` 與 `<meta name="robots">`；**不**在 `robots.txt` 擋它（擋了爬蟲看不到「不要收錄」，網址仍可能被收錄）。`Referrer-Policy: no-referrer`。
- 貼進通訊軟體的預覽卡片只顯示固定的通用文字，不放對話內容。
- 頁面底下有「檢舉」，並寫明「內容由使用者分享，未經 Noureon 審核」。

## 8. 分期

1. **P1**：資料庫、伺服器、分享視窗、已分享內容、側邊欄標記、刪除提醒、公開閱覽頁（唯讀）、搜尋引擎防護。
2. **P2**：接著聊與「來自分享」標記。
3. 與 P1、P2 同時：隱私權政策、使用條款、協助中心五語。

## 9. 協作與契約

新資料表與函式、新端點、新的儲存桶、訊息的 `metadata.sharedFrom` 欄位，都是契約變更：在 Linear 開 `contract` 單，由 Allen 確認。涉及金鑰權限、儲存桶與刪除規則，Allen 與 Sun 都要看。migration 只寫檔案，由 Allen 先套測試專案，再套正式專案。

## 10. 實作紀錄（2026-10-31）

- **資料庫**：`supabase/migrations/20261031040000_add_conversation_shares.sql`（資料表 `conversation_shares`、`share_reports`、儲存桶 `shared-assets`、函式、觸發器）；測試 `tests/database/conversation-shares.test.js`。
- **伺服器**：`server/shares.js`（快照、複製檔案、掃除）、`server/share-store.js`、路由 `POST /v1/shares`、`POST /v1/shares/:id/refresh`；測試 `tests/server/server-shares.test.js`。
- **頁面（分享者）**：`src/app/runtime/share/`（`share-client.js`、`share-state.js`、`share-ref.js`、`start-shares.js`）、`src/app/ui/share/`（`share-dialog.js`、`shared-items-card.js`）、`src/styles/share.css`、文字 `src/data/i18n/parts/share.js`（前綴 `cs`）。入口：對話選單（桌面 `settings-history-menu-helper.js`、手機 `mobile-context-menu-markup.js`）送出事件 `astra:share-conversation`；側邊欄標籤 `shareTagsHtml`；刪除前提醒 `confirmDeleteShared`（單筆與批次）。
- **閱覽頁**：`src/app/share-page/`（`share-page.js`、`share-assets.js`、`share-route.js`、`share-texts.js`）、`src/styles/share-page.css`。`src/main.js` 遇到 `/s/<代號>` 就顯示閱覽頁而不是應用程式（和密碼救援同一做法）；`vercel.json` 把 `/s/:code` 導到 `index.html`，並對 `/s/*` 加 `X-Robots-Tag: noindex, nofollow, noarchive` 與 `Referrer-Policy: no-referrer`；頁面也加 `<meta name="robots">`、`<meta name="referrer">`，並拿掉指向首頁的 canonical。連結預覽用的是 `index.html` 原有的通用標籤。
- **接著聊**：閱覽頁的按鈕把代號放進 `localStorage['noureon:pending-share']` 後回到首頁；`start-shares.js` 等到有雲端帳號就用 `share-import.js` 做出新對話（`sharedFrom: { at, name }` 隨對話同步，見 `cloud-sync-v2-codecs.js`），model 用對方自己的設定。雲端空間不夠時只複製文字。模型畫的圖在複製時變成附加的圖片。
- **文件**：隱私權政策、使用條款、協助中心五語各加一段（`src/data/legal/`），`PRIVACY.md` 已重新產生。更新日期與「適用版本」的字樣留給發版時改。

## 11. 檢舉怎麼處理（2026-10-31，Allen 決定）

- 檢舉寫進 `share_reports`（原因最多 500 字、讀者網路位址的單向指紋 `reporter_hash`，只用來算有幾位不同的讀者）。
- **自動暫停**：同一個分享有 3 位不同讀者檢舉 → `status = 'suspended'`：連結立刻失效，快照與檔案保留供審查（掃除器不刪）；分享者在「已分享內容」看到「已暫停」，只能撤銷。同一位讀者重複檢舉只算一次。
- **寄信**：伺服器掃除器每 2 分鐘取出還沒通知的檢舉（`server_take_share_reports_to_mail`，每筆只取一次），每個分享一封純文字信寄到環境變數 `REPORT_TO`（沒設就用 `WAITLIST_TO`），用既有的 Resend（`RESEND_API_KEY`）。寄失敗的檢舉放回佇列（`server_requeue_share_reports`）。
- **管理頁**：`noureon.com/admin/shares`（`src/app/share-page/share-admin-page.js`）。只有寫在 `service_admins` 的帳號看得到內容，其他人（含沒登入）只看到「找不到頁面」；每個動作資料庫再檢查一次。可以：看內容（`/s/<代號>?review=1`，用 `admin_get_shared_conversation` 讀任何狀態的快照）、暫停、恢復（恢復後檢舉歸零）、清除檢舉、刪除（要按兩次）。
- **第一次要做**：migration `20261031050000_add_share_report_review.sql` 套用後，把管理員帳號加進去：
  `insert into public.service_admins (user_id) select id from auth.users where email = '<帳號的 email>';`
  伺服器環境要有 `RESEND_API_KEY`、`MAIL_FROM`（已有就不用動），要寄到別的信箱再設 `REPORT_TO`。
- 隱私權政策、使用條款、協助中心五語已補（暫停、寄信、指紋）。

### 11.1 暫停之後與下架（2026-10-31）

- **暫停中的連結**：任何人打開看到「此對話正在審查中」（`get_shared_conversation` 回 `{ status: 'suspended' }`，沒有任何內容）。
- **下架**：管理頁的「下架」（`admin_remove_share`）把分享改成 `removed`、清掉快照（檔案之後由掃除器刪），紀錄留著。打開連結的人看到「此分享經審查後已下架」；分享者在「已分享內容」看到「已被審查下架」，只能移除紀錄。
- **寄信給分享者**：下架時伺服器（同一個掃除器）用分享者帳號的 email 寄一封英文信（伺服器不知道對方讀哪種語言；Allen 決定只用英文），可直接回信（reply-to 是 `REPORT_TO`）。每次下架只取一次（`removal_mailed_at`），寄失敗放回佇列。沒有 email 的帳號不寄。暫停沒有寄信。
- **下架的對話不能再分享**：`blocked_share_conversations` 記著（分享者 id + 對話 id），`server_create_conversation_share` 遇到就拒絕（`share_removed` → 409 `reason: removed`），分享者移除紀錄也解不開。換一個新的對話（例如複製內容）不受限，這個做法擋不到。
- migration：`20261031060000_share_under_review_notice.sql`（在 05 之後）。

- 信件樣式（`server/mail-layout.js`）和 Allen 已經收到的 Noureon 認證信完全一樣（`docs/email-templates/build-emails.py` 的版面：卡片、圓形圖示、標題、一般段落、紫色按鈕、細線、灰色小字、卡片下的「Open Noureon ・ Contact support」與一行灰字、深色模式）；不另外畫方框或表格；有 HTML 與純文字兩個版本。

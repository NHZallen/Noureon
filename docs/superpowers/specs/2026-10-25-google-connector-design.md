# Google 連接器（行事曆、試算表、文件、簡報、雲端硬碟、Gmail）

Linear：NOU-136。Allen 的決定在 2026-10-25 討論中定案（§2）。

## 1. 目標

在擴充頁的連接器加一張「Google」卡片，登入一次，模型就能讀（在使用者允許時也能改）Calendar、Sheets、Docs、Slides、Drive、Gmail。連接器的其他機制（登入、權限、詢問卡、回覆中的 `connector_tools` / `connector_call`、議會工具）不變。

## 2. 決定（Allen）

| 項目 | 決定 |
|---|---|
| 卡片 | 一張「Google」（不是六張）；分類新增「辦公與日常」（`office`，排在最前） |
| 權限範圍 | 全部能開的都開；預設登入是**唯讀**（`defaultLogin: 'readonly'`），要修改在卡片上切到「可讀寫連線」重新登入 |
| 做法 | **不接 Google 的官方遠端 MCP**。Google 的 MCP 服務還是 Developer Preview，Allen 的主控台只找得到 Drive MCP（Gmail、Calendar 要直接開網址才可能有，Sheets、Docs、Slides 沒有記錄），所以六個服務都由 Noureon 伺服器直接呼叫 REST API（Allen：「都呼叫 API 就好」） |
| Google 帳號 | Allen 的私人 Google 帳號建專案（個人帳號可以建專案與 OAuth 用戶端，同意畫面只能選「外部」） |
| 發布狀態 | 目前維持「測試中」（發布到正式版要 Google 驗證，Allen 決定先不做）：登入每 7 天失效一次，連接器頁會顯示「需要重新登入」，按一下就好；測試使用者最多 100 位，要把 Allen、Sun 的 Gmail 加進去。之後若要對所有使用者開放才需要驗證（Gmail 與 Drive 完整權限是受限範圍，要安全評估） |
| 客服信箱 | 同意畫面「開發者聯絡資訊」填 `support@noureon.com`；「使用者支援電子郵件」下拉選單只列自己的帳號與自己管理的群組 |

## 3. 架構：原生連接器

目錄項目多兩個欄位（`src/data/connector-catalog.js`，頁面與伺服器共用）：

* `native: 'google'`：這個連接器由我們的程式說話，不是 MCP 伺服器。`endpoint` 只是名義上的位址（`https://www.googleapis.com/`）。
* `oauth`：登入的位址（issuer、authorizationEndpoint、tokenEndpoint、revocationEndpoint）和 `authParams`（`access_type=offline`：沒有它 Google 不給 refresh token；`prompt=consent`：不然只有第一次給）。其他連接器用 `discover` 找這些，原生的直接寫在目錄裡（`staticMetadata`，位址一樣要是公開 https）。
* `defaultLogin: 'readonly'`：頁面第一次登入的選項預設唯讀（`defaultLoginMode`）。

伺服器：

* `server/mcp/native/index.js`：`createNativeClient(provider, { getToken, onUnauthorized, fetchImpl })`，形狀同 MCP 用戶端（`listTools`、`callTool`、`close`），所以 `connections.js` 的 `clientFor` 回傳哪一種，登入、工具清單、權限、回覆迴圈都不用認。
* `server/mcp/native/api.js`：`createApi` 的 `call(method, url, …)`：令牌只放在 Authorization 標頭、只送到提供者列出的主機（https、完全比對主機名）、`redirect: 'error'`、回應 4 MB 上限、401 時換一次令牌重試、Google 的拒絕（400/403/404/429…）變成 `ToolFailure`（工具的結果，模型看得到），登入不被接受才丟 `McpError('unauthorized')`（頁面顯示需要重新登入）。
* `server/mcp/native/inputs.js`：輸入檢查（文字長度、id 一行、整數範圍、列舉、清單、儲存格）。id 進網址一律 `encodeURIComponent`。
* `server/mcp/native/google/{calendar,sheets,docs,slides,drive,gmail}.js`：39 個工具（讀 15、寫 24），`index.js` 合在一起並把 Google 的錯誤翻成幾句白話（缺權限會說「可能是唯讀登入，請在 Google 連接器設定重新登入並允許修改」；API 沒啟用；請求太多；找不到）。
* `connections.js`：`metadataOf` 對有 `oauth` 的連接器用靜態資訊；`clientFor` 依 `native` 選用戶端；`refreshTools` 對原生連接器**不**把工具文字的變動記成 `changed`（那是我們自己的程式，不是服務偷偷改工具；一般連接器的工具變了要使用者重新確認）；`effectiveState`：原生連接器的唯讀登入下，會改動內容的工具一律 `deny`（換成可讀寫登入就回到預設的「先問」）。
* `oauth.js`：`buildAuthorizationUrl` 只在有 `resource` 時才帶（Google 不是 MCP 伺服器）、加上 `authParams`；token 請求的 `resource` 在空值時本來就不帶。
* `config.js`：手工用戶端的環境變數多了 `google`：`CONNECTOR_GOOGLE_CLIENT_ID`、`CONNECTOR_GOOGLE_CLIENT_SECRET`（要一起設）。

## 4. 範圍（scopes）

唯讀（預設登入）：`calendar.readonly`、`spreadsheets.readonly`、`documents.readonly`、`presentations.readonly`、`drive.readonly`、`gmail.readonly`。

可讀寫：`calendar`、`spreadsheets`、`documents`、`presentations`、`drive`、`gmail.modify`、`gmail.compose`（皆為 `https://www.googleapis.com/auth/…`；寫入範圍包含讀取）。

這些都要加在同意畫面「資料存取權」。Gmail 與 Drive 是受限範圍，Calendar、Sheets、Docs、Slides 是敏感範圍；未驗證的應用程式登入時會看到「Google 尚未驗證這個應用程式」，點進階繼續。

## 5. 工具

| 服務 | 讀 | 寫 |
|---|---|---|
| Calendar | `calendar_list_calendars`、`calendar_list_events`、`calendar_get_event`、`calendar_get_free_busy` | `calendar_create_event`、`calendar_update_event`、`calendar_delete_event`（通知賓客預設 none） |
| Sheets | `sheets_get_spreadsheet`、`sheets_get_values` | `sheets_update_values`、`sheets_append_values`、`sheets_clear_values`、`sheets_add_sheet`、`sheets_create_spreadsheet` |
| Docs | `docs_get_document`（轉成純文字，標題 `#`、清單 `-`、表格以 tab 分隔） | `docs_create_document`、`docs_append_text`、`docs_replace_text` |
| Slides | `slides_get_presentation`（每頁的文字） | `slides_create_presentation`、`slides_add_slide`、`slides_replace_text` |
| Drive | `drive_search_files`、`drive_get_file`、`drive_read_file`（Doc/Slides 匯出文字、Sheet 匯出 CSV、純文字檔） | `drive_create_folder`、`drive_create_text_file`、`drive_rename_file`、`drive_move_file`、`drive_trash_file`（只進垃圾桶）、`drive_share_file` |
| Gmail | `gmail_search_messages`、`gmail_get_message`、`gmail_get_thread`、`gmail_list_labels` | `gmail_create_draft`、`gmail_send_message`（回信會接在原信的對話裡）、`gmail_modify_labels`、`gmail_trash_message` |

沒做：永久刪除（Drive、Gmail 都只進垃圾桶）、附件內容與寄附件、日曆的重複規則細節、試算表的格式與圖表、投影片的圖片與版面編輯、Drive 的二進位檔案（PDF、Office）。

## 6. 風險

* **寄信與分享是對外動作**：預設「先問」（每次都問，使用者可選「永遠同意」）；唯讀登入下直接 `deny`。
* **內容是第三方資料**：信件、文件的內容可能帶有給模型的指示；`connector_call` 的結果本來就放在「不可信資料」區塊（`tool-loader.js`），不變。
* **7 天失效**：「測試中」的同意畫面。連接器頁已有「需要重新登入」流程。
* **Google 的政策**：公開給所有使用者前要通過驗證，並遵守 Google API 服務使用者資料政策（有限使用）；隱私權政策到時要補一段 Google 資料的說明。
* **未在真實帳號測過**：程式用假的網路測過（網址、參數、請求內容、錯誤處理）；真實登入與每個工具要在測試站用 Allen 的帳號走一遍（§8）。

## 7. 實作紀錄（2026-10-25）

* 工單：Linear NOU-136。
* 程式：§3 的檔案；`tests/server/mcp-google.test.js`（目錄檢查、登入網址與參數、唯讀時寫入工具關閉、401 換令牌、缺權限訊息、輸入檢查、令牌只送到 Google 的主機、各工具的請求內容）；`tests/cli/connectors-ui.test.js` 的清單加上辦公與日常。
* 文字：目錄項目（五語）、分類 `connectorCategory_office`（五語）、隱私權政策／使用條款／協助中心的連接器清單加上 Google、`PRIVACY.md`、`server/README.md` 的環境變數。
* 更新日誌：發版時由 Allen 寫（只放使用者看得到的變化）。

## 8. 上線前（Allen 要做的）

1. Google Cloud：專案 `noureon`，啟用六個 API；Google Auth Platform：品牌（首頁、隱私、條款、網域 `noureon.com`）、資料存取權（§4 的 13 個範圍）、目標對象（外部、測試中、測試使用者：Allen 與 Sun 的 Gmail）、用戶端（網頁應用程式，重新導向 URI：`https://api.noureon.com/mcp/callback` 與 `https://api-staging.noureon.com/mcp/callback`）。（2026-10-25 已做完用戶端與環境變數。）
2. Coolify：測試與正式兩個應用程式都加 `CONNECTOR_GOOGLE_CLIENT_ID`、`CONNECTOR_GOOGLE_CLIENT_SECRET`（Build time 不要開）。
3. 部署 `staging` 後，用 Allen 的帳號在測試站：連接器頁 → Google → 唯讀登入 → 問「我明天有什麼行程」「讀一下某份試算表」「找上週的未讀信」；再換「可讀寫連線」重新登入 → 建一個行事曆活動、在試算表加一列、寫一份草稿（不要寄）、建一份 Google 文件與一份簡報。
4. 看日誌有沒有 `connector_tools_failed`、`connector_login_failed`。

## 9. 候補申請（waitlist，2026-10-25）

Google 的應用程式在「測試中」，只有名單上的人能登入。沒在名單上的人不該被 Google 的錯誤頁擋住，而是看到「申請候補」。

* **名單**：Noureon 自己的允許名單，環境變數 `CONNECTOR_GOOGLE_ALLOWED`（信箱或帳號 ID，逗號分隔；沒設 = 所有人）。名單裡的信箱也要加進 Google 的測試使用者。2026-10-25 Allen 給的名單：`yles2007.allen@gmail.com`、`jedocy0722@gmail.com`（帳號 ID 也能填：正式 Allen `b51fda26-c61e-4f5f-95db-3e9a6d7b1c00`、Sun `223d21c4-24df-4b09-a028-afa8ec0f947e`；測試站 Allen `314ef058-7ed4-44d2-b365-c06c0282a6d1`，Sun 在測試站還沒有帳號）。
* **目錄**：`waitlist: true`（只有 Google）。
* **伺服器**：`server/auth.js` 的使用者多了 `email`（小寫，沒有可用的就是空字串）；`connections.js` 的 `list(userId, { email })` 給每個連接器 `access: 'open' | 'waitlist'`（已連線的人永遠是 open）、`startLogin` 對不在名單的人丟 `not_allowed`、`requestAccess({ id, email }, connectorId)`；`POST /v1/connectors/:id/waitlist`。
* **通知信**：`server/mailer.js` 用 Resend（`RESEND_API_KEY`、`MAIL_FROM`、`WAITLIST_TO`）寄到客服信箱，`Reply-To` 是申請人的信箱，內文有信箱、**帳號 ID（UID）**、時間與開放方式。同一個人同一個連接器 24 小時內只寄一次（記憶體裡記，重啟會忘），全部合計每小時最多 30 封。信沒寄成就回錯誤，頁面顯示「無法送出申請」，可再按。
* **頁面**：名單外的人在 Google 那一列看到「申請候補」（取代「連線」），按下去寄信，成功後顯示「已送出申請」；展開說明有一段解釋。
* **隱私**：Resend 加進隱私權政策的外部服務清單（五語）與 `PRIVACY.md`。
* **開放一個人**：收到信後，把信裡的信箱或 UID 加進 Coolify 的 `CONNECTOR_GOOGLE_ALLOWED`、重新部署，再把信箱加進 Google 的測試使用者，回信給申請人。
* **Allen 要做**：註冊 Resend、在 Cloudflare 加 Resend 要求的 DNS 記錄驗證 `noureon.com`、把 `RESEND_API_KEY` 放進 Coolify（測試與正式）；沒做之前按鈕可以按，但會顯示無法送出。

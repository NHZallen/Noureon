# 連接器（MCP）設計：擴充的第三層

**狀態：** 第 1 期（登入引擎、Notion 與 Linear、工具權限、確認卡、擴充頁第三部分）已在 18.4.0 寫完，本機測試全過，**還沒有用真實帳號登入過**（見 §12）。第 2 期（Context7、Upstash、Vercel）已在 18.6.0 寫完（§13），還沒用真實帳號登入過；第 3 期（GitHub）還沒做。「§2 owner 的決定」是 2026-10-10 討論的結果；畫面選 C 組（§9）；第 0 期的探測結果在 §4。
**起因：** owner 想做第三種擴充（技能、命令工具之後）：連到使用者自己帳號上的服務（Notion、GitHub 等），讓模型能查資料、做事。
**研究來源：** 我查的官方文件，加上 owner 請 ChatGPT 逐項查證的結果（兩者互相核對過，下面標「已查證」「未確認」）。端到端的實際登入**沒有人測過**，所以第 0 期先做實驗（§7）。

## 1. 白話：MCP 是什麼

外部服務把自己能做的事包成一份「工具清單」（例如「搜尋頁面」「建立議題」），任何支援 MCP 的 AI 軟體都能照同一套方式使用。Noureon 是「用戶端」：連上服務、拿到工具清單、模型需要時呼叫、把結果拿回來。

和現有兩種擴充的差別：

| | 做什麼 | 在哪裡跑 |
|---|---|---|
| 技能 | 一份寫給模型的說明書與腳本 | 模型讀，腳本在沙盒 |
| 命令工具 | 一個程式 | 我們的沙盒容器 |
| **連接器（MCP）** | 連到**使用者自己帳號**上的服務，讀寫真實資料 | **我們的伺服器**（api.noureon.com）呼叫對方的雲端 |

畫面上叫「連接器」，MCP 只在說明裡出現（待 owner 確認，§9）。

## 2. owner 的決定（2026-10-10）

1. **全部用登入授權（OAuth），不做貼金鑰。**
2. **目錄是這 6 個：Notion、GitHub、Linear、Vercel、Context7、Upstash。**
3. **不要的（及原因）：** Postman、Exa（和我們已有的網頁搜尋重疊）、Google 全系列（Developer Preview、Gmail 與 Drive 讀取要安全評估；之後可再討論）、Asana（令牌不能限制唯讀）、Supabase、Atlassian、Stripe、Cloudflare（令牌層級的唯讀沒有證據、風險高）、Sentry。
4. **不擅自隱藏寫入工具：** 一律讓使用者決定每個工具要不要用；**只有本來就只能唯讀的連接器**（Context7）沒有這個選擇。
5. 使用者看得到的畫面，先給 owner 看實際渲染再做（owner 的一貫規則）。
6. **名稱叫「連接器」**，MCP 只在說明裡提。
7. **預設權限：讀取＝允許、寫入＝每次詢問。**
8. **使用者選什麼就是什麼，不特別限制、不警告**：任何工具（包括 Vercel 的買網域、部署這類）都可以設成「永遠允許」，畫面上也不加「高風險」標籤或警告（owner 的回答：「使用者選啥就啥你不用去管不用警告」；先前我誤解成「危險工具不提供永遠允許」，已更正）。
9. 畫面「多做幾組」比較；**第 0 期開始**。

## 3. 範圍與非範圍

- **做：** 官方精選目錄、每位使用者各自登入、令牌加密保存、工具清單與呼叫、每個工具的權限決定、寫入類動作的確認卡、中斷連線並撤銷、五種語言、隱私政策更新。
- **不做（這一版）：** 使用者自己貼任意 MCP 網址（惡意伺服器、內網探測、工具描述被下毒的風險）；本機程式型（stdio）的 MCP；貼金鑰；臨時對話使用連接器（和其他會碰個人資料的功能一致）。

## 4. 這 6 個連接器（已查證的與未確認的）

| 連接器 | 端點 | 用戶端怎麼取得身分（第 0 期實測） | 唯讀的程度 | 備註 |
|---|---|---|---|---|
| Notion | `https://mcp.notion.com/mcp` | **CIMD**（公布支援） | 公布的範圍只有 `default`，沒有獨立唯讀範圍 | 工具含建立、更新 |
| Linear | `https://mcp.linear.app/mcp`（唯讀：`/mcp/readonly`） | **CIMD**（公布支援） | 公布 `read write`，**可以只授權 read**，令牌就寫不了 | |
| Context7 | `https://mcp.context7.com/mcp/oauth` | **CIMD**（公布支援） | 只有兩個查文件的工具，不碰使用者資料 | 本來就唯讀 |
| Upstash | `https://mcp.upstash.com/mcp` | **DCR**（有註冊端點） | 登入頁有**唯讀開關**，伺服器強制 | 也能選個人或團隊 |
| Vercel | `https://mcp.vercel.com` | **DCR**（有註冊端點） | 公布的範圍沒有讀寫之分（`openid email profile offline_access`） | Beta；含「部署」「買網域」等工具 |
| GitHub | `https://api.githubcopilot.com/mcp/`（唯讀：`/readonly`） | **預先註冊**（沒有註冊端點，要我們自己建 OAuth App） | 伺服器端唯讀模式可選 | 唯一要 owner 動手；**沒有撤銷端點** |

**第 0 期實測結果（2026-10-10，owner 的 VPS，`scripts/mcp-probe.mjs`）：** 六個都回 HTTP 401（正常的 OAuth 保護），都公布 PKCE S256 與 refresh token；只有 GitHub 沒有撤銷端點。

```
Server    Reached   Registration    PKCE S256  Refresh  Revocation  Scopes announced
Notion    HTTP 401  CIMD            yes        yes      yes         default
Linear    HTTP 401  CIMD            yes        yes      yes         read write openid email
Context7  HTTP 401  CIMD            yes        yes      yes         openid profile email public_metadata private_metadata offline_access
Upstash   HTTP 401  DCR             yes        yes      yes         openid profile email public_metadata private_metadata offline_access
Vercel    HTTP 401  DCR             yes        yes      yes         openid email profile offline_access
GitHub    HTTP 401  pre-registered  yes        yes      no          offline_access
```

**這個結果能證明什麼、不能證明什麼：** 它是對方「公布」的設定。它不證明對方真的會接受我們的 CIMD 檔案或 DCR 註冊（有些服務只接受名單內的用戶端，Vercel 尤其要留意），也不證明 Notion 和 Linear 沒有 DCR 作備援（探測在公布 CIMD 時不再往下看註冊端點）。這些要到第 1、2 期真的登入時才知道；實作時三種方式都支援，優先順序 預先註冊 → CIMD → DCR，其中一種被拒絕就退到下一種。腳本在 VPS 上要加 `--network host` 才連得出去（預設的 Docker 橋接網路連不出去，沒有影響 sandbox 本身的設定）。

「用戶端怎麼取得身分」有三種，我們的共用引擎都要支援，依 MCP 規格 2026-07-28 的建議順序：**預先註冊 → CIMD → DCR**。

- **CIMD：** 我們在 `https://noureon.com/.well-known/oauth-client.json` 放一個公開的 JSON（含 `client_id`＝這個網址本身、`client_name`、`redirect_uris`），對方讀它來認識我們。靜態檔案，隨網站部署。
- **DCR：** 對方提供註冊端點，我們自動註冊。規格在逐步轉向 CIMD（我查到的是「逐步轉向」，不是已正式棄用）。
- **預先註冊：** 我們先去對方後台建 App，取得 client_id／secret（GitHub）。

## 5. 架構

### 5.1 放在伺服器

瀏覽器直連會被跨網域限制擋，而且令牌絕對不能放在瀏覽器。連接器的呼叫由伺服器端的回覆執行（和「關掉頁面也會完成」那套一致）；它是 `server/` 底下新的一組模組，不碰瀏覽器端。

### 5.2 登入流程（OAuth 2.1 + PKCE，伺服器是用戶端）

1. 使用者在擴充頁的「連接器」層按「連線」。
2. 伺服器讀對方的 Protected Resource Metadata 與 Authorization Server Metadata，依 §4 的順序取得身分。
3. 產生 `state` 與 PKCE（S256），**存成伺服器端的授權交易**（綁使用者、連接器、回呼網址、有效時間），不信任前端傳來的 user_id。
4. 整頁導向對方的登入頁（**不用彈出視窗**：iOS 常擋彈窗，加到主畫面的 App 也容易出問題）。
5. 對方導回 `https://api.noureon.com/mcp/callback`；伺服器驗證 `state`、發行者、回應，換取令牌。
6. 令牌加密保存，導回 App 並顯示「已連線」。

規格另外要求：令牌放在 `Authorization: Bearer`，**不能放網址**；要用 Resource Indicators，令牌只能用在它所屬的伺服器。

### 5.3 令牌保存（沿用現有金鑰庫）

專案已有 `server/key-vault.js`（AES-256-GCM，主金鑰在伺服器環境變數，密封綁定使用者與一個名稱）和 `user_credentials` 的做法。連接器的令牌沿用同一套：

- 新資料表 `user_mcp_connections`：`user_id`、`connector_id`、`status`、密封後的令牌（access、refresh）、授權範圍、`expires_at`、`created_at`、`updated_at`；RLS 只有伺服器（service role）可寫，使用者只能讀自己的狀態欄位（**不含令牌**）。
- 密封時綁定 `user_id` 與 `mcp:<connector_id>`，搬到別人的列就打不開。
- 令牌**不進**瀏覽器、模型提示、記錄檔、錯誤訊息；輸出遮蔽沿用命令工具的擦除機制。
- **刷新要防併發：** 兩個回覆同時刷新同一個 refresh token，會讓舊令牌被重複使用而整組失效（有些服務採輪替）。用每個連線一把鎖，刷新後寫回。
- **中斷連線：** 呼叫對方的撤銷端點（有的話），刪除保存的令牌，狀態改成已中斷。
- 主金鑰換版本時，舊金鑰仍可打開舊的密封（現有行為）。

### 5.4 工具呼叫

- 連線後取得 `tools/list`，**存下清單的指紋**；之後清單有變動（新增、改描述）就把新工具設為停用並提示使用者重新確認，不讓新出現的工具直接拿到權限（防「工具描述被下毒」）。
- 模型不會一次看到所有工具：連接器可能有幾十個工具，全塞進提示會吃掉大量上下文。沿用技能那套：先給簡短清單，要用時再載入。
- 每次呼叫有逾時、單次結果大小上限、每個回覆的呼叫次數上限；結果一律當**不可信的資料**，裡面的「指令」不能改變授權（防提示注入）。
- MCP 2026-07-28 是無狀態的核心；各服務不一定都已升級，Node 端要依各服務支援的版本協商，不能硬套同一個初始化流程。

### 5.5 工具權限：使用者決定（§2 第 4 點）

每個工具有三種狀態，由使用者設定：**允許**、**每次詢問**、**拒絕**。

- 連線時，支援「在登入頁就選範圍」的服務（Linear 的 read／write 範圍、Upstash 的唯讀開關、GitHub 的唯讀端點），讓使用者**選唯讀連線或可讀寫連線**；選唯讀時令牌本身就寫不了，這是最強的一層。
- 不支援的（Notion、Vercel、GitHub 的完整端點）：授權一次拿到全部權限，由 Noureon 依使用者的設定決定哪些工具真的會被呼叫。畫面要**誠實說明**這一點：「這個服務的授權包含寫入權限，Noureon 只會在你允許的時候使用」。
- 工具分成「讀取」與「寫入」兩類（由我們維護的清單決定；**不能只信對方標的唯讀提示**，伺服器可以標錯）。
- **預設（建議，待確認 §9）：** 讀取＝允許；寫入＝每次詢問。使用者可以改成永遠允許或拒絕。
- 「每次詢問」用**確認卡**，沿用沙盒詢問網域那套事件與卡片（顯示是哪個連接器、哪個工具、確切的參數，同意一次／永遠同意／拒絕，等候 10 分鐘）。

## 6. 安全

- 最大風險是**提示注入**：模型讀到一封信、一個頁面裡的惡意指令，轉而呼叫寫入工具。三件事同時成立最危險：能讀私人資料、讀到不可信的內容、能對外傳出。防線是 §5.5 的預設「寫入每次詢問」，和確認卡顯示確切參數。使用者自己把某個工具改成「永遠允許」是他的決定，我們不攔、不警告。
- 工具結果與工具描述都是不可信的內容。
- 只接審核過的官方端點；端點與工具清單由我們的目錄管理，使用者不能新增。
- 範圍最小化：登入時只要求需要的範圍。
- **隱私：** 使用者資料（頁面內容、議題）會經由我們的伺服器送給模型供應商（例如 OpenRouter）。隱私權政策與協助中心（五種語言，`src/data/legal/`，`PRIVACY.md` 由英文版產生）要寫明，並說明保存了什麼、怎麼刪。

## 7. 分期

**第 0 期（先做實驗，沒有畫面）：** `scripts/mcp-probe.mjs`：對六個連接器只做**唯讀查詢**（先送每個 MCP 用戶端都會送的第一個請求，得到 401；再讀公開的登入設定檔 RFC 9728／RFC 8414），列出各自是 CIMD、DCR 還是只能預先註冊，有沒有 PKCE S256、refresh token、撤銷端點、公布的範圍。**不註冊、不登入、不留下任何紀錄。** 這個開發環境的網路政策連不上這些網站，所以要在 owner 的 VPS 上跑：`docker run --rm --network host -v ~/Noureon:/app -w /app --entrypoint node noureon-sandbox-runner:1 scripts/mcp-probe.mjs`（`--json` 輸出全部細節）。結果要寫回 §4。注意：它只說明「對方公布了什麼」；真正的 CIMD 登入要等我們的 CIMD 檔案部署後才能測。

**第 1 期：登入引擎與第一批。** 引擎（§5.2、§5.3）、資料表、CIMD 檔案、Notion 與 Linear；工具呼叫與權限（§5.4、§5.5）、確認卡；擴充頁第三層；五種語言；隱私政策。

**第 2 期：** 依第 0 期結果加 Context7（CIMD）、Upstash（DCR）、Vercel（DCR，要先確認它肯不肯讓我們註冊）。Vercel 含「部署」「買網域」等工具；依 owner 的決定，和其他寫入工具一樣由使用者自己決定，不加警告。

**第 3 期：** GitHub（owner 先建 OAuth App，我教步驟；伺服器端唯讀模式可選）。

每期都附：測試、五語言、版本與更新日誌、`check:*` 全過；只有 owner 說「推」才推。

## 8. owner 要做的事（一次性）

- 套用一段 Supabase SQL（新資料表），我給整段可貼上的。
- 確認 Zeabur 已有金鑰庫的主金鑰環境變數（沿用，大概不用新增）。
- GitHub：建一個 OAuth App（約 5 分鐘，不用審核、不用付費），把 Client ID／Secret 設進 Zeabur 的環境變數；**不要貼在聊天裡**。
- 部署後在 iPhone 上實際登入一次，確認流程順。

## 9. 已定案與待定

**已定案（2026-10-10）：** 名稱「連接器」；預設讀取＝允許、寫入＝每次詢問；使用者可把任何工具設成任何狀態，不加限制或警告；第 0 期開始。

**畫面已定案（2026-10-10）：** owner 選 **C 組**（列表、工具權限、寫入確認卡三個畫面都用 C；「c最好」，若之後想混搭再改）。A／B 的渲染留作比較，不實作。

**待定：**
1. **畫面（已選 C，以下是當時的比較依據）：** 三個畫面各有 A／B／C 三組渲染（列表、工具權限、寫入確認卡）。參考的大廠做法：Claude 的連接器對每個工具有「永遠允許／需要核准／封鎖」三種設定，並把工具分成讀取與寫入／刪除；ChatGPT 的寫入動作預設要確認，並展開完整參數（JSON）給使用者看，使用者的社群也在要求「永遠允許」。
2. 工具分成「讀取」與「寫入」兩類，由我們維護的目錄決定（不信對方標的唯讀提示）；預設值依這個分類。

## 10. 風險與沒有證據的地方

- 第 0 期已確認各家公布的登入方式（§4）；仍未確認：對方是否真的接受我們的 CIMD／DCR、GitHub 的遠端 OAuth 是否強制 PKCE、各服務的 refresh token 效期。
- Notion 的授權沒有獨立唯讀範圍（公布的範圍只有 `default`）；Vercel 公布的範圍沒有讀寫之分。這兩個靠使用者的工具權限與確認卡把關，**不是令牌層級的唯讀**，畫面要誠實講。
- 規格仍在演進（2026-07-28 剛發布），各服務的升級速度不一。

## 11. 來源

- Notion MCP：<https://developers.notion.com/guides/mcp/build-mcp-client>
- Linear MCP：<https://linear.app/docs/mcp>
- GitHub 遠端 MCP：<https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server>
- Upstash 遠端 MCP：<https://upstash.com/blog/upstash-has-a-remote-mcp-server-now.md>
- Context7 OAuth：<https://context7.com/docs/howto/oauth>
- Vercel MCP：<https://vercel.com/docs/mcp>
- MCP 規格 2026-07-28：<https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/>
- MCP 授權（OAuth 2.1 與 Streamable HTTP 的來源）：<https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization>

## 12. 第 1 期的實作記錄（18.4.0，2026-10-10）

**做了什麼（檔案）：**

| 部分 | 檔案 |
|---|---|
| 目錄（兩邊共用，不用瀏覽器） | `src/data/connector-catalog.js`：Notion 與 Linear 的端點、登入範圍、說明五語言、工具「讀／寫」的判斷（`toolKind`，只看工具名稱，不信對方標的唯讀） |
| 登入引擎 | `server/mcp/oauth.js`：探索（RFC 9728、RFC 8414／OIDC）、取得身分（預先註冊 → CIMD → DCR）、PKCE S256、`resource` 參數、換令牌、刷新、撤銷；對方給的位址必須是公開 https |
| MCP 用戶端 | `server/mcp/client.js`：Streamable HTTP（回應是 JSON 或事件流都讀）、session、401 換一次令牌、404 重開 session、回應大小上限 |
| 連線與令牌 | `server/mcp/connections.js`：登入交易（只存 state 的雜湊與密封的 verifier）、令牌密封（沿用 `key-vault.js`，綁使用者與 `mcp:<連接器>`）、刷新一次一個（鎖）、工具清單與指紋、改變的工具先停用、每個工具的狀態 |
| 給模型的工具 | `server/mcp/tool-loader.js`：不把所有工具塞進提示，只給兩個工具：`connector_tools`（取得某個服務的工具說明與輸入格式）與 `connector_call`（呼叫，輸入用 `arguments_json` 字串，各家模型的函式格式都接得住）；`combineLoaders` 把技能與連接器合成同一個載入器，所以三種回覆迴圈（一般、網頁研究、Python 沙盒）只改了「說明文字」與「步驟列」兩處 |
| 確認卡 | `server/mcp/ask.js`（伺服器）、`src/app/ui/sandbox/connector-ask-card.js`（畫面）：事件 `{type:'connector', event:'ask'｜'answer'}`，答案走 `POST /v1/runs/:id/connector`；等待的時間不算進回覆的時限 |
| 端點 | `GET /v1/connectors`、`POST /v1/connectors/:id/connect｜disconnect｜refresh`、`PUT /v1/connectors/:id/permissions`、`GET /mcp/callback`（服務把人導回來，不需要登入標頭；結果以 `/connectors?connector=…&connected=1` 或 `&connector_error=…` 帶回 App，網址裡沒有任何登入資料） |
| 資料表 | `supabase/migrations/20261010010000_add_user_mcp_connections.sql`：`user_mcp_connections`、`mcp_oauth_clients`（只有服務角色能讀寫，**瀏覽器完全碰不到**；和 §5.3 原本想的「使用者可讀自己的狀態欄位」不同：一律走伺服器，更簡單也更安全） |
| 畫面 | `src/app/ui/cli/connectors-part.js`（C 組：分組清單、「我的」裡每個連線一張卡、連線範圍、讀取／寫入兩組各有一個整組設定與「個別設定」）、連線前的說明視窗（可選唯讀連線；說明資料會經伺服器送給模型供應商）、位址 `/connectors` |
| 其他 | CIMD 檔案 `public/.well-known/oauth-client.json`、五語言文字（`connector-texts.js`）、隱私政策／使用條款／協助中心五語言與 `PRIVACY.md`、更新紀錄 |

**決定的細節（沒有逐項討論過的，如果 owner 想改請說）：**
- 預設連線範圍：可讀寫（和畫面 C 一致）；Linear 可以選唯讀。
- 連線前一定先出說明視窗（連 Notion 也是），因為要誠實說明「授權包含寫入權限」與資料去向。
- 一則回覆最多呼叫服務 30 次；單次結果超過 30,000 字元截斷；等確認最多 10 分鐘。
- 沒有「暫停連接器」的開關；要停就把工具設成拒絕，或中斷連線。
- 連接器只在由伺服器執行的回覆使用（臨時對話不提供，頁面自己做的回覆也沒有）。

**還沒用真實帳號驗證的（只靠假網路測過）：**
1. Notion、Linear 是否真的接受我們的 CIMD 檔案（第 0 期只證明它們「公布支援」）；若被拒絕，要改走 DCR 或預先註冊。
2. Linear 的 `read` 範圍是否真的讓令牌唯讀、`/mcp` 是否接受 `resource` 參數；Notion 的登入是否需要帶範圍。
3. Notion、Linear 實際的工具名稱：目錄裡 Notion 的 11 個與 Linear 的寫入工具是憑記憶寫的；不在清單裡的工具，名稱以讀取字（get／list／search…）開頭的算「讀取」，其他都算「寫入」（預設每次詢問，比較安全）。
4. 令牌效期與 refresh token 輪替的實際行為。
5. iPhone 上整頁導向登入再回來的順暢度。

**owner 要做的（部署前）：** 在 Supabase 的 SQL 編輯器貼上並執行 `supabase/migrations/20261010010000_add_user_mcp_connections.sql` 的內容。沒做的話：連接器頁會顯示「暫時無法讀取」，回覆照常（伺服器只在記錄裡寫一行，不影響回覆）。Zeabur 不需要新增環境變數（`APP_URL`、`CONNECTOR_REDIRECT_URI`、`CONNECTOR_CLIENT_ID` 都有預設值）。

### 12.1 第一次實際使用後的修正（18.4.1）

owner 用真實的 Notion 帳號試過：登入、工具呼叫（`notion-fetch`、`notion-search`、`notion-create-pages`）、確認卡都動了。發現三件事，已修：

1. **確認卡藏在折疊的步驟裡**，使用者不知道要展開 → 連接器、命令工具（網站與登入）的詢問卡一律放在對話中、步驟列的正下方（`ask-host`），不在步驟裡。
2. **連線視窗卡在「正在前往……」**：到服務登入後按瀏覽器上一頁，頁面以離開時的樣子回來（按鈕停用、取消也停用）→ 回來時（`pageshow`）按鈕恢復，「取消」永遠不停用。
3. **Notion 授權頁只顯示 `api.noureon.com`，沒有名稱與圖示**：Notion 對只靠 CIMD 檔案認識的用戶端，只顯示重新導向的網址（Notion 的說明頁也寫「用連線時收到的重新導向網址替自訂 AI 應用程式命名」，管理員可以在 Notion 裡手動改名稱與圖示；DCR 的 `client_name` 會顯示在授權頁，來源是第三方文件，**沒有親自驗證**）。→ 目錄加 `registration: 'dcr'`（只有 Notion）：服務有註冊位址時先註冊（附 `client_name`、`client_uri`、`logo_uri`、`tos_uri`、`policy_uri`），被拒絕才退回 CIMD 檔案。已連線的要中斷後重連才會用新註冊。授權頁上的「我知道並信任此網址」勾選框是 Notion 對這個重新導向網址的警告，不一定會消失。

### 12.2 清單、權限與圖示（18.4.1，owner 看過第一次實際畫面後的要求）

- **清單裡按連接器：就地展開，介紹它能做什麼**（`details` 一段話加三個「可以這樣問」的例子，五種語言，寫在目錄裡；不是工具清單，owner 更正過），已連線的底下另有「管理工具權限」連到「我的」。不論有沒有連線都一樣展開，**連線改按右邊的「連線」**（已連線的右邊是狀態，按了也是展開；需要重新登入的右邊開重新登入的視窗）。
- **權限可以收起與展開**（「我的」裡每個連線的「權限」，預設展開）；**設定的「權限」分頁新增「連接器」一頁**（每個連線一個收合的區塊，預設收起，展開後是同一套設定）。「我的」裡的那份保留。
- **圖示：** 連接器用各自專案的標誌（`icon`，GitHub 上專案擁有者的頭像，和命令工具的做法一樣：Notion＝`makenotion`、Linear＝`linear`），清單、確認卡、設定都用；圖片載入失敗時顯示名稱第一個字。隱私政策已寫明這些圖是從 GitHub 載入。
- 「權限移到設定的權限分頁」＝在那裡新增一頁、「我的」不刪（owner 確認）。

### 12.3 登入返回後清單是空的（18.4.2）

owner 回報：從服務登入回到 Noureon，「我的」要切換頁面才出現連線。原因：頁面由網址（`/connectors?...`）直接開啟時，帳號狀態稍晚才確定；清單在那之前因為「帳號還沒好」畫成空的，之後帳號好了卻沒有再畫（只有上方的提示文字有定時更新）。修法：擴充頁的定時器偵測帳號狀態改變，在連接器那一部分時重畫。Notion 授權頁的名稱與圖示：註冊的做法沒有讓 Notion 顯示（owner 說「就算了」），目前維持現狀；Notion 的說明頁寫管理員可在 Notion 裡手動改名稱與圖示。


## 13. 第 2 期的實作記錄（18.6.0，2026-10-11）

加了 Context7、Upstash、Vercel 三個連接器，只改目錄（`src/data/connector-catalog.js`）、文字與測試；登入引擎、權限、確認卡、清單畫面都沿用，沒有新的環境變數或 SQL。

**owner 的決定：** 「可以不唯讀的就不要強制唯讀」。所以三個都只有一種登入（可讀寫）：Linear 那種「選唯讀連線」不開放；Upstash 的唯讀開關在 Upstash 自己的登入頁，由使用者決定要不要開，Noureon 不替他選。

| | 端點 | 身分 | 範圍（要 refresh token） | 預設權限 |
|---|---|---|---|---|
| Context7 | `https://mcp.context7.com/mcp/oauth` | CIMD（公布支援，引擎預設順序） | `openid profile email offline_access` | 三個已知工具（`resolve-library-id`、`get-library-docs`、`query-docs`）全部允許 |
| Upstash | `https://mcp.upstash.com/mcp` | DCR | 同上 | 已知的列出、查看、統計類允許；執行指令、建立、刪除、備份、重設密碼與沒見過的工具都先問 |
| Vercel | `https://mcp.vercel.com` | DCR | `openid email profile offline_access` | `list_`／`get_`／搜尋文件等允許；部署、買網域、`get_access_to_vercel_url`（會開出受保護部署的連結）、建立、更新都先問 |

圖示：Context7、Upstash、Vercel 各自在 GitHub 上的頭像（`context7`、`upstash`、`vercel`，已確認三個都存在）。三個都放在「開發」分類。

**沒驗證的（要真實登入才知道）：**
- 對方是否接受我們的 CIMD 檔案（Context7）與 DCR 註冊（Upstash、Vercel；**Vercel 是 Beta，最可能拒絕**）。拒絕時登入會顯示「連線失敗」，要看伺服器日誌才知道原因。
- 要求的範圍是照對方公布的 `scopes_supported` 選的，沒被實測過；若對方回 `invalid_scope`，就把目錄裡該連接器的 `scopes` 改成空陣列（像 Notion 那樣不指定）再試。
- Upstash、Vercel 的工具名稱是憑記憶列的：名稱寫錯不會出事（沒列到的工具一律當寫入、先問），只是少數讀取工具會多問一次；登入後可從擴充頁的實際工具清單校正。
- Vercel 與 Upstash 的授權畫面大概只顯示網址、不顯示 Noureon 的名稱和標誌（和 Notion 官方 MCP 相同的原因）。

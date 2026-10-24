# 進階模式的 Python 可以連網（伺服器沙盒）

Linear：NOU-134。Allen 的決定在 2026-10-24 討論中定案（見 §2）。

## 1. 現況與目標

* 之前：伺服器沙盒的容器是 `--network none`。命令工具（CLI）經過 runner 為每個沙盒開的過濾代理（`sandbox-host/runner/net-proxy.js`）才能上網，每個新網站先問使用者；**模型寫的 Python 步驟拿不到代理**，完全斷網。
* 現在：Python 步驟也走同一個代理。容器仍然完全沒有網路，出口只有那個代理。
* 不變：內部位址（本機、內網、`169.254/16`…）永遠擋、只開 80 與 443、瀏覽器本機的 Python（Pyodide）與標準模式都沒有網路。

## 2. 決定（Allen）

| 項目 | 決定 |
|---|---|
| 做法 | B：新網站先問（同意這一次／永遠同意／拒絕），規則與設定「權限」分頁共用 |
| 預設放行 | 不加新的；沿用現有六個（pypi.org、files.pythonhosted.org、registry.npmjs.org、github.com、raw.githubusercontent.com、objects.githubusercontent.com） |
| 子網域 | 規則維持「網域完全相同」才算，不含子網域 |
| 沒人回答 | 維持 10 分鐘後當成拒絕，不改 |
| 傳輸量 | 每則回覆合計 500 MB（兩個方向），不限制次數 |
| 詢問卡 | 文字統一「模型想連到 `<網域>`」（五語）；不多顯示程式碼 |
| 開關 | 設定「隱私」分頁、「回覆在哪裡執行」旁加一張卡：連網（新網站先問，預設）／不連網。**不連網連命令工具的網路一起關** |
| 套件 | Python 可 `pip install`（環境變數 `PIP_TARGET=/opt/pip`、`PIP_ONLY_BINARY=:all:`）。`/opt/pip` 維持 512 MB（記憶體空間）。沒有預編譯包時不編譯：提示詞要求換套件或換作法並告訴使用者（A 方案） |
| 清除 | 套件在記憶體空間，回覆結束刪沙盒時一併清掉（閒置 10 分鐘、存在超過 2.5 小時是保底） |
| 隱私文字 | 五種語言改成「經過使用者同意才會連到網站」，不出現個人名字 |
| 不做 | 免金鑰搜尋備援、疲勞攻擊處理、沒人在看就立刻拒絕、預設放行清單擴充 |

## 3. 先修的漏洞：先查網域、後詢問

舊流程：代理先 `dnsLookup(host)` 再看規則再詢問。查網域會把名稱交給該網域的 DNS 伺服器，程式可以把讀到的內容編進網域名稱（`<內容>.evil.example.com`），在詢問卡出現之前（甚至使用者按拒絕之後）就送出去。

新流程（`authorize`）：連接埠 → 配額 → IP 直連的內部位址 → 只代表「裡面」的名稱（`localhost`、`*.local`、`*.internal`…，不問也不查）→ **規則與詢問** → 同意後才查位址 → 檢查內部位址 → 連到檢查過的位址。被拒絕、逾時、規則為拒絕的網站完全不查。這也修好了命令工具（同一個代理）。

## 4. 各層的改動

* **runner / 代理**：`authorize` 重排；`maxBytes`（`SANDBOX_NET_MAX_BYTES`，預設 500 MB）計入兩個方向，用完切斷已開的連線，新連線回 403 `X-Noureon-Block: quota`。
* **容器內 `repl.py`**：supervisor 在每個 `run` 訊息帶 `netPort`；worker 在每一步開始設代理環境變數、`PIP_TARGET`、`PIP_ONLY_BINARY`、`PIP_NO_CACHE_DIR`，把 `/opt/pip` 放到 `sys.path` 最前並清除匯入快取（前一步裝的套件在後一步找得到）；沒有代理時全部不設。詢問期間：supervisor 的期限（`Deadline`）與 worker 的 `SIGALRM`（`AlarmPause`）都暫停。
* **伺服器**：`run-spec` 的 `tools.net` 只要 `advanced` 就保留（原本只有 CLI 才留），新增 `tools.net.enabled`（只在 `false` 時送）。`executor.js` 在 `mount` 後呼叫 `mountCli([], { net })`（也在沒有命令工具時）；主機做不到只記 `sandbox_net_failed`，回覆照常有 Python。`runSandboxReply` 新參數 `network`：提示詞與 `run_python` 工具說明依此切換。
* **客戶端**：設定欄位 `sandboxNetwork`（`'on'` 預設／`'off'`）；`netPolicyForRun` 在關閉時帶 `enabled: false`；隱私分頁新卡片；詢問卡標題五語。
* **提示詞**：網路與套件說明（`NETWORK_LINES.proxy`）：只經過過濾、新網站會問使用者、被拒（HTTP 403 加 `X-Noureon-Block`）就換作法並在回答裡說明；只裝預編譯包，沒有時不編譯。
* **文字**：隱私政策、使用條款、協助中心（五語）、`PRIVACY.md`、技能腳本警告（五語）、深度搜尋的提示。

## 5. 相容說明（contract）

* 設定新增一個欄位，預設連網；舊用戶端不認得會被忽略。
* 送給伺服器的 run spec：`tools.net` 對所有進階回覆都送（舊伺服器本來就接受並忽略）；`tools.net.enabled` 只在關閉時送。舊伺服器遇到它會回 `invalid_run_spec`，客戶端依既有規則退回本機。客戶端與伺服器同一批上線，視窗很短。
* **沙盒主機（runner）要重新部署**，否則 Python 步驟收不到 `netPort`（沒有網路，模型看到連線錯誤，不會壞）。部署：`cd ~/Noureon && git pull && sh sandbox-host/install.sh && sh sandbox-host/smoke-test.sh`。

## 6. 風險與沒做的事

* **資料被誘導送出**：使用者按「同意」或「永遠同意」的網站就能收到資料（HTTPS 內容代理看不到）。卡片只顯示網域。預設放行的 `github.com` 等沒有憑證時不能寫入。
* 容器內實測（這個環境沒有 Docker）：代理、`repl.py`、伺服器端都用假的 Docker / 真的子行程測過；真的容器要在 Contabo 部署後跑 `smoke-test.sh` 與實際對話確認（Python 抓網頁、裝套件、詢問卡、關閉連網）。
* 模型自己用 `--no-binary` 蓋掉預編譯限制是可能的；真正的邊界是沒有編譯器、記憶體 2 GB、時間上限。
* `sync:counts` 曾把法律文字裡的連接埠 `80` 當成模型數量改掉（2026-10-24 發現，18.18.0 已上線的政策文字寫成 74）；腳本已略過緊鄰 `443` 的數字，`tests/legal-texts.test.js` 加了防呆。

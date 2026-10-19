# 伺服器從 Zeabur 搬到自架 Coolify（同一台 Contabo VPS）

日期：2026-10-20　狀態：做法已定（擁有者選 A），程式與文件準備好，**VPS 上的步驟由擁有者操作**（Claude 連不到這台機器）。

## 1. 背景

- Zeabur 在 2026-10-17 宣布停運：12/1 起專用伺服器停止續費、各自在到期日關閉；12/31 前全部關閉；資料刪除日與匯出期限未公布。官方建議在自己的到期日前完成備份與遷移。
- Zeabur 經歷第二次資安事件，報導說環境變數、帳號資訊與 API Token 曾被讀取。**擁有者已把放在 Zeabur 的密鑰全部換新**（2026-10-19 回報）。
- Noureon 的伺服器（`server/`，Node 22，`Dockerfile`）原本跑在 Zeabur，執行位置是擁有者自己的 Contabo VPS（84.247.153.81）。同一台機器上還有 Python 沙盒 runner（`sandbox-host/`，Docker）。兩個伺服器服務：正式 `api.noureon.com`（分支 `main`）與測試 `api-staging.noureon.com`（分支 `staging`）。

## 2. 決定

**在同一台 VPS 上自架 Coolify**（開源的自架部署平台：接 GitHub 分支自動部署、Dockerfile 建置、環境變數、網域與 Let's Encrypt 憑證、網頁介面）。選它而不選 Dokploy，是因為較成熟、功能較全；Dokploy 較輕量，也行。

不選託管平台（Railway、Render、Fly.io）的原因：Python 沙盒 runner 在這台 VPS 上，只對機器內部開放；伺服器若在別處，runner 就得對網路開放（加 TLS 與密鑰），多一個攻擊面。

代價與風險：

- 單一機器：機器重開或壞掉，網站後端、測試站與沙盒一起停（2026-10-17/18 Contabo 修補核心漏洞重開機，就是這樣）。
- VPS 的安全與更新自己顧（防火牆、系統更新、Coolify 更新）。
- 要有**一段停機窗口**（見 §5）：Zeabur 的代理佔著 80/443 埠，Coolify 的代理要用同樣的埠，兩者不能並存。

## 3. 這台 VPS 的特殊限制（從專案文件推得，需要在機器上確認）

1. **Docker 被設成不碰網路規則**（`sandbox-host/install.sh`：「Docker is set not to touch the network rules」）。原因是 Zeabur 的 k3s 自己管 iptables。Coolify 的容器靠 Docker 橋接網路對外連線與發布埠，所以 Zeabur 移除後要把這個設定還原（§5 步驟 3）。
2. **runner 只聽 Zeabur 的內部網路位址（`cni0`，10.42.0.1）、只接受 `10.42.0.0/16` 與本機。** Coolify 上的伺服器在 Docker 容器裡，連到主機要走 Docker 橋接位址（`docker0`，通常 172.17.0.1）。所以 runner 要改成同時聽 `docker0` 位址與 `127.0.0.1`，並接受 Docker 配給容器的位址範圍（`172.16.0.0/12`、`192.168.0.0/16`）。這次已改好（見 §6）。
3. Coolify 的「自訂 Docker 選項」只接受固定幾個旗標，**`--add-host host.docker.internal:host-gateway` 很可能不能用**（我只查到官方文件列的清單，沒有實測）。所以伺服器連 runner 時，直接用 `docker0` 的位址：`SANDBOX_RUNNER_URL=http://172.17.0.1:7788`（以 VPS 上 `ip -4 addr show docker0` 實際顯示的位址為準）。

## 4. 開始前要準備（不影響線上，現在就可以做）

| 項目 | 做法 |
|---|---|
| Contabo 快照 | 在 Contabo 控制台替這台 VPS 做一個快照。這是整個遷移唯一的「回頭路」（見 §7）。 |
| Zeabur 上有什麼 | 登入 Zeabur 儀表板，列出這台伺服器上**所有**服務（正式、測試，還有沒有別的，例如資料庫）。Zeabur 一移除，這些全部消失。 |
| 環境變數值 | 把新換的值準備好（見 `server/README.md` 的表：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_KEY`、`KEY_ENCRYPTION_KEY`（正式與測試不同）、`SANDBOX_RUNNER_URL`、`SANDBOX_RUNNER_TOKEN`、`ASSET_SWEEP`、`CONNECTOR_GITHUB_*`、`CONNECTOR_CANVA_*`；測試站另有 `ALLOWED_ORIGINS`、`APP_URL`、`CONNECTOR_REDIRECT_URI`，見 `2026-10-11-staging-design.md`）。放在密碼管理員，不要貼到對話。 |
| DNS | 查 `api.noureon.com`、`api-staging.noureon.com` 現在指向哪裡。若已經是 VPS 的位址（84.247.153.81），切換時不用改 DNS；否則要在 Cloudflare 改成 VPS 位址，並選「僅 DNS」（灰色雲朵），讓憑證可以申請。 |
| Contabo 防火牆 | 若有啟用，放行 22、80、443。 |
| 選時間 | 選使用者最少的時段，先在站內或社群預告。預計 30 到 60 分鐘。 |

## 5. 切換步驟（停機窗口，在 VPS 上以 root 操作）

1. **移除 Zeabur 在這台機器上的東西。**
   - 先看有什麼：`systemctl list-units | grep -i -E 'k3s|zeabur'`、`ls /usr/local/bin | grep -i k3s`。
   - 依 Zeabur 的「移除伺服器」說明處理；若是 k3s，解除安裝的指令是 `/usr/local/bin/k3s-agent-uninstall.sh`（agent）或 `/usr/local/bin/k3s-uninstall.sh`（server），以機器上實際存在的為準。
   - 解除後確認 80/443 沒人聽：`ss -ltnp | grep -E ':80 |:443 '` 應該沒有輸出。
   - 順便檢查 `~/.ssh/authorized_keys` 有沒有 Zeabur 放進去的金鑰，不認得的刪掉。
2. **確認 Docker 還在跑**：`docker ps`（runner 容器 `noureon-sandbox-runner` 應該在）。
3. **還原 Docker 的網路設定**：`cat /etc/docker/daemon.json`。若有 `"iptables": false`（或 `ip-masq`、`bridge: none` 這類），拿掉後 `systemctl restart docker`。runner 設定了 `--restart unless-stopped`，會自己回來；回來後 `docker ps` 確認。
4. **更新 runner**：
   ```
   cd ~/Noureon && git fetch && git checkout staging && git pull
   sh sandbox-host/install.sh        # 會印出 addresses 與 accepted，應該有 docker0 位址（如 172.17.0.1）與 127.0.0.1
   sh sandbox-host/smoke-test.sh     # 全部 PASS
   ```
   之後的更新照原本的流程。`/etc/noureon-sandbox/token` 若已換新，確認 `SANDBOX_RUNNER_TOKEN` 用的是同一個值。
5. **防火牆**：若用 ufw：`ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp`；Coolify 的網頁介面暫時用 8000：`ufw allow from <你的固定IP> to any port 8000 proto tcp`（沒有固定 IP 就先用 SSH 通道：`ssh -L 8000:127.0.0.1:8000 root@<VPS>`）。**容器要連 runner**：`ufw allow from 172.16.0.0/12 to any port 7788 proto tcp`（ufw 預設擋掉容器連主機的埠）。先確認 SSH 規則在，再 `ufw enable`，不然會被鎖在外面。
6. **安裝 Coolify**：用官方文件的一行指令安裝（`https://coolify.io/docs/start-with-self-hosted`，需要 root；以文件上的指令為準）。裝完用瀏覽器開 `http://<VPS>:8000` 建管理員帳號（**立刻建，並用強密碼**，先建先贏）。
7. **替 Coolify 自己設網域**（建議，例如 `coolify.noureon.com`，DNS 指到 VPS、灰雲），設好 HTTPS 後把 8000、6001、6002 對外關掉（官方建議）。
8. **連 GitHub**：在 Coolify 加入儲存庫 `NHZallen/Noureon`（公開儲存庫可直接用，否則建 GitHub App 或用 deploy key）。
9. **建兩個應用**（Build Pack 選 Dockerfile，根目錄的 `Dockerfile`）：

   | | 正式 | 測試 |
   |---|---|---|
   | 分支 | `main` | `staging` |
   | 網域 | `https://api.noureon.com` | `https://api-staging.noureon.com` |
   | 埠 | 8080 | 8080 |
   | 健康檢查 | `/healthz` | `/healthz` |
   | 環境變數 | §4 的表（`SANDBOX_RUNNER_URL=http://172.17.0.1:7788`） | 測試站的值（同一個 runner） |
   | 記憶體限制 | 1.5 GB | 0.75 GB |

   記憶體限制是我的估計：VPS 8 GB，沙盒最多同時兩個、每個 2 GB，給伺服器留的空間有限。若看圖檢查或研究常被殺掉（`docker ps` 看到重啟、日誌有 `OOM`），再調高。
10. **部署，看日誌**：應該有 `listening`、`runs_store_ok`、`sandbox_ok`、`slides_ok`。`https://api.noureon.com/healthz` 回 `{"ok":true,…}`。憑證申請失敗最常見的原因：DNS 還沒指到這台、Cloudflare 是橘雲、80 埠被擋。

## 6. 切換後的驗證（正式與測試各一次）

- `https://<網域>/healthz` 正常，`build` 是最新提交。
- 登入網站，送一則一般訊息，**送出後關掉分頁再打開，回覆有接上**（伺服器背景任務）。
- 圖片生成、深度研究各跑一次。
- 進階模式（Python）做一個簡報或文件（沙盒）；設定頁的命令工具跑一次（runner 的 CLI 快取）。
- 看圖檢查（日誌 `slides_ok`）。
- 連接器：GitHub、Canva 各登入一次（OAuth 回呼 `https://api.noureon.com/mcp/callback` 沒變，但密鑰是新的）。
- 沙盒的連線出問題時：`docker logs noureon-sandbox-runner --tail 30`；從伺服器容器連不到 runner，先看 §5 步驟 5 的 ufw 規則，再看 `SANDBOX_RUNNER_URL` 的位址。

## 7. 回頭路

- 窗口內失敗又找不到原因：用 Contabo 的**快照還原**，整台回到做快照那一刻（Zeabur 還在線，網站恢復原樣）。因此要在 **12/1 之前**做，而且快照一定要先做。
- 還原之後，已經在 Coolify 做的設定都會消失，要重做。
- 一旦 Zeabur 關閉，就沒有回頭路，只能往前修。

## 8. 切換之後

- 在 Coolify 設定 GitHub 自動部署（每次推 `main` 或 `staging` 就部署），取代原本 Zeabur 的自動部署。
- 加上外部的存活監測，打 `https://api.noureon.com/healthz`（例如免費的 UptimeRobot），掛了通知手機。
- Contabo 快照改成定期（每週）。
- Coolify 與 VPS 的系統更新排定時間（核心更新會重開機，Contabo 這次就是如此；重開機後 Docker 容器與 Coolify 應用都會自動回來，但要驗證一次）。
- 刪除 Zeabur 上的專案與授權，向 Zeabur 申請餘額退款與資安補償。
- 把 `server/README.md`、`sandbox-host/README.md`、`.env.example`、`Dockerfile` 裡提到 Zeabur 的地方改成現況（步驟 §5 做完後由 Claude 改，以免文件和實際不符）。

## 9. 這次準備好的程式與文件

- `sandbox-host/runner/config.js`、`main.js`：`RUNNER_HOST` 可以用逗號列出多個位址，每個位址開一個監聽。
- `sandbox-host/install.sh`：自動偵測 `docker0` 位址與（仍存在時的）Zeabur `cni0` 位址，設定 `RUNNER_HOST`；同時依偵測結果設定 `RUNNER_ALLOW`（Docker 配給容器的範圍；`cni0` 在時才加 `10.42.0.0/16`）。再跑一次就會把 `cni0` 拿掉。
- `sandbox-host/smoke-test.sh`：一律連 `127.0.0.1`。
- 測試：`tests/sandbox-host/runner.test.js` 加了多位址的設定測試。

## 10. 還沒確認、做的時候要看的事

- Zeabur 在這台機器上實際裝了什麼（k3s？它的解除指令？）：要在機器上看。
- `/etc/docker/daemon.json` 實際內容。
- `api.noureon.com` 的 DNS 現在指向哪裡。
- Coolify 的安裝指令與設定項目：以官方文件為準，我整理的是搜尋得到的摘要，沒有實測。
- Docker 配給容器的位址範圍：預設是 `172.16.0.0/12` 與 `192.168.0.0/16`；若 `daemon.json` 有自訂 `default-address-pools`，`RUNNER_ALLOW` 要對應調整（`install.sh` 的 `ALLOW` 變數）。

你是 Hark。任務：把「即時畫面」的主機端裝到**這台 Contabo VPS 的測試用 browser-host**（`live-staging.noureon.com`），並把你做到的每一步貼成證據。Allen 已同意：**加一個 Traefik 動態設定檔、裝新版 browser-host、改 `/etc/noureon-browser/host.env`、在主機防火牆開 UDP/TCP 52000–52100**。Contabo 後台防火牆與 DNS 是 Allen 自己做；你只要告訴他現在有沒有通。其餘都不要動。

## 規則
- 不貼密鑰、權杖、密碼（`host.env` 的 `BROWSER_HOST_SECRET` 等只說「有設，長度 N」）。
- **不要重啟 Docker**（`live-restore` 關著，會停掉所有服務）。不要動 Coolify 本身、別的容器、別的 Traefik 設定檔。
- 任何一步失敗：停下來，貼完整輸出與你認為的原因，不要自己想辦法修。
- 還原方式要先寫好再動手（見步驟 4 的最後）。

## 步驟
0. `git clone -b staging https://github.com/NHZallen/Noureon.git /tmp/p3c-install && cd /tmp/p3c-install && git log -1 --oneline`（要看到 staging 的最新提交，含 `browser-host/live-proxy.mjs`）。`node --test tests/browser-host-*.test.js 2>&1 | tail -5` 貼結果。
1. **DNS**：`dig +short live-staging.noureon.com` 要回這台的公開 IP。沒回就停下來告訴 Allen。
2. **裝新版 browser-host**（照 `browser-host/install.sh` 的方式，先用它的 dry-run 看會做什麼，貼出來，再真的跑；只更新服務檔，不要重做網路與防火牆服務）。確認 `/opt/noureon-browser/service/` 有 `live.mjs live-proxy.mjs neko-api.mjs`。
3. **host.env**：加（不要貼值以外的東西，公開 IP 與網域可以貼）：
   ```
   BROWSER_LIVE_PUBLIC_IP=<這台的公開 IPv4>
   BROWSER_LIVE_HOST=live-staging.noureon.com
   BROWSER_LIVE_PORT_BASE=52000
   BROWSER_LIVE_SLOTS=8
   BROWSER_LIVE_PROXY_BIND=172.29.0.1
   BROWSER_LIVE_PROXY_PORT=40011
   ```
   `systemctl restart noureon-browser-host`，貼 `journalctl -u noureon-browser-host -n 30`：要看到 `live_listening`，沒有錯誤。`ss -ltn | grep 4001` 要看到 40010 與 40011 都只聽 `172.29.0.1`。
4. **Traefik**：用 `browser-host/traefik-live.yml.example`，先對照這台 Traefik 實際的 entryPoint 名稱與 certResolver 名稱（你上次實測成功的那份為準；不一樣就用你的並說明），把 `LIVE_HOST` 換成 `live-staging.noureon.com`，放到 `/data/coolify/proxy/dynamic/noureon-live.yml`。**先貼檔案全文給我確認再放**。放好後：
   - `curl -sv https://live-staging.noureon.com/` → 要 404（憑證簽發可能要一兩分鐘；貼憑證簽發者與到期日）。
   - Coolify 的其他網站與面板仍回 200。
   - **還原**：刪掉 `noureon-live.yml` 即還原（Traefik 自動重讀）。把這句貼在報告裡。
5. **主機防火牆**：`sudo sh /opt/noureon-browser/firewall.sh status` 貼出來。UDP/TCP 52000–52100 在主機層要能進來（上次是 ufw 未啟用、INPUT 預設 ACCEPT；現在還是嗎？）。**不要為了這個啟用 ufw 或改預設政策**；若主機層本來就放行，就只貼證據。
6. **對外可達（Allen 在 Contabo 後台開好防火牆後才做）**：先問 Allen 後台開了沒。開了之後，用 `docker run`（照 browser-host 的方式）起一個測試瀏覽器容器，或請 Allen 在頁面上開一個瀏覽器工作，然後從**你這台以外**的地方（Allen 的電腦或別的主機）測 `nc -zvu <IP> 52000`（UDP 不一定有回應，改看 `tcpdump -ni any udp port 52000` 有沒有封包進來）與 `nc -zv <IP> 52000`（TCP）。貼結果。
7. **走一次完整流程**：Allen 會在 staging 站請瀏覽器代理開一個網頁。你在主機上看：
   - `journalctl -u noureon-browser-host -f`：有沒有 `live_ws_open`、`viewer_created`；
   - `docker ps --format '{{.Names}}\t{{.Ports}}'`：瀏覽器容器有發佈 52000 的 UDP 與 TCP，**8080 沒有發佈**；
   - 沒人看時（預覽縮成藥丸）`docker stats --no-stream` 的 CPU 是不是降到只剩 Chromium。
8. 把 `/tmp/p3c-install` 清掉；貼 `docker ps` 證明沒有殘留的測試容器。

## 報告格式
每一步：做了什麼、完整輸出（遮密鑰）、成功／失敗、還原方式。最後列「Allen 還要做的事」與「你沒有做的事」。

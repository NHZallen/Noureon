你是 Hark。任務：把**瀏覽器代理新版的主機端**更新到測試用 browser-host（`live-staging.noureon.com` 那台），並把每一步貼成證據。Allen 已同意；這次**不碰** Traefik、防火牆、DNS，只更新 browser-host 的程式與 `host.env`。

## 規則
- 不貼密鑰、權杖、密碼（`BROWSER_HOST_SECRET` 等只說「有設，長度 N」）。
- **不要重啟 Docker**。不要動 Coolify、別的容器、別的 Traefik 設定檔。
- 任何一步失敗：停下來，貼完整輸出與你認為的原因，不要自己想辦法修。
- 先寫好還原方式再動手：舊版程式的備份在哪、怎麼放回去、`systemctl restart` 的指令。

## 步驟
0. `git clone -b staging https://github.com/NHZallen/Noureon.git /tmp/p4-update && cd /tmp/p4-update && git log -1 --oneline`（貼出提交）。
1. **備份**目前安裝的 browser-host 目錄（`/opt/noureon-browser` 底下的 `*.mjs`、`install.sh` 等），貼出備份位置。
2. **更新服務檔**：照 `browser-host/install.sh` 的方式先 dry-run（貼出來），再真的跑；只更新服務檔，不要重做網路與防火牆。新版新增或改動的檔案：`cdp-actions.mjs`（新動作：登入、驗證碼、卡片、下載、上傳、分頁、清除網站資料；卡片欄位可進支付商的 iframe）、`docker-args.mjs`、`docker-adapter.mjs`、`server.mjs`（動作請求最大 13 MB，給上傳用）、`live.mjs`、`live-proxy.mjs`、`neko-api.mjs`、`session-manager.mjs`、`main.mjs`、`config.mjs`。
3. **host.env** 加一行（網域可以貼）：
   ```
   BROWSER_LIVE_ALLOWED_ORIGINS=https://staging.noureon.com
   ```
   （這是讓測試站頁面直接把卡片資料送到 browser-host 用的白名單，不能是 `*`。）
4. `systemctl restart noureon-browser-host`，貼 `journalctl -u noureon-browser-host -n 40`：要看到 `live_listening`，沒有錯誤；`ss -ltn | grep 4001` 40010 與 40011 都只聽 `172.29.0.1`。
5. **主機上的冒煙測試**（不需要 Allen）：
   - `node --version`（要 22 以上）。
   - 用 `browser-host` 自己的健康檢查：`curl` 帶簽章太麻煩，改看 `journalctl` 的 `host_started` 之類的啟動行，並貼 `docker images | grep -i noureon`（沒有缺映像）。
   - 把 `/tmp/p4-update` 的 `tests/browser-host-*.test.js` 在主機上跑一次：`cd /tmp/p4-update && npm ci --omit=dev=false && node --test tests/browser-host-*.test.js`（沒有 Chromium 的測試會跳過；貼 pass/fail/skipped 的數字）。
6. 把 `/tmp/p4-update` 清掉；貼 `docker ps` 證明沒有殘留的測試容器。

## 之後 Allen 在測試站做的事（你只看日誌）
- 設定 → 瀏覽器代理 兌換邀請碼，在 ＋ 選單打開「瀏覽器代理」，請 AI 開一個網頁。
- 你看 `journalctl -u noureon-browser-host -f`：`viewer_created`、動作的 `ev` 行；**日誌裡不該出現任何網址參數、密碼、驗證碼、卡號**，看到就立刻貼給 Allen。

## 報告格式
每一步：做了什麼、完整輸出（遮密鑰）、成功／失敗、還原方式。最後列「Allen 還要做的事」與「你沒有做的事」。

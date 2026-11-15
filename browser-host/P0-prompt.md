你是 Hark。任務：在一台**全新的 AWS 主機**（俄勒岡，4 vCPU／8 GB）上做「瀏覽器代理」的 P0：基礎安全與實測。只做下面列的事，其他一律不動。每一步都把**完整的指令輸出**貼進報告，不要只寫「成功」。

## 背景
瀏覽器代理要讓模型操作真的瀏覽器、使用者即時看到並接管。瀏覽器會打開任何人給的任何網頁，所以這台主機的重點是：**瀏覽器容器出不去**（唯一的出口是一個會檢查目的地的 egress proxy），而且 Cloudflare WARP 只能包住瀏覽器的網頁流量，不能包住整台主機（會弄壞 WebRTC，也可能讓 ssh 斷線）。設計文件：`docs/superpowers/specs/2026-11-16-browser-agent-design.md`（§4.2、§10、§11）。腳本在 `browser-host/`，先讀 `browser-host/README.md`。

## 規則（請照做）
- Allen 說已做好 AWS 快照、安全群組與 IMDSv2 設定之後才開始。**整個過程開著第二個 ssh 連線。**
- 不要改安全群組、不要附 IAM 角色、不要裝其他東西、不要貼任何密鑰或權杖。
- 任何一步失敗：**停下來**，貼完整輸出，不要自己想辦法修。
- 切換 WARP 的那一步，先貼目前狀態，確認第二個 ssh 還連得上再繼續。

## 步驟
**0. 主機資料**（貼輸出）：`curl -s -m 3 -H "X-aws-ec2-metadata-token: $(curl -s -m 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')" http://169.254.169.254/latest/meta-data/instance-type`、`uname -a`、`nproc`、`lscpu | grep -E 'Model name|Thread|Core|Socket'`、`docker --version`、`warp-cli --accept-tos status`（目前 WARP 是什麼模式）、`curl -s -m 3 http://169.254.169.254/latest/meta-data/ -o /dev/null -w '%{http_code}\n'`（要是 401，代表 IMDSv2 必須）。

**1. 取得程式並預覽**：`git clone -b staging https://github.com/NHZallen/Noureon.git && cd Noureon && sudo sh browser-host/install.sh --dry-run`，貼輸出。

**2. 安裝**：沒有異常就 `sudo sh browser-host/install.sh`，貼輸出。再貼：`docker ps`、`ip addr show nbr0`、`sudo sh /opt/noureon-browser/firewall.sh status`、`cat /etc/noureon-browser/host.env`。

**3. 先檢查一次**（WARP 還沒切）：`sudo sh /opt/noureon-browser/smoke-test.sh`，貼完整輸出。如果 WARP 目前是全隧道，預期會有一項 FAIL。

**4. WARP 改成 proxy 模式**：先 `sudo sh /opt/noureon-browser/warp-proxy.sh`（不加參數，只顯示目前狀態與要做的事），貼輸出；確認第二個 ssh 連得上；再 `sudo sh /opt/noureon-browser/warp-proxy.sh --yes`，貼輸出。`warp-cli` 的指令各版本不同，腳本會試新舊兩種寫法，注意輸出。
然後再跑一次 smoke-test，貼完整輸出。**目標：全部 PASS。**

**5. 有 FAIL 的話**，貼：`docker logs noureon-egress 2>&1 | tail -40`、`sudo iptables -S | head -100`、`sudo iptables -t nat -S | head -40`，並說明你認為原因，**不要自己動手改**。

**6. CPU 實測**（只在第 4 步全部 PASS 之後）：照 `experiments/browser-live/README.md` 的「第六輪」。先把 `docker-compose.yml` 的 `PUBLIC_IP` 換成這台的公開 IP（看 `/etc/noureon-browser/host.env`）。Allen 會從台灣用電腦與 iPhone 觀看（他要先在安全群組開 8080/TCP 與 52000-52100/UDP，**只限他自己的 IP**）。
- 設定：`variants/h264-43.yml`；若可行再加 `variants/h264-43-lq.yml`（映像不一定接受 videoscale，起不來就貼 `docker logs neko-spike | tail -30` 並跳過）。
- 每種設定跑：B（一個觀看者不動）、C（一個觀看者＋`drive.mjs` 捲動 60 秒）、兩個觀看者；每次 `./measure.sh 60`，另外 `vmstat 1 10`（記 `st` 欄）。
- 結束一定要 `docker compose down`。

**7. 報告**，格式如下（貼回給 Allen）：
1. 主機資料（第 0 步）。
2. 安裝與兩次 smoke-test 的完整輸出，以及哪一項 PASS／FAIL。
3. WARP：切換前後的模式、經 WARP 的出口 IP 與直連出口 IP 是否不同。
4. CPU 表：設定 × 情況（B／C／兩人）→ 平均與最高 CPU（%，100% = 一顆 vCPU）、最高記憶體、`vmstat` 的 `st`。
5. 你看到的任何異常，以及你**沒有**做的事。

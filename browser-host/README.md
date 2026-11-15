# browser-host（瀏覽器主機）

設計：`docs/superpowers/specs/2026-11-16-browser-agent-design.md`（§4.2、§10、§11）。Linear：NOU-202 底下 P0（NOU-203）、P1（NOU-204）。
這個資料夾是**瀏覽器代理的獨立主機**（不和正式站同一台機器）要裝的東西。P0 先做「基礎安全」：容器出不去的網路、唯一的出口（egress proxy）、檢查腳本、實測腳本。瀏覽器容器本身是 P1。

## 規則（為了好遷移）

- 主機上**不留任何要保留的資料**，登入狀態與下載都在 Supabase。搬家＝裝新主機、改 DNS、舊的最多等 2 小時（單次任務上限）。
- 全部設定在 `/etc/noureon-browser/host.env`（範本 `host.env.example`），程式裡不寫死 IP、區域、路徑。

## 檔案

| 檔案 | 做什麼 |
|---|---|
| `install.sh` | 裝 Docker 與必要套件、建瀏覽器專用網路（`nbr0`，容器之間不通）、裝防火牆服務、啟動 egress proxy。可重複執行；`--dry-run` 只顯示會做什麼 |
| `firewall.sh` | 防火牆規則：瀏覽器容器**不能主動連任何地方**，只能連 egress proxy；不能連這台機器的其他埠、metadata、別的容器。由 `noureon-browser-firewall.service` 在 Docker 啟動後套用 |
| `egress-proxy.mjs` | 瀏覽器唯一的出口（HTTP／CONNECT 代理）：自己解析名稱，答案裡**任何一個**是內網、保留位址、metadata、這台機器的公開 IP 就拒絕；只放行 80、443；出口可接 WARP（SOCKS5）；日誌只記網域與埠。測試：`tests/browser-egress-proxy.test.js` |
| `warp-proxy.sh` | 把 Cloudflare WARP 設成 **proxy 模式**（不能全隧道，會弄壞 WebRTC 與 ssh）。先看說明，加 `--yes` 才動 |
| `smoke-test.sh` | 裝好後一次檢查：容器出不去、代理擋得住內網與埠、WARP 沒有包住整台機器、IMDSv2 與 IAM 角色 |
| `measure-latency.sh` | **在你自己的電腦上跑**：到主機的來回時間（TCP 連線時間，AWS 預設不回 ping） |
| `noureon-browser-firewall.service` | systemd 服務，開機與 Docker 重啟後重新套防火牆 |

## 順序

1. AWS 主控台：安全群組只開 22（來源限制成你自己的 IP）；實驗時再加 8080／TCP 與 52000-52100／UDP（同樣只限你自己）；執行個體要求 **IMDSv2、hop limit 1、不附 IAM 角色**；先做一個快照（AMI）。
2. `git clone -b staging https://github.com/NHZallen/Noureon.git && cd Noureon && sudo sh browser-host/install.sh --dry-run`，看過再 `sudo sh browser-host/install.sh`。
3. `sudo sh /opt/noureon-browser/warp-proxy.sh`（先看說明），開著第二個 ssh，再加 `--yes`。
4. `sudo sh /opt/noureon-browser/smoke-test.sh`，全部 PASS。
5. 你的電腦：`sh browser-host/measure-latency.sh <主機 IP>`。
6. CPU 實測：`experiments/browser-live/README.md` 的「第六輪」。

## 還沒做（之後的期）

瀏覽器容器、CDP 控制器、控制通道（HTTPS＋HMAC）、登入狀態封存、串流憑證（P1、P3）。這個資料夾現在不包含任何使用者資料或密鑰。

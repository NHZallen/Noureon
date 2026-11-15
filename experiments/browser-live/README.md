# 實驗：即時瀏覽器畫面（WebRTC）

這是一個**實驗**，不是產品的一部分，不會被部署。目的：在 Allen 的 VPS（6 核 12 GB）上實測「有畫面的 Chromium 用 WebRTC 即時串流」要花多少 CPU、順不順、手機連不連得上，再決定瀏覽器功能的設計。
串流用 [neko](https://github.com/m1k1o/neko)（Apache 2.0）。同一個瀏覽器同時給兩邊用：人用 neko 的網頁看與操作，程式（之後是模型）用 Chrome DevTools Protocol 遙控。

## 啟動（在 VPS 上）

1. `git pull`，進到這個資料夾：`cd experiments/browser-live`。
2. 打開 `docker-compose.yml`，把 `NEKO_WEBRTC_NAT1TO1` 那一行的 `PUBLIC_IP` 換成 VPS 的公開 IP。
3. 防火牆開：`8080/tcp` 和 `52000-52100/udp`。**實驗期間請只對 Allen 自己的 IP 開**；密碼是暫時的、連線沒有加密。
4. `docker compose up -d`，第一次要下載映像（幾百 MB）。
5. 瀏覽器打開 `http://<VPS IP>:8080`，名字隨便填，密碼 `user-spike`。管理員密碼是 `admin-spike`。

## 要測的四種情況

每種都先開 `./measure.sh 60`（量 60 秒），看輸出的平均與最高 CPU（100% = 一個核心，6 核最多 600%）。

| 情況 | 怎麼做 |
|---|---|
| A. 沒人看 | 沒有任何人打開網頁 |
| B. 一個人看，不動 | 電腦打開網頁，不碰 |
| C. 一個人看，遙控的程式在捲動網頁 | 電腦開著網頁，同時在 VPS 跑下面的遙控指令 |
| D. 兩個人看（電腦＋iPhone），程式在捲動 | 再加上 iPhone |

遙控指令（和模型之後操作瀏覽器的方式相同，Allen 可以在畫面上看到網頁自己動）：

```
docker run --rm --network container:neko-spike -v "$PWD":/work -w /work node:22-alpine \
  node drive.mjs https://en.wikipedia.org/wiki/Web_browser 60
```

## 請 Allen 看與回報

- 畫面順不順：電腦、iPhone 的 Wi-Fi、iPhone 的行動網路（沒有 TURN，行動網路連不上是預期內的一個數據點）。
- 手機：點進畫面、點網頁上的連結、打字（iOS 鍵盤會不會跳出來）。
- 接管：在電腦上點畫面拿到控制，程式的捲動會和你的操作打架，這就是「接管時模型要暫停」的原因。
- 回報四種情況的 CPU 平均與最高、`docker stats` 的記憶體、主觀的延遲感，最好附一段螢幕錄影。

## 第二輪（2026-11-15 第一輪之後）

第一輪結果：一個觀看者、畫面不動，neko 容器就吃約 2.5 核（VP8 軟體編碼，每秒抓滿 25 張 1280×720）。第二輪比較三種設定，看能降到多少（用 `-f` 疊上去）：

| 設定 | 檔案 | 想驗證的事 |
|---|---|---|
| 只在畫面有變化時才抓 | `variants/damage.yml` | 靜止的網頁幾乎不吃 CPU；要注意新加入的觀看者會不會看到黑畫面 |
| 960×540、15 fps、VP8 快檔 | `variants/small.yml` | 像素乘幀率約三分之一，CPU 大約降多少、清晰度能不能接受 |
| H.264（x264 ultrafast） | `variants/h264.yml` | 軟體 H.264 比 VP8 便宜多少；先確認映像有 `x264enc` |

```
docker compose -f docker-compose.yml -f variants/small.yml up -d
```

換設定前先 `docker compose down`。每種設定都跑 B（一個觀看者不動）與 C（一個觀看者加 `drive.mjs` 捲動），另外跑一次兩個觀看者，看第二個觀看者是否各自編碼。

## 第二輪之後（DevTools 進不了分頁）

第二輪回報：瀏覽器層級的 DevTools 正常，但兩個分頁的連線全部逾時。最可疑的原因是 neko 映像自帶的政策檔 `DeveloperToolsAvailability: 2`（關閉開發者工具），它同時還強制安裝兩個擴充功能。
我在自己的機器上用有畫面的 Chromium 加同樣旗標沒有重現（但那個建置不一定讀這個政策），所以這**還沒證實**。現在的套件：
- `policies.json`：neko 原本的政策，改成允許開發者工具、不裝擴充功能，掛進容器。
- `drive.mjs`：改成連瀏覽器層級、自己開一個分頁（Playwright 也是這樣連），不再依賴 `/json` 裡剛好有哪些分頁。

驗證順序：先用 `git stash` 或暫時拿掉 compose 裡 policies.json 那一行，確認原本的設定下 drive.mjs 還是逾時（證明原因），再放回去確認可以跑。

## 結束

`docker compose down`，把防火牆那兩個埠關掉。

## 第六輪（2026-11-17，新主機：AWS 俄勒岡，4 vCPU／8 GB）

瀏覽器要搬到獨立主機，前面的數字是在 Contabo 6 核上量的，**不能直接用**（AWS 的 vCPU 是超執行緒，4 vCPU 約等於 2 顆實體核心）。用同一組做法重量，這輪的設定是定版的 4:3：

| 設定 | 檔案 |
|---|---|
| 專注模式（高畫質）：1024×768、20 fps、H.264 veryfast、約 4 Mbps | `variants/h264-43.yml` |
| 預覽卡（低畫質）：縮到 640×480、15 fps、H.264 ultrafast、約 1.2 Mbps（**映像不一定接受 videoscale，沒畫面就回報、跳過**） | `variants/h264-43-lq.yml` |

每種設定跑 B（一個觀看者不動）與 C（一個觀看者加 `drive.mjs` 捲動 60 秒），再加一次「兩個觀看者」。每次另外記：

- 開始前的 `nproc`、`lscpu | grep -E 'Model name|Thread|Core|Socket'`、AWS 的 instance type；
- 量測期間的 `vmstat 1 10` 的 `st` 欄（被偷走的 CPU；t 系列的 CPU 額度用完會很高）；
- `./measure.sh 60` 的輸出。

觀看的人在台灣：看畫面是否順、打字與移動滑鼠的延遲感（接管）。延遲數字另外用 `browser-host/measure-latency.sh` 量。

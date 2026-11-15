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

## 結束

`docker compose down`，把防火牆那兩個埠關掉。

你是 Hark。任務：**瀏覽器代理的畫面四周有黑邊**，請在測試用 browser-host（`live-staging.noureon.com` 那台）查出原因並修好，每一步貼成證據。Allen 已同意頁面端不處理，黑邊要在主機端修。這次**不碰** Traefik、防火牆、別的容器。

## 現象（Allen 2026-11-17 9:31 在測試站實測；主機已是 staging d7d390b，所以新容器用的是只指定寬度的低畫質管線）
頁面端的 `<video>` 會把串流鋪滿卡片（我們在真的 Chromium 用 canvas 串流驗過：640×480、1024×768 都鋪滿），所以黑邊是**串流本身的像素**。從 Allen 的截圖量到：

| 畫面 | 看到的 | 推論 |
|---|---|---|
| 預覽卡（`lq`） | 瀏覽器畫面只佔約 **62% 寬、57% 高**，置中，四周全黑 | 約等於 640÷1024 與 434÷768：像是「視窗 1024×~694 縮成 640 寬，放在完整大小（1024×768）的畫格中間」 |
| 專注模式（`hq`） | 寬度是滿的，但**上下各約 30px 黑邊** | Chromium 視窗大約 1024×~694，沒有撐滿 1024×768 的虛擬螢幕 |

所以可能有**兩個**問題：(1) Chromium 視窗沒撐滿虛擬螢幕；(2) `lq` 管線輸出的畫格比內容大（縮小後被補邊）。這是從截圖推的，請用下面的步驟證實或推翻，不要照我的推論直接改。

## 規則
- 不貼密鑰、權杖、密碼。
- **不要重啟 Docker**。不要動 Coolify、別的容器、別的 Traefik 設定檔。
- 先寫好還原方式再動手（備份哪個檔、怎麼放回去、`systemctl restart noureon-browser-host`）。
- 步驟 1、2 只看不改。**改東西之前先把步驟 1、2 的輸出貼給 Allen**，說你要改哪個檔、為什麼。
- 任何一步失敗：停下來，貼完整輸出與你認為的原因。

## 步驟
**0. 取得最新程式**：`git clone -b staging https://github.com/NHZallen/Noureon.git /tmp/p5-fix && cd /tmp/p5-fix && git log -1 --oneline`（貼出提交）。

**1. 量視窗與螢幕（只看不改）**：請 Allen 在測試站開一個瀏覽器任務並保持畫面開著，然後在主機上對那個容器（`docker ps` 找 `noureon-browser-*`）執行（工具不在就換 `xdotool`、`xwininfo`、`xrandr` 其中有的）：
```
docker exec <容器> sh -c 'echo "DISPLAY=$DISPLAY"; xdotool getdisplaygeometry; xrandr --current 2>/dev/null | head -3; xdotool search --onlyvisible --class chromium getwindowgeometry %@; xprop -root _NET_WORKAREA 2>/dev/null'
```
貼出：虛擬螢幕大小、Chromium 視窗的位置與大小、`_NET_WORKAREA`。**要回答的問題：Chromium 視窗有沒有撐滿螢幕？上下左右各差幾個像素？** 也貼 `docker exec <容器> cat /etc/neko/openbox.xml | head -80`（openbox 有沒有設邊框、邊距）。

**2. 量管線（只看不改）**：
- 貼 neko 日誌裡建立 `hq`、`lq` 管線的那幾行（`docker logs <容器> 2>&1 | grep -i -E "pipeline|ximagesrc|videoscale" | head -20`），要看到實際組出來的 GStreamer 字串。
- 在容器裡各抓一張靜態圖比對（`gst-launch-1.0` 不在就說，不要硬裝東西）：
  ```
  gst-launch-1.0 ximagesrc display-name=$DISPLAY num-buffers=1 ! pngenc ! filesink location=/tmp/plain.png
  gst-launch-1.0 ximagesrc display-name=$DISPLAY num-buffers=1 ! videoscale ! video/x-raw,width=640 ! videoconvert ! pngenc ! filesink location=/tmp/lq.png
  ```
  貼兩張圖的像素大小（`file /tmp/plain.png /tmp/lq.png`）。**要回答的問題：`lq` 那張的大小是 640×480 嗎？內容有沒有被縮在中間、周圍補黑？** 能的話把兩張圖交給 Allen 看（不要含任何網頁私人內容，用空白頁或 `about:blank`）。

**3. 修（貼完 1、2 的輸出、Allen 回覆後才做）**：依 1、2 的結果，只改需要改的：
- **視窗沒撐滿**：優先用 openbox 的設定讓 Chromium 一律最大化、無邊框、無邊距（`browser-host/` 裡掛進容器的 openbox 設定），而不是寫死 `--window-size`（螢幕會隨畫面比例 4:3／16:9／直式變，`live.mjs` 的 `setRatio` 會改虛擬螢幕）。改完要驗：切到 16:9 與直式，視窗仍撐滿。
- **`lq` 補邊**：看 2 的 GStreamer 字串，找出哪個元件補的邊（`videoscale` 的 `add-borders`、固定的 `height`、後面的 caps 等），改 `browser-host/docker-args.mjs` 的 `LIVE_PIPELINES.lq`；要讓高度跟著比例，不要變形。改完同樣驗三種比例。
- 改的檔案請**也寫回 repo 的 `staging` 分支**（在 `/tmp/p5-fix` 提交，作者用 Allen 的設定，不要加 AI 署名），不要只改主機上的副本，否則下次更新會被蓋掉。

**4. 驗收（要 Allen 在測試站看）**：預覽卡的畫面**鋪滿整張卡片、四周沒有黑邊**；專注模式的畫面**上下也沒有黑邊**；切到 16:9、直式也是。貼你自己量的像素（視窗大小、`lq` 的輸出大小）當證據。

**5. 清理**：刪 `/tmp/p5-fix`、容器裡的 `/tmp/*.png`；貼 `docker ps` 證明沒有殘留的測試容器。

## 報告格式
每一步：做了什麼、完整輸出（遮密鑰）、成功／失敗、還原方式。最後列「Allen 還要做的事」與「你沒有做的事」。

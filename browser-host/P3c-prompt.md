你是 Hark。任務：在**現在這台 Contabo VPS**（已裝好 `browser-host`，P1／P2 已通過）上，驗證瀏覽器代理「即時畫面」（P3c）要用到的幾件事。**這一輪以調查與實測為主，不改正式服務。** 每一步都貼**完整的指令輸出**，不要只寫「成功」。證據不足就寫「沒有證據」，不要猜。

## 背景
使用者要在對話裡即時看到瀏覽器（WebRTC，用 neko），可以接管（滑鼠、鍵盤、貼上、捲動），也可以換畫面比例。設計文件在 `docs/superpowers/specs/2026-11-16-browser-agent-design.md` 的 §6（即時畫面）與 §13（要驗證的事）。頁面端已經做好，**只差真的串流**。頁面這一側要的東西長這樣：一個「來源」物件，能把畫面畫進一個元素（可以畫兩份：一份主畫面、一份給游標的放大鏡），並能送出 `pointer(x, y, kind)`、`wheel(dx, dy, x, y)`、`key(key, down)`、`text(text)`，x、y 是 0 到 1。你要查出 neko 能不能、怎麼做到這些。

## 規則（請照做）
- **不要動現有的容器、Coolify、Traefik、Docker 設定；不要重啟 Docker**（`live-restore` 是關的，重啟會停掉所有服務）。測試用的東西都放 `/tmp/p3c-*`，用完刪掉。
- 不要貼任何密鑰、權杖、密碼（`/etc/noureon-browser/host.env`、neko 的密碼、憑證私鑰都不能貼；要證明有設就貼「有設，長度 N」）。
- 要改 Coolify／Traefik 的設定，或要開新的對外連接埠：**先停下來問 Allen**，貼你要做的完整內容。
- 任何一步失敗：**停下來**，貼完整輸出與你認為的原因，不要自己想辦法修。
- 測試的容器一律用 `browser-host` 現有的方式啟動（專用網段 `noureon-browser`、`--cap-drop=ALL` 等限制照舊），不要為了方便放寬。

## 步驟

**0. 先確認前提**（貼輸出）：
- `git clone -b staging https://github.com/NHZallen/Noureon.git /tmp/p3c-repo`，`cd /tmp/p3c-repo && git log -1 --oneline`。
- `docker ps --format '{{.Names}}\t{{.Ports}}'`（看現在誰佔了 80、443）。
- `dig +short live-staging.noureon.com`（Allen 說會先設好網域，應該回這台的公開 IP；沒回就停下來說）。
- `sudo ss -ltnup | grep -E ':(80|443|8080|40010|40011|52[0-9]{3})\b'`。

**1. 443 被誰佔著、怎麼讓 `live-staging.noureon.com` 進來**（**只調查，不改**）：
這台的 80／443 很可能是 Coolify 的 Traefik。請查出：它的設定在哪、有沒有檔案型的動態設定資料夾、憑證怎麼申請（哪個 resolver）、WebSocket 預設能不能過。然後提出**兩個方案**讓 Allen 選，各寫清楚要改什麼、風險、怎麼還原：
- A：在 Traefik 加一個動態設定檔，把 `live-staging.noureon.com` 轉給 browser-host 這邊的一個小代理（`172.29.0.1:40011`，之後由我們的 Node 服務提供；現在你用 `/tmp` 裡的測試代理先驗證）。
- B：另開一個對外連接埠（例如 8443）由獨立的反向代理終結 TLS。（只要說明；Contabo 機房防火牆預設只開 22／80／443，要另外開要 Allen 去後台。）
**這一步不要自己改任何設定，貼出方案等 Allen 回答。**

**2. neko 的存取方式**（用映像內的資訊與一個測試容器，貼證據）：
- 映像版本與 digest（`docker image inspect ghcr.io/m1k1o/neko/chromium:latest --format '{{.Id}} {{index .RepoDigests 0}}'`）。
- 查映像內 neko 的說明（`neko --help`、`neko serve --help`，或容器內的文件）：**沒有證據的不要寫**。要回答：
  1. **怎麼給「單一工作階段、一次性、很快過期」的存取憑證？** 目前我們用 `NEKO_MEMBER_MULTIUSER_USER_PASSWORD` 一個共用密碼。能不能改用有成員管理 API 的 provider（建立臨時成員、用完刪）？實測：建一個臨時成員、用它的憑證連上、刪掉、確認不能再連。
  2. **登入與信令的流程**：用什麼請求登入、拿到什麼、WebSocket 的路徑是什麼（我記得 v3 是 `POST /api/login` 與 `/api/ws`，請以實測為準），**把實際的請求與回應的形狀貼出來（遮掉密碼與權杖）**。
  3. **控制訊息的格式**：滑鼠移動、按下放開、滾輪、鍵盤（按下／放開）、貼上文字（剪貼簿）各自在 WebSocket 上送什麼。寫成一張表。
  4. **誰能控制**：模型一直用 DevTools 操作同一個 Chromium；使用者接管時用 neko 的輸入。要說明：neko 的「host／控制權」要怎麼設，才能讓使用者**接管時**輸入有效、**沒接管時**使用者的輸入被擋掉（我們的頁面只在接管時才送）。
  5. 能不能**同一個畫面畫兩份**（同一條影片串流開兩個 `<video>`，或第二個觀看者共用管線）。我們之前實測過第二個觀看者共用編碼管線，這裡要確認用同一個連線掛兩個 `<video>` 的做法在 neko 的客戶端程式裡是否可行。

**3. 經反向代理走 HTTPS＋WebSocket**（只在 Allen 回答第 1 步之後）：
照 Allen 選的方案，用 `/tmp` 裡的測試代理（Node 或 Caddy 二進位，核對 SHA-256，不用 apt）驗證：`https://live-staging.noureon.com/s/<隨機路徑>/` 能打到測試容器的 neko，**登入與 WebSocket 都通**，路徑是不可猜的（至少 128 位元隨機），別的路徑一律 404。貼：`curl -sv` 的握手摘要、一次 WebSocket 升級成功的證據、憑證是誰簽的與到期日。
**同時確認 neko 容器的 8080 沒有直接對外**（`ss -ltn` 與 `nmap` 或從外面連都連不到），只有代理能進。

**4. UDP 與多個工作階段**：
- `NEKO_WEBRTC_EPR`（連接埠範圍）、`NEKO_WEBRTC_NAT1TO1`（主機公開 IP）設起來後，WebRTC 要靠哪些連接埠。**同時兩個瀏覽器**（兩個容器）的時候，連接埠怎麼分？每個容器切一段互不重疊的範圍，還是有單一連接埠多工的設定（我記得有 UDP mux 之類的選項，請以映像說明為準）？實測同時開兩個容器、各有一個觀看者。
- 防火牆：貼 `sudo sh /opt/noureon-browser/firewall.sh status`。UDP 範圍要在主機防火牆與 Contabo 後台都開；**你能做的只有主機防火牆那一半，要先問 Allen 再開**。
- 擋 UDP 的網路怎麼辦：只要記下 neko 有沒有 TCP 備援（TCP mux／TURN），**這一輪不實作**。

**5. 畫質與只在有人看時才編碼**：
- 定義低、高兩條 H.264 管線（預覽用低、專注模式用高），客戶端怎麼選？沒人選的那條是不是真的不編碼？用 `docker stats` 與 `top` 證明：沒有觀看者時，容器的 CPU 接近只剩 Chromium 本身。
- 用我們已有的量測：`experiments/browser-live/measure.sh`、`drive.mjs`（照那邊的 README）。記 `vmstat 1 10` 的 `st` 欄。

**6. 畫面比例切換**：
- 預設 1024×768（4:3），要能切到 1280×720（16:9）與 768×1024（直式）。實測：在不重啟容器的前提下改虛擬螢幕大小（我記得 neko 有改畫面大小的 API，也可以 `xrandr`，請以實測為準），**Chromium 視窗要跟著**滿版；量串流中斷到恢復畫面的時間（秒）；DevTools 控制（`browser-host/cdp-actions.mjs` 的截圖）在切換前後是不是仍然正常、截圖尺寸是不是新的大小。
- 若一定要重啟 Chromium 才能換：說明登入狀態（profile）會不會保留。

**7. 游標與座標**：量一下使用者在畫面上的位置（0～1）換成虛擬螢幕座標的對應有沒有誤差（例如 4:3 的畫面在頁面上被縮放時），並確認 neko 的滑鼠座標是用**虛擬螢幕的像素**。寫出換算公式。

**8. 報告**（貼回給 Allen，照這個格式）：
1. 前提（第 0 步輸出）。
2. 443 與網域：方案 A、B 與你的建議（第 1 步），**等 Allen 選**。
3. neko 能力表（第 2 步）：憑證／登入流程／控制訊息表／控制權／一份畫面開兩個 `<video>`，每項「有證據／沒證據」。
4. 經代理的 HTTPS 與 WebSocket 實測結果（第 3 步），以及 neko 沒有直接對外的證明。
5. UDP 與多工作階段的做法與實測（第 4 步），需要 Allen 做的防火牆動作。
6. 畫質與無人觀看的 CPU 數字（第 5 步）。
7. 比例切換：做法、秒數、DevTools 是否正常（第 6 步）。
8. 座標換算（第 7 步）。
9. 你看到的任何異常，以及你**沒有**做的事。

最後：把 `/tmp/p3c-*` 的東西清掉，貼 `docker ps` 證明沒有殘留的測試容器。

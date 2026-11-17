你是 Hark。任務：**瀏覽器代理跑到一半，瀏覽器從主機端消失**（只查，不改任何東西）。不碰 Traefik、防火牆、別的容器，不重啟 Docker，不貼密鑰、權杖、密碼、網頁內容。

## 發生什麼（測試站，2026-11-17，台灣時間 20:48 開始，UTC 12:48）
- 一個任務（查 Google 航班，開在 google.com/travel/flights）。20:49 到 20:51 畫面串流正常；約 20:54 卡片的畫面串流掉了（卡在「連線畫面中」）；20:56 動作失敗，卡片顯示「瀏覽器暫時無法使用」。這時主伺服器的那筆回覆還活著（模型還在想）。
- 主伺服器這邊：工作階段時限不是原因（主機設定 idle 60 分鐘、單一任務 120 分鐘）。主伺服器的 `tick` 看到主機回「已停止」時會把工作階段忘掉，之後的動作就回 `not_found`。

## 請查（每一項貼證據：日誌行、時間戳、`docker` 輸出，遮掉敏感資料）
1. 20:48–20:57（UTC 12:48–12:57）之間，那個工作階段的容器發生了什麼？`docker ps -a`、`docker inspect`（只要 `State`：`OOMKilled`、`ExitCode`、`StartedAt`、`FinishedAt`）、`docker logs --since/--until`（只看 neko 與 supervisor 的錯誤行，不要網頁內容）。
2. 是不是記憶體？容器上限 2g（`BROWSER_MEMORY`）、`/dev/shm` 1g。Google 航班很吃資源：看 `dmesg`/`journalctl -k` 有沒有 OOM kill、有沒有 Chromium 被殺或 renderer crash、neko 的 WebRTC 是否因此重啟。
3. 主機日誌（`noureon-browser-host`）在這段時間有沒有 `session stopped`、`not_found`、`unreachable`、health 失敗、CDP 9222 連不上。
4. 同一時間有沒有別的工作階段（`BROWSER_MAX_SESSIONS`=2）在跑、主機整體的 CPU／記憶體／swap 有沒有吃滿？
5. 重現（要先貼計畫給 Allen 看過再做）：開一個新任務、打開 google.com/travel/flights 搜尋台北到東京，每 30 秒記一次 `docker stats --no-stream`（記憶體、CPU、PIDs）直到 10 分鐘，看記憶體是否一路爬升到上限。

## 回報
最可能的原因（有證據的才寫）、建議的設定（例如記憶體上限、shm、Chromium 旗標），以及你沒做的事。

# 登入前首頁（Homepage）設計與實作紀錄

狀態：已實作（18.1.0）。擁有者在 demo 階段核准版面與文案後才做進專案。

## 1. 目標

登入前的首頁改成像一般產品公司的首頁：先講價值，再用 Noureon 自己的畫面說明功能，最後登入。畫面一律是真實元件的截圖，不做假畫面。

## 2. 結構

1. 導覽列（品牌、錨點連結、語言選單、登入）
2. 首屏（標題、說明、開始使用）
3. 廠商列
4. **三段固定視窗的捲動介紹**：模型理事會、深度研究、檔案與簡報（只有這三段，不要再增加）
5. 擴充、規格數字、伺服器執行、細節（九張卡）、隱私與信任
6. 登入表單（`#login-section`，沿用原有的 id 與 i18n 鍵）
7. 頁尾（產品、資源含更新紀錄／GitHub／官方 X 帳號 @NoureonAi／開源授權、法務、版權）

## 3. 檔案

| 檔案 | 說明 |
|---|---|
| `src/templates/fragments/00-shell.fragment.js` | 首屏、登入表單、頁尾的靜態標記（zh-TW 預設文字，不依賴任何延遲載入的檔案） |
| `public/home.css` | 首頁樣式，由 `index.html` 連結。顏色只用 `src/styles/tokens.css` 的名稱（新增 `--brand-logo`），測試擋住自寫顏色 |
| `src/app/ui/home/home-page.js` | 登入畫面顯示後才動態載入（`startup-lifecycle.js`）；建立三段介紹與後面的區塊，依 `<html lang>` 與 `data-theme` 套文字與圖片 |
| `src/app/ui/home/home-scroll.js` | 捲動進度決定哪一格畫面、哪一段文字亮起；視窗高度取一次且只變小（內建瀏覽器的工具列） |
| `src/app/ui/home/home-frames.js` | 圖片清單、每格出現的捲動比例、圖片路徑 |
| `src/data/home-texts.js` | 五種語言的全部文字；`HOME_FACTS` 的數字由測試對照真實登錄表（模型數、廠商數、簡報設計、文件樣式、技能、命令工具、理事會人數） |
| `public/home/<語言>/<亮暗>-<段>-<格>.webp` | 畫面截圖：5 語言 × 2 主題 × 15 張；每段所有格大小相同，視窗不會跳動 |

## 4. 為什麼是這樣

- 主 chunk 與 index CSS 都已貼近預算，所以首頁樣式放在 `public/`、文字放在延遲載入的資料檔；登入表單不等它們。
- 圖片是真實元件的截圖（`.scratch-harness` 的臨時頁用同一份 `createResponseProgressRenderers`、研究卡、檔案卡、擴充頁渲染），不是手畫。要換畫面或語言時，需重新截圖並轉成 webp（寬 930，擴充圖寬 1000，品質 80）。
- 手機視窗大小用 `100svh * .94` 扣掉導覽列、說明文字（高度用 JS 量測）與間距算出，視窗寬度最多填滿畫面，底部留 6%（部分內建瀏覽器會遮住底部一點）。
- 連結預覽（`index.html` 的 description / og / twitter、`package.json`、兩份 manifest）只能一種語言，目前是英文。

## 5. 移除

舊首頁的範例對話區（`demo-model-homepage.js`、`src/data/demo-conversations*`、相關 CSS 與 i18n 鍵 `welcome`、`heroSubtitle`、`exploreModels`、`exploreModelsDesc`、`demoChatTitle`）已全部沒有在用，連同測試移除。`startJourney` 的文字改為「第一次使用…」。

## 6. 尚未在真機驗證

沙盒環境只有 Chromium（Playwright）。iPhone 內建瀏覽器的實際可視高度、捲動手感、暗色切換需擁有者實機確認。

## 登入頁在手機上滑動會亂跳（2026-11-05，Allen 的錄影，未確認原因）

Allen 在 iPhone 的 LINE 內建瀏覽器錄影：在登入卡（含 Cloudflare 驗證）與頁尾附近上下滑，畫面會突然跳到很遠的地方。沙盒只有 Chromium：用 iPhone 14 模擬、觸控滑動整頁（含來回滑）量過，頁高固定 14474px、沒有 layout shift、沒有跳動，所以**沒有重現，原因未確認**。程式裡也找不到會主動捲動這頁的地方（`scrollTo`、`scrollIntoView` 在登入頁與首頁都沒有）。

放到 `staging` 測試的修正，都是針對「最可疑」的點，沒有一個被證實：

1. `html, body { overscroll-behavior: none }` 原本對每一頁生效（為了 app 不被拖動、不彈回）。登入頁是很長的一般頁面，瀏覽器（尤其會隨捲動收起工具列的內建瀏覽器）需要自己的彈回與工具列，現在只在 app、啟動遮罩、擴充頁（`html:has(...)`，和原本鎖 `overflow: hidden` 的是同一條規則）才設 `none`，登入頁恢復預設。
2. 驗證元件（`.turnstile-widget`）預留 65px 高度（載入前後登入卡不再變高），並設 `touch-action: pan-y`（手指落在它上面還是捲動頁面）；規則在 `public/home.css`（登入頁自己的樣式）。
3. 診斷工具：網址加 `?scrolldebug=1` 會載入 `public/scroll-debug.js`，在畫面下方顯示捲動「太大步」的紀錄（超過 250px/120ms 或單次超過 600px）與當下的頁高、可視區、驗證元件高度、layout shift，點一下可複製；不寫入也不送出任何東西。若修正沒用，請在 `staging.noureon.com/?scrolldebug=1` 重現後把畫面下方的文字貼回來。

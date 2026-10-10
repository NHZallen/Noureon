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
- 手機視窗寬度用 `100svh * .8` 算，因為 iOS 內建瀏覽器會遮住底部一部分；說明文字高度用 JS 量測。
- 連結預覽（`index.html` 的 description / og / twitter、`package.json`、兩份 manifest）只能一種語言，目前是英文。

## 5. 移除

舊首頁的範例對話區（`demo-model-homepage.js`、`src/data/demo-conversations*`、相關 CSS 與 i18n 鍵 `welcome`、`heroSubtitle`、`exploreModels`、`exploreModelsDesc`、`demoChatTitle`）已全部沒有在用，連同測試移除。`startJourney` 的文字改為「第一次使用…」。

## 6. 尚未在真機驗證

沙盒環境只有 Chromium（Playwright）。iPhone 內建瀏覽器的實際可視高度、捲動手感、暗色切換需擁有者實機確認。

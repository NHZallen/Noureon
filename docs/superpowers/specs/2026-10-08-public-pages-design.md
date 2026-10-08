# 公開頁面：使用條款、隱私權政策、更新紀錄（設計，待 owner 確認）

狀態：P1 已做完（頁面、建置、轉址、離線快取、網站地圖；等 owner 說「推」才部署）；P2 還沒做。owner 已於 2026-10-08 確認 §9 的兩個決定。

## 1. 已決定

- 做成獨立的公開網頁（方案 B）：`noureon.com/terms`、`noureon.com/privacy`、`noureon.com/updates`。不用登入就能看，不載入 App。
- 設定頁「條款與政策」的兩列、「版本資訊」的「查看完整更新紀錄」改成連到這三個網址。
- 第一次的「新版本」彈窗保留，彈窗上加一個連到 `/updates` 的連結。
- 隱私權政策先把現有設定頁那一段文字原樣獨立成頁；之後再換成完整內容（`PRIVACY.md`），內容由 owner 確認。
- 登入畫面底下放「使用條款・隱私權政策」兩個小連結。
- 三個頁面左上角放純文字連結「前往 Noureon」（不用「回到」），連到 `https://noureon.com/`。
- 黑白極簡，淺色深色跟著系統；五語言（zh-TW、en、fr、ru、es）。
- 連結開新分頁（`target="_blank"`）；更新紀錄的網址用 `/updates`（owner 2026-10-08 確認）。
- 這算新功能，版本 17.13.0，更新紀錄照規則寫。

## 2. 現況（讀過程式後確認）

- 條款與隱私權政策是設定頁 `about-section` 裡的兩個 `<details>`，文字來自 i18n 的 `termsOfUseDesc`、`privacyPolicyDesc`（五語言各一段）。範本在 `src/templates/fragments/04-shell.fragment.js`。
- 更新紀錄：`#update-info-btn` 的點擊（`app-bootstrap-lifecycle.js` 的 `showUpdateHistory`）開彈窗；彈窗內容由 `src/app/ui/updates/update-log-view.js` 畫，資料是 `src/data/update-logs/entries.js`（118 筆，只有繁中）。
- `/cli`、`/nouras` 是 App 內的頁面：`vercel.json` 把它們轉到 `index.html`，再由程式用 `history.pushState` 處理。這次**不用**這個做法。
- `public/service-worker.js`：所有頁面導覽走 `networkFirstNavigation`，而且 `cacheNavigationResponse` 會把任何成功的 HTML 回應存成快取的 `'/'`（App 外殼）。見 §5，這是最大的陷阱。
- `vercel.json` 的 CSP（目前是 report-only）`script-src 'self' https://challenges.cloudflare.com`，不允許行內 script。
- `public/sitemap.xml` 只有首頁。App 的設定（含語言）存在分開儲存裡，靜態頁讀不到，也沒有 localStorage 鏡像。

## 3. 網址與檔案

| 網址 | 內容 | 來源 |
|---|---|---|
| `/terms` | 使用條款 | i18n 的 `termsOfUse`（標題）、`termsOfUseDesc`（內文） |
| `/privacy` | 隱私權政策 | i18n 的 `privacyPolicy`、`privacyPolicyDesc` |
| `/updates` | 完整更新紀錄 | `entries.js`，沿用 `update-log-view.js` 的 `parseLogBlocks` |

做法：建置時產生靜態 HTML，不用 Vite 多頁、也不另外維護一份文字。

- 新增 `scripts/build-public-pages.mjs`，接在 `npm run build` 後面（`vite build && node scripts/verify-production-katex.mjs && node scripts/build-public-pages.mjs`），把三個 `.html` 寫進 `dist/`。
- 每頁把五種語言的內容都放進 HTML（不用 JS 也讀得到，搜尋引擎也抓得到），預設只顯示一種，其他用 `hidden`。更新紀錄只有繁中，五種語言版本都顯示同一份，語言切換只換頁面外框的字。
- 樣式與切換語言的小腳本是兩個**外部檔案**：`public/pages.css`、`public/pages.js`（CSP 不允許行內 script）。腳本只做三件事：依瀏覽器語言決定顯示哪一種語言、語言選單切換並記在這個網站自己的 localStorage（`noureon:pages-lang`，讀寫都包 try/catch）、更新 `<html lang>` 與頁面標題。
- 每頁有：左上「前往 Noureon」、語言選單、標題、內文、頁尾的客服信箱。不放最後更新日期（來源文字沒有，不編造）。
- `<title>`、`<meta name="description">`、`<link rel="canonical">`、`<html lang>` 依語言設定；頁面不加 `noindex`。

## 4. 版面（黑白極簡）

- 單欄，內文最寬約 720px，置中；手機左右留 16px。
- 淺色：白底黑字；深色：黑底白字（`prefers-color-scheme`）。連結只有底線，沒有彩色。
- 更新紀錄：每個版本一個區塊，版本與日期在左，內容在右（手機改成上下），最新的在最上面；每個版本有錨點 `#v17.13.0`，可以直接分享連結。
- 版面參考：OpenAI 與 Anthropic 的法律與更新頁（單欄、純文字、無側欄）。

## 5. 必須處理的陷阱：離線快取

`service-worker.js` 會把任何成功的 HTML 導覽回應存成快取的 `'/'`。使用者打開 `/terms`，快取裡的 App 外殼就被條款頁蓋掉；之後離線或網路慢時，打開 Noureon 會看到條款頁。

做法：`fetch` 事件裡，導覽請求的路徑是 `/terms`、`/privacy`、`/updates` 時直接 `return`（不攔截、不快取）。`service-worker.js` 一改，已安裝的 PWA 會自己更新；不另外動 PWA 快取版本（它與產品版本分開管理，見 `src/data/version.js` 的說明）。要有測試證明這三個路徑不會被存進快取。

## 6. Vercel 與其他設定

- `vercel.json` 的 `rewrites` 加三條：`/terms → /terms.html`、`/privacy → /privacy.html`、`/updates → /updates.html`。不開 `cleanUrls`（會影響其他路徑）。
- `public/sitemap.xml` 加三個網址；`robots.txt` 不用改。
- 既有的全站標頭（HSTS、`X-Frame-Options` 等）會自動套用到這三頁。

## 7. App 端的修改（第二階段）

1. 設定頁「條款與政策」：兩個 `<details>` 改成連結 `<a class="pz-nav" href="/terms" target="_blank" rel="noopener">`，箭頭圖示不變。連結用新分頁開（理由見 §9）。
2. 「版本資訊」：`#update-info-btn` 改成連到 `/updates` 的連結；移除更新紀錄歷史彈窗與 `showUpdateHistory`。**第一次的「新版本」彈窗保留**，彈窗底部加一個「查看完整更新紀錄」連結到 `/updates`。「啟用更新通知」開關與版本號顯示不變。
3. 登入畫面底下加兩個小連結「使用條款」「隱私權政策」（新分頁）。
4. 移除不再使用的 i18n 鍵（`termsOfUseDesc` 等仍由頁面產生器使用，所以**不移除**，只移除彈窗專用的鍵），i18n 內容雜湊測試的雜湊跟著更新。
5. 新增的文字五語言：「前往 Noureon」（zh-TW「前往 Noureon」、en「Go to Noureon」、fr「Aller sur Noureon」、ru「Перейти в Noureon」、es「Ir a Noureon」）、頁面標題、頁尾。

## 8. 分階段

實作時的補充決定：頁面標題用腳本裡自己的對照表（i18n 裡俄文的「隱私權政策」小寫開頭、「更新歷史」譯成命令句「Обновить историю」，不適合當標題）；更新紀錄只在頁面裡出現一份（不隨語言重複），語言只影響頁面外框；隱私權政策與條款的內文先照原樣放成一整段，之後換完整版時再分段。

- **P1 頁面、建置、轉址、離線快取、網站地圖。** 做完部署後，三個網址已可打開，但 App 裡還沒有任何連結。測試：產生的 HTML 含五種語言、沒有行內 script、更新頁含全部 118 筆（以及每筆的錨點）、`vercel.json` 有三條轉址、service worker 不快取這三個路徑。
- **P2 App 連結、移除舊彈窗、版本 17.13.0 與更新紀錄、PRIVACY 與文件。**

每階段做完回報，等 owner 說「推」才推 `main`。全套檢查照 AGENTS.md：`npm test`（不含 `runner.test.js`）、`npm run build`、`check:sizes`、`check:legacy-runtime`、`check:server`、`check:version`、`npm audit --omit=dev`。

## 9. 已決定（原本的待決事項）

1. 連結開新分頁：設定頁的使用者看完直接關掉就回到原處；iPhone 裝到主畫面的 App 沒有網址列與返回鍵，原分頁開會被帶進靜態頁，回不到設定頁。
2. 更新紀錄網址用 `/updates`。

## 10. 風險

- 離線快取（§5）：沒處理會讓 App 離線時顯示條款頁。
- CSP：腳本與樣式必須是外部檔案，否則日後 CSP 從 report-only 改成強制就會壞。
- 隱私權政策是對外的法律文字：這次只搬現有內容、不改字；完整版內容要 owner 確認後才換。
- 更新紀錄只有繁中：其他語言的使用者看到的是繁中，頁面上不另外說明。

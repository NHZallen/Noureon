# 啟動時只載入使用者的語言（NOU-17，NOU-7 的 C 方案）設計草案

**狀態：** 草案，等 Allen 與 Sun 確認後才動程式（2026-10-14）。區塊 39「PWA、啟動、離線與載入效能」，Allen 負責；Sun 同意方向（NOU-7 討論），寫法細節需要 Sun 確認（§7）。

## 1. 事實（2026-10-14 用建置的 source map 與 gzip 量的）

啟動時載入、且每個都把五種語言並排放在同一個檔案裡的有兩塊：

| 區塊 | 檔案 | 壓縮後 | 內容 |
|---|---|---|---|
| 介面文字（`src/data/i18n/parts/*.js`，由 `zh-TW.js` 等四個檔案 `mergeLocale` 合併） | `i18n-*.js`（一個檔案） | **85.6 KB** | 五種語言全部，使用者只用其中一種 |
| runtime 文字表（`sandbox-texts`、`permission-texts`、`runtime-texts`、`file-texts`、`server-reply-texts`、`research-texts`、`vision-texts`、`model-picker-texts`、`cli-texts`…） | 在 `legacy-submit-input-*.js` 裡 | 約 65 KB（占這個檔案的 39%） | 同上 |

* 預算檢查（`check:sizes`）只看「最大的一個啟動檔案」`legacy-submit-input`（155.0 KB 壓縮，上限也是 155.0 KB，長期目標 110 KB），**不計入** `i18n-*.js`，所以第一塊的 85.6 KB 一直沒被注意到。
* 更新日誌（`update-logs/en.js` 等）早就是每個語言一個延遲載入的檔案，不在這裡。
* `parts/*.js` 每個檔案是 `export default { 'zh-TW': {…}, en: {…}, fr: {…}, ru: {…}, es: {…} }`，這是 Sun 與 Allen 的**編寫格式**（AGENTS.md 規定），不改。
* 程式讀文字的方式（要保持不變）：`globalThis.i18n[語言][鍵]`（約 130 處）、`sandboxText(語言, 鍵)` 這類函式、`TEXTS[語言] || TEXTS['zh-TW']` 的後備。
* 伺服器與瀏覽器共用其中一些表（`scripts/server-shared-modules.json`：`runtime-texts`、`sandbox-texts`、`council-runtime-texts`…），伺服器端與測試要能拿到**全部**語言。
* PWA 的 service worker 會把建置清單裡所有檔案預先快取（背景下載，不擋啟動），所以分檔後離線切換語言仍可用。

## 2. 目標與不做的事

* 啟動時只下載、解析**目前語言**的文字；預估壓縮後 `i18n` 省約 68 KB、`legacy-submit-input` 省約 50 KB（降到約 105 至 110 KB，達長期目標）。
* 切換語言時才載入新的那一份，之後切回來不再下載。
* **不改編寫格式**（Sun 照現在的方式在 `parts/<domain>.js` 與各 `*-texts.js` 加文字）、**不改呼叫端**（約 130 處 `i18n[…]` 與各 `xxxText(語言, 鍵)`）、**不改任何文字內容**。
* 不處理：更新日誌（已分檔）、`home-texts`（登入前首頁，另有五語言頁面）、`skill-catalog*`（資料，不屬於這張單）。

## 3. 做法：建置時切片，編寫格式不變

一個 Vite 外掛 `languageSplit`（放 `scripts/vite-language-split.mjs`），只在瀏覽器的建置用；測試、伺服器、開發模式一律用原本完整的檔案。

1. **登記表** `scripts/language-split-modules.json`：列出要切片的模組與它的形狀（`{ path, shape }`，shape 是「檔案裡哪個物件的鍵是語言」：`default`（`export default {…}`）、`TEXTS`（`const TEXTS = Object.freeze({…})`）、`PERMISSION_TEXTS` 之類的具名常數）。
2. **切片**：外掛用語法樹找到那個以 `zh-TW`、`en`、`fr`、`ru`、`es` 為鍵的物件，產生五個虛擬模組 `<原路徑>?lang=<語言>`：原始碼完全相同，只是那個物件只留該語言。其餘程式（函式、後備邏輯）原樣保留，所以呼叫端不用改。
3. **載入**：原模組在瀏覽器建置裡被換成一層薄薄的包裝：
   * 一個語言包登記處 `src/app/i18n/language-packs.js`：`ensureLanguage(語言)` 會把**所有登記的模組**的那一種語言用動態載入抓下來、合併進模組的資料表（同一個物件，後來才補上的語言）。
   * 檔案以語言分組成 5 個小檔案（建置的 `manualChunks` 依 `?lang=` 分組），不是每個模組每個語言一個檔案。
4. **啟動順序**：`main.js` 在第一次畫面渲染前 `await ensureLanguage(目前語言)`（和現在 `await import('./data/i18n.js')` 同一個位置）；目前語言由 `public/startup-language.js` 與 `login-language.js` 已有的判斷決定。
5. **切換語言**：設定、登入頁選語言時先 `await ensureLanguage(新語言)` 再套用並重繪（現在的重繪流程不變）。
6. **後備**：每個表的五種語言**鍵完全一致**（`i18n-coverage` 等測試已經強制），所以不需要為了後備而同時載入 `zh-TW`。不認得的語言代碼統一映射成預設語言（`zh-TW`）並載入它。
7. **伺服器與測試**：不經過外掛，拿到原本的完整檔案，行為與今天相同。

### 為什麼不直接改編寫格式（每個語言一個檔案）
`parts/<domain>.js` 五種語言並排是 Sun 與 Allen 現在的流程，也是「一個領域一個檔案、兩個人不衝突」的前提；拆成五個檔案會讓每次新增文字要開五個檔案，也讓翻譯對照變困難。建置時切片可以兩全。

## 4. 分階段（每階段一次提交，記錄 `check:sizes` 與下載大小）

0. **量測腳本**（`scripts/measure-startup.mjs`）：建置後列出啟動時載入的所有檔案（含 `i18n`）的原始與壓縮大小，並把它們加進 `check:sizes` 的報告，之後不會再漏看。
1. **外掛與試點**：先只登記兩個檔案：`sandbox-texts.js`（具名常數形狀，也被伺服器共用）與 `parts/menus.js`（`default` 形狀、很小）。驗證：兩個形狀都切對、啟動順序、切換語言、離線、測試通過。
2. **runtime 文字表**：逐張登記其餘各表（每張一個小提交，每次記錄大小），完成後把 `legacy-submit-input` 的壓縮上限降到實際值附近。
3. **介面文字 `parts/*.js`**：全部登記，`mergeLocale` 改成在載入後合併；`i18n-*.js` 預計從 85.6 KB 降到約 18 KB。
4. **守門測試**：任何新增、含五種語言鍵、且超過 8 KB 的文字模組，如果沒登記就讓測試失敗（避免之後又長回去）。

## 5. 風險與對策

| 風險 | 對策 |
|---|---|
| 某處在語言載入完成前就讀文字（變空字串或顯示鍵名） | 啟動順序固定在渲染前；試點階段加一個測試：載入前讀文字會丟明確錯誤，而不是悄悄回傳鍵名 |
| 切換語言途中畫面短暫缺字 | 先載入、後套用；載入失敗（離線且沒快取）時留在原語言並提示 |
| 登入頁、密碼重設頁（`password-recovery-page.js` 現在直接 `import i18n`） | 這兩頁只載入它們需要的語言；列入階段 3 的檢查清單 |
| 外掛誤切（物件形狀不符） | 外掛對每個登記模組檢查「五種語言都在、其他部分沒動」，不符就讓建置失敗，不是悄悄略過 |
| 兩個人同時改同一張表 | 編寫格式不變，沒有新的衝突點；階段 2 每張表改完通知 Sun |

## 6. 驗收

* `legacy-submit-input` 壓縮後 ≤ 120 KB（理想 110 KB），`i18n-*.js` ≤ 25 KB，`check:sizes` 通過並把上限降到新值。
* 五種語言、離線、手機寬度下，每個畫面的文字與現在完全一致（逐張表核對；用現有的 i18n 覆蓋測試加一個「建置後的語言包內容與原始檔逐鍵相同」的測試）。
* `npm test`、`npm run build`、`check:legacy-runtime`、`check:server`、`npm audit --omit=dev` 通過。

## 7. 需要 Allen 與 Sun 決定

1. **建置時切片、編寫格式不變**（本草案）可不可以？（替代方案：改編寫格式成每語言一檔，不建議，見上。）
2. **順序**：本草案先試點（階段 1），再做 runtime 文字表（階段 2，解決 155 KB 上限），最後做介面文字（階段 3，下載省最多）。也可以調換階段 2、3。
3. **Sun**：編寫方式不變；只有「新增一個超過 8 KB 的文字模組要登記到 `scripts/language-split-modules.json`」這一個新規則（沒登記測試會提醒）。這樣可以嗎？

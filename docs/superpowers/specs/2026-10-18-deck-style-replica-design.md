# 簡報風格復刻（deck-style-replica）設計

> **2026-10-20：這個官方技能已由 owner 決定移除**（技能條目、本文的腳本 `deckstyle.py`、說明文字與測試都已刪除）。官方技能「附檔案」的機制（`server/official-skill-files.js`、`src/app/runtime/skill/official-skill-files.js`、`local-skill-folders.js`）保留，測試改用假的樣本技能。以下是當時的設計紀錄。

Linear：NOU-53。後續的「指哪改哪」是 NOU-54。

## 0. owner 的決定（2026-10-18）

- 使用者上傳自己的簡報或範本（.pptx、.potx），模型照它的風格做新簡報、照指令修改，或直接修改上傳的那份。三個都在第一版。
- 官方技能可以附檔案（新機制，見 §3）：檔案跟著程式發布，伺服器與頁面都讀得到。
- 預設在伺服器沙盒執行；本機（瀏覽器 Python）也要能用。本機不裝 LibreOffice（瀏覽器版太大），檢查用網頁既有的 pptx 讀取與畫圖（Python 簡報的 AI 看圖檢查）。
- 名稱：`deck-style-replica`，中文「簡報風格復刻」。
- 12 區（官方技能內容）與 17 區（簡報）原屬 Sun，這項由 Allen 接手。

## 1. 防過擬合（只學風格，不學內容）

| 風險 | 作法 |
|---|---|
| 抄到舊內容 | `describe()` 預設不給舊文字；`build()` 先移除所有舊頁，只有 `keep` 列出的才保留 |
| 硬套版型 | 版型依內容挑；沒有合適的就用最接近的並說明，不硬塞 |
| 連缺點一起學 | 出現在多數頁（≥60%）或母片的才算規則；舊簡報的小字、低對比不重複並說一句；範本自己的規定照做 |
| 一次性的設計擴散 | 同上：只出現一次的是例外 |

兩種模式：「照範本」（.potx、版型多頁數少、或使用者說是範本）與「參考風格」（一般簡報）。技能自己判斷並說一行，使用者可以改。

## 2. 技能的檔案

`src/data/official-skills/deck-style-replica/`

- `SKILL.md`：給模型的說明（英文）。流程：讀風格、定模式 → 規劃 → `build()` → `check()` 修到沒問題 → 交付（說明學了什麼、沒學什麼、留下的空格）。修改：`shapes()` 找物件、`edit()` 依序操作；「一點點」是投影片的 1%，「再一點」重複。
- `scripts/deckstyle.py`：只用 python-pptx（加 lxml、Pillow），伺服器與瀏覽器 Python 都有。用 `import` 呼叫（瀏覽器沒有子行程）。
  - `open_deck`：.potx、.ppsx、含巨集的檔都當一般簡報讀，巨集丟掉。
  - `inspect`／`describe`：尺寸、主題配色與字型、母片與每個版型的欄位位置（百分比）、母片上的裝飾、多數頁重複的元素（logo 等，附來源頁）、多數標題或內文手動設定的樣式、頁尾頁碼、表格樣式、圖表、模式判斷。`include_text=True` 才附舊文字（修改那份簡報時用）。
  - `build`：在範本上建新頁，用範本的版型填內容（標題、副標、條列、兩欄、圖片、表格、原生圖表、備忘稿）；空的欄位刪掉（不留「按一下新增文字」）；重複元素與手動樣式帶到新頁；頁尾頁碼照多數舊頁；表格樣式沿用舊表格的。
  - `shapes`：每頁的物件（編號、名稱、種類、位置 cm 與 %、文字開頭），給修改找目標。
  - `edit`：依序執行的操作：改文字、移動（%、cm、mm、in、pt）、移到、縮放、改色（主題色名或 #RRGGBB，可對全部標題）、字級、換圖、刪物件、加頁、複製頁、移頁、刪頁、換版型、備忘稿。任一步失敗就整批不存並說明哪一步。
  - `check`：估計文字放不下、超出投影片、空欄位、圖片變形、小於 10 pt、不在主題（或來源自己用的）字型與顏色、內容頁沒標題。
- 刪頁與移頁後重新編號投影片檔名（python-pptx 依頁數命名新頁，不重編會撞名）。

## 3. 官方技能附檔案（新機制）

目前官方技能只有說明文字（`skill-catalog.js` + `skill-catalog-bodies.js`）。要做的：

- 目錄項加 `files`（路徑、大小、種類），內容放在 `src/data/official-skills/<name>/`。
- **伺服器**：`skills.files(userId, name)` 對官方技能從映像檔裡的這個資料夾讀（`Dockerfile` 已經複製 `src`），掛載到沙盒 `/skills/<name>/`，和使用者上傳的技能同一條路。
- **頁面（本機）**：建置時把資料夾打包成靜態檔；本機 Python 回覆載入這個技能時，把檔案寫進瀏覽器 Python 的 `/skills/<name>/`（新的沙盒訊息，`run.noureon.com` 寫入唯讀資料夾）。`read_skill_file` 也能讀官方技能的檔案。
- 擴充頁：技能卡片顯示「腳本」標記與「需要 Python」，詳細資料列出檔案（沿用使用者技能的畫面）。
- 臨時對話：使用者上傳的含腳本技能不放行（照原本的決定）；官方的放行（程式是我們自己的，臨時對話在瀏覽器的 Python 裡跑）。

## 4. 本機的檢查

本機沒有 LibreOffice。`check()` 的估計在兩邊都有；交付後，伺服器與本機都會跑既有的「Python 簡報 AI 看圖檢查」（`src/app/ui/files/vision/vision-free.js`），用網頁自己的 pptx 讀取與畫圖。

## 5. 測試

- Python：用 python-pptx 做一份「公司簡報」樣本（logo、手動紅色標題、舊內容）與 .potx 版本，跑 describe／build／edit／shapes／check。這個環境的 LibreOffice 打不開 .pptx，所以用伺服器的畫圖程式（`server/slides/free-deck.js`、`render.js`）轉成圖片看。2026-10-18 已手動跑過：風格（紅色標題、logo）有帶到新頁，舊內容沒有出現；修好三個問題（圖片欄位先讀位置、刪移頁後重編檔名、換版型時主文字放進主要的大框）。
- 預覽畫圖觀察到：python-pptx 預設範本的「Two Content」右欄畫得比左欄低，但兩欄在檔案裡位置相同，是預覽的問題，另外查。
- 之後加進 `npm test`：Node 測試在有 python3 與 python-pptx 時執行腳本（沒有就跳過），以及目錄、檔案清單、說明長度（≤ 300 字）與掛載的測試。

## 6. 分期

| 階段 | 內容 |
|---|---|
| A | 說明書與腳本（本文件 §2），owner 看過 |
| B | 官方技能附檔案：目錄、伺服器掛載、`read_skill_file`、擴充頁顯示、五語言 |
| C | 本機：檔案打包、寫進瀏覽器 Python 的 `/skills` |
| D | 測試、隱私政策與協助中心（如有需要）、全套檢查、推 staging |

## 7. 實作紀錄（2026-10-18）

- **A**：`src/data/official-skills/deck-style-replica/scripts/deckstyle.py`。說明文字放在 `skill-catalog-bodies.js`（唯一來源，資料夾裡不放 SKILL.md），五語標題說明在 `skill-catalog.js`，五語指南在 `skill-catalog-guides.js`，圖示是 Lucide `palette`。首頁與協助中心的官方技能數改成 12。
- **B**：目錄項的 `files`（路徑、大小、種類；測試核對資料夾與大小）。伺服器 `server/official-skill-files.js` 只讀目錄列出的檔案，`server/skills.js` 對官方技能回傳檔案清單、檔案內容（掛載 `/skills`）與 `read_skill_file`，不需要使用者的 zip。頁面 `src/app/runtime/skill/official-skill-files.js` 用建置時的 `import.meta.glob`（`?raw`，忽略 `__pycache__`），腳本是自己的檔案、需要時才載入；擴充頁看檔與 `read_skill_file` 都用它。
- **C**：`src/app/runtime/skill/local-skill-folders.js`：本機 Python 回覆時，`/` 指定的與模型載入的含腳本技能，用 Python 本身把檔案寫進瀏覽器 Python 的 `/skills/<name>/`（唯讀），並先 import 腳本用到的套件（瀏覽器 Python 只依程式碼裡的 import 載入套件）。沙盒頁不用改（`run.noureon.com` 的改動要上線才生效，所以避開）。沙盒重新建立後要等下一次掛載。給模型的檔案說明改成「需要 Python（進階模式）」，不再說只有伺服器。
- **D**：`tests/official-skill-files.test.js`、`tests/local-skill-folders.test.js`、`tests/deck-style-replica-script.test.js`（有 python3 與 python-pptx 才跑，`tests/python/deckstyle_check.py`）。
- **沒驗證到的**：這個環境連不到 Pyodide 的 CDN，瀏覽器 Python 裡實際執行要在測試站確認（Pyodide 有同版的 python-pptx 1.0.2 與 lxml）。

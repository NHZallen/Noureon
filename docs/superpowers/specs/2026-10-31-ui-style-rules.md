# 畫面樣式規範（新功能照這份做，不要每個功能一個樣）

2026-10-31，Allen 在專案頁試用後要求：新增功能時樣式要一致。這份先從專案頁（`src/styles/projects.css`）整理出來，之後新的頁面與面板照做；舊的頁面慢慢靠攏，不必一次改。`tests/ui-style-rules.test.js` 會檢查登記在裡面的樣式檔（現在只有 `projects.css`，新頁面做好就加進去）。

## 字

- **只用兩種粗細：400（一般）與 500（標題）。不用粗體。** 全站 `typography.css` 用 `!important` 把 `h1`–`h6`、`strong`、`b`、`.font-bold`、`.font-semibold` 強制成 600，`label` 強制成 500；所以介面的標題用 `div` 加 `role="heading"` 與 `aria-level`，欄位名稱不用 `label` 元素包文字（要綁輸入框用 `for` 的空 `label` 或 `aria-label`）。
- 字級三階：內文 `0.9375rem`、小字（次要說明、時間、數量）`0.8125rem`、頁面與面板標題 `1.0625rem`。不再自己發明新字級；側邊欄的項目是 `0.875rem`，那是側邊欄自己的。
- 顏色只用 `src/styles/tokens.css` 的名稱（`var(--text-primary)`、`var(--text-secondary)`…），不寫十六進位、`rgb()`、`hsl()`。專案自己的顏色是使用者選的，用 `--pj-color` 傳進來。

## 圖示

- 線條圖示 24×24、`stroke="currentColor"`、線寬 2。
- **全站有一條 `body svg { color: var(--text-primary) }`，會把所有 svg 塗成文字色。** 要讓圖示吃所在位置的顏色（例如使用者選的顏色），在頁面的樣式裡加 `.頁面 svg { color: inherit }`。
- 圖示放在方塊裡時，方塊的底色用 `color-mix(in srgb, var(--pj-color) 16%, var(--chat-bg))`。

## 版面

- **頁面與面板都是整頁**（`position: fixed; inset: 0`，像設定頁），不做「快全滿」的底部面板、也不做半透明遮罩。內容放在置中的欄裡（最寬 `40rem`），兩邊至少 `1rem`。需要碰到螢幕邊緣的東西（顏色那一排）離開欄，自己滑到最邊。
- 只有「一個問題要回答」的確認（刪除、重新命名）用置中的小對話框加 `var(--scrim)`。
- 頂列：左返回（`2.25rem` 的圖示按鈕）、中間標題、右動作（圖示按鈕或一顆小膠囊「完成」）。**設定頁以外的頁面，按鈕不加圓形外框**（只有滑過時的淡底，圓角 `0.6rem`）。
- 左右安全距離只有一個：`var(--page-gutter)`（手機 `1rem`、電腦 `1.5rem`，跟一般對話一樣），整頁內容與輸入欄都用它，不要每個功能自己定；頂列按鈕的點擊範圍往外多 `0.5rem`，所以頂列左右是 `calc(var(--page-gutter) - 0.5rem)`。
- 專案頁底部的輸入欄就是一般對話的輸入欄（`#input-bar-container` 搬過來），不另外設高度或左右距離。
- 列表的一列要小：圖示方塊 `2.25rem`，一行名稱加一行小字；每一列右邊有 `⋯`，點了開功能選單（手機也看得到，不靠長按或滑過）。

## 選單與按鈕

- 選單：`var(--modal-bg)` 底、`var(--border-color)` 框、圓角 `0.9rem`；每項一個圖示加一個字；刪除用 `var(--state-danger)`；放在最後。
- 主要按鈕是黑白（`--gpt-primary-action-bg` / `--gpt-primary-action-text`），**不是** `--button-primary-bg`（那是藍色強調色）；次要按鈕是框線；取消是純文字。
- 全站按鈕、輸入框的字體用 `!important` 設成一般粗細；元件裡的重設要用 `:where()`，讓元件自己的 class 贏。

## 其他

- 全站有一些 `!important` 會吃掉元件的樣式（`box-shadow: none`、按鈕的 `color`）。元件上的外框、選取環用偽元素或 `outline`，不靠按鈕的 `box-shadow`。
- 用瀏覽器真的看過：用真正的 `src/styles/main.css` 加自己的樣式，淺色與深色各看一次（Playwright 截圖），不要只靠測試。
- 五語文字、`tokens.css` 顏色名稱、共用模組不碰 `window` 等規則照 `AGENTS.md`。

## 之後補的（2026-10-31）

- **「新增」按鈕後的選項清單**（例如新增資料來源的拍照、新增照片、新增檔案、新增文字）：手機從底部升起的面板（`openActionSheet`），標題加分隔線，每列一個圖示加一個字；寬螢幕置中。這是 Allen 給的畫面。「新增文字」的圖示是 T。
- 檔案的列用副檔名當標籤（PDF、DOCX…），圖片用圖片圖示，文字用 T。
- **彩色圖示**（Allen 2026-10-31）：品牌與檔案種類用它們自己的顏色（Google 雲端硬碟的彩色標誌；PDF 紅、Word 藍、Excel 綠、PowerPoint 橘、Google 簡報黃、圖片紫）。顏色寫在 JS 裡（`project-parts.js` 的 `TONES`，以 `--pj-tone` 傳給方塊），樣式檔不寫顏色；彩色標誌的 svg 用自己的 `fill`。其他圖示仍然是單色 `currentColor`。

## 篩選膠囊與「＋」（2026-11-04，記憶頁分類列）

- 膠囊高 `2rem`、字 `0.8125rem`、間距 `0.5rem`；選中的是黑白（`--gpt-primary-action-bg` / `--gpt-primary-action-text`），不是藍色強調色。
- 一排會左右滑的膠囊，右邊留 `1.75rem` 的空位並用 `mask-image` 淡出；「＋」是一顆 `2rem` 圓形圖示按鈕，放在滑動列**外面**固定在右邊，不要放成列裡最後一個膠囊。
- 選中項目要有自己的選單（⋯）時，放在選中的膠囊裡面（一顆膠囊兩個按鈕），不要在列外另留位置，避免選取時列的寬度改變而抖動。重畫時要還原列的橫向捲動位置。
- 設定視窗裡 `#settings-modal :not(.toggle-label)` 用 `!important` 把所有文字色蓋成 `--gpt-control-text`，元件的文字色要加 `!important`（選擇器要比它具體）才會生效。
- 設定視窗還有一條帶 id 的規則（`#settings-modal button:not(#submit-btn) svg`）把所有圖示塗成固定色，連 `path`、`circle` 的描邊也被 `:not(.toggle-label)` 那條塗掉；放在黑底（或深色模式的淺底）上的圖示與文字，選擇器要用 `#settings-modal #元件id …` 加 `svg`、`svg *`、`span` 一起設成 `inherit !important`，並且淺色、深色模式各看一次截圖。
- 選中的膠囊要避開列右邊淡出的那一段（捲動時把它捲進來），否則它的 ⋯ 會被淡掉。


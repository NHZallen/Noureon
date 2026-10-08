# 深色模式回歸：設計與進度

**日期：** 2026-10-08
**狀態：** 已隨 17.14.0 上線（2026-10-08）。第 2～7 步完成（§5 至 §5e）；剩下見 §6。

## 1. 為什麼要重做、當初為什麼拿掉

owner 想讓深色模式回來。當初拿掉的原因（owner 回報）：**太醜，而且很多地方的顏色（尤其是字色）沒有統一，很亂。**
所以這次的重點不是「多一組深色」，而是**先訂一套固定的顏色規則，之後所有畫面只准用這套**。

## 2. owner 的決定（2026-10-08）

1. 切換方式：**淺色／深色／跟隨系統**三選一，**預設淺色**（不要讓現有使用者一覺醒來變黑）。
2. 深色風格：**A 深灰**（參考 ChatGPT 的深色：頁面 `#212121`、側欄 `#171717`、輸入框 `#2f2f2f`）。沒有選純黑。
3. 色版定下後，慢慢把全部頁面做完。
4. 預設維持白底的東西：Word／PDF／簡報預覽（像紙張）、生成的圖片。
5. 淺色版也一起照同一套規則收斂（淺色的提示字與強調色原本對比偏低）。

## 3. 顏色規則（`src/styles/tokens.css` 是唯一來源）

- **字三種**：`--text-primary`（內文）、`--text-secondary`（標籤、說明）、`--text-tertiary`（提示字、停用）。
- **背景三層**：`--chat-bg`（頁面）、`--modal-bg`（卡片、彈窗、選單）、`--input-field-bg` ／ `--input-bar-bg`（輸入）；另有 `--sidebar-bg`、`--hover-bg`、`--active-bg`。
- **一條邊線色** `--border-color`、**一個強調色** `--button-primary-bg`（使用者可在設定選別的顏色）、**三個狀態色** `--state-success` ／ `--state-danger` ／ `--state-warning`、連結 `--link-color`。
- **黑白主按鈕**：`--gpt-primary-action-bg` ／ `-text`（淺色是黑底白字，深色反過來是白底黑字）。
- 程式碼區塊 `--code-block-*`、開關關閉的底色 `--switch-off-bg`。
- **新的樣式只能用這些名字，不得自己寫色碼。** 深色版只改這個檔案裡的值。
- 對比度（字色在背景上）：深色 A 的主要文字 13.6、次要 6.8、淡色 3.2、強調色 5.8；都比原本的淺色（次要 4.8、淡色 2.5、強調色 3.2）好讀。

## 4. 結構

| 檔案 | 作用 |
|---|---|
| `src/styles/tokens.css` | 顏色名字的淺色與深色值（`:root` 與 `:root[data-theme="dark"]`），也是 `color-scheme` |
| `src/styles/dark-bridge.css` | 還在用 Tailwind 顏色類別（`bg-white`、`text-gray-500`…）的標記，在深色下改成對應的名字；只有這個檔案與 tokens.css 可以寫 `[data-theme]` |
| `public/theme-init.js` | 在第一次繪製前設定 `data-theme`（讀 localStorage 的複本），避免深色頁面先閃一下白 |
| `src/app/runtime/features/color-scheme.js` | 把設定 `colorScheme` 變成 `data-theme`、更新瀏覽器列顏色、記在 localStorage、「跟隨系統」時追著裝置變 |
| `src/data/color-scheme-choices.js` | 三個選項與讀取的純資料（伺服器也會讀設定，所以獨立成純資料） |
| 設定 → 個人化 → 外觀 →「外觀」（原名「色彩模式」，owner 改名） | 選擇；立即套用，與設定一起雲端同步（設定鍵 `colorScheme`） |

原本散在各檔案、數值還不一致的變數（`layout.css`、`chat.css` 各一份 `:root`，`settings.css` 兩份，其中 `--gpt-primary-action-bg` 一處 `#111827`、一處 `#000000`）全部併進 `tokens.css`。

## 5. 已完成（第 2 步）

- 基礎：token、切換、設定、避免閃白、tests。
- 把樣式檔裡約 300 處寫死的淺色改成名字（用一次性的腳本依屬性轉換：字色、背景、邊線、狀態色、白色半透明的毛玻璃），其餘手動修（側欄邊線、檔案選單、搜尋遮罩、開關底色…）。
- 使用者訊息泡泡色現在有淺色與深色兩版（`USER_BUBBLE_COLORS` 的 `dark`），泡泡的選擇不依賴當下的主題。
- 在真實瀏覽器逐頁檢查過深色：主畫面、側欄、對話（程式碼、表格、引用）、深度研究卡與閱讀畫面、設定全部分頁、命令工具商城、Nouras 商店、搜尋；手機版主畫面、閱讀、設定、商城。淺色與改動前逐像素比對，只有極少數像素差（統一 `#000` → `#111827` 之類）。
- 測試中釘死色碼的幾支（`quote-inquiry`、設定、搜尋的 CSS 回歸測試）改成接受名字；原本「CSS 不得出現 `[data-theme]`」的守門改成「只有 tokens.css 與 dark-bridge.css 可以」。

## 5b. 第 3 步（2026-10-08，同一天）

- 逐個彈窗與浮層在深色下截圖檢查（匯出入、搜尋、重新命名、資料夾、封存、Noura 建立與提案、更新說明、P2P 分享…共 25 個），全部正常。
- 做了一個自動的**文字對比度稽核**（在每個畫面裡找出文字與背景對比低於 3 的地方）：深色與淺色共 19 個畫面＋25 個彈窗，修好後都是 0 處。稽核抓到並修好：更新說明的「我知道了」按鈕（深色下是淺字配淺藍）、綠色確認按鈕。
- 圖表：報告圖表的字色、提示框改用名字；個人數據面板的 Chart.js 圖（模型使用比例、訊息時間分佈）在建立時讀取當下主題的文字色與格線色，派餅的間隔線用頁面色。
- 檔案預覽對話框：外殼跟主題，裡面的頁面（Word、PDF、簡報、表格、網頁）維持白紙黑字。
- 登入頁、頁面底色、Tailwind 的淡色類別（indigo、red、green 的 100 等）補進橋接。
- 公開頁（`/terms`、`/privacy`、`/updates`）原本就有自己的深色（跟隨裝置）；現在也讀應用程式裡的選擇：選淺色就是淺色，選深色就是深色，沒選過才跟裝置。
- 加了**防止再亂的自動檢查**（`tests/color-literals.test.js`）；一開始是「每個樣式檔寫死的色碼只能減少」（原本約 534 處、當時剩 230 處），第 4 步清到 0 後改成「樣式檔一個色碼都不准寫」。
- 樣式檔裡 114 處 `var(--x, var(--x))` 這種轉換時產生的自我引用清掉了。
- CSS 大小上限 220 → 230 KB（顏色名字與深色橋接約 5 KB；目前 223 KB）。

## 5c. 第 4 步（2026-10-08）：樣式檔的寫死色碼清到 0

- 剩下的 230 處（215 行）全部換成名字，`tests/color-literals.test.js` 改成絕對規則：除了 `tokens.css`、`dark-bridge.css`、設計稿挑色器與生成圖編輯器（本來就是講顏色的）以外，樣式檔不能出現 `#xxxxxx` 或 `rgb()`/`rgba()`；`var(--x, #fff)` 的備用值與註解不算。基準檔 `color-literals-baseline.json` 刪除。
- `tokens.css` 新增的名字（淺色、深色各一個值，除非註明兩邊相同）：
  - **陰影七階** `--shadow-xs/sm/md/lg/xl`（卡片→浮層→對話框）、`--shadow-up`（底部面板）、`--shadow-side`（側欄）、`--shadow-composer`（輸入框）；深色是更濃的純黑陰影。
  - **遮罩** `--scrim-soft`、`--scrim`、`--scrim-strong`（燈箱）。
  - **品牌藍** `--brand-blue`／`-hover`（送出鈕、開關打開、被選中的框；深色提亮）。
  - **圖表** `--chart-up/-down`（深色提亮）與瀑布圖的 `--chart-up-soft/-down-soft`；提示框、格線、描邊改用 `color-mix()` 跟著文字色與卡片色走。
  - **閃一下的底色** `--flash-bg`、**釘選星星** `--pin-color`。
  - **兩個主題相同**：`--on-color`（照片、影片、遮罩上的白字白圖示）、`--media-*`（影片底、燈箱黑、半透明控制鈕）、`--paper-*`（Word／PDF／簡報的紙張）、`--btn-*-shadow`（立體大按鈕）、`--thumb-shadow`（滑桿把手）、`--file-*`（各檔案類型的標誌色）。
- 其他都改用既有的名字：邊線 `--border-color`、灰字 `--text-secondary/-tertiary`、危險 `--state-danger`、成功 `--state-success`、警告 `--state-warning`、連結 `--link-color`、黑白按鈕外框 `--gpt-control-border`。
- 副作用（淺色）：陰影從二十幾種各自不同的數值收斂成七階，所以有幾處陰影的濃淡與範圍有一點點差別；警告色的小圓點（議會「略過」、模型點、使用者設定的警告狀態）從亮橘 `#d97706`／`#f59e0b` 變成警告色 `#b45309`（偏棕）。逐像素比對主畫面：與上一版只有約 100 個像素差超過 8。

## 5d. 第 5 步（2026-10-08）：JS 裡寫死的顏色

- 約 290 處不是都該消失：檔案預覽與產生的檔案（`src/app/ui/files/`、`src/app/ui/sandbox/`）是紙張，顏色是文件的設計；使用者自己選的顏色（資料夾、泡泡、強調色）、圖表的色系、程式碼主題、QR code、生成圖編輯器的筆色，顏色本身就是資料。
- 真正屬於介面的幾處改成名字：資料夾設定的選中框改用 `var(--brand-blue)`、分隔線改用 `var(--border-color)`、影片播放與移除、關閉按鈕的 SVG 改用 `currentColor`（顏色由 CSS 的 `--on-color` 決定）、語音波形的備用色改 `currentColor`、Chart.js 預設色在沒有主題時不再自己指定。
- `tests/js-color-literals.test.js`：除了上面那份**有理由的豁免清單**（每一項寫了原因，豁免的檔案如果已經沒有顏色，測試會要求從清單移除），腳本不准寫 `#xxxxxx` 或 `rgb()`/`rgba()`。

## 5e. 第 6 步（2026-10-08）：有資料才看得到的畫面、手機浮層、瀏覽器列

- 方法：登入後填一組假的 API 金鑰、真的送出四則訊息（網路被擋，回覆是「請求失敗」，但對話會建立），得到真實的歷史清單；引用標記與來源面板用程式直接畫（`applyCitationPills`、`openSourceSheet`）。
- 逐一在深色截圖並跑文字對比度稽核：歷史清單（含選中、滑過）、對話選單（重新命名、釘選、移至資料夾、封存、刪除）、`@` 選單、行內引用藥丸、來源面板（桌面）、個人數據面板（有資料的圓餅圖與長條圖，格線與文字色跟著主題）、請求失敗卡片；手機的側欄、對話選單、`@` 選單、「＋」選單、來源底部面板。全部 0 處問題。
- 抓到並修好：「＋」選單、輸入欄模式標記、已送出訊息上的模式標記用的是黑色線稿 PNG（`/assets/composer-tools/*.png`），深色下幾乎看不見。新名字 `--tool-icon-filter`（淺色 `none`，深色 `invert(1) hue-rotate(180deg)`），套用在所有 `img[src^="/assets/composer-tools/"]`（只動這幾張 PNG，不動命令工具的圖示與廠商標誌）。
- 瀏覽器列：`public/theme-init.js` 在第一次繪製前，深色時就把 `<meta name="theme-color">` 插到最前面（`#212121`），安裝成 App 時狀態列從第一幀就是深色；之後仍由 `color-scheme.js` 更新。
- 啟動畫面：`manifest.json` 只有一組顏色，但瀏覽器是在安裝（與之後檢查更新）時讀頁面連結的那份。所以新增 `public/manifest-dark.json`（只有 `background_color`、`theme_color` 是 `#212121`，其餘相同），`theme-init.js` 在深色時把它插成第一個 `<link rel="manifest">`（第一個生效）。在深色下安裝的人得到深色啟動畫面與狀態列。限制：之後才切換淺色／深色，已安裝的 App 要等瀏覽器下一次檢查更新才會換。
- iPhone／iPad 的主畫面 App 不看 manifest 的底色，要用 `apple-touch-startup-image`，而且 iOS 依螢幕的確切尺寸挑圖。`scripts/generate-ios-splash.mjs` 產生 `public/splash/` 的 60 張圖（12 種 iPhone 直向、9 種 iPad 直向與橫向，每種淺色 `#ffffff`、深色 `#212121`，中間是 logo，大小與載入中畫面的 logo 一樣）與 `index.html` 兩個標記之間的 `<link>`（媒體查詢含 `prefers-color-scheme`）；`tests/ios-splash.test.js` 檢查檔案尺寸、`index.html` 與腳本輸出一致。另加 `apple-mobile-web-app-capable`。限制：iOS 的深淺是跟**裝置**的外觀，不是 App 內設定的選擇；新機型（新的螢幕尺寸）要把尺寸加進腳本重新產生，沒對到的機型會顯示白底。**沒有在真的 iPhone 上試過**（這個環境沒有），尺寸表依 Apple 的螢幕規格。
- 載入中畫面（`index.html` 內嵌的 `[data-startup-skeleton]`，頁面開啟後到程式載入完成之間）原本是寫死的白底，深色使用者每次開頁都會先閃一下白；改成深色時用 `#212121`。
- 淺色的淡字：訊息時間（`text-gray-400` on 白底）對比只有 2.5。照 owner 第 2 條決定（淺色也收斂、提示字對比偏低），`--text-tertiary` 淺色 `#9ca3af` → `#838a96`（白底 3.5、側欄底 3.25），並讓 Tailwind 的 `.text-gray-400` 在淺色也走這個名字（`dark-bridge.css` 最上面一行）。
- `@` 選單裡有已加入的工具、輸入框裡的工具晶片（`OfficeCLI`）也在深色看過：選單與晶片正常。這一輪抓到自己的一個錯：圖示反白一開始套得太寬，把晶片的終端機圖示（SVG，本來就跟字同色）也反成黑色，已改成只動那幾張 PNG。

## 5f. 上線後 owner 回報的三個問題（2026-10-08，17.14.0 之後）

- **手機設定頁整頁是透明的**（透出後面的側欄）：轉換顏色時把設定頁底色 `#f3f4f6` 換成了 `--hover-bg`，而 `--hover-bg` 在深色是半透明白（只是「比底色亮一點」的罩層），整頁用它當底就透了。新名字 `--surface-muted`（不透明；淺色 `#f3f4f6`、深色 `#212121`）專門給「一整頁卡片的底」。規則：半透明的 `--hover-bg`、`--active-bg` 只能疊在已知底色上，不能當頁面底。用腳本掃過所有手機畫面的整頁大元素，沒有其他半透明底（遮罩除外）。
- **左側欄上下緣的淡出遮罩有色差**：側欄是 `--sidebar-bg` 55% 疊在頁面上的薄紗，淡出條卻用 `--chat-bg`，淺色看不出，深色多出一條亮帶、清單文字從縫裡露出來。新名字 `--sidebar-veil`（= 那層薄紗疊在頁面上的實際顏色），淡出條改用它。
- **檔案預覽（簡報）**：頁面的底（`--active-bg`，深色是半透明白，很灰很亮）改成 `--page-well`（淺色 `#e5e7eb`，深色 `#1c1c1c`，比對話框更深）；頁碼原本用紙張專用的深灰 `#4b5563`，深色底上看不到，改成跟文字色走（`--text-primary` 70%）；深色的投影看不到，簡報邊緣加一圈 `--paper-ring`（深色半透明白細線，淺色透明）。
- **設定名稱**：「色彩模式」改名「外觀」（五種語言：外觀、Appearance、Apparence、Оформление、Apariencia），更新說明同步改。

## 5g. 強調色變成唯一的顏色（2026-10-08，17.15.0）

owner 的決定：「主按鈕顏色」改名「強調色」，換成新的十種顏色（藍色〔預設，就是原本的藍，只留一個藍〕、青色、綠色、萊姆綠、黃色、橘色、粉色、洋紅色、紫色、黑色，加上自訂色碼），**刪除「使用者訊息泡泡底色」設定，泡泡跟著強調色**。

- 整個介面只有一個強調色 `--button-primary-bg`：送出鈕、開關打開、被選中的框（原本寫死的 `--brand-blue`，已刪）、泡泡底色都用它。`--user-bubble-bg` 是強調色疊在頁面上的淡色調（淺色 12%、深色 22%）；`--button-primary-hover-bg` 也由強調色算出（淺色加黑、深色加白），所以換強調色時按下的顏色跟著變。預設藍在淺色是 `#3b82f6`、深色是 `#5b9bff`（`theme-appearance-lifecycle.js`）。
- 深色主題下，看不清楚的強調色自動調亮：`src/utils/color-contrast.js` 的 `accentForDarkTheme`（亮度太低的黑色變 `#ececec`，其他不足對比 3 的顏色往白色調亮到對比 3）。淺色不變。
- 顏色取自 owner 給的圖；選單的第一個是預設藍，標成「藍色」。原本存的具名顏色（綠、黃、粉、橘、紫）色碼變了，選過的人會顯示成「自訂」同一個色碼，不需遷移。
- 刪掉的東西：設定畫面那一列與 `userBubbleColorDropdown`、`USER_BUBBLE_COLORS`、`setUserBubbleColor`、`renderUserBubbleColorDropdown`、`applyBubbleColors`、設定欄位 `userBubbleColor`（讀取時 `config-normalization.js` 丟掉；雲端同步與匯出入的清單也拿掉）、`--user-bubble-choice-*`。`settings-theme-bubble-controls.js` 只剩 `setTheme`（清掉舊版的 theme 欄位）與 `updateThemeButtons`。
- 名稱：`primaryButtonColor` → `accentColor`，新增 `colorBlue`、`colorCyan`、`colorLime`、`colorMagenta`、`colorBlack`，刪 `colorDefault`、`userBubbleColor`（五種語言）。

## 5h. 17.15.1：P2P 代碼欄位、側欄漸隱、深色提示字（2026-10-08）

- **P2P 接收代碼欄位在 iPhone 上破損**（資料夾與 Nouras 的接收是同一個欄位 `#p2p-code-input`）：它是整個 App 唯一沒有自己樣式的欄位（只有 Tailwind 的 `border`），iOS 於是在邊框上畫系統自己的內陰影與不貼合圓角的焦點框。`settings.css` 給它 `appearance: none`、與其他欄位一致的底色／邊框／16px 字／聚焦時的邊框，並讓「連線」鈕同高。
- **側欄上緣漸隱還是不順**（owner 螢幕錄影）：1rem 的直線漸層讓搜尋列下方第一行文字被攔腰切開、像殘影。左側欄與右側面板的上下緣淡出改成 2.5rem（`--menu-fade`）、分段變淡的漸層。色差問題（5f）在錄影裡已沒有（實測整欄同色）。
- **深色的次要與提示文字再調亮**：`--text-secondary` `#a8a8a8` → `#b0b0b0`、`--text-tertiary` `#6f6f6f` → `#8c8c8c`（在對話框底 `#2a2a2a` 上對比由 2.9 提高到 4.3）。

## 5i. 17.15.2：側欄的縫，真正的原因（2026-10-08）

- owner 在 17.15.1 上線後截圖：清單仍在搜尋列下方被切出硬邊，而且切口處的文字幾乎沒有變淡——代表那條淡出條在 iPhone 上**根本沒有蓋在文字上**。原因：左側欄的淡出條是搜尋列／帳號列的 `::after`／`::before`，蓋在捲動清單**外面**；iPhone 會把可捲動的清單畫在這種外部條的上面。對話區的淡出一直正常，因為它是清單**裡面**的 sticky 條（`chat-edge-fade.css`）。
- 改法：左側欄也改用清單裡的 sticky 條（`#sidebar > .scroll-area::before`／`::after`，`edge-fades.css`）。清單上下各留 1rem 的內距，淡出條 1.5rem：靜止時蓋在這段內距與第一（最後）列自己的空白上，不蓋到字；捲動時停在邊緣讓文字從下面經過。搜尋列的下內距（`sidebar.css`）讓給這段內距，所以靜止時的間距幾乎不變。
- 左側欄改為不透明（底色 `--sidebar-veil`，就是原本半透明時在頁面上看起來的顏色），拿掉 `backdrop-filter`：手機上側欄蓋在對話上，半透明會透出輸入框等較亮的東西，淡出條的顏色永遠對不上。
- 右側面板的淡出還是外部條（沒有人回報；如果手機上也出現同樣的縫，用同一招改）。

## 5j. 17.15.3：sticky 的位置算錯（2026-10-08）

- 17.15.2 上線後 owner 截圖：搜尋列下方那行字上半清楚、下半變淡——淡出條停在邊緣下方一段距離。原因：**sticky 的 `top` 是從捲動容器的內距（padding）裡面算起**，`top: 0` 讓淡出條停在邊緣下方 1rem（16px）處，這 16px 的文字完全沒被蓋住。對話區的淡出一直用 `top: -內距` 就是這個原因。17.15.2 時我只用眼睛看截圖，沒有量，所以沒發現（在 Chromium 裡也是同樣的錯）。
- 改法：`top: calc(var(--menu-list-pad) * -1)`、`bottom: calc(var(--menu-list-pad) * -1)`。
- 驗證方式（以後改淡出都照做）：在清單裡放純紅色的列，捲動後逐像素讀邊緣處的紅色量。修正前：邊緣起 16px 全紅（沒蓋到）才開始淡出；修正後：邊緣處幾乎 0，24px 內逐步到全紅，上下兩端都一樣。`tests/sidebar-edge-fade.test.js` 鎖住 sticky 的位移與內距的關係，並確認沒有從外面蓋上去的淡出條。

## 6. 還沒做（下一步）

1. （已做，見 §5e）沒有資料就看不到的畫面。
2. （已做，見 §5d）JS 裡寫死的顏色。
3. （已做，見 §5e）手機各浮層、PWA 外殼顏色。
4. owner 實機使用後回報的問題。

## 7. 驗收方式

每一階段：`npm test`、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime`、`npm run check:server`、`npm audit --omit=dev`；在 Chromium 以淺色與深色逐頁截圖（腳本在作業用的 scratchpad，不進 repo）；淺色與基準逐像素比對；給 owner 看畫面，同意才推 `main`。

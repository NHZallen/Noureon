# 鍵盤快捷鍵（設定頁「鍵盤快捷鍵」）

2026-11-05，Allen 要求：設定頁多一個「鍵盤快捷鍵」頁面，列出所有快捷鍵，**限電腦版**，可以**開關**也能**自訂按鍵**，**要分類**，並且**跨裝置同步**。樣式參考 Allen 給的圖：頁面標題與說明、分組小標題、每列左邊開關、中間名稱、右邊按鍵組合（沒有按鍵顯示「無」）；點按鍵組合後變成輸入框「請按下按鍵組合」，按下新的按鍵就改好。

## 1. 結構

所有程式在 `src/app/ui/shortcuts/`，一個清單、一個監聽器，設定頁只是它的畫面：

| 檔案 | 做什麼 |
| --- | --- |
| `shortcut-combo.js` | 按鍵組合的字串格式與判斷（純函式）。`Mod+Shift+S`：`Mod` 在 Windows/Linux 是 Ctrl、Mac 是 ⌘；只用 `Mod`、`Alt`、`Shift`；按鍵用 `event.code`（鍵盤位置）命名，所以 Mac 的 Alt、別種鍵盤配置都讀得一樣。`validateCombo` 擋掉：單獨的按鍵（會打進輸入框，只有 Shift+Esc 與 F 鍵例外）、瀏覽器保留的（Ctrl+T/N/W…、Ctrl+1–9）、編輯文字用的（Ctrl+C/V/X/Z…）、Enter／Esc 單獨按。 |
| `shortcut-registry.js` | 所有快捷鍵的清單（id、群組、文字鍵、預設按鍵、`modal`：是否能在對話框開著時用），與固定不能改的三個按鍵（Enter 傳送、Shift+Enter 換行、Esc）。加一個快捷鍵＝這裡加一行、`parts/shortcuts.js` 加五語文字、有人登記動作。 |
| `shortcut-config.js` | 設定 `keyboardShortcuts` 的檢查：只留已知的快捷鍵、格式對的按鍵、與預設不同的部分。 |
| `shortcut-store.js` | 選擇的讀寫。**每次都從設定讀**（所以另一台裝置同步來的更動立刻生效），寫的時候放進設定並存檔。 |
| `shortcut-actions.js` | 動作登記處：能做事的模組（rail.js、語音輸入、`shortcut-page-actions.js`）各自 `registerShortcutAction(id, fn)`；`fn` 回傳 `false` 表示沒做成，按鍵留給頁面。 |
| `shortcut-dispatcher.js` | **唯一**的 keydown 監聽（capture 階段）：組合對上、開著、有動作就執行並 `preventDefault`。IME 輸入中、按住不放、正在選按鍵時不動；`modal: false` 的快捷鍵在對話框開著時不動（設定頁與擴充頁不算對話框：會先回到對話再做）。 |
| `shortcut-page-actions.js` | 作用在頁面的動作：按頁面已有的按鈕（新對話、搜尋、附加檔案、擴充、設定…），先收起設定／擴充頁。 |
| `shortcut-hints.js` | 提示文字用：按鈕 title、選單提示顯示「使用者實際設的按鍵」；關掉或無按鍵就不顯示。 |
| `shortcut-settings.js`、`styles/shortcuts.css` | 設定頁分頁（加在「輔助功能」後面）。 |
| `start-shortcuts.js`、`ui/desktop/start-desktop.js` | 啟動；`shell.js` 只有一行啟動 `start-desktop.js`，它再各自載入導覽列與快捷鍵（一個失敗不影響另一個）。 |

原本寫死的三個快捷鍵改走這套：導覽列的 `Ctrl+Shift+S`（側欄常駐／感應）與 `Ctrl+,`（設定）在 `rail.js` 登記動作；語音輸入的 `Ctrl+Shift+D` 在 `batch-import-voice-lifecycle.js` 登記動作（麥克風提示的按鍵也改成實際按鍵）。

## 2. 清單（預設按鍵）

- **輸入框**：聚焦輸入框 `Shift+Esc`、語音輸入（開始／完成）`Ctrl+Shift+D`（原有）、附加檔案 `Ctrl+Shift+U`
- **對話**：新對話 `Ctrl+Shift+O`、搜尋對話 `Ctrl+K`
- **導覽**：回到對話 `Ctrl+Shift+H`、開啟擴充 `Ctrl+Shift+E`、開啟設定 `Ctrl+,`（原有）、側欄常駐／感應 `Ctrl+Shift+S`（原有）、顯示鍵盤快捷鍵 `Ctrl+/`（開設定並切到這一頁）
- **固定（不可改）**：Enter 傳送、Shift+Enter 換行、Esc 關閉視窗／離開設定／收起面板

Mac 上 `Ctrl` 一律是 ⌘。新增的預設值是我選的（參考 ChatGPT、Slack 的習慣並避開瀏覽器保留組合），Allen 可以決定要不要換。

## 3. 儲存與跨裝置同步

選擇存在設定 `keyboardShortcuts`：`{ id: { combo?: 'Mod+K' | '' (「無」), enabled?: false } }`，只存與預設不同的部分。因為是設定的一個欄位：

- 隨設定存到本機（IndexedDB）與雲端；雲端同步用「逐項設定合併」（`data/settings-merge.js`，每個設定有時間戳，後改的贏），所以在 A 裝置改按鍵，B 裝置同步後就生效；測試 `tests/shortcuts.test.js` 驗證它是一般設定欄位、會被蓋時間戳與合併。
- 設定備份的匯出包含它（`import-export-lifecycle.js`），匯入走原本的設定匯入。
- `config-normalization.js`（伺服器共用）只檢查形狀（不認識快捷鍵），id 與按鍵的檢查在 `shortcut-config.js`。
- 另一台裝置的更動進來時，設定頁在下列時機重畫：`astra:cloud-config`、`astra:cloud-app-data`、`astra:cloud-workspace-committed`、`astra:cloud-cli-merge`、帳號確認、設定視窗打開。按鍵本身不需重畫（每次按鍵都現讀設定）。

## 4. 設定頁

- 分組：輸入框、對話、導覽、固定按鍵（無法修改）。每列：開關（沿用設定頁既有的開關樣式）、名稱（`pz-label`，所以設定搜尋找得到）、按鍵組合；與預設不同的列右邊有「還原預設」小按鈕，頁面右上有「全部還原預設」。
- 改按鍵：點按鍵 → 變成輸入框「請按下按鍵組合」；單獨的修飾鍵會等你按完；Esc 取消、Backspace／Delete 清除（「無」）；不合法或衝突時在那一列下面用紅字說明原因（瀏覽器保留、編輯文字用、需要 Ctrl/Alt、已被「某某」使用），不會存下去；點別處取消。正在選按鍵時分派器不動，按下的鍵不會傳給頁面。
- 關掉的列變淡、按鍵不能點；關掉的快捷鍵不佔用按鍵（不算衝突）。
- 限電腦版：分頁只在 `(min-width: 768px) and (pointer: fine)` 時掛上，樣式在視窗變窄或觸控時（`@media (max-width: 767px), (pointer: coarse)`）隱藏；手機的設定清單本來就不含這一頁。
- 樣式照 `2026-10-31-ui-style-rules.md`：粗細只用 400／500、三種字級、顏色只用 tokens；設定視窗會把所有文字色強制成 `--gpt-control-text`，所以次要文字用 `!important`（`important-audit` 上限 8，已登記）。

## 4.1 標題與寬度（Allen 2026-11-05 第二則回饋）

- 分頁名稱**不再自己畫**：設定頁每一頁最上面的標題是 `.settings-section.active::before { content: attr(data-section-title) }`（`settings-desktop.css`），由導覽項的 `data-lang-key` 在換語言時填。這一頁原本沒有這兩個，所以最上面是空的、我又在下面畫了一個大標題。現在導覽項有 `data-lang-key="scNav"`、區塊有 `data-section-title`，標題與其他頁一樣在最上面（有細線）；下面只留說明文字與「全部還原預設」。
- 寬度：每一頁內容的寬度是同一條規則（`#settings-modal .settings-section { max-width: 40rem !important }`），這一頁的樣式不再設自己的寬度；我用瀏覽器量過所有靜態分頁（個人化、模型管理、資料管理、輔助功能、鍵盤快捷鍵、垃圾桶、關於）都是 640px、起點相同；動態建立的分頁（記憶、隱私、權限…）沿用同一個區塊所以同寬，沒有在真實頁面逐頁量。列的左右內距與卡片內距同為 `1.15rem`，所以開關與按鍵的左右邊與其他頁卡片裡的內容對齊。

## 5. 驗證

- `tests/shortcuts.test.js`：組合解析（Mac／Windows、Alt、單獨修飾鍵、Windows 鍵）、驗證規則、清單完整（每項有群組、五語文字、可用的預設、預設不重複）、設定檢查、儲存（改、存、與預設相同就不存、另一台來的更動會被讀到並通知）、衝突、同步合併、分派器（自訂按鍵、關閉、不處理的回 false、對話框開著、選按鍵中、停止）、頁面動作、提示文字、設定頁（列表、開關、選按鍵流程、錯誤訊息、Esc／Backspace、還原）。
- 用 Playwright 在真正的 `index`／`chat-app`／`settings-dialog`／`rail`／`shortcuts` CSS 上看過深色與淺色、選按鍵中與錯誤訊息的畫面。
- **沒有在真實登入的 staging 上驗證**：實際按鍵會不會被某個瀏覽器／作業系統攔走（例如 `Ctrl+Shift+O`、`Ctrl+Shift+E` 在不同瀏覽器的保留情形）、與真實設定視窗的分頁切換、雲端同步來回，需要 Allen 在兩台裝置上試。

## 6. 之後可以做

- 更多動作（停止回覆、複製最後一則回覆、切換淺色／深色、在對話間移動）；加法見第 1 節。
- Mac 上讓使用者選用真正的 Ctrl（目前只有 ⌘、Alt、Shift）。
- 設定搜尋對「按鍵」本身也能搜（現在只搜名稱）。

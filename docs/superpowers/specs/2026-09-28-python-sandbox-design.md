# 方案 B：瀏覽器內 Python 沙盒（進階模式）詳細設計

**日期：** 2026-09-28
**狀態：** B0 已由使用者確認（2026-09-28）。B1（沙盒執行環境）已上線。B2（工具呼叫與介面）與 B3（檔案保存、卡片與預覽）已實作，等待使用者用真實金鑰一起驗證。實作時與本文不同的地方記在文末的 B1、B2、B3 實作紀錄，以那幾節為準。
**前置閱讀：** [交接說明](../plans/2026-09-28-downloadable-files-handoff.md)（工作規則）、[總計畫](2026-09-26-downloadable-files-design.md)（決定 1–4、6 與「方案 B 概要」「模式選擇與自動切換」）、[設計系統規格](2026-09-27-design-system.md)、[V1 看圖檢查](2026-09-28-vision-check-design.md)。

## 0. 使用者已確認的決定（2026-09-28）

| 項目 | 決定 |
|---|---|
| 名稱 | **標準**（方案 A，現在的做法）與 **進階**（方案 B，AI 在瀏覽器裡執行 Python） |
| 選擇的位置 | **放進輸入框的「設計」選單**：最上方一排「製作方式：標準｜進階」，下面維持原本的「簡報／Word／PDF 文件」分頁。輸入框不增加按鈕。選擇存在對話上；設定裡可以改新對話的預設值。 |
| 預設值 | **進階**。支援的模型一律用進階；不支援或無法執行時自動改用標準，並在回覆中顯示。 |
| 執行過程 | **收合成一行，可展開**：執行中顯示目前步驟與「停止」；完成後收成「已執行程式 3 次 ›」，點開可看每次的程式碼（有上色）與輸出。 |
| 沙盒網址 | **子網域 `run.noureon.com`**，與 noureon.com 不同來源。需要使用者在 DNS 加一筆 CNAME，並在 Vercel 專案加入這個網域（步驟見 §10）。 |

此外沿用總計畫已確定的方向：
- 使用 Pyodide，在使用者的瀏覽器裡執行，不用伺服器沙盒。
- 使用各供應商原生的工具呼叫。
- 產出的檔案沿用 A 的卡片、預覽與 ZIP。
- 產出存在本機，並沿用雲端同步資產的機制。
- 以 DocumentSpec 加素材交給設計系統為主，也保留直接用 python-docx／python-pptx 自由製作的路徑。
- 選進階但無法使用時，改用標準，而且一定要顯示。

下面各節是依這些決定與現有程式推導出的做法。實作時若必須改變使用者看得到的部分，先問使用者。

## 1. 目標與非目標

**目標**
- **更完整的美編控制**：模型可以寫程式計算版面、處理資料，並用 matplotlib 畫出設計系統原生圖表以外的圖。
- **分析使用者上傳的檔案**：CSV、Excel、Word、PDF、圖片都可以讀取、計算，並產生新檔案。
- **更多格式**：產出方案 A 做不到的格式，例如任何 matplotlib 圖片、合併後的 PDF、zip 等。
- **資料不離開裝置**：程式在使用者的裝置上執行，產出檔案也存在本機；除非使用者開啟雲端同步，才會同步到自己的帳號。
- **程式碰不到帳號資料**：即使模型寫出惡意程式，也讀不到 API 金鑰、對話、登入狀態，而且無法連網把資料送出去。

**非目標**
- 伺服器端執行、長時間背景工作、GPU。
- 讓程式連網：不能 pip install 任意套件，也不能抓網頁或呼叫 API。
- 在不支援工具呼叫的模型上模擬工具呼叫，例如從文字裡解析程式碼。這些模型只用標準模式。
- 模型理事會與學習模式裡的進階模式。第一版在這兩種情況一律用標準模式，並顯示原因。

## 2. 使用者看到的樣子

### 2.1「設計」選單最上方的「製作方式」

參考：
- 分段控制：Apple HIG Segmented controls、Material 3 Segmented buttons。
- 說明文字的寫法：ChatGPT 與 Claude 的功能開關說明。

黑白極簡：選中的一段是黑底白字，深色模式反轉；不用圖示。

```
┌──────────────────────────────┐
│ 製作方式  [ 標準 ][ 進階 ]     │
│ AI 在你的瀏覽器執行 Python，   │
│ 可分析上傳的檔案、精算圖表。   │
│ 第一次使用需下載約 30 MB。     │
├──────────────────────────────┤
│ [簡報] [Word／PDF 文件]        │
│ …原本的範本選擇…              │
└──────────────────────────────┘
```

- **說明文字依選擇改變**：
  - 選「標準」時：「所有模型都能用，速度最快。」
  - 選「進階」時，顯示上圖的說明。已經下載過 Python 環境後，最後一句改成「Python 環境已下載」。
- **模型不支援時**：目前的模型不支援工具呼叫，或在模型理事會、學習模式中時：
  - 「進階」這一段變灰、無法點選，下方說明原因，例如「目前的模型不支援執行程式」。
  - 使用者原本的選擇仍保留在對話上，換回支援的模型就恢復進階。
- **選擇存在對話上**：欄位是 `conversation.fileMode`，值為 `'standard'` 或 `'advanced'`，存法和 `deckDesign`、`documentDesign` 相同，會同步、匯出，也會隨 P2P 傳送。
- **新對話的預設值**：取自設定 `config.fileModeDefault`，預設為 `'advanced'`。
  - 設定頁「檔案」區塊與看圖檢查的開關放在一起，文字為「新對話的製作方式：標準／進階」。
  - 匯入與匯出設定時一併處理（`import-export-lifecycle.js`）。
- **按鈕文字**：「設計」按鈕文字不變。如果之後使用者希望一眼看到目前模式，再討論加小字。

### 2.2 回覆中的執行過程

參考：ChatGPT 的「已分析／Analyzed」收合列、Claude.ai 的工具步驟，以及 Gemini 的程式執行區塊（每一步都展開，這次沒有採用）。

```
執行中：   ◌ 正在執行程式（第 2 次）：畫出各區營收圖表……
第一次：   ◌ 正在準備 Python 環境（第一次約 30 MB）…… 42%
完成後：   已執行程式 3 次  ›
展開後：   ▾ 已執行程式 3 次
             1  讀取上傳的 CSV                         0.8 秒
                ```python（上色，可複製）```
                輸出（等寬字，最多顯示 200 行，可再展開全部）
                產生：/output/營收分析.xlsx（48 KB）
             2  畫出各區營收圖表                        2.1 秒
             3  ……  錯誤：KeyError: '區域'（模型之後已修正）
```

- **收合列的位置**：放在回覆文字的最上方，因為模型會先執行程式，再寫出結論。
  - 如果模型在執行前後都有寫文字，收合列仍然放在最上方，不把回覆切成好幾段，方便閱讀。
- **每一步的標題**：由模型在工具呼叫中提供（`title` 參數，用回覆的語言）。沒有提供時顯示「第 N 次」。
- **停止**：沿用輸入框現有的「停止產生」按鈕。按下後同時中止模型請求和沙盒（直接結束 Worker），收合列顯示「已停止」。
- **錯誤**：只在展開後以文字「錯誤」標示；不用紅色大框，符合黑白風格。
  - 模型自行修正並成功時，收合列不另外標示錯誤。
  - 最後一次仍然失敗時，收合列顯示「執行失敗」。
- **產出的檔案**：用 A 的檔案卡片，放在回覆文字之後。預覽、下載與「全部下載（ZIP）」都相同。

### 2.3 自動改用標準模式的提示

選進階但這一則回覆無法使用時，回覆最上方顯示一行灰字：「已改用標準模式：{原因}」。這行字也會存在訊息上，重新整理後仍然看得到。原因共七種：

| 代碼 | 顯示的原因（zh-TW） |
|---|---|
| `model-unsupported` | 目前的模型不支援執行程式 |
| `council` | 模型理事會不支援進階模式 |
| `learning` | 學習模式不支援進階模式 |
| `browser-unsupported` | 這個瀏覽器無法執行 Python（需要 WebAssembly 與 Web Worker） |
| `sandbox-load-failed` | Python 環境載入失敗（可能離線或連線被阻擋） |
| `sandbox-crashed` | Python 環境發生無法恢復的錯誤 |
| `search-conflict` | 此模型無法同時使用網路搜尋與執行程式（僅在 B2 實測確認 Gemini 不能合併時使用） |

改用的時機：
- **傳送前就知道的情況**：模型不支援、理事會、學習模式、瀏覽器不支援。這些情況一開始就用標準模式送出。
- **沙盒載入失敗**：
  - 在模型要求執行程式時才發生，所以當下改成回報模型「無法執行程式」。
  - 模型會收到提示：「請改用標準方式輸出檔案（````file 區塊）」。
  - 回覆最上方同樣顯示提示。
  - 這樣就不必重新送出整則訊息。

## 3. 架構

```
noureon.com（主程式）                         run.noureon.com（沙盒來源）
┌──────────────────────────────┐   postMessage  ┌──────────────────────────────┐
│ 工具呼叫迴圈（B2）            │ ─────────────▶ │ /sandbox/ 頁面（隱藏 iframe） │
│ 產出保存、卡片、預覽（B3）    │ ◀───────────── │   └─ Web Worker：Pyodide      │
│ DocumentSpec → 設計系統（B4） │  只傳程式碼、   │      /input /output /work    │
│ API 金鑰、對話、登入狀態      │  檔案與輸出     │      CSP：只能連 Pyodide 套件 │
└──────────────────────────────┘                └──────────────────────────────┘
```

### 3.1 沙盒來源

- **同一個 Vercel 專案、同一次部署**：`run.noureon.com` 指向同一個專案，靠網址的主機名稱套用不同的 header。
  - 不另開專案，發布流程不變。
  - 沙盒頁面與主程式一起部署，版本永遠一致。
- **`vercel.json` 的調整**：
  - 現在的全站 header 改成排除 `run.noureon.com`，也就是在 `has`／`missing` 加上主機條件。原因是全站 header 裡的 `X-Frame-Options: DENY` 與 `frame-ancestors 'none'` 會擋住 iframe。
  - 沙盒主機另外設定一組 header，**強制執行**，不是 Report-Only：

    ```
    Content-Security-Policy:
      default-src 'none';
      script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net/pyodide/v314.0.7/full/;
      connect-src 'self' https://cdn.jsdelivr.net/pyodide/v314.0.7/full/;
      worker-src 'self';
      frame-ancestors https://noureon.com https://www.noureon.com;
      base-uri 'none'; form-action 'none'
    Cross-Origin-Resource-Policy: same-site
    Referrer-Policy: no-referrer
    Permissions-Policy: camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()
    ```

    如果 Pyodide 仍然需要 `'unsafe-eval'`，只在沙盒來源放寬。沙盒本來就是執行不受信任程式的地方，這由 B1 實測決定。
  - 在 `run.noureon.com` 上，除了 `/sandbox/` 以外的路徑一律回傳 404，不在沙盒網域提供主程式。
  - 在 noureon.com 上，`/sandbox/` 也一律回傳 404。這樣主程式不可能用同一個來源載入沙盒。
- **主程式的 CSP**：`frame-src` 加上 `https://run.noureon.com`，原本的 Cloudflare 保留。
- **沙盒頁面的自我檢查**：
  - 頁面啟動時確認自己的 `location.origin` 是允許的沙盒來源，並確認 `window.parent !== window`。不符合就不做任何事。
  - 只接受來自 noureon.com、www.noureon.com，或開發環境主程式來源的訊息。
- **iframe 屬性**：主程式以 `sandbox="allow-scripts allow-same-origin"` 加上 `allow=""` 嵌入沙盒。
  - 這裡的 allow-same-origin 讓沙盒保有它自己的來源，也就是 run.noureon.com，才能使用快取。
  - 它不會讓沙盒取得 noureon.com 的權限。
- **開發環境**：主程式在 `http://localhost:5173`，沙盒用 `http://127.0.0.1:5173/sandbox/`。主機名稱不同就是不同來源，不需要第二個伺服器。
  - Vite 的 dev 與 preview 伺服器對 `/sandbox/` 加上相同的 CSP。
  - 沙盒來源用設定值 `VITE_SANDBOX_ORIGIN` 指定，正式環境的預設值是 `https://run.noureon.com`。

### 3.2 Python 環境（Pyodide）

- **版本**：Pyodide **314.0.7**（2026-09-16；Python 3.14.2）。版本固定寫在一個常數裡，升級另外處理。
- **核心與套件的來源**：Pyodide 核心以及它內建的套件從 jsDelivr 的固定版本路徑載入（`cdn.jsdelivr.net/pyodide/v314.0.7/full/`），不放進 Vercel。
  - 內建套件包括 numpy、pandas、matplotlib、lxml、Pillow、fonttools、scipy 等。
  - 套件清單（`pyodide-lock.json`）自己存一份在沙盒來源。Pyodide 載入每個套件時，會用清單裡的 sha256 驗證。這樣即使 CDN 被竄改，也無法換掉套件內容。
  - 核心的 `pyodide.mjs` 與 `pyodide.asm.js` 也放在自己的來源，以免 CDN 換掉載入程式。
- **Pyodide 沒有內建的純 Python 套件**：放在沙盒來源的 `/sandbox/wheels/`，固定版本並附上 sha256，合併進套件清單。
  - 模型寫 `import docx` 時，由 `loadPackagesFromImports` 自動載入對應的套件。清單裡記錄了匯入名稱與套件名稱的對應，例如 `docx` → python-docx、`pptx` → python-pptx、`fpdf` → fpdf2。
  - 不提供 micropip，因為沙盒不能連網。

| 套件 | 版本 | 大小 | 用途 |
|---|---|---|---|
| python-docx | 1.2.0 | 253 KB | 自由製作 Word |
| python-pptx | 1.0.2 | 473 KB | 自由製作 PowerPoint |
| openpyxl（＋et-xmlfile） | 3.1.5 | 269 KB | 讀寫 Excel（pandas 讀 xlsx 也需要） |
| XlsxWriter | 3.2.9 | 175 KB | python-pptx 的相依套件；也可以直接寫 Excel |
| fpdf2（＋defusedxml） | 2.8.8 | 363 KB | 自由製作 PDF |
| pypdf | 6.19.0 | 395 KB | 讀取、合併、拆分 PDF |

- **第一次使用要下載多少**：依程式實際匯入的套件而定，數字是 2026-09-28 在 jsDelivr 實際量到的大小。

  | 內容 | 約略大小 |
  |---|---|
  | 核心（wasm 9.6 MB、標準函式庫 2.5 MB） | 12 MB |
  | Office 組合（lxml、Pillow 與上表的套件） | ＋4 MB |
  | 資料處理（numpy、pandas 與相依套件） | ＋8 MB |
  | 圖表（matplotlib、fonttools、contourpy 等） | ＋9 MB |

  常見的「分析資料、畫圖、做 Excel 或 PPT」合計約 **30 MB**，與選單上的說明一致。scipy、scikit-learn 等較大的套件只有程式用到時才下載。
- **快取**：沙盒來源註冊一個只管 `/sandbox/` 的 Service Worker。
  - 以版本號當快取名稱，把 Pyodide 檔案與套件存進 Cache Storage，之後優先從快取讀取。
  - 下載過一次後，即使離線也能執行。
  - 升級版本時，刪除舊的快取。
- **預先載入**：預設是進階模式，但不能讓每個使用者一打開 app 就下載 30 MB。所以只在以下兩個時機才開始載入核心：
  - 送出的訊息看起來需要檔案（沿用 `mayNeedFileGuidance`），或者附有檔案。此時與模型請求同時開始載入。
  - 模型第一次要求執行程式。

  已經下載過的使用者，每次載入只需要從快取初始化，約 2–4 秒。
- **中文字型**：matplotlib 預設的字型沒有中日韓文字，畫出來會變成方框。
  - 沙盒啟動時，把 app 已有的子集字型放進 `/fonts` 並登記給 matplotlib，包括 Noto Sans TC、SC、JP、KR 與 Inter。
  - 把 `font.sans-serif` 設成「Inter → 依文件語言的中日韓字型」。
  - 子集沒有涵蓋的罕用字仍可能顯示為方框，這點寫在提示詞裡，請模型注意。

### 3.3 虛擬檔案系統

| 路徑 | 內容 |
|---|---|
| `/input/` | 使用者上傳的檔案，加上這個對話先前由進階模式產生的檔案（見 §5.3）。用原始檔名，同名時加上 `（2）`。 |
| `/output/` | 要交給使用者的檔案。每次執行結束時，app 會收集這裡的新增或變更檔案。 |
| `/work/` | 工作目錄（cwd），放暫存檔，不會交給使用者。 |
| `/fonts/` | 見 §3.2。 |

- **每一則回覆用一個全新的環境**：同一則回覆裡多次執行程式時，變數會保留。
  - 下一則回覆會重新開始，但 `/input` 會放入之前產生的檔案。這樣「把剛剛的表格改成……」這類要求仍然可行。
  - 這樣也避免上一則回覆的狀態影響下一則。

### 3.4 資源限制

| 項目 | 限制 | 超過時 |
|---|---|---|
| 單次執行時間 | 60 秒（不含第一次下載） | 結束 Worker，回報模型「執行逾時，環境已重新啟動，變數已清除」 |
| 每則回覆的執行次數 | 10 次 | 第 10 次之後不再提供工具，要求模型用現有結果寫出回覆 |
| 回傳給模型的輸出 | stdout 與 stderr 各 10,000 字 | 保留開頭與結尾，中間註明「省略 N 字」 |
| 畫面上顯示的輸出 | 每步 50,000 字 | 截斷並註明 |
| 每則回覆的產出檔案 | 最多 10 個，每個 ≤ 25 MB，合計 ≤ 50 MB | 超過的不收集，回報模型原因 |
| 放入 `/input` 的檔案 | 合計 ≤ 100 MB | 超過的不放入，並在提示詞中列出 |
| 記憶體 | 依瀏覽器限制（wasm32 最多 4 GB，手機實際更少） | Worker 當掉時自動重啟一次，並回報模型；再次當掉時，依 §2.3 的 `sandbox-crashed` 處理 |

- **為什麼只能直接結束 Worker**：Pyodide 的「中斷執行」需要 SharedArrayBuffer，而 SharedArrayBuffer 要求整個頁面都做跨來源隔離（COOP／COEP），會影響主程式的其他功能。所以逾時與停止都用直接結束 Worker 的方式，再重新建立一個。從快取重新初始化約 2–4 秒。

### 3.5 主程式與沙盒之間的訊息

所有訊息都是結構化物件。主程式會檢查 `event.origin === SANDBOX_ORIGIN` 以及 `event.source === iframe.contentWindow`；沙盒則檢查來源是否在允許清單裡。

| 方向 | 類型 | 內容 |
|---|---|---|
| 主 → 沙盒 | `init` | 協定版本、文件語言（決定 matplotlib 字型） |
| 沙盒 → 主 | `progress` | 目前階段（下載核心／載入套件名稱／初始化）、下載比例 |
| 主 → 沙盒 | `mount` | 要放進 `/input` 的檔案（檔名、類型、ArrayBuffer，以 transfer 傳送不複製） |
| 主 → 沙盒 | `run` | `id`、程式碼 |
| 沙盒 → 主 | `result` | `id`、stdout、stderr、錯誤（Python traceback，只保留使用者程式的部分）、耗時、`/output` 變更的檔案（檔名、類型、ArrayBuffer） |
| 主 → 沙盒 | `reset` | 丟棄目前的 Worker，建立新的 |

沙盒永遠不會收到 API 金鑰、對話內容、使用者資訊或設定。它只會收到程式碼、要放入的檔案，以及文件語言。

### 3.6 Worker 內的第二層防護

CSP 是主要的防線。另外在執行模型的程式之前，Worker 還會做以下處理：
- 刪除 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`importScripts`、`WebTransport`、`BroadcastChannel`，範圍包括全域物件與原型鏈上的定義。
- 從 Python 移除 `js` 與 `pyodide_js` 模組，讓 Python 程式碰不到 JavaScript 的全域物件。Pyodide 的 `pyodide.http` 也會一併失效。
- 關閉 `pyodide.loadPackage` 的對外呼叫。套件只在執行前，由沙盒自己依 `loadPackagesFromImports` 載入。

## 4. 工具呼叫（B2）

### 4.1 工具定義

只提供一個工具：

```json
{
  "name": "run_python",
  "description": "在使用者瀏覽器內的 Python 3.14 沙盒執行程式（無網路）。/input 是使用者的檔案，要交給使用者的檔案寫到 /output。",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "這一步在做什麼，一句話，用回覆的語言" },
      "code": { "type": "string", "description": "要執行的 Python 程式碼" }
    },
    "required": ["code"]
  }
}
```

回傳給模型的結果是 JSON 字串：`{ ok, stdout, stderr, error, files: [{ path, size }], restarted, elapsed_ms, note }`。`note` 用來說明逾時、次數上限、檔案被略過等狀況。

### 4.2 迴圈

1. 送出請求時附上工具定義。只有同時符合以下條件才附上：
   - 進階模式；
   - 模型支援工具呼叫；
   - 不是理事會或學習模式；
   - 不是看圖檢查、記憶等內部請求。
2. 串流回覆：
   - 文字照常顯示。
   - 遇到工具呼叫時，把呼叫的內容累積完整，同時更新收合列，例如「正在執行程式（第 N 次）：{title}」。
3. 一次回應結束時，如果有工具呼叫，依序執行，並把結果接在對話後面，然後再送出一次請求。模型一次回應可能包含多個工具呼叫。
4. 模型不再呼叫工具時，這則回覆完成。
   - 超過 10 次時，最後一次請求不附工具，並附上一句「已達執行上限，請用目前的結果回答」。
5. 每一次請求都沿用同一個 `AbortSignal`，按「停止」會同時中止請求與沙盒。

實作上會在 `stream-api-call.js` 旁邊新增一個 `tool-call-loop.js`：
- `streamApiCall` 增加 `tools` 與「接續訊息」兩個選項。
- 串流解析改成也回報工具呼叫。
- 迴圈本身不放進 `stream-api-call.js`，讓標準模式的路徑維持不變。

### 4.3 三家供應商的格式

| | Gemini | OpenRouter | NVIDIA |
|---|---|---|---|
| 送出 | `tools: [{ functionDeclarations: [...] }]`，`toolConfig.functionCallingConfig.mode = 'AUTO'` | OpenAI 格式的 `tools`，`tool_choice: 'auto'` | 同 OpenRouter，經 `/api/nvidia-chat` 轉送（代理程式照原樣轉送，不需修改） |
| 串流中的呼叫 | `candidates[0].content.parts[]` 裡的 `functionCall { name, args }`（完整物件） | `choices[0].delta.tool_calls[i]`，依 `index` 累積 `function.arguments` 片段 | 同 OpenRouter |
| 回傳結果 | `role: 'user'` 的 `functionResponse { name, response }` | `role: 'tool'`，加上 `tool_call_id` | 同 OpenRouter |
| 必須原樣帶回的內容 | 模型那一輪的**所有 parts**，包含 `thoughtSignature`（Gemini 3 缺少時會回傳 400） | 助理訊息的 `tool_calls`，以及推理模型的 `reasoning_details` | 助理訊息的 `tool_calls` |

- 現在的 Gemini 串流解析只讀 `parts[0].text`，需要改成讀取所有 parts。標準模式的行為保持不變。
- **Gemini 同時開網路搜尋時**：`googleSearch` 與自訂函式能不能放在同一次請求，在 B2 用真實金鑰實測。
  - 可以：兩個都送。
  - 不可以：這則回覆改用標準模式，並顯示 `search-conflict`。
- **OpenRouter 與 NVIDIA 的網路搜尋**：這兩家用 Tavily 搜尋，搜尋在送出前就由 app 完成，不受影響。

### 4.4 模型是否支援

在 `model-registry.js` 新增 `TOOL_CALLING_MODELS`，寫法和 `OPENROUTER_VISION_MODELS` 相同。無法確定是否支援的模型一律視為不支援。

- **OpenRouter**：2026-09-28 查過 `https://openrouter.ai/api/v1/models` 的 `supported_parameters`，清單上 23 個文字模型都支援 `tools`。圖片生成模型不列入。
  - 加一個測試：模型清單的每個文字模型，都必須明確標示支援或不支援，避免新增模型時漏掉。
- **Gemini**：3.8 Flash、3.5 Flash Lite、3.1 Pro Preview 都支援 function calling。
- **NVIDIA**：DeepSeek V4.1 Flash、GLM-5.3、GLM-5.3 Flash、Kimi K3 是否支援，必須在 B2 用使用者的金鑰實測。實測前列為不支援。

### 4.5 提示詞

進階模式可用時，在系統提示詞加上一段說明，放在 `file-authoring-guidance.js` 旁邊的 `sandbox-guidance.js`，延後載入。內容包括：

- **環境說明**：
  - Python 3.14，沒有網路，不能安裝套件。
  - 可用的套件清單。
  - `/input` 目前有哪些檔案（檔名、類型、大小），以及 `/output` 的用途。
  - 中文字型已經設定好。
- **何時用 Python**：
  - 計算、處理資料、讀取上傳的檔案、畫設計系統做不到的圖、需要精確排版時，才用 Python。
  - 純文字、一般對話不要執行程式。
  - 只需要寫一份文件時，直接用 ````file 區塊（方案 A）比較快，這條仍然可以用。
- **Office 檔的首選做法**：用 `noureon` 模組輸出 DocumentSpec 交給設計系統（§6）。需要設計系統做不到的東西時，才直接用 python-docx 或 python-pptx。
- **出錯時**：看錯誤訊息修正程式再試，不要重複執行同一段程式。
- **回覆的內容**：最後用文字說明結果；不要在回覆裡貼出整份程式碼，因為使用者展開收合列就看得到。

### 4.6 對話紀錄

- **存在訊息上的內容**：`message.sandboxRun = { steps: [{ title, code, stdout, stderr, error, files, elapsedMs }], status, fallback }`。
  - stdout 只保留畫面上顯示的上限（§3.4）。
  - 這些資料會跟著對話同步與匯出。
- **之後的請求**：模型只會看到精簡的摘要，不會看到整段程式碼與輸出，以節省 token。
  - 摘要例如「〔先前以 Python 產生：/output/營收分析.xlsx〕」。
  - 摘要的格式和 `file-history-compaction.js` 對 A 檔案的處理一致。
- **Gemini 的 `thoughtSignature` 等供應商專屬欄位**：只在同一則回覆的迴圈裡使用，不存進對話。

## 5. 產出檔案、保存與同步（B3）

### 5.1 存在哪裡

- **一般產出檔案**：`/output` 收集到的每個檔案，都存成訊息的一個 part：

  ```
  { generatedFile: { id, name, mimeType, size, sha256, storageKey, source: 'sandbox' } }
  ```

  - 檔案內容以 `generatedFile:{使用者}:{id}` 為鍵存進 IndexedDB（`storage-adapter.js`）。
  - 雲端同步沿用生成圖片的做法：`generated-image-assets.js` 加上 `cloud-assets.js` 的資產標記。Supabase 的 `user-assets` bucket 單檔上限是 50 MB，我們的上限 25 MB 在這個範圍內。
- **臨時對話**：只放在記憶體裡，不寫入 IndexedDB，和生成圖片的 `shouldPersist` 規則相同。
- **透過 DocumentSpec 產生的檔案**（§6）：不存成二進位。它們會變成回覆文字裡的 ````file 區塊，和 A 完全相同，可以從文字重建。只有它們用到的圖片素材需要存成二進位。

### 5.2 卡片與預覽

- 卡片、下載、iOS 分享、ZIP 都沿用 A 的做法。卡片的檔案內容來源多一種：A 從文字產生 Blob，B 直接讀取已存的 Blob。
- 預覽依格式而定：

| 格式 | 預覽 |
|---|---|
| docx | 沿用 docx-preview，任何 docx 都能顯示 |
| pdf | 沿用 PDF.js，任何 PDF 都能顯示 |
| xlsx | A3 的工作表預覽目前是從規格畫出來的。B3 新增一個輕量的 xlsx 讀取器，把儲存格值、樣式、合併儲存格與欄寬轉成同一個預覽模型；圖表只顯示標題與位置 |
| pptx | 透過 DocumentSpec 產生的簡報可以完整預覽；自由製作的 pptx 無法正確畫出，顯示「這個檔案無法預覽，請下載後開啟」，其他功能照常 |
| 圖片、SVG | 直接顯示（SVG 放在 A6 的 HTML 沙盒預覽裡） |
| 文字、CSV、JSON、HTML 等 | 沿用 A 的文字預覽、上色與 HTML 沙盒預覽 |

### 5.3 換裝置、重新整理、檔案不見時

- **重新整理之後**：從 IndexedDB 讀回檔案。
- **換裝置**：有開雲端同步時，從雲端下載檔案。
- **檔案不在這台裝置上**：例如沒有開同步，或檔案已經被清掉。
  - 卡片顯示「檔案不在這台裝置上」，並提供「重新執行」。
  - 「重新執行」會依序重跑訊息上保存的程式碼。前提是當時用到的 `/input` 檔案還在。
  - 重跑的結果可能與原本不完全相同，例如程式裡用了亂數或日期，所以會提示使用者。

### 5.4 上傳的檔案放進沙盒

- **哪些檔案會放進 `/input`**：這個對話裡，所有還能在本機取得內容的附件，以及先前進階模式產生的檔案。
  - 包括目前這則訊息和之前訊息的附件。
  - 附件依原始檔名放入；總量上限見 §3.4。
- **和原本附件處理的關係**：附件仍然照原本的方式送給模型，例如 Gemini 的 inline data、OpenRouter 的 file-parser。所以模型可以直接看內容，也可以寫程式讀取。
- **檔案只在程式真的執行時才傳進沙盒**：模型沒有執行程式，就不會用到這些檔案。

## 6. DocumentSpec 與自由製作（B4）

- **沙盒內建 `noureon` 模組**，提供兩個函式：
  - `noureon.save_document(name, spec, assets=None)`：把 DocumentSpec 寫到 `/output/.noureon/`。副檔名決定格式，可以是 pptx、docx、xlsx 或 pdf。`spec` 是與 A 相同的 JSON 結構。`assets` 是 `{ "chart1.png": "/work/chart1.png" }` 這類對應，spec 裡用 `asset:chart1.png` 引用。
  - `noureon.design()`：取得這個對話的設計選擇，也就是 `deckDesign` 與 `documentDesign`，讓程式知道要套用哪個範本。
- **主程式收到 spec 之後**：
  - 產生對應的 ````file 區塊，附加到回覆文字的最後。
  - 素材存成二進位，存法見 §5.1。
  - 之後的轉檔、範本強制套用、字型嵌入、預覽，都走 A 的同一套程式。所以兩種模式產出的檔案品質與風格一致。
  - DocumentSpec 裡原生的圖表資料會優先使用，因為在 Office 裡可以編輯。matplotlib 的圖只在原生圖表做不到時才以圖片放入。
- **自由製作**：直接用 python-docx、python-pptx、openpyxl、fpdf2 寫到 `/output`，就是一般的二進位產出，存法見 §5.1。
- **兩種方式的選擇**：提示詞以 DocumentSpec 為首選（§4.5），但不禁止自由製作。

## 7. 看圖檢查（B5）

- **透過 DocumentSpec 產生的 pptx**：
  - 它們本來就是 ````file 區塊，所以直接沿用 V1：自動檢查一輪、用通知顯示進度，有修正時新回一則訊息。
  - 修正版在標準模式下產生，不再執行 Python。
- **自由製作的 pptx**：沒辦法畫成圖片，第一版不檢查。
  - 如果之後要支援，可以在沙盒裡把 pptx 轉成圖片，需要另外評估。
- **B5 的驗收**：用同一個題目，比較進階模式產出的簡報在修正前後的差異。

## 8. 安全：威脅與對策

| 威脅 | 對策 |
|---|---|
| 模型或上傳檔案裡的惡意指令，讓程式讀取 API 金鑰、對話、登入狀態 | 沙盒是不同來源，讀不到 noureon.com 的 localStorage、IndexedDB 與 cookie；沙盒也從來不會收到這些資料（§3.5） |
| 程式把資料送到外部 | 強制執行的 CSP 只允許連到自己的來源，以及固定版本的 Pyodide 路徑；Worker 內刪除網路 API，並移除 `js` 模組（§3.6） |
| 程式把資料藏在對 jsDelivr 的請求網址裡送出 | 攻擊者看不到 jsDelivr 的紀錄；而且套件載入在執行模型的程式之前就完成，執行時網路 API 已被刪除 |
| 程式操控主程式，例如偽造訊息 | 主程式只接受 `result` 或 `progress` 類型，而且 `id` 必須對應目前的執行；收到的檔案只當成資料，不會執行 |
| 產出的檔案含有惡意內容，例如 HTML 或 SVG 腳本 | HTML 與 SVG 預覽沿用 A6 的不透明來源 iframe；Office 檔案不允許巨集格式（`.docm`、`.xlsm`、`.pptm` 一律不收集） |
| 大量耗用資源，例如無窮迴圈、塞滿記憶體 | 單次執行 60 秒、10 次、檔案大小與數量上限、當掉後重啟（§3.4） |
| CDN 上的套件被換掉 | 套件清單與載入程式放在自己的來源，每個套件都用 sha256 驗證（§3.2） |
| 沙盒頁面被其他網站嵌入 | `frame-ancestors` 只允許 noureon.com |
| 模型在回覆裡用外部圖片網址夾帶資料 | 這是 A 本來就有的風險，進階模式不會增加：沙盒拿得到的資料，模型本來就看得到。B2 會再檢查回覆中的外部圖片是否需要改成點擊後才載入，另外跟使用者討論 |

**B1 的惡意程式測試清單**（全部必須失敗）：
- 用 `js.fetch`、`pyodide.http`、`urllib`、`socket` 連到外部網站。
- 讀取 `parent`、`top`、`document.cookie`，以及 noureon.com 的 localStorage。
- `import js` 之後呼叫 `postMessage` 偽造結果。
- 開新視窗、導向到其他網址。
- 無窮迴圈必須在 60 秒內被中止。
- 配置 3 GB 的記憶體後，Worker 必須能重啟。
- 寫入 1 GB 的 `/output` 時，必須被上限擋下。
- 在 noureon.com 上開啟 `/sandbox/` 必須回傳 404。
- 從其他網站嵌入沙盒頁面必須被擋下。

## 9. 各階段內容與驗收

| 階段 | 內容 | 驗收 |
|---|---|---|
| **B1** | 沙盒頁面、Worker、Pyodide 載入與快取、`/input`、`/output`、`/fonts`、限制與重啟、Worker 內的防護、`vercel.json` 與開發環境設定，以及主程式端的 `sandbox-client.js`（`run`、`mount`、`reset`、進度回報）。先不接模型 | 單元測試；§8 的惡意程式測試在 Chrome 與 Safari 全部失敗；測量第一次與快取後的載入時間；離線時用快取執行；手機寬度下進度正常 |
| **B2** | 工具呼叫迴圈（三家供應商）、`TOOL_CALLING_MODELS`、提示詞、執行過程的收合列與停止、「製作方式」選單與設定、自動改用標準模式的七種原因、5 種語言 | 用使用者的金鑰，三家各跑通一次（由使用者提供金鑰並操作，我不輸入金鑰）；不支援的模型確實改用標準並顯示原因；Gemini 搜尋與工具能否合併的實測結果寫進文件 |
| **B3** | `generatedFile` 的保存、同步與卡片，xlsx 讀取器預覽，「檔案不在這台裝置上」與重新執行，附件放入 `/input`，臨時對話 | 重新整理與換裝置（開同步）後都能取得檔案；上傳 CSV 或 xlsx 分析後產出新檔案 |
| **B4** | `noureon` 模組、spec 轉成 ````file 區塊、素材保存、範本強制套用、自由製作的路徑 | 兩種方式各產出 docx、pptx、xlsx、pdf，用 Office 以一般模式開啟且沒有修復提示 |
| **B5** | 透過 DocumentSpec 產生的 pptx 接上 V1 | 實測修正前後的差異 |

每個階段結束時都必須通過 `npm test`、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime` 與 `npm audit --omit=dev`。

**啟動時的 JS 不能變大**：
- 沙盒客戶端、工具迴圈、提示詞、收合列的程式都延後載入。
- 啟動時只加上判斷模式的小函式，以及收合列的外框渲染，因為歷史訊息需要同步畫出來。
- `check:sizes` 會為新的程式區塊設定預算。

## 10. 需要使用者協助的事

1. **DNS**：B1 在正式網站驗證之前完成即可，開發期間用 `127.0.0.1` 代替。
   - noureon.com 的 DNS 由 **Cloudflare** 管理：名稱伺服器是 `etienne.ns.cloudflare.com` 與 `nina.ns.cloudflare.com`，網址指向 Vercel。這是 2026-09-28 查到的。
   - **第一步：在 Vercel 加入網域**。
     1. 到 vercel.com，進入 noureon 專案，開啟 Settings › Domains，按 Add Domain。
     2. 輸入 `run.noureon.com`，環境選 Production，不設定轉址。
     3. Vercel 會顯示要新增的 DNS 記錄：類型 CNAME、名稱 `run`，以及一個目標值。把目標值複製下來。
   - **第二步：在 Cloudflare 新增記錄**。
     1. 到 dash.cloudflare.com，選 noureon.com，開啟 DNS › Records，按 Add record。
     2. Type 選 `CNAME`；Name 填 `run`；Target 貼上 Vercel 給的值。
     3. Proxy status 關掉，也就是灰色雲朵的 **DNS only**；TTL 用 Auto，然後儲存。
     4. 如果 Proxy 保持開啟（橘色雲朵），Vercel 可能無法簽發憑證，Cloudflare 也可能改動我們需要的 header。
   - **第三步：回到 Vercel 確認**。幾分鐘內網域旁會出現 Valid Configuration，HTTPS 憑證也會自動簽好。
   - **提前設定沒有影響**：在 B1 推上 main 之前，`run.noureon.com` 只會顯示和主站一樣的 app，而且那是另一個來源，資料不互通。B1 上線後，`vercel.json` 會讓這個網址只提供 `/sandbox/`。
   - 這些動作都在使用者自己的帳號裡操作，由使用者本人執行，我不會代為修改帳號設定。
2. **B2 的實測**：用你的 Gemini、OpenRouter、NVIDIA 金鑰各跑一次。

## 11. 風險與未決事項

- **手機的記憶體與速度**：
  - iPhone Safari 的分頁記憶體較少，同時載入 pandas 與 matplotlib 可能被系統關掉分頁。
  - B1 會實測。如果真的會被關掉，手機上的進階模式改為「只在需要時才載入 pandas 和 matplotlib」，並在說明中提醒。
- **第一次使用要等**：在行動網路下載 30 MB 可能要數十秒。
  - 進度會顯示在收合列上。
  - 使用者也可以在「設計」選單改用標準模式。
- **費用與速度**：
  - 每執行一次程式就要再請求模型一次，進階模式的 token 用量與等待時間都會比標準模式多。
  - 在提示詞裡要求模型只在需要時才執行程式。
- **弱模型亂用工具**：例如在一般閒聊時也執行程式，或反覆執行同一段程式。
  - 靠提示詞與每則回覆 10 次的上限控制。
  - B2 實測時，如果某個模型的表現很差，就從 `TOOL_CALLING_MODELS` 移除，那個模型改用標準模式。
- **Pyodide 升級**：版本固定。升級時要同步更新套件清單、sha256、CSP 路徑與快取名稱，這由測試檢查。
- **字型授權**：matplotlib 使用的是 app 已有的開源子集字型，授權與 A5 相同。

## 12. 介面文字（5 種語言）

| 鍵 | zh-TW | en | fr | ru | es |
|---|---|---|---|---|---|
| fileModeLabel | 製作方式 | Mode | Mode | Режим | Modo |
| fileModeStandard | 標準 | Standard | Standard | Стандартный | Estándar |
| fileModeAdvanced | 進階 | Advanced | Avancé | Расширенный | Avanzado |
| fileModeStandardNote | 所有模型都能用，速度最快。 | Works with every model and is the fastest. | Fonctionne avec tous les modèles et c'est le plus rapide. | Работает со всеми моделями и быстрее всего. | Funciona con todos los modelos y es el más rápido. |
| fileModeAdvancedNote | AI 在你的瀏覽器執行 Python，可分析上傳的檔案、精算圖表。第一次使用需下載約 30 MB。 | The AI runs Python in your browser to analyse uploaded files and build precise charts. The first use downloads about 30 MB. | L'IA exécute Python dans votre navigateur pour analyser les fichiers envoyés et créer des graphiques précis. La première utilisation télécharge environ 30 Mo. | ИИ запускает Python в вашем браузере, чтобы анализировать загруженные файлы и строить точные графики. При первом использовании загружается около 30 МБ. | La IA ejecuta Python en tu navegador para analizar los archivos subidos y crear gráficos precisos. El primer uso descarga unos 30 MB. |
| fileModeAdvancedReady | Python 環境已下載。 | The Python environment is downloaded. | L'environnement Python est téléchargé. | Среда Python загружена. | El entorno de Python ya está descargado. |
| fileModeDefaultSetting | 新對話的製作方式 | Mode for new chats | Mode des nouvelles conversations | Режим новых чатов | Modo de los chats nuevos |
| sandboxPreparing | 正在準備 Python 環境（第一次約 30 MB）…… {percent} | Preparing Python (about 30 MB the first time)… {percent} | Préparation de Python (environ 30 Mo la première fois)… {percent} | Подготовка Python (около 30 МБ в первый раз)… {percent} | Preparando Python (unos 30 MB la primera vez)… {percent} |
| sandboxRunning | 正在執行程式（第 {n} 次）：{title} | Running code ({n}): {title} | Exécution du code ({n}) : {title} | Выполнение кода ({n}): {title} | Ejecutando código ({n}): {title} |
| sandboxDone | 已執行程式 {n} 次 | Ran code {n} times | Code exécuté {n} fois | Код выполнен {n} раз(а) | Código ejecutado {n} veces |
| sandboxStopped | 已停止 | Stopped | Arrêté | Остановлено | Detenido |
| sandboxFailed | 執行失敗 | Run failed | Échec de l'exécution | Ошибка выполнения | Error de ejecución |
| sandboxError | 錯誤 | Error | Erreur | Ошибка | Error |
| sandboxOutput | 輸出 | Output | Sortie | Вывод | Salida |
| sandboxProduced | 產生 | Created | Créé | Создано | Creado |
| fallbackNotice | 已改用標準模式：{reason} | Switched to Standard mode: {reason} | Passé en mode Standard : {reason} | Переключено на стандартный режим: {reason} | Se cambió al modo Estándar: {reason} |
| fileNotOnDevice | 檔案不在這台裝置上 | This file is not on this device | Ce fichier n'est pas sur cet appareil | Этого файла нет на устройстве | Este archivo no está en este dispositivo |
| rerunCode | 重新執行 | Run again | Relancer | Запустить снова | Volver a ejecutar |
| rerunNote | 重新執行的結果可能與原本略有不同。 | The result may differ slightly from the original. | Le résultat peut légèrement différer de l'original. | Результат может немного отличаться от исходного. | El resultado puede variar un poco respecto al original. |
| previewUnavailable | 這個檔案無法預覽，請下載後開啟。 | This file can't be previewed. Download it to open it. | Impossible de prévisualiser ce fichier. Téléchargez-le pour l'ouvrir. | Этот файл нельзя просмотреть. Скачайте его, чтобы открыть. | No se puede previsualizar este archivo. Descárgalo para abrirlo. |

§2.3 的七種原因也需要 5 種語言的翻譯，在 B2 與其他文字一起放進 `sandbox-texts.js`，並用測試檢查 5 種語言的鍵是否一致。

## B1 實作紀錄（2026-09-28）

### 檔案

| 位置 | 內容 |
|---|---|
| `public/sandbox/index.html`、`host.js` | 沙盒頁面：檢查自己的來源與 app 的來源、管理 Worker（逾時、停止、當掉後重啟）、一次只處理一個請求、轉送圖表字型 |
| `public/sandbox/worker.js` | Pyodide Worker：封鎖網路、限制 Python 看得到的 JS、載入套件、執行程式 |
| `public/sandbox/runtime.js` | 不依賴 Worker 的部分：資料夾、放入 `/input`、收集 `/output`、擷取輸出、整理錯誤、清空、matplotlib 字型；測試直接用 Node 版 Pyodide 執行 |
| `public/sandbox/protocol.js` | 來源規則、限制、訊息類型、可連的網址、擋下的副檔名 |
| `public/sandbox/sw.js` | 沙盒的 Service Worker：快取並核對雜湊（傳統腳本，常數由測試對照 `protocol.js`） |
| `public/sandbox/pyodide/`、`wheels/` | `scripts/build-sandbox.mjs` 產生並 commit：Pyodide 載入程式、加入 8 個套件的清單、核心檔雜湊、套件檔 |
| `src/app/runtime/sandbox/` | app 端：`sandbox-protocol.js`（常數與來源判斷）、`sandbox-client.js`（iframe 與訊息）、`python-sandbox.js`（每頁一個沙盒）、`sandbox-fonts.js`（圖表字型） |
| `vercel.json`、`vite.config.js` | 沙盒主機的強制 CSP 與轉址；開發伺服器對 `/sandbox/` 加上相同的 CSP |

`pyodide` 是 devDependency，只供建置腳本與 Node 測試使用，不會打包進 app。

### 與設計不同的地方

- **核心檔的來源**：
  - Pyodide 的核心程式 `pyodide.asm.mjs` 會和 wasm 一起從 `indexURL` 載入，無法只把前者放在自己的來源。所以改成三個核心檔都從 jsDelivr 載入，CSP 的 `script-src` 允許那個固定版本的路徑。
  - 由沙盒的 Service Worker 在使用前核對 sha256（`integrity.json`），不符就拒絕。
  - 套件檔同樣用套件清單裡的 sha256 核對，清單沒列的檔案一律拒絕。
  - `pyodide.mjs` 與套件清單放在自己的來源。
  - 沒有 Service Worker 時（例如某些私密視窗），套件仍由 Pyodide 自己核對，只有核心檔少了這一層。
- **不需要 `unsafe-eval`**：Pyodide 在只有 `'wasm-unsafe-eval'` 的 CSP 下就能正常執行，所以沙盒的 CSP 沒有 `unsafe-eval`。這也讓 Python 無法用 JS 的 `Function` 建構子逃出去。
- **Python 的 `js` 模組**：沒有移除，因為 Pyodide 的 asyncio 需要它，改為用 `jsglobals` 只提供計時器和幾個基本建構子，沒有 fetch、self、parent。Worker 內的處理如下：
  - `fetch` 換成只允許固定 CDN 路徑與 `/sandbox/` 的版本。
  - `XMLHttpRequest`、`WebSocket`、`EventSource`、`WebTransport`、`BroadcastChannel`、`Worker`、`importScripts`、`indexedDB`、`caches` 等都移除，並從原型鏈刪掉。
- **圖表字型**：
  - Noto Sans TC、SC、JP、KR 是可變字型，預設字重是 Thin，在沙盒內轉成一般字重每套要 5–7 秒。
  - 所以改成 matplotlib 第一次被用到時，沙盒才向 app 要字型。
  - app 用 HarfBuzz 保留所有字元、固定字重 400 並改名，每套只要 20–50 毫秒，再傳給沙盒。
  - 字型清單設成 `font.family`，matplotlib 會逐字在各字型之間補字：Inter → 依文件語言排序的 CJK 字型 → DejaVu Sans。
  - 沙盒因此不需要從網路取字型，`run.noureon.com` 只提供 `/sandbox/`。
- **每則回覆的環境**：
  - 在全新環境 `import pandas, matplotlib` 約要 10 秒，所以每則回覆開始時改用「清空」（`clear`）：清掉變數、`/output`、`/work`，但保留已經載入的套件。清空只要約 2 毫秒，第二張圖表約 0.2 秒。
  - 只有在逾時、停止或當掉時，才重建 Worker。
  - `/input` 由每次 `mount` 整批替換。
- **擋下的檔案類型**：
  - 與標準模式的清單相同（`file-type-registry.js`），差別在壓縮檔：Python 能做出真正的壓縮檔，所以壓縮檔在進階模式可以交出。
  - 程式碼檔（.js、.sh 等）和標準模式一樣可以交出。
  - 有測試檢查兩份清單一致。
- **進度**：Worker 回報累計的下載位元組數，而不是百分比，因為總量要看程式匯入哪些套件才知道。從快取讀取的部分不計入。B2 的進度文字會改用「已下載 N MB」。

### 驗證（Chrome，開發伺服器；app 在 localhost、沙盒在 127.0.0.1）

- **載入**：第一次下載 12.3 MB，1.7 秒就緒；之後只下載 114 KB 的套件清單，約 2.6–3 秒就緒。
- **功能**：
  - pandas 與 matplotlib 可以使用，中、日、韓文字的圖表都正確，字重是一般字重。
  - `/input` 裡上傳的 CSV 讀得到。
  - python-docx、python-pptx、openpyxl、fpdf2、pypdf 都做得出檔案，也讀得回去。
- **§8 的攻擊測試（13 項全部失敗）**：
  - `js.fetch`、`js.self`、`js.parent` 不存在；`pyodide.http` 的 pyfetch 與 open_url、`urllib`、`socket` 都連不出去。
  - 用 JS 的 `Function` 建構子逃出去時，被 CSP 以 EvalError 擋下；`run_js` 無法使用。
  - 用 `loadPackage` 載入外部網址被拒絕。
  - 掃描 `pyodide_js` 底下的物件，找不到任何 postMessage、XMLHttpRequest、location 或 importScripts。
- **資源限制**：
  - 無窮迴圈在設定的時限內被中止，1.7 秒後就有新的環境。
  - 配置大量記憶體時只出現 MemoryError，環境可以繼續用。
  - 30 MB 的檔案被擋下，其他檔案照常收集。
  - 按「停止」1.5 秒內生效。
- **網路不穩時**：曾經遇到瀏覽器連到 CDN 很慢，pillow 下載失敗。程式回報了 Pyodide 的錯誤訊息，沒有卡住。這類失敗在 B2 依 §2.3 處理。
- **自動測試**：`tests/sandbox/` 共 18 項，其中執行相關的測試用真的 Pyodide 核心在 Node 執行，不需要連網。

### 尚未驗證（要等部署後）

- ~~`run.noureon.com` 的 HTTPS 憑證、強制 CSP、轉址、`frame-ancestors`~~：2026-09-28 部署後已確認。
  - 沙盒頁面回傳強制 CSP，沒有 `X-Frame-Options`。
  - `run.noureon.com/` 會轉到 noureon.com，`noureon.com/sandbox/` 會轉到 run.noureon.com。
  - 主站 CSP 的 `frame-src` 已包含 run.noureon.com。
  - 其他網站無法嵌入沙盒，靠的是 `frame-ancestors`，但還沒有用其他網站實際試過。
- Safari 與 iPhone（記憶體、模組 Worker、Service Worker）。
- 手機寬度下的進度顯示要等 B2 有介面後才能驗證。

## B2 實作紀錄（2026-09-28）

### 檔案

| 位置 | 內容 |
|---|---|
| `src/app/runtime/legacy-core/model-registry.js` | `TOOL_CALLING_MODEL_IDS`、`NON_TOOL_CALLING_MODEL_IDS`、`modelSupportsToolCalling`；有測試要求每個文字模型都要明確列在其中一份 |
| `src/app/legacy-runtime/features/tool-call-formats.js` | 三家供應商的工具格式：送出工具、把前幾輪送回、解析串流中的工具呼叫（Gemini 的 parts 與簽章原樣保留；OpenAI 相容格式依 index 組合參數片段，並保留 `reasoning_details`） |
| `stream-api-call.js` | 多了 `tools`、`toolTurns`、`onResponseComplete` 三個選項；Gemini 改為讀取所有 parts（不顯示 thought）；錯誤附上 HTTP 狀態碼；送給模型的歷史會把執行紀錄換成一行摘要 |
| `src/app/runtime/sandbox/sandbox-reply.js`（延後載入） | 工具迴圈：每則回覆最多執行 10 次；清空環境、執行、把結果回傳給模型；停止、載入失敗、兩次當掉與 Gemini 搜尋衝突時的處理 |
| `src/app/runtime/sandbox/sandbox-guidance.js`（延後載入） | `run_python` 工具定義與提示詞 |
| `src/app/runtime/sandbox/file-mode.js` | 對話選擇的模式、這則回覆能不能用進階模式與原因、B3 前的預覽開關、「Python 已下載」標記 |
| `src/app/runtime/sandbox/sandbox-texts.js` | 5 種語言的介面文字（含七種原因） |
| `src/app/ui/sandbox/sandbox-run-block.js`、`sandbox-run-view.js`、`src/styles/sandbox-run.css` | 存在回覆文字最前面的執行紀錄區塊、「已執行程式 N 次」收合列、執行中的狀態列、改用標準模式的灰字 |
| `single-model-response-lifecycle.js` | 進階模式的回覆改走工具迴圈；狀態列放在回覆內容的上方；完成後把紀錄區塊加在回覆最前面，並重畫一次 |
| `deck-design-picker.js`（`.css`）、`deck-design-control.js` | 「設計」選單最上方的「製作方式：標準｜進階」 |
| `settings-vision-check-control.js` 與設定相關檔案 | 設定頁「新對話的製作方式」（`config.fileModeDefault`，預設 `advanced`），包含匯入與匯出 |

### 與設計不同或補充的地方

- **執行紀錄存成回覆文字的一部分**：
  - 形式是 ```` ```noureon-run ```` 區塊，內容是一行 JSON，放在回覆最前面，沒有另外開訊息欄位。所以同步、匯出、P2P 都會自動帶著它，做法和檔案區塊相同。
  - 顯示前先抽出來，畫成收合列。
  - 送給模型、記憶、標題與搜尋的只有一行摘要：跑了幾次、產生了哪些檔案。
  - 每一步保存標題、程式碼、輸出（最多 5 萬字）、錯誤、產生的檔名與大小，不保存檔案內容；檔案內容由 B3 另外存。
- **執行中的狀態**：顯示在回覆內容上方的一行（轉圈加文字），依序是「正在準備 Python 環境」「已下載 N MB」「正在執行程式（第 N 次）：標題」「正在根據執行結果繼續」。完成後由收合列取代。
- **「已改用標準模式」只在需要時顯示**：只有訊息看起來和檔案或資料有關（`mayNeedFileGuidance`），或附有檔案時才顯示，以免每則一般對話都多一行。
- **模型理事會**：理事會走另一條回覆流程，所以理事會的回覆裡沒有提示。「設計」選單會把進階模式設成無法點選，並寫出原因「模型理事會不支援進階模式」。
- **B3 完成前的預覽開關**：產生的檔案要到 B3 才能下載，所以在那之前，正式站上的進階模式預設不出現：選單沒有「製作方式」、設定頁沒有預設值，回覆也一律走標準模式。
  - 開發環境一律開啟。
  - 正式站在網址後面加上 `?advanced-mode=on` 就會在這台裝置開啟，`?advanced-mode=off` 關閉。
  - **2026-09-28 B3 推送後，使用者決定立刻對所有人開放**，預覽開關已經移除：所有人都看得到「製作方式」，新對話預設為進階。還沒用真實模型驗證，有問題時再修正推送。
- **Gemini 同時開網路搜尋**：兩個工具一起送出。如果 Gemini 在第一次請求就回 400，就改成不帶 Python 重送，並記錄 `search-conflict`。實際會不會衝突，要等真實金鑰實測。

### 驗證

- **自動測試**：`tests/sandbox/` 共 34 項，涵蓋：
  - 三家供應商的工具格式與串流解析。
  - 工具迴圈：執行並回傳結果、10 次上限、載入失敗、停止、Gemini 搜尋衝突。
  - 模式判斷與預覽開關。
  - 5 種語言文字齊全。
  - 執行紀錄的儲存、摘要與顯示。
- **瀏覽器（開發伺服器）**：
  - 用真的 `stream-api-call.js`、假的 Gemini 回應和真的沙盒跑完整流程：模型要求執行、沙盒用 pandas 計算並用 matplotlib 畫圖（5.2 秒）、結果回傳給模型。
  - 第二次請求有把帶 `thoughtSignature` 的 parts 原樣送回，`functionResponse` 裡也有輸出與檔案。
  - 用 app 自己的 Markdown 渲染器畫出收合列與展開內容。
  - 「設計」選單的「製作方式」：可以切換、不會關閉選單；模型不支援時，進階無法點選，並顯示原因。
- **npm 檢查**：`npm test` 共 1980 項全部通過；`build`、`check:sizes`、`check:legacy-runtime`、`npm audit --omit=dev`（0 個漏洞）也都通過。

### 待使用者驗證（需要登入與真實金鑰）

- 三家供應商各跑一次，由使用者操作，我不輸入金鑰：
  - Gemini：含同時開啟網路搜尋。
  - OpenRouter：例如 Claude 或 GPT。
  - NVIDIA：確認四個模型能不能用工具，可以的話就移到支援清單。
- 在真的對話畫面確認：
  - 執行中的狀態列、收合列、停止按鈕。
  - 程式碼有上色。
  - 不支援的模型會顯示「已改用標準模式」。
  - 手機寬度下顯示正常。

## B3 實作紀錄（2026-09-28）

### 與設計不同的地方

- **檔案存在回覆訊息裡**（取代 §5.1 另外用 `generatedFile:` 鍵存進 IndexedDB 的做法）：
  - 每個產出檔案都是訊息的一個 part：`{ sandboxFile: { id, name, mimeType, size, data } }`，其中 `data` 是 base64，做法和使用者上傳的附件（`inlineData`）相同。
  - 所以檔案會跟著對話一起保存、匯出、P2P 分享。
  - 雲端同步沿用現有的資產機制，不需要新增程式：同步時會把 `mimeType` 旁邊的 `data` 上傳成雲端資產，另一台裝置下載後還原成 base64。上傳上限是 Supabase 單檔 50 MB，我們每則回覆最多 50 MB。
  - 同步的比對資料（shadow row）只保留中繼資料，不放檔案內容，做法和附件相同。
  - 送給模型的歷史訊息只會讀 text 與 inlineData，所以這些 part 不會被送出去。
- **執行紀錄裡的檔案有 id**：執行紀錄的每個檔案多了 `id`，指向存放它的 part。同一個檔名被寫了好幾次時，只保存最後一次的版本。卡片放在回覆最後，並和標準模式的檔案一起算進「全部下載（ZIP）」。
- **「stored」產生器**：`file-generators.js` 多了一種 `stored`，直接交出存好的檔案內容。所以下載、ZIP、iOS 分享和預覽都沿用原本的程式。
- **預覽**：
  - Word 用 docx-preview，PDF 用 PDF.js，HTML 用沙盒 iframe，文字、CSV、Markdown 都照原本的方式。
  - 圖片直接顯示。
  - Excel 用新的 `xlsx-reader.js` 讀取：儲存格值、粗體與斜體、填色、對齊、數字格式（千分位、小數、百分比、日期）、公式、欄寬、合併儲存格、凍結窗格、篩選。圖表不讀取。
  - 自由製作的 pptx、壓縮檔等無法預覽的格式，顯示「此格式暫不支援預覽，請直接下載」。
  - 二進位檔案沒有「原始內容」可切換，所以只有版面預覽，也沒有切換按鈕。
- **檔案類型**：`.zip`、`.gz` 等壓縮檔在標準模式是擋下的，因為模型只能寫出文字，做不出真正的壓縮檔；Python 做得出真正的壓縮檔，所以在進階模式允許。執行檔與巨集檔兩種模式都擋下。
- **`/input`**：放入對話中所有還在本機的附件，以及先前進階模式產生的檔案。同名時保留較新的版本。
  - 提示詞會列出這些檔案的檔名、類型與大小。
- **「檔案不在這台裝置上」與「重新執行」**：
  - 檔案內容不在時卡片會顯示這個狀態，例如雲端副本下載失敗。
  - 「重新執行」會依序重跑這則回覆保存的程式碼，同時放入目前對話的其他檔案。
  - 重跑出來的檔案會寫回原本的 part 並存檔，卡片也會更新。

### 驗證

- **自動測試**：`tests/sandbox/sandbox-files.test.js` 共 8 項，涵蓋：
  - 產出轉成 part、同名時保留最新版、id 對應。
  - 可下載、不在裝置上、擋下三種狀態。
  - `stored` 產生器。
  - `/input` 的收集。
  - 卡片、ZIP、「重新執行」按鈕。
  - 訊息 part 的順序。
  - 用 Node 版 Pyodide 執行 openpyxl 產生真的 xlsx，確認讀取器的結果。
- **npm 檢查**：`npm test` 共 1988 項全部通過；`build`、`check:sizes`、`check:legacy-runtime`、`npm audit --omit=dev`（0 個漏洞）也都通過。
- **瀏覽器（開發伺服器，真的沙盒，假的模型回應）**：
  - 上傳的 CSV 放進 `/input` 後讀得到；openpyxl、matplotlib、pandas 產生的 xlsx、png、csv 都變成卡片，檔案大小正確，也有「全部下載（ZIP）」。
  - Excel 預覽的表頭有篩選箭頭與粗體，百分比格式正確。
  - png 預覽顯示正確。Markdown 可以預覽；pptx 與 zip 顯示無法預覽。
  - 把 png 的內容拿掉，卡片變成「檔案不在這台裝置上」，按「重新執行」後重新產生並恢復成可下載。

### 待使用者驗證（需要登入與真實金鑰）

- 在真的對話中，重新整理後檔案卡片仍然在。
- 開啟雲端同步後，在另一台裝置能下載檔案。
- 臨時對話中的檔案，關閉後不會留下來。
- 手機上的下載與預覽。
- 與 B2 的三家供應商測試一起做。

## B4 實作紀錄（2026-09-28）

### 做法

- **`noureon` 模組**：沙盒啟動時把 `noureon.py` 放進 `/opt/noureon`，並加到 `sys.path`。
  - `noureon.save_document(名稱, content)` 把內容寫到 `/output/.noureon/名稱`。
  - `content` 就是標準模式 ````file 區塊裡的內容：Markdown 文字，或 dict / list（轉成 JSON）。numpy 與 pandas 的數值會轉成一般數字。
  - 只接受 docx、pptx、xlsx、pdf 四種格式。
- **app 端的處理**（`sandboxDocumentBlocks`）：
  - 把 `.noureon/` 裡最新版的每份文件，轉成回覆最後的 ````file 區塊。圍欄會比內容裡最長的反引號還長，所以不會被提早結束。
  - 之後完全走標準模式：範本強制套用、設計系統、字型嵌入、預覽、歷史壓縮與看圖檢查。這些文件不會另外存成二進位檔。
- **圖片**：Python 存在 `/output` 的圖用 `asset:檔名` 引用。
  - 簡報：`document-spec.js` 本來就會讀 `asset:`，現在由圖片解析器找出同一則回覆裡的沙盒檔案，轉成 data URL。
  - **Word 與 PDF 新增圖片**：一個段落如果只有一張 `upload:N` 或 `asset:名稱` 的圖片，就會成為圖片區塊。寬度不超過文字寬度，圖片的說明文字當成圖說。找不到圖時，改成斜體的說明文字。網路圖片一律不抓。
  - 被文件引用的圖片不會另外出現檔案卡片，因為它是文件的一部分，但仍然存在訊息裡，供重新產生時使用。
- **提示詞**：
  - Word、PPT、Excel、PDF 優先用 `noureon.save_document`，數字放進原生圖表。
  - matplotlib 的圖在簡報裡用 `split` 版型，並設定 `fit: contain`，因為 `image` 版型是滿版照片，會裁切圖表。
  - 只有設計系統做不到時，例如編輯使用者上傳的檔案、合併 PDF，才直接用 python-docx 或 python-pptx。
- **沒做的**：§6 原本提到的 `noureon.design()`。範本強制套用與 AI 自適應都由標準模式的流程處理，Python 不需要知道目前選了哪個設計。

### 驗證

- **自動測試**：`tests/sandbox/sandbox-documents.test.js` 共 5 項：
  - 用 Node 版 Pyodide 執行 `noureon.save_document`，包括拒絕 .exe。
  - 文件轉成檔案區塊，而且不會同時存成檔案。
  - 找出文件引用的圖片名稱，包括經過 URL 編碼的寫法。
  - 圖片段落轉成圖片區塊。
  - Word 與 PDF 會嵌入圖片，找不到圖時改成說明文字。
- **npm 檢查**：`npm test` 共 1992 項全部通過；`build`、`check:sizes`、`check:legacy-runtime`、`npm audit --omit=dev`（0 個漏洞）也都通過。
- **瀏覽器（真的沙盒，假的模型回應）**：
  - pandas 計算、matplotlib 畫圖後，用 `save_document` 交出 Word 與簡報。
  - 回覆最後只有兩張設計系統的卡片，圖表圖片沒有另外出現。
  - Word 預覽有標題、表格和圖表圖片；簡報預覽的圖片也有正確顯示。
- **Office**：用 Word 開啟含 `asset:` 圖片的 docx 並匯出 PDF（2 頁，圖片與圖說正確）；用 PowerPoint 開啟 split 版型加 contain 的 pptx 並匯出 PDF（2 張，圖在文字右側）。兩者開啟時都沒有出現錯誤。

## B4b-1 實作紀錄（2026-09-29）

使用者說明方案 B 要的是像 GPT 一樣不受限制地做出 Word、PDF、PPT。B4 的做法（一律交給設計系統）改成「預設自由創作，選了範本才套範本」。

### 做法

- **提示詞**（`sandbox-guidance.js`）：預設告訴模型「版面、顏色、字型、圖形都由你決定，用 Python 存到 /output，不要寫成 ````file 區塊」，並附上專業設計的簡短要求。只有「設計」選單裡簡報或 Word／PDF 選了範本（不是 auto）時，才加上該類檔案改用 `noureon.save_document` 的規則。
- **字型**：
  - 沙盒有 `/fonts` 12 個檔案：Inter、Noto Sans TC、Noto Serif TC、Noto Sans SC、Noto Sans JP、Noto Sans KR 各有 Regular（400）與 Bold（700）。字型由 app 端用 HarfBuzz 固定字重並改名後傳進沙盒。
  - matplotlib 用這些字型（含中日韓後備）；reportlab（新加入，5.0.1）與 fpdf2 可以用 `TTFont("NotoSansTC", "/fonts/NotoSansTC-Regular.ttf")` 註冊。
  - `noureon.use_fonts(物件, latin, east_asian)`：python-docx 的文件、樣式、段落、run；python-pptx 的文字框、段落、run。Word 會清掉樣式裡的佈景主題字型屬性（`asciiTheme` 等，否則會蓋過指定的字型），一併處理文件預設值與表格樣式的條件格式。
- **自動嵌入字型**（`office-fonts.js`）：回覆結束、存檔之前，掃描自由做出的 .docx、.pptx 用到的字型（`w:ascii/eastAsia`、`a:latin/ea/cs`），只嵌入 app 有的字型，並依實際用到的字元做子集。找不到的字型（Calibri、微軟正黑體）交給閱讀者的電腦。失敗時保留原檔。`.noureon/` 交給設計系統的文件不處理（它們自己會嵌入）。

### 驗證

- **自動測試**：`tests/sandbox/sandbox-free-design.test.js` 4 項（提示詞、字型清單、掃描、嵌入略過與失敗保留原檔）；`sandbox-protocol.test.js` 的套件清單加入 reportlab。`npm test` 共 1996 項通過；`build`、`check:sizes`、`check:legacy-runtime`、`npm audit --omit=dev`（0 個漏洞）也通過。
- **瀏覽器（真的沙盒）**：範例程式同時做出 Word（標題、表格）、PPT（文字加原生圖表）、PDF（reportlab 表格）。嵌入後 docx 36,976 → 102,380 位元組，pptx 34,755 → 97,654 位元組，耗時 79 毫秒；PDF 不動。
- **Office**：Word 與 PowerPoint 開啟都沒有錯誤；PPT 的 `presentation.xml` 有 Inter 與 Noto Sans TC 兩個 `embeddedFont`，Word 的 `fontTable.xml` 也有這兩個。重跑後 Word 樣式裡不再有佈景主題字型屬性。
- **還沒做**：自由做出的 PPT 沒有卡片預覽（B4b-2 的 PPTX 讀取器）；Word 預覽與看圖檢查的接入留到 B5。

## B4b-2 實作紀錄（2026-09-29）

自由做出的 PPT（python-pptx、PptxGenJS 或 PowerPoint 存的檔）原本沒有卡片預覽。現在用自己寫的 PPTX 讀取器，讓「預覽」和設計系統的簡報看起來一樣。

### 做法

- **讀取**（`src/app/ui/sandbox/pptx-reader.js`，載入時才用）：
  - 投影片大小照檔案（16:9、4:3 都可以），寬度固定 960，1 pt 換算成對應的像素。
  - 繼承和 PowerPoint 一樣：簡報預設文字樣式 → 母片文字樣式與版面配置的預留位置 → 該形狀本身。位置與大小沒寫時，從版面配置、母片的預留位置取。顏色經佈景主題與母片的顏色對照（`pptx-styles.js`，含 lumMod、lumOff、tint、shade、alpha）；形狀樣式（`p:style`）的填色、外框、文字顏色也會用。
  - 內容：文字方塊（多個 run 的大小、粗體、斜體、底線、顏色、字型；項目符號與自動編號、縮排、行距、段落間距、垂直對齊、`normAutofit` 的縮放）、常見圖形（矩形、圓角矩形、橢圓、三角形、箭頭、六邊形…）與自訂路徑、線條與連接線、圖片（含裁切）、表格（合併儲存格、內建表格樣式的近似）、群組（座標轉換）、背景（純色、漸層、圖片）、母片與版面配置上的裝飾。
  - 圖表（`pptx-chart-reader.js`）：直條圖、橫條圖、折線、區域、圓餅、環圈、散布、雷達，用檔案裡快取的數值；單一數列且沒關掉自動標題時，用數列名稱當標題。不支援的圖表改畫虛線框。
- **排版**（`free-slide-layout.js`）：用量測器斷行，行距、段落間距與項目符號都算好；表格列高會長到容得下文字，並轉成矩形與文字，所以繪圖程式不用新增表格類型。
- **繪圖**：`slide-preview.js` 只加了一點：run 自己的字型、大小、斜體、底線；旋轉；項目符號自己的字元；圖片的伸展與裁切；不同的投影片比例。圖表沿用 `drawChart`，環圈的中空大小 0 就是圓餅。
- **字型**：檔案用的字型不一定在這台電腦上。每個字型的預覽順序是「檔案寫的名稱 → app 內建的相近字型 → 通用字型」（Calibri 對應 Inter；中日韓文字對應對應的 Noto）。內建字型只載入這份簡報用到的（`registerFace`，和設計系統簡報共用）。
- **接上**：`sandbox-file-blob.js` 對 .pptx 建立 `blob.presentation`；檔案卡片不再關閉頁面預覽；預覽下方的說明改成「這是 Python 做出的簡報的預覽…以下載的檔案為準」（五種語言，`freeSlidePreviewNote`）。
- **沒做的**：SmartArt、3D、動畫、母片的漸層填色樣式（`fillRef` 只取顏色，PowerPoint 會畫漸層）、藝術字效果、陰影。EMF、WMF 圖片只顯示佔位框。

### 驗證

- **自動測試**：`tests/sandbox/pptx-reader.test.js` 共 7 項，用真的 python-pptx 做的檔案（`tests/sandbox/fixtures/free-deck.pptx`，4:3，含預設佈景主題、標題與內容預留位置、項目符號、文字 run、圓角矩形、箭頭、橢圓、連接線、表格、圖片、群組、直條圖與圓餅圖）：預留位置繼承、字級換算、形狀與表格、圖表數值、繪圖後的 SVG（文字、項目符號、圖片、長條、圓餅）、非簡報檔被拒絕。`npm test` 共 2003 項通過；`build`、`check:sizes`、`check:legacy-runtime`、`npm audit --omit=dev`（0 個漏洞）也通過。
- **PowerPoint 對照**：同一份檔案用 PowerPoint 匯出 PNG，和預覽並排看第 3、4 張（自由排版、圖表），版面、文字位置、表格、圖表大致相符；差異是形狀的漸層填色（PowerPoint 畫漸層，預覽是單色）。
- **設計系統的簡報**：用同一個讀取器讀 PptxGenJS 做的 19 張投影片簡報（poster、swiss、bauhaus…，共 11 份），全部讀得進來；poster 前 6 張的預覽外觀看起來符合該範本（沒有逐張和 app 自己的預覽比對）。
- **給 B5**：`slide-rasterizer.js` 把投影片固定畫成 960 × 540，4:3 的自由簡報要用 `slide.width`、`slide.height` 決定尺寸。

# AI 可下載檔案設計（方案 A：規格轉檔 ＋ 最終樣式預覽 ＋ 方案 B：瀏覽器內 Python 沙盒）

**日期：** 2026-09-26

**狀態：** A1、A2、P1、D1、A4、A4b 已上線；V1（看圖檢查）已實作並通過模擬模型的瀏覽器測試與 PowerPoint 開檔，進度依使用者要求改為通知，本次已獲推送 main 的授權；真實模型與正式網站仍待驗證。W2（Word 套用設計系統）已上線。A3（Excel）已上線。A5（PDF）已上線。A6（精修）已上線，手機實機下載由使用者驗證。方案 B 的詳細設計（B0）已由使用者確認，B1（沙盒執行環境）已完成、待推送：[`2026-09-28-python-sandbox-design.md`](2026-09-28-python-sandbox-design.md)。方案 B 一次只做一個階段，每個階段完成後回報，由使用者決定是否推上 main。

## 決策紀錄（2026-09-26，與使用者確認）

1. **方案 A 全部做完**（Word、Excel、PPT、PDF 與精修）。A 是所有模型都能用的基本路徑，也是不支援工具呼叫的模型唯一的路徑。
2. **方案 B 在使用者的瀏覽器內執行**（Pyodide），不使用伺服器沙盒：沒有運算費用、檔案不離開使用者裝置，符合 local-first 的定位。
3. **順序：** 先做預覽（P1），再做剩下的 A（A3 → A6），最後才做 B。
4. **B 做好之後，由使用者選擇 A 或 B**（見「模式選擇與自動切換」）。使用者選 B、但 B 無法使用或模型不支援時，自動改用 A，而且**一定要在畫面上顯示已切換**，不可以默默改用。
5. 每個格式的「最終樣式預覽」跟著它的產生器一起做：Word 在 P1；Excel 在 A3；PPT 在 A4；PDF 在 A5（在 A5 之前 app 還產生不出 PDF，檢視器無法實際驗證，所以原本口頭說 P1 一起做的 PDF 預覽改到 A5）。

2026-09-27 追加（參考使用者與 GPT 的討論後確認）：

6. **所有格式改以「DocumentSpec＋設計系統」為基礎**：AI 描述內容、設計方向與每頁版型，由程式用設計零件（版型、元件、設計參數）組出檔案，不再是固定模板。Word 也會補上設計參數，向下相容現有寫法。方案 B 產出的也是 DocumentSpec＋素材，與 A 共用同一套轉檔程式。
7. **PPT 提前到 Excel 之前**：順序改為 PPT → Excel → PDF。
8. **製作前選擇設計**（2026-09-27 A4b 時改定，取代原本「AI 給三組方向、產生後挑選」）：輸入框的「簡報設計」按鈕，預設「AI 自適應」，也可以指定 20 套範本之一；請 AI 做簡報前就決定好，模型寫簡報時直接套用。簡報做好後不再提供設計面板。與 B 完成後的「A / B 模式選擇」一起規劃時，這顆按鈕維持在同一排。
9. **產生後的檢查分兩層**：程式檢查（文字塞不下、超出頁面、對比不足、版型重複、標題孤立）每次都做；**看圖檢查只對支援看圖的模型開放**，其他模型不顯示這個功能，預設每份最多修正一輪。

2026-09-27 D1 提案確認（第一版的 8 套風格被退回，第二版照建議通過）：

10. **20 套範本，參考各大廠的實際設計**：研究 Pitch、Figma 社群、Canva、Microsoft PowerPoint、Apple Keynote、Google（Material 3、簡報）、IBM Carbon 與顧問公司（McKinsey、BCG）的範本與規範後重做。參考來源只記在文件裡，範本名稱不用品牌名。
11. **範本只是參數的預設值**：設計是一組 25 項參數（色彩、字體、版面、裝飾、資料與圖片；其中輔色可省略）。「AI 自適應」讓寫簡報的模型依當下需求直接設定每一項，不是從範本裡挑一套（A4b，見決定 8）。
12. **字型放進檔案**：用開源字型（思源黑體、思源宋體、仙人掌明體、霞鶩文楷、jf 粉圓與多套西文字型）子集化後嵌入 PPTX，讓 PowerPoint 打開的樣子與預覽一致。A4 第一步先用使用者電腦上的 PowerPoint 做可行性測試；不可行就退回 Office 內建字型。「通用相容」範本永遠不嵌入字型。**A4 實測結果：可行**（編輯畫面與 PDF 匯出都使用嵌入字型）；圖表文字例外，一律用系統字型。
13. **5 種語言都適用**：範本名稱與說明配合 app 的 5 種介面語言；檔案內容依「文件語言」選字型（含西里爾字母）、標點與數字格式，以及程式自動加上的文字。
14. **圖片**：AI 不生成圖片，只預留可替換的圖框；使用者上傳的圖片照常使用。**圖示**：約 30 個線條圖示，在 A4 一起做。**比例**：只做 16:9。

## 問題陳述

使用者希望對 AI 說「給我 PDF / Word / Excel / PPT 檔」時，回覆中直接出現可點擊下載的檔案。Noureon 是純前端、local-first 的應用，三家供應商（Gemini、OpenRouter、NVIDIA）都只以純文字串流回應，目前沒有任何 tool calling。ChatGPT 與 Claude 的做法是讓模型在伺服器沙盒執行程式產生檔案；那需要沙盒基礎設施，而且檔案會隨容器過期。

方案 A 讓模型輸出**結構化的檔案規格文字**，由瀏覽器在使用者點擊時把規格轉成真正的檔案。

## 目標

- 支援 docx、xlsx、pptx、pdf，以及所有純文字類格式（txt、md、csv、json、html、程式碼等）。
- 三家供應商、所有模型都能使用，包含免費小模型。
- 檔案永不過期：規格就是訊息文字，跟著對話保存、雲端同步、匯出與 P2P 傳輸。
- 串流中即顯示「檔案產生中」卡片，不露出原始規格。
- 產生器全部延遲載入；沒有使用檔案功能的使用者，首次載入與 Service Worker 預快取的成本為零增加。
- 產出的檔案必須能被 Microsoft Office 正常開啟、不觸發修復提示。
- 中文（繁體）排版品質達到可直接交付的程度。

## 非目標

- 在伺服器執行模型撰寫的程式。方案 B 只在使用者的瀏覽器內執行。
- 把檔案上傳到第三方線上檢視器（例如 Office Online 檢視器需要公開網址）來做預覽。
- 產生可執行檔、捷徑或含巨集的 Office 檔（`.docm`、`.xlsm`）。
- 自動下載；所有下載都必須由使用者點擊觸發。
- 從網路抓取任意圖片放進檔案（CSP `connect-src` 本來就禁止）。

## 輸出協定

模型以一個專用 fenced block 輸出每個檔案：

`````text
````file 第三季營運報告.docx
---
title: 第三季營運報告
toc: true
---
# 第三季營運報告
正文使用 GitHub Markdown……
````
`````

- 開頭行：fence 字元 + `file` + 空白 + 含副檔名的檔名。檔案類型一律由副檔名決定。
- 建議外層使用四個反引號，以便內容可以包含一般的 ```` ``` ```` 程式碼區塊。
- 解析器同時容忍常見的變體：` ```file:名稱.ext `、` ```file name="名稱.ext" `、內文第一行 `name:` / `filename:`。
- 外層只寫三個反引號時，解析器會以巢狀深度啟發式處理：帶語言標籤的內層 fence 會加深一層，空白的關閉 fence 則減少一層。
- 檔案區塊在 **marked 解析之前**，就從原始文字中抽出。因為 marked 在遇到第一個內層 ```` ``` ```` 時就會提早關閉外層 fence，這和圖表流程（解析後的 `pre>code`）不同。

### 各類型的內容格式

| 類型 | 區塊內容 | 備援格式 |
|---|---|---|
| docx / pdf | GitHub Markdown，可加 front matter（`title`、`author`、`toc`、`orientation`、`pageSize`、`header`、`footer`）；只有 `\pagebreak` 的一行代表分頁；可內嵌 ```` ```chart ```` | — |
| xlsx | JSON：`{ "sheets": [{ "name", "columns", "rows", "freeze", "autoFilter", "merges" }] }`；儲存格可以是原始值，或 `{ "value", "formula", "format", "bold", "fill", "color", "align", "wrap" }` | 一或多個 Markdown 表格、CSV |
| pptx | DocumentSpec JSON：`{ "language", "design": { "preset" 或 25 項參數 }, "slides": [{ "layout", 內容欄位…, "notes" }] }`，見「設計系統與 DocumentSpec」 | Markdown：`#` 為封面與章節、`##` 為內容頁 |
| csv / tsv | 原始內容 | — |
| 其他文字 / 程式碼 | 原始檔案內容 | — |

## 使用者介面

- **檔案卡片**：依類型顯示彩色圖示、檔名、類型與內容摘要（例如「Word 文件 · 約 1,200 字」「Excel · 2 個工作表 · 120 列」「PowerPoint · 8 張投影片」），並提供「下載」與「預覽」按鈕。第一次產生後補上實際檔案大小。
- **狀態**：串流中（已接收字元數）、可下載、產生中（按鈕轉圈）、規格錯誤（顯示原因，並可複製原始內容）、內容不完整（串流被截斷或停止）。
- **預覽**：顯示檔案的最終樣子，詳見「最終樣式預覽」。文字與程式碼本身就是最終樣子，顯示原文。
- **多檔案**：同一則訊息有兩個以上的檔案時，額外提供「全部下載（.zip）」，使用現有的 jszip。
- **下載流程**：點擊時才產生，同一份內容快取已產生的 Blob（以內容雜湊為鍵）。iOS 獨立 PWA 無法可靠下載 blob，改用 `navigator.share({ files })`。
- 模型寫出 `sandbox:/mnt/data/…` 這類舊式假連結時，如果檔名對得上同一則訊息中的檔案卡片，就轉成觸發該卡片下載的連結；對不上就只保留文字。

## 最終樣式預覽

使用者要看到的是「下載後打開的樣子」，而不是規格原文。

- **原則：預覽的就是要下載的那個檔案。** 預覽與下載共用同一個產生結果（同一個 Blob 快取），所以預覽的內容與下載的檔案保證一致。方案 B 產出的檔案也走同一套預覽器。
- **瀏覽器內建預覽不夠用：** 瀏覽器只能原生顯示 PDF、圖片、網頁、純文字與影音，沒有任何瀏覽器能原生顯示 docx / xlsx / pptx；Android 版 Chrome 連 PDF 都無法在網頁內顯示。因此每個格式各用一個延遲載入的渲染器。
- **線上檢視器不採用：** Office Online 等服務需要把檔案放到公開網址，違反 local-first 與隱私承諾。

| 格式 | 渲染方式 | 階段 |
|---|---|---|
| docx | `docx-preview`（Apache-2.0，只依賴專案已有的 jszip）把檔案畫成一頁一頁，含紙張大小、邊界、頁首頁尾、表格、清單、圖片 | P1 |
| xlsx | 讀回產生的活頁簿，畫成有工作表分頁的表格（格式、合併儲存格、欄寬、凍結窗格） | A3 |
| pptx | 不用 pptx 渲染套件：直接把排版引擎的結果畫成 SVG，與寫進檔案的是同一份座標、字型與斷行；圖表依同一份原生圖表定義畫示意圖 | A4 |
| pdf | PDF.js（Apache-2.0），逐頁繪製，每種裝置（包含手機）顯示一致 | A5 |

共同行為：

- 對話框預設顯示「版面預覽」，可切換成「原始內容」（看規格或原始碼）。
- 開啟時顯示「正在產生預覽…」；渲染器或產生失敗時，自動退回原始內容，並說明原因。
- 頁面依對話框寬度等比例縮放，手機上也能看到整頁；縮放不影響文字清晰度。
- 渲染器與它的樣式只在第一次預覽時下載，放在獨立的 chunk，不計入啟動成本，也不被 Service Worker 預先快取。
- **預覽內容的安全處理：** 渲染後移除腳本與事件屬性；外部連結只允許 `http(s):`、`mailto:`，並在新分頁以 `noopener` 開啟；文件內部連結（例如目錄）只在預覽內捲動，不改動 app 的網址。方案 B 的檔案由模型寫的程式產生，更需要這一層。
- 預覽使用的是瀏覽器裝置上現有的字型；若裝置沒有文件指定的字型（例如 Mac 沒有 Calibri），會以相近字型顯示，行尾換行位置可能與 Word 略有不同。

### docx 版面預覽的實作（P1）

docx-preview 負責把 Word 結構轉成 HTML，但它有幾個缺口，都在 `previews/docx-page-preview.js` 補上：

| docx-preview 的缺口 | 補法 |
|---|---|
| 不會依內容高度自動分頁，一頁可以無限長 | 自行分頁：依紙張高度、邊界與頁首頁尾切頁；長段落在行與行之間切開（上下各至少兩行，同 Word 的遺留字元控制）；標題不留在頁尾；表格跨頁時重複標題列 |
| 頁碼欄位（PAGE / NUMPAGES）顯示空白 | 先把欄位換成佔位字元，分頁完成後填入「第幾頁 / 共幾頁」 |
| 數學公式：遇到沒有屬性的括號會當掉，重音（`\hat`）與同時有上下標（`x_i^2`）的內容會被丟掉 | 自己把 OMML 轉成 MathML（`previews/omml-to-mathml.js`），由瀏覽器原生繪製，字型用 Cambria Math |
| 行距：沒寫 `lineRule` 時被當成固定行高；倍數行距乘的是字級，而 Word 乘的是字型本身的行高 | 補上 `lineRule="auto"`，再依每段文字實際字型量出單行高度後乘上倍數 |
| 段落間距：CSS 會把上一段的「段後」和下一段的「段前」合併取大值 | 改成相加，與 Word 相同 |
| 實驗性的定位點計算會算錯縮排段落，而且在分頁後 500 ms 才執行 | 關閉，定位點改以一個全形空白寬度呈現，版面在分頁後不會再變動 |

安全與隔離：預覽畫在 Shadow DOM 裡，文件自帶的 CSS 影響不到 app；移除腳本、事件屬性與外部資源；外部連結另開分頁，目錄等內部連結只在預覽內跳轉。

實測（2026-09-27）：同一份含目錄、表格、公式、分頁符號、30 個長段落與 60 列表格的文件，Word 為 8 頁，預覽也是 8 頁，各頁起點相差在一個段落以內；差異主要來自中英混排時瀏覽器行高約比 Word 高 5%。

## 提示詞注入

- 跟圖表一樣採**按需注入**：當前使用者訊息包含檔案類的意圖字詞（五種 UI 語言：檔案、下載、匯出、Word、Excel、PPT、PDF、CSV、簡報、試算表、file、download、export、spreadsheet、slides……），**或前一則模型回覆中已有檔案區塊**（例如「第三頁改一下」這類後續修改）時才注入。
- 通用規則之外，只加入被提到的類型的詳細 schema，控制 token 用量。
- 規則明確要求：不要輸出 base64、不要說自己無法建立檔案、不要連結到 sandbox 路徑、不要在區塊外重複檔案內容。

## 送給模型的歷史壓縮

- 送出請求時，每個檔名只保留最新版本的完整區塊；較舊的版本改成一行說明。儲存的訊息本身維持不變。
- 記憶擷取、歷史索引與標題摘要讀到的檔案區塊，會先壓縮成「檔名 + 內容摘要」，避免大量 JSON 或長文件進入記憶。

## 資安原則

- **副檔名政策**：可執行檔、捷徑、登錄檔等（`.exe .com .scr .msi .dll .lnk .hta .reg .jar .pif .cpl .msc .app .apk .docm .xlsm .pptm`）一律拒絕。腳本類（`.bat .cmd .ps1 .vbs .js .wsf .sh .command .py`）允許下載，但卡片上顯示警告。
- **檔名清理**：移除路徑分隔字元與控制字元、`<>:"/\|?*`、首尾的點與空白；避開 Windows 保留名稱；限制長度；並確保副檔名與類型一致。
- **試算表公式**：一般文字儲存格絕不當作公式；公式只能透過明確的 `formula` 欄位。外部資料函式（`WEBSERVICE`、`FILTERXML`、`RTD`、`CALL`、`REGISTER.ID`、`EXEC`）、DDE 樣式（`|`）與外部活頁簿參照會被拒絕。CSV 中以 `= + - @` 開頭、但不是數字的儲存格，會加上 `'` 前綴。
- **大小上限**：單一規格文字、試算表總儲存格數、投影片數都設上限，避免耗盡記憶體。
- **連結**：產生的檔案只接受 `http(s):` 與 `mailto:` 連結。
- 下載連結只由應用程式的程式碼建立；模型寫的 Markdown 連結維持 DOMPurify 既有的限制。

## 函式庫選擇（2026-09-26 實測）

| 格式 | 函式庫 | 壓縮後 min / gzip | 說明 |
|---|---|---|---|
| docx | `docx` 9.x（MIT） | 397 KB / 111 KB | 與專案共用 jszip |
| xlsx | `write-excel-file` 4.x（MIT） | 58 KB / 14 KB | 支援公式、樣式、合併儲存格、凍結窗格、欄寬、多工作表、圖片，並有 feature 擴充 API |
| pptx | `pptxgenjs` 4.x（MIT） | 266 KB / 92 KB | 支援原生圖表、表格與備註；需要 `overrides` 修補 `image-size`（瀏覽器版本不會使用它） |
| pdf | `pdfmake` 0.3.x（MIT） | 951 KB / 337 KB | 內建排版（表格、清單、頁首頁尾、目錄、SVG），透過 fontkit 做字型子集化，中文換行正確 |

排除的選項與原因：

- `exceljs`：依賴有漏洞的 `uuid`，CI 的 `npm audit` 會失敗。
- SheetJS 的 npm 版本：有已知漏洞。
- `pdf-lib` + fontkit：1.1 MB / 491 KB，而且沒有排版能力。
- `jsPDF`：沒有排版引擎，需要自己寫換行、分頁與中文避頭尾。
- `mathml2omml`：LGPL 授權。

### PDF 中文字型

實測結果：使用 Windows 內建的 `NotoSansTC-VF.ttf` 時，產出的 PDF 只有 17 KB（子集化成功），換行與避頭尾也都正確。但**變數字型會以最細的字重輸出，粗體也無效**，所以必須使用靜態的 Regular / Bold TTF。

- 字型：Noto Sans TC 的 Regular 與 Bold（OFL 授權），從官方變數字型以 fonttools instancer 產生靜態字重並移除 hinting 以縮小體積；拉丁、西里爾文件使用 Noto Sans；等寬字使用 Noto Sans Mono。
- 字型放在 `src/assets/fonts/`，以 Vite `?url` 匯入，產生帶雜湊的 `/assets/…` 路徑，Service Worker 會以 cache-first 在第一次使用時快取。
- 只有文件包含 CJK 字元時才下載中文字型。
- 需要把 OFL 授權檔一起放進專案。

## 建置、快取與大小預算

- 在 `vite.config.js` 的 manualChunks 中明確建立 `vendor-docx`、`vendor-pptx`、`vendor-xlsx`、`vendor-pdf`，連同它們的傳遞相依，避免被併入會及早載入的 `vendor` chunk。
- Service Worker 的 `precacheCurrentShell` 排除這些檔案產生器 chunk，改在第一次使用時由 cache-first 流程快取。
- `check-file-sizes.mjs` 新增一組明確的「按需檔案產生器 chunk」預算；「最大 JS chunk」預算不再計入這些 chunk。
- 在 `package.json` 用 `overrides` 把 `image-size` 固定到已修補的 2.x 版本。

## 模組結構

```
src/app/ui/files/
  file-block-protocol.js         抽取區塊、找出串流中尚未關閉的區塊、解析開頭行與 front matter
  file-type-registry.js          副檔名 → 類型、MIME、標籤、圖示、產生器載入器、政策
  file-name-policy.js            檔名清理與副檔名政策
  file-card-renderer.js          以 DOM API 建立卡片（不經過 innerHTML 字串）
  file-card-interactions.js      事件委派：下載、預覽、ZIP、Blob 快取、分享備援
  file-authoring-guidance.js     意圖偵測與提示詞（延遲載入）
  file-history-compaction.js     API 歷史與記憶用的壓縮
  file-preview-dialog.js         預覽對話框（版面預覽 / 原始內容）
  previews/docx-page-preview.js  docx 版面預覽：docx-preview 繪製 + 自動分頁 + 頁碼 + Word 行距 + 安全處理（P1）
  previews/omml-to-mathml.js     Word 公式（OMML）→ MathML（P1）
  design/document-spec.js        DocumentSpec 解析與正規化（JSON 或 Markdown）（D1）
  design/relaxed-json.js         寬鬆 JSON 解析（D1）
  design/markdown-deck.js        Markdown 簡報備援（D1）
  design/design-params.js        25 項設計參數、別名與正規化（D1）
  design/design-presets.js       20 套範本與 5 種語言的名稱（D1）
  design/color.js / palette.js   OKLCH 色彩運算、配色推算與對比報告（D1）
  design/fonts.js                字型組、各語言字型對應（D1）
  design/design-tokens.js        字級、間距與版面規則（D1）
  design/language.js             文件語言：偵測、標點、數字日期格式、程式產生的文字（D1）
  design/text-layout.js          文字量測、斷行（中文斷詞、避頭尾）、自動縮字、平衡換行（D1）
  design/quality-checks.js       程式檢查框架（D1）
  design/icons.js                32 個圖示的名稱與圖形（D1、A4）
  design/svg-path.js             路徑解析與形狀輪廓（圓角、拱形、有機形）（A4）
  design/rich-text.js            **粗體** 標記、多字型斷行、縮字（A4）
  design/slide-kit.js / slide-layouts.js / slide-engine.js   17 種版型的座標、續頁與排版（A4）
  generators/pptx-file.js        DocumentSpec → PPTX 的流程（A4）
  generators/pptx-writer.js / pptx-text.js / pptx-charts.js  pptxgenjs 輸出、文字 XML、原生圖表（A4）
  generators/font-embedding.js   HarfBuzz 子集化、字型改名、EOT 嵌入（A4）
  generators/pptx-assets.js      字型檔、子集化工具與預覽字型的載入（瀏覽器，A4）
  conversation-images.js         upload:N 對應到對話中的附件圖片（A4）
  previews/slide-preview.js / slide-chart-preview.js   以排版引擎的同一組座標畫投影片（A4）
  generators/text-file.js
  generators/markdown-document-model.js   marked tokens → docx / pdf 共用的文件模型
  generators/docx-file.js
  generators/spreadsheet-spec.js / xlsx-file.js
  generators/presentation-spec.js / pptx-file.js
  generators/pdf-file.js / pdf-font-loader.js
  generators/chart-image-export.js        圖表 schema → 內嵌樣式的 SVG / PNG
```

需要接上的既有位置：`markdown-rendering-helpers.js`（抽出區塊並注入卡片）、`streaming-markdown-renderer.js`（串流中的卡片、穩定區塊的搬移簽章）、`stream-api-call.js`（提示詞注入、歷史壓縮）、`history-index-source.js` 與標題摘要（壓縮）、`legacy-core.js`（綁定互動）、`runtime-texts.js`（五種語系）、新的 `file-cards.css`、`vite.config.js`、`service-worker.js`、`check-file-sizes.mjs`。

## 設計系統與 DocumentSpec（D1 已完成）

完整規格見 `2026-09-27-design-system.md`；這裡只列重點。

- **DocumentSpec**：AI 在 `.pptx` 檔案區塊裡寫的中間格式（JSON；小模型可寫 Markdown）。包含整份資訊（`title`、`language`…）、`design`（設計參數）與 `slides`（每頁的版型與內容）。程式負責位置、字級、配色與檢查，AI 不需要知道任何 Office API。
- **設計參數**：25 項（其中輔色可省略）。範本只是預設值；AI 可以直接調每一項。程式會把別名、錯誤型別換成合法值，並回報每一項修正。
- **20 套範本**：參考 Pitch、Figma、Canva、Microsoft、Apple、Google、IBM 與顧問公司的設計；名稱與說明有 5 種語言。
- **配色**：由主色（與可選的輔色）以 OKLCH 推算整組顏色；內文、次要文字至少 4.5:1，圖形至少 3:1，只調整明度不改色相。測試涵蓋 20 套範本與 480 種主色、底色、明暗、圖表配色的組合。
- **字型**：12 組字型，每組都涵蓋西文、西里爾字母與中日韓文字。繁中與西文以子集嵌入檔案（A4 已在 PowerPoint 實測可行）；簡中、日文、韓文用系統內建字型；「通用相容」不嵌入。
- **版型**：17 種（封面、目錄、章節、條列、圖文、滿版圖、兩欄、卡片、大數字、數據列、時間軸、比較、引言、照片牆、表格、圖表、結語）。內容不足時自動改用能容納的版型，並記錄在檢查報告。
- **排版引擎（文字部分）**：以實際字型量字寬，中文依詞斷行並遵守避頭尾，塞不下時逐級縮字，標題平衡換行；保留 8% 餘量吸收 PowerPoint 與瀏覽器的差異。版面座標在 A4 與版型一起完成，PPTX 與預覽共用同一組座標。
- **文件語言**：決定字型、法文窄空格、引號、數字與日期格式，以及續頁、預設標題等程式產生的文字。
- **程式檢查**：文字放不下、自動縮字、超出頁面、元素重疊、對比不足、版型重複、標題孤字、空章節、內容過密、圖片解析度、版型自動更換。
- **圖片**：`upload:N`（使用者上傳）、`asset:檔名`（方案 B）、可替換的圖框；不從網路抓圖，也不由 AI 生成。
- **簡報設計（A4b）**：輸入框的「簡報設計」按鈕選「AI 自適應」（預設）或 20 套範本之一，存在對話上。AI 自適應時，提示詞附上 25 項參數的可用值與說明，由寫簡報的模型一併設定完整的 `design`；指定範本時，提示詞要求寫 `{ "preset": "…" }`、不改參數。不另外呼叫模型。
- **看圖檢查（V1）**：只對支援看圖的模型開放；預設每份最多一輪。

## 方案 B：瀏覽器內 Python 沙盒（概要）

B 讓模型寫 Python 程式，在使用者瀏覽器內的沙盒執行，產出真正的檔案。它給模型完整的排版與美編控制，也能分析使用者上傳的檔案。**詳細設計見 [`2026-09-28-python-sandbox-design.md`](2026-09-28-python-sandbox-design.md)（B0，2026-09-28 的模式位置、預設值、執行過程呈現與沙盒網址已由使用者決定）**；這裡是最初的方向。

- **執行環境：** Pyodide（WebAssembly 版 Python）跑在 Web Worker 裡。可用 python-docx、openpyxl、python-pptx、PDF 函式庫、matplotlib、pandas 等。第一次使用要下載約 20–40 MB（依任務需要的套件而定），之後由瀏覽器快取。
- **隔離：** Worker 放在與主程式不同的來源（沙盒 iframe 或獨立子網域）執行，禁止連網。程式讀不到 app 存在瀏覽器裡的 API 金鑰、對話與登入狀態；即使上傳的檔案夾帶惡意指令、誘導模型寫出惡意程式，也無法把資料送出去。
- **資源限制：** 單次執行有時間上限，停止按鈕會直接終止 Worker；限制輸出檔案的數量與大小。
- **呼叫方式：** 使用各供應商原生的工具呼叫（function calling）。模型要求執行程式 → 沙盒執行 → 把輸出與錯誤回傳給模型 → 模型修正或繼續，重複到完成（有次數上限）。
- **畫面：** 回覆中顯示「正在執行程式…」，可以展開看程式碼與輸出；產出的檔案沿用 A 的檔案卡片、預覽與 ZIP。
- **檔案保存：** B 的產出是二進位檔，無法像 A 一樣從訊息文字重建，所以存在本機（IndexedDB），並沿用現有的雲端同步資產機制；同時保存程式碼，必要時可以重新執行。
- **美編品質：** B 的 Python 主要負責計算、資料處理、畫圖表與處理使用者上傳的檔案，最後產出 DocumentSpec 加上圖片素材，交給與 A 相同的設計系統轉檔，所以兩條路的品質與風格一致。有特殊需求時仍可直接用 python-docx / python-pptx 自由製作。看圖檢查沿用 V1。

### 模式選擇與自動切換

- B 完成後，檔案任務開始前由**使用者選擇 A 或 B**（名稱暫定「標準」與「進階」）。選擇的位置與預設值（例如輸入框工具列的切換＋設定中的預設值，或第一次偵測到檔案需求時詢問）在 B 詳細設計時與使用者確認。
- 選 A：一律用 A。
- 選 B，但以下任一情況發生時，**自動改用 A，並在該則回覆中清楚顯示「已改用標準模式」與原因**：
  - 目前的模型或供應商不支援工具呼叫；
  - 瀏覽器無法執行沙盒（不支援 WebAssembly、記憶體不足、Pyodide 載入失敗、離線且沒有快取）；
  - 沙盒在執行途中無法恢復的故障。
- 模型是否支援工具呼叫，依供應商提供的模型資訊判斷（例如 OpenRouter 模型清單的 `supported_parameters`）；無法確定時視為不支援。
- 不支援工具呼叫的模型只能用 A；選單上的 B 對這些模型顯示為不可用，並說明原因。

## 階段規劃

| 階段 | 內容 | 驗收 |
|---|---|---|
| A1 ✅ | 協定、卡片、串流狀態、下載與 ZIP、文字類格式、文字預覽、提示詞、歷史壓縮、資安政策、i18n | 單元與 DOM 測試；在瀏覽器實際跑串流與下載 |
| A2 ✅ | 共用文件模型 + docx（標題、清單、表格、程式碼、引用、連結、分頁、目錄、頁碼、圖表 SVG＋PNG 備援與圖例），以及原本排在 A6 的 LaTeX → Word 原生公式（OMML） | 以 Word 實際開啟無修復提示 |
| P1 ✅ | 最終樣式預覽框架（版面預覽 / 原始內容切換、載入與失敗狀態、縮放、安全處理、按需 chunk）+ docx 版面預覽 | 在瀏覽器（桌面與手機寬度）實際預覽 A2 的範例文件，與 Word 開啟的樣子比對 |
| D1 ✅ | 設計系統基礎：DocumentSpec 解析與正規化（JSON／Markdown）、25 項參數與 20 套範本（5 種語言）、OKLCH 配色與對比、字型組、文件語言規則、文字量測與斷行、程式檢查框架 | 單元測試；20 套範本與 AI 示範組合在淺色、深色下所有文字組合的對比度都達標 |
| A4 ✅ | 先做字型嵌入可行性測試；再做 pptx（pptxgenjs）：17 種版型的座標、元件與裝飾、約 30 個圖示、原生圖表、備註、圖片（上傳／圖框）＋ 與輸出同一組座標的投影片預覽與縮圖 | 以 PowerPoint 實際開啟，與預覽比對 |
| A4b ✅ | 製作前選擇簡報設計：輸入框「簡報設計」按鈕（AI 自適應或 20 套範本縮圖，5 種語言），選擇存在對話上並送進提示詞 | 在瀏覽器實際操作 |
| V1 ✅ 已完成 | 看圖檢查（詳細設計：`2026-09-28-vision-check-design.md`）：支援看圖的模型寫出簡報後自動檢查一輪（設定可關），進度用通知顯示，有修正時才以 AI 新回一則訊息呈現並附修正版；V1 只做 pptx | 瀏覽器模擬模型流程與 PowerPoint 開檔已通過；真實模型及正式網站待驗證 |
| W2 ✅ | Word 套用設計系統：輸入框「設計」按鈕分簡報／Word 兩頁；9 套 Word 範本或 AI 自適應（18 項文件參數）；封面、標題與表格樣式、字型子集嵌入、預覽同字型；沒有設計鍵的舊文件外觀不變（設計系統規格「Word 文件設計（W2）」） | 9 套範本 × 中英文以 Word 開啟並匯出 PDF 檢查；瀏覽器預覽比對 |
| A3 ✅ | xlsx（JSON / Markdown 表格 / CSV 正規化、公式政策、樣式、凍結窗格、自動篩選、欄寬估算、多工作表）+ 工作表預覽。細節見下方「A3 實作紀錄」 | Excel for Microsoft 365 以一般模式開啟（無修復）並匯出 PDF 檢查；瀏覽器預覽比對 |
| A5 ✅ | pdf（pdfmake、字型管線、頁首頁尾與頁碼、目錄、SVG 向量圖表，套用設計系統）+ PDF.js 預覽。細節見下方「A5 實作紀錄」 | 9 套範本 × 中英文與多語言壓力測試，以 PDF.js、Chromium 內建閱讀器檢查；瀏覽器實際產生與預覽（桌面與手機寬度） |
| A6 ✅ | 精修：Excel 原生圖表、PDF 數學公式、HTML 檔在沙盒 iframe 中的版面預覽；Excel 預覽的篩選按鈕可用。細節見下方「A6 實作紀錄」 | Excel 以一般模式開啟 8 種圖表；PDF 公式與 HTML 預覽在瀏覽器（含正式打包版）實測；手機實機下載待使用者驗證 |
| B0 ✅ | 方案 B 詳細設計，與使用者確認（含模式選擇的位置與文案）：[`2026-09-28-python-sandbox-design.md`](2026-09-28-python-sandbox-design.md) | 使用者同意 |
| B1 ✅ | 沙盒執行環境（實作紀錄見詳細設計文末）：隔離來源、Pyodide Worker、套件載入與快取、虛擬檔案系統、時間上限與停止 | 惡意程式測試：讀不到主程式資料、無法連網 |
| B2 🧪 | 工具呼叫迴圈（Gemini、OpenRouter、NVIDIA）、執行過程 UI、錯誤回饋與重試、模式選擇與自動切換到 A | 每家供應商實際跑通；不支援的模型確實切換並顯示 |
| B3 | 產出檔案接上卡片與預覽、本機保存與同步、使用者上傳檔案放進沙盒 | 重新整理與換裝置後仍能取得檔案 |
| B4 | B 產出 DocumentSpec＋素材交給設計系統；保留直接用 python-docx / python-pptx 自由製作的路徑 | 以 Office 實際開啟檢查 |
| B5 | B 的產出接上 V1 看圖檢查 | 實測修正前後的差異 |

每個階段結束時都要通過 `npm test`、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime` 與 `npm audit --omit=dev`。

## 風險與未決事項

- 弱模型輸出壞掉的 JSON：先寬鬆正規化並提供 Markdown 備援；仍失敗時顯示可理解的錯誤。
- `maxTokens` 截斷長檔案：卡片顯示「不完整」，文字類檔案仍可下載部分內容。
- 舊對話中的長規格會增加後續請求的 token：由歷史壓縮處理。
- iOS 的 blob 下載：以分享備援處理，需要實機驗證。
- Noto Sans TC 對日文假名與韓文諺文的涵蓋率：A5 驗證結果是沒有（字型只收 Big5），已另外加入 Noto Sans SC／JP／KR 子集（見「A5 實作紀錄」）。
- 字型檔：嵌入用的開源字型全部約 60 MB（使用者只下載用到的，每套中文字型約 12～17 MB），使用者已同意放進專案；A5 的 PDF 共用同一批字型。
- PowerPoint 對嵌入字型的格式要求嚴格，pptxgenjs 也不支援嵌入：A4 第一步先做可行性測試，不可行就退回 Office 內建字型。
- PowerPoint 網頁版、Keynote、Google 簡報不一定使用嵌入字型，會換成系統字型；排版保留的餘量讓換字型後仍不會溢出。

## A3 實作紀錄（2026-09-28，使用者確認）

- **外觀**（使用者選「一套固定樣式＋可改主色」，「設計」選單不加 Excel 分頁）：參考 Excel 內建表格樣式「Medium 2」與 Google Sheets「交替色彩」：表頭主色底白色粗體、淺色間隔列、數字靠右與千分位、最後一列若是「合計／小計／Total…」則為粗體並加上框線。預設主色是 Excel 2023 佈景主題的 accent 1（#156082），模型可用 `accent` 依內容更換，文字顏色由 `buildPalette` 確保對比。
- **字型**：Excel 不支援嵌入字型，所以用系統字型：含中文用微軟正黑體（簡中雅黑、日文 Yu Gothic、韓文 Malgun Gothic），其餘用 Aptos Narrow（Excel 2023 預設）。
- **寫法**：JSON（`sheets[].columns/rows/freeze/merges/autoFilter`，儲存格可為值或 `{ value | formula, format, bold, fill, color, align, wrap }`），也接受 Markdown 表格（`##` 標題當工作表名稱）與 CSV/TSV。第 1 列固定是表頭，公式位址依此計算。文字欄會自動判讀數字、百分比、幣別（NT$、$、€…）、日期；前導 0 的代碼保持文字，1900～2100 的年份不加千分位。
- **公式政策**：只有 `formula` 欄位會成為公式；拒絕 WEBSERVICE、FILTERXML、RTD、CALL、REGISTER、EXEC、IMAGE、INFO、CELL、DDE（`|`）、外部活頁簿（`[`）與 `file:`；HYPERLINK 只允許 http(s) 與 mailto。上限：20 個工作表、每表 10,000 列、100 欄、總計 200,000 格。
- **公式結果**：`formula-engine.js` 計算常用函式（SUM、AVERAGE、IF、IFERROR、SUMIF、COUNTIF、VLOOKUP、INDEX/MATCH、ROUND…、跨工作表參照），結果寫進檔案的快取值（iOS 快速查看、郵件預覽等不會計算的檢視器才看得到數字），並設定 `fullCalcOnLoad` 讓 Excel 開檔時重算；算不了的（TODAY、HYPERLINK 等）不寫快取值，交給 Excel。
- **程式庫**：write-excel-file 4.1.1（MIT，唯一依賴 fflate），打包成延後載入的 `vendor-xlsx`（gzip 約 19 KB）。它不支援自動篩選與快取值，所以產生後用 JSZip 補上 `autoFilter`、`_xlnm._FilterDatabase`、`<v>` 與 `calcPr`；注意它已經寫了空的 `<definedNames/>` 與 `<calcPr/>`，要替換而不是另加（否則 Excel 要修復檔案）。Excel 不允許工作表名稱以單引號開頭或結尾。
- **預覽**（分頁放下方，使用者確認）：`previews/xlsx-sheet-preview.js` 以產生檔案時的同一份版面畫出欄字母、列號、格線、凍結窗格、合併儲存格、篩選按鈕與工作表分頁，最多顯示 500 列。樣式放在 shadow root 內，不增加全域 CSS。
- **順帶修正**：預覽對話框點到自身的留白處會被當成點背景而關閉，改成只有點在對話框外才關閉。

## A5 實作紀錄（2026-09-28，使用者確認）

- **外觀**（使用者選「跟 Word 共用」）：PDF 與 Word 用同一份文件模型與設計參數（9 套範本或 AI 自適應的 18 項參數），同一份內容做成 Word 或 PDF 看起來一樣。「設計」選單的分頁改名為「Word／PDF 文件」，指定範本時也會強制套用到 .pdf 檔。沒有設計鍵的 PDF 使用「標準」範本（PDF 沒有舊外觀需要保留）。
- **程式庫**：pdfmake 0.3.11（MIT，內含 PDFKit 與 fontkit），延後載入的 `vendor-pdf`（gzip 約 340 KB）；預覽用 PDF.js 6（Apache-2.0，legacy 版以支援較舊的瀏覽器），`vendor-pdf-preview` 約 155 KB，worker 約 380 KB。兩者都不預先快取。`check-file-sizes` 另設「按需檔案程式庫」與「PDF 預覽 worker」預算，不計入啟動用的最大 JS。
- **字型**：PDF 不能借用讀者電腦的字型，所以每個字都必須用 app 內的字型畫。文字依字元分段：設計的西文字型 → 中日韓字型 → 依文字系統的備用字型（繁中、簡中、日文、韓文、Inter 西文與西里爾、Noto Emoji），只下載這份文件需要的檔案。Office 內建字型換成最接近的開源字型（Aptos → Inter、微軟正黑體 → Noto Sans TC、雅黑 → Noto Sans SC、Yu Gothic → Noto Sans JP、Malgun Gothic → Noto Sans KR）。每個字重各自子集化並固定粗細；斜體是把字形斜切（字型沒有斜體檔，Word 也是這樣做）。每個字重與斜體必須有自己的 PostScript 名稱，否則 PDFKit 會把同名字型當成同一個，用錯子集而缺字。
- **新增字型**（使用者同意加入）：Noto Sans SC（GB 2312 一級字 3,755 字）、Noto Sans JP（假名與 JIS 第一水準 2,965 字）、Noto Sans KR（KS X 1001 諺文 2,350 字）、Noto Emoji（黑白線條，使用者選擇）；共約 7.5 MB，只在 PDF 用到時才下載。現有字型檔在重建後逐位元相同。
- **行距**：`lineSpacing` 同 Word 的意義（1.2 em 的倍數）。每段文字依自己字型的自然行高換算，中英混排的行距一致。pdfmake 以整行行高畫行內底色與底線位置，所以有底線的文字用較小的行高，行距大於 1.5 倍時行內程式碼不加底色。
- **版面**：封面（整頁、色帶、幾何色塊、APA 標題頁）、標題的細線／色條／色帶／置中、三種表格樣式（跨頁重複表頭、不拆列）、清單（含勾選方框）、程式碼、引言、分隔線、分頁、頁首頁尾。標題不會落在頁尾（下一頁若只剩標題就整段移過去）。頁碼是 PDF 的實體頁碼：封面算第 1 頁但不印頁碼，這樣頁尾、目錄與閱讀器顯示的頁數一致（與 Word 版從封面後重新起算不同，因為 pdfmake 的目錄只能寫實體頁碼）。
- **PDF 才有的**：目錄附頁碼且可點；每個 1～3 級標題都是書籤（依層級巢狀）；圖表以向量 SVG 繪製（標籤使用能涵蓋全部字元的單一字型）。
- **預覽**：`previews/pdf-page-preview.js` 用 PDF.js 把下載的同一個檔案逐頁畫成 canvas，捲到附近才畫，依螢幕解析度與對話框寬度重畫；網址與郵件連結在新分頁以 noopener 開啟，內部連結（目錄）在預覽內捲到該頁。PDF 內嵌所有字型，所以預覽不再顯示字型說明。
- **順帶修正**：文件語言偵測原本只要有一個假名就判定為日文，中文文件引用一句日文會整份改用日文字型；改為假名至少佔漢字 30% 才算日文（Word、PPT 共用）。
- **限制**：（A6 已補上 PDF 數學公式）；國旗 emoji 在黑白字型中以方框字母顯示；Word 開 PDF 需要手動確認轉換，未以 Word 自動檢查。

## A6 實作紀錄（2026-09-28，使用者確認）

- **Excel 原生圖表**（使用者選「放在資料旁邊」）：工作表可寫 `charts`，以欄位（表頭或欄字母）指定類別欄 `x` 與數值欄 `y`；類型有直條（column，也接受 bar，與聊天圖表的用法一致）、橫條（horizontalBar）、折線、面積、圓餅、環圈、散佈、雷達，直條／橫條／折線／面積可堆疊。預設使用全部資料列但排除最後的合計列（可用 `rows` 指定），放在表格右側空一欄處、多張往下排（可用 `anchor` 指定儲存格），大小同 Excel 預設 5 × 3 英吋。寫成 DrawingML 圖表（`generators/xlsx-charts.js`）：引用儲存格所以會跟著編輯更新，附快取值，配色用主色推算的同一組系列色；橫條圖第一列在最上面。Excel for Microsoft 365 以一般模式開啟 8 種圖表都正確、無修復提示。
- **工作表預覽的圖表**：在錨點儲存格畫出同一組資料，共用投影片預覽的圖表繪製（`drawChart`，由 `drawNativeChart` 拆出），類別標籤太擠時斜放 45°（投影片預覽也受惠）；格線延伸到圖表下方，圖表在固定的列號與表頭之下。
- **篩選按鈕**（使用者回報點了沒反應）：表頭的箭頭改為按鈕，打開與 Excel 相同的選單：從 A 到 Z／從 Z 到 A 排序、清除篩選、勾選要顯示的值（含全選與空白）。只改變預覽，不改檔案；排序後列號依新順序，篩選時保留原列號；有排序或篩選時下方註明只影響預覽。選單固定在視窗上（不被預覽框裁切），空間不夠時往上開；捲動、縮放或點其他地方會關閉，Esc 關閉並回到按鈕。文字五種語言。
- **PDF 數學公式**：`$$…$$` 以 MathJax 3（Apache-2.0）排成 SVG，字形都是路徑，不需要字型、各閱讀器一致；無法解析的公式顯示 LaTeX 原文。pdfmake 無法在一行文字中放圖，所以 `$…$` 轉成文字（`generators/latex-inline.js`）：希臘字母與運算符號換成 Unicode、上下標、分數寫成 a/b、根號、字母斜體、減號為 −。西文字型子集加入希臘字母、上下標與數學運算符號（約多 0.4 MB）。MathJax 在 `vendor-pdf-math`（gzip 約 550 KB，幾乎都是字形資料），只有 PDF 有獨立公式時才下載，另設預算。MathJax 3 依賴的 speech-rule-engine 帶有舊版 xmldom，用 overrides 升到已修補的 0.9.12。
- **HTML 預覽**（使用者選「允許程式執行」）：`previews/html-page-preview.js` 在 `sandbox="allow-scripts"` 的 iframe 執行網頁：沒有 allow-same-origin，所以是不透明來源，讀不到 Noureon 的 localStorage、cookie、對話與金鑰，也碰不到外層頁面；不能開新視窗、送出表單、跳出對話框或導向 app。可能從外部網站載入內容，預覽下方註明。iframe 在對話框打開後的下一個畫面才載入內容（在對話框開啟過程中載入會停在 0 × 0 不繪製）。注意：目前網站的 CSP 是 Report-Only；srcdoc 會繼承上層 CSP，若日後改為強制執行，HTML 預覽要改到獨立來源（與方案 B 的沙盒相同）。
- **程式碼上色**（使用者要求）：聊天回覆的程式碼區塊與預覽的「原始內容」依語言上色，配色照 VS Code：聊天的深色區塊用 Dark+，原始內容與淺色桌布用 Light+。使用 highlight.js（BSD-3，約 20 種常用語言），`ui/code/code-highlighting.js` 在啟動時監看新出現的程式碼區塊，第一次需要時才載入 `vendor-highlight`（gzip 約 41 KB）與樣式；沒標語言的區塊只在把握夠高時才上色，串流中的那一行等完成後再上色，超過 20 萬字不上色。原始內容改為自動換行。
- **手機實機下載**：需要使用者在 iPhone（Safari、Chrome、加入主畫面的 PWA）與 Android（Chrome）上實測，清單見交接文件。

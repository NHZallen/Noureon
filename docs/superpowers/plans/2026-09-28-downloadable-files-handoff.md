# 可下載檔案功能：交接說明（給接手的 AI 助理，例如 Codex）

**日期：** 2026-09-28
**用途：** 額度用完或換工具時，讓下一個 AI 助理不必重讀整段對話就能接著做。先讀這份，再讀下面兩份規格。

- 總計畫與決策紀錄：[`docs/superpowers/specs/2026-09-26-downloadable-files-design.md`](../specs/2026-09-26-downloadable-files-design.md)
- 設計系統、DocumentSpec 與 PPTX 輸出：[`docs/superpowers/specs/2026-09-27-design-system.md`](../specs/2026-09-27-design-system.md)

## 1. 工作規則（使用者的要求，一定要遵守）

1. **用繁體中文回覆**，簡短說明做了什麼、還有什麼沒驗證。
2. **一次只做一個階段**，照「階段規劃」表的順序；每個階段完成後回報，由使用者決定是否推上 `main`。
3. **推上 `main` 前一定要使用者同意。** `main` 每次推送都會由 Vercel 自動部署到 `noureon.com`（見 `RELEASING.md`）。
4. **commit 訊息不加 `Co-Authored-By` 或任何 AI 署名。** 使用者曾經重寫歷史把它們全部移除。
5. **`.claude/` 不要提交。**
6. **每個功能、範本、提示文字都要涵蓋 5 種介面語言**：繁體中文 `zh-TW`、English `en`、Français `fr`、Русский `ru`、Español `es`。檔案裡的文字依「文件語言」決定字型、標點與數字格式。
7. **視覺設計要以真實廠商的設計為基礎並附參考**（Pitch、Figma、Canva、Microsoft、Apple、Google、IBM…），不要自創風格。使用者偏好**黑白極簡**、不要漸層、不要自作主張加圖示（符號他之後自己加）。
8. **介面有疑問先問使用者**（例如放在哪裡、要不要保留某功能）；使用者多次否決過自行決定的介面。
9. 不要輸入真實帳密或 API 金鑰。

## 2. 目前進度（2026-09-28）

| 階段 | 狀態 | 內容 |
|---|---|---|
| A1、A2、P1 | ✅ 已上線 | 檔案卡片協定、文字類格式、Word（docx）、Word 版面預覽 |
| D1 | ✅ 已上線 | 設計系統：DocumentSpec、25 項參數、20 套範本、配色、字型組、文件語言、文字排版 |
| A4 | ✅ 已上線 | PowerPoint（pptx）：17 種版型、字型子集嵌入、原生圖表與表格、圖示、講者備註、上傳圖片、投影片預覽 |
| A4b | ✅ 已上線 | 輸入框「簡報設計」按鈕：AI 自適應（預設）或指定 20 套範本；指定範本時程式強制套用（只允許在對話中改主色、輔色） |
| 其他修正 | ✅ 已上線 | 手機版選單不超出畫面；iPhone 上 Chrome 等非 Safari 瀏覽器改用分享選單下載 |
| **V1** | ✅ **已完成，待真實模型與正式網站驗證** | 看圖檢查；進度依使用者要求改為通知（詳細設計與驗證見 §3） |
| **W2** | ✅ 已上線 | Word 設計：「設計」按鈕分簡報／Word 兩頁、9 套範本或 AI 自適應、封面、字型嵌入（見設計系統規格「Word 文件設計（W2）」） |
| **A3** | ✅ 已上線 | Excel：固定樣式＋可改主色、公式政策與快取值、凍結窗格、篩選、合併儲存格、工作表預覽（見總計畫「A3 實作紀錄」） |
| **A5** | ✅ 已上線 | PDF：與 Word 共用設計（「設計」的「Word／PDF 文件」分頁）、所有字型子集嵌入（含簡中、日文、韓文、黑白 emoji）、目錄頁碼、書籤、向量圖表、PDF.js 預覽（見總計畫「A5 實作紀錄」） |
| **A6** | ✅ 已上線 | Excel 原生圖表、預覽篩選按鈕、PDF 數學公式、HTML 沙盒預覽（見總計畫「A6 實作紀錄」）；手機實機下載待使用者驗證（清單見下） |
| **B0** | ✅ 使用者已確認 | 方案 B 詳細設計：[`docs/superpowers/specs/2026-09-28-python-sandbox-design.md`](../specs/2026-09-28-python-sandbox-design.md)。已決定：「設計」選單內的「製作方式：標準｜進階」、預設進階、執行過程收合成一行、沙盒在 run.noureon.com |
| **B2** | 🧪 **已實作，待使用者用真實金鑰驗證** | 工具呼叫迴圈（三家）、「設計」選單的製作方式、設定預設值、執行紀錄收合列、改用標準模式的提示。2026-09-28 起對所有人開放（預覽開關已移除），新對話預設進階。見詳細設計文末「B2 實作紀錄」 |
| **B1** | ✅ 已上線 | 沙盒執行環境（`public/sandbox/`、`src/app/runtime/sandbox/`），還沒接上模型與介面。DNS：`run.noureon.com` 已由使用者在 Cloudflare 與 Vercel 設定好（CNAME、僅 DNS）。實作與驗證見詳細設計文末「B1 實作紀錄」；部署後要檢查的項目也列在那裡 |
| **B3** | 🧪 **已實作，待使用者和 B2 一起驗證** | 產出檔案存成訊息 part（`sandboxFile`），跟著同步、匯出；卡片、ZIP、預覽（含 xlsx 讀取器、圖片）；`/input` 放入附件與先前的產出；「檔案不在這台裝置上」與重新執行。見詳細設計文末「B3 實作紀錄」 |
| **B4** | ✅ **已完成，待推送** | Python 用 `noureon.save_document` 把內容交給設計系統（變成回覆最後的 ````file 區塊）；Word／PDF 支援 `asset:`、`upload:` 圖片；被引用的圖片不另外出卡片。見詳細設計文末「B4 實作紀錄」 |
| **B4b-1** | ✅ 已上線 | 進階模式改成 GPT 式自由創作：預設讓模型用 python-docx／python-pptx／reportlab 自己設計 Word、PPT、PDF；選了「設計」範本才走 `noureon.save_document`。沙盒內建 12 個字型檔（Inter、思源黑體／宋體繁簡日韓的 Regular、Bold）與 `noureon.use_fonts`；自由做出的 Word／PPT 會在回覆結束後自動嵌入用到的字型。見詳細設計文末「B4b-1 實作紀錄」 |
| **B4b-2** | ✅ 已上線 | 自由做出的 PPT 有卡片預覽：自己寫的 PPTX 讀取器（文字、圖片、形狀、表格、圖表、群組、版面與母片繼承），和設計系統的簡報用同一套繪圖程式。見詳細設計文末「B4b-2 實作紀錄」 |
| **B5** | ✅ 已上線（待真實模型驗證） | 進階模式的看圖檢查：選了範本的簡報沿用 V1；自由做出的 PPT 用 PPTX 讀取器畫成圖片給模型看，發現問題就讓 AI 重新執行 Python 產生修正版，新增一則回覆（含執行紀錄、問題清單、修正版檔案）。見詳細設計文末「B5 實作紀錄」 |
| **B6-1** | ✅ 已上線 | 執行過程的「工作視窗」（輸入框上方的小視窗）：先接看圖檢查（每頁縮圖逐格填入、聯絡表、問題標紅框、可收合、可停止）；另外進階模式的狀態列改成有模型名稱與計時。見詳細設計文末「B6-1 實作紀錄」 |
| **B6-2** | ✅ 已上線（外觀已被 B6-3 取代） | 進階模式的 Python 執行改用同一個工作視窗：每次執行的程式碼、即時輸出、產生的檔案（圖片縮圖、其他檔案用標籤）；沙盒通訊協定新增輸出串流。見詳細設計文末「B6-2 實作紀錄」 |
| **B6-3** | ✅ 已上線 | 使用者測過 B6-1／B6-2 的浮動視窗後「完全不滿意」，調查大廠做法後改成訊息內的「步驟清單」：進度放在 AI 訊息裡，Python 與看圖檢查共用同一種清單。浮動視窗整個拿掉。見詳細設計文末「B6-3 實作紀錄」 |
| **B6-4** | ✅ **已完成，待推送** | 使用者看過 B6-3 後的三項回報：看圖檢查像「AI 憑空多輸出一輪」→ 縮成訊息底下一行「自動看圖檢查 · 目前步驟 ›」、重做的回覆上方加小標籤；偶爾出現空白的 PPT → 模型另寫的同名檔案區塊會被拿掉；看不到 AI 思考 → 任何對話，只要模型送思考就顯示（模型自己的思考標「思考過程」，供應商只給摘要的標「思考摘要」），存進執行紀錄，重新整理後還在。見詳細設計文末「B6-4 實作紀錄」 |
| **模型選擇器改版** | ✅ 已完成 | 使用者要求重做模型理事會的選模型、切模式。調查 ChatGPT、Claude、Perplexity Model Council、Open WebUI、Poe 後，改成輸入框旁一顆按鈕與一個面板：頂端切「單一模型／理事會」；單一模型是一張可搜尋、按公司分組的單層清單（取代原本五層點進去的頁首選單）；理事會的成員是可移除的標籤、整合者是一列選項、共識／討論是兩張卡片、其餘選項收在「更多選項」。模型清單每列兩行（價格與說明放在提示裡）以便一次看到更多模型；清單最上面是「最近使用」的三個模型（存在設定的 `recentModelIds`，選擇模型或送出訊息時更新）；理事會頁最上面是「分組」：最多五組、可命名、每組有成員與整合者，存在設定的 `councilGroups`，點一下套用，在「編輯」頁改名、選成員、選整合者、刪除；輸入框上的理事會標籤只顯示「共識」或「討論」；思考程度是獨立的一顆按鈕與一個小面板（不在模型清單裡），改成有段位的拉桿（圓鈕比軌道高、每一段有一個圓點、拖曳時一段一段跳並立刻換上方的等級名稱、手機有輕微震動、放開才存）。程式在 `src/app/ui/model-picker/`、`council-controls-lifecycle.js`、`src/styles/model-picker.css`；頁首原本的模型按鈕與輸入框旁的思考深度按鈕已移除，舊樣式一併刪除 |
| **右上角通知改版** | ✅ 已完成 | 通知改成白底細邊框、一行文字加依種類上色的小圖示、可有一顆動作按鈕與關閉鈕；同時最多顯示 3 則、其餘排隊，相同訊息只更新不重複，游標停在上面時暫停倒數，時間依字數 3–6 秒（有按鈕 6 秒），點一下即關閉，手機貼在上緣。程式在 `src/app/ui/notifications/toast-center.js`、`src/styles/notification.css`。開啟理事會時的搜尋提示縮成一句（例如「理事會不會自動搜尋網路。」）並附「開啟搜尋」按鈕，五種語言 |

V1 開始前的基準 commit：`1d43cc46 Design the visual check (V1) for the next agent`。V1 初版 commit：`ea4a1688 Implement V1 visual review for presentations`。2026-09-28 使用者要求將進度改為通知並授權推送 `main`。

### 已上線但還沒有實機驗證的

- **iPhone 上的 Chrome 下載**：改用分享選單（`deliverFile`、`prefersShareSheet`，在 `src/app/ui/files/file-card-interactions.js`）。沒有 iPhone 實機測過；請使用者在 iPhone Chrome 按一次下載確認。
- **AI 自適應**：還沒用真的模型確認它會寫出完整的 25 項參數（提示詞在 `src/app/ui/files/file-authoring-guidance.js` 的 `presentationDesignGuidance`）。
- **Word 設計的 AI 自適應**：還沒用真的模型確認它會寫出完整的 18 項文件參數（`documentDesignGuidance`）。
- **Word「另存 PDF」**：襯線中文子集匯出 PDF 時文字層錯誤（見設計系統規格 W2 的已知限制）。
- **字型授權**：Playfair Display、Source 系列、IBM Plex 有 OFL 保留字型名稱，嵌入文件的子集沿用原名；上線前建議確認是否需要改名（見設計系統規格「授權」）。

## 3. V1 看圖檢查：已完成

**詳細設計：[`docs/superpowers/specs/2026-09-28-vision-check-design.md`](../specs/2026-09-28-vision-check-design.md)。** V1 已依此實作，進度通知是使用者後續確認的調整；本次使用者已授權推送 `main`。

使用者已確認：自動檢查（設定可關）、檢查進度用通知、結果以 AI 新回一則訊息呈現並附修正版、V1 只做 PowerPoint。

已完成：來源頁碼對應、規格序列化及安全修正、字型嵌入的投影片聯絡表（每張 4 頁，最多 24 頁）、獨立視覺模型請求、持續更新的進度通知與停止、在原對話保存修正版、取消與切換對話、五種語言及設定。單則回覆若有多份完整 PPTX，依序逐份檢查並各產生結果訊息。

驗證：`npm test`（1906 項通過）、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime`、`npm audit --omit=dev`（0 項漏洞）。在 Chrome 以模擬模型回覆跑完整流程，確認字型 data URL、聯絡表、修正版卡片與取消；修正版 PPTX 由 PowerPoint 開啟並匯出 4 頁 PDF。進度通知另以 DOM 測試確認五種語言、階段更新、停止後立即移除且不進入對話。尚未用真實模型或在正式網站驗證；推送後須核對真實模型發現問題與修正前後差異、不支援看圖的模型、關閉設定、手機寬度。

可以沿用的現成程式：

- 投影片畫成 SVG：`renderSlideSvg`、`renderPresentationSlide`（`src/app/ui/files/previews/slide-preview.js`），排版結果來自 `layoutDeck`（`src/app/ui/files/generators/pptx-layout.js`）。SVG 畫到 canvas 就能轉 PNG。
- Word 頁面預覽：`src/app/ui/files/previews/docx-page-preview.js`。
- 判斷模型能不能看圖：`modelSupportsVision`（`src/app/runtime/legacy-core/model-registry.js` 一帶）。
- 用目前的模型另外呼叫一次：參考 `src/app/runtime/legacy-core/memory-model-runner.js`（`streamApiCall` 搭配 `requestPurpose`、`skipMemoryContext` 等選項）。**新增 runtime binding 時要同步登記到 V5 contract map**，否則 `tests/structure/runtime-contracts.test.js` 會失敗。
- 程式檢查（文字溢出、超出頁面等）：`src/app/ui/files/design/quality-checks.js`，排版後的 `layout.issues`。

## 4. 程式結構速查（檔案功能）

```
src/app/ui/files/
  file-block-protocol.js / file-block-model.js   ````file 名稱 區塊的解析與描述
  file-card-renderer.js / file-card-interactions.js  卡片、下載、預覽、ZIP、iOS 分享
  file-preview-dialog.js                         預覽對話框（版面預覽／原始內容）
  file-authoring-guidance.js                     給模型的提示詞（含簡報設計的兩種模式）
  file-texts.js                                  卡片與預覽的 5 種語言文字
  design/                                        設計系統（延後載入）
    document-spec.js, design-params.js, design-presets.js, palette.js, fonts.js,
    slide-engine.js, slide-layouts.js, slide-kit.js, rich-text.js, text-layout.js,
    deck-design-picker.js(.css), deck-template-enforcer.js,
    document-presets.js, document-design.js, document-thumbnail.js   Word 範本、參數與縮圖
  generators/                                    檔案產生（延後載入）
    docx-file.js, pptx-file.js, pptx-layout.js, pptx-writer.js, pptx-text.js,
    spreadsheet-spec.js, formula-engine.js, sheet-layout.js, xlsx-file.js,
    pdf-file.js, pdf-fonts.js, pdf-math.js, latex-inline.js, xlsx-charts.js,
    chart-images.js, document-labels.js,
    pptx-charts.js, pptx-assets.js, font-embedding.js, chart-image-export.js
  previews/                                      預覽（延後載入）
    docx-page-preview.js, slide-preview.js, slide-chart-preview.js, xlsx-sheet-preview.js, pdf-page-preview.js,
    html-page-preview.js
src/app/runtime/features/deck-design-control.js  輸入框的「設計」按鈕（簡報／Word 兩頁）
src/app/legacy-runtime/features/assistant-response-finalization.js  回覆存檔前強制套用範本
src/assets/fonts/                                嵌入用字型（由 scripts/build-fonts.mjs 產生）
```

`src/app/ui/files/` 根目錄的檔案會被打包進啟動時就載入的 `runtime-files`；大型或少用的程式要放在 `design/`、`generators/`、`previews/`（`vite.config.js` 的 `manualChunks`）。

## 5. 驗證方式

每個階段結束都要通過：

```
npm test
npm run build
npm run check:sizes
npm run check:legacy-runtime
npm audit --omit=dev
```

要特別注意的：

- **主樣式表已經貼在上限**：`dist/assets/index-*.css` 約 225.24 kB，`check:sizes` 的過渡期上限是 220 KB（目前剛好通過）。**任何新增的全域 CSS 都會讓檢查失敗。** 新介面的樣式請放進延後載入的 CSS（做法見 `deck-design-control.js` 的 `loadPicker`），或沿用既有的 class。
- **全站有 `body svg { color: 黑; stroke: currentColor }` 的規則**：新 SVG 圖示要自己設 `color: inherit` 或明確的 `stroke`/`fill`，否則會變全黑或多出黑框。
- **很多檔案是 CRLF 換行**：用腳本改檔時先統一換行再寫回。
- `npm test` 全部跑約 60 秒；只改檔案功能時可以先跑 `node --test tests/files/*.test.js tests/ui/*.test.js`。
- 瀏覽器實測：`npm run dev`（port 5173）。未登入時看不到聊天輸入框，可以把 `#input-bar-container` 搬到 `body` 上測試；檔案產生可以在頁面中直接 `import('/src/app/ui/files/file-generators.js')` 呼叫。
- **用 PowerPoint 檢查 pptx（Windows）**：用 COM 匯出 PDF 再看。`Slide.Export` 轉 PNG 時不會使用嵌入字型，不能拿來檢查字型。

```powershell
param([string]$Pattern)
$app = New-Object -ComObject PowerPoint.Application
try {
  foreach ($file in (Get-ChildItem $Pattern | ForEach-Object FullName)) {
    $deck = $app.Presentations.Open($file, $true, $false, $false)
    $deck.SaveAs([IO.Path]::ChangeExtension($file, '.pdf'), 32)
    $deck.Close()
  }
} finally { $app.Quit() }
```

- 測試用簡報：`tests/files/fixtures/sample-deck.json`（5 種語言、19 頁、涵蓋全部 17 種版型）。

## 6. 使用者已經否決或改變的設計（不要再做）

- 產生後的「設計面板」（換範本、AI 調參數卡片、25 項微調、寫回訊息）：已移除，改成製作前在輸入框選擇。
- 「AI 一次給三組設計方向再挑選」：不做。
- 漸層、彩色的 AI 卡片：使用者要黑白極簡。
- 按鈕顯示目前選擇或前面加星號：按鈕固定顯示文字（W2 起改名「設計」），不加符號。
- 第一版 8 套簡報風格：被退回，要求參考各大廠重做（現在的 20 套）。

## 手機實機下載驗證清單（A6，由使用者執行）

在 noureon.com 請 AI 分別產生 Word、Excel、PowerPoint、PDF 各一份，以及同一則回覆中兩個檔案（出現「全部下載」ZIP）。每個裝置檢查：

| 裝置 | 檢查 |
|---|---|
| iPhone Safari | 點「下載」出現分享選單或下載提示；存到「檔案」後能用對應 App 開啟；預覽對話框可捲動、可縮放到整頁 |
| iPhone Chrome | 同上（非 Safari 會改用分享選單） |
| iPhone 加入主畫面（PWA） | 同上；分享選單能存檔 |
| Android Chrome | 檔案進入「下載」資料夾且能開啟；PDF 預覽顯示正常 |

回報格式：裝置／瀏覽器、哪個格式、哪一步失敗（最好附截圖）。

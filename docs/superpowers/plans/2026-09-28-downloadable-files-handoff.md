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
| **W2** → A3 → A5 → A6 → B0～B5 | ⬜ **下一階段** | 見總計畫的「階段規劃」 |

V1 開始前的基準 commit：`1d43cc46 Design the visual check (V1) for the next agent`。V1 初版 commit：`ea4a1688 Implement V1 visual review for presentations`。2026-09-28 使用者要求將進度改為通知並授權推送 `main`。

### 已上線但還沒有實機驗證的

- **iPhone 上的 Chrome 下載**：改用分享選單（`deliverFile`、`prefersShareSheet`，在 `src/app/ui/files/file-card-interactions.js`）。沒有 iPhone 實機測過；請使用者在 iPhone Chrome 按一次下載確認。
- **AI 自適應**：還沒用真的模型確認它會寫出完整的 25 項參數（提示詞在 `src/app/ui/files/file-authoring-guidance.js` 的 `presentationDesignGuidance`）。
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
    deck-design-picker.js(.css), deck-template-enforcer.js
  generators/                                    檔案產生（延後載入）
    docx-file.js, pptx-file.js, pptx-layout.js, pptx-writer.js, pptx-text.js,
    pptx-charts.js, pptx-assets.js, font-embedding.js, chart-image-export.js
  previews/                                      預覽（延後載入）
    docx-page-preview.js, slide-preview.js, slide-chart-preview.js
src/app/runtime/features/deck-design-control.js  輸入框的「簡報設計」按鈕
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
- 「簡報設計」按鈕顯示目前選擇或前面加星號：按鈕固定顯示「簡報設計」，不加符號。
- 第一版 8 套簡報風格：被退回，要求參考各大廠重做（現在的 20 套）。

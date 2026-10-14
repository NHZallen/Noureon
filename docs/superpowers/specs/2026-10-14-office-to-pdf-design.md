# 檔案轉成模型讀得懂的樣子：Word／PowerPoint 轉 PDF、Excel 轉文字、文字與圖片抽取（設計）

**狀態：** 設計已和 Allen 定案（2026-10-14），按階段實作中（Linear NOU-25）。這份取代先前只講 LibreOffice 的版本。

## 1. 目標

模型不能直接讀的檔案，現在先交給「轉譯模型」寫成文字包（約 7000 字上限，會丟內容、多花一次費用，而且**只用在當下那一輪**，追問時模型看不到文件）。改成按模型的能力，用更好的方式處理，轉譯模型只留作備援。

## 2. 依模型分類，各自怎麼處理

| 類別 | 模型 | Word／PowerPoint | Excel | 圖片 |
|---|---|---|---|---|
| A 直接讀 Office | Grok 4.7／4.6、GPT-6／5.6 Luna、Gemini 4 Argon Contributor（OpenCode） | 原檔直接送（不變） | 抽成文字表格（Excel 沒測過它們收不收） | 模型自己處理 |
| B 讀 PDF（探測穩定的 10 個） | hy4-preview、hy3、muse-spark-1.3／1.2、claude-haiku-5-5、minimax-m3／m2.7、qwen3.8-max／flash、qwen3.7-plus | 伺服器用 LibreOffice 轉 PDF 再送；圖片留在 PDF 裡 | 抽成文字表格 | 隨 PDF（PDF 內圖片能不能被看到，用 `--tests pdfimage` 探測；看不到時沿用 D 的備援） |
| C 有視覺、不讀檔 | Kimi K3、GLM-5.3 Flash、MiMo V2.6 Pro／Flash、LongCat 2.5 Preview、DeepSeek V4.1 Flash、MiMo V2.5、Step 5 Preview、NVIDIA 的有視覺模型等 | 抽成文字，檔案裡的圖片取出當圖片一起送，文字裡標「[圖 N：第 M 頁]」；原生圖表抽成數據表格 | 抽成文字表格 | 同左，**最多 10 張**，超過的在文字裡寫「還有 N 張圖片未送出」；縮到長邊約 1568 像素 |
| D 沒視覺、不讀檔 | GLM-5.3、GLM-5.2、DeepSeek V4 Pro、DeepSeek V4 Flash、MiMo V2.5 Pro、LongCat 2.0、Cat Jam（OpenCode）、NVIDIA GLM-5.3 | 抽成文字；有圖片的檔案**用轉譯模型描述圖片**（沒設轉譯模型就在文字裡寫「這個檔案有 N 張圖片未讀取」） | 抽成文字表格 | 沒有視覺的模型本來就不能傳圖片和拍照（按鈕隱藏，不變） |
| E 其他 | Gemini 官方、OpenRouter | 不動 | 不動 | 不動 |

- **按鈕不隱藏、不新增限制。** D 類仍可傳檔案（Allen 的決定：用轉譯備援）。
- **圖片 10 張上限**只管「從文件裡抽出來的圖片」。生圖模型的輸入圖片（有些超過 10 張）不受限、不擋。
- **失敗一律退回轉譯**：轉換逾時、加密檔、損壞、整頁是圖的掃描檔（抽不到幾個字）、超過限制。回覆不會因此失敗。
- **追問也能讀**：每一輪請求，歷史裡的附件也照同樣方式處理（不只最新一則）。

## 3. 兩種處理放在哪

- **文字／圖片／圖表抽取、Excel 轉文字：** 純文字處理，在**頁面（使用者的瀏覽器）與伺服器共用**的模組做（`src/app/ui/files/office-text/`，不用 `window`、`document`；JSZip 與 DOMParser 由呼叫端注入），在送出請求前處理，所以暫時對話、本機模式、沒有帳號都能用，**檔案不離開瀏覽器**。
- **LibreOffice 轉 PDF：** 只在**登入且走伺服器的回覆**（含「關頁也繼續」）做，用現有 Python 沙盒（`server/sandbox-client.js` 的 mount／run，沒有網路，不新增 runner 端點）：
  `soffice -env:UserInstallation=file:///tmp/lo --headless --norestore --convert-to pdf --outdir /output /input/<檔名>`。
  暫時對話永遠不會送到伺服器，不會留下任何檔案。

## 4. 轉出的 PDF 的保存與刪除

- 轉出的 PDF **不寫進對話紀錄**（對話裡仍是使用者的原檔；格式不變，不占使用者 500 MB 額度）。
- 存在伺服器檔案儲存區，名稱 = 原檔內容雜湊（`derived-pdf/<使用者>/<雜湊>`），追問時取用、不重轉。
- **一定會刪：**（a）對話被永久刪除、原檔不再被任何資料列引用時，每日清理（`asset-sweeper`）連同衍生 PDF 一起清；（b）超過 30 天沒用到就刪；（c）使用者刪帳號時整個資料夾清掉。
- 暫時對話：不經伺服器，沒有任何檔案可刪（測試保證：暫時對話與 `not-synced` 的回覆不會呼叫轉換）。

## 5. 限制

單檔 50 MB、轉換 100 秒、一次最多 3 個檔案、轉出的 PDF 超過 50 MB 就退回轉譯；Excel 每個工作表最多 1000 列、60 欄（沿用預覽讀取器），超過的註明截斷；請求總大小 25 MB 的硬上限內，圖片依出現順序送到快滿為止。

## 6. 隱私與文件

隱私政策／協助中心五語言補：（1）Word／PowerPoint 在伺服器回覆時可能在沒有網路的沙盒轉成 PDF，轉出的 PDF 存放並刪除的規則（第 4 節）；（2）檔案裡的文字與圖片可能在你的瀏覽器裡抽出，再送給你選的模型。`PRIVACY.md` 由英文版產生。

## 7. contract 相容性說明

- 訊息格式不變（附件仍是 `inlineData`；衍生內容只在送出請求時暫時使用）。
- 任務事件：進度列多幾種訊息（轉換中、失敗退回）；舊頁面看不懂時顯示原樣文字。
- 權限：不新增（沿用沙盒權限）。
- 刪除：衍生 PDF 的清理併入 `asset-sweeper` 每日清理，另加 30 天保險。
- `scripts/server-shared-modules.json`：加入 `src/app/ui/files/office-text/`（頁面與伺服器共用，需 Allen 確認）。

## 8. 階段

1. 探測 `--tests pdfimage`（B 類模型看不看得到 PDF 裡的圖片）——**Allen 執行**。
2. 抽取模組（docx、pptx、xlsx、圖表、圖片）＋套用到 C、D 類與 Excel＋歷史附件處理＋測試。
3. 圖片用量提醒（第一次送出前一句話）。
4. 伺服器 LibreOffice 轉 PDF＋儲存區快取＋刪除＋隱私文件五語言——**Allen 重建沙盒映像檔**（先測試站再正式站）。

## 9. 實測（測試站）

中文 docx、多頁 pptx、含圖表與圖片的檔案、多工作表 xlsx：各類模型答得出內容；LibreOffice 轉換時間（目標 15 秒內）與記憶體。這個環境的 LibreOffice 無法載入檔案，轉換品質只能在測試站驗證。

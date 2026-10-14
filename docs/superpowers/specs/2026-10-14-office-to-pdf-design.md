# Word／PowerPoint 先轉成 PDF 再送給模型（設計，待 Allen 確認）

**狀態：** 設計完成，**尚未動工**（Linear NOU-25）。Allen 已同意：方向（伺服器端用 LibreOffice）、隱私範圍、沙盒映像檔變大。

## 1. 目標

能讀 PDF、但不能直接讀 Word／PowerPoint 的模型，目前先交給「轉譯模型」寫成文字包（約 7000 字上限，會丟內容、要多花一次轉譯費）。改成：先把檔案轉成 PDF，再當 PDF 送。模型看到原文、表格、版面。

**對象（探測 2026-10-14，兩種轉出來的 PDF 都穩定答對）：** hy4-preview、hy3、muse-spark-1.3／1.2-contributor、claude-haiku-5-5、minimax-m3、minimax-m2.7、qwen3.8-max、qwen3.8-flash、qwen3.7-plus。deepseek-v4-flash、deepseek-v4.1-flash、mimo-v2.5、step-5-preview-free 不穩定，不在內，維持轉譯。

**不做：** 本機（瀏覽器）轉換（沒有像樣的工具）；Excel 轉 PDF（表格被切頁，很難看）；OpenRouter 與 Gemini 官方（不動）。

## 2. 在哪裡轉

只在**伺服器端的回覆**（登入、走伺服器；含「關掉頁面也會繼續」的回覆）轉。暫時對話、本機模式、沒有伺服器的情況維持現在的轉譯，**檔案不會離開使用者的瀏覽器**。

轉換用**現有的 Python 沙盒**（`server/sandbox-client.js` 的 mount／run／輸出，沒有網路），**不新增 runner 端點**：把檔案掛進沙盒，跑一步 `soffice --headless --convert-to pdf`，取回 PDF。

```
python: subprocess.run(['soffice', '-env:UserInstallation=file:///tmp/lo', '--headless', '--norestore',
                        '--convert-to', 'pdf', '--outdir', '/output', '/input/<檔名>'], timeout=100)
```

## 3. 流程（`provider-request-support.js` 的 `getUnsupportedSingleDocumentParts` 之後）

1. 目標模型在「Office 轉 PDF」名單（`opencodeModelReadsPdf` 且不在 `OFFICE_API_IDS`），檔案是 docx／pptx（以及 doc、ppt、odt、odp、rtf 之類，先只做 docx、pptx，其餘之後再加）。
2. 注入的 `convertToPdf(part)` 有提供（伺服器端才有）→ 轉；成功則把這個 part 換成 `application/pdf`（檔名改 `.pdf`），不再送轉譯。
3. 失敗（逾時、加密、損壞、沙盒忙到逾時、超過限制）→ **退回轉譯**，並在進度列說「轉成 PDF 失敗，改用轉譯」。不讓回覆失敗。
4. 同一檔案（內容雜湊）轉過的 PDF 快取在該回覆／對話的檔案暫存（`server/file-store.js`），後面幾輪不重轉。

## 4. 限制

單檔 50 MB（沿用附件限制）、轉換 100 秒、一次最多 3 個檔案、轉出的 PDF 超過 50 MB 就退回轉譯；每個使用者同時最多 1 個轉換（沿用沙盒的忙碌排隊）。LibreOffice 在 `USER 65534` 下執行，設定目錄放 `/tmp`。

## 5. 映像檔（Allen 在沙盒主機上重建）

`sandbox-host/Dockerfile` 加：`libreoffice-writer libreoffice-impress --no-install-recommends`（約 400 到 600 MB，放在字型之前，避免字型改動重裝）。字型：沙盒已把 app 的字型（含 `noto-sans-tc`、`noto-sans-sc`、`noto-sans-jp`、`noto-sans-kr`、`lxgw-wenkai-tc`）放進系統字型並 `fc-cache`，LibreOffice 會用到；中文不會變方塊（以測試站實測為準）。重建步驟給 Allen 逐步照做（先測試站再正式，兩者共用同一台主機）。

## 6. 隱私與文件

隱私政策／協助中心五語言各補一段：「用伺服器回覆時，Word／PowerPoint 檔案可能在伺服器的沙盒（沒有網路）轉成 PDF 再送給你選的模型；轉好的 PDF 與原檔一樣按對話保存期限保存或刪除。」`PRIVACY.md` 由英文版產生。

## 7. contract 相容性說明（給 Allen 確認）

- 訊息格式：不變（附件仍是 `inlineData`；轉出的 PDF 只在送出請求時暫時使用，**不寫進對話紀錄**，對話裡仍是使用者原本的檔案）。
- 任務事件：進度列多一種訊息（轉換中／失敗退回）；舊頁面看不懂時顯示原樣文字。
- 權限：不新增；沿用沙盒權限（沒有網路）。
- 刪除：快取的 PDF 隨對話的檔案一起清（`asset-sweeper`）。
- `scripts/server-shared-modules.json`：轉換模組在 `server/`，不需共用；`provider-request-support.js` 只多一個可注入的 `convertToPdf`。

## 8. 測試

- 單元：假沙盒（成功、逾時、加密、太大、沙盒忙）、名單判斷、快取命中、退回轉譯、請求裡送的是 PDF、對話紀錄裡仍是原檔。
- 實測（測試站，Allen 重建映像檔之後）：中文 docx、多頁 pptx、含圖表的檔案，各模型答得出內容；時間（目標 15 秒內）；記憶體。這個環境的 LibreOffice 無法載入檔案，所以實測只能在測試站。

## 9. 待確認

1. 映像檔放在現有沙盒映像檔（建議）還是另做一個只轉檔的小映像檔（要改 runner，不建議）。
2. 第一版只做 docx、pptx，OK？（doc、ppt、odt、odp、rtf 之後再加。）
3. 轉換失敗退回轉譯時是否要跳通知（建議只在進度列顯示，不跳通知）。

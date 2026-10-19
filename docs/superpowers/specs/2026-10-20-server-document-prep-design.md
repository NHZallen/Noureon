# 讀檔與轉譯文件搬到伺服器（關掉頁面也會做完），以及每一步都有自己的文字

**日期：** 2026-10-20
**狀態：** owner 已決定「搬到伺服器」與「文字要改、轉成 PDF 那一步也要有文字」（2026-10-20）。**這份是設計，程式還沒動**（只有 §6 的第一步文字已改）。§4 的「預設決定」等 owner 看過確認。Linear：NOU-67（`contract`）。
**前置閱讀：** [`AGENTS.md`](../../../AGENTS.md)、[先搜一包搬到伺服器](2026-10-07-server-search-packet-design.md)（同一種做法：頁面的步驟搬到伺服器、伺服器沒收就退回瀏覽器）、[檔案轉成模型讀得懂的樣子](2026-10-14-office-to-pdf-design.md)（Word／PowerPoint 轉 PDF、Excel 轉文字）。

## 1. 現況（2026-10-20 讀程式確認）

**回覆送到伺服器之前，瀏覽器先做一輪準備**（`src/app/legacy-runtime/features/provider-request-support.js` 的 `buildSingleModelTranslatedRequestParts`，由 `single-model-response-lifecycle.js` 在 `hasTranslationInputs` 時呼叫；只要訊息有附件、或有網址、或瀏覽器要搜尋就會進來）：

| 步驟 | 畫面文字（`response-progress-renderers.js`，階段名） | 做什麼 | 在哪裡做 |
|---|---|---|---|
| 讀檔 | 正在讀取檔案……（`fileReading`） | 模型不能直接讀的 Word、PowerPoint、Excel，讀成文字與圖片（`officeReader.expandParts`）。瀏覽器的讀取器**沒有** LibreOffice，所以這裡永遠是讀成文字，不會轉 PDF | 瀏覽器 |
| 轉譯文件 | 正在轉換文件……（`documentTranslation`） | 模型不能直接讀、讀檔又讀不了的文件（例如不能讀 PDF 的模型收到 PDF），請「轉譯模型」寫成一份文字資料包（`# Document translation packet`，上限 7000 字） | 瀏覽器 |
| 網址 | （沿用） | 讀訊息裡的網址（`readLinkedPages`） | 瀏覽器 |
| 搜尋 | 正在搜尋網路……（`searchTranslation`） | 瀏覽器搜尋；伺服器版的「先搜一包」已搬上伺服器（17.10.0） | 瀏覽器（伺服器收的話在伺服器） |

準備完才 `serverReply.start(...)`，把已準備好的 `requestParts` 與原始附件 `inputs`（給 Python 用）送上伺服器。

**所以：** 這幾步都發生在伺服器收到工作**之前**。使用者在「正在讀取檔案」「正在轉換文件」時離開頁面，工作就消失了（伺服器根本沒收到），回來什麼都沒有。

**轉成 PDF 是另一條路，而且目前畫面上沒有任何文字。** `server/office-pdf.js` 在伺服器用 LibreOffice（沙盒、沒有網路）把 Word、PowerPoint 轉成 PDF，只給「讀 PDF 比讀 Office 好」的 OpenCode Go 模型（`opencodeModelReadsOfficeViaPdf`，設計文件 B 類）。它在 `stream-api-call.js` 送請求時用（`readableOptions.viaPdf`，伺服器給 `createServerOfficeReader`）。**但目前它只對歷史訊息有作用**：目前這一則的附件在瀏覽器就已經讀成文字了（`expandParts` 沒有 `viaPdf`），到伺服器時已經不是 Office 檔。這和 `2026-10-14-office-to-pdf-design.md`「追問也能讀」之外「當下這一輪也轉 PDF」的意圖不一致。

**畫面文字的問題。**「正在轉換文件」其實是「請轉譯模型讀文件」，不是轉格式，容易讀成轉 PDF；真正轉 PDF 的步驟沒有文字。

## 2. 目標

1. 讀檔、轉譯文件（以及轉 PDF）都由伺服器做；使用者送出後離開頁面，工作照做、回來看得到結果。
2. 每一步在畫面上有準確、各自的文字（五種語言）：讀取檔案、轉成 PDF、請轉譯模型讀取文件。
3. 順便修正：目前這一則的 Word／PowerPoint 也能轉 PDF（給該用 PDF 的模型），不只是歷史訊息。

## 3. owner 的決定（2026-10-20）

1. 讀檔與轉譯文件搬到伺服器。
2. 「正在轉換文件」的文字改掉，轉成 PDF 那一步也要有自己的文字。

## 4. 預設決定（owner 沒說的，先這樣做，不對再改）

1. **沿用「先搜一包」的做法**：伺服器收下就做，**沒收**（沒有雲端帳號、暫時對話、「回覆在這個裝置上」、請求太大、伺服器連不上、協定不符）就照現在的樣子在瀏覽器做，使用者看不到提示。
2. **網址內容（`readLinkedPages`）這次不搬**：它也是離開頁面會中斷的步驟，但你這次只說了文件；另開一張單。搬的方式相同，之後可以接上。
3. **轉譯模型的金鑰上伺服器**：轉譯模型常常和回覆模型不同供應商，要像「先搜一包」的 `searchKeyAlt` 一樣，多送 `secrets.translatorKey`（同樣放進加密的金鑰信封，只在這次回覆用）。
4. **失敗行為沿用現狀**：沒設轉譯模型卻需要轉譯，照現在丟出 `documentTranslatorRequired` 的錯誤結束回覆；轉 PDF 失敗退回讀成文字（`office-pdf.js` 本來就是），再不行才轉譯。
5. **重啟接續**：準備這幾步沒有檢查點，伺服器重啟後從頭做一次（轉 PDF 有快取，轉譯會多花一次模型費用，只在隱私說明提一句，和搜尋一樣）。

## 5. 設計

**伺服器端。** 新模組 `server/document-prep.js`（仿 `server/search-packet.js`）：`withDocumentPrep({ parts, history, access, signal, onPhase })`，在串流呼叫模型**之前**做，所有回覆種類（一般、搜尋、進階）都在 `executeReply` 開頭用同一個入口：

1. 標上附件編號與名稱（`attachment-labels.js`，頁面現在在準備前做的那件事；要確認可以放進共用清單 `scripts/server-shared-modules.json`，沒有瀏覽器全域物件）。
2. 讀檔：`createServerOfficeReader({ userId, signal }).expandParts(parts, { canRead, viaPdf, supportsVision, hasTranslator })`，**這次把 `viaPdf` 帶上**，目前這一則的 Word／PowerPoint 就會轉 PDF（修 §1 的落差）。轉 PDF 開始前 `onPhase('pdf')`，讀成文字時 `onPhase('reading')`。
3. 轉譯文件：模型讀不了的文件（頁面現在的 `getUnsupportedSingleDocumentParts`，把它和 `buildSingleDocumentTranslationPrompt` 搬進共用模組），用轉譯模型與 `secrets.translatorKey` 串流呼叫，產出 `# Document translation packet`（同樣 `truncate` 7000 字，結尾 `\n\n[truncated]`），放進開頭的 `# System-generated supporting context …` 段（和 `withContextSection` 現在的做法一樣）。轉譯期間 `onPhase('translating')`。
4. 完成 `onPhase('')`。

**RunSpec。** `tools.documents`：`'off'`（預設，舊做法）或 `'prepare'`；`tools.translator`：轉譯模型（`provider`、`id`、`info`，格式和理事會 `council.translator` 相同）；`secrets.translatorKey`。`request.currentMessage` 在 `prepare` 時是**原始**訊息（附件還沒讀過）。

**即時事件。** 仿 `ss`（正在搜尋）：`server/runs.js` 加 `live.documentPhase`，事件 `dp`（`'reading' | 'pdf' | 'translating' | ''`），迷你快照 `r.dp`；頁面晚加入時也拿得到現在在哪一步。

**客戶端。**
- `planServerReply`：附件需要準備、且伺服器會收時回傳 `documents: 'prepare'`（轉譯模型有設才行，沒設則照現在退回瀏覽器並維持原有的錯誤行為）。
- `single-model-response-lifecycle.js`：和「先搜一包」一樣，**先決定計畫，計畫是伺服器時，瀏覽器不讀檔也不轉譯**（`hasTranslationInputs` 的附件部分略過），送原始 `userParts`；伺服器沒收就在瀏覽器補做（`baseParts` 的做法）。
- `server-reply.js` 的 `follow` 加 `onDocumentPhase(phase)`，頁面把它畫成同一個等待列（`reply-wait-step`）：`reading` → 讀取檔案、`pdf` → 轉成 PDF、`translating` → 請轉譯模型讀取文件。
- 理事會：成員的附件轉譯與整合已在伺服器（`council-run.js`），不在這次範圍。

**相容性。** 新增 `tools.documents`、`tools.translator`、`secrets.translatorKey`、事件 `dp`，**不升協定版本**：舊伺服器收到未知欄位回 `invalid_run_spec`，客戶端本來就靜默退回本機（圖片、搜尋都驗證過這條路）；舊頁面看到 `dp` 直接忽略。兩邊同時部署的空窗期，最壞是退回瀏覽器做。

**隱私。** 附件在伺服器回覆時本來就上伺服器；新增的是：伺服器會用轉譯模型（使用者自己的金鑰）處理這些文件，並可能在沒有網路的沙盒把 Word／PowerPoint 轉成 PDF（暫存規則見 office-to-pdf §4，不變）。`PRIVACY.md`、協助中心、隱私政策五語言補一句；更新紀錄五語言補一句。

## 6. 文字（五種語言）

| 鍵（`src/app/runtime/i18n/runtime-texts.js`） | zh-TW | en | fr | ru | es |
|---|---|---|---|---|---|
| `waitReadingFiles`（不變） | 正在讀取檔案…… | Reading the files… | Lecture des fichiers… | Чтение файлов… | Leyendo los archivos… |
| `waitConvertingDocs`（**改**，原本「正在轉換文件……」） | 正在請轉譯模型讀取文件…… | Having the translator model read the documents… | Le modèle de traduction lit les documents… | Модель-переводчик читает документы… | El modelo traductor está leyendo los documentos… |
| `waitMakingPdf`（**新**，P2 加） | 正在把文件轉成 PDF…… | Converting the documents to PDF… | Conversion des documents en PDF… | Преобразование документов в PDF… | Convirtiendo los documentos a PDF… |

「改」的那一列已經在 2026-10-20 改好（瀏覽器版現在就用新字）；`waitMakingPdf` 等有伺服器事件的那一步一起加（P2）。

## 7. 風險

- 把 `buildSingleModelTranslatedRequestParts` 的讀檔與轉譯拆成瀏覽器與伺服器共用的模組，要保證兩邊產出的請求內容**一樣**（附件編號、`[Image n]` 標籤、資料包格式）。用同一份測試資料在兩邊各跑一遍對照。
- 轉譯模型的金鑰多一把進信封：信封大小、`checkModel` 對供應商的檢查、`scrubSecrets` 要涵蓋這把。
- 原始附件（base64）已經在 `inputs` 一份；`prepare` 時 `currentMessage` 也帶，要確認 25 MB 請求上限沒有加倍（可能要只放一份，`inputs` 從 `currentMessage` 取）。
- 目前這一則轉 PDF 是**行為變更**（以前 B 類模型收到的是文字）：先在測試站用 B 類模型（例如 Claude Haiku 5.5）傳 Word、PowerPoint 驗證，PDF 裡的圖片模型看得到才算成功（`--tests pdfimage` 探測過）。
- 17.9.1 的教訓：伺服器寫入訊息的 `sequence` 要照 `conversation.messages.length`；這次不新增寫入，但測試要覆蓋。

## 8. 階段（一次一個階段，做完回報；owner 說「上線」才上 `main`）

- **P0：** 小實驗：在伺服器程式碼上用假的模型，跑讀檔（含轉 PDF 的假轉換器）與轉譯，確認共用模組在 Node 能原樣跑（先確認 `attachment-labels.js` 與轉譯 prompt 的函式能進共用清單）；確認 `secrets.translatorKey` 進信封。
- **P1：** 伺服器端：`run-spec.js`、`document-prep.js`、`executor.js`、`runs.js`（`dp`）、共用模組清單與邊界檢查、`tests/server/`。
- **P2：** 客戶端：`planServerReply`、生命週期順序與退回、`follow` 的 `onDocumentPhase`、等待列文字（含 `waitMakingPdf` 五語言）、測試。
- **P3：** 隱私說明、協助中心、更新紀錄（五語言）、全套檢查；owner 驗收清單：傳 PDF 給不能讀 PDF 的模型、傳 Word 給 B 類模型，送出後立刻關頁面、再打開，看回覆是否完成，等待列的三種文字是否正確。

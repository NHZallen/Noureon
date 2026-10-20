# 讀檔與轉譯文件搬到伺服器（關掉頁面也會做完），以及每一步都有自己的文字

**日期：** 2026-10-20
**狀態：** owner 已決定「搬到伺服器」與「文字要改、轉成 PDF 那一步也要有文字」，並確認了 §4 的預設決定、網址內容也一起搬（2026-10-20）。**P0 已完成（§9）**，P1 起還沒動程式（§6 的第一步文字已改）。Linear：NOU-67（`contract`）。
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
2. 每一步在畫面上有準確、各自的文字（五種語言）：讀取檔案、請轉譯模型讀取文件、讀取網址。
3. **不在這次範圍（owner 2026-10-20 決定先不做，只開單 NOU-68）：** 目前這一則的 Word／PowerPoint 也轉 PDF（給該用 PDF 的模型），以及它的等待列文字「正在把文件轉成 PDF……」。這次搬上伺服器**不改變**哪些檔案轉成什麼：照現在，目前這一則只讀成文字或轉譯。

## 3. owner 的決定（2026-10-20）

1. 讀檔與轉譯文件搬到伺服器。
2. 「正在轉換文件」的文字改掉，轉成 PDF 那一步也要有自己的文字。
3. **轉成 PDF 的落差（§1、§9：目前這一則不會轉）先不修，只開單 NOU-68**；轉成 PDF 那一步的文字與 `pdf` 階段跟著 NOU-68 做（那時才有「轉 PDF 發生在伺服器」的地方可以回報）。

## 4. 其他決定（owner 2026-10-20 確認）

1. **沿用「先搜一包」的做法**：伺服器收下就做，**沒收**（沒有雲端帳號、暫時對話、「回覆在這個裝置上」、請求太大、伺服器連不上、協定不符）就照現在的樣子在瀏覽器做，使用者看不到提示。
2. **網址內容（`readLinkedPages`）一起搬**（owner：「一起啊」）：它也是離開頁面會中斷的步驟，做法相同。頁面現在對「這個網址要不要讀」的判斷（`!addressIsForTool` 與判斷模型的 `url` 裁決，伺服器上沒有判斷模型的快取）**由頁面決定後放進 RunSpec**（`documents.linkedPages: true | false`），伺服器照做；讀網頁需要搜尋金鑰（`secrets.searchKey`／`searchKeyAlt`），所以有 `documents` 且 `linkedPages` 為真時也要送。
3. **轉譯模型的金鑰上伺服器**（owner 確認）：轉譯模型常常和回覆模型不同供應商，要像「先搜一包」的 `searchKeyAlt` 一樣，多送 `secrets.translatorKey`（同樣放進加密的金鑰信封，只在這次回覆用）。
4. **失敗行為沿用現狀**（owner 確認）：沒設轉譯模型卻需要轉譯，照現在丟出 `documentTranslatorRequired` 的錯誤結束回覆；轉 PDF 失敗退回讀成文字（`office-pdf.js` 本來就是），再不行才轉譯。
5. **重啟接續**（owner 確認）：準備這幾步沒有檢查點，伺服器重啟後從頭做一次（轉 PDF 有快取，轉譯會多花一次模型費用，只在隱私說明提一句，和搜尋一樣）。

## 5. 設計

**伺服器端。** 新模組 `server/document-prep.js`（仿 `server/search-packet.js`）：`withDocumentPrep({ parts, history, access, signal, onPhase })`，在串流呼叫模型**之前**做，所有回覆種類（一般、搜尋、進階）都在 `executeReply` 開頭用同一個入口：

1. 標上附件編號與名稱（`attachment-labels.js`，頁面現在在準備前做的那件事；要確認可以放進共用清單 `scripts/server-shared-modules.json`，沒有瀏覽器全域物件）。
2. 讀檔：`createServerOfficeReader({ userId, signal }).expandParts(parts, { canRead, supportsVision, hasTranslator })`，**和瀏覽器現在一樣不帶 `viaPdf`**（目前這一則轉 PDF 的落差先不修，NOU-68）。讀成文字時 `onPhase('reading')`。
3. 轉譯文件：模型讀不了的文件（頁面現在的 `getUnsupportedSingleDocumentParts`，把它和 `buildSingleDocumentTranslationPrompt` 搬進共用模組），用轉譯模型與 `secrets.translatorKey` 串流呼叫，產出 `# Document translation packet`（同樣 `truncate` 7000 字，結尾 `\n\n[truncated]`），放進開頭的 `# System-generated supporting context …` 段（和 `withContextSection` 現在的做法一樣）。轉譯期間 `onPhase('translating')`。
3b. 讀訊息裡的網址（`readLinkedPages`，頁面決定要不要讀）：`onPhase('links')`，頁面現有的文字「正在讀取網址」（`readingLinkedPages`）。
4. 完成 `onPhase('')`。

**RunSpec。** 最上層欄位 `documents`（有這個欄位＝伺服器準備；沒有＝舊做法）：`{ linkedPages: 布林（見 §4.2）, translator?: 轉譯模型（provider、id、info，格式和理事會 council.translator 相同） }`；`secrets.translatorKey`（轉譯模型的供應商和回覆模型不同時才要；`keyFor` 認得該供應商，`getModelApiId` 讓轉譯模型用自己的模型編號）。有 `documents` 時 `request.currentMessage` 是**原始**訊息（附件還沒讀過）。**為何放最上層而不是 `tools.*`：**舊伺服器對最上層未知欄位回 `invalid_run_spec`（客戶端靜默退回瀏覽器），但 `tools.*` 底下的未知欄位會被靜默丟掉——舊伺服器就會在沒準備附件的情況下直接回覆。

**即時事件。** 仿 `ss`（正在搜尋）：`server/runs.js` 加 `live.documentPhase`，事件 `dp`（`'reading' | 'translating' | 'links' | ''`；之後 NOU-68 會加 `'pdf'`），迷你快照 `r.dp`；頁面晚加入時也拿得到現在在哪一步。

**客戶端。**
- `planServerReply`：附件需要準備、且伺服器會收時回傳 `documents`（轉譯模型有設才行，沒設則照現在退回瀏覽器並維持原有的錯誤行為）。
- `single-model-response-lifecycle.js`：和「先搜一包」一樣，**先決定計畫，計畫是伺服器時，瀏覽器不讀檔也不轉譯**（`hasTranslationInputs` 的附件部分略過），送原始 `userParts`；伺服器沒收就在瀏覽器補做（`baseParts` 的做法）。
- `server-reply.js` 的 `follow` 加 `onDocumentPhase(phase)`，頁面把它畫成同一個等待列（`reply-wait-step`）：`reading` → 讀取檔案、`translating` → 請轉譯模型讀取文件、`links` → 讀取網址（現有文字）。
- 網址內容：頁面不再在瀏覽器讀（計劃是伺服器時），送 `documents.linkedPages`；伺服器沒收就在瀏覽器補讀。
- 理事會：成員的附件轉譯與整合已在伺服器（`council-run.js`），不在這次範圍。

**相容性。** 新增最上層 `documents`、`secrets.translatorKey`、事件 `dp`，**不升協定版本**：舊伺服器收到未知欄位回 `invalid_run_spec`，客戶端本來就靜默退回本機（圖片、搜尋都驗證過這條路）；舊頁面看到 `dp` 直接忽略。兩邊同時部署的空窗期，最壞是退回瀏覽器做。

**隱私。** 附件在伺服器回覆時本來就上伺服器；新增的是：伺服器會用轉譯模型（使用者自己的金鑰）處理這些文件，並可能在沒有網路的沙盒把 Word／PowerPoint 轉成 PDF（暫存規則見 office-to-pdf §4，不變）。`PRIVACY.md`、協助中心、隱私政策五語言補一句；更新紀錄五語言補一句。

## 6. 文字（五種語言）

| 鍵（`src/app/runtime/i18n/runtime-texts.js`） | zh-TW | en | fr | ru | es |
|---|---|---|---|---|---|
| `waitReadingFiles`（不變） | 正在讀取檔案…… | Reading the files… | Lecture des fichiers… | Чтение файлов… | Leyendo los archivos… |
| `waitConvertingDocs`（**改**，原本「正在轉換文件……」） | 正在請轉譯模型讀取文件…… | Having the translator model read the documents… | Le modèle de traduction lit les documents… | Модель-переводчик читает документы… | El modelo traductor está leyendo los documentos… |
| `waitMakingPdf`（**新，先不加**：跟 NOU-68 一起） | 正在把文件轉成 PDF…… | Converting the documents to PDF… | Conversion des documents en PDF… | Преобразование документов в PDF… | Convirtiendo los documentos a PDF… |

「改」的那一列已經在 2026-10-20 改好（瀏覽器版現在就用新字）；`waitMakingPdf` 等 NOU-68（目前這一則也轉 PDF）一起加：現在沒有任何一步會在等待列顯示轉 PDF，加了也沒有地方用。

## 7. 風險

- 把 `buildSingleModelTranslatedRequestParts` 的讀檔與轉譯拆成瀏覽器與伺服器共用的模組，要保證兩邊產出的請求內容**一樣**（附件編號、`[Image n]` 標籤、資料包格式）。用同一份測試資料在兩邊各跑一遍對照。
- 轉譯模型的金鑰多一把進信封：信封大小、`checkModel` 對供應商的檢查、`scrubSecrets` 要涵蓋這把。
- 原始附件（base64）已經在 `inputs` 一份；`prepare` 時 `currentMessage` 也帶，要確認 25 MB 請求上限沒有加倍（可能要只放一份，`inputs` 從 `currentMessage` 取）。
- 目前這一則轉 PDF 的行為變更**不在這次**（NOU-68）；這次搬上伺服器的結果要和瀏覽器現在**一模一樣**（P1 的測試用同一份資料在瀏覽器與伺服器對照）。
- 17.9.1 的教訓：伺服器寫入訊息的 `sequence` 要照 `conversation.messages.length`；這次不新增寫入，但測試要覆蓋。

## 8. 階段（一次一個階段，做完回報；owner 說「上線」才上 `main`）

- **P0（✅ 已完成，§9）：** 小實驗：在伺服器的模組上用假的模型，跑讀檔（含轉 PDF 的假轉換器）與轉譯，確認準備函式在 Node 原樣可跑；確認 `secrets.translatorKey` 進信封。
- **P1：** 伺服器端：`run-spec.js`（最上層 `documents`、`secrets.translatorKey`）、`document-prep.js`（用 `createProviderRequestSupport` 的 `buildSingleModelTranslatedRequestParts`；階段回報 `reading`／`translating`／`links`；**不帶 `viaPdf`**）、`model-access.js`（`keyFor` 認得轉譯模型的供應商）、`executor.js`（開頭呼叫）、`runs.js`（`dp`）、`tests/server/`。
- **P2：** 客戶端：`planServerReply`、生命週期順序與退回、`follow` 的 `onDocumentPhase`、等待列文字（沿用現有的三個，轉譯那個已經改好）、測試。
- **P3：** 隱私說明、協助中心、更新紀錄（五語言）、全套檢查；owner 驗收清單：傳 PDF 給不能讀 PDF 的模型、傳 Word 給讀不了 Word 的模型、訊息裡放網址，送出後立刻關頁面、再打開，看回覆是否完成，等待列的文字是否正確。

## 9. P0 結果（2026-10-20）

（下面 B、B2 發現的落差，owner 決定先不修，開單 NOU-68；這次搬上伺服器不改變它。）

在 scratchpad 寫了一支腳本（`p0.mjs`），用**伺服器自己的模組**（`createServerOfficeReader`、`setOfficePdfConverter` 放一個假的轉換器）加假的轉譯模型，把頁面現在的準備函式跑了一遍：

- **不需要新的共用模組。** `provider-request-support.js`、`linked-pages.js`、`web-page-text.js`、`attachment-labels.js`、`decision-store.js`、`office-reader.js` 都**已經在** `scripts/server-shared-modules.json`（理事會在用）。`createProviderRequestSupport` 是依賴由外面注入的工廠，伺服器直接用它，不重寫一份。
- **A（轉譯）：** 一份 PDF 給不能讀 PDF 的模型（NVIDIA 版 DeepSeek V4.1 Flash），轉譯模型被呼叫、收到那份 PDF（用途 `background-attachment-translation`），請求最後多了 `# System-generated supporting context …` 段；階段是 `documentTranslation`。和瀏覽器一樣。
- **B（轉 PDF 的落差，已證實）：** 一個 Word 檔給「讀 PDF 比較好」的 OpenCode 模型（`claude-haiku-5-5`），照現在的呼叫：階段只有 `fileReading`，**LibreOffice 轉換 0 次**，請求裡是讀出來的文字。也就是目前這一則的 Word／PowerPoint 確實不轉 PDF。
- **B2：** 同一個檔，給 `expandParts` 帶上 `viaPdf`（`opencodeModelReadsOfficeViaPdf`）：轉換 1 次，請求裡是 `report.pdf`（`application/pdf`）。**修法是在 `buildSingleModelTranslatedRequestParts` 的 `expandParts` 呼叫加 `viaPdf`（瀏覽器的讀取器沒有轉換器，所以瀏覽器行為不變）；先不做，NOU-68。**
- **階段文字：** 轉 PDF 發生在 `expandParts` 裡面，現在沒有任何進度回報；NOU-68 做的時候要在伺服器的轉換器外面包一層，轉換開始前回報 `pdf`。
- **金鑰：** `key-vault.js` 的 `seal(secrets)` 把整個 `secrets` 物件序列化加密，`secrets.translatorKey` 自動在信封裡；`scrubText` 會走訪 `secrets` 的每個字串，所以這把金鑰在錯誤訊息與日誌裡也會被遮掉。不需要改。
- **待 P1 注意：** `keyFor`（`model-access.js`）只認回覆模型的供應商與搜尋供應商，要加上轉譯模型的供應商（`translatorKey`；同供應商就用 `providerKey`）。`inputs`（給 Python 的附件）與 `currentMessage` 的附件可能重複計入請求大小，P1 要看一下（現在已經有這個重複，不會比現在更糟）。

## 10. P1、P2 結果（2026-10-20）

**P1（伺服器，`2dd19014`）：** `server/document-prep.js`（用頁面同一份 `buildSingleModelTranslatedRequestParts`，不帶 `viaPdf`）、`run-spec.js`（最上層 `documents`、`secrets.translatorKey`）、`model-access.js`（`keyFor` 認得轉譯模型的供應商、`getModelApiId` 認得轉譯模型）、`executor.js`、`runs.js`（`dp`，晚加入的頁面在快照拿得到）；`tests/server/server-document-prep.test.js`。**注意：**伺服器本來就會把 Word 讀成文字（`stream-api-call` 的 `officeReader`），所以沒有 `documents` 時行為不變；`documents` 帶來的是轉譯、讀網址和步驟回報。

**P2（客戶端）：**
- `planServerReply` 多兩個參數 `documentsToPrepare`、`hasTranslator`，兩者皆真且計劃可行時回傳 `documents: true`（沒設轉譯模型就維持原本在瀏覽器準備，錯誤訊息也是原本的）。
- `single-model-response-lifecycle.js`：`documentsToPrepare` ＝訊息有附件，或有要讀的網址（`readsAddresses`）。計劃是伺服器準備時，瀏覽器**不呼叫** `buildSingleModelTranslatedRequestParts`，送原始 `userParts` 與 `documents: { linkedPages }`；`follow` 的 `onDocumentPhase` 把 `reading`／`translating`／`links` 畫成頁面原本的 `fileReading`／`documentTranslation`／`linkedPages` 三個階段（前兩個有自己一行字，網址那個是原本的圓點），步驟結束（`''`）回到一般等待。
- 伺服器沒收（連不上、忙碌、缺轉譯模型供應商的金鑰、要讀網址卻沒有搜尋金鑰、請求太大）：瀏覽器把**整則**訊息準備一次（不是 `baseParts`），搜尋封包若本來就要在伺服器做，也在這一次一起補上。
- `begin`（`server-reply.js`）：有 `documents` 時組 `documents.translator`（`{ provider, id, info }`），轉譯模型和回覆模型不同供應商時送 `secrets.translatorKey`；`linkedPages` 為真時送搜尋金鑰；缺金鑰就不送、安靜退回瀏覽器。
- `server-reply-runtime.js`：多收 `getSingleDocumentTranslatorModel`（`submit-input-council-lifecycle.js` 一行接上），`plan` 用它填 `hasTranslator`，`start` 用它填 `documents.translator`。
- 測試：`tests/server-reply.test.js`（計劃、請求內容、金鑰規則、`dp` 事件、runtime 接線）、`tests/single-model-response-lifecycle.test.js`（送原始訊息、不在瀏覽器準備、顯示階段、沒收時整則補做、與搜尋封包一起退回）。

## 11. P3 結果與驗收清單（2026-10-20）

**P3：** 五語言的隱私政策（§8 新增「附件與網址的準備」一條，`PRIVACY.md` 由它產生）與協助中心（附件那段：Word／PowerPoint／Excel 在瀏覽器或伺服器讀、轉譯與網址由伺服器代做、轉譯模型金鑰只為這次回覆送上去）。**更新紀錄和版本不在功能分支改**（`AGENTS.md`：Allen 發佈時彙整）；更新紀錄草稿見 NOU-67 留言。

**owner 在 `staging.noureon.com` 驗收（雲端帳號登入、設好「單模型文件轉譯模型」、回覆在伺服器）：**
1. 回覆模型選 NVIDIA 的 DeepSeek（讀不了 PDF／Word），傳一份 PDF 問內容：等待列依序「正在請轉譯模型讀取文件……」，答案有引用 PDF 的內容。
2. 傳一份 Word（內容有幾個獨特的詞）：等待列「正在讀取檔案……」，答案用到那幾個詞。
3. 訊息裡放一個網址（模型是 OpenRouter 或 NVIDIA 的）：答案有用到網頁內容，來源列出現該網頁。
4. 上面任一個，**送出後立刻關閉頁面（或鎖屏）**，過一分鐘再打開：回覆已經完成；不是空白、也不是停在準備中。
5. 在設定把「單模型文件轉譯模型」清空（若可以）再傳 PDF：和以前一樣，在瀏覽器準備，並出現原本的「需要轉譯模型」錯誤（沒有設的人本來就是這樣）。
6. 設定 → 隱私把回覆改成「只在這個裝置」：和以前一樣，在瀏覽器讀取，行為沒變。


## 12. NOU-68：目前這一則的 Word／PowerPoint 也轉成 PDF（2026-10-20）

§9 發現的問題修好了：給「讀 PDF 比讀 Office 好」的模型（`opencodeModelReadsOfficeViaPdf`）時，目前這一則和歷史訊息一樣轉成 PDF。

- 讀取：`provider-request-support.js` 多一個依賴 `modelReadsOfficeViaPdf`，`expandParts` 帶上 `viaPdf`。
  - 伺服器（`server/document-prep.js`）和頁面（`settings-auth-provider-lifecycle.js`）都注入 `opencodeModelReadsOfficeViaPdf`。
  - 頁面的讀取器沒有轉換器，所以照舊讀成文字。理事會（`server/council-run.js`）的讀取器也沒有轉換器，沒有改。
- 進度：`createServerOfficeReader` 收一個 `onConvert`，轉換前呼叫。`withDocumentPrep` 用它回報新階段 `pdf`。
  - 頁面：`DOCUMENT_STAGES.pdf → makingPdf`，等待列顯示 `waitMakingPdf`（五語言：正在把文件轉成 PDF……／Converting the documents to PDF…／Conversion des documents en PDF…／Преобразование документов в PDF…／Convirtiendo los documentos a PDF…）。
- 範圍（Allen 決定一起處理）：
  - 沒設轉譯模型時，只要這則訊息有 Word／PowerPoint，而且模型讀 PDF 比較好，`planServerReply` 的 `officeViaPdf` 也讓伺服器準備檔案，由伺服器轉 PDF。
  - 伺服器沒接手時，頁面照舊讀成文字。
- 測試：
  - `server-document-prep`：假轉換器，Word 給 `opencode-go/claude-haiku-5-5`，轉換 1 次，請求裡是 PDF，階段依序是 `reading`、`pdf`。
  - `server-reply`：`officeViaPdf`。
  - `single-model-response-lifecycle`：`pdf` 階段，以及 B 類模型才帶 `officeViaPdf`。
  - `response-progress-renderers`：新文字。
- 協助中心（五語言）：補上「送出的那一則就會轉，追問時看到的是同一份」。
- 驗收（staging，B 類模型傳 Word、PowerPoint）：
  - 等待列出現「正在把文件轉成 PDF……」。
  - 模型看得到 PDF 裡的圖片。
  - 追問時看到的樣子與第一次一致。

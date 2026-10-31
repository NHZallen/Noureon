# 專案檔案的完整檢索：圖片、影片、聲音、文件都能查，接上向量（計劃書）

- 日期：2026-11-01。狀態：**只有計劃，一行程式都還沒寫**。要求的人：Allen（owner）。
- 前提（已經做好、在 `staging`）：模型自己查專案裡的文字類檔案（關鍵字搜尋＋讀取工具），頁面與伺服器都能做。設計與做法見 `docs/superpowers/specs/2026-10-31-projects-design.md` §16。交接手冊：`docs/superpowers/plans/2026-11-01-projects-handoff.md`。

## 1. Allen 的要求（原話意思）

1. 圖片、影片、聲音**跟檔案一樣能被檢索**，模型自己找、自己拿，不是每次回覆整批塞進去。
2. **接上向量**：文字、圖片、影片、聲音、文件（PDF 等）都要能用向量找。
3. 模型能**主動拿**圖片（需要時才要）。
4. 議會的成員也要能查專案檔案。
5. 之前已定的規則照舊：看不懂圖的模型不讀圖片，也不用別的模型先替它讀；檔案存雲端，關掉頁面也能用。

## 2. 現況（要先搞懂的事實，都在程式裡確認過）

- **8 MB 的意思**：`PROJECT_FILES_REPLY_BYTES_MAX`（`src/app/runtime/projects/project-source-files.js`），**只管專案的檔案**，一次回覆能原樣附上的專案檔案總量。輸入框裡附的圖片／檔案**不算在裡面**（它們走聊天附件那套）。整個請求另外有上限：伺服器 `maxRequestBytes` 25 MB（`server/protocol.js`），供應商也各有各的限制。
- **現在 8 MB 管什麼**：工具模式下只管「查不了的檔案」（圖片、掃描 PDF、影片、聲音、其他沒有文字的檔案）；沒有工具能力的模型或供應商自己搜尋時，則管所有專案檔案。
- **現在的搜尋**：文字類檔案切成約 900 字一段，BM25 關鍵字排序（`src/data/project-files-tool.js`、`src/app/runtime/memory-notes/bm25.js`），沒有用向量。圖片等沒有文字，搜不到，也**沒有讓模型主動要圖的工具**；看得懂圖的模型每次回覆自動拿到所有放得下的圖。
- **向量的現成設施（可以直接用）**：
  - 嵌入模型 Gemini Embedding 2（直連 Google 或經 OpenRouter），`src/app/runtime/memory-store/embedding-client.js`：`embed(texts)` 與 `embedMedia(media)`（圖片、影片、聲音、PDF 各自一個請求）。
  - 頁面的向量庫與建立流程：`src/app/runtime/memory-store/page-vectors.js`（本機 IndexedDB `vector-store.js`；可選同步到雲端表 `workspace_memory_vectors`，768 維，`piece_id` 是自訂文字最長 300 字，鍵是 `(user_id, piece_id)`；`failed` 欄位標記模型讀不了的檔案，不再重試）。
  - 過去對話的附件已經用這套進向量：`src/app/runtime/memory-notes/media-pieces.js`（`mediaPiecesOf`：一個附件一個 piece，帶位元組與一行說明）。
  - 伺服器端查向量：`server/memory-history.js` 呼叫資料庫函式 `match_workspace_memory_vectors`，查詢字串用回覆請求帶來的 embedding 金鑰（只活在這次回覆）現算向量。
  - 排序合併：`src/app/runtime/memory-notes/vector-math.js` 的 `fuseRanks`、`topByCosine`。
  - **同意與金鑰**：向量功能預設關，要使用者明確同意（設定 → 記憶，`settings.vector.enabled` 與 `consentAt`），並有 Gemini／OpenRouter 的金鑰。專案檔案的向量必須走**同一個同意**，不能另開後門。
- **模型看圖的現成機制**：文字模型有「自己找圖、看圖」的工具與圖片編號（`docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md`、`src/data/conversation-pictures.js`、`src/data/picture-steps.js`）。要做「模型主動拿專案圖片」之前先讀它，**能接上就接上，不要另做一套**。

## 3. 目標做法

### 3.1 一套索引，兩種來源

每個專案來源切成 **pieces**，統一放進同一個搜尋：

| piece 種類 | 內容 | 關鍵字（BM25）| 向量 |
|---|---|---|---|
| 文字段 | 文字、文字檔、PDF 文字層、Office 的一段（約 900 字） | 有 | 有（嵌入那段文字） |
| 圖片 | 一張圖 | 只有檔名與使用者給的說明（見 §6 問題 1） | 有（`embedMedia`） |
| 影片 | 每一段時間窗（例如每 N 秒一段，**N 要按嵌入模型的上限定**） | 同上 | 有，附起點秒數 |
| 聲音 | 同影片 | 同上 | 有，附起點秒數 |
| 文件頁 | 沒有文字層的 PDF（掃描）逐頁，或整份 | 無 | 有 |

- `piece_id`：`src:<來源id>:<序號>`（≤300 字）；`hash`＝內容雜湊，內容變了就重建；`failed` 沿用（模型讀不了／太大，標記後不再試）。
- **嵌入模型的實際限制（影片／聲音最長多久、單檔多大、PDF 幾頁）要先查供應商文件再寫程式**，不要憑記憶；`media-pieces.js` 的 `MAX_MEDIA_CHARS`（約 9 MB 檔案）是現在對聊天附件用的保守值，可以沿用或調。

### 3.2 搜尋工具變混合式

`search_project_files`（`src/data/project-files-tool.js`）改成：

- 關鍵字（BM25）與向量（`topByCosine`）各自排序，用 `fuseRanks` 合併，一個檔案最多出幾個 piece。
- 回傳每個命中：檔名、種類（text／image／video／audio／document）、位置（字元起訖，或影片聲音的起點秒數，或頁碼）、說明或文字片段、分數層級。
- 沒開向量（沒同意或沒金鑰）時：文字類仍用關鍵字查；圖片等只能靠檔名與說明查，並在清單上老實標出「未建立向量索引」，**不假裝查過**。
- 查詢向量：頁面用自己的金鑰；伺服器用請求帶來的 `embeddingKey`（現成機制，`tools.memory.vector` 那條路），只活在這次回覆。

### 3.3 讓模型主動拿媒體：`view_project_file`

新工具（與 `read_project_file` 並列）：`view_project_file({ file, at?, page? })`。

- 圖片：回傳這張圖給模型的下一輪看（只有**看得懂圖**的模型才提供這個工具與列出圖片；不看圖的模型清單裡就沒有圖片，維持「不用別的模型先讀」）。
- 影片／聲音：只對**能直接吃該格式**的模型提供（以 `modelSupportsUploadedFile(modelInfo, inlineData)` 判斷），從 `at` 秒起的一小段；其他模型不提供，不轉文字。
- 文件頁：掃描 PDF 的某一頁當圖片給。
- **每次回覆能拿多少**要有上限（沿用 8 MB 這個數字，但意思改成「這次回覆模型主動拿的媒體總量」），超過就告訴模型已達上限。
- 實作的難點：現有工具回傳的是**純文字**，要把圖片放進工具結果讓下一輪看到，要看 `docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md` 那套是怎麼讓模型看圖的，沿用它的傳遞方式；供應商各自的「工具結果帶圖」格式不同（OpenAI 系、Anthropic、Gemini），**先做一家驗證再擴**。
- 做完後，**工具模式下不再自動附上所有圖片**（現在 `withProjectFiles` 會附）；改成清單列出圖片，讓模型用搜尋與 `view_project_file` 拿。沒有工具能力的模型仍走舊做法（自動附，8 MB 額度）。

### 3.4 什麼時候建索引

- 加入來源時（頁面）：文字類取文字、切段；若向量已同意且有金鑰，排隊嵌入（沿用 `page-vectors.js` 的批次、暫停、失敗計數）。
- 沒同意向量時不嵌入任何東西，**一個位元組都不送出**。之後使用者同意了，補建。
- 刪來源／刪專案：本機向量與雲端 `workspace_memory_vectors` 裡 `src:<來源id>:%` 一起刪（雲端要加資料庫函式或在刪專案的資料庫函式裡處理，同 `20261031130000_drop_project_notes_with_project.sql` 的做法）。
- 進度顯示：來源列上顯示「索引中／已建立／未建立（未同意）／此檔案無法建立」；整個專案頁顯示一行進度。

### 3.5 伺服器（關掉頁面也能用）

- 向量要**同步到雲端**（設定裡既有的「同步向量」開關）伺服器才查得到；沒同步時伺服器只能做關鍵字，並在步驟列說明。
- 伺服器取媒體：`files.load`（同現在文字類檔案）從 `user-assets/<使用者>/<雜湊>` 讀位元組，給 `view_project_file`。
- 伺服器查詢向量：沿用 `match_workspace_memory_vectors`，加一個 piece_id 前綴過濾（只看這個專案的 `src:` 且屬於清單內的來源）——**資料庫函式要新增或改，需要 migration**，並限定只回這個使用者自己的資料。
- 請求欄位：`tools.projectFiles.entries[]` 要多帶每個來源的種類與（有的話）向量索引狀態；`run-spec.js` 同步更新與驗證。

### 3.6 議會

議會成員目前沒有專案檔案工具（成員只拿到原樣附上的檔案）。做法跟單一模型一樣，但要動：

- 議會請求（`server/run-spec.js` 議會那段，目前有「已知欄位」白名單，**不加進去會被拒絕**）加 `tools.projectFiles`；
- `server/council-run.js` 的 `loadersFor`：把專案檔案工具與技能、連接器的 loader 一起 `combineLoaders` 給每個成員；
- 頁面議會（`src/app/runtime/council/`）與頁面送給伺服器議會的請求（`server-council.js`）；
- 議會的成員工具原則（見 `docs/superpowers/specs/2026-10-19-council-tools-design.md`）：成員只能讀，不能改東西；專案檔案工具是唯讀，符合。

## 4. 分階段（建議順序，每階段單獨測、單獨推 staging）

1. **R1 文字段向量**：專案文字段進向量（頁面），搜尋改混合式，伺服器查雲端向量。這一階段沒有任何新種類的檔案，風險最小，也最快看到「查得更準」。
2. **R2 圖片進向量**：加入圖片時 `embedMedia`；搜尋能命中圖片（回檔名與說明）；清單與進度顯示。
3. **R3 `view_project_file`（圖片）**：先做一家供應商，驗證「工具結果帶圖」；工具模式不再自動附圖。
4. **R4 影片與聲音**：時間窗切段、進向量、`view_project_file` 帶起點秒數（只對吃得下的模型）。
5. **R5 掃描 PDF**：逐頁當圖片嵌入與取用。
6. **R6 議會**（§3.6）。
7. **R7 收尾**：隱私權政策與協助中心（五語；送出內容多了「圖片、影片、聲音送去嵌入模型」）、`PRIVACY.md` 重新產生、設計文件、Linear contract 註記、全套檢查。

每階段都要：測試（單元＋伺服器＋資料庫）、`npm test`、`npm run build`、`check:sizes`（最大 JS 區塊目前 289 KB，上限 300 KB，**新模組一律動態載入**）、`check:shell`、`check:server`（新共用模組要列進 `scripts/server-shared-modules.json`）、`npm run lint`、`npm audit --omit=dev`。

## 5. 隱私與費用（要在畫面與政策寫清楚）

- 向量功能本來就要同意；專案檔案**沿用同一個同意**。同意的說明要加上「專案裡的圖片、影片、聲音、文件會送去嵌入模型（Google，或經 OpenRouter）」。
- 費用：嵌入是用使用者自己的金鑰，大檔案（長影片、長聲音）會花錢。加入前要顯示預估（檔案大小與段數），超過門檻要問。
- 伺服器暫存：文字類沿用「只在記憶體」；媒體位元組**不暫存**，用完即丟。

## 6. 需要 Allen 決定的問題

1. **圖片的關鍵字從哪來？** 圖片本身沒有字。選項：(a) 只用檔名＋使用者可以自己加的說明，其餘靠向量；(b) 加入時請**能看圖的模型**產生一句說明存起來（會多花錢，也跟「不用別的模型先讀圖」的精神衝突，所以預設不做）。建議 (a)，(b) 另開開關。
2. **工具模式不再自動附圖**之後，使用者問「這張圖是什麼」時模型要自己想到去 `view_project_file`。要不要在清單上讓小圖（例如 ≤ 數百 KB）仍自動附上？
3. **影片時間窗長度與上限**（先查嵌入模型文件）、單檔大小上限、一個專案的媒體總量上限（現在是 100 MB 原檔）。
4. 向量要不要**預設為專案檔案開一個「不查向量，只用關鍵字」的選項**？（省錢、省隱私。）

## 7. 風險

- **工具結果帶圖**各供應商格式不同，是最大的未知數；先一家、再擴，不要一次全做。
- 伺服器讀大媒體會吃記憶體與時間；要有逾時與大小上限，失敗要明說，不要讓整個回覆卡住。
- 向量表 `workspace_memory_vectors` 是共用的（過去對話與專案檔案同表），**有三個具體的雷，R1 要一起處理**：
  1. **清理會誤刪**：頁面每次同步向量都會 `prune(keepIds)`（`src/app/runtime/memory-store/vector-store.js` 的 `prune`、`vector-sync.js` 的 `prune`，本機與雲端各一個），把「不在目前對話 pieces 裡的向量」全刪。專案的 `src:` 向量放進同一個庫，**下一次同步就會被當成孤兒刪光**。要改成只清自己那一類（對話 pieces 清對話的、專案來源清專案的），或把專案向量放到另一個庫／另一張表。
  2. **查詢會被擠掉名額**：頁面與伺服器查向量都是先取前 N 名（頁面 `limit*4`、資料庫函式最多 100）再過濾；`match_workspace_memory_vectors` 沒有前綴參數。專案向量不會被當成對話結果回傳（對不上 id 會被略過），但會占掉名額，讓過去對話的搜尋變差，反過來也一樣。要新增帶前綴過濾的查詢（migration），或分表。
  3. **刪來源／刪專案要連向量一起刪**（本機與雲端 `src:<來源id>:%`），且不能影響對話的向量。
- 舊伺服器收到新欄位會默默忽略（單一回覆）或拒絕（議會）：**每階段都要提醒 Allen 重建並重新部署伺服器（映像要重建）**，否則頁面與伺服器行為不一致。

## 8. 測試計畫

- 工具：混合排序、只有關鍵字時的行為、命中媒體的回傳格式、上限與錯誤字句（`tests/project-files-tool.test.js` 擴充）。
- 頁面：加入來源時排隊嵌入、沒同意不送出任何東西、刪來源刪向量、失敗標記不重試（仿 `tests/memory-notes/vectors.test.js`）。
- 伺服器：`tools.projectFiles` 新欄位驗證、向量查詢前綴過濾、只讀自己的資料、媒體不暫存（仿 `tests/server/server-project-files.test.js`、`server-memory-history.test.js`）。
- 資料庫：新 migration 用 `tests/database/` 的 PGlite 測（仿 `tests/database/project-instructions.test.js`、`memory-vectors.test.js`）。
- 議會：請求驗證不再拒絕、成員拿得到工具（仿議會工具的既有測試）。

## 9. Allen 的決定（2026-11-01）與計劃的修改

回答 §6 的問題後定下的，**以這一節為準，與前面衝突的地方照這一節**：

1. **R3 一次到位**：`view_project_file` 同時做四種供應商格式（Messages、Chat、Responses、Gemini），不先做一家。工具結果帶圖的共用模組（`src/data/tool-result.js`、`features/tool-call-formats.js`、`reply/anthropic-messages-format.js`）在做文字模型畫圖時已經有了，直接用。
2. **圖片、影片、聲音、純圖片檔案（掃描 PDF 等）維持原本「隨訊息附上」的做法，額度由 8 MB 提高到 10 MB，四種共用同一份額度**。§3.3 末段「工具模式下不再自動附上所有圖片」**取消**。文字類檔案仍是工具模式，不變。
3. **向量照做，用途是「額度放不下時找得到、挑得準」**：媒體超過 10 MB 時，有向量就依這次問題的相關度挑要附哪幾個（沒有向量就照加入順序），其餘留在清單，模型用 `search_project_files` 與 `view_project_file` 自己拿。
4. **沒有向量模型（沒金鑰或沒同意）就只用關鍵字，不提供另外的開關**。同意仍是向量功能原有的那一個。
5. **嵌入不另外詢問費用**：每檔上限內的直接嵌入；超過每檔上限的不嵌入，標成「太大」。專案單檔 20 MB、全部 100 MB 的上限不調。
6. **專案這條線先不上線**；每個階段都推 `staging` 給 Allen 試過，才做下一個階段。
7. 沿用：看不懂圖的模型不讀圖片，不用別的模型先替它讀；向量沿用同一個同意。

### R1 的做法（文字段向量，2026-11-01 開工）

- **piece 的編號**：`src:<來源 id>:<段落序號>`，序號是 `passagesOf` 切出來的順序；`hash` 是該段文字的 `textHash`。搜尋工具與建立向量用**同一個函式** `projectPassages`（`src/data/project-files-tool.js`），所以兩邊的編號一定對得上。
- **頁面**：`runtime/projects/project-pieces.js` 把所有專案的可搜尋來源切成 pieces，交給頁面向量庫（`page-vectors.js`）一起建（`worth()` 多一種 piece；`prune` 因此不會把它們刪掉；過去對話的搜尋要略過它們）。來源新增、刪除、專案刪除時觸發重建。
- **搜尋**：`search_project_files` 把關鍵字（BM25）與向量的結果用 `fuseRanks` 合併；向量的結果只在 `hash` 與現在的文字相同時才算；步驟與回傳寫明這次是只用關鍵字還是也用了語意。
- **伺服器**：`tools.projectFiles.vector = { provider }` 加上 `secrets.embeddingKey`（只活在這次回覆）；`server/project-vectors.js` 把問題算成向量，呼叫新的資料庫函式 `match_project_vectors`（只回這個使用者、這幾個來源的 `src:` piece）。沒同步向量時只用關鍵字。
- **資料庫**：新函式 `match_project_vectors`；既有的 `match_workspace_memory_vectors`（過去對話用）改成**排除 `src:` 開頭**，否則專案的向量會擠掉過去對話的搜尋結果；刪專案時，專案來源的向量一併刪除。

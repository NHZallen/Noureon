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

### R2 的做法（圖片進向量，2026-11-01）

- **額度**：`PROJECT_FILES_REPLY_BYTES_MAX` 8 → 10 MB（圖片、影片、聲音、純圖片檔案共用，沒有別處寫死 8 MB）。
- **圖片的 piece**：一張圖一個 piece，`src:<來源 id>:0`（文字段是 `0..n`，同一個來源不會兩種都有）；`hash` 是 `mediaPieceHash(檔案雜湊)`（`src/data/project-files-tool.js`，頁面與伺服器共用，伺服器不用位元組就能核對向量是不是這個檔案的）。位元組不放在 piece 裡，輪到嵌入時才用 `loadMedia()` 讀（頁面向量 `page-vectors.js` 的 `isMedia`）。單檔上限 9 MB（`PROJECT_MEDIA_EMBED_BYTES_MAX`，與聊天附件同值），超過的不送，標成「太大」；向量圖（SVG）不送；模型讀不了的（400／413／415／422）標 `failed`，不再重試；現在讀不到位元組的下次再試。沒同意向量時一個位元組都不送。
- **超額時挑哪幾個**：`projectFilePartsFor` 在檔案放不下時，用 `deps.rank(問題, 來源 id)`（頁面向量的 `rankProjectSources`，依最近的圖片 piece 排）決定先附哪幾個，其餘照加入順序；放得下就不查向量。`onPicked({ attached, left, ranked })` 告訴回覆實際附上了哪些。
- **搜尋命中圖片**：`search_project_files` 的結果多一個 `pictures`（檔名、`in_this_message`：這張圖有沒有跟著這次訊息附上），圖片靠檔名的字與向量（hash 對得上才算）。**沒有 `view_project_file` 之前，沒附上的圖模型看不到**（結果與清單都這樣寫明），那是 R3。專案只有圖片、沒有任何文字來源時還沒有搜尋工具（R3 會改）。
- **伺服器**：`tools.projectFiles.media`（`[{ id, name, size, fileHash, attached }]`）進 `run-spec.js` 驗證與 `executor.js` 的 loader；資料庫不用改（`match_project_vectors` 本來就是 `src:<id>:` 前綴）。
- **畫面**：來源列多一行索引狀態（索引中、已建立索引、無法建立索引、檔案太大未建立索引），只在向量開著時出現；向量建完自動更新那一行，不重畫整頁。

### R3 的做法（`view_project_file`，2026-11-01）

- **工具**：`view_project_file({ file })`（`src/data/project-files-tool.js`），只對**看得懂圖**的模型提供（頁面用 `supportsVision(modelInfo)` 算出 `canViewPictures`，伺服器用請求的 `tools.projectFiles.canView`），且專案裡要有圖片。回傳 `{ content, images: [{ label, mimeType, data }] }`，也就是文字模型畫圖時已有的「工具結果帶圖」那條路（`data/tool-result.js`）；**四種格式（Gemini、Chat、Responses、Messages）本來就接好了**，這一階段只加測試確認 `view_project_file` 的結果每一種都到得了模型。
- **給模型的是縮圖**，不是原檔：最長邊 1280、JPEG、不超過一個工具答案能帶的大小（`MAX_RESULT_IMAGE_CHARS`）。頁面用瀏覽器的 canvas（`runtime/projects/project-picture-thumb.js`，依序試 1280、900、600），伺服器用 `server/picture-thumb.js` 從使用者雲端資料夾讀原檔後縮（位元組不留）。縮不出來的圖不給，並明說。
- **額度**：一次回覆模型主動看的圖，原檔合計最多 10 MB（`PROJECT_VIEW_BYTES_MAX`）；已經隨訊息附上的圖不重複給、也不算額度；達到上限就告訴模型。
- **只有圖片的專案**現在也有工具（搜尋與看圖，沒有讀檔）；請求的 `entries` 可以是空的，只要有 `media` 而且 `canView`。
- **伺服器欄位**：`tools.projectFiles.canView`、`media[].mimeType`（都選填）。
- 影片與聲音（R4）、掃描 PDF 逐頁（R5）還沒有；`view_project_file` 目前只看圖片。

## 10. Allen 的更正（2026-11-02）：圖片、影片、聲音**完全走向量**，模型自己找、自己取；實作計劃（只有計劃，還沒寫程式）

### 10.1 更正了什麼

- 這份計劃 §9 第 2 條（媒體仍「隨訊息附上」，共用 10 MB）**作廢**。原因（Allen）：媒體太大，模型輸入放不下；要靠向量找出「哪個檔、哪一段」，再只把那一小段交給模型。
- §9 其他條不變：同意沿用向量的那一個；沒有向量就只用關鍵字；單檔 20 MB、專案 100 MB；每階段推 `staging` 給 Allen 測才做下一階段；專案這條線先不上線。
- 已經做好、**繼續用**的：R1 文字段向量與混合搜尋、R2 圖片 piece 與索引狀態、R3 `view_project_file` 與「工具結果帶圖」（四種格式）、頁面與伺服器的縮圖。R2 的「額度排序」與「隨訊息附上」變成**只給沒有工具的模型的備案**。

### 10.2 先講限制（要查官方文件才能寫死的數字）

- 嵌入模型 Gemini Embedding 2 的輸入限制，我只查到**二手來源**（本次工作環境連不到 ai.google.dev）：圖片每個請求最多 6 張、PNG／JPEG；影片最長 120 秒、MP4／MOV；聲音最長約 80 秒、MP3／WAV；PDF 最多 6 頁；文字 8192 tokens。**這些數字寫進程式之前必須對官方文件確認**（要 Allen 把 ai.google.dev 加進工作環境的網路白名單，或把官方頁貼給我）。計劃用「每一段不超過上限的 75%」留餘裕。
- 主伺服器映像裡**沒有 ffmpeg**（ffmpeg 只在使用者的命令工具商城）。所以計劃**不靠 ffmpeg、不剪影片**。

### 10.3 核心做法：每種媒體切成「能嵌入的一小塊」，每塊一個 piece；模型用搜尋找到、用 `view_project_file` 取那一小塊

| 種類 | 切法（頁面做） | piece 編號 | 模型取的時候拿到什麼 |
|---|---|---|---|
| 圖片 | 縮成長邊 1024 的 JPEG 再嵌入（不送原檔；所以 20 MB 內的圖都不會「太大」） | `src:<id>:0`（R2 已有，改成縮圖嵌入） | 縮圖（R3 已有） |
| 影片 | **不剪影片**：每 10 秒抓一張畫面（`<video>`＋canvas，縮成 640 邊的 JPEG）每張當圖片嵌入；另外把聲音軌當聲音處理（下一列） | `src:<id>:f<秒>` | 該時間附近最多 4 張畫面（各標 `mm:ss`） |
| 聲音（含影片的聲音軌） | 用瀏覽器 `decodeAudioData` 解碼，降成 16 kHz 單聲道，切成 60 秒一段（段間重疊 10 秒）的 WAV 嵌入；不用 ffmpeg | `src:<id>:a<起點秒>` | **模型聽不到**：只告訴它「在 `mm:ss`–`mm:ss`」，由回答引用時間；之後可做畫面上「從這裡播放」 |
| 掃描 PDF（沒有文字層） | pdf.js 逐頁畫成圖（長邊 1024）嵌入；上限 200 頁 | `src:<id>:p<頁>` | 該頁的圖 |

- `hash`＝檔案雜湊＋種類＋切法參數（秒數、尺寸）＋版本，所以改了切法會自動重建。
- 每檔 20 MB 的上限本身就把工作量限住了（約：聲音 ≤20 分鐘＝≤20 段；影片幾分鐘＝幾十張畫面）；超過每檔上限的標「太大」；瀏覽器解不了的格式（例如 Chrome 上的 HEIC、少見的編碼）標「無法建立索引」。
- 資料庫不用改：`match_project_vectors` 本來就是 `src:<id>:` 前綴；piece 變多，查詢上限 100 夠用（回來後每個檔只留最近的 3 段）。

### 10.4 搜尋與取用

- `search_project_files` 的結果加上**位置**：`{ file, kind, at: { from, to } 秒 | page: 頁 }`，同一檔相鄰的段落合併。圖片沒有文字，只能靠檔名與向量。
- `view_project_file({ file, at?, page? })`：圖片→縮圖；影片→`at` 附近的畫面；PDF→那一頁；**聲音→不給內容，只回覆時間範圍**（模型聽不到）。額度沿用「一次回覆 10 MB 原檔」（改算縮圖實際大小也可以，之後再看）。
- 不再自動附上媒體（給有工具的模型）：目錄列出所有圖片／影片／聲音（名稱、大小、長度、索引狀態），指示模型「提到照片、影片、錄音就先搜尋」。**沒有工具能力的模型**維持 R2 的舊做法（隨訊息附上，10 MB，向量排序）當備案。
- **沒有向量（沒同意、沒金鑰、失敗）時**：圖片仍能用檔名找、用 `view_project_file` 按名字取；影片可以按 `at` 取畫面（頁面現場抽；伺服器要靠下面的畫面包）；聲音與掃描 PDF 找不到，目錄上老實標「未建立索引」。

### 10.5 伺服器（關掉頁面也能用）

- 影片的畫面、掃描 PDF 的頁面，伺服器**沒有 ffmpeg／pdf 轉圖**，所以頁面在建索引時把縮好的畫面**存成一包縮圖**（每張約 30–60 KB，10 分鐘影片約 2–3 MB），放在使用者的雲端資料夾（和原檔同一處，以 `<檔案雜湊>.frames` 為名）；伺服器取用時讀這包、挑最近的幾張。原檔不用再下載。
- `tools.projectFiles.media[]` 多 `kind`、`duration`（秒）、`pages`、`frames`（有沒有畫面包的雜湊）；`run-spec.js` 與 `executor.js` 對應。**這是 contract 變更**，要在 Linear 寫相容性備註。

### 10.6 分階段（每階段單獨推 `staging` 給 Allen 測）

1. **R4 改底**：不再自動附媒體（有工具的模型）；目錄列出全部媒體；圖片改縮圖嵌入、去掉 9 MB 上限；沒向量時圖片用名字取；備案給沒有工具的模型；測試。**這一步最小也最重要，先做。**
2. **R5 影片**：畫面抽取（頁面）、畫面包存雲端、畫面 piece 與嵌入、`view` 取畫面、伺服器讀畫面包、索引狀態與時長顯示。
3. **R6 聲音**：解碼、切段、WAV 嵌入、搜尋結果的時間範圍、影片聲音軌；來源列顯示長度。
4. **R7 掃描 PDF**：逐頁渲染、嵌入、`view` 取頁。
5. **R8 議會**（§3.6）。
6. **R9 收尾**：隱私權政策與協助中心五語（要寫明「圖片、影片畫面、聲音片段、PDF 頁面會送去嵌入模型」）、`PRIVACY.md` 重新產生、Linear contract、全套檢查。

### 10.7 需要 Allen 決定的事

1. **模型聽不到聲音**，聲音只能「找出在哪個時間」、不能讓模型知道內容。要接受嗎？（要有內容得另外做「語音轉文字」，要用另一個模型、會花使用者的錢，也和「不用別的模型替它讀」的原則衝突，建議不做，之後有需要再另開。）
2. **影片只抽畫面（每 10 秒一張）加聲音軌**，不做整段影片嵌入。模型看到的是畫面，不是動作。要接受嗎？（要整段影片得有 ffmpeg，要改伺服器映像與做伺服器端索引工作，工程大很多。）
3. **畫面包存在使用者雲端**（約 2–3 MB／10 分鐘影片，算進每專案 100 MB 還是另算？）建議另算、上限 50 MB／專案。
4. **沒有工具的模型**維持舊的附上做法當備案，可以嗎？
5. **官方限制**：請把 ai.google.dev 加進網路白名單，或貼官方的 Embedding 限制頁，我確認後才寫數字。

### 10.8 Allen 的回答與官方限制（2026-11-01），**以這一節為準，與 §10.1–10.7 衝突處照這一節**

**Allen 的回答**：
1. 聲音**不做語音轉文字**：模型聽不到，只找得到「哪個檔、哪個時間」。
2. 影片要能真的切段：**加 ffmpeg**，而且**本地（頁面）也要能用**。→ 伺服器映像加 ffmpeg；頁面用 ffmpeg.wasm（按需載入、檔案放自己的站上）。不再用「每 10 秒抓畫面」取代影片嵌入；§10.5 的「畫面包存雲端」**取消**（伺服器有 ffmpeg，取用時現場從原檔抽畫面）。
3. 衍生資料另算上限的那一條（畫面包）因此用不到。
4. **沒有工具的模型不留舊的附上做法**：專案媒體一律不隨訊息附上（單一模型）。議會成員目前沒有工具，議會仍沿用原本的附上，直到 R8 給它們工具。
5. 官方文件的權限已開。

**官方限制**（`ai.google.dev/gemini-api/docs/embeddings`，2026-11-01 讀到；之前的二手數字有錯）：
- 文字 8192 tokens。
- 圖片：每個請求最多 6 張；PNG、JPEG。
- 聲音：**最長 180 秒**；MP3、WAV。
- 影片：最長 120 秒；MP4、MOV；編碼 H264、H265、AV1、VP9。**每支影片最多取樣 32 張畫面**（≤32 秒的以每秒 1 張取樣，更長的平均取樣成 32 張）。**影片裡的聲音軌不會被處理**。
- PDF：每個請求 1 個檔案、最多 6 頁。
- 一個請求放多個 part ＝ 只得到**一個**合併的向量；要各自的向量就各包一個 Content（我們現在的 `embedMedia` 是一個檔一個請求，符合）。

**因此的做法**：
- **影片**切成約 **30 秒**一段（剛好每秒一張、32 張以內；比整段 120 秒取 32 張細四倍），段間重疊 5 秒，用 ffmpeg 轉成小的 MP4（H264，480p，無聲音）再嵌入；`piece` 編號 `src:<id>:v<起點秒>`。
- **聲音**（含影片的聲音軌，要另外嵌入）切成 **60 秒**一段、重疊 10 秒（遠低於 180 秒上限），轉成 16 kHz 單聲道 WAV；編號 `src:<id>:a<起點秒>`。
- **掃描 PDF** 逐頁畫成圖（長邊 1024）當圖片嵌入，不用 6 頁的整份嵌入（太粗）；編號 `src:<id>:p<頁>`。
- **圖片**一律縮成長邊 1024 的 JPEG 再嵌入。

**階段（更新）**：R4 改底（不再自動附媒體、目錄列全部媒體、圖片縮圖嵌入）→ R5 ffmpeg（伺服器映像加 ffmpeg；頁面 ffmpeg.wasm；統一的「切段／抽畫面」介面與測試）→ R6 影片 → R7 聲音 → R8 掃描 PDF → R9 議會 → R10 收尾（隱私政策五語、`PRIVACY.md`、Linear contract）。

### R4 的做法（改底，2026-11-01）

- **專案的媒體不再隨訊息附上**（單一模型）：`single-model-response-lifecycle.js` 不再呼叫 `withProjectFiles`。議會暫時照舊（直到 R9 給成員工具）。沒有工具能力的模型因此看不到專案的圖片與其他檔案，文字來源仍照舊放進指示。
- **目錄列出全部媒體**（`project-files-access.js` 的 `catalogText`）：圖片（看得懂圖的模型：「要看用 view_project_file；使用者提到照片、圖片、截圖、圖畫就先搜尋」；看不懂圖的：只能被搜尋點名）、還不能開啟的檔案（影片、聲音、掃描檔、不讀的種類，老實寫「還不能看」）。
- **搜尋結果**的 `pictures`：不再有 `in_this_message: false`；說明依模型能不能看圖（`canView`）寫「用 view_project_file 看」或「你在這次回覆看不到圖」。
- **圖片嵌入前先縮**：`makeEmbedThumbnail`（長邊 ≤1024 的 JPEG，試 1024、768）；瀏覽器開不了的檔，是 PNG／JPEG 且不超過約 9 MB 就原樣送，否則標 `failed`（`loadMedia` 回 `{ unreadable: true }`，不再重試）。圖片**不再有 9 MB 上限**，只有專案單檔 20 MB；「太大」只剩超過 20 MB 的。
- **移除**專案頁來源頁籤與右欄的「有 N 個來源超過一次回覆能帶的大小」提示（i18n 鍵 `pjSourcesLeftOut` 留著沒用）。

### R3 的修正（2026-11-01，Allen 在 staging 試出來）

- 問題：一次回覆看了十幾張圖後，最後幾張被「一次回覆最多 10 MB 原檔」擋掉，模型把這句話說成「檔案太大，開不出來」。**給模型的是小縮圖，從來不是原檔**；錯在額度用**原檔**大小累計。
- 改成算**縮圖**：每次呼叫最多 4 張（`files`，或一張 `file`），一次回覆最多 24 張、縮圖合計最多 6,000,000 個字元（每一輪都會把前面看過的圖再送一次，所以請求大小才是真正的界線）；`view_project_file` 的呼叫次數另算（最多 12 次），不再佔搜尋與讀檔的 14 次。原檔大小完全不算。
- 達到上限時告訴模型「還剩哪些、請使用者再問一次」，不再說檔案太大；看過的圖再要會說「這次回覆前面看過了」。

### R5 到 R9 的做法（2026-11-01，一次做完）

- **共用模組** `src/data/project-media.js`（伺服器與頁面共用，已列入 `scripts/server-shared-modules.json`）：視窗（影片 30 秒、每 25 秒一段；聲音 60 秒、每 50 秒一段；一個檔最多 120 段；掃描 PDF 最多 200 頁）、碎片編號後綴（`v<起點秒>`、`a<起點秒>`、`p<頁>`；圖片仍是 `0`）、`mediaPieceHash(檔案 hash, 後綴)`（圖片的舊 hash 不變，其他加上種類、後綴與 `MEDIA_SCHEME`，換切法就升 `MEDIA_SCHEME`）、ffmpeg 指令、`ffmpeg -i` 輸出的解析、`createMediaToolbox({ open })`。
- **安全**：ffmpeg 只用依副檔名／類型挑的 demuxer（`-f`），播放清單、`concat` 等會讀別的檔案或網址的格式一律不開（`inputKindOf` 回 null）。
- **伺服器**：`server/ffmpeg-runner.js`（暫存資料夾、每個指令 60 秒上限、同時最多 2 個、結束就刪）；`Dockerfile` 在 `USER node` 前 `apt-get install ffmpeg`（**要重新建映像**）；`server/pdf-page-image.js`（pdf.js + @napi-rs/canvas 畫掃描 PDF 的一頁，長邊 1024 的 JPEG）；`server/project-media-view.js`（`view_project_file` 的影片 4 張畫面、掃描頁、圖片縮圖）。
- **頁面**：`ffmpeg-wasm.js`（`@ffmpeg/ffmpeg` 0.12.15 + `@ffmpeg/core` 0.12.10 單執行緒，動態載入，約 32 MB 的 wasm 只在第一次要切影片或錄音時抓；用真的 `vite build` + Playwright 在瀏覽器驗過）；`project-media-source.js`（長度／頁數第一次用 ffmpeg／pdf.js 量，依檔案 hash 記在 localStorage；碎片到輪到才切，同一個檔一次只開一份）；`project-media-view.js`（頁面自己跑工具時的影片畫面與掃描頁）。
- **向量**：`project-pieces.js` 對影片出 `v` 與（有聲音時）`a` 碎片、錄音出 `a`、沒有文字層的 PDF 出 `p`；`page-vectors.js` 建完釋放開著的檔；來源狀態：還沒量過長度或檔案不在這台是 `pending`，ffmpeg 讀不了是 `failed`。
- **工具**：`search_project_files` 的 `pictures` 改成 `media`（`kind`、`where`：影片／錄音 `{at, time}`、掃描 `{page}`）；`view_project_file` 加 `at`（影片）與 `page`（掃描）：影片從 `at` 起 30 秒取 4 張畫面（沒給 `at` 就整支平均取 4 張），掃描一次一頁；錄音只告訴位置，「沒有模型聽得到」。每次呼叫最多 8 張圖。不看圖的模型也有搜尋（影片、錄音能告訴位置）。
- **run-spec**：`tools.projectFiles.media[]` 加 `kind`（image／video／audio／scan）、`duration`、`pages`，最多 60 筆；沒有文字檔時只靠媒體也成立。**理事會**的 `tools.projectFiles` 與 `secrets.embeddingKey`（同樣只在有 `vector` 時）也收。
- **理事會（R9）**：頁面與伺服器的成員各自拿到唯讀的專案檔案工具（`search_project_files`／`read_project_file`，看得懂圖的成員再加 `view_project_file`；由伺服器依各成員的模型判斷，請求裡不帶 `canView`）；成員指示裡加上檔案目錄，整合者不拿。原本隨訊息附上專案原檔的 `withProjectFiles`／`projectFilePartsFor`／預算與排名都刪了。
- **還沒做／已知限制**：沒有語音轉文字（錄音只能找位置）；wasm 切段比伺服器慢，大檔（20 MB）要等；`ffmpeg.wasm` 逾時後那一次的檔案會在下次重開，單個視窗失敗不會永久標記（只有 ffmpeg 明確回失敗才標 `failed`）；掃描 PDF 超過 200 頁只做前 200 頁。

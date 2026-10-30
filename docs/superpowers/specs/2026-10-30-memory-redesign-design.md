# 記憶系統重做（設計與計劃）

日期：2026-10-30｜狀態：**計劃 v2（2026-10-30 與 Allen 逐題討論後定稿），等 Allen 說開工**｜基準：v18.24.0（staging 75ad23ce）｜負責：Allen（伺服器、資料、同步、安全）；設定頁畫面可交 Sun。

舊記憶系統（`src/app/runtime/memory/`，42 檔約 5,000 行）整套取代，不修補。這份文件記錄討論結果與施工計劃；中間經過一次外部審閱，採納與不採納的取捨都已併入。

## 0. 流程總覽（白話）

把記憶想成一本**小筆記本**：每條是一句話；筆記本裡有一小塊「第一頁」，每則訊息都會帶給模型。

使用者送出訊息之後：

1. **準備資料包**（頁面做，本機回覆與伺服器回覆都一樣）：
   - 第一頁（常駐偏好，≤15 條）＋使用規則；
   - 目錄一行（只說「另有 N 條記憶，分類…」）；
   - 若**非常相關**才夾一張便條：最多 2 條記憶＋2 段舊對話；
   - 給模型兩個工具：`search_memory`（翻筆記本與舊對話）、`memory_write`（當場記下／更新／遺忘）。
2. **模型回答**。需要時自己翻筆記本；使用者說了值得記的事，**當場用 `memory_write` 記**（即時學習）。程式在寫入時檢查：引用的原話是否真的出現在使用者訊息裡、筆記本有沒有相近條目（相近就提示模型更新，幾乎一樣就只加佐證次數）。
3. **回答完**：回覆下方顯示「用到 N 條記憶」（每條可按「不相關」）與「已更新記憶」（可撤銷）。
4. **沒有工具能力的模型**：回覆結束後由「整理模型」補看這一輪，把值得記的寫進筆記本（用同一套檢查）。
5. **定期整理**（約一週一次，條件成立才跑）：程式先做能自己做的（過期、歸檔、完全重複合併），再把「可疑的一小組」交給整理模型判斷合併或取代。
6. **使用者掌控**：設定裡逐條清單（改、刪、鎖定、別再提）、三個開關（學習／使用／敏感類別）、暫停與全部清除分開、匯出。刪掉的進**黑名單**，之後不會被學回。
7. **伺服器代跑回覆**時，回覆結束那一刻（金鑰還活著）可順手做第 4、5 步，結果由伺服器直接寫進雲端筆記本；金鑰仍只活到這次工作結束。

**與舊版的差別**：舊版是每次把「使用者摘要」整包塞給模型，靠關鍵字（對中文是壞的）挑 5 段、沒有使用規則、每回合自動整理一份越來越長的摘要。新版是「小筆記本＋平常只帶第一頁＋非常相關才夾便條＋模型自己會翻、會記＋寫入有檢查＋會更新與淡出」。

## 1. 決定（Allen 已拍板）

| # | 決定 |
|---|---|
| D1 | **自動學習**：模型主動認識使用者，不是「說了才記」。 |
| D2 | **沒有確認／待審清單**。透明度靠「事後可見、可改、可撤銷」。 |
| D3 | **記憶會隨時間與互動更新**：取代、過期、強化、淡出、合併。 |
| D4 | **跨對話歷史搜尋要做**，而且重要；歷史對話**沒有數量上限**（所有已同步對話都進索引，每次只回傳最相關的幾段）。 |
| D5 | **舊記憶資料全部丟掉**，上線後**自動重建**（從既有對話長出來）。 |
| D6 | 解決兩個痛點：記憶**不起作用**、**什麼都要提到過去**（過擬合）。 |
| D7 | 不照搬外部報告的重型方案（Postgres 全文檢索＋pgvector＋閒置背景整理＋待審佇列）。 |
| D8 | **所有模型共用**「第一頁＋目錄＋高門檻便條」；能呼叫工具的模型再加工具。 |
| D9 | 第一版**伺服器回覆的歷史靠頁面預取**（頁面送出前用本機索引找，放進請求）；主動的 `search_memory` 歷史範圍在伺服器端留到第二版（PGroonga，開工前先確認 Supabase 可用）。 |
| D10 | 第一版**不做租約**，只做冪等操作 id＋關鍵詞去重；真的出現重複條目再補租約。 |
| D11 | **學習以「當下回答的模型用工具當場記」為主**（即時、不另外花錢）。整理模型只負責：(a) 沒有工具能力的模型、(b) 重建舊對話、(c) 定期整理。不再每回合另叫整理員，也不做批次。 |
| D12 | **金鑰不長期存伺服器**（隱私承諾不變）。 |
| D13 | **伺服器代跑回覆的記憶寫入**：伺服器**直接寫進**雲端記憶表（單一寫入點、不會遺失）。 |
| D14 | 條目上限：**活躍 300**（可調）；淡出歸檔的**不計入**、仍可搜尋；**常駐（第一頁）15 條**。滿了先合併或淘汰，不是拒絕寫入。 |
| D15 | **向量搜尋放進第一版當選配**：瀏覽器端、需使用者同意（會把歷史文字送給 embedding 供應商）、與關鍵字混合排序；關鍵字永遠是基底。 |
| D16 | **整理模型**：預設「自動」（目前對話同一家供應商裡最便宜的模型）；使用者可自選任何有金鑰的模型；自訂的不能用就退到目前對話正在用的模型，**不加價格保護**。 |
| D17 | **伺服器代跑回覆的結尾步驟留著**：回覆結束、金鑰刪除前，對該對話補做無工具模型的記憶補位，以及（條件成立時）定期整理。 |

## 2. 為什麼要重做（已驗證的問題）

1. 記憶每次整包注入，不管相不相關：分數 0 也湊滿前 5 段，總覽每次必放（`memory-context-builder.js`）。
2. 注入區塊**沒有任何使用規則**（只有標題 `# Permitted memory context`）。
3. 關鍵字挑選對中文是壞的：切詞 `/[\p{L}\p{N}_-]{2,}/` 讓沒有空白的中文整句變成一個詞，所以選到的 5 段實際上是「最近更新的 5 段」。
4. 擷取提示詞明寫「不要因為隨口、推測、一次性或提問就丟掉」，段落數無上限。
5. 擷取關不掉（`submit-input-council-lifecycle.js` 註解：v2 一律背景更新），與隱私政策「關掉自動記憶只會停止新增」不一致。
6. 綁死 Gemini（擷取預設、向量只有 Gemini Embedding 2）；向量索引每台裝置各自重建；模型沒有記憶工具；使用者只看到「摘要的摘要」。
7. 三代程式碼並存，難以推理。

## 3. 設計原則

- 記憶是一張**短清單**（一條一個事實），不是摘要。
- 平常只**常駐一小塊**；其餘靠目錄、高門檻便條、與模型自己用工具查。程式不再到處猜「哪段相關」硬塞。
- 自動學習，但**少記、記準**：寫入必須逐字引用使用者原話；沒有值得記的就什麼都不寫。
- 所有資料**可重建、可撤銷、可刪除**；刪掉的不會被學回（黑名單）。
- 一個純模組同時給瀏覽器與伺服器用（`scripts/server-shared-modules.json`，不用 `window`／`document`／瀏覽器儲存）。

## 4. 設計

### 4.1 資料模型

```
memory_note（一條記憶，JSON 存在同步表的 payload）
  id
  text            一事一句的陳述句（"User prefers concise answers"），使用者主要語言，≤200 字，不寫命令式
  keywords[]      多語關鍵詞／同義詞（5–10 個），寫入時由寫入的模型或整理模型產生；檢索同時比對 text 與 keywords
  kind            preference | fact | project | relationship | routine（只用於分組與目錄，不影響召回）
  standing        bool：常駐。由程式依 §4.6 規則決定，模型只能「提議」
  surface         normal | never    never = 可用來理解，但不主動說出來（「別再提這件事」）
  locked          bool：使用者手改或手動鎖定；模型與整理模型都不能動
  evidence_count  被不同對話、不同日期佐證的次數
  observed_at     最新佐證訊息的時間（取代判斷用，不是寫入時間）
  created_at, updated_at, last_used_at
  valid_until     可空，絕對日期
  source          { conversation_id, message_ids[], quote }
  status          active | archived | deleted    deleted = 黑名單：清掉 text，留 keywords、source、短描述
  superseded_by   可空
  not_relevant    使用者按「不相關」的次數（滿 3 次取消 standing）
  version         伺服器遞增（同步衝突用，不用 client 時間）

memory_cursor（每個對話一筆）：conversation_id, processed_through_msg_id, applied_ops[]（最近處理過的操作 id，冪等用）
memory_event（30 天 TTL，供撤銷與「已更新記憶」）：id, at, conversation_id, message_id, who（tool | curator | consolidation）, ops[]（前後內容）
memory_settings（隨設定同步）：learn / use / paused、整理模型（auto 或指定）、向量（off / on＋同意時間）、敏感類別預設
```

**同步**：沿用現有 `workspace_memory_summary_records` 的做法，新增 `workspace_memory_records`（`user_id, record_key, payload jsonb, version bigint, updated_at timestamptz default statement_timestamp(), deleted_at`，主鍵 `(user_id, record_key)`；`record_key` 形如 `note:<id>`、`cursor:<conversation_id>`、`event:<id>`；RLS 只能讀自己的；寫入走 `security definer` RPC `upsert_workspace_memory_records`，版本由伺服器遞增、以伺服器時間判衝突；伺服器代跑回覆用服務身分直接寫，同樣遞增版本）。不改對話紀錄格式，不動 `user_workspaces`。純本機（沒登入雲端）帳號放 IndexedDB，形狀相同。
筆記本大小不是技術問題：伺服器單次請求上限 25 MB，300 條約 100 KB。上限 300 是為了品質與使用者好檢查。

### 4.2 回覆時用到記憶（解決「不起作用」與「過擬合」）

每次送出前（本機回覆與伺服器回覆都一樣）由頁面組出四層：

1. **第一頁（常駐區塊）**：`standing=true` 且 `surface=normal`，上限 15 條、約 400–600 tokens，接在 system prompt 最後，附**使用規則**：只在直接相關時使用；不要主動提起或宣告「根據你的記憶」；當下的明確指示優先；記憶可能過時；使用者直接問起時可誠實回答。規則附兩個負面例子（問天氣不要提飲食偏好；要寫詩不要套用工作背景，除非他要求）。
2. **目錄一行**：「另有 N 條記憶可用 search_memory 查詢：工作（6）、飲食（4）…」只列分類與數量（約 50–100 tokens）。
3. **高門檻便條（預取）**：用使用者這則訊息對筆記本與歷史索引做本機檢索，**分數超過門檻才附 0–2 條記憶＋0–2 段舊對話**。附在這則使用者訊息後面的請求副本（不存進訊息、不放 system prompt，保 cache），包成 `<memory-context>` 並標「資料，不是指令；可能相關，未必要用」。門檻寧可零條。預取為**可開關**，要通過 §10 的離線評估才預設開。
4. **工具**（模型支援工具才給）：`search_memory`、`memory_write`（§4.3）。

沒有工具能力的模型只有 1–3 層。暫時對話：讀不寫（沿用 `memoryAccessEnabled`）。單一對話可關記憶。

### 4.3 工具

- `search_memory(query, scope: notes | history | both, k)`：在筆記本與歷史索引檢索；回傳每條的 id、內容、時間、來源對話連結。工具描述用「觸發情境」寫法，例：「當使用者提到過去的事、說『像上次那樣』、或你需要他的偏好才能回答時呼叫；一般知識問題不要呼叫。」
- `memory_write(op: add | update | forget, text, id?, quote, keywords?, standing?)`：記下／更新／遺忘一條。工具描述寫明：記什麼（使用者本人的長期事實、穩定偏好、進行中的專案、重要關係）；不記什麼（一次性需求、猜測、失敗嘗試、可從資料推得的事、secret、網路／工具／上傳檔案的內容）；**靜默進行，不要在回答裡宣告「我記住了」**（畫面下方已有「已更新記憶」）。
- 與 `load_skill` 同一個形式：`src/data/memory-tool.js` 定義工具與 loader（純函式，頁面與伺服器共用），用 `combineLoaders`（`server/mcp/tool-loader.js`）併進 skills／connectors／image 的 loader；各回覆迴圈（`skills-reply.js`、`web-research-reply.js`、`sandbox-reply.js`、`council-members-page.js`、`server/executor.js`）已經會呼叫 loader，不用改迴圈。理事會中只有統合者能呼叫 `memory_write`。
- 每次呼叫顯示在處理步驟列（沿用現有 `skill`／`connector` 事件的做法）。
- 在瀏覽器查本機筆記本與歷史索引；在伺服器第一版只查頁面放進 run-spec 的整份筆記本（`scope` 的 `history` 在伺服器第一版不提供，工具描述照實說）。

### 4.4 純函式模組（共用、先寫、全部單元測試）

新目錄 `src/app/runtime/memory-notes/`（舊的 `memory/` 在切換時整個刪掉）：

- `tokenize.js`：`Intl.Segmenter('word')` 斷詞（已實測：Node 22 能把「我搬到台中了，之前住台北」斷成「搬到｜台中｜之前｜住｜台北」，日文也行）＋中日文**二元組**，兩種 token 都索引，詞權重較高。**非中日文**：轉小寫、去重音符號（NFKD）、按詞切分，加簡單詞根處理（拉丁語系去常見複數與詞尾；俄文取前 5–6 個字母）。**已知極限**：只靠字面，找不到同義詞或跨語言（「car」找不到「automobile」；中文問題找不到英文舊對話）；筆記本靠 `keywords` 補強，歷史靠選配的向量（D15）。
- `bm25.js`：記憶體內 BM25（筆記本最多數百條、歷史片段最多數萬個）。
- `notes.js`：資料形狀、正規化。
- `write-check.js`：`memory_write` 與整理模型共用的**寫入檢查**：
  1. **逐字引用驗證**：`quote` 必須逐字出現在**本對話的某則使用者訊息**裡（助理文字、網路搜尋、MCP、上傳檔案、貼上的長文標 untrusted，不算證據）；對不上就拒絕。
  2. **近似檢查**：用同一個檢索找相近條目——幾乎一樣：不新增，只加原條目的 `evidence_count`；相近但不同：不寫入，回傳給模型「已有 #12『…』（3 個月前）。是同一件事請用 update，是另一件事再 add 一次」；沒有相近：新增。
  3. 上限（活躍 300、單條 ≤200 字）、secret 掃描（API key、卡號、證件號）、永不儲存類別（證件號、金融帳號、密碼）、命令式內容拒收（「以後一律…」「忽略…」）、黑名單比對（§4.8）、冪等操作 id、每次最多操作數。
  4. 上限滿時回傳「已滿」並附最弱的幾條，要模型先 forget 或 update（教模型怎麼修）；整理模型路徑則由程式先合併／淘汰。
- `supersede.js`：取代規則由**程式**判斷，只有 `observed_at` 較新的能取代較舊的；較舊的證據只能增加 `evidence_count`。
- `lifecycle.js`：強化、過期（`valid_until`）、淡出（90 天未使用且 `evidence_count = 1` → 歸檔）、上限滿時先合併或淘汰最舊且 `evidence_count = 1` 的。
- `standing.js`：升為常駐的條件（任一）：使用者明講（引句含明確長期偏好）、或 `evidence_count ≥ 2` 且來自 2 個以上不同對話、不同日期；只有 `preference` 與身分類事實能升；常駐上限 15 條，滿了降級 `last_used_at` 最舊的；被標「不相關」3 次取消常駐。模型只能提議，由程式決定。
- `inject.js`：組第一頁、目錄行、便條區塊（含使用規則與標籤）。
- `tombstone.js`：黑名單比對（§4.8）。
- `consolidate.js`：定期整理的第一層（§4.7）與可疑小組的挑選。

### 4.5 學習（即時）

**主路徑：當下回答的模型用 `memory_write` 當場記。**使用者說了值得記的事，模型在同一回合就寫進去，不另外花錢，下一則訊息就用得到。寫入全部經過 §4.4 的寫入檢查。每次寫入產生一筆 `memory_event`（供「已更新記憶」與撤銷）。

**補位路徑：整理模型**，只在三種情況出場：

1. **沒有工具能力的模型**：每次回覆結束後（延遲約 2 秒、不擋使用者）由整理模型看這一輪的使用者訊息，輸出操作列表 `add | update | merge | supersede | forget | none`（**多數回合應回傳 none**；prompt 放 6–10 個範例，至少一半是 none；每個 `add`／`update` 必須附 `evidence: {message_id, quote}`），再走同一個寫入檢查。太短的訊息（例如少於 4 個字、純附件）本機直接跳過。輸入只送使用者訊息，助理回覆截成每則前 200 字當上下文，並帶訊息時間戳與使用者時區（要求輸出絕對日期，程式檢查 `valid_until > observed_at`）、相關現有條目（約 20 條）、相關黑名單描述。
2. **重建**舊對話（§4.9）。
3. **定期整理**（§4.7）。

**伺服器代跑回覆的結尾步驟（D17）**：回覆結束、金鑰刪除前，伺服器對該對話做「1」的補位（僅限無工具模型），並在定期整理條件成立時跑一輪（§4.7）；結果由伺服器直接寫進記憶表。金鑰仍只活到這次工作結束。有工具的模型在回覆過程中已當場記好，結尾什麼都不用做。

**哪些模型用哪條路徑**：預設有工具能力的模型走主路徑；§10 的評估若發現某些模型很少主動寫入，就把它們列入「改走補位路徑」清單（設定可調）。

「學習 off」要**真的停止所有寫入與整理模型呼叫**，測試驗證（舊系統 P6 的教訓）。

### 4.6 整理模型（D16）

- 設定頁「整理模型」：預設**自動**＝目前對話同一家供應商裡最便宜的文字模型（用目錄裡每個模型的價格資料，避免把對話送到第二家）；使用者可自選任何有金鑰的模型。
- 自訂的不能用（沒金鑰、被限流、模型下架）或自動找不到：退到**目前對話正在用的模型**，不加價格保護（整理模型只在少數情況出場，花費有限）。仍然都不能用就暫停並在設定頁顯示原因，不默默失敗。
- 金鑰：瀏覽器用頁面裡的金鑰；伺服器結尾步驟用回覆期間暫存的金鑰；都不長期保存。

### 4.7 定期整理（合併、取代、過期、淡出）

- **觸發**：自上次整理後新增或修改約 20 條、或活躍條目超過上限 80%、或距離上次整理超過一週，其中任一成立；在使用者開著頁面時（或伺服器回覆結尾，見 §4.5）跑一次。
- **第一層（程式自己做，不呼叫模型）**：過期的標過期；90 天未使用且 `evidence_count = 1` 的歸檔；關鍵詞幾乎相同的重複自動合併（保留較新的內容、累加佐證次數）；常駐超過 15 條或被標「不相關」滿 3 次的降級。
- **第二層（交給整理模型，只送「可疑小組」，不送整本筆記本）**：程式先找出關鍵詞有重疊、或同一主題下互相矛盾的幾條作為一組（向量開啟時用相似度分組，較準）；每組單獨問模型「這幾條有沒有重複或矛盾？合併、誰取代誰、還是都保留？」。程式檢查模型的回答：只能引用這一組的條目；誰新誰舊由 `observed_at` 決定，不聽模型；`locked` 的條目不碰；合併後的句子必須來自原本那幾條的內容；通過才套用。
- **使用者看到**：設定裡一筆紀錄「整理了記憶：合併 3 條、過期 2 條、歸檔 1 條」，保留 30 天，每筆可撤銷。
- **費用**：只有第二層呼叫模型，而且只送小組，約每次幾百 tokens、一週一次，幾乎可忽略。
- **已知極限**：用關鍵詞找可疑小組，措辭差很多的重複（「我在台北上班」vs「公司位於台北市」）可能漏掉；向量開啟時較好；使用者也能在清單裡自己刪改。

### 4.8 黑名單與刪除

- 使用者刪條目 → `status=deleted`，清 `text`，保留 `keywords`、`source`（含來源訊息 id）、短描述。
- **來源封鎖**：寫入檢查與重建處理到黑名單的來源訊息時，跳過與其相似的內容；新條目 `keywords` 與任一黑名單重疊率 ≥ 0.5 就擋下；相關黑名單描述會送進整理模型 prompt，也會在 `memory_write` 被拒時回傳給模型。
- 「全部清除」時問使用者是否連黑名單一起清（它本身也是個資）。
- 刪對話時詢問是否一併刪除由它產生的記憶；選擇保留的條目標「來源已刪除」，重建不會讓它消失。
- 使用者手改的條目自動 `locked`，模型只能「新增一條較新的」，不能覆寫。

### 4.9 歷史索引、向量與重建

- **歷史索引**：對話訊息切片（每片 ≤800 字元，含對話、時間、角色），§4.4 的斷詞＋BM25，存 IndexedDB 快照；**可丟棄、可重建，建索引不呼叫任何模型**（只是 CPU，從已同步訊息直接建），新裝置的代價很小。暫時對話不進索引；刪掉的對話從索引消失。沒有對話數量上限，只受裝置記憶體限制（幾萬片沒問題，真的大到有感再改成分批載入）。關鍵字索引完全不出裝置，不需要同意。
- **向量（選配，D15）**：使用者有支援 embedding 的金鑰（Gemini 或 OpenAI）且**同意**後開啟（會把所有歷史文字送給 embedding 供應商，隱私政策要寫明）；在瀏覽器背景為切片建向量，存本機 IndexedDB（每台裝置各自建）；檢索為「BM25 與向量相似度混合排序」，能找到同義詞與跨語言；沒開或沒金鑰就只用關鍵字。換 embedding 模型要重建；索引帶版本。費用很低（embedding 約每百萬字幾美分）。伺服器端向量（pgvector）不做。
- **重建 = 同一條寫入流程**：清空筆記本（保留黑名單）→ 水位線歸零 → 處理**最近 30 個對話**，選出後**由舊到新**處理（取代規則另有 `observed_at` 把關），每個對話只送最後 N 則使用者訊息（token 上限）；用整理模型；頁面顯示進度（「記憶建立中 12/30」），可暫停、可往更舊延伸。升級後第一次打開（學習為 on）自動開始。第二版可做成伺服器長任務（金鑰只保管到任務結束）。

### 4.10 使用者介面（取代 `model-memory-dashboard-lifecycle.js` 等）

- **回覆下方**：「已更新記憶」（每個對話最多顯示一次，沒有寫入不顯示；前 5 次稍明顯，之後只剩淡淡一行）→ 點開看新增／修改了什麼，一鍵撤銷。「用到 N 條記憶」→ 點開每條可按「這裡不相關」。兩者放在訊息 `metadata`（`memoryUsed`、`memoryUpdated`，需加入雲端同步放行名單，見 `cloud-sync-v2-codecs.js` 與先前 `visionCheck` 的做法）。
- **設定 → 記憶**：完整清單（常駐／一般／已歸檔，可編輯、刪除、鎖定、「別再提」）、三個開關（學習、使用、敏感類別）、「暫停」與「全部清除」分開、匯出（JSON＋Markdown）、重建進度與按鈕、整理模型選擇、向量開關（含同意說明）、定期整理紀錄與撤銷、撤銷率計數（本機只記計數，不記內容）。
- 五種語言；顏色一律用 `tokens.css` 的名稱；文字放新的 `src/data/i18n/parts/memory.js`（舊的 `memory-and-import.js` 中屬於舊系統的鍵刪除）。版面先給 Allen 看預覽圖再定。

## 5. 兩條回覆路徑

- **瀏覽器本機回覆**：直接用本機筆記本與索引；工具在頁面執行；補位與定期整理在頁面跑。
- **伺服器回覆**：頁面照舊把第一頁＋目錄行放進 `systemInstructions`（欄位不變），把便條放進送出的請求副本，並在 `tools` 加新欄位 `memory`：`{ notes: [{id, text, keywords, kind, standing, surface, observedAt}], canWrite: bool }`（run-spec 要新增驗證與大小限制）。伺服器的 `search_memory` 只查這份筆記本；`memory_write` 在伺服器執行寫入檢查後，**直接寫進 `workspace_memory_records`**（D13；頁面下次同步讀到；需確認同步層能把伺服器端變更帶回頁面——P4 開頭花一天驗證）。回覆結尾步驟見 §4.5。
- 共用的純邏輯（寫入檢查、檢索、格式化、整理第一層）放進可被伺服器共用的模組。

## 6. 隱私與文字（要同步改）

- 隱私政策與協助文件五語、`PRIVACY.md`：新的記憶說明（筆記本、可看可改可刪、學習／使用開關真的生效、模型可以當場寫入記憶、整理模型會把對話片段送給你選的模型——預設是目前對話同一家供應商的便宜模型、伺服器回覆結束時順手整理但金鑰仍只活到工作結束、定期整理、記憶與歷史索引的位置與同步、30 天事件紀錄、黑名單、**向量搜尋會把歷史文字送給 embedding 供應商且需要同意**）。
- 舊內容「用你的 Gemini 金鑰整理摘要」「跨對話回憶要同意＋Gemini Embedding」等整段改寫；關鍵字索引在本機、不呼叫模型。
- 設定頁文字、首頁（`home-texts.js` 若提到記憶）、更新紀錄五語（Allen 發版時整理）。

## 7. 要刪掉的舊東西（切換時一次）

- `src/app/runtime/memory/` 全部（42 檔）、`shell/memory-summary-lifecycle.js`、`shell/memory-model-runner.js`、`shell/model-memory-dashboard-lifecycle.js`，以及 `config-store` 裡舊記憶相關鍵（`memorySystemVersion`、`memoryEnabled1`、`enableAutoMemory`、`memoryProfileEnabled`、`memorySync` 等，確認使用處後再刪）。舊的 Gemini embedding 客戶端若可重用，搬到新模組而不是留在舊目錄。
- 舊測試約 26 檔（`tests/runtime-memory-*.test.js`、`tests/memory-*.test.js`、`tests/runtime-model-memory-dashboard-lifecycle.test.js` 等）。
- 舊資料：使用者本機的 `noureon:history-index:v1:*`、`noureon:derived-memory:v1:*`、`memoryState`；雲端的 `workspace_memory_summary_records`（先停止讀寫，之後由 Allen 用 migration 清理）。
- `scripts/server-shared-modules.json` 的 `memory-context-builder.js` 換成新模組（Allen 更新清單）。
- 頁面總大小預算（`check:sizes`）要看新舊相抵；新功能照規則「一個模組＋核心檔只加一行註冊」。

## 8. 分階段計劃

每階段都能獨立測試、不破壞現有功能；舊系統在 P8 之前仍是預設，新系統以 `memorySystem: 'notes'` 設定旗標（預設關）逐步接上。

| 階段 | 內容 | 驗收 | 預估 |
|---|---|---|---|
| **P0** 設計與契約 | 這份文件；Linear 開 `contract` 說明（§9）；Allen 確認；確認 Supabase PGroonga 可用（第二版用） | Allen 說可以開工 | 0.5 天 |
| **P1** 純函式模組 | §4.4 全部：斷詞（中日文＋拉丁／俄文詞根）、BM25、寫入檢查（逐字引用、近似檢查、secret、黑名單、上限）、取代、生命週期、standing、inject、consolidate 第一層；離線評估腳本 `scripts/memory-eval.mjs` 與約 10 個腳本案例（含注入、一次性需求、推測、中英混用、時效事實、重複與矛盾） | 單元測試全過；`check:server` 過（沒用瀏覽器全域） | M |
| **P2** 資料與同步 | migration `workspace_memory_records`＋RPC（先套測試站，Allen 審）；頁面端 store（登入走雲端、純本機走 IndexedDB）、版本與伺服器時間衝突規則、黑名單同步；伺服器端寫入同一張表 | 兩個瀏覽器分頁／兩台裝置互相同步條目與黑名單；RLS 測試；伺服器寫入頁面讀得到 | M |
| **P3** 注入與設定頁 | 第一頁＋目錄行＋便條（可開關）接進 `stream-api-call.js` 的注入點；設定 → 記憶新畫面（清單、編輯、刪除、鎖定、別再提、三開關、暫停／清除、匯出、整理模型）；五語文字；預覽圖先給 Allen 看 | 解決「中文挑選壞掉」「整包注入」；新的注入測試；人工案例通過 | L |
| **P4** 學習 | `search_memory`／`memory_write` 工具（`memory-tool.js`）接進各迴圈與 `server/executor.js`；run-spec `tools.memory`；伺服器直接寫入；無工具模型的整理補位（頁面與伺服器結尾步驟）；整理模型選擇與退路；「已更新記憶」＋「用到 N 條記憶」＋「不相關」；「學習 off」真的停止（測試） | 實機：講一件長期事實→同回合記下→下則被用到；講矛盾事實→被取代；隨口閒聊→不寫；撤銷有效；重複說法被導向 update；伺服器回覆關頁面也學到；無工具模型也學到 | L |
| **P5** 歷史索引與重建 | 歷史索引（斷詞＋BM25＋IndexedDB 快照）；歷史便條（本機與伺服器回覆都有）；重建流程（30 個對話、進度、暫停、黑名單尊重）；升級後自動重建 | 新裝置能重建索引（不呼叫模型）；刪過的記憶重建後不回來；重建 30 個對話的實際費用在可接受範圍 | M |
| **P6** 定期整理 | §4.7：觸發條件、第一層、第二層（可疑小組＋整理模型＋程式驗證）、紀錄與撤銷；伺服器結尾步驟的整理觸發 | 重複與矛盾的案例被收掉；locked 不被碰；撤銷有效；費用在預期內 | M |
| **P7** 向量（選配） | embedding 供應商選擇（Gemini／OpenAI）、同意流程與隱私文字、瀏覽器背景建向量、混合排序、版本與重建、設定開關 | 開啟後同義詞與跨語言案例命中率明顯高於純關鍵字；沒開不受影響 | M |
| **P8** 切換與清理 | 預設改成新系統；刪舊程式碼與舊測試（§7）；隱私政策／協助文件五語與 `PRIVACY.md`；`server-shared-modules.json`；全套檢查 | `npm test`、build、`check:sizes`、`check:shell`、`check:server`、lint、audit 全過；測試站實測一週 | M |
| **第二版** | 伺服器端歷史搜尋（PGroonga，`search_memory` 的 `history` 範圍在伺服器可用）；重建做成伺服器長任務；租約（若觀察到重複條目）；每晚升級／時間改寫（若需要） | — | — |

先做 P1（純函式、可離線驗證、沒有風險），P2 的 migration 同時請 Allen 審。P3 做完就能在測試站感受「不再整包塞、中文挑得到」。若時程吃緊，P7 可在 P8 之後單獨發版。

## 9. 契約變更（要在 Linear 開 `contract` 說明，Allen 確認後才動）

1. **run-spec**：`tools.memory`（`notes[]`、`canWrite`）新增驗證與大小上限；`systemInstructions` 的欄位不變。
2. **訊息 `metadata`**：`memoryUsed`（條目 id 陣列）、`memoryUpdated`（事件 id 陣列）；雲端同步放行名單要加。
3. **工具**：`search_memory`、`memory_write`（名稱、參數、回傳格式；`memory_write` 的拒絕與「已有相近條目」回傳）；步驟事件 `memory`（供處理步驟列顯示）。
4. **資料表**：`workspace_memory_records` 與 RPC `upsert_workspace_memory_records`（RLS、版本、`deleted_at`）；**伺服器以服務身分直接寫入**這張表（寫入前一定經過共用的寫入檢查）；舊 `workspace_memory_summary_records` 之後清理。
5. **刪除規則**：刪條目＝黑名單；刪對話時詢問是否一併刪衍生記憶；匯出格式。
6. **伺服器回覆結尾步驟**：回覆結束後、金鑰刪除前多做的記憶補位與整理（金鑰存活時間不變）。
7. **共用模組清單**：`memory-notes/*` 與 `src/data/memory-tool.js` 加進 `scripts/server-shared-modules.json`。

## 10. 評估與測試

- **純函式**（P1）全部單元測試：斷詞（中、日、英、法、俄、西）、BM25 排序、逐字引用驗證（含轉述、助理文字、貼上長文）、近似檢查（幾乎一樣／相近／無）、取代規則（`observed_at` 倒序輸入）、上限滿時的處理、黑名單比對、冪等重複、secret／永不儲存類別、定期整理第一層。
- **離線評估集**（先做約 10 個腳本案例，之後再擴充；`scripts/memory-eval.mjs` 由 Allen 用自己的金鑰跑，換 3–4 個代表性模型）：
  1. **寫入品質**：應記住 vs 不應記住（注入攻擊、一次性需求、推測）；**各模型主動呼叫 `memory_write` 的比率**（決定哪些模型改走補位路徑）。
  2. **過擬合率**：約 30 個與記憶無關的中性提問（寫詩、解釋概念、翻譯），統計回覆提到記憶內容的比例，目標接近 0。
  3. **召回命中率**：約 30 個應該用到某條記憶的提問，檢查是否出現在便條或 `search_memory` 結果。
  便條預設開關取決於 2、3 的結果。
- 模型端行為每次改 prompt／工具描述都手動跑一次，並看本機計數（每 100 回合新增幾條、被撤銷幾條）；撤銷率高代表記太多。

## 11. 參數（初始值，評估後調整）

| 參數 | 值 |
|---|---|
| 第一頁（常駐） | 15 條、約 400–600 tokens |
| 活躍條目上限 | 300；歸檔的不計；單條 ≤200 字 |
| 寫入 | 每次呼叫 ≤5 條操作；補位整理模型每輪新增 ≤5、總操作 ≤10；整理輸入的相關現有條目約 20 條；太短訊息（<4 字）跳過 |
| 便條（預取） | 記憶 0–2 條、歷史 0–2 段、門檻保守（寧可零條）；放在使用者訊息副本，不放 system prompt |
| 淡出 | 90 天未使用且 `evidence_count = 1` → 歸檔 |
| 升級常駐 | 使用者明講，或 ≥2 個不同對話、不同日期佐證 |
| 定期整理觸發 | 自上次新增／修改約 20 條，或活躍條目 >80% 上限，或距上次 >1 週 |
| 重建 | 最近 30 個對話，每對話有 token 上限 |
| `memory_event` | 保留 30 天 |

## 12. 風險與還沒定的事

- **模型主動程度差很多**（小模型可能漏記）：這是「模型當場記」的最大取捨。對策：評估各模型的寫入比率，列「改走補位路徑」清單；定期整理也會收掉漏網的重複。
- **便條會把「程式猜相關」帶回來**：舊系統就壞在這裡。對策：門檻保守、≤2 條、放使用者訊息副本、可開關、靠離線評估與「不相關」回饋校準；評估沒過就不預設開。
- **非中文與跨語言的檢索較弱**：只靠字面；筆記本有多語關鍵詞，歷史靠向量選配補強。
- **伺服器代跑回覆的直接寫入**（D13）：前提是同步層能把伺服器端變更帶回頁面；P4 開頭驗證；伺服器寫入必須用同一個寫入檢查。
- **多裝置**：第一版只做冪等＋去重；同一對話兩台裝置同時整理可能產生重複，靠定期整理收斂；觀察到問題再補租約。
- **成本**：整理模型與向量用的是使用者自己的金鑰；重建 30 個對話與向量建索引的費用要在 P5／P7 實測並顯示給使用者。
- **頁面關著且沒走伺服器回覆時，補位與定期整理不會跑**（金鑰不存伺服器的取捨）；下次開啟補上。
- **PGroonga 在 Supabase 是否可用**：第二版開工前驗證。
- **重建與被刪除對話**、**暫時對話轉一般對話時的水位線**：P5 前定案（目前：保留「來源已刪除」的條目；暫時對話不寫水位線）。
- **整理模型自訂但不可用時退到目前模型**（不加價格保護）：若目前模型很貴，補位會花更多；因為補位只在無工具模型或定期整理時出場，影響有限，先不處理。
- **使用者介面細節**（清單排版、「已更新記憶」措辭）：P3 開工前給 Allen 看預覽圖再定。

## 13. 明確不做（第一版）

待審／確認佇列；每晚離線升級與複雜時間改寫（只做 `valid_until`）；敏感類別細分 opt-in（先做「永不儲存」硬規則）；專案／資料夾範圍的記憶；伺服器端向量（pgvector）；伺服器長期保管金鑰；租約；每回合另叫整理員。

## 14. 之後的事（不在第一版）：自我進化

2026-10-30 與 Allen 討論「自我進化系統」（OpenClaw、Hermes Agent 那一類）後的決定：

- **A：越用越聰明**，在現有限制內做，不改隱私承諾，**等記憶重做的 P4（學習）穩定後再做**（會共用寫入檢查、黑名單、事後可見的紀錄）。三件事：
  1. 升級常駐靠「一直有用」（加 `recall_count` 與不同查詢數；OpenClaw 的門檻：分數 ≥0.75、被召回 ≥3 次、≥3 個不同查詢）。
  2. 技能自動起草（Hermes 式；存成**草稿、不會被載入**，使用者在「擴充」頁按「啟用」才生效；可還原；只是文字指令，不擴權、不跑腳本）。
  3. 事件型長期意圖（規則比對進來的訊息，零模型呼叫；有效期 90 天、冷卻 24 小時、最多觸發 3 次、每回合最多 3 條且 ≤1,200 字元；只有使用者明確要求才建立）。
- **B：常駐自主運行**（凌晨自動整理、定時提醒、主動行動）**是另一個功能**，需要伺服器長期保管金鑰，要重新決定隱私承諾（折衷方案見 Linear 該單：使用者主動開啟、有額度上限的專用「背景工作金鑰」、最多 30 天滑動期限、可隨時撤銷）。不排期。
- **不做**：模型自動改人格與系統指令（只能使用者核准）；集中所有使用者的回饋改產品。

Linear：A 在專案「記憶系統重做」，B 是獨立的單（都在 Backlog）。

## 15. 實作紀錄

### P2（2026-10-30）：資料表與同步
- 資料表 `workspace_memory_records` 已由 Allen 在**測試站**（`nnousccvghbkucloewrs`）的 SQL Editor 套用並查證（欄位、三條 RLS、觸發器、realtime）。**正式站尚未套用**，等 Allen 上線時處理。
- 沒有做 RPC：版本與時間由資料庫觸發器給，樂觀更新用 `version=eq.N`。頁面 store 見 `src/app/runtime/memory-store/`；伺服器直接以服務身分寫入（`server/memory-records.js`）。

### P3（2026-10-30）：注入與設定畫面
- 開關：設定鍵 `memorySystem`（`'classic'` 預設，`'notes'` 為新記憶；P8 才改預設）。在設定 → 記憶最上面的卡片，隨設定一起跨裝置同步。
- 注入（`stream-api-call.js`）：第一頁（常駐＋規則＋目錄行）放進系統指令；便條（`<memory-context>`）只接在**請求複本**裡最後一則使用者訊息後面，不存進訊息。改版前後每一輪系統指令的文字不變，便條才是變動的部分。臨時對話且不可使用記憶時兩者都不給；`use` 關掉時也不給。
- 伺服器代跑的回覆：頁面的 `describeOnly` 多回傳 `memorySlipText`，run-spec 多一個選填欄位 `request.memorySlip`（≤4000 字元，`server/protocol.js` 的 `maxMemorySlipChars`），伺服器把它傳給 `streamApiCall`，同樣接在使用者訊息後。舊版頁面不帶這個欄位，不受影響。
- 「用到」的記錄：便條實際送出時，那幾條便條的 `lastUsedAt`、`recallCount` 才更新（一個回覆只算一次，工具後續回合與 `describeOnly` 不重複算；伺服器代跑的由頁面在送出請求時算）。
- 載入失敗（資料表不在、網路斷）只讓記憶變空，聊天照常；設定畫面會說「暫時讀不到記憶」。
- 畫面（Allen 2026-10-30 選 B）：摘要卡（筆記數、常駐數、最近更新）＋「最近的變動」（可復原）＋「管理筆記」獨立頁（搜尋、分類、新增、編輯、常駐、不主動提起、刪除）。手動操作的規則在 `memory-notes/manage.js`（純函式）；使用者編輯過的筆記會鎖定，之後模型不覆蓋；刪除留墓碑。文字在 `src/data/i18n/parts/memory-notes.js`（五語）。
- 還沒做：便條裡的「歷史片段」要等 P5 的歷史索引；工具（`search_memory`、`memory_write`）在 P4。

### P4（2026-10-30）：學習
- **工具**：`src/data/memory-tool.js`（`search_memory`、`memory_write`，共用給頁面與伺服器）。工具描述用「觸發情境」寫法，寫入一律經過 `applyWrite`。`combineLoaders` 從 `server/mcp/tool-loader.js` 搬到 `src/data/combine-loaders.js`（頁面也要用；伺服器那邊照舊 re-export）。
- **頁面本機回覆**：`prepareReply` 在 `memorySystem: 'notes'`、模型會用工具、且不是服務商自己搜尋的回覆時，把記憶載入器併進 skills 的載入器（`memory-store/page-memory-loader.js`）；各回覆迴圈不用改。「學習」關閉或暫停時只給 `search_memory`；臨時對話只讀不寫；「使用」關閉時什麼都不給。
- **伺服器回覆**：run-spec 的 `tools.memory = { canWrite, curator?, messages[] }`（上限見 `server/protocol.js`）。**與計劃的差別**：計劃寫「頁面把整份筆記本放進 run-spec」，實作改成**伺服器自己從 `workspace_memory_records` 讀筆記**（最新、含墓碑與設定與已套用的操作游標，也不用把幾百條筆記塞進請求）；頁面只傳「能不能寫」與使用者最近 12 則訊息（寫入檢查要比對逐字引用）。寫入直接進同一張表，並用既有的寫入檢查。讀表失敗時這次回覆沒有記憶工具、照常回答。
- **整理補位（沒有工具的模型）**：`src/data/memory-curator.js`（提示詞含 8 個範例、5 個是 none；解析容錯；每個操作都走 `applyWrite`，`who: 'curator'`）。頁面：回覆結束後延遲 2 秒由 `page-curator.js` 執行（接在舊的 `extractPersonalMemory` 入口，筆記模式下舊記憶不再寫入）；伺服器：`executeReply` 設 `memoryOut.afterReply`，`runs.js` 在訊息寫完、頁面已被告知結束之後呼叫（最多 30 秒、失敗只記日誌）。整理模型：使用者在設定選的 → 同供應商的便宜模型（`CURATOR_DEFAULTS`，**目錄沒有價格資料，所以是一張人工看過的短表**；沒有對應的供應商就用回覆的模型）→ 回覆的模型。伺服器只有回覆那一家的金鑰，所以只能用同供應商的模型。
- **畫面**：回覆下方「已更新記憶」（每個對話第一次有寫入的回覆才出現；點開看變動並可復原）、「用到 N 條記憶」（點開每條可按「這裡不相關」，三次後離開常駐區）。ID 放訊息 `metadata.memoryUsed`／`memoryUpdated`，已加入雲端同步放行名單。伺服器補位寫入的變動不進那則訊息（訊息已寫完），只出現在設定 → 記憶的「最近的變動」。設定頁多了「整理模型」下拉。
- **步驟列**：每次呼叫記憶工具會在處理步驟列出現一行（「查詢記憶」「更新記憶」）。
- **還沒做**：實機評估（`scripts/memory-eval.mjs` 的真模型模式需要金鑰，離線評估仍通過）；歷史範圍的 `search_memory`（P5）。

### P5（2026-10-30）：歷史索引與重建
- **歷史索引**：`memory-notes/history-index.js`（切片 ≤800 字元、同一套斷詞與 BM25、每個對話最多一片、排除目前這個對話與暫時／已刪對話）。**與計劃的差別**：沒有存 IndexedDB 快照，改成頁面使用時從已有的對話在記憶體裡建、只重切有變動的對話（以訊息數與更新時間為簽章）；建索引只是 CPU，不呼叫模型，也不送出任何東西。若實測冷啟動太慢再加快照。
- **門檻**：歷史片段的 BM25 比例分數天生比筆記低（一段長文裡每個詞只出現一次），所以歷史用「覆蓋率」把關：至少 2 個有分量的詞、且涵蓋問題裡有分量的詞的 60%（問題只有一兩個詞時可由獨有的詞單獨成立）；`PREFETCH.historyMinNorm` 因此從 0.45 降到 0.25。
- **便條與來源**：沒有任何筆記時，歷史片段也會成為便條；用到的舊對話照舊顯示在回覆下方的「參考歷史對話」（走原本的 `historySourceConversationIds`）。伺服器代跑的回覆由頁面在送出前算好便條（歷史片段已在裡面）；伺服器端的 `search_memory` 沒有 `history` 範圍（計劃第二版）。
- **重建**：`src/data/memory-rebuild.js`（最近 30 個對話、由舊到新、每個對話送最後 12 則使用者訊息、受墓碑限制、可暫停、暫停後繼續不重讀已讀到同一則訊息的對話、可再往前 30 個、失敗連續 3 次就停）＋頁面控制器 `page-rebuild.js`＋設定 → 記憶的「從過去的對話建立記憶」卡片（「清空後重新建立」會先問）。**與計劃的差別**：計劃寫「升級後第一次打開自動開始」，實作改成**按鈕**——每個對話要花一次整理模型呼叫（約 30 次），自動花使用者的錢不妥；是否要自動，等 Allen 決定。

### P6（2026-10-30）：定期整理
- **誰做什麼**：規則還是 `memory-notes/consolidate.js`（到期判斷、第一層、可疑小組、檢查模型答案）；新增的 `src/data/memory-consolidate.js` 負責**執行**（挑模型、小組提示詞、解析答案、封存被併掉的筆記、寫事件），頁面與伺服器共用。頁面 `memory-store/page-tidy.js`，伺服器 `server/memory-tidy.js`。
- **什麼時候整理**：`consolidatedAt`（設定列新增欄位，上次整理的時間）。到期 = 從沒整理過、距上次超過 7 天、或上次之後有 20 條以上筆記動過、或在用的筆記超過 240 條。頁面：每一輪（含被跳過的輪次）結束後試一次，沒到期就什麼都不做；伺服器：回覆寫好之後的結尾步驟（接在 curator 後面，一個步驟失敗不影響另一個）。設定裡有「現在整理」按鈕（不管是否到期）。**開始前先寫入 `consolidatedAt`（先佔位）**，所以頁面和伺服器同時到期時只有先佔到的會跑；模型失敗時第一層仍做完，不重試到下次到期。
- **兩層**：第一層不用模型（過期封存、很久沒用淡出、幾乎一樣的合併、常駐區回到規則內）。第二層只在「自動學習」開著時用便宜模型看最多 6 個可疑小組，每組一次呼叫，只送該組筆記；答案一律經 `checkGroupOps`（只能是該組的筆記、新的贏、鎖定的不碰、合併句不能加新東西）再套用。連續失敗 2 次就停，超過期限（伺服器 20 秒）也停。模型與 curator 同一套選擇（`pickTidyModel`：設定 → 同供應商便宜模型 → 回覆用的模型；整理不在對話裡做時，沒有「目前模型」就選任何有金鑰的供應商的便宜模型）。
- **什麼都不刪**：被併進別的筆記的那條改成「封存」並記 `supersededBy`；整理的每一個改動寫成事件（`who: 'consolidation'`，每條動到的筆記保存整理前完整內容）。一個資料列上限 20000 bytes，所以動很多條時拆成幾個事件（同一個 `batch`），設定畫面把它們合成一行、一次復原。**復原**：每條筆記回到整理前；整理之後人又改過或刪掉的那一條不動。事件 30 天後清除（頁面 `pruneEvents`，伺服器 `memory-records.js` 新增 `pruneEvents`）——這一版才真的有人呼叫它。
- **畫面**：設定 → 記憶 → 新卡片「整理記憶」（說明、上次整理時間、「現在整理」）；「最近的變動」多一種行「整理了 N 條筆記（合併 a 組、過期 b 條…）」附「復原」。
- **隱私**：第二層會把小組裡的筆記文字（不含對話）送給模型供應商；這是新的資料流，**隱私權政策與協助中心五語要在 P8 一起更新**。
- **契約**：設定列 `meta:settings` 新增 `consolidatedAt`；`event:*` 新增 `who: 'consolidation'`、`batch`、`summary`、op 的 `action: 'tidy'`（舊版頁面會當作沒有可顯示的內容而略過）。`server/memory-records.js` 新增 `saveSettings`、`pruneEvents`，`saveWrite` 接受 `result.events`。
- **還沒做**：實機（真模型）驗證第二層的判斷品質；`scripts/memory-eval.mjs` 目前不含整理案例。

### P7（2026-10-30）：向量搜尋（選配）
- **預設關閉**。設定 → 記憶 → 新卡片「語意搜尋（選配）」：要先有 Gemini 或 OpenAI 的金鑰（Gemini 優先）；按「開啟…」會跳出同意視窗，**先講清楚會送什麼**（過去對話約 N 段、M 字元、約 K tokens，送到哪一家、用自己的金鑰、向量只存在這台裝置、可隨時關閉並刪除）；同意才寫入 `vector: { enabled, consentAt, provider }`（`enabled` 沒有 `consentAt` 一律視為關閉）。關閉會刪掉這台裝置的向量並停止送出。
- **模組**（都是頁面端，伺服器不碰）：`memory-notes/vector-math.js`（單位向量、內積、取前幾名、RRF 合併、文字雜湊）、`memory-store/embedding-client.js`（Gemini `gemini-embedding-2` 的 `batchEmbedContents`，模型沒有批次呼叫時退回一則一則 `embedContent`；OpenAI `text-embedding-3-small`；都是 768 維，頁面直接用使用者自己的金鑰呼叫，`vercel.json` 的 connect-src 本來就有這兩家）、`memory-store/vector-store.js`（IndexedDB，每個使用者一個資料庫；記錄 = 切片 id＋文字雜湊＋向量；索引帶模型版本，換模型整個丟掉重建）、`memory-store/page-vectors.js`（同意、建立、搜尋、關閉）、`ui/memory-notes/memory-vector-card.js`。
- **建立**：在歷史索引的切片上做（少於 12 字元的切片不送）；一組最多 32 段或 16000 字元；已經有向量且文字雜湊沒變的不重送；對話刪掉或訊息改了，向量隨切片消失；暫時對話本來就不進索引所以不會送出。連續失敗 3 次或 401／403 就停下並顯示原因（可按「重試」）。觸發：頁面載入後 5 秒、每一輪結束後。
- **搜尋**：`search_memory` 工具的歷史範圍改成「關鍵字結果＋最接近的向量結果」用 RRF 合併（每個對話最多一片）；向量沒開、沒金鑰、供應商失敗、沒有向量時，一律退回只用關鍵字，不影響回覆。相似度下限 `minCosine` 初始 0.5。
- **與計劃的差別（請 Allen 看）**：**每一輪自動帶的「便條」不用向量**，只有模型主動呼叫 `search_memory`（歷史範圍）時才用。原因：便條是同步組出來的，要用向量就得在每次送出前多等一次網路來回（約 0.3 至 0.5 秒）。想要的話可以做成「關鍵字沒命中時才查向量，最多等 0.7 秒」，要 Allen 決定。另外沒有存「向量庫大小」的上限，幾萬片（約 60 MB）還可以，再大要另外處理。
- **還沒做**：用真實金鑰驗證兩家 embedding 的實際回應格式與 `minCosine` 的合適值（測試用的是假的伺服器，格式依官方文件）；第二層整理（P6）的分組也沒有用向量；隱私權政策與協助中心五語要在 P8 更新（這是新的資料流）。

### P8（2026-10-30）：切換與清理
- **切換**：不再有「使用新記憶系統」的開關，也沒有 `memorySystem` 設定鍵：筆記就是唯一的記憶。設定 → 記憶只剩新畫面（標題、使用／學習開關、摘要、最近的變動、重建、整理、語意搜尋、管理頁）。`#memory-section` 在版面範本裡變成空容器，由 `memory-notes-settings.js` 填入。
- **刪掉的程式**：`src/app/runtime/memory/` 全部（42 檔）、`shell/memory-summary-lifecycle.js`、`shell/model-memory-dashboard-lifecycle.js`（**資料儀表板的部分先搬到新的 `shell/dashboard-lifecycle.js`**，其餘刪除）、`settings/settings-memory-summary-controls.js`、`settings/settings-history-recall-controls.js`、`sync/memory-summary-cloud-sync.js`，以及它們的約 30 個測試。`memory-model-runner.js` 留下（curator、重建、整理、伺服器都用它）。「回覆下方參考歷史對話」的兩個小函式搬到 `memory-notes/history-sources.js`。
- **一輪結束後的學習**：`assistant-response-finalization.js` 的 `memoryEnabled`／`autoMemoryEnabled`／`extractPersonalMemory` 換成 `learnEnabled`／`learnFromTurn(conversation)`（接到 `curateNotesTurn`，也會順便試整理與補向量）。
- **設定鍵**：刪掉 `memorySystem`、`memorySystemVersion`、`memoryEnabled1`、`enableAutoMemory`、`memoryProfileEnabled`、`historyRecallEnabled`、`memorySync`；留下 `memoryModelId`（curator、重建、整理在沒有「目前對話模型」時的後備）。舊設定裡殘留的這些鍵會在下次正規化時消失（`memorySync` 在雲端設定比對時仍被忽略）。
- **舊資料**：應用資料的 `memoryState`（舊記憶摘要）載入時一律換成 `{}`，下次存檔就沒有了（D5：舊記憶資料全部丟掉）；欄位本身留著（儲存層的 `memory` 區塊還在讀寫，之後可再拿掉）。**`personalMemories`（舊的手動個人習慣記憶清單）沒有動**：它還在匯出／匯入裡，但不再被讀取、不再顯示。雲端 `workspace_memory_summary_records` 停止讀寫，**資料表留給 Allen 之後用 migration 清**；本機 `noureon:history-index:v1:*`、`noureon:derived-memory:v1:*` 沒有主動清（不再讀，只佔空間）。
- **歷史索引**：新索引在切片前先用 `summarizeFileBlocks` 把檔案區塊縮成摘要（舊索引就是這樣），避免附件全文被索引、也不會被送去做向量。
- **文字**：隱私權政策第 9 節與協助中心第 13 節的記憶段落五語重寫（筆記、怎麼用、怎麼學、整理、重建、過去對話、語意搜尋與同意、30 天紀錄、伺服器代跑時怎麼讀寫），其他提到記憶的句子（本機／雲端保存、同步內容）改成筆記；`PRIVACY.md` 重新產生；刪掉約 60 組不再使用的舊記憶／回憶文字（五語）與 `settings.css` 裡的舊樣式。
- **還沒做／Allen 要看**：①舊使用者上線後筆記是空的，要按「用過去的對話建立記憶」（計劃 D5 寫「自動重建」，目前是按鈕，沒有自動開始，因為會把對話文字送去模型）；②匯出／匯入資料還帶著 `personalMemories`（舊清單），沒有匯出筆記（筆記有自己的匯出）；③正式站要先套 `20261030010000_add_workspace_memory_records.sql`；④更新紀錄與版本由 Allen 發版時處理；⑤實機（真實金鑰）沒有驗證過：兩家 embedding 的實際回應、curator／整理的判斷品質、伺服器代跑時的讀寫。

### 第二輪（2026-10-30，Allen 說「開始做，附件也一起進向量」之後）：MEM2-A 到 E
- **A 自動重建與匯出匯入**：第一次載入記憶（`rebuiltAt` 空）時，約 10 秒後自動用最新 30 個對話重建一次（`page-rebuild.js` 的 `maybeAutoStart`），之後只在按鈕時重建；筆記（含「已刪除的關鍵字」黑名單）可以在設定頁匯出、匯入，也跟著資料匯出匯入走（`memory-notes/notes-transfer.js`）；模型查筆記或歷史時，回覆下方的步驟顯示「正在回憶…／正在回顧對話…」。
- **B 向量一律 Gemini Embedding 2**：直連 Gemini，或經 OpenRouter 的 `google/gemini-embedding-2`；兩條路共用同一個索引（版本字串 `versionOf` 一樣，切換不重建），768 維；拿掉 OpenAI。圖片、影片、音訊、文件（PDF）也各自一片進向量（`memory-notes/media-pieces.js`，一個檔案一次請求；模型讀不了的標成 `failed`，不再重試）。**沒驗證**：OpenRouter 多模態 embedding 的請求格式是照官方文件推測的，沙盒連不到文件站與 API；失敗只會被略過，不會中斷。
- **C 本機備份與雲端向量**：
  - 雲端帳號的筆記在瀏覽器留一份鏡像（`backends.js` 的 `createMirroredBackend`，`notes-memory.js` 包上去）：伺服器連不上時讀鏡像、寫入先排隊，連上後以 `mergeNotes` 合併送出，不會蓋掉別台裝置的變動。
  - 本機帳號綁定到雲端帳號時，筆記跟著搬（`notes-carry.js`：綁定時複製一份到雲端帳號名下，雲端帳號的記憶下次開啟時併入，併入後才刪副本）。
  - 向量可以另外選擇「同步到雲端帳號」（`meta:settings` 的 `vector.sync`，獨立開關，預設關；本機帳號沒有這個選項，向量只留瀏覽器）。新 migration `20261031010000_add_workspace_memory_vectors.sql`：`workspace_memory_vectors`（pgvector `vector(768)`、`model`、`hash`、`failed`，RLS 只讓本人讀寫刪，伺服器用 service key），以及只有 service role 能呼叫的 `match_workspace_memory_vectors`。頁面端 `memory-store/vector-sync.js`：建立前先從雲端拉別台已做的、建完推上去、清掉已不存在的片段與別的模型的向量；雲端連不上只記警告，繼續用本機的。關閉搜尋或關閉同步會刪掉雲端副本。
  - **測試環境限制**：PGlite 沒有 pgvector，`tests/helpers/database/supabase-database.js` 的 `withoutPgvector` 在跑這支 migration 時把向量欄位換成 text、拿掉 `create extension`；表、RLS、權限測得到，`<=>` 距離與 RPC 的真實行為**要在 staging 的 Supabase 上驗證**。
- **D 伺服器搬運**（本機候補都保留）：
  - 伺服器回覆也能查過去的對話（`search_memory` 的 `history`／`both` 範圍）：`server/memory-history.js` 用資料庫函式 `server_read_history`（migration `20261031020000_add_server_read_history.sql`；伺服器依規定不直接讀 `workspace_*` 表，這個函式只給最新 150 個對話的**文字**，不含檔案與中繼資料，只有 service role 能呼叫）讀對話，用跟頁面同一套 BM25 索引（`history-index.js`，共用模組）搜尋，快取 60 秒。有同步向量且頁面給了金鑰時，再把問題轉成向量、呼叫 `match_workspace_memory_vectors`，與關鍵字結果用 RRF 合併；文字雜湊對不上的向量不用。任何失敗都退回只用關鍵字或空結果，不影響回覆。本機帳號沒有雲端對話，仍由頁面自己查。
  - **契約變更（protocol 2 → 3）**：`tools.memory.history`（布林）、`tools.memory.vector`（`{ provider: 'gemini' | 'openrouter' }`，只有 `history` 為真時可用）、`secrets.embeddingKey`（只有有 `vector` 時可帶、有 `vector` 時必帶；跟其他金鑰一樣只活到這次回覆結束）。舊版伺服器會因為協定版本不同（426）讓頁面改在本機回覆。新增的共用模組：`history-index.js`、`vector-math.js`、`embedding-client.js`（已列入 `scripts/server-shared-modules.json`）。
  - **這輪沒做**：①「用過去對話建立記憶」的伺服器版——執行環境的 run 都綁在一則訊息上（寫訊息、重新連線、金鑰保管），做這個要先決定新的 run 種類（沒有訊息的背景工作）怎麼進 `run-spec`／`runs.js`，頁面版（可暫停、可接續）原樣保留；②每一輪自動帶的便條仍不用向量（0.7 秒等待的做法已核可，等伺服器版查詢穩定後再加）。
- **E 文字**：隱私權政策與協助中心的過去對話段落五語改寫（Gemini Embedding 2、附件進向量、本機備份、獨立的雲端同步開關、伺服器讀文字與回覆結束就丟的金鑰），`PRIVACY.md` 重新產生。
- **要 Allen 套用到 Supabase 的檔案（順序）**：`20261030010000_add_workspace_memory_records.sql`（如果還沒套）、`20261031010000_add_workspace_memory_vectors.sql`、`20261031020000_add_server_read_history.sql`；先套 staging 專案，確認 pgvector 擴充可用（`create extension vector` 在 Supabase 要啟用 Database → Extensions → vector）再套正式。

### 第三輪（2026-10-30，staging 實測之後；Linear NOU-157 到 NOU-160）
- **漏洞**：伺服器回覆的 metadata 是空的。原因：頁面存訊息時只讀自己的 trace（`memory-trace.js`），伺服器在 `kept` 裡寫的 `memoryUsed`／`memoryUpdated` 從沒被讀回，同步時又蓋掉了伺服器寫的。修法：`followServerReply` 把 `row.metadata` 的 `memoryUsed`、`memoryUpdated`、`memoryHistory` 帶回（`outcome.memory`），記進 trace，存訊息時一起存；`memoryHistory` 加進 `cloud-sync-v2-codecs.js` 的保留清單。
- **查過的對話只存名稱與日期**（Allen 決定「不存片段」）：`memoryHistory: [{ id, title, at }]`，最多 5 個。標題在查的當下由頁面讀（`setHistoryTitle`），對話之後被刪也還有名字，顯示「原對話已刪除」。
- **來源面板**（Allen 選方案 2 分頁籤）：`ui/citations/source-panel.js`，分頁「全部／網頁／記憶／對話」，記憶列顯示筆記與「與這題無關」（常駐的不給標，因為每次都帶），對話列顯示標題日期與「打開這個對話」；寬螢幕在右側面板，手機是底部面板（`runtime/features/reply-sources-actions.js`）。回覆底下的「來源」按鈕在只有記憶或對話時也會出現，圖示堆疊多出 brain 與 messages-square。回覆下方原本的「用了 N 條記憶」晶片和「參考了 N 個對話」那一行都併進來源，不再各自存在；「記憶已更新」晶片留著（有復原）。
- **圖示**（Allen 定案，Lucide／Tabler／Phosphor，ISC 與 MIT）：`ui/icons/memory-icons.js`；步驟列的圖示用 CSS mask（`styles/step-icons.css`，蓋過 `ledger.css` 裡舊的技能與連接器圖示）：已回憶 Tabler book、已回顧 history、已更新 pencil、技能 wrench、連接器 plug。筆記管理頁的標籤與篩選也有圖示（常駐 pin、偏好 heart、事實 badge-check、專案 folder、人與寵物 users、日常 sun）。**沒做**：命令工具 terminal 與「Python 步驟換 code-xml」（Allen 還沒決定）。
- **資料管理**（Allen 要求跟資料匯出匯入整合、可勾選）：匯出視窗裡「記憶筆記」勾選框會顯示條數；匯入時確認視窗先說檔案裡有什麼（對話、資料夾、Nouras、設定），筆記是一個可取消的勾選框，匯入後跳出明細（新增哪幾條、略過哪幾條與原因、加入幾個不要再學的關鍵字）。記憶管理頁自己的匯入匯出按鈕拿掉，改成一句話指向設定 → 資料管理。`showCustomConfirm` 多了 `checklist`、`okOnly`、`preformatted` 三個選項。對話與資料夾還是整批取代，沒做成可個別勾選。
- **常駐筆記**：顯示「常駐，每次都會帶」，不再顯示「還沒用過」。
- **隱私文字**：隱私權政策過去對話段落補一句：回覆為了來源會記下查過的對話的名稱與日期（不記內容）；`PRIVACY.md` 已重新產生。
- **還沒驗證**：以上全是測試加手寫的畫面，沒有在 staging 用真資料看過（來源面板、匯入明細、新的步驟圖示都要 Allen 在 staging 看）。

### NOU-151（2026-10-30）：伺服器版「用過去對話建立記憶」
- **做法**：`server/memory-rebuild.js`。每個使用者同時只有一個工作（在伺服器行程裡），用 `src/data/memory-rebuild.js` 的 `rebuildFromHistory`（頁面版同一份，已列入 `scripts/server-shared-modules.json`），讀對話用 `server/memory-history.js` 的 `readConversations`，筆記與游標寫回 `workspace_memory_records`。最長 25 分鐘。
- **金鑰**：隨 `POST /v1/memory/rebuild`（`{ modelId, key, language }`）送來，只放在工作的記憶體，不寫入資料庫、不進紀錄；工作結束就丟掉。
- **進度**：寫在記憶設定的 `rebuildJob`（`status: running | done | stopped | failed`、`done`、`total`、`added`、`startedAt`、`updatedAt`、`error`）。頁面不用另外輪詢，記憶庫本來就會同步，設定卡片跟著更新。`POST /v1/memory/rebuild/stop` 停掉。
- **伺服器重啟會中斷**：`running` 但 `updatedAt` 超過兩分鐘沒動，頁面當作「中斷」，卡片顯示「繼續」（只補沒讀過的，游標會跳過讀過的對話）。
- **只做第一次／繼續，不做「先清空再重建」**：先清空要的是全有或全無，伺服器工作可能中斷，所以清空的重建仍在頁面做。伺服器不可用（沒有雲端帳號、回覆設為本機、網路失敗）時，頁面版照舊。
- **頁面端**：`memory-store/server-rebuild.js` 呼叫兩個端點；`createRebuildController` 的 `start()`（非 `clearFirst`）與自動第一次建立先試伺服器，被拒絕才在頁面做；`already_running` 視為已接手。
- **契約**：新增兩個 HTTP 端點、設定欄位 `rebuildJob`、共用模組 `src/data/memory-rebuild.js`（Linear NOU-151 留言）。
- **還沒驗證**：真的在 staging 的伺服器上跑（要 Allen 重新部署前端與伺服器）。

### 第四輪（2026-10-30，Allen 說「全做」）：四個之前沒做的項目
- **自動小抄等向量（最多 0.7 秒）**：`notes-memory.js` 的 `contextWithMeaning`（`contextFor` 照舊同步）。只有關鍵字沒找到任何過去對話、使用者開了語意搜尋時，才拿**這則訊息的文字**去問向量（`page-history.js` 的 `meaning`，相似度門檻 0.6，比工具的 0.5 高；最多 2 段、每個對話一段），超過 0.7 秒就放棄並取消請求，失敗一律退回關鍵字的結果。關鍵字有命中時不會問向量。`stream-api-call.js` 的 `resolveSystemInstruction` 改用它（伺服器回覆的指示文字也由同一個函式在頁面組出，所以兩邊一樣）。這是語意搜尋同意書裡「你的問題會送到 Gemini Embedding 2」那一句涵蓋的資料流，隱私文字不用改。**0.6 沒有用真資料調過**，先當起點。
- **步驟標題帶數量**：回憶與回顧的步驟，在呼叫有答案時改成「已回憶 N 條記憶」「已回顧 N 個對話」，找不到時「沒有找到相關的記憶／對話」（五語；英文等用「…：N」的寫法避免單複數）。做法：`createMemoryLoader` 的 `outcome()` 回報這次搜尋的 `{ key, count }`（讀一次就清掉；回顧看的是找到的對話數，回憶是筆記數）；`loaderEndEvent`（`sandbox-texts.js`）把它放進 `tool-end` 事件（`count`、`label`）；三個迴圈（技能、網頁研究、Python）都改發這個事件。存起來的回覆：`run.tools` 的記憶項多了 `count`（`normalizeTools` 只留 0 到 1000 的整數；`noteToolEnd` 把數量寫到剛結束的那一列，頁面與伺服器 `executor.js` 都用它），重新打開時 `memoryDoneLabel` 照樣顯示。舊的回覆沒有 `count`，顯示原本的「已回憶」。**契約**：`tool-end` 事件多兩個欄位、`run.tools` 的記憶項多 `count`，舊頁面會忽略。
- **匯入逐項勾選**：匯入確認視窗列出檔案裡有的項目，各自一個勾選框（預設全勾）：對話、資料夾、Nouras、設定、API 金鑰、記憶筆記。只有勾選的會被取代，沒勾的維持現狀（以前是整批覆蓋）；一個都沒勾就不動任何東西。只回答是／否的確認（舊的呼叫方式）仍視為全部匯入。**還是整類取代，不是一則一則挑對話**；若要挑單一對話，需要另外做合併，不在這次。舊的「檔案內容：…」摘要文字拿掉（`importFileHas`），新增 `importHasApiKeys`、`importChooseItems`、`importNothingChosen`。
- **舊摘要表清理**：migration `20261031030000_drop_workspace_memory_summary_records.sql`（刪 `upsert_workspace_memory_summary_records` 與 `workspace_memory_summary_records`）。**不可復原；先套測試專案，正式專案要等帶筆記記憶的版本上線之後再套**（舊版頁面還會寫這張表）。測試裡 `forPeople` 的函式清單也拿掉了這一個。

### 第四輪補充（2026-10-30，Allen 看了 staging 之後）
- **來源按鈕圖示**：記憶與對話的圖示是方塊底色又互相疊在一起（兩個細線圖示疊出一條直線）。改成圓形、與鄰近圖示留 0.2rem 間隔（`citations.css`）。
- **「與此對話無關」**：來源面板上的動作改名（`sourceNotRelevant`，五語）。注意：這個動作記的是筆記自己的「不相關」次數（`notRelevant`，到上限常駐就取消），不分是哪個對話；名稱說的是此對話，行為還是全域計數，若要改成真的只對這個對話有效，要另外存「每個對話排除的筆記」。
- **回憶／回顧步驟可展開**：步驟記錄多了 `ids`（回憶：筆記 id，最多 10）與 `chats`（回顧：`{ id, at }`，最多 10）；不存任何對話內容。展開時才由頁面填入（`reply-sources-actions.js` 的 `fillMemoryRow`）：筆記顯示現在的文字（之後被刪掉的會寫「這條記憶已刪除」）；對話顯示現在的名稱與日期，還在的有「打開這個對話」。`tool-end` 事件多帶 `ids`／`chats`。舊回覆沒有這些欄位，所以不能展開。
- **伺服器回覆搜尋時運行中沒有步驟（Allen 在 staging 看到）**：模型自己搜尋的伺服器回覆（`mode === 'research'`），迴圈的事件經 `skillEvents` 送給頁面，但只放行技能、連接器、圖片、記憶與 `tool-end`，`searching`、`sources`、`answering` 被擋下，所以運行中只有「正在思考」，搜完才一次出現「已搜尋 N 個網站」。改成每個有 `type` 的事件都送（`server/executor.js`），頁面用跟本機回覆同一個步驟清單畫；晚加入的頁面由 `runs.js` 記下的事件補齊。測試：`server-executor.test.js` 新增一則，沒修之前會失敗。

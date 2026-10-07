# 多模型會議（Council）搬到伺服器（關掉頁面也會開完會）

**日期：** 2026-10-08
**狀態：** owner 已決定 §2（2026-10-08），尚無任何程式變更；**P0 已完成（§7）**。這是「圖片 → 先搜一包 → 會議」三件事的最後一件。
**前置閱讀：** [`AGENTS.md`](../../../AGENTS.md)、[伺服器執行設計](2026-10-03-server-runtime-design.md)、[圖片生成搬到伺服器](2026-10-06-server-image-generation-design.md)（新增一種任務類型的做法）、[先搜一包搬到伺服器](2026-10-07-server-search-packet-design.md)（搜尋包、備援金鑰、搜尋中顯示、共用的寫法）。

## 1. 現況與要解決的事

**會議怎麼運作（全在瀏覽器）。** `runModelCouncil`（`council-response-lifecycle.js`）依序做：

1. **附件轉譯**（有成員看不懂圖片或檔案時，由轉譯模型各寫一份「圖片包」「文件包」）。
2. **讀網址**（訊息裡的網址讀一次，給所有成員）。
3. **共用搜尋包**（開了網路搜尋才做；合成模型是 Gemini 就用它的原生搜尋，否則用 Tavily／TinyFish；失敗不致命，會議照開）。
4. **第一輪**：2 到 5 個成員同時回答（各自拿到完整對話歷史、搜尋包、附件包）。
5. **第二輪（只有「辯論」模式）**：成員看過所有人的第一輪後再答一次（可能再搜一次）。
6. **合成**：合成模型整理出最後答案（可含「共識與差異整理」表），串流給使用者；最後可附「原始回答」摺疊區。

**問題。**

- 整個會議沒有任何東西存下來：使用者訊息先存，AI 訊息要到**整場會議結束**才建立。會議常常好幾分鐘（兩輪加合成），關掉頁面、鎖手機、切到別的 App，整場白費。
- 其他裝置完全看不到進行中的會議。

**好消息。** 會議的主程式 `createCouncilResponseLifecycle` 已經是純的（沒有 DOM，由測試保證，所有依賴都從外面傳入），可以在 Node 裡跑；模型呼叫（`createStreamApiCall`）、搜尋（`createWebResearchTools`）、搜尋包（`search-packet-parts.js`）伺服器都已經在用。

**目標。** 送出會議後，頁面關掉也會開完、答完；畫面上看到的（進度面板、串流的合成答案、摺疊區）**完全不變**。

## 2. owner 的決定（2026-10-08）

1. **全部搬上伺服器，包含附件轉譯與讀網址。** 會議的每個階段（轉譯、讀網址、共用搜尋、第一輪、第二輪、合成）都由伺服器做，關頁面後不會有任何一段需要頁面開著。所以請求要帶原始附件（以現有的方式，base64 放在 `inlineData`，檔案放在雲端的用標記），轉譯模型也要有金鑰與模型資料（`secrets.keys` 涵蓋轉譯模型的供應商）。
2. **進度面板：** 照 §4 的做法（即時頻道）；owner 看不懂原提問，已改用白話說明，等 owner 回覆（建議維持：像文字回覆一樣，正在看的頁面看得到進度面板，沒開著的裝置等結果出來；不新增訊息畫面）。
3. **詳細結果不同步到雲端：** 維持現狀（訊息只有最後文字，含「原始回答」摺疊區）。
4. **同時進行不加限制。** 只靠每次呼叫的逾時（見下）與既有的每人 5 個進行中執行。
5. **沿用「回覆在伺服器或這個裝置上產生」選項：** 選本機、沒有雲端帳號、暫時對話、請求太大、伺服器連不上或協定不符，都照現在的做法在瀏覽器開會，不顯示任何提示。
6. **每次呼叫的逾時：** owner 認為 5 分鐘太短。改為**每個成員、每次合成各 30 分鐘**（整場仍受既有的 2 小時上限約束）；逾時算該成員失敗（合成逾時走既有的「合成失敗就列出成員答案」備案）。理由：推理模型會想很久；而一個真的卡住的成員最多拖 30 分鐘，不會拖到 2 小時。
7. **版本：** 17.11.0（新功能算次要版本）。

## 3. 現成可用的零件（已讀程式確認）

- `council-response-lifecycle.js`：純的，約 690 行；所有依賴（`streamApiCall`、`fetchTavilySearchPacket`、`getCouncilSelectedModels`、各種文字、`now`、計時器）都注入。`tests/council-response-lifecycle.test.js`（15 項）有現成的測試台，可直接拿來做伺服器端測試。
- `provider-request-support.js` 的 `createProviderRequestSupport`：會議要的 `fetchTavilySearchPacket`、`streamCouncilApiCallWithRetry`、`filterPartsForModelCapability`、`truncateCouncilText` 都從它來；沒有 DOM，可在 Node 跑（伺服器還沒用過）。
- 伺服器的執行骨架（`runs.js`、`executor.js`、金鑰信封、停止、重啟接續、訊息寫入、即時頻道、客戶端的 `reattach.js`、失敗說明）全部沿用。
- 先搜一包做好的：兩把搜尋金鑰（`searchKey`／`searchKeyAlt`）、搜尋深度、搜尋中的即時事件 `ss`。
- 邊界檢查：`scripts/server-shared-modules.json` 要把新引用到的共用模組列進去（會議主程式、`provider-request-support.js`、`council-runtime-texts.js` 與它們引用到的）。

## 4. 設計

**任務類型。** RunSpec 新增 `kind: 'council'`，自己的驗證（像圖片一樣有獨立的驗證函式）：

- 共同欄位：`protocol`、`clientVersion`、`conversationId`、`assistantMessageId`、`sequence`、`request.language`、`request.messageMetadata`（記憶來源對話，由瀏覽器先算好）。
- `council`：`mode`（`consensus`／`deliberation`）、`showRawResponses`、`showComparisonTable`、`participants`（2 到 5 個）、`synthesizer`。每個模型帶 `{ id, apiId, name, provider, info }`，沿用單模型回覆「信任頁面送來的 `info`」的做法，避免伺服器與頁面的模型清單不一致。
- `request`：`history`（成員看到的完整歷史）、`currentMessage.parts`（原始訊息，含附件；轉譯與讀網址由伺服器做），以及成員與合成各自要用的系統指令（記憶、Nouras、學習模式由瀏覽器預先組好；檔案與圖表指引只用在合成）。
- `council.translator`：附件需要轉譯時用的轉譯模型（沒有則為空，設定的 `councilTranslatorModelId` 或預設的第一個看得懂圖片與文件的模型，由瀏覽器先決定好送上去）。
- `tools`：`webSearch`（`off`／`packet`／`grounding`，Gemini 合成模型用原生搜尋）、`searchProvider`、`searchDepth`。

**金鑰。** 一場會議可能用到最多三家的模型金鑰（`gemini`、`openrouter`、`nvidia`）加搜尋金鑰。`secrets.keys` 放各家的金鑰；伺服器逐一確認每個模型的供應商都有金鑰。**兩處要改：** `createModelAccess` 的 `keyFor` 要依供應商回金鑰、`getModelApiId` 要依模型；`scrubMessage` 現在只遮蔽第一層字串，要改成會遞迴遮蔽巢狀的金鑰，否則錯誤訊息與日誌會漏金鑰。

**執行（新的 `server/council-run.js`）。** 以伺服器的依賴組出 `createCouncilResponseLifecycle`：

- `streamApiCall`：沿用 `createStreamApiCall`，每次呼叫以 `requestOptions.modelInfo` 指定模型與金鑰。
- 每次呼叫加逾時（30 分鐘；現在伺服器的模型串流沒有逾時，一個卡住的成員會拖到 2 小時上限）；`streamCouncilApiCallWithRetry` 的重試，**重試前要清掉已收到的片段**（現在重試會重複送出已輸出的字，合成時會重複）。
- 把 `onProgress`（每個成員的狀態、搜尋狀態、階段）轉成即時事件，把 `onFinalChunk`（合成的字）轉成既有的答案事件與訊息寫入。
- 最後寫入訊息：文字、「共識與差異整理」與「原始回答」摺疊區都照現在的程式組（含寫死的中文與英文「### First round」，保持逐字相同，否則摺疊區的開闔記憶與本機版不一致）。全部成員都失敗時，沿用現在的錯誤訊息。

**即時事件。** 新增 `cs`（會議進度的結構化狀態：階段、每個成員的 `pending／running／done／failed／skipped` 與細節、搜尋狀態、開始時間）。伺服器鏡像記住最新的 `cs`，晚加入的頁面由快照得知；進度的秒數由頁面用開始時間自己算（事件裡不帶 `tick`、`elapsedMs`，省流量）。合成的字沿用既有的 `a`。

**重啟接續。** 檢查點（有版本，像深度研究一樣不符就不接）：`{ version, kind, stage, startedAt, searchPacket, secondSearchPacket, round1, round2, failures }`，每個成員完成與每個階段切換都存（帶 `progress: true` 讓重試次數歸零）。接續時：已完成的成員不重做、進行中的重做、合成從頭來（頁面本來就能處理「答案被改寫」）。檢查點上限 6MB，成員原文各上限 8000 字，足夠。

**停止。** 與現在一致：停止後保留已串流出的合成文字；合成還沒開始就沒有訊息，不留錯誤。

**客戶端。**

- `planServerCouncil`：和 `planServerImage` 同一套條件（設定、帳號、暫時對話），再加「每個模型的供應商都有金鑰」「請求不超過上限」。
- `startCouncil`：組出規格、`describeRequest` 取得系統指令、同步對話、POST `/v1/runs`。
- **關鍵的接縫：** 會議在 `submit-input-council-lifecycle.js` 是以 `runModelCouncil(parts, signal, onProgress, onFinalChunk, opts) → { text, metadata }` 呼叫的。伺服器版用**相同的簽名**：開始執行、跟隨即時事件、把 `cs` 轉成 `onProgress`、`a` 轉成 `onFinalChunk`、回傳 `{ text, metadata }`。這樣畫面的繪製、完成後處理（`finalizeAssistantResponse`）完全不動，伺服器沒收就退回原本的 `runModelCouncil`。
- `reattach.js`：新增 `council` 這種執行（現在寫死 `responseUsesCouncil: false`），重新打開頁面接回進行中的會議，並鎖住模型選單（和會議進行中一樣）。

**相容性。** 新增一種 `kind`、新欄位；舊伺服器回 `invalid_run_spec`，客戶端本來就會靜默退回本機（圖片、搜尋已驗證這條路），**不升協定版本**。

**隱私。** 會議的對話歷史、提示、成員與合成的回答、搜尋詞與結果會經過伺服器；各家金鑰加密暫存，結束就刪。`PRIVACY.md` 與設定隱私頁的清單各補一段，五語言。

## 5. 風險

1. **金鑰遮蔽**（§4）：巢狀金鑰不遮蔽會洩漏到錯誤訊息與日誌，必須先修再上。
2. **限流與費用：** 一場會議最多同時 5 路模型呼叫，兩輪加搜尋；OpenRouter、NVIDIA 免費方案容易被限流。現有的重試只有一次。收緊與否見 §2 第 4 點。
3. **沒有逾時**：要加（成員與合成各 30 分鐘、搜尋沿用現有的 45 秒），逾時算該成員失敗，會議照開。
4. **重試重複輸出**：見 §4，要清緩衝。
5. **請求大小：** 完整歷史加附件，附件以 base64 在請求裡；超過上限就退回本機（和單模型回覆一樣）。成員在伺服器上共用同一份歷史，不會把請求放大五倍。
6. **訊息裡只有文字：** 其他裝置還原的會議訊息沒有 `council` 欄位，畫面靠 `conv.council.enabled` 判斷；與現在雲端還原的行為相同，不是新問題。
7. **寫死的文字：** 會議提示與備案文字有寫死的中文，必須與本機版逐字相同（伺服器直接用同一份程式，沒有另寫）。
8. **進行中的訊息列：** 會議進行中，其他裝置同步到的訊息是空的「串流中」列；現在文字回覆也是這樣，不新增。
9. **記憶來源：** `historySourceConversationIds` 由瀏覽器先算好放進 `messageMetadata`（和單模型回覆一樣）。
10. **邊界檢查：** 新引用的共用模組要一個個讀過、列進 `server-shared-modules.json`，檢查才會過。

## 6. 階段（一次一個階段，做完回報，owner 說「推」才推）

- **P0：** 小實驗與核對：在伺服器程式碼上，用假的模型與搜尋回應，把真正的 `createCouncilResponseLifecycle` 跑一遍（共識與辯論兩種）；確認要列進共用清單的模組、記憶／系統指令要拆成幾段、`provider-request-support.js` 在 Node 上可用。
- **P1：** 伺服器端：`run-spec.js` 的 `council` 驗證、`secrets.keys` 與 `scrubMessage` 遞迴遮蔽、`model-access.js` 依供應商取金鑰、`council-run.js`（逾時、重試清緩衝、進度事件 `cs`、訊息寫入、檢查點與接續、停止）、`runs.js`／`app.js` 分派、測試（以現有的會議測試台為基礎）。
- **P2：** 客戶端：`planServerCouncil`、`startCouncil`、伺服器版 `runModelCouncil`、`reattach.js`、鎖定與停止、退回本機、測試。
- **P3：** 隱私說明（`PRIVACY.md`、設定隱私頁，五語言）、更新紀錄、版本 17.11.0、全套檢查、交接文件，並交給 owner 真實帳號驗收清單。

文字與五語言：進度面板、錯誤文字沿用既有的；只有隱私說明與（若有）新的錯誤文字需要五語言。

## 7. P0 結果（2026-10-08）

在 scratchpad 寫了一支腳本：用伺服器自己的 `createUpstreamFetch`、真的 `createStreamApiCall`、`createProviderRequestSupport` 與**真的 `createCouncilResponseLifecycle`**，以假的模型與搜尋回應，跑一場辯論模式的會議（兩個成員：OpenRouter 的 Haiku 與 NVIDIA 的 DeepSeek；合成：OpenRouter 的 Sonnet；開網路搜尋）。

- **整場會議在 Node 裡原封不動跑完：** 進度依序是搜尋 → 第一輪（成員逐一 pending／running／done）→ 第二次搜尋 → 辯論輪 → 合成 → 完成；兩次共用搜尋、兩輪成員、一次合成；最後文字含「共識與差異整理」與原始回答摺疊區；`metadata` 與頁面一致（含 `firstRoundResults`、`finalRoundResults`、`failures`）。
- **依供應商分金鑰可行：** OpenRouter 的成員與合成用 OpenRouter 的金鑰，NVIDIA 的成員用 NVIDIA 的金鑰，Tavily 用搜尋金鑰（所以 §4 的 `secrets.keys` 做法可行，`keyFor` 依供應商回金鑰即可）。
- **成員拿到完整歷史：** 每個成員的請求都含對話歷史（`conversation.messages` 的前面部分），伺服器端要把 `request.history` 加上目前訊息組成 `conversation.messages`。
- **系統指令依用途注入可行：** 在 `streamApiCall` 外包一層，依 `requestPurpose`（`council-participant`、`council-deliberation`、`council-synthesis`）加上 `systemInstructionText`，三種用途各拿到自己的那段，與單模型回覆「瀏覽器預先組好再送」的做法一致。瀏覽器端要對三種用途各做一次 `describeOnly` 並一起送上去。
- **共用模組清單：** 需新增 4 個：`council-response-lifecycle.js`、`provider-request-support.js`、`linked-pages.js`、`council-runtime-texts.js`；逐一讀過，沒有瀏覽器全域物件（`provider-request-support.js` 用的 `DOMException`、`AbortSignal.any` 在 Node 22 都有）。其餘引用的模組已在清單上。
- **要自己寫的兩個小函式：** `getCouncilAttachmentTranslationNeed`（現在寫在 `legacy-core.js` 裡、依瀏覽器的 `uploadedFiles`，伺服器版改從請求的附件判斷，需抽成共用函式）、`getCouncilSelectedModels`（伺服器版直接用請求帶來的模型資料，不查伺服器自己的清單）。
- **確認的既有問題（P1 要處理）：** 重試前沒有清掉已收到的片段（合成重試會重複輸出）、模型串流沒有逾時（30 分鐘）、`scrubMessage` 不遞迴遮蔽巢狀金鑰。

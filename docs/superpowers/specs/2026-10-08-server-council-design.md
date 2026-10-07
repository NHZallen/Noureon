# 多模型會議（Council）搬到伺服器（關掉頁面也會開完會）

**日期：** 2026-10-08
**狀態：** 設計草案，**等 owner 決定 §2 的幾件事後才開始寫程式**。尚無任何程式變更。這是「圖片 → 先搜一包 → 會議」三件事的最後一件。
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

## 2. 要請 owner 決定的事（附建議）

1. **附件轉譯與讀網址在哪裡做？** 現在會議也做這兩件事。**建議：和單模型回覆、先搜一包一致：由瀏覽器先準備好再送上去**（轉譯包、讀到的網頁當作請求的一部分），伺服器負責搜尋、兩輪、合成。理由：這兩件事很少用，搬上去要多帶轉譯模型、多一種金鑰，風險大於好處；之後有需要再搬。代價：有附件的會議，在準備那段時間（幾秒到幾十秒）還是需要頁面開著。
2. **進度面板怎麼讓其他裝置看到？** **建議：只用即時頻道（和先搜一包的「正在搜尋」一樣）。** 進行中打開頁面、或換一台裝置打開同一個對話，會接上同一個進度面板；沒有在看的裝置，等會議開完才看到結果（和現在文字回覆的行為一樣）。不另外新增「訊息裡的進度區塊」（那會動到訊息畫面）。
3. **會議的詳細結果（每個成員的第一輪、第二輪）要不要同步到雲端？** 現在 `message.council`（每個成員的原文）**本來就沒有同步**，雲端還原的訊息沒有這個欄位，畫面只看有沒有這個欄位來標示「會議對話」，沒有別處讀細節；而「原始回答」摺疊區已經在訊息文字裡。**建議：維持現狀不同步**（伺服器寫入的訊息同樣只有最後文字，包含原始回答區）。
4. **同時進行的限制。** 一場會議最多 5 個成員同時打模型加合成，一個使用者最多 5 個進行中的執行，理論上同時 25 路以上。**建議：先不加新限制**，只加每次呼叫的逾時（見 §5）；真的出現負載或供應商限流問題再收緊。如果你想先保守，也可以做成「一個人同時只能有一場會議在伺服器上」，第二場自己改在這個裝置上開（行為不變，只是會議不會在關頁面後繼續）。
5. **沿用既有的「回覆在伺服器或這個裝置上產生」選項。** 選本機、沒有雲端帳號、暫時對話、請求太大、伺服器連不上或協定不符，都照現在的做法在瀏覽器開會，使用者看不到任何提示（和文字、圖片、搜尋一樣）。**建議：照做。**
6. **版本：** 17.11.0（新功能算次要版本）。

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
- `request`：`history`（成員看到的完整歷史）、`currentMessage.parts`（含瀏覽器準備好的轉譯包與網頁），以及成員與合成各自要用的系統指令（記憶、Nouras、學習模式由瀏覽器預先組好；檔案與圖表指引只用在合成）。
- `tools`：`webSearch`（`off`／`packet`／`grounding`，Gemini 合成模型用原生搜尋）、`searchProvider`、`searchDepth`。

**金鑰。** 一場會議可能用到最多三家的模型金鑰（`gemini`、`openrouter`、`nvidia`）加搜尋金鑰。`secrets.keys` 放各家的金鑰；伺服器逐一確認每個模型的供應商都有金鑰。**兩處要改：** `createModelAccess` 的 `keyFor` 要依供應商回金鑰、`getModelApiId` 要依模型；`scrubMessage` 現在只遮蔽第一層字串，要改成會遞迴遮蔽巢狀的金鑰，否則錯誤訊息與日誌會漏金鑰。

**執行（新的 `server/council-run.js`）。** 以伺服器的依賴組出 `createCouncilResponseLifecycle`：

- `streamApiCall`：沿用 `createStreamApiCall`，每次呼叫以 `requestOptions.modelInfo` 指定模型與金鑰。
- 每次呼叫加逾時（現在伺服器的模型串流沒有逾時，一個卡住的成員會拖到 2 小時上限）；`streamCouncilApiCallWithRetry` 的重試，**重試前要清掉已收到的片段**（現在重試會重複送出已輸出的字，合成時會重複）。
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
3. **沒有逾時**：要加（建議成員與合成各 5 分鐘、搜尋沿用現有的 45 秒），逾時算該成員失敗，會議照開。
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

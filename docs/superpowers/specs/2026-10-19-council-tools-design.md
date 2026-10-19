# 理事會用工具（成員自己搜、整合者動手）設計

**日期：** 2026-10-19
**Linear：** NOU-56（04 模型理事會，`contract`）
**前置閱讀：** [伺服器上的理事會](2026-10-08-server-council-design.md)、[技能](2026-10-09-skills-design.md)、[連接器](2026-10-10-mcp-connectors-design.md)、[命令工具](2026-10-04-cli-store-design.md)

## 0. owner 的決定（2026-10-19）

1. **成員自己搜。** 拿掉開會前的「共用搜尋包」，每位成員各自決定搜什麼、開哪些網頁。
2. **整合者才動手。** 會改東西的（連接器的寫入、命令工具、用 Python 做檔案）只給整合者；成員只能讀。
3. **步數和一般回覆一樣**（每位成員各自計算）。
4. 費用、時間乘上人數沒關係。不做「開會前先讀一包」。
5. 等待畫面改成時間軸版（2026-10-19 的渲染圖），回覆完成後收成一行「3 位成員討論 · 1 分 20 秒 ›」。
6. 本機與伺服器兩種都要能開會（原本就有：同一個「回覆在伺服器或這個裝置上產生」設定，§3 的條件）。

## 1. 現況（2026-10-19 讀程式確認）

- `council-response-lifecycle.js`（頁面與伺服器共用，沒有 DOM）：附件轉譯 → 讀網址 → **共用搜尋包**（整合者是 Gemini 用 Google 搜尋寫一包，否則 Tavily／TinyFish 一包）→ 第一輪（每位成員一次請求，沒有工具）→ 辯論輪（再搜一包共用的）→ 整合（一次請求）。
- 技能：只有 `/` 指定的技能，說明文字放進每個呼叫；沒有 `load_skill`，腳本跑不了。
- 連接器、命令工具、Python：完全沒有（`toolCalls: 0`；選單上「模型理事會不支援進階模式」）。
- 69 個文字模型都會呼叫工具（`modelSupportsToolCalling`）。Google 金鑰的 Gemini 用 Google 自己的搜尋（`modelUsesNativeWebSearch`），而且它在 Google 搜尋旁邊不接受別的工具。

## 2. 設計

### 2.1 成員（第一輪與辯論輪）

每位成員是一個「只能讀」的小回覆，和一般回覆的 `runWebResearchReply` 同一個迴圈：

| 成員是 | 開了網路搜尋 | 沒開 |
|---|---|---|
| 會呼叫工具的模型（幾乎全部） | `web_search`、`open_page`、`find_in_page` + 技能載入 + 連接器讀取（只在伺服器） | 技能載入 + 連接器讀取（`runSkillsReply` 那個小迴圈） |
| Google 金鑰的 Gemini | Google 自己的搜尋（和一般回覆一樣，旁邊不能有別的工具） | 技能載入 + 連接器讀取 |
| 不會呼叫工具的模型（目前沒有） | 自己的一包搜尋（用它自己的問題擬搜尋詞） | 一次請求 |

- **上限：** 每位成員自己的 20 次搜尋與開網頁（`MAX_RESEARCH_CALLS`）、技能與連接器的上限也和一般回覆一樣。
- **辯論輪也有工具**，可以查證別人的說法；提示裡多一句「需要時查證，不要重複第一輪已經查過的」。
- **連接器只給讀取：** 只放 `toolKind` 是讀取、而且使用者設成「允許」的工具。設成「詢問」的讀取不給成員（不然 3 到 5 位成員會各跳一張確認卡），留給整合者。
- **來源編號整場共用：** 所有成員的搜尋結果與網頁用同一個編號表（同一頁在每位成員、整合者、最後答案都是同一個 [n]），整合者看得到每位成員的答案與它用的來源，最後的訊息帶完整來源表（和一般回覆一樣的來源方塊），引用可以點。
- **重新接續（伺服器重啟）：** 一位成員整個小回覆完成後記在檢查點（文字＋來源），接續時不重做；做到一半的從頭重做。

### 2.2 整合者

整合者等於一個「完整的一般回覆」，題目是成員的答案加使用者的訊息：

- 有使用者這則訊息能用的全部：搜尋、技能（含腳本）、連接器（含寫入，照權限詢問）、命令工具、進階模式的 Python 與檔案、設計範本。
- **伺服器：** `council-run.js` 的整合改成呼叫 `executeReply`（一般回覆的執行），規格由理事會的規格衍生（模型＝整合者，訊息＝整合提示，工具＝頁面照一般回覆的規則決定後送來的 `tools`）。它的即時事件（字、思考、來源、步驟、檔案、詢問卡）原樣轉給頁面，存下的訊息也和一般回覆一樣（步驟方塊、檔案、來源）。
- **本機：** 整合交給頁面的一般回覆（`single-model-response-lifecycle`），畫在同一個訊息裡；本機沒有連接器與命令工具（和本機的一般回覆一樣），Python 用瀏覽器的。
- 整合失敗的備案照舊（列出成員答案）。

### 2.3 等待畫面與存下的樣子

- 時間軸（2026-10-19 渲染圖）：左邊一條線串起「各自作答 → 互相討論 → 整合答案」（沒有「搜尋網路」這一段了，搜尋算在每位成員裡）。
- 成員列：名字、狀態、右邊數字（「搜尋 3 次 · 讀 2 頁」或字數），點開看它搜了什麼、開了哪些網頁、用了哪個技能或連接器，以及答案的開頭（引用樣式）。
- 整合者那段沿用一般回覆的步驟列（呼吸點、步驟短字）。
- 完成後收成一行「3 位成員討論 · 1 分 20 秒 ›」，點開是完整時間軸；在本機產生時接「· 在這個裝置上產生」（不跳提示）。
- 圖片生成不改。

### 2.4 相容（`contract`）

- 理事會規格（`kind: 'council'`）的 `tools` 多了一般回覆的欄位：`skills`、`connectors`、`advanced`、`cli`、`net`、`designs`、`inputs`、`deckDesign`、`research`（成員是否自己搜）。舊伺服器回 `invalid_run_spec`，頁面照舊靜默改在本機開會。
- 即時事件 `cs.modelStates[]` 多了 `steps`（每位成員做過的步驟：種類、短字、來源數）；整合時多轉發一般回覆的 `ev`、`src`、`th`、`tm`。舊頁面不認得的欄位會忽略。
- 訊息格式：理事會的訊息開頭多一個和一般回覆一樣的步驟方塊（來源、整合者的步驟、成員摘要），舊頁面看到的是一般回覆的步驟方塊。

## 3. 本機與伺服器

照原本的規則（`planServerCouncil`）：預設伺服器；設定選本機、沒有雲端帳號、暫時對話、伺服器連不上或忙，都在這個裝置上開會。本機開會時，成員只有搜尋與技能，整合者多了瀏覽器的 Python；連接器與命令工具只在伺服器（登入只存在伺服器、命令工具只在伺服器沙盒）。

## 4. 分期

| 階段 | 內容 |
|---|---|
| P1 | 成員自己搜：共用的成員迴圈（研究＋技能＋連接器讀取）、共用來源編號、拿掉共用搜尋包、伺服器規格與檢查點、頁面送出、最後訊息帶來源；測試 |
| P2 | 整合者動手：伺服器的整合改走 `executeReply`、頁面跟隨整合者的步驟與檔案；本機整合交給一般回覆；測試 |
| P3 | 等待畫面時間軸與存下的摘要列（五語言） |
| P4 | 隱私政策、協助中心五語言、全套檢查、推 staging、Allen 試 |

每個階段做完回報。

## 5. 實作紀錄

### P1（2026-10-19）

- **成員迴圈** `src/app/legacy-runtime/features/council-member-reply.js`（頁面與伺服器共用）：`createCouncilMembers` 依 §2.1 的表選路（Gemini 用 Google 搜尋；會呼叫工具的走 `runWebResearchReply`／`runSkillsReply`；不會的自己搜一包），整個成員回答失敗時重試一次（不在回合中間重試，避免字重複）。`createMemberSteps` 記每位成員的次數與最新 30 步。
- **共用編號**：`createResearchCalls`／`runWebResearchReply` 多一個 `numbering`（共用的 Map），搜尋事件多 `kind: 'search' | 'page'`。Gemini 的來源沒有編號，接在後面。
- **理事會主程式**：拿掉共用搜尋包與第二次搜尋；新依賴 `createMembers(conversation, parts)`；第二輪與整合的提示改成列出「成員查到的來源」與編號；結果多 `sources`；進度的 `modelStates[]` 多 `counts`、`steps`（`search` 永遠是 null）。
- **頁面**：`council-members-page.js`（研究工具用 `provider-request-support` 的 `searchWeb`／`fetchPageContents`，沒有搜尋金鑰就不給；技能載入用 skill-bridge）。`council-response-render-lifecycle.js` 把來源做成步驟方塊放在訊息開頭並重畫（引用可點）。
- **伺服器**：`council-run.js` 用同一個成員迴圈（`timedCall`、Tavily／TinyFish、技能、連接器只給 `kind: 'read'` 且 `state: 'allow'` 的工具），成員整個回答記在檢查點（版本改 2，舊版本不接），檢查點多 `sources`，訊息開頭帶來源方塊。`run-spec.js` 理事會的 `tools` 接受 `skills`、`connectors`，不再要求搜尋金鑰。`server-council.js` 送技能清單、`connectors: true`、有就送搜尋金鑰，跟隨結果多 `sources`。
- **測試**：`tests/council-member-reply.test.js`（8 項）、`council-response-lifecycle`（改寫搜尋的 3 項）、`server/server-council`（成員自己搜與共用編號、接續不重問、技能與只讀連接器）、`server-council-client`、`council-response-render-lifecycle`（來源方塊）。
- **還沒做**：整合者動手（P2）、時間軸畫面（P3；目前的進度面板照舊，只是不再有「搜尋」那一段）、隱私政策與協助中心（P4，目前的文字還寫著共用搜尋包）。

### P2（2026-10-19）

- **伺服器**：`council-run.js` 的整合改呼叫 `executeReply`（一般回覆的執行）：模型＝整合者，訊息＝整合提示，系統指令＝頁面組好的整合指令＋理事會的整合要求；`webSearch: 'off'`（成員已經搜過），技能、連接器（含寫入，照權限詢問）、`tools.synthesis` 的 Python、設計範本、附件與命令工具（伺服器沒有沙盒時不用 Python）。`executeReply` 多 `knownSources`（成員的來源，編號接著用）。即時事件（字、思考、步驟、詢問卡）與訊息寫入都和一般回覆一樣；理事會的「原始回答」區塊接在後面。`runs.js` 把沙盒、憑證、三種詢問控制與 `onPaused` 交給理事會。整合中的 Python 遺失時不交回頁面（`watching: () => false`），沒有 Python 繼續。
- **規格**：理事會的 `tools.synthesis`（`advanced`、`designs`、`inputs`、`cli`、`net`），用一般回覆的驗證檢查。頁面 `councilSynthesisTools`（`server-council.js`）照一般回覆的規則決定：進階模式且和檔案有關（或對話裡有檔案）、或有命令工具，才給 Python。
- **頁面**：`council-response-lifecycle.js` 多 `synthesize` 選項；本機開會時由 `council-response-render-lifecycle.js` 交給一般回覆（`single-model-response-lifecycle.js` 的新選項 `synthesis`：不搜尋、不讀請求裡的網址、沒有歷史、不交給伺服器、帶成員來源）。伺服器開會時，跟隨在 `cs.stage === 'synthesis'` 時停下（`follow` 的 `handOver`，不停止執行），再由一般回覆以 `resumeRun` 跟隨同一個執行（步驟、詢問卡、檔案都照一般回覆）。整合做出的檔案成為訊息的檔案。
- 整合者本身不再搜尋（決定：成員搜）。

### P3（2026-10-19）

- `src/app/ui/council/council-timeline.js`：時間軸（等待中與存下的訊息共用）；`council-record.js`：把理事會紀錄（成員、各階段時間）放進訊息開頭的步驟紀錄（`normalizeCouncilRecord`，來源上限改 100）。
- 理事會主程式記各階段起訖與成員字數，結果多 `record`；伺服器 `cs` 多 `stages`。
- 等待中：時間軸取代舊面板（點成員看它搜了什麼；按鈕形式，重畫時保持打開）；整合時時間軸留在上面，下面是一般回覆的步驟列；答完收成「N 位成員討論 · 時間 ›」，點開是時間軸與整合者的步驟；伺服器沒接手（連不上、忙）時不跳提示，摘要列加「在這個裝置上產生」。
- 文字在 `sandbox-texts.js`（五語言）；樣式在 `model-council.css`（拿掉舊面板的樣式）。渲染檢查：淺色、深色七個狀態。
- 主程式包（legacy-core）壓縮後的預算很緊：成員迴圈改成開會時才載入（`council-member-steps.js` 分出來）。

### P4（2026-10-19）

- 協助中心「模型理事會」一節與隱私政策的理事會一段，五語言更新；`PRIVACY.md` 重新產生。全套檢查通過。

### 看圖檢查（2026-10-19，owner 要求）

- 頁面在理事會規格的 `tools.synthesis.visionCheck` 帶上看圖檢查（設定開著、整合者看得懂圖片；`deckDesign` 與是否可用 Python 照一般回覆）。伺服器的整合回覆帶著它（沒有沙盒時 `advanced: false`）；理事會結束後 `executeCouncil` 交出 `visionSource`（整合回覆的規格與金鑰），`runs.js` 的 `planVision` 對理事會用它開看圖檢查的執行，頁面照一般回覆的方式跟隨（`done` 事件的 `vision`、開始時的 `vision` 旗標）。
- 本機開會：完成時照常排程頁面自己的看圖檢查，模型用整合者（`vision-check-scheduler.js` 的 `getCouncilSelectedModels`）。
- 協助中心五語言加一句。

# 記憶摘要與可選記憶模型實作計畫

> 本文件只定義實作範圍與驗收標準；開始程式變更前，先依本計畫完成資料模型與測試設計。

## 目標

將現有「已確認個人記憶 + 最多三段歷史摘要」改為兩條明確分工的能力：

1. **記憶摘要**：由一個使用者指定的記憶模型，在背景從所有正常保存的對話合成「目前有效」的使用者脈絡。它會自動保持新鮮，不要求逐筆確認。
2. **深度歷史回查**：當問題需要某次舊討論的理由或細節時，從所有正常保存的對話片段檢索原始脈絡；它不把過期內容寫回記憶摘要。

記憶摘要的使用者介面是「摘要的摘要」：簡潔、依主題整合、只描述當前狀態；不是記憶資料庫清單、不是來源列表、不是歷史時間線，也不是完整對話紀錄。

## 已鎖定的產品決策

- 正式名稱為「記憶摘要」。
- 所有正常保存的對話都參與背景記憶；暫時對話與永久刪除的對話不參與。
- 不設自動記憶開關、待確認候選清單或逐筆確認流程。
- 模糊想法、一次性討論、短期計畫都不得因「看似不重要」而被丟棄；它們要保留為可檢索的對話片段與探索狀態。
- 系統只能判斷陳述的**狀態**（現況、探索、暫時、純問題），不能替使用者判斷內容的重要性。
- 記憶摘要只保留目前有效狀態。新資訊取代舊資訊後，舊狀態不得顯示或注入回答；要查原因則開啟原始歷史對話。
- 使用者在記憶摘要頁輸入「新增或更新」或直接編輯，視為最高優先權的最新事實；舊對話與背景合成不得將它覆蓋。
- 新增獨立的「記憶模型」選項。所有非圖片生成模型都可選；Model Council 不是記憶模型選項。
- 所選記憶模型取代目前 `gemini-3.5-flash-lite` 的記憶任務：回合記憶擷取、主題整合、模糊歷史查詢解析、媒體記憶描述，以及使用者可見的記憶摘要更新。
- `gemini-embedding-2` 在本輪維持為向量索引模型；記憶模型切換不改變 embedding provider，也不會同步 API Key。
- 不可在記憶模型失敗時偷偷回退至 Gemini。工作保留待重試並可診斷，使用者選擇的模型必須被尊重。

## 目標架構

```text
正常保存的對話／編輯／永久刪除
        │
        ├─ 所有訊息片段索引（保留可回查證據）
        │
        └─ 背景記憶合成佇列 ── 使用者選定的記憶模型
                                  │
                                  ├─ 目前狀態記憶摘要
                                  └─ 內部證據與更新關係

回答請求
        ├─ 精簡全局概覽 + 相關的目前摘要段落
        └─ 需要細節時才檢索舊對話片段
```

模型永遠不會在一般回答中收到完整歷史對話，也不會收到已取代的記憶摘要內容、UUID、相似度分數或內部證據索引。

## 任務 1：記憶模型設定與選擇器

**檔案：**

- 修改：`src/app/runtime/kernel/config-store.js`
- 修改：模型註冊、模型管理設定 UI 與設定儲存生命週期
- 修改：相關 i18n 檔案與設定測試

### 實作

- 新增非祕密的 `memoryModelId` 設定，預設為既有 `gemini-3.5-flash-lite`。
- 在「模型管理」新增單一「記憶模型」選擇器；篩選所有非圖片生成模型，並標示 API Key 未設定或已失效的選項。
- 不把選擇器放進使用者閱讀／編輯記憶摘要的頁面，亦不新增自動記憶開關。
- 記憶模型 ID 可隨設定同步；API Key 繼續只留在既有敏感設定儲存區。
- 變更模型只影響後續背景工作。記憶摘要頁另提供明確的「使用目前模型重新整理」動作，避免切換模型時悄悄重寫全部摘要或產生不可預期成本。

### 驗收

- 每個非圖片模型都能選取；圖片生成模型、Council 模式與未設定 Key 的模型不可選或明確標示不可用。
- 切換一般聊天模型不改變 `memoryModelId`。
- 切換 `memoryModelId` 不會變更或外洩 API Key。

## 任務 2：可攜式記憶模型 client

**檔案：**

- 新增：`src/app/runtime/memory/memory-model-client.js`
- 修改：`gemini-memory-capture-client.js`、`gemini-topic-summary-client.js`、`gemini-history-query-resolver-client.js`、`gemini-media-memory-client.js`
- 修改：`transition-bus-lifecycle.js`、provider structured request helpers
- 新增：對應單元測試與 provider adapter fixture

### 實作

- 建立 provider-neutral 介面：`captureTurn`、`synthesizeSummary`、`resolveHistoryQuery`、`describeMedia`。
- 所有操作使用嚴格 JSON schema；原生 schema 支援的 provider 使用原生格式，其餘 provider 使用受限 JSON 提示、萃取與 schema 驗證。
- 將目前所有 `GEMINI_MEMORY_SUMMARY_MODEL` 呼叫改由 `memoryModelId` 路由，並保留現有 Gemini 實作為其中一個 adapter。
- 任務失敗時保留 job、記錄可安全顯示的失敗原因並退避重試；不得自動換成 Gemini 或回答模型。
- 若使用者選擇的記憶模型沒有 vision 能力，文字工作仍可進行；純視覺附件標為待處理，不可在未告知下使用另一個模型解讀圖片。

### 驗收

- 同一組結構化記憶輸入可由每個文字 provider adapter 產生通過 schema 的結果。
- 無效 JSON、逾時、缺少 API Key、模型不支援 vision 均安全保留工作，不寫入猜測資料。
- 現有 Gemini 記憶功能在預設模型下行為相容。

## 任務 3：記憶摘要資料模型、證據與同步

**檔案：**

- 修改：`src/app/runtime/memory/memory-schema.js`
- 修改：`src/app/runtime/kernel/app-data-normalization.js`
- 修改：`src/app/runtime/memory/memory-sync-projection.js`
- 修改：`src/app/runtime/kernel/config-store.js`
- 新增：`src/app/runtime/memory/memory-summary-state.js`
- 新增：schema、sync projection、合併測試

### 實作

新增版本化的記憶狀態，至少包含：

```js
{
  memorySummary: {
    version: 1,
    overview: '給使用者與模型使用的精簡目前狀態',
    sections: [{ id, title, content, updatedAt }],
    updatedAt,
    revision
  },
  memoryEvidence: [
    // 僅內部使用：來源訊息、狀態、時間、取代關係、手動優先權
  ]
}
```

- `memorySummary` 不含舊狀態、來源 UUID、分數或完整歷史；`memoryEvidence` 才保留必要的更新與刪除依據。
- 合併／同步採用版本與 revision，衝突時保留可重算的證據並把受影響摘要標記為待整合。
- 使用者手動新增或編輯建立最高優先權 evidence；除非有新的明確使用者陳述，否則不可被舊自動 evidence 推翻。
- 擴充現有 `memorySync` projection，讓記憶摘要能跨裝置保持一致；裝置本機的 embedding index 仍不直接同步。

### 驗收

- 舊資料載入為空摘要，不遺失現有 profile、topic summary 或歷史索引資料。
- 兩裝置的摘要合併後可確定性地標記需要重算的主題。
- 永久刪除唯一證據後，摘要不再留下該事實。

## 任務 4：所有正常對話的片段擷取與背景佇列

**檔案：**

- 新增：`src/app/runtime/memory/memory-synthesis-queue.js`
- 修改：回覆完成、訊息編輯、永久刪除與歷史索引生命週期
- 修改：`history-indexing-service.js`、`memory-invalidation-service.js`
- 新增：佇列、事件、刪除與重試測試

### 實作

- 每個正常保存對話中的使用者文字建立可檢索片段；不以「重要性」過濾。技術上僅忽略空內容與系統訊息。
- 新訊息、訊息編輯、手動摘要更新、雲端同步到的新訊息、永久刪除都建立合成事件。
- 空白新對話不建立事件；封存不移除記憶；暫時對話永不建立片段或摘要證據。
- 將連續對話事件去重、短暫 debounce 後合併；明確手動更新或明確更正可提高優先權，使下一個回答可使用新狀態。
- 永久刪除只重算受其 evidence 影響的摘要段落，不在前景完整重建所有歷史。

### 驗收

- 打招呼、純問題與一次性想法都仍可從對話片段檢索；它們不會因為「不重要」被捨棄。
- 純問題不會被寫成使用者擁有某設備或已採取某方案。
- 刪除、編輯、同步重放與重試皆具冪等性，不能產生重複 evidence。

## 任務 5：狀態判讀與新鮮度合成

**檔案：**

- 新增：`src/app/runtime/memory/memory-synthesis-service.js`
- 新增：`src/app/runtime/memory/memory-state-reconciler.js`
- 修改：記憶模型 JSON schema 與相關測試

### 實作

記憶模型不得輸出自由文字覆寫，而要回傳受限操作：

- `set-current-state`
- `set-preference-or-constraint`
- `record-exploration`
- `record-temporary-state`（可含到期時間）
- `end-or-replace-state`
- `no-summary-change`

合成器只根據使用者明確陳述建立或取代「目前」資訊。語意不確定時，保留片段與探索 evidence，但不得覆寫目前狀態。規則包括：

- 「已改用 NUC」可取代相同主題的目前部署狀態。
- 「可能改用 NUC」記為探索，不取代目前狀態。
- 問句不可推論成事實。
- 助手建議絕不可成為使用者記憶。
- 暫時事項在到期或後續明確更新時從使用者可見摘要移除。

使用者可見的摘要生成僅使用目前有效的 evidence；不顯示「曾經」、「歷史」、「已取代」或過期狀態。

### 驗收

- 以繁中、英文與混合語句測試明確取代、探索、問句、反悔、短期計畫與手動覆寫。
- 不確定輸入永不破壞目前狀態，但其原始片段可被深度回查。
- 摘要內容只反映目前狀態，不出現歷史時間線。

## 任務 6：回答脈絡與深度歷史回查重構

**檔案：**

- 修改：`current-memory-context-provider.js`
- 修改：`memory-context-builder.js`
- 修改：`history-retrieval-service.js`、`history-index-store.js`
- 修改：`history-source-references.js`、回答 finalization 與相關測試

### 實作

- 一般回答注入精簡全局概覽與依語意挑選的目前摘要段落；不把整份使用者介面摘要或內部 evidence 送入模型。
- 將目前固定的歷史 `limit = 3` 改為「候選池 + 文字／token 預算」；不以固定對話數量截斷。
- 深度回查檢索對話片段而非每個對話只有一份膠囊，並在問題需要原因、比較、舊決策細節時提供原始對話跳轉依據。
- 模型提示只收到精選片段的文字，永遠不收到內部 ID、分數、已取代狀態或完整來源清單。
- 現有回答下方的來源提示若保留，只表示「深度歷史回查實際使用的對話」，並與記憶摘要完全分離。

### 驗收

- 一般 CLI 問題可自然套用目前的 OpenClaw／設備脈絡。
- 使用者詢問舊決策原因時可查得相關片段與原對話。
- 已被取代的 VPS 狀態不會從記憶摘要注入一般回答。
- 未達候選池前段但在文字預算內的高相關片段不會因固定三則上限遺失。

## 任務 7：記憶摘要使用者介面

**檔案：**

- 修改：設定 shell、設定導覽與 mobile settings metadata
- 修改或取代：`model-memory-dashboard-lifecycle.js`
- 新增：記憶摘要 render / edit lifecycle
- 修改：五種 i18n 檔案、CSS 與 UI 測試

### 實作

- 移除舊的自動記憶 toggle、候選批准流程與逐筆個人記憶管理在設定中的主要操作面。
- 保留單一「記憶摘要」設定入口；以桌面 modal／行動設定詳細頁顯示：標題、最後更新時間、總覽與主題段落。
- 首次開啟顯示一次性說明：系統自動記住重要脈絡並保持最新；此頁僅為已記住內容的簡要概述，不是完整清單。
- 頁面不顯示來源、歷史、UUID、證據數量、候選清單或狀態機細節。
- 以底部固定「新增或更新」自然語言輸入框，以及每個段落的編輯動作，送入高優先權手動 evidence 並排入立即合成。
- 加入「使用目前記憶模型重新整理」與安全的進行中／失敗狀態；不使用確認對話框阻擋日常自動更新。

### 驗收

- 畫面呈現的是濃縮、按主題的當前摘要，而非所有記憶條目或歷史紀錄。
- 使用者編輯後，受影響段落更新且舊狀態不再顯示。
- 桌面與行動版皆能閱讀、編輯、重新整理並正確保留捲動與安全區。

## 任務 8：遷移、可觀測性與驗收

### 遷移

- 將既有已確認 profile 記憶與長期主題摘要轉為初始 evidence／初始記憶摘要輸入，不把舊摘要文字直接當作不可變現況。
- 保留現有對話、附件與歷史 index；必要時背景漸進重建片段索引，不封鎖聊天。
- 記憶模型選擇與摘要資料須向舊客戶端安全降級；舊客戶端忽略未知欄位，不能清掉新摘要。

### 測試與手動驗收

- 純函式：schema、evidence merge、狀態取代、暫時事項到期、手動優先、刪除重算、token budget 選擇。
- provider adapters：每個非圖片模型的結構化輸出、缺 Key、無效 JSON、超時、無 vision 能力。
- 整合：單模型、Council、跨裝置同步、新訊息、編輯、永久刪除、手動新增／編輯、模型切換與重新整理。
- 回歸：所有既有記憶、雲端同步、歷史索引、PWA、i18n 與 legacy runtime boundary 測試。
- 完整檢查：`npm.cmd test`、`npm.cmd run check:legacy-runtime`、`npm.cmd run check:version`、`npm.cmd run build`。

## 發布條件

- 記憶摘要不會顯示或注入已取代歷史狀態。
- 所有正常對話內容可留在可檢索來源中，不因重要性判斷被丟棄。
- 使用者選定的記憶模型是唯一的記憶文字模型；無靜默 Gemini fallback。
- 文字模型不能解析圖片時，系統明確延後媒體記憶，不產生假資料。
- 設定頁只有可查看／編輯的記憶摘要與模型管理中的記憶模型選項，沒有自動記憶開關或批准流程。

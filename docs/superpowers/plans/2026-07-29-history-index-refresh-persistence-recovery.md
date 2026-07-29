# 跨對話索引在頁面重整後全數缺失：修復計畫

> 目標：修正「索引建立完成且檢查正常，但重新整理頁面後變成 0 筆、全部顯示缺失」的問題，並確保既有非空索引可以安全復原，不會因帳號切換、啟動時序、空快照或中斷寫入而被忽略或覆蓋。

## 一、問題摘要

### 已確認現象

- 使用者在同一頁面完成本機跨對話索引建立後，可以看到非零索引並通過索引檢查。
- 重新整理頁面後，介面顯示本機索引為 0。
- 實際瀏覽器中的唯讀索引檢查顯示所有預期索引均缺失，沒有正常膠囊、細節片段或媒體紀錄。
- 瀏覽器控制台沒有索引載入錯誤。
- 實際部署已載入目前最新的 `runtime-memory` 模組，因此不能只歸因於舊 Service Worker 或舊前端快取。

### 已由目前程式重現的缺陷

歷史索引可能同時存在於以下命名空間：

```text
noureon:history-index:v1:anonymous
noureon:history-index:v1:<current-owner>
noureon:history-index:v1:<current-owner>:recovery
```

目前載入器把正式帳號的 primary、recovery 與 anonymous fallback 放在同一候選集合，以 `revision`、`savedAt`、紀錄數量與優先級排序。

這會產生錯誤結果：

```text
正式帳號 primary：空，revision 9
正式帳號 recovery：空，revision 9
anonymous fallback：非空，revision 2

目前結果：選擇正式帳號空快照，載入 0 筆
正確結果：若空快照不是明確刪除結果，應安全遷移或復原非空 fallback
```

不同命名空間的 revision 並不屬於同一條版本序列，不能直接互相比較。這是目前最符合「建立後正常、頁面刷新後無錯誤地變成 0」的可重現原因。

### 第二個已確認缺口

即使索引已經變成 0，現在的「建立本機完整索引」也不一定能復原：

- 記憶狀態仍保存相同的 `sourceHash`。
- 重建服務發現索引缺失後要求重新擷取。
- 實際記憶擷取服務看到 `sourceHash` 沒變，回傳 `unchanged-source`。
- 結果顯示完成與略過，但仍然是 0 筆索引。

因此本計畫必須同時處理：

1. 防止刷新後載入錯誤的空快照。
2. 讓已缺失的索引可以真正重建。

## 二、修復目標

### 必須達成

- 已成功建立的索引在頁面重新整理後仍完整存在。
- primary 與 recovery 只能在同一命名空間內比較 revision。
- fallback 必須被視為「遷移來源」，不能被當成同一版本鏈的普通候選。
- 未標記原因的舊空快照不得壓過可驗證的非空 fallback。
- 明確永久刪除產生的空索引不得被舊 fallback 復活。
- 帳號擁有者尚未穩定前，不得把索引載入或儲存到錯誤命名空間。
- 索引缺失但 `sourceHash` 未變時，重建仍必須補回膠囊與細節片段。
- 載入、遷移與寫入失敗時，保留最後一份可用非空索引。
- 診斷資訊只能包含 key 類型、revision、筆數與狀態，不得記錄對話文字、向量、API Key 或使用者憑證。

### 不在本次範圍

- 不更換 `gemini-embedding-2`。
- 不將本機向量同步到雲端。
- 不改變跨對話回憶的同意機制。
- 不重寫歷史檢索排名、查詢解析或回答注入邏輯。
- 不修改正常對話、附件或記憶摘要的雲端同步格式。

## 三、核心設計

### 1. 建立單一且穩定的 owner 生命週期

索引 persistence 不應在 owner 尚未確定時自行解析並永久釘住 `anonymous`。

新增明確的 owner-ready 邊界：

```text
載入本機／雲端帳號
        ↓
確認本次 runtime 的 memory owner
        ↓
建立或啟用該 owner 的索引 persistence
        ↓
允許查詢、建立、檢查與背景記憶工作
```

要求：

- 一個 runtime 只允許一個 active owner。
- owner 確定前，`ensureHistoryIndexReady()` 必須等待，不得退回 `anonymous`。
- 登出或切換帳號時，必須以新 runtime 重新建立索引服務，不得沿用上一個 owner 的 in-memory store。
- `device-history-recall-consent` 與 derived memory 使用相同 owner-ready 規則，避免三者落在不同命名空間。

### 2. 分離「同命名空間復原」與「跨命名空間遷移」

載入流程改為兩階段。

#### 階段 A：同命名空間復原

只比較：

```text
<owner primary>
<owner recovery>
```

兩者共用 revision 序列，可以依序選擇：

1. revision 較高者。
2. revision 相同時選擇 `savedAt` 較新者。
3. 仍相同時優先保留非空完整快照。
4. primary 與 recovery 不一致時，以選中的完整快照修復另一份鏡像。

#### 階段 B：跨命名空間遷移

anonymous fallback 不參與 revision 排序，只在以下條件成立時考慮：

- 目前 owner 沒有非空可用快照。
- 目前 owner 的空快照沒有「明確刪除」標記。
- fallback 是非空且 schema 可讀。
- 帳號生命週期明確允許 anonymous → current-owner 遷移。

遷移步驟：

1. 讀取並驗證 fallback。
2. 原子寫入 current-owner primary 與 recovery。
3. 重新讀取並驗證筆數、revision 與必要欄位。
4. 驗證成功後才移除 fallback。
5. 任一步驟失敗時保留 fallback，不得留下兩份空鏡像。

### 3. 為「明確空索引」加入語意

目前 `allowEmpty: true` 只能表示允許寫空，無法區分：

- 尚未建立。
- 啟動期間的暫時空狀態。
- 讀取失敗後的空記憶體。
- 使用者明確永久刪除最後一段對話。
- 使用者明確清除所有本機資料。

快照 schema 增加可正規化的空狀態，例如：

```js
{
  schemaVersion: 2,
  owner,
  revision,
  savedAt,
  state: 'ready' | 'explicitly-empty',
  emptyReason: null | 'permanent-deletion' | 'delete-all-data',
  records
}
```

規則：

- 一般 `save()` 不得建立 `explicitly-empty`。
- 只有明確永久刪除與刪除全部資料流程可以寫入 `explicitly-empty`。
- 舊 schema 的空快照視為「原因未知」，不能阻止非空 fallback 復原。
- `explicitly-empty` 只對相同 owner 生效。
- 不得使用另一個 owner 的空 tombstone 阻止目前 owner 的資料載入。

### 4. 修正完整索引重建

重建必須區分：

```text
A. 對話內容與記憶 metadata 都沒變，索引完整 → 安全略過
B. 對話內容沒變，但索引缺失／不完整 → 補建索引
C. 對話內容已變 → 重新擷取 metadata 並替換索引
D. metadata 缺失 → 呼叫記憶模型重新建立
```

對 B 類情況：

- 若已有可信的 conversation capsule，直接重新建立 capsule embedding。
- 直接從目前對話文字重新建立 conversation fragments。
- 不因 `recentConversationStates.sourceHash` 相同而跳過。
- 不需要為了單純修復本機向量重新產生 profile candidates。
- 只有 metadata 本身缺失或過期時才呼叫完整記憶擷取模型。

「建立本機完整索引」的完成條件必須是：

- 每段正常對話有一筆正確 sourceHash 的 canonical capsule。
- 每段正常對話有符合目前切片規則的完整 fragment 集合。
- 媒體索引按現有可用附件與 media metadata 檢查。
- 有失敗時不得顯示為全數完成。

### 5. 增加安全診斷

擴充 `getDiagnostics()`，僅提供：

```js
{
  activeOwnerKind,
  selectedSource,
  primary: { state, revision, count },
  recovery: { state, revision, count },
  fallback: { state, revision, count },
  migrated,
  preservedFallback,
  loadErrorCode
}
```

限制：

- 不回傳完整 storage key 中的帳號值。
- 不回傳 recordId、conversationId、向量、文字或來源訊息 ID。
- 設定介面只需顯示「從主要快照載入／從復原快照載入／已從舊命名空間復原」。

## 四、實作工作

### 任務 1：先加入會失敗的回歸測試

修改：

- `tests/runtime-history-index-persistence.test.js`
- `tests/runtime-history-index-rebuild-service.test.js`
- `tests/runtime-memory-capture-service.test.js`
- `tests/runtime-transition-bus-lifecycle.test.js`

新增案例：

1. current owner 高 revision 空快照不得壓過允許遷移的 anonymous 非空 fallback。
2. current owner `explicitly-empty` 必須阻止舊 fallback 復活。
3. primary 與 recovery 同命名空間 revision 衝突時選擇正確快照。
4. 兩個非空命名空間並存時，current owner 優先且不刪 fallback。
5. fallback 遷移寫入失敗時保留原 fallback。
6. owner 未 ready 時不得呼叫 load 或 save。
7. 索引為 0、但 recent sourceHash 相同時，完整重建必須產生 capsule 與 fragments。
8. embedding 中途失敗時保留舊索引。
9. 暫時空 workspace 重建後，重新載入仍保留原索引。

### 任務 2：升級 persistence schema 與候選選擇

修改：

- `src/app/runtime/memory/history-index-persistence.js`

內容：

- 將 primary/recovery 選擇與 fallback 遷移拆成兩個函式。
- 禁止跨 namespace 比較 revision。
- 正規化 v1 舊快照。
- 新增明確空狀態與 empty reason。
- 遷移完成後再移除 fallback。
- 保持 save queue 與 primary/recovery 原子寫入。

### 任務 3：建立 owner-ready 邊界

修改：

- `src/app/runtime/legacy-core/transition-bus-lifecycle.js`
- 必要時新增 owner lifecycle 小型模組。
- `src/app/runtime/memory/device-derived-memory-persistence.js`
- `src/app/runtime/memory/device-history-recall-consent.js`

內容：

- 在登入資料與 workspace owner 完成協調後才初始化記憶 persistence。
- history index、derived memory 與 device consent 使用同一 owner。
- owner 變化時拒絕沿用已初始化的 persistence。
- 加入無敏感資料的 owner-kind 診斷。

### 任務 4：修正索引缺失時的重建策略

修改：

- `src/app/runtime/memory/history-index-rebuild-service.js`
- `src/app/runtime/memory/memory-capture-service.js`
- `src/app/runtime/memory/history-index-records.js`
- `src/app/runtime/memory/history-index-audit-service.js`
- `src/app/runtime/legacy-core/transition-bus-lifecycle.js`

內容：

- 將「來源未改變」與「索引完整」分開判斷。
- 增加 index-only repair 路徑。
- 完整索引檢查要求 canonical capsule 與完整 fragments。
- 修復工作不得產生 profile candidates。
- 單段失敗不得先移除該段最後可用的索引。

### 任務 5：更新設定介面狀態

修改：

- `src/app/runtime/legacy-core/settings-history-recall-controls.js`
- `src/data/i18n/*.js`

內容：

- 不再把 `completed === total` 單獨視為成功。
- 顯示實際健康、缺少、失敗與復原狀態。
- 若載入 fallback 或 recovery，提供不含帳號資訊的提示。
- 完成後以目前實際索引完整度為準，而不是只顯示工作迴圈已跑完。

### 任務 6：加入刷新整合測試

新增或擴充：

- startup lifecycle 測試。
- IndexedDB/storage adapter 整合測試。
- production transition bus 測試。

測試流程：

```text
建立兩段正常對話
→ 建立完整索引
→ 驗證 primary/recovery 非空且一致
→ 模擬頁面 runtime 銷毀
→ 使用相同 owner 重新初始化
→ 驗證索引筆數與 sourceHash 集合一致
→ 執行 audit
→ healthy > 0，missing = 0，outdated = 0
```

另測：

- anonymous → current owner 遷移後刷新。
- cloud owner 在啟動期間較晚確定。
- 寫入中斷後從 recovery 恢復。
- 明確刪除最後一段對話後刷新，不得復活。
- A 帳號索引不得被 B 帳號載入。

## 五、人工驗證矩陣

### 本機帳號

1. 建立索引。
2. 執行檢查並記錄聚合數量。
3. 重新整理頁面。
4. 再次檢查，正常、缺少、過期與總筆數必須一致。

### 雲端帳號

1. 等待登入與雲端 workspace 完成。
2. 建立索引。
3. 重新整理頁面。
4. 確認使用相同 owner 載入，索引不可變成 0。

### 帳號切換

1. A 建立索引並登出。
2. B 登入，不得看見 A 的索引。
3. B 登出、A 再登入，A 的索引必須仍存在。

### 復原

1. 準備 current owner 未標記原因的空舊快照。
2. 準備 anonymous 非空 fallback。
3. 重新整理後應原子遷移到 current owner。
4. 再次重新整理仍應載入 current owner，不應反覆遷移。

### 明確刪除

1. 永久刪除最後一段有索引的對話。
2. 產生 `explicitly-empty`。
3. 重新整理頁面。
4. 不得從 recovery 或 fallback 復活已刪除內容。

## 六、驗收標準

- 實際瀏覽器完成建立後，連續重新整理三次，索引完整度不變。
- 同 owner primary/recovery 的 revision 與紀錄數一致。
- 允許遷移時，非空 fallback 不會被高 revision 的未知空快照壓過。
- 明確刪除的空狀態不會復活。
- 缺失索引可以由「建立本機完整索引」真正補回。
- audit 在完整索引上回報 `missing = 0`、`outdated = 0`。
- 所有新增回歸測試在修正前能穩定失敗、修正後穩定通過。
- `npm.cmd test` 通過。
- `npm.cmd run check:legacy-runtime` 通過。
- `npm.cmd run check:sizes` 通過。
- `npm.cmd run build` 通過。
- 工作過程不輸出對話內容、向量、帳號名稱、API Key 或 storage 原始值。

## 七、發布與回復策略

### 發布前

- 先在本機與預覽環境執行刷新矩陣。
- 使用新測試帳號驗證 anonymous → owner 遷移。
- 確認 Service Worker 版本更新，避免新舊 persistence 邏輯混用。

### 漸進發布

- 首次載入只做非破壞性遷移。
- 遷移後先保留 fallback，待下一次成功刷新驗證 current owner 快照後再清理。
- 若診斷顯示 primary/recovery 衝突，優先保留非空資料並停止自動清理。

### 回復

- 新 schema 必須可由舊程式安全忽略未知欄位。
- 回復程式版本時不得刪除 v2 快照。
- 發生非預期錯誤時，停用自動 fallback 清理，但保留讀取 recovery 的能力。

## 八、完成定義

只有同時符合以下條件才算完成：

1. 頁面刷新不再讓已建立索引變成 0。
2. 既有 anonymous 非空索引能在安全條件下遷移到正確 owner。
3. 明確刪除不會被 recovery 或 fallback 復活。
4. 索引已缺失時，完整重建可以實際恢復膠囊與細節片段。
5. 自動化測試、實際瀏覽器刷新驗證與 production build 全部通過。

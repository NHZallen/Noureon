# 工作空間分開儲存：每個對話一筆紀錄

**日期：** 2026-10-06
**狀態：** §7 的五個決定已由 owner 確認（2026-10-06，「全照你的」）。**P1 已完成（§9）、P2 已完成（§10）**；新格式預設關閉，只有加了開關的瀏覽器才會遷移，等 owner 看過結果再進 P3。
**前置閱讀：** [`AGENTS.md`](../../../AGENTS.md)（工作規則）、[交接文件](../plans/2026-10-04-session-handoff.md)（2026-10-06 的「啟動時重複儲存的調查與修正」那一條）、雲端同步 V2 設計（`2026-07-05-cloud-sync-v2-design.md`）。

## 1. 為什麼要做

owner 回報「一開網頁記憶體飆很高又很卡」。2026-10-06 的調查（合成資料，正式版建置，第二次開啟）得到：

| 資料 | 開啟時間 | 啟動時渲染程序記憶體峰值 | 閒置後 |
|---|---|---|---|
| 6.5MB（150 個對話、純文字） | 0.8 秒 | 約 515MB | 約 310MB |
| 46.5MB（同上加 40 張 1MB 圖片） | 2.6 秒 | 約 1130MB | 約 350MB |

- 閒置後不會持續增長，沒有洩漏；峰值只出現在「整份資料轉成 JSON、比對、寫入」的那一刻。
- 同一天已經把啟動時整份寫入的次數從 5 次降到 1 次（`3d82e84`），開啟時間少了約 1 秒，但**峰值幾乎沒變**，因為一次整份儲存本身就要同時存在好幾份副本（資料物件、JSON 字串（含中文時是雙位元組，約 2 倍大）、讀回來比對的字串、寫入時的複製）。
- 關掉儲存做對照實驗，峰值只剩約 820MB、開啟 2.8 秒（開發模式數字，只看相對差距），所以儲存是峰值的主因。

**根本原因：** 整個工作空間（所有對話）只存成 IndexedDB 的**一個項目**，每次儲存都整份轉文字、整份寫入。資料越大，每次儲存的成本與記憶體峰值就越大，而且跟「這次改了多少」無關。

**目標**
1. 儲存一次的成本與記憶體跟「這次改了多少」成正比，不跟總資料量成正比。
2. 啟動時不再有整份資料轉成一個大字串的步驟。
3. 對使用者看得到的行為完全沒有改變（對話、搜尋、記憶、同步、匯入匯出、P2P 都照舊）。
4. 舊資料零損失、可回復。

**非目標（另外的階段，見 §6）**
- 按需載入（只把標題清單放進記憶體，點進對話才載入訊息）。
- 把使用者上傳的附件（圖片、影片、PDF）從對話裡拆成獨立的檔案。
- 改變雲端同步的資料模型或遷移雲端資料。

## 2. 現況調查

### 2.1 儲存

- 資料庫：`src/app/runtime/kernel/storage-adapter.js`，IndexedDB `ChatAppDB`、物件倉庫 `keyValue`，項目是 `{ key, value }`。提供 `getItem`、`readItems`（一個交易讀多個）、`setItem`、`setItemsAtomic`（一個交易寫多個，**只有 put，沒有刪除**）、`removeItem`、`getKeys`、`removeItemsByPrefix`。加新的 key 不需要升級資料庫版本。
- 工作空間：key `chatAppData_v8.6_<帳號>`，內容是 `JSON.stringify({ conversations, folders, astras, personalMemories, memoryState })`。
- 其他同帳號項目（`user-data-retention.js` 的 `getStoredUserWorkspaceKeys`）：使用者紀錄、設定、敏感設定、同步密碼庫、雲端同步 meta／journal、復原備份 `chatRecoveryBackup_v1_`（第一次同步時把整份工作空間複製一份，磁碟用量加倍，不影響記憶體）、資料夾 UI 狀態。
- AI 生成的圖片**已經**是獨立項目：`generatedImage:<帳號>:<id>`（Blob，對話裡只放描述物件，`generated-image-assets.js`）。使用者上傳的附件仍然以 base64 直接放在訊息的 `parts[].inlineData.data`，這是大資料量的主要來源。

### 2.2 讀寫整份工作空間的地方（共 6 處，加測試）

| 位置 | 做什麼 |
|---|---|
| `legacy-core.js` `loadAppData` | 讀整份 → `JSON.parse` → `normalizeLoadedLegacyAppData` → `runtimeAppDataStore.replaceAll` |
| `kernel/app-data-persistence.js` | `saveAppData`：快照 → 整份 `JSON.stringify` → 寫入；雲端帳號另外讀已存內容與 journal，`diffCloudSyncWorkspaceEntities(parse(舊), 新)` 逐實體深度比對，再用 `setItemsAtomic` 一起寫工作空間與 journal |
| `sync/cloud-sync-v2-shadow.js`（約 2029–2170 行） | `readWorkspace`、`readWorkspaceAndJournal`、`writeWorkspaceAndJournal`：套用雲端資料時整份讀出、整份寫回 |
| `sync/cloud-workspace-sync.js` | 啟動時建立復原備份、修復生成圖片 key（`repairCloudWorkspaceGeneratedImageKeys`）、把 key 交給記憶摘要同步 |
| `auth/account-linking.js` | 帳號合併時整份讀出、修圖片 key、整份寫回 |
| `kernel/user-data-retention.js` | 登出／清除時依 key 列表刪除 |

### 2.3 記憶體中的資料

`runtimeAppDataStore`（`kernel/app-data-store.js`）持有 `conversations`、`folders`、`astras`、`personalMemories`、`memoryState` 五個值。約 19 個檔案讀取對話、約 145 處呼叫 `saveAppData`。**本設計不改這個結構**：新儲存層在它下面，上面的功能照舊以為自己在存整份。

### 2.4 鎖與併發

`sync/workspace-storage-coordinator.js` 的 `withWorkspaceStorageExclusive` 用 Web Locks（`noureon-workspace-storage-v1`）讓同一瀏覽器的多個分頁輪流存取工作空間；沒有 Web Locks 時退回行程內的佇列。新儲存層必須在這個鎖之內運作。

### 2.5 啟動時的儲存（已修正的部分）

見交接文件。目前啟動時整份寫入 1 次（`restoreMemorySync`），第一次之後的啟動，若資料沒有變化會在比對後略過；`createPersistableAppDataSnapshot` 不再存空白的暫時新對話。

## 3. 設計

### 3.1 新格式（版本 2，下稱 WS2）

每個帳號一組項目，前綴 `chatWS2_<帳號>_`：

| key | 內容 |
|---|---|
| `…_meta` | `{ version: 2, createdAt, migratedFrom: { key, bytes, conversationCount, fingerprint } \| null, conversations: { <id>: { fp, size, updatedAt } }, order: [<id>…] }`：對話索引（每筆只有指紋、大小與更新時間，約 100 位元組），以及原本陣列的順序 |
| `…_conv_<id>` | 一個對話的完整 JSON（含所有訊息與附件） |
| `…_shared` | `{ folders, astras, personalMemories }`（通常很小） |
| `…_memory` | `memoryState`（`mediaMemories`、`conversationCapsules` 等可能不小，獨立一筆，只在變動時寫） |

- 對話的**順序**保存在 `meta.order`（現有程式依陣列順序顯示，如 `unshift` 新對話），載入時照順序還原陣列，行為不變。
- `fp`（指紋）是該對話序列化字串的 53 位元雜湊加長度（例如 cyrb53），只用來判斷「有沒有變」，不用於安全用途。誤判（內容變了但指紋相同）的機率可忽略，且判斷錯誤的後果是「少寫一次」，下一次任何更動都會修正；另外 §3.3 的完整掃描會抓到。
- 舊 key `chatAppData_v8.6_<帳號>` 在遷移後**原封不動保留**（§3.4）。

### 3.2 儲存（`saveAppData`）

`saveAppData` 的對外行為不變（含 §2 已做的「合併進行中的儲存」與「相同就跳過」）。內部改成：

1. 取得鎖、取得記憶體中的快照（跟現在一樣，保留「進入臨界區後才取快照」的既有測試）。
2. **逐個對話**序列化並算指紋，一次只處理一個對話，所以記憶體上額外多的只是「最大的那一個對話」，不是整份。
3. 與 `meta.conversations[id].fp` 比對，**只有指紋變了的對話**才進入寫入清單；新對話加入、已不存在的對話標記刪除。
4. 同樣比對 `shared` 與 `memory` 兩筆（它們通常小；`memory` 也用指紋）。
5. 用一個**原子交易**寫入：所有變動的對話項目、`shared`／`memory`（若有變）、更新後的 `meta`。這個交易需要新增刪除能力（現有的 `setItemsAtomic` 只有 put），見 §4 P1。
6. 雲端帳號：journal 的「髒實體」直接由步驟 3 的結果得到（哪些對話變了、哪些被刪除），不需要再讀回舊的整份工作空間、`JSON.parse`、逐實體深度比對。仍然在同一個交易裡寫 journal，保留現有的原子性與「無變化就不動」的行為。

**提示參數（可選）：** `saveAppData({ conversationIds })`。完成一則回覆這類熱路徑可以只列出剛改的對話，則只序列化它們，儲存成本與其他對話無關。沒有提示的呼叫（絕大多數的 145 處）做步驟 2 的完整掃描。完整掃描的 CPU 仍與總量成正比（序列化一次約 0.9 秒／46MB），但記憶體不再暴增；是否值得再做提示，P3 量測後決定。

### 3.3 載入

1. 讀 `…_meta`；不存在則走 §3.4 遷移或空工作空間。
2. 以 `readItems` 分批（每批一個交易、例如 16 筆）讀出 `…_conv_<id>`，**逐筆 `JSON.parse`**，照 `meta.order` 排成陣列，連同 `shared`、`memory` 交給既有的 `normalizeLoadedLegacyAppData` → `replaceAll`。
3. 載入後在背景做一次完整性檢查：`meta` 裡有但讀不到的對話、讀得到但 `meta` 沒有的孤兒項目（例如上次寫到一半的殘留，理論上因為是原子交易不會發生，但仍檢查）。有異常時記錄、保留孤兒、不自動刪除。
4. 載入失敗（任何項目損毀、JSON 解析失敗）：**不覆寫任何東西**，改讀舊 key（若還在），並在畫面顯示現有的「資料讀取失敗」提示（沿用 `loadAppData` 現有的錯誤處理）。

### 3.4 遷移

觸發：登入後第一次載入，`…_meta` 不存在而舊 key 存在。

1. 在鎖內讀舊 key、解析。
2. 逐個對話序列化、算指紋，一個交易寫入全部 WS2 項目（`conv`、`shared`、`memory`、最後是 `meta`）。IndexedDB 交易是原子的：要嘛全部寫入，要嘛一項都沒有，所以不會出現「meta 在但對話不全」的狀態。資料量大時單一交易可能較大，P2 用 100MB 等級的資料驗證；若需要，改成「先分批寫對話項目、最後一個小交易寫 meta」，沒有 meta 就視為尚未遷移，殘留的對話項目下次遷移時覆寫。
3. **驗證：** 寫完後讀回，核對對話數量、每個對話的指紋、`shared`／`memory` 的指紋、與舊資料的總對話數與總訊息數一致。核對不過就刪除剛寫的 WS2 項目、標記 `chatWS2_<帳號>_failed`（含原因與時間），**繼續使用舊格式**並在下次啟動重試（最多 3 次，之後停止重試並提示聯絡支援）。
4. 驗證通過才把 `meta.migratedFrom` 寫成最終狀態。**舊 key 絕不在遷移當下刪除。**
5. 舊 key 保留到「遷移後經過 30 天且 WS2 載入成功至少 10 次」才清除（P4，可由 owner 另外決定要不要做、保留多久，見 §7）。此外舊 key 本來就有的復原備份 `chatRecoveryBackup_v1_` 不動。

**舊版分頁問題（已知風險）：** 部署新版後，若某個舊分頁（未重新整理）仍在執行舊版程式，它會繼續寫舊 key，之後新版載入看不到這些更新。處理：載入時若 `meta.migratedFrom.fingerprint` 與舊 key 目前的指紋不同（代表遷移後舊 key 又被寫過），用「每個對話以 `lastUpdatedAt` 較新者為準」把舊 key 裡較新的對話合併進 WS2，並記錄。這個情況只會在部署當下有開著的舊分頁時出現，P2 要有測試。

### 3.5 與雲端同步的接口

- 同步程式要求的「整份工作空間」（`readWorkspace`）改由新儲存層**組裝**（對話陣列＋shared＋memory），格式跟現在一模一樣，所以 `cloud-sync-v2-shadow.js` 的邏輯不動。
- `writeWorkspaceAndJournal`（套用雲端資料）改為呼叫新儲存層的「依對話寫入＋journal」，在同一個交易裡完成。
- 雲端資料本身（Supabase 的資料表）完全不動。
- `diffCloudSyncWorkspaceEntities` 保留，給「第一次同步」與無法用指紋判斷的情況使用。
- 復原備份 `ensureWorkspaceRecoveryBackup` 目前複製整份舊 key 的字串；WS2 之後改成以「`readWorkspace` 組裝出的 JSON」建立，或沿用舊 key（若還在）。P1 決定，要保證備份仍然能還原。

### 3.6 其他使用者

- `account-linking.js`：改用新儲存層的讀取與寫入（修圖片 key 的功能照舊）。
- `user-data-retention.js`：`getStoredUserWorkspaceKeys` 加上 WS2 的 key 前綴，清除時用 `removeItemsByPrefix(chatWS2_<帳號>_)`，要補測試確保登出、清除資料、帳號合併都不會留下 WS2 項目。
- 匯入／匯出、P2P 分享：它們讀寫的是記憶體中的資料並呼叫 `saveAppData`，不需要改，只需要驗證。
- 設定頁的「儲存空間用量」（`settings-storage-usage.js`）：目前讀工作空間大小，要改成加總 WS2 項目。

### 3.7 失敗情況與對策

| 情況 | 對策 |
|---|---|
| 寫到一半關掉分頁、當機、電腦斷電 | 一個 IndexedDB 交易是原子的：沒提交就等於沒發生；舊狀態完整 |
| 配額不足 | 交易失敗，現有的錯誤提示與重試照舊；遷移失敗回到舊格式 |
| 某個對話項目損毀 | 載入時單筆失敗不影響其他對話：該筆記錄錯誤、略過並在畫面提示；`meta` 保留它的索引，不自動刪除，也保留舊 key 讓使用者可以還原 |
| 兩個分頁同時儲存 | 沿用 `withWorkspaceStorageExclusive` 鎖；每次儲存在鎖內重新取快照 |
| 新版出問題要退回 | 舊 key 仍在且完整；旗標 `chatWS2_disabled` 讓載入忽略 WS2、改讀舊 key（P4 之前舊 key 不會被改動，所以退回不損失遷移前的資料；遷移後新增的內容需要「由 WS2 匯出回舊 key」的工具，P3 提供） |
| 指紋碰撞 | 53 位元＋長度，可忽略；完整掃描會抓；後果僅是少寫一次 |

## 4. 階段

每階段結束先給 owner 看結果，確認才進下一階段；每階段都跑 `npm test`、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime`、`npm run check:server`、`npm audit --omit=dev`。**只有 owner 說「推」才推到 `main`。**

| 階段 | 內容 | 驗收 |
|---|---|---|
| **P0** | 本文件、owner 確認 §7 | owner 同意 |
| **P1** | 新儲存層模組（`src/app/runtime/kernel/workspace-store-v2.js`，純模組、注入儲存介面，沒有接進產品）：序列化與指紋、`meta`、組裝與拆解、原子交易（`storage-adapter.js` 加 `applyAtomic({ puts, removes })`）、遷移與驗證、完整性檢查；大量單元測試（含故意在交易中途失敗、損毀項目、順序、刪除、空資料、中文與大圖） | 單元測試全過，沒有改變產品行為 |
| **P2** | 接進 `loadAppData`／`saveAppData`／同步／帳號合併／清除，用旗標控制（預設只對新增的測試帳號啟用，內部驗證），舊分頁合併處理 | 既有 2800+ 測試全過；用 46MB 與 100MB 合成資料在 Chromium 實測：載入、儲存、遷移、中途中斷再開、舊分頁並行 |
| **P3** | 量測與調整：開啟時間、記憶體峰值、單次儲存成本；決定要不要做 `conversationIds` 提示；提供「由 WS2 匯出回舊格式」的退回工具 | 達成 §5 的目標數字 |
| **P4** | 對所有帳號預設啟用；（可選）舊 key 的清理 | owner 同意後才推；清理另外決定 |

預估：P1 是最大的一塊，P2 次之；每階段都需要一輪完整測試與實測。

## 5. 目標數字（用 §1 的同一組合成資料驗收）

- 46.5MB 資料第二次開啟的記憶體峰值從約 1130MB 降到 **500MB 以下**（資料本身載入後約 350MB，所以目標是峰值不超過閒置值的 1.5 倍）。
- 完成一則回覆後的儲存：只寫被改動的對話，寫入量與單一對話大小同級（不再是 46MB）。
- 啟動時間不比現在（2.6 秒）慢。
- 遷移 100MB 的合成資料可以完成，且中途中斷後再開不會丟資料、也不會留下半套新格式。

## 6. 之後的階段（本設計不做，但保留接口）

1. **按需載入。** 一開網頁只把對話標題清單放進記憶體，點進對話才載入訊息。WS2 已經讓每個對話是獨立的項目，所以這一步只剩「記憶體裡的對話可以是還沒載入訊息的占位物件」；但搜尋、記憶索引、雲端同步、批次操作都假設所有訊息在記憶體裡，要逐一處理，工程另計，另寫設計。
2. **附件單獨存。** 沿用 `generated-image-assets.js` 的做法：附件存成獨立的 Blob 項目，訊息裡放描述物件，要顯示或送模型時才讀。對很多附件的使用者效果最大；因為會改訊息的資料格式，雲端同步與匯出入都要配合（雲端已有 `cloud-assets.js` 的外部檔案機制可沿用），另寫設計。

## 7. 要請 owner 決定的

1. **舊資料保留多久：** 建議遷移後保留 30 天且成功載入 10 次再清除（清除是 P4 的可選項，也可以永遠不清）。
2. **遷移失敗的處理：** 建議自動退回舊格式並在下次啟動重試最多 3 次；是否需要在畫面上提示使用者（建議：只在設定頁的儲存空間區塊顯示一行狀態，不彈窗）。
3. **P2 的內部驗證方式：** 建議先對新建的測試帳號啟用旗標，由 owner 用自己的帳號在 P3 之後才開啟，不會一次影響所有人。
4. **是否同時做「附件單獨存」：** 建議不要同時做，先做 WS2 再看效果。
5. **版本與發版：** 這是儲存格式的改變，建議作為一個次要版本（`17.8.0`）發布並照 `RELEASING.md` 打標籤；請 owner 確認。

## 8. 附錄：調查用的腳本

在工作階段的 scratchpad（不進 repo）：`heavy2.cjs`／`heavy5.cjs`（合成資料並量記憶體峰值與開啟時間）、`puts*.cjs`（記錄 IndexedDB 寫入次數與呼叫堆疊）、`syncmem.mjs`（Node 中量雲端同步的記憶體）。若之後要重做 P3 的量測，需要重新建立這些腳本，做法是：用 Playwright 開正式版建置，以 `indexedDB` 寫入一個合成的 `chatAppData_v8.6_tester`，重新整理，每 250 毫秒用 `ps` 取樣渲染程序的 RSS。

## 9. P1 完成紀錄（2026-10-06）

**做了什麼（沒有接進產品）**
- `src/app/runtime/kernel/storage-adapter.js` 新增 `applyAtomic({ puts, removes })`：同一個 IndexedDB 交易裡寫入與刪除，全有或全無；`setItemsAtomic` 改成呼叫它，行為不變。
- 新模組 `src/app/runtime/kernel/workspace-store-v2.js`（純模組：只用注入的儲存物件，沒有任何 import、沒有碰頁面）：
  - `createWorkspaceStoreV2({ storage, username })` 提供 `load`、`save(snapshot, { conversationIds })`、`migrateFromLegacy`、`mergeStaleLegacy`、`checkIntegrity`、`getUsage`、`getMigrationFailure`、`setDisabled`／`isDisabled`、`removeAll`。
  - key 前綴 `chatWS2:<encodeURIComponent(帳號)>:`（`:` 不會出現在編碼後的名稱，所以一個帳號的前綴不會是另一個帳號前綴的開頭）；項目是 `meta`、`conv:<id>`、`shared`、`memory`，另有 `failed`、`disabled` 兩個標記。
  - 指紋：兩個 32 位元雜湊合成 53 位元加字串長度（`fingerprintText`），46M 字元約 170 毫秒。
  - 儲存：逐個對話序列化、比對指紋，只寫有變的，連同索引一個交易寫完；沒有任何變動時不開交易。索引壞掉或版本較新時**拒絕寫入**，不覆蓋。載入時讀不到或損毀的對話會回報（`degraded`），下一次儲存不會把它們當成已刪除。
  - 遷移：舊項目只讀不寫；新項目與索引在一個交易裡寫入，之後讀回逐項比對並核對訊息總數，不過就全部移除、寫入 `failed` 標記（含失敗次數）、繼續用舊格式；成功時清除標記。
  - 舊分頁合併：新增的加入、較新且被改過的取代、本機已刪除的不復活、舊分頁的刪除不複製。
- 測試 `tests/workspace-store-v2.test.js`（31 項）加 `tests/runtime-storage-adapter.test.js` 的 3 項；另外對模組做了 7 種故意改壞（略過索引寫入、忽略「讀不到的記錄」保護、對沒變的對話也重寫、提示參數失效、遷移不驗證、覆蓋已存在的儲存、合併時重複加入），測試都抓得到。

**量測（Node，46.5MB、150 個對話、40 張 1MB 圖片，記憶體內的假儲存）**

| 動作 | 舊做法（整份） | 新模組 |
|---|---|---|
| 整份轉文字／第一次完整儲存 | 1270 毫秒，額外峰值約 186MB | 393 毫秒 |
| 沒有變動的儲存（完整掃描） | 同上（舊版要先讀回比對） | 404 毫秒，不開交易 |
| 改了一個對話（完整掃描） | 同上，整份寫入 | 351 毫秒，只寫 1 個對話加索引 |
| 改了一個對話（帶 `conversationIds` 提示） | 同上 | **1 毫秒** |
| 載入 150 個對話 | 讀整份再解析 | 239 毫秒 |

**已知限制（P2 要處理）**
- 舊分頁合併只合併對話；舊分頁新增的資料夾、Noura、個人記憶、記憶狀態不會合併（這些資料量小、出現的機會也只在部署當下有舊分頁時）。
- 目前沒有任何程式使用這個模組：載入、儲存、雲端同步、帳號合併、清除資料、設定頁用量都還在用舊的整份項目。

## 10. P2 完成紀錄（2026-10-06）

**接進產品了，但預設關閉。** 開關是網址加 `?ws2=1`（瀏覽器會記住，存在 `localStorage` 的 `noureon_ws2`）；`?ws2=0` 取消。開關只決定「要不要做下一次遷移」：已經有新格式的使用者不管開關都繼續用新格式，因為遷移後舊項目不再更新，退回去會看到過期資料。

**接點（都以「有新儲存就用，沒有就走原本的路」的方式加入，沒有開關的使用者完全不受影響）**
- `kernel/workspace-storage-selection.js`：決定用哪種格式、必要時遷移、合併舊分頁寫的內容；任何一步出錯都退回舊項目且不動它。遷移失敗最多重試 3 次（`failed` 標記記次數），之後不再嘗試。
- `kernel/workspace-loading.js` 加 `kernel/workspace-store-registry.js`：載入時選定並登錄儲存實例，雲端同步（它自己建立儲存介面）從登錄處取用，同一個分頁同一個使用者只有一個實例。`legacy-core.js` 只加了兩行呼叫（它受大小預算限制）。
- `app-data-persistence.js`：`saveAppData` 在新格式下只寫有變的對話；雲端帳號的 journal 與對話在同一個交易寫入；「髒實體」由改動的對話與舊記錄比對得出（只讀被改動的那幾筆）。對 12 種連續變動（新增、編輯、刪除、資料夾、Noura、記憶、順序、暫時新對話…）逐步比對，journal 與舊做法完全一致。
- `cloud-sync-v2-shadow.js`：讀寫整份工作空間與 journal 改走新儲存；讀不全（有對話損毀或遺失）時拒絕同步，不會上傳不完整的資料。
- `cloud-workspace-image-repair.js`：逐筆讀、修、只寫有變的，並在同一個交易標記 journal。
- `memory-summary-cloud-sync.js`：只讀 `memory` 那一筆。
- `account-linking.js`：連結帳號時複製所有新格式記錄到雲端使用者的前綴下並修圖片 key；`user-data-retention.js`：清除與切換使用者時一併移除新格式記錄（`removeItemsByPrefix`）。
- `storage-adapter.js` 的 `applyAtomic`（P1）；`workspace-store-v2.js` 新增 `save` 的 `beforeWrite`（同交易寫入額外記錄、可取消）、`rewrite`（逐筆改寫）、`readMemoryState`。

**測試：** 新增與改寫共約 90 項，總共 2915 項全過（排除偶爾卡住的 `runner.test.js`）。其中雲端同步的 9 個完整旅程（`tests/cloud-sync-v2-journal.test.js`）現在對「舊項目」與「新儲存」兩種後端各跑一次，行為完全一致。

**瀏覽器實測（Chromium，正式版建置，本機帳號，合成資料）**

| 資料 | 項目 | 舊格式（開關關閉） | 新格式 |
|---|---|---|---|
| 46MB（150 對話、40 張圖） | 開啟網頁時整份寫入 | 3 次（各 47MB） | **0 次** |
| | 開啟到可用 | 7.6 秒 | 遷移那次 6.7 秒；之後約 2.3 秒 |
| | 啟動期間渲染程序峰值 | 約 1030MB | 遷移約 1040MB；之後約 780～850MB |
| | 釘選一個對話寫入量 | 整份 47MB | 該對話 1.07MB 加索引 19KB |
| 98MB（200 對話、90 張圖） | 開啟到可用 | 6.6 秒 | 遷移 8.5 秒；之後 3.9～4.8 秒 |
| | 啟動期間渲染程序峰值 | 約 1930MB | 遷移約 1220MB；之後約 940～1110MB |
| 6.3MB（純文字） | 開啟到可用 | 0.9 秒 | 約 1.1 秒（一樣快） |
| | 峰值 | 約 470MB | 約 470MB（受基準值支配） |

- 載入後存活的記憶體只有約 57MB（跟資料量吻合）；完整回收後新舊格式都回到約 340MB。峰值與平台期是「等待回收的垃圾」，而垃圾的主要來源是每個含圖對話的記錄裡幾 MB 的 base64 大字串（它們進入 V8 的大物件區，要等下一次完整回收才會釋放）。所以**含大量附件時，新格式把峰值降了約三到四成，沒有降到設計目標的 500MB 以下**；要再往下，需要把附件拆成獨立項目（§6 的第 2 項），或按需載入（§6 的第 1 項）。
- 遷移中途出錯（注入交易失敗）：舊資料照常使用、150 個對話都在、失敗次數正確累計（1、2），故障排除後下一次啟動遷移成功並清除標記。
- 在遷移進行中的 150／700／1500／2500／3500 毫秒關閉分頁：不是完全沒有新記錄，就是完整一致，下一次啟動 150 個對話都在、舊項目保留。
- 舊分頁寫入舊項目後（新增一個對話、改一個對話）重新載入：兩者都合併進來。

**P2 的限制與留給 P3 的**
- 讀不到的對話只會在主控台警告（`window.__noureonWorkspaceStorage.problems` 可查）；owner 決定的「設定頁顯示一行狀態」還沒做（要五種語言文字，P3 一起做）。
- 沒有「退回舊格式」的工具（`disabled` 標記存在，但新格式資料不會自動匯出回舊項目）；P3 要做。
- 雲端同步用假的資料庫在單元測試中驗證，沒有用真的 Supabase 帳號實測；owner 開啟前建議先在測試帳號試。
- `conversationIds` 提示（熱路徑只序列化剛改的對話）已在儲存層實作，但還沒有任何呼叫端使用；P3 量測後決定。
- 完整掃描的 CPU 成本（46MB 約 0.35 秒）仍在每次儲存發生。

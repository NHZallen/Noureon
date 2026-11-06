# 專案分享（共享專案，設計）

2026-11-06。Allen 與 Claude 討論後定案的部分標「（Allen）」；標「（提案）」的是 Claude 為了落實而提出、還沒經 Allen 逐項確認的做法。畫面沒有定案，先照 Allen 給的 ChatGPT 截圖的規則做，**畫面草稿要先給 Allen 看過才動手**。

前置：專案（`docs/superpowers/specs/2026-10-31-projects-design.md`）、對話分享（`docs/superpowers/specs/2026-10-31-conversation-share-design.md`）、記憶（`docs/superpowers/specs/2026-10-30-memory-redesign-design.md`）。

## 1. 要做什麼

專案擁有者可以把整個專案分享給其他人，成為「共享專案」。成員在同一個專案裡共用檔案、指示、記憶，看得到所有成員的對話，用「分支」從別人的對話某一則訊息接著往下討論。每位成員回覆時用自己的金鑰與額度。

和「對話分享」是兩件事：對話分享是一則對話的唯讀快照（連結、不用登入）；專案分享是邀請人加入專案（要登入雲端帳號）。

現況：專案清單頁已有「與你共享」分頁，內容是空狀態的占位（`pjTabShared`、`pjSharedEmpty`）。

## 2. 已定案的決定（Allen）

| 題目 | 決定 |
|---|---|
| 對話可見度 | 專案裡所有對話，所有成員都看得到。 |
| 誰能寫對話 | **每則對話只有建立者能寫**，擁有者也一樣。不支援多人同時編輯同一則對話。其他人要接續，只能「分支」。分支不改動原對話。 |
| 角色 | 擁有者、編輯者、聊天成員，權限見 §3。 |
| 記憶 | 分享專案後**強制切成「僅限專案記憶」**；共享專案的記憶是**共用的一份**，不是每個成員各一套。 |
| 記憶誰能寫 | 手動新增、編輯、刪除筆記：只有擁有者和編輯者。**自動記憶也只開給這兩種角色**。聊天成員讀得到記憶、不寫入、不觸發自動記憶（Claude 的理解，Allen 未反對）。 |
| 誰整理就共享 | 哪位成員的回覆觸發整理，結果就是大家共用的。 |
| 邀請 | 最多 100 位成員（不含擁有者）；可用連結（建立時先選權限），也可寄信（用官方信箱寄出）。寄信一小時最多 20 封（每位使用者）。 |
| 檔案與指示 | 所有成員同步看到同一份。 |
| 容量 | 檔案只存一份，**用量只算擁有者（創立者）**，編輯者上傳也算擁有者的；成員的用量不受影響。上限沿用現有：20 個來源、檔案總量 200 MB。 |
| 公開連結 | 共享專案裡的對話不能建立公開（快照）連結；對話選單的「分享對話」名稱不變，在共享專案裡複製的是只有成員打得開的連結。分享專案時，專案內對話原有的公開連結直接失效，確認視窗只多一行說明，不逐則讓人選（Allen 2026-11-06 的意見；待 Allen 確認這個說明）。 |
| 退出、移除、刪除 | 見 §9。被移除的成員，他的對話預設保留。 |
| 分期 | 「對話分支」獨立先做（私人專案與一般對話也能用）。 |

## 3. 權限

| 權限 | 擁有者 | 編輯者 | 聊天成員 |
|---|---|---|---|
| 查看所有專案對話 | ✓ | ✓ | ✓ |
| 建立新對話、分支 | ✓ | ✓ | ✓ |
| 使用專案檔案與指示 | ✓ | ✓ | ✓ |
| 下載專案檔案 | ✓ | ✓ | ✓ |
| 讀專案記憶 | ✓ | ✓ | ✓ |
| 手動管理筆記、自動記憶寫入 | ✓ | ✓ | ✗ |
| 上傳、移除檔案 | ✓ | ✓ | ✗ |
| 修改專案指示 | ✓ | ✓ | ✗ |
| 邀請新成員 | ✓ | ✓（可邀請的權限不高於自己；不能改別人的權限）| ✗ |
| 移除其他成員 | ✓ | ✗ | ✗ |
| 修改成員權限 | ✓ | ✗ | ✗ |
| 修改專案名稱 | ✓ | ✗ | ✗ |
| 刪除整個專案 | ✓ | ✗ | ✗ |
| 刪別人的對話 | ✓ | ✗ | ✗ |
| 刪自己的對話 | ✓ | ✓ | ✓（刪了全員都看不到）|

## 4. 資料（提案）

原則：**擁有者現有的專案資料列不搬**（`workspace_folders`、對話、訊息、檔案路徑維持原狀，不需資料遷移）；成員存取一律走資料庫函式（security definer，檢查成員身分與角色），不放寬資料表的直接權限，和對話分享同一做法。

### 4.1 新資料表

- `project_members`：`project_id`（擁有者資料夾 id）、`owner_id`、`member_id`、`role`（`editor`／`chat`）、`joined_at`、`invited_by`。主鍵 `(project_id, member_id)`。上限 100 位（函式檢查）。擁有者不在表內，由資料夾的 `user_id` 決定。
- `project_removed_members`：`project_id`、`member_id`、`removed_at`、`link_generation`（他加入時用的連結代次）；`workspace_folders` 另有 `invite_link_generation`（目前連結代次）。
- `project_invites`：`id`、`project_id`、`owner_id`、`code`（≥24 字元 base62，同對話分享的代號規則）、`role`、`kind`（`link`／`email`）、`email`（`kind = email` 才有，小寫）、`expires_at`（可空，預設不設）、`created_by`、`created_at`、`status`（`active`／`used`／`revoked`）。連結邀請可多人使用，寄信邀請只能用一次且綁收信地址。
- `project_memory_records`：欄位與 `workspace_memory_records` 相同形狀（`record_key`、`payload`、`version`、`updated_at`、`deleted_at`），主鍵 `(project_id, record_key)`，沿用「版本不符就重讀合併」的更新規則。共享專案的筆記存這裡。
- `project_shares_log`（可選，之後再定）：成員加入、退出、移除的紀錄。

### 4.2 現有資料表新增欄位

- `workspace_folders`：`shared_at timestamptz`（第一次分享的時間；用於「分享前的訊息要去除記憶痕跡」，§6.1）。
- `workspace_conversations`：`shared_project_id uuid`、`shared_project_owner uuid`。成員在共享專案裡建立的對話用這兩欄指到擁有者的專案，**不用 `folder_id`**（現有外鍵 `(folder_id, user_id)` 要求資料夾和對話同一人）。擁有者自己在專案裡的對話維持 `folder_id`。

### 4.3 主要函式

- `create_project_invite`／`accept_project_invite`／`revoke_project_invite`／`list_project_invites`。
- `list_project_members`、`set_member_role`、`remove_project_member`、`leave_project`。
- `fetch_project_delta(project_id, since)`：給成員，回專案設定（名稱、指示、來源清單）與所有成員的對話與訊息；分享前的訊息已去除記憶痕跡。
- `update_shared_project(project_id, patch, expected_updated_at)`：編輯者／擁有者改指示與來源，帶版本檢查（落後就拒絕，畫面請使用者重新整理再改，不做「最後寫入者贏」）。
- `read_project_memory`、`write_project_memory`（檢查角色）、`match_project_memory_vectors(project_id, …)`：跨成員的對話向量一起搜尋，向量仍各人存各人的表。
- 觸發器或函式：專案分享時把 `memory_scope` 設成 `project`；撤銷對話的公開連結；擁有者刪專案時把成員的對話脫離專案。

## 5. 對話與分支

### 5.1 對話歸屬

- 每則對話的唯一寫入者是建立者。成員打開別人的對話是**唯讀**，輸入框換成「在新聊天中分支」。
- 成員在共享專案裡新開的對話，建立者的 `workspace_conversations` 列存 `shared_project_id`，所有成員經 `fetch_project_delta` 看到。
- 別人的對話在成員端是**唯讀鏡像**（本機另存、標 `readOnly`），不併進成員自己的工作空間同步，避免寫回成員自己的帳號。

### 5.2 分支（Branch Chat，獨立先做）

- 入口：訊息的 ⋯ 選單「在新聊天中分支」。
- 動作：把這則訊息（含）以前的內容複製成一則新對話，屬於建立分支的人。`metadata.branchedFrom = { conversationId, messageId, authorId, at }`，標題旁小標籤「分支自…」。
- 附件：複製一份到分支者自己的空間（同「接著聊」的複製流程，`src/app/runtime/share/share-import.js`），所以原對話被刪也不影響分支；用量算分支者自己。
- 去除記憶痕跡：分支別人的對話時，沿用快照規則去除記憶步驟與記憶資料；分支自己的對話不去除。
- 在私人專案、一般對話一樣可以用；共享專案裡，新的分支帶 `shared_project_id`，所有成員看得到。
- 現況：專案裡目前沒有分支功能，這是新功能。

## 6. 記憶（共用一份）

- 分享專案時：`memory_scope` 強制設為 `project`（原本「建立後不能改」的規則在此有一個例外；取消共享後**維持專案記憶，不切回去**）。
- 原本就是「僅限專案記憶」的專案：現有的專案筆記（只由專案內對話整理而來，而這些對話本來就要給成員看）搬進 `project_memory_records`，擁有者個人那邊的專案筆記標成已移走。
- 原本是「預設記憶」的專案：筆記在個人記憶，不帶進專案；共享後專案記憶從空白開始。
- 寫入：只有擁有者和編輯者的回覆會觸發自動記憶與整理；用觸發那次回覆的人自己的金鑰與額度；專案上有鎖，避免兩人同時整理互蓋。
- 讀取：所有成員的回覆都帶專案記憶；模型「查專案對話」時搜尋所有成員的對話。
- 成員離開：筆記保留在專案裡，擁有者可手動刪。

### 6.1 記憶痕跡

分享前的訊息可能帶「用了哪些記憶」「回顧對話」的明細，裡面是擁有者個人記憶的原文。成員讀取時，`created_at < shared_at` 的訊息一律去除（規則同對話分享的快照）。分享後的回覆只用專案記憶，痕跡可以保留。

## 7. 檔案、指示與容量

- 專案檔案維持存在擁有者名下 `user-assets/<擁有者>/<hash>`（私有路徑，儲存規則只准本人讀）。
- 成員讀取：伺服器檢查成員身分後代讀（回覆時的檔案工具本來就由伺服器取原檔）；頁面下載經伺服器簽發的短期網址。
- 上傳、移除：編輯者與擁有者經伺服器端點，伺服器以擁有者身分存入（`file-store.js` 的 `save` 用擁有者的 `userId`），檢查擁有者的 500 MB 空間與共享專案檔案總量上限。
- 指示與來源清單：經 `update_shared_project`（§4.3）寫入擁有者的資料夾列；擁有者的各裝置照現有的差量同步收到；成員經 `fetch_project_delta` 收到。
- 刪專案：照現有「刪專案連同檔案」規則清檔案；刪成員不影響檔案。

## 8. 邀請

- 連結：建立時選權限（編輯者／聊天成員），可多人使用，可隨時關閉，預設不設期限。擁有者可以**重新產生連結**，舊連結馬上失效。拿到連結的人要有雲端帳號並登入才能加入。
- 寄信：伺服器用現有的 `server/mailer.js` 與 `mail-layout.js`（Resend，`noreply@noureon.com`）寄出；每位使用者一小時最多 20 封，**畫面顯示本小時還剩幾封**（端點回傳剩餘額度與上限）；信的內容只有邀請者名稱、專案名稱和按鈕，不放專案內容。寄信邀請的連結綁收信地址，登入的帳號信箱要相符才能接受，只能用一次。
- **被移除的人不能用舊連結回來**（Allen 2026-11-06）：移除時記下他加入時用的連結代次；舊代次的連結對他回「這個邀請連結對你已失效」。要回來，擁有者重新產生連結（代次加一）再把新連結給他；寄信邀請是擁有者明確寫下他的信箱，不受這個限制。連結重新產生會讓所有還沒加入的人拿到的舊連結失效。
- 成員上限 100 位（含待加入以外的已加入者，不含擁有者）；超過時加入失敗並說明。
- 加入頁：站內路由，輸入連結後顯示專案名稱與邀請者名稱，登入後按「加入」；頁面與回應帶 `noindex, nofollow, noarchive` 與 `Referrer-Policy: no-referrer`，和對話分享的閱覽頁一樣。
- 信件語言：英文（Allen 決定）。

## 9. 離開、移除、刪除

| 情況 | 做法 |
|---|---|
| 成員自行退出 | 他建立的對話留在專案裡（標示建立者）；退出時可勾選「建立成我自己的專案」（Allen 2026-11-06）：只把自己建立的對話**複製**進一個新的私人專案（名稱預設「原名（我的副本）」，可改；**記憶讓使用者選**，和一般新增專案一樣：預設記憶或僅限專案記憶，建立後不能改），**專案的檔案、指示、來源與記憶不會帶走**。不勾的話對話只留在原專案。 |
| 成員被移除 | 擁有者移除時選「保留他的對話」或「一併刪除」，**預設保留**。被移除的人失去專案存取。 |
| 建立者刪自己的對話 | 全員都看不到。 |
| 刪別人的對話 | 只有擁有者。 |
| 成員刪帳號 | 他在共享專案裡的對話跟著消失，寫進隱私政策。 |
| 擁有者刪專案 | 全員失去專案；成員的對話脫離專案，變成成員自己空間裡沒有專案的一般對話。 |
| 取消共享（移除所有成員） | 專案回到私人，記憶維持專案記憶。 |

## 10. 公開連結與對話連結

現況（已查過程式）：「分享對話」是 19.1.0 的功能，入口在對話的右鍵／長按選單（`mobile-context-menu-markup.js` 的 `data-action="share"`）；專案頁自己的對話選單（`projects-page.js` 的 `chatMenu`）沒有這一項。所以專案裡的對話仍可能已有公開連結（先分享再移進專案，或從一般選單分享）。我沒有逐一確認專案裡的對話會不會出現在那個選單，實作時查。

- **共享專案裡的對話不能建立公開連結**：`server_create_conversation_share` 拒絕建立；選單項目名稱還是「分享對話」，在共享專案裡改成複製成員連結（提示「已複製連結，只有專案成員打得開」），不開公開連結的對話框。
- **成員連結**（Allen 2026-11-06：名稱就叫「分享對話」，目的是讓專案裡的人快速看到這則對話）：連到「專案＋對話」的站內網址，要登入雲端帳號；成員打開直接進這則對話（唯讀鏡像，§5.1）；非成員（含被移除的前成員、已登入但沒加入的人）看到「你不是這個專案的成員」，不顯示任何內容。專案頁的對話選單也要有這一項。
- **分享專案時**：專案內對話原有的公開連結（只有真的存在才處理）直接失效；確認視窗多一行說明「其中 N 則對話原本有公開連結，分享後這些連結會失效」，擁有者可取消整個分享；不逐則選。

## 11. 伺服器

- `run-spec` 新增專案欄位（專案 id、擁有者 id）；伺服器用呼叫者的身分向資料庫確認成員角色，決定能不能寫記憶、能讀哪些檔案。
- `tools.projectFiles` 的檔案快照從擁有者名下取；`tools.memory.scope = project` 時讀寫 `project_memory_records`。
- 議會的各成員模型與一般回覆走同一條路。
- 新端點（需登入）：邀請、加入、成員管理、編輯者上傳與移除檔案、成員讀檔案；寄信限流用 `server/rate-limit.js`。
- 新的共用模組要列進 `scripts/server-shared-modules.json`，由 Allen 確認。

## 12. 同步

- 不做即時：打開專案、App 回到前景、專案頁或共享對話開著時每 60 秒，各拉一次 `fetch_project_delta`。
- 對話因為單一寫入者，沒有合併衝突。專案設定與筆記靠版本檢查（§4.3、§4.1）。

## 13. 畫面（待 Allen 看過草稿）

- 專案頁：成員列表、邀請、權限、分享設定。專案裡的每則對話是純文字（Allen 2026-11-06），只在第二行標出建立者名字，不放頭像；頭像只用在成員按鈕、成員列表和加入頁。
- 分享專案的確認視窗：寫明「現有 N 則對話會讓所有成員看到、記憶會切成專案記憶（不可改回）」，有公開連結的對話加一行失效說明。
- 頭像：成員按鈕、成員列表、加入頁用使用者自己的頭像（`user_avatars`），沒有頭像才用名字縮寫；對話列與對話標題不放頭像，只標名字。
- 對話畫面：唯讀對話的底部列是分支列；分支後的對話以分隔線標出分支點，分支點以上是複製來的內容、字色較淡。
- 草稿第三版（12 個畫面）：artifact「專案分享畫面草稿」。
- 「與你共享」分頁：列出加入的專案。
- 唯讀對話：輸入框換成「在新聊天中分支」。
- 訊息 ⋯ 選單：「在新聊天中分支」。
- 樣式照 `docs/superpowers/specs/2026-10-31-ui-style-rules.md`，顏色用 `tokens.css`，五語。

## 14. 隱私與法律

隱私權政策、使用條款、協助中心五語都要改：成員看得到專案內全部對話、成員刪帳號時其對話的處理、邀請信會寄到對方信箱、共享專案的記憶共用、專案檔案存在擁有者名下。改 `src/data/legal/*.js`，用 `node scripts/generate-privacy-md.mjs` 產生 `PRIVACY.md`。

## 15. 分期

0. **B 對話分支**（獨立）：訊息選單、複製到那則訊息為止、`branchedFrom` 標記、附件複製、五語、測試。
1. **S1 成員與邀請（連結）**：資料表與函式、成員管理、連結邀請、分享專案的確認視窗與公開連結的選擇、強制專案記憶與筆記搬移。
2. **S2 成員讀取**：`fetch_project_delta`、唯讀鏡像、「與你共享」分頁、在共享專案新開對話、分支別人的對話（去除記憶痕跡）。
3. **S3 檔案與指示**：伺服器代讀、編輯者上傳與編輯、容量與總量上限、成員回覆帶專案脈絡、議會。
4. **S4 共用記憶**：`project_memory_records`、角色限制、整理加鎖、跨成員查對話。
5. **S5 收尾**：離開、移除、刪除流程、寄信邀請與限流、成員專用連結、隱私與法律五語、全套檢查。

## 16. 協作與契約

新資料表、欄位、函式、端點、`metadata.branchedFrom`、`run-spec` 專案欄位、儲存桶讀取規則，都是契約變更：在 Linear 開 `contract` 單，由 Allen 確認。涉及權限、儲存規則、資料遷移與同步，Allen 與 Sun 都要看。migration 只寫檔案，由 Allen 先套測試專案，再套正式專案。

## 17. 待確認

2026-11-06 Allen 回答：

- **檔案上限**：沿用現有，不另訂。每個專案最多 20 個來源（`PROJECT_SOURCES_MAX`，資料庫欄位也限 20），檔案總量 200 MB（`PROJECT_SOURCE_FILES_BYTES_MAX`）；共享後同樣算在擁有者的空間。
- **寄信邀請的信件語言**：英文。
- **連結邀請期限**：不設期限（可隨時關閉）。
- **聊天成員讀記憶、不寫入**：確認。
- **畫面草稿**：已給 Allen 看第二版（11 個畫面），等 Allen 回饋後定案。

實作時還要查：專案內對話有沒有其他分享入口。

## 18. 實作紀錄

### 18.1 對話分支（B，2026-11-06，已在 `staging`）

- `src/app/runtime/branch/`：`branch-conversation.js`（純函式：複製到被選的回覆為止，新訊息 id、深拷貝、拿掉未完成的研究計劃與 `serverError`／`steer`，沿用模型、搜尋、議會、專案設定，`branchedFrom = { conversationId, messageId, at, title }`）、`branch-button.js`、`start-branch.js`（事件 `noureon:branch-message`，加到最上面、存檔、開啟、通知）。
- 按鈕不是由畫訊息的程式畫的：`start-branch.js` 用 MutationObserver 在每則回覆的 `.message-footer-left` 複製鈕後面補上，因為 `submit-input-*.js` 是最大的 JS 區塊，上限 300 KB、當時只剩約 120 位元組（`check:sizes`）。點擊由 `message-list-actions.js` 轉成事件（順手把 `i18n[config.uiLanguage]` 收成 `ui()` 騰出位元組）。`start-branch.js` 由 `start-shares.js` 啟動，不再動 `shell.js`。
- `branchedFrom` 隨對話同步（`cloud-sync-v2-codecs.js` 的 `marksOf`，與 `sharedFrom` 同一條路）。
- **沒做**：側邊欄的「分支」小標籤（核心區塊沒有位元組）、對話裡的分支線與淡色已複製內容（草稿畫面 6）；標題已寫成「原標題（分支）」。
- 測試：`tests/branch-conversation.test.js`、`tests/cloud-sync-v2-codecs.test.js`。

### 18.2 成員與連結邀請（S1，2026-11-06，已在 `staging`，migration 待 Allen 套用）

- 資料庫：`supabase/migrations/20261106010000_add_project_members.sql`。表 `project_members`、`project_invites`、`project_removed_members`（都不給直接權限，只走函式）；`workspace_folders` 新增 `shared_at`、`invite_link_generation`，並用 BEFORE UPDATE 觸發器保住分享狀態（同步寫回舊資料夾也不能取消專案記憶或改掉連結代次）。函式：`project_share_preview`、`share_project`（強制專案記憶、撤銷專案內對話的公開連結）、`list_project_members`、`get_project_links`、`create_project_link`、`refresh_project_link`（只有擁有者，代次加一、舊連結全部失效）、`close_project_link`、`get_project_invite`（匿名可呼叫，只回專案名稱、角色、邀請者）、`accept_project_invite`（上限 100 位、被移除者用舊代次連結回 `invite_removed`、寄信邀請綁信箱）、`set_project_member_role`、`remove_project_member`、`leave_project`、`list_shared_with_me`。
- 頁面：`runtime/project-sharing/`（`project-share-client.js`、`join-route.js`、`start-project-sharing.js`）、`ui/projects/project-members-panel.js`（成員與邀請整頁面板、分享前確認視窗）、`project-join-dialog.js`、樣式 `styles/project-sharing.css`（用到才載入）；入口是專案 ⋯ 選單的「成員與分享」。邀請網址 `noureon.com/join/<code>`（`vercel.json` 已加改寫與 `noindex`／`no-referrer` 標頭；`main.js` 把代碼放進 localStorage 並把網址換回 `/`，登入且雲端帳號就緒後才問）。
- 測試：`tests/database/project-members.test.js`（真 SQL）、`tests/project-sharing-ui.test.js`、`tests/database/migrations.test.js`（函式權限清單）。
- **沒做（留給後面幾期）**：成員頭像圖片（目前用名字首字；其他人的頭像在私有儲存桶，要讀取規則，S2）、「與你共享」分頁列出專案（S2）、專案頁頭的成員按鈕（先用選單項目）、寄信邀請與額度顯示（S5）、移除時「一併刪除他的對話」選項（S2 之後才有成員對話）。

# 同步密碼救援重做：通行金鑰與驗證器

狀態：設計，等 Allen 確認 §8，Sun 要審（金鑰與權限，AGENTS.md 規定兩人都要看）。沒有程式改動。2026-11-12。Allen 的決定：做 B（通行金鑰）與 C（驗證器），**不做 A（救援碼）**。

## 1. 為什麼要做

2026-11-12 的徹查（API 金鑰保護）找到最大的問題：`api/sync-vault-recovery.js` 把「同步密碼本身」加上金鑰庫紀錄，用**一把全站共用的金鑰** `SYNC_VAULT_RECOVERY_KEY` 加密後存進 `user_vault_recovery.recovery_payload`。誰同時拿到這個環境變數和資料庫，就能解開所有人的同步密碼，再解開所有雲端同步的 API 金鑰。隱私政策第 46 行有寫，但同步金鑰庫因此不是端到端加密。

目標：伺服器**技術上**解不開任何人的同步密碼；使用者忘記同步密碼時仍然救得回來；最壞情況也不會失去對話。

## 2. 同步金鑰庫實際保護什麼（決定最壞情況）

查程式（`cloud-workspace-sync.js`、`import-export-lifecycle.js`）：金鑰庫只加密兩樣東西，一是雲端同步的 `sensitive_config`（各家 API 金鑰），二是備份檔裡的 `encryptedApiKeys`。對話、專案、設定、記憶都**不**在金鑰庫裡。

所以所有救援方式都失效的最壞情況是：**使用者要重新輸入自己的 API 金鑰**，對話與資料完全不受影響。

## 3. 現在的結構（不改的部分）

- 同步密碼 → PBKDF2-SHA-256（310000 次）→ AES-GCM 256 金鑰，加密 `sensitive_config`。`vault_record` 只存鹽、IV、驗證用密文，不含密碼。
- 換同步密碼時走輪替（`previousVaultKeys`）。
- 救援：`store`、`recover`（要 10 分鐘內 Email 驗證）、`delete`，都在 `api/sync-vault-recovery.js`，伺服器用全站金鑰加解密。

**這份設計不動金鑰庫本身**，只換「救援資料用誰的金鑰包起來」。

## 4. 新做法：救援槽（slots）

`user_vault_recovery` 新增欄位 `slots jsonb`，每個槽都是 `AES-GCM(那個槽的金鑰){ password, record }`，**加解密都在瀏覽器**，伺服器只存密文：

| 槽 | 金鑰來源 | 說明 |
|---|---|---|
| `passkey`（B，通行金鑰） | WebAuthn PRF 擴充：通行金鑰在本機算出 32 位元組，HKDF 派生 | Face ID／Touch ID 解鎖；記錄憑證 ID 與 PRF 鹽。**可以登記多把**（例如 iPhone、Mac、實體安全金鑰），每把一個槽 |
| `server`（舊，過渡用） | 全站金鑰（現況） | 只留給還沒重新設定的舊使用者，之後下架（§6） |

任何一個槽都能救回同步密碼。

### C. 驗證器（TOTP）

用 Supabase 內建的 TOTP 多因素驗證（`auth.mfa.enroll／challenge／verify`），工作階段驗過就是 `aal2`：
- 對有登記驗證器的帳號，`user_vault_recovery` 的寫入與刪除（RLS）要求 `aal2`，擋住「Email 或工作階段被盜後，把救援槽換掉或刪掉」。
- 舊的 `server` 槽在過渡期，`recover` 也要求 `aal2`（有登記的話）。
- 它**不**讓伺服器變得解不開，那是 B 的事；C 是擋外面的人。誠實寫在畫面與政策裡。
- 驗證器只管登入與救援資料的寫入，**不能**單獨當救援方式（它只吐 6 位數，無法解開任何東西）。

## 5. 流程

**建立／重新設定（設定 → 使用者 → 同步密碼）**
1. 使用者輸入同步密碼（現有流程），解鎖金鑰庫。
2. 偵測瀏覽器支援 PRF：支援才顯示「用通行金鑰（Face ID）設定救援」。登記後建立 `passkey` 槽；建議再登記第二把。
3. 選項：登記驗證器（QR 與手動碼，輸入一組 6 位數確認）。
4. 寫入時伺服器只收密文。

**忘記同步密碼（現有入口）**：Email 登入 → 選「用通行金鑰救援」→ Face ID → 瀏覽器解槽，得到同步密碼與紀錄 → 進入「設定新同步密碼」。

**換同步密碼**：所有槽要用新密碼重包一次；每把通行金鑰都需要使用者在場驗證（P3 要處理只有部分完成的情況：舊槽保留到全部完成，避免出現「新密碼沒有任何槽」的狀態）。

## 6. 舊使用者

Allen 的決定：**通知重新設定**，不強制。

- 已有 `server` 槽的人，解鎖金鑰庫後看到提示「加強同步密碼救援」，引導登記通行金鑰（完成後 `server` 槽被刪）。
- 沒處理的人維持舊的救援方式，直到截止日（**Allen 決定：UTC+8 2026-12-31 23:59**，即 UTC 2026-12-31 15:59）；截止後刪掉所有 `server` 槽與環境變數 `SYNC_VAULT_RECOVERY_KEY`，沒重新設定的人只會失去「忘記密碼時的救援」，**已解鎖的同步與資料不受影響**。
- 過渡期內營運者技術上仍解得開這些人的密碼，隱私政策要照實寫。

## 7. 實作階段（一次做一個，每階段推 `staging`）

- **P0 驗證（先做）：** 在沙盒與 Allen 的 iPhone 驗證 WebAuthn PRF 支援（iOS／Safari、Chrome、Android、通行金鑰跨裝置同步）；確認 `@supabase/supabase-js` 有 MFA API、JWT 有 `aal` 與 `amr`、RLS 可寫 `aal2` 條件。**P0 的結果可能改變 §8 的決定。**
- **P1 加密模組：** `src/app/sync/vault-recovery-slots.js`，純函式（瀏覽器與測試共用，不用 `window`）：槽格式與版本、派生金鑰、包與解槽；單元測試含錯金鑰、改動密文、舊格式。
- **P2 資料庫：** migration 加 `slots jsonb`（只寫檔，Allen 先套測試專案、再套正式）；RLS：本人讀寫；有登記驗證器的帳號寫入要 `aal2`。
- **P3 B 通行金鑰：** 支援偵測、登記（多把）、使用、換密碼時重包；不支援時不顯示。五語文字。
- **P4 C 驗證器：** 登記、驗證、關閉；RLS 條件。
- **P5 過渡與收尾：** 舊使用者提示、`server` 槽下架（Allen 決定日期）、隱私政策第 46 行與協助中心五語、`PRIVACY.md`、設計文件補實作紀錄、Linear。

## 8. 還需要 Allen 決定

只做 B、C（不做救援碼）帶來兩個缺口，要先定：

1. **瀏覽器不支援 PRF 的使用者怎麼辦？** 他們沒辦法建立任何救援槽。選項：(a) 他們沒有救援，忘記同步密碼就重新輸入 API 金鑰（最壞情況見 §2）；(b) 保留「讓 Noureon 協助救援」當明確選項（預設關，畫面照實寫「代價是我們技術上能解開你的同步密碼」）。(b) 等於留一個洞，但只有主動開的人受影響。
2. **通行金鑰全部遺失怎麼辦？** 沒有救援碼，使用者換了 Apple ID／Google 帳號、刪掉通行金鑰、又忘記同步密碼，就只能重新輸入 API 金鑰。這是 B 的固有限制，靠「建議登記第二把」減輕，不能消除。Allen 之前說「不可接受是使用者承擔風險、應該由我們做好保護」，這一點和只做 B 衝突，要 Allen 明確接受，或回頭加 A（救援碼），或選 §8.1 的 (b)。
3. ~~`server` 槽的截止日~~ 已定：UTC+8 2026-12-31 23:59（Allen，2026-11-12）。通行金鑰要在這之前上線，使用者才有時間重新設定。

## 9. 風險與沒驗證的事

- WebAuthn PRF 的瀏覽器支援度沒查證（只是記得 iOS 18／Safari 18 與近期 Chrome 支援），P0 要用 Allen 的 iPhone 實測；PRF 只在部分驗證器與瀏覽器組合可用。
- 通行金鑰槽綁定憑證：使用者刪掉通行金鑰、換 Apple ID 或 Google 帳號，這個槽就失效。
- 這是金鑰與權限變更，依 AGENTS.md 要 Allen 與 Sun 都審；migration 由 Allen 套。

## 10. 其他 app 怎麼做（2026-11-12 查的，來源是搜尋結果，沒有逐頁讀原文）

| App | 忘記密碼時 | 最壞情況 |
|---|---|---|
| Apple iCloud 鑰匙圈 | 金鑰存在 Apple 的 HSM 叢集（專用硬體），用你的 iCloud 安全碼經 SRP 驗證，不把安全碼傳給 Apple；只允許 10 次嘗試，超過紀錄被鎖或銷毀。Apple 自己也讀不到內容 | 忘記安全碼又用完次數就救不回 |
| WhatsApp 加密備份 | 兩條路：自訂密碼（金鑰放在 HSM 金鑰庫，由 HSM 限制嘗試次數）或 64 位數字金鑰（自己保管） | 兩個都丟了就救不回 |
| 1Password | 沒有服務端救援；靠事先產生的救援碼、緊急工具包（含 Secret Key）、家庭管理者 | 全丟了，官方也救不回 |
| Bitwarden | 零知識，官方無法重設；備援是密碼提示信、事先設定的緊急聯絡人（可延遲接管） | 全丟了只能刪帳號重來 |

共同點：**沒有一個大型 app 讓營運者自己握一把能解開所有人的金鑰**；最壞情況都接受「真的救不回」，但用多層備援把機率壓低。想做到「忘記也能救」又不讓營運者讀得到的，Apple、WhatsApp 用的是 **HSM 加嘗試次數限制**（使用者只記一組短碼），這需要專用硬體或雲端 HSM，不是靠程式能做的。

Noureon 的最壞情況比它們輕：金鑰庫只裝 API 金鑰（§2），重新輸入即可，不會失去對話。

### 可採用的備援層次（由使用者負擔最低到最高）

1. **仍保有金鑰的另一台裝置：** 本機的 API 金鑰是明文（見徹查），任何一台還登入、還存著金鑰的裝置，都能「以新同步密碼重建金鑰庫並重新上傳」，不需要任何救援秘密。這是 Apple 的「用另一台裝置核准」的同類想法。零件已存在（`removeSyncVault`、`createAndUnlockSyncVault`、`markSensitiveCloudSyncPending`），但設定畫面有沒有對應流程、重新上傳是否會被雲端衝突規則擋住，**我還沒確認，要查**。
2. **通行金鑰（B）：** 平台（iCloud 鑰匙圈、Google 密碼管理員）同步，帳號弄丟時有 Apple／Google 自己的救援。
3. **重新輸入 API 金鑰：** 最後手段，幾分鐘的事，「永遠不能用同步」並不成立：捨棄舊的雲端金鑰庫、設新同步密碼、重新輸入一次即可。

所以對 §8.1、§8.2 的修正：不做「協助救援」（Allen 覺得麻煩，且是留洞），不做救援碼；不支援通行金鑰的瀏覽器走層次 1 與 3。

## 11. 「重新開始」流程（必備，2026-11-12 查程式發現的缺口）

Allen 問：所有救援都沒了，要怎麼重新建立？查 `settings-sync-vault-actions.js`：現有的「清除同步密碼」按鈕（`resetButton`）**一定要先輸入目前的同步密碼**，沒輸入就擋下並叫使用者去用「忘記同步密碼」，而那條路靠的就是伺服器的救援資料。伺服器端的 `delete` 動作其實允許「10 分鐘內 Email 登入過」就能清除，是頁面的按鈕沒有這條路。

結論：**拿掉伺服器救援之後，如果沒有這個流程，忘記密碼又沒有通行金鑰的人就真的卡死，不能重新設定同步密碼。** 所以它是必備，不是選配。

流程：
1. 設定 → 同步密碼 → 「無法救援，重新開始」（只在忘記密碼流程裡出現）。
2. 先用 Email 登入（10 分鐘內），不需要舊密碼。
3. 確認視窗寫明：舊的雲端 API 金鑰會被清除，要重新輸入；對話與資料不受影響。
4. 清除：雲端的 `vault_record`、`sensitive_config`、所有救援槽；本機的金鑰庫紀錄。
5. 使用者設新同步密碼（可立刻登記通行金鑰），重新輸入各家 API 金鑰，之後照常同步。

要查的（沒驗證）：
- 清掉本機金鑰庫後，雲端舊的 `sensitive_config` 如果沒一起清，其他裝置同步下來會「解不開」（`cloud-workspace-sync.js` 的 `No sync-vault key could decrypt`）；要確認清除時會把雲端那份一起清成空，以及其他裝置收到後的行為。
- 驗證器（C）登記後，這個「重新開始」要不要也要求 `aal2`：要，否則有 Email 的人能直接清掉別人的救援（登記了驗證器的帳號才適用）。
- 與「仍保有金鑰的另一台裝置」的關係：那台裝置不需要重新開始，直接用新同步密碼重建即可（§10 層次 1）。

### 11.1 做完了（2026-11-12，在 `staging`）

「無法救援，重新開始」已做：
- 位置：忘記同步密碼的 Email 驗證後出現的「重設同步密碼」面板，在「重設」按鈕旁（`sync-vault-start-over-btn`）。
- 流程：確認視窗 → 伺服器 `delete`（伺服器本來就允許 10 分鐘內 Email 登入過者不需舊密碼，**伺服器端沒有改**）→ 移除本機金鑰庫紀錄 → 排入 `vault` 與 `sensitive` 同步（本機沒有金鑰庫時，`prepareUpload` 對兩者都上傳 null，雲端的金鑰庫紀錄與加密的 API 金鑰就被清成空）→ 清掉救援狀態與網址參數 → 回到「建立同步密碼」畫面；本機還留著的 API 金鑰在新密碼建立後會用新金鑰重新加密上傳。
- Email 驗證過期（伺服器回 `current_password_required`）時，顯示「Email 驗證已逾時，請再按一次忘記同步密碼」，不動任何東西。
- 五語文字：`cloudSyncStartOver`、`cloudSyncStartOverConfirm`、`cloudSyncStartedOver`、`cloudSyncStartOverExpired`。
- 測試：`tests/settings-sync-vault-controls.test.js` 三個（成功、驗證過期、取消）。

沒驗證：
- 沒在瀏覽器實際看過畫面，也沒用真實帳號走過；要在 `staging` 用有雲端金鑰庫的帳號走一遍。
- 其他已登入的裝置收到「雲端金鑰庫被清空」之後的行為：讀程式看，`applyRemote` 收到空的 `sensitive_config` 會把那台裝置本機的金鑰設定也移除，所以其他裝置上的 API 金鑰可能也會被清掉（與既有「清除同步密碼」按鈕相同）；確認視窗只寫「要在各裝置重新輸入」。要在兩台裝置上實測。
- 驗證器（C）上線後，這個流程要加 `aal2` 條件（§11 第二點）。

## 12. 實作紀錄（2026-11-12，在 `staging`）

Allen 的決定：通行金鑰（B）與驗證器（C）一起做，iPhone 與電腦都要能用。

**P0／P1 做完：**
- `src/app/sync/vault-recovery-slots.js`：槽格式、HKDF-SHA-256 派生、AES-GCM 封存與開啟、換密碼重包、清單（上限 8、去重、移除）。純函式。
- `src/app/sync/passkey-prf.js`：`passkeyPrfAvailability`（yes／no／unknown）、`registerRecoveryPasskey`（登記，必要時再問一次取值）、`readAnyRecoveryPasskey`（一次問所有槽的通行金鑰，各用自己的鹽，回報是哪一把答的）。
- 測試 `tests/vault-recovery-slots.test.js`（8 個，假瀏覽器）。另外用 Playwright 的 Chromium 虛擬驗證器（PRF 開）跑過真實的 WebAuthn：登記兩把、任一把都能救回同步密碼、換一把的金鑰打不開另一個槽、同一把同一個鹽兩次取值相同、已存在的通行金鑰會被擋（`passkey-exists`）。這證明程式流程在 Chromium 能通，**不是** Face ID／Touch ID／Windows Hello／實體金鑰的實測。
- 查到：同一台裝置（或同步到同一個 iCloud 鑰匙圈的裝置）不能對同一把通行金鑰再登記一次（`excludeCredentials`），所以「第二把」要真的是另一個通行金鑰（另一個驗證器、另一個密碼管理員或實體金鑰）；同步到 iCloud／Google 的通行金鑰本來就在每台裝置上都能用。

**P2 做完（只寫檔，Allen 先套測試專案再套正式）：**
- `supabase/migrations/20261112100000_vault_recovery_slots.sql`：`recovery_payload` 可為空、新增 `slots jsonb`（陣列、最多 8、64 KB）、函式 `user_has_verified_totp()`（security definer，只回答本人）、三條 restrictive 規則（insert／update／delete）：有已驗證的 TOTP 因子的人，要 `aal2` 才能新增、改、刪救援資料；讀取不限制。
- 用 PGlite 真實 SQL 測：`tests/database/vault-recovery-slots.test.js`（6 個）；測試基礎 `tests/helpers/database/supabase-database.js` 加了 `auth.jwt()`、`auth.mfa_factors` 與 `asUser(id, claims)`。
- 測試抓到兩個我寫錯的地方：規則名稱超過 63 字元會被截斷，三條同名互相覆蓋（改短且各自不同）；restrictive 規則要綁本人的 `auth.uid()`（既有測試要求）。
- 行為提醒：被規則擋掉的 update／delete 不會報錯，只是 0 列受影響；頁面程式碼要檢查「改了幾列」，不能只看有沒有錯誤。insert 才會報錯。

**還沒做：**
- P3 通行金鑰畫面、P4 驗證器畫面與伺服器 `api/sync-vault-recovery.js` 的 `aal2` 檢查、P5 文字與政策。畫面版面要先給 Allen 看（AGENTS.md）。
- Allen 要確認兩個 Supabase 專案（正式 `clctveoosifoapbafhrl`、測試 `nnousccvghbkucloewrs`）的 Authentication → Multi-Factor 裡 TOTP 的「Enroll」與「Verify」是開的。

## 13. 「安全性與登入」頁（2026-11-12，Allen 的決定，S1 做完在 `staging`）

通行金鑰、驗證器、雲端同步密碼、登入密碼都放在新的設定頁「安全性與登入」（nav 在「使用者」之後）。「使用者」頁留下身分（頭像、Email、UID）與「登入方式」（綁定 Email、Google）。驗證器要能**手動輸入設定金鑰**，不只掃 QR（不是人人都能掃）。

S1 做完：
- `settings-user-section-markup.js` 拆成 `buildUserSectionMarkup` 與 `buildSecuritySectionMarkup`；登入密碼列與面板、雲端同步卡片（含忘記密碼、救援、重新開始）搬到安全性頁；元素 id 不變，所以既有處理器不用動。
- 新模組 `settings-security-page.js`（建頁與導覽項、顯示／隱藏密碼按鈕）；導覽、手機清單（含圖示）、側欄分組（`rail-panels.js`）、五語名稱 `securitySettings`、CSS（`user-settings.css` 兩頁共用）都接上。
- 訊息行：登入密碼與忘記同步密碼的訊息改顯示在安全性頁的 `security-message`；綁定 Email／Google 的訊息仍在使用者頁。
- 測試 5222 個全過；`settings-sync-vault-controls.js` 逼近大小預算（20.0 KB），所以頁面程式碼抽到新檔。

S2（驗證器）、S3（通行金鑰）在這一頁加卡片：
- 驗證器卡：登記時顯示 QR、設定金鑰（分組、可複製）與 `otpauth://` 連結（在手機上點一下就開驗證器 app），再輸入六位數確認；已啟用時顯示狀態與移除。
- 通行金鑰卡：已登記清單（名稱、日期、移除）與「新增通行金鑰」（要輸入同步密碼）。
- 忘記密碼面板：加「用通行金鑰救援」；有驗證器的人，重設、重新開始、新增或移除通行金鑰前要先輸入六位數。

## 14. S2 done: the authenticator app (2026-11-12)

- `src/app/runtime/settings/settings-security-authenticator.js`: Supabase TOTP factor. Setup draws the QR code, shows the setup key in groups of four with a copy button and an `otpauth://` link (for people who cannot scan), then six digits turn it on. Cancelling removes the unfinished factor. Removing it asks for the code first.
- `requireAal2()` is called before create, change, reset, recover and start over (`settings-sync-vault-actions.js`). When the session's `nextLevel` is `aal2` and the current level is not, the six digits are asked for; a client with no `auth.mfa`, or an account without a confirmed factor, is never asked.
- The server (`api/sync-vault-recovery.js`) answers `mfa_required` for store, recover and delete when the token's `aal` is not `aal2` and the account has a confirmed factor; the table's restrictive rules (migration `20261112100000`) are the second wall.
- Texts: 23 keys (`securityTotp*`, `securityMfa*`) in five languages. Tests: seven new in `tests/settings-sync-vault-controls.test.js`.
- Still to do: S3 (passkey card, "rescue with passkey" in the forgot panel, re-wrap on password change), P5 (texts, privacy policy, old-user reminder, retire the server slot after 2026-12-31 23:59 UTC+8). Allen: apply the migration (test project first) and turn on TOTP in both Supabase projects.

## 15. S3 done: the passkey card and the recovery with a passkey (2026-11-12)

- Files: `settings-security-passkey.js` (card, add, remove, update, collect secrets, keep recovery, recover), `settings-vault-recovery-slots-store.js` (the person's row in `user_vault_recovery`; a write no row accepts is an error, never "done"), `vault-recovery-slots.js` now keeps `recordFingerprint` (the vault record's `check`) in the open on each slot.
- Add: the person types the sync password (the vault does not keep it), the passkey is asked for **first** (the browser wants it right after the tap), then the password is checked, the slot is sealed in the browser and saved. The first passkey also drops the old server recovery (`recovery_payload = null`); a person with a passkey no longer has a copy the service can open.
- Change of the sync password: each passkey is asked for its secret before the change (the state is cached, so no network wait), the slots are sealed again with the new password after. A passkey that did not answer leaves its slot "needs update" (a fingerprint that is not the current record's) with a notice; "Update" on the card makes it current. Accounts with no slot keep the old server copy until the deadline.
- Forgot the password: the recovery panel shows "Recover with a passkey" when there are slots, and the old button only while a server copy exists. One tap opens the slot, a slot of an earlier password is refused (`recovery-slot-stale`), and the slot that opened is sealed again with the new password.
- Not verified on real devices (iPhone Face ID, Windows Hello, a security key): only the Playwright virtual authenticator (P0) and the tests with a fake passkey. Safari may want the tap to be fresh: the add flow asks the passkey first, and the cached state avoids a wait before it.
- Still to do (P5): the texts of the privacy policy and help center, the reminder for old users, retiring the server copy after 2026-12-31 23:59 (UTC+8) and removing `SYNC_VAULT_RECOVERY_KEY`.

## 16. 簡化版（Allen 2026-11-12 決定：三級確認、通行金鑰解鎖、Email 通知、金鑰庫 v2 一起做）

### 16.1 為什麼要簡化
S2、S3 做完後，「改什麼要什麼」散在每個動作裡（同步密碼、Email 10 分鐘、通行金鑰、6 位數混著用），換同步密碼還會讓通行金鑰的救援資料過期（「需要更新」）。根源是救援槽裡存的是**同步密碼本身**。

### 16.2 金鑰庫 v2：固定資料金鑰（DEK）
- 一把隨機的 256 位元資料金鑰（DEK）加密 API 金鑰（payload 格式不變：`version 1`、AES-GCM）。
- 同步密碼只負責「包」這把 DEK：`record = { version: 2, kdf: PBKDF2-SHA-256, iterations, salt, iv, wrappedKey, checkIv, check, createdAt }`。`wrappedKey = AES-GCM(PBKDF2(密碼, salt), DEK)`；`check = AES-GCM(DEK, 固定字串)`，用來驗證「拿到的 DEK 是不是這個金鑰庫的」。
- 通行金鑰救援槽也只包 DEK：`{ version: 2, type: 'passkey', …, ciphertext = AES-GCM(HKDF(PRF 密鑰), { key: DEK }) }`。
- **換同步密碼 = 用新密碼重包同一把 DEK**。資料不用重新加密、不用換代（`previousVaultKeys` 與 rotation 機制對 v2 用不到），**通行金鑰槽完全不受影響**：沒有「需要更新」、換密碼不用刷多次 Face ID。
- 忘記密碼用通行金鑰救援：開槽得到 DEK，用新密碼重包即可，不需要舊密碼。
- 用通行金鑰解鎖：開槽得到 DEK，驗證 `check`，直接解鎖。

### 16.3 從 v1 搬過來（不重新加密、不丟資料）
v1 的金鑰是 `PBKDF2(密碼, salt)` 直接當資料金鑰。**搬移時把這把 v1 金鑰當作 DEK**：已加密的雲端資料與備份檔完全不用動。
- 時機：v1 的紀錄在使用者輸入同步密碼成功解鎖時，當場換成 v2（新 salt、重包同一把金鑰）；本機另留一份 v1 備份（`chatSyncVaultV1Backup_v1_<username>`）。
- 備份檔裡的 v1 紀錄照樣能用密碼解（DEK 沒變），匯入不受影響。
- v2 紀錄會被雲端同步到各裝置；**還沒更新到新版的舊裝置看不懂 v2**（顯示無法解鎖，更新頁面即可）。
- 舊的救援槽（密碼加紀錄那種）只存在 staging，沒有真實使用者；格式直接換掉，舊格式被忽略。
- 舊的「伺服器救援」（`recovery_payload`，存 `{密碼, 紀錄}`）不受影響：v2 紀錄加同一個密碼照樣能解。

### 16.4 三級確認
- 日常：解鎖，只要同步密碼，或通行金鑰。
- 改設定（換同步密碼、新增通行金鑰）：要同步密碼（本來就要），不再疊別的。
- 危險動作（清除同步密碼、重新開始、移除通行金鑰、移除驗證器）：先「確認是你」一次。有驗證器就輸入 6 位數（伺服器和資料庫規則會擋，是真正的防護）；沒有驗證器但有通行金鑰就用通行金鑰（只在畫面上確認，擋不了被偷走的登入憑證）。10 分鐘內不再問。
- 忘記同步密碼：Email 驗證後，通行金鑰救援，或重新開始。新使用者不再產生伺服器那份救援；已有的人保留到截止日或新增通行金鑰時移除。

### 16.5 Email 通知
新增或移除通行金鑰、設定或移除驗證器、清除或重新開始同步密碼時，寄英文信到帳號 Email，樣式沿用現有信件。

## 17. §16 做完了（2026-11-12，在 `staging`）

- **金鑰庫 v2**（`src/app/sync/sync-vault.js`）：紀錄 `version: 2`（`wrappedKey`、`checkIv`、`check`），舊 v1 在輸入同步密碼成功解鎖時就地升級（同一把金鑰，已加密的資料與備份檔不用動，本機留 `chatSyncVaultV1Backup_v1_<username>`）。換密碼只重包同一把金鑰（不再有 rotation、`previousVaultKeys`）。新函式：`openSyncVaultRecordKeyBytes`、`verifySyncVaultKeyBytes`、`unlockSyncVaultWithKeyBytes`、`resetSyncVaultPasswordWithKeyBytes`、`createLegacySyncVaultRecord`（給測試）。
- **救援槽 v2**（`vault-recovery-slots.js`）：槽只存資料金鑰，格式 `version: 2`；舊格式（存密碼加紀錄，§15）只在 staging，直接被忽略。§15 的「需要更新」「換密碼時每把確認一次」整段作廢。
- **通行金鑰解鎖**：解鎖面板的「用通行金鑰解鎖」，開槽後用 `check` 驗證是這個金鑰庫的金鑰；別的金鑰庫的槽會被拒絕（`vault-key-mismatch`）。
- **確認規則**（`settings-identity-confirmation.js`）：危險動作（清除、重新開始、移除通行金鑰、移除驗證器）確認一次，有驗證器要 6 位數（`requireAal2`），沒有但有通行金鑰就點一下通行金鑰，10 分鐘內不再問；新增通行金鑰、換密碼只要同步密碼（有驗證器時資料表仍要 aal2，所以新增通行金鑰會先問驗證碼）。
- **新金鑰庫不再產生伺服器那份救援**；已有的人換密碼時仍更新它，新增第一把通行金鑰時移除它。
- **Email 通知**（`server/security-notices.js`，`POST /v1/security-notice`）：用 `server/mail-layout.js` 的樣式、英文，只寄給 token 對應帳號的 Email（請求裡的任何地址都不採用），每帳號每小時最多 10 封；事件：`passkey-added/removed`、`authenticator-added/removed`、`sync-password-changed/reset/cleared`、`sync-started-over`。**限制**：由頁面在動作完成後通知，所以偷到登入憑證的人若不經過 Noureon 的頁面直接打 Supabase 就不會觸發；驗證器的新增與移除另可在 Supabase 的 Auth 通知信設定打開伺服器端通知。
- 部署：這次改了 `server/`，要重新部署伺服器；不需要新的 migration。

## 18. 手機回饋後的修正（2026-11-12 晚，在 `staging`）

- 通行金鑰的名字改成「設備＋瀏覽器」（`src/app/runtime/security/device-name.js`，例如 `iPhone · Safari`、`Mac · Chrome`；瀏覽器不會透露手機型號，所以只到這個程度；同一種第二把加編號）。這個模組伺服器也用（已列入 `scripts/server-shared-modules.json`）。
- 通知信多了來源三行：`Device`（從請求的 User-Agent）、`Location`（有 Cloudflare 的 `CF-IPCity`／`CF-IPCountry` 標頭時才有，想要城市要在 Cloudflare 開「Add visitor location headers」）、`IP address`（`clientAddress`，取代理伺服器寫的最後一個）。都從請求本身讀，不信請求內容裡自報的；只放進信裡，不保存。隱私政策與協助中心五語已補（含 §6 的截止日說法與 `PRIVACY.md`）。
- 新事件：`login-password-changed`、`signed-out-others`。
- 安全性頁新增「登入的裝置」卡片：「登出其他所有裝置」（`supabase.auth.signOut({ scope: 'others' })`，這台不受影響；屬於需要確認一次的動作，會寄通知信）。登入密碼卡片原本就有「連同這台一起登出所有裝置」的選項。
- 手機設定頁的標題：`language-apply.js` 重畫語言時用桌面選單的 active 項目當標題，所以在「安全性與登入」會變成「個人化」；改成以目前打開的 `.settings-section.active` 為準。
- 換密碼、清除、重設、重新開始、用通行金鑰解鎖之後，頁面回到同步密碼那一格（表單收起來後下面的內容會往上跑，原本停在通行金鑰卡片）。

## 19. 登入的裝置與頁面瘦身（Allen 2026-11-12 深夜）

- **登出統一成一個**：「登出所有裝置」（`signOut({ scope: 'global' })`，這台也登出，頁面重新載入）。「登出其他裝置」拿掉，事件 `signed-out-others` 改成 `device-signed-out`。
- **登入的裝置清單**：安全性頁一列「登入的裝置」，點開列出每個已登入的裝置（設備與瀏覽器、最近使用時間、IP），每個（除了這台）可個別登出。資料不用我們自己記：登入服務的 `auth.sessions` 本來就有每個裝置的 User-Agent 與 IP，用兩個 security definer 函式讀與刪（`supabase/migrations/20261112110000_list_and_revoke_my_sessions.sql`：`list_my_sessions()`、`revoke_my_session(uuid)`，只回答自己的、不能登出這台、有驗證器要 aal2）。刪掉那一列後它的 refresh token 就失效；已發出的 access token 最多撐到過期（約一小時），Noureon 伺服器每次請求都問登入服務，所以對伺服器的請求立刻失效。
- **裝置型號**：瀏覽器不會告訴網頁手機型號（iPhone 一律不給，Android 的 Chrome 也改成只給 `K`），所以只到「設備種類＋瀏覽器」；Android 瀏覽器若還給型號（例如 `Pixel 8`），就用型號。
- **瘦身**：通行金鑰、驗證器各縮成一列（說明一行、右邊一顆按鈕），新增通行金鑰的同步密碼欄收起來、按「新增」才展開，名稱欄與提示拿掉（名稱用預設，之後可「改名」），驗證器的設定畫面只有設定時才出現，頁尾說明拿掉。
- 要套用的 migration：`20261112110000_list_and_revoke_my_sessions.sql`（先測試專案，再正式專案）。

## 20. 手機設定頁的互動方式（Allen 2026-11-13，參考大廠 app 的設定頁；電腦版不變）

- **分類**：手機設定清單分四組：帳戶（使用者、安全性與登入）、自訂 Noureon（個人化、記憶管理、模型管理、可呼叫的模型）、應用程式設定（資料管理、隱私、權限、輔助功能、垃圾桶）、取得協助（關於）。表在 `settings-mobile-metadata.js`，新增或搬動項目只改這張表（組名要五語）。
- **安全性與登入頁**：手機上是一張短清單，小標題（登入／額外保護／工作階段）下各一列（登入密碼、雲端同步、通行金鑰、驗證器、登入的裝置），點一列把那張卡片單獨當成一頁打開，標題列顯示該頁名稱，左上箭頭先回清單再離開。卡片、按鈕與 id 都沒變，`settings-security-pages.js` 只決定哪一張在畫面上（section 的 `data-page`，樣式在 `user-settings.css` 的 768px 以下）。列跟著卡片的 `hidden` 走（沒登入雲端帳號時沒有通行金鑰列），驗證器的六位數詢問卡不受影響、永遠在最上面。
- **其他長頁**：模型管理與隱私同樣把每張卡片收成一列、點開才看內容（`settings-card-pages.js` ＋ `settings-card-pages.css`；頁面重畫（隱私頁換語言會重畫）後仍停在原本那頁）。清單在 `SECTIONS`，要加別的頁只加 id（該頁的卡片要是 `.pz > .pz-card`，標題在 `.pz-head`）。
- **列上的動作**：通行金鑰列右邊是 ⋯ 選單（改名、移除）；裝置列右邊是登出圖示（`settings-row-menu.js`）。

## 21. 回饋 2026-11-13（第二批）

- **登出裝置不再要第二道確認**：單一裝置登出、登出所有裝置都只問一次「確定嗎」（`window.confirm`），不要通行金鑰也不要驗證器六位數；`revoke_my_session` 因此拿掉 aal2 檢查（那支 migration 還沒套用，直接改原檔）。三級確認規則裡「登出裝置」從危險動作清單拿掉。
- **登出裝置的通知信**：`device-signed-out` 的信多兩行「Signed-out device: 設備名稱」「Signed-out device IP address」（頁面把被登出那列的名稱與 IP 放在 `target`，伺服器只收字串、清掉換行、IP 要像位址才收），原本的來源三行改成「This was done from:」底下。登出所有裝置只寄一封 `signed-out-all`（登入密碼更新時勾「登出所有裝置」也只寄 `login-password-changed` 一封）。
- **減少動態效果**：輔助功能頁新增一張「動態效果」卡片，一個開關，設定 `reduceMotion`（`'system'` 跟隨裝置，`'on'` 強制減少，跟著帳號同步，同時鏡像在 localStorage `noureon-reduce-motion`）。開啟時 `html[data-motion="reduced"]`：`layout.css` 把所有 transition／animation 時間設為 0，`public/theme-init.js` 在第一次繪製前標記並讓 `matchMedia('(prefers-reduced-motion: reduce)')` 回答 true（頁面上二十幾處 JS 都是這樣問的）。程式在 `src/app/ui/motion/motion-preference.js`。沒做「強制完整動態」：二十幾個樣式檔各自有 `@media (prefers-reduced-motion)`，沒辦法從 JS 蓋掉。
- **短頁也能下拉回彈**：手機設定的細節頁最少比畫面高 1px（`settings-mobile.css`），iOS 才會讓內容少的頁面也能拉開再彈回。
- **筆記管理頁**：不再是有框的卡片（`mn-page` 去框去底），返回、標題、搜尋、分類列包在 `.mn-sticky`，往下滑時留在最上面。
- **欄位焦點框**：欄位失去焦點時框立刻消失（`layout.css`：未聚焦的輸入欄 `transition-duration: 0s`，聚焦時仍淡入）。

## 22. 回饋 2026-11-13（第三批）

- **手機關閉設定**：原本整個視窗用所有對話框共用的 150ms 淡出，而頁面滑下去要 320ms（`typography.css`），淡出把滑動砍掉一半，看起來像直接消失。現在關閉時（`settings-mobile.css`）視窗不淡出、背景透明，整頁完整滑下去露出聊天畫面，滑完才收起。
- **手機點空白處關側邊欄**：`toggleSidebar(false)` 在點遮罩或選對話時，另外用瀏覽器自己的動畫（`ui/motion/exit-animation.js` 的 `playExit`）播一次滑出與遮罩淡出，iPhone 的瀏覽器對「用 script 同一格改樣式」的 CSS 過渡有時不顯示。手指滑開的路徑照舊（面板從手指放開的位置接著走）。
- **下拉選單的藍色焦點框**：選好之後欄位會一直握著焦點，藍框不消失。`ui/forms/select-blur.js` 在 `change` 時把焦點移開，框立刻不見。

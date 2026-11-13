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


## 23. 停掉舊救援（Allen 2026-11-13，金鑰保護計畫 ①）

- **決定**：伺服器用一把全站金鑰（`SYNC_VAULT_RECOVERY_KEY`）加密保存同步密碼副本的舊救援，整條拿掉，不再留到 2026-12-31。忘記同步密碼之後只剩兩條路：通行金鑰救回（槽格資料在瀏覽器封存），或重新開始。
- **程式**：`api/sync-vault-recovery.js`、`settings-vault-recovery-client.js` 和它們的測試刪除。「忘記同步密碼」不再寄 Email，只是在頁面打開救援面板（`recoveryOpen`，只在記憶體）；面板裡：有通行金鑰時是新密碼欄位＋「用通行金鑰救援」（通行金鑰本身就是確認），沒有時只說明無法救援、只能重新開始；兩者都有「重新開始」與「取消」。這一流程的人機驗證（Turnstile）也一併拿掉。
- **重新開始與清除同步密碼**：原本呼叫伺服器函式刪那一列（伺服器以「剛用 Email 登入」或「目前同步密碼」當證明）。現在由頁面直接刪自己那一列（`settings-vault-recovery-slots-store.js` 的 `remove()`，資料表規則本來就只讓本人刪，有驗證器時還要 aal2）；證明是三級確認規則（有驗證器要六位數，否則有通行金鑰時要點一下通行金鑰）。清除同步密碼另外在頁面先用輸入的目前同步密碼驗證一次（過去沒有通行金鑰的帳號時伺服器根本沒檢查）。**取捨**：沒有驗證器、也沒有通行金鑰的帳號，重新開始不再需要「剛用 Email 登入」這個證明；被偷的登入狀態可以清掉雲端金鑰庫（資料遺失，不是外洩），而且擁有者會收到「重新開始」的安全通知信。
- **資料庫**：`supabase/migrations/20261113000000_retire_server_vault_recovery.sql` 把所有 `recovery_payload` 清成空，並加上檢查，之後這欄只能是空。Allen 先套測試專案，再套正式專案。
- **Allen 要做的**：套 migration；伺服器與頁面部署後，到 Vercel 刪環境變數 `SYNC_VAULT_RECOVERY_KEY`，不留任何副本。
- **文字**：隱私政策、協助中心五語和 `PRIVACY.md` 已改成「Noureon 不保存服務端打得開的同步密碼副本」；舊的「2026 年 12 月 31 日前仍可用 Email 復原」說法拿掉。

## 24. 金鑰保護計畫 ②③（Allen 2026-11-13）

- **② SVG 一律用 data: 網址**：圖片卡片的 `<img>` 與下載連結、檔案預覽裡的 SVG，不再用 `blob:` 網址（`generated-image-assets.js` 的 `pictureUrlOf`、`file-preview-dialog.js`）。SVG 是可以帶腳本的文件，`blob:` 網址在新分頁開會是 app 同源的頁面；`data:` 網址瀏覽器不會當成頁面打開，`<img>` 裡也不執行腳本。正式站的 CSP 強制後，這個洞還有第二層擋（新分頁的 inline script 會被擋），這一層是不靠 CSP 的。
- **③ 伺服器每人一把衍生金鑰**：`server/key-vault.js` 不再直接用主金鑰封存，而是用 HKDF-SHA256（主金鑰，context 含使用者 ID）算出每人專屬的金鑰，封包前綴改 `nk2`；舊的 `nk1`（主金鑰直接封存）照常能開。呼叫的地方不用改（都已帶 userId）。命令工具憑證在被讀取時，若不是現行格式，會重新封存並寫回（寫入帶舊封包當條件，期間被改過就不寫）；連接器權杖在下次更新權杖時自然換成新格式。不需要設定任何環境變數。**如實說明**：主金鑰外洩的話，所有人的金鑰都能算出來，這一層擋的是單一使用者金鑰或單一封包出事不連累別人。

## 25. 金鑰保護計畫 ④：本機 API 金鑰預設無感加密，同步解鎖記住（Allen 2026-11-13）

- **做法**：`src/app/runtime/security/local-key-seal.js`。每台裝置由瀏覽器自己產生一把 AES-256-GCM 金鑰，`extractable: false`，存在另一個 IndexedDB（`NoureonDeviceKey`），內容不在任何檔案、備份或儲存空間傾印裡，網頁腳本也讀不到位元組，只能請瀏覽器用它。放在**儲存層**（`storage-adapter.js`）：`chatSensitiveConfig_v1_*`（API 金鑰）與 `chatSyncVaultRemembered_v1_*`（記住的解鎖）寫入時自動封存（`nd1.<iv>.<密文>`，儲存的鍵名當作認證資料，搬到別的鍵名就打不開），讀出時自動解開。所以敏感設定儲存、雲端同步、設定頁都不用改，也不知道。
- **舊的明文**：第一次讀到時照原樣讀出，背景自動改封存。**不支援的瀏覽器**（私密視窗、沒有 IndexedDB 或 Web Crypto）：API 金鑰維持原樣（明文，不擋使用）；記住的解鎖則**不保存**（必須封存才能存）。**解不開**（裝置金鑰不見，例如瀏覽器只清了一部分資料）：讀成沒有金鑰，並跳一次提示「這台裝置上保存的 API 金鑰讀不到，請從雲端同步取回，或重新輸入」。
- **記住同步解鎖**：同步保險庫用同步密碼或通行金鑰解鎖後，資料金鑰（封存後）存在這台裝置，下次開啟同步時自動解開（`cloud-workspace-sync.js` 啟動時呼叫 `restoreRememberedSyncVault`，讀出後會用保險庫紀錄驗證，不是這個保險庫的金鑰就丟掉）；按「鎖定」、登出、移除保險庫、刪除帳號資料時清掉。進階保護（⑤）開啟時用 `setSyncVaultRememberPolicy` 關閉這一層。
- **如實說明的限制**（設定與隱私政策五語都寫了）：擋的是複製瀏覽器資料夾、備份檔、儲存空間傾印；擋不了已被入侵的頁面（那種頁面可以請瀏覽器用這把金鑰，跟 app 一樣）。這一層是 CSP 與進階保護的補充，不是取代。
- **實測**：Chromium 裡確認舊明文被讀出並自動封存、磁碟上看不到金鑰字串、第二個轉接器能讀、裝置金鑰 `exportKey` 失敗（`InvalidAccessError`）。

## 26. 金鑰保護計畫 ⑤⑥：進階「本機金鑰保護」、金鑰頁提醒（Allen 2026-11-13）

- **範圍**：只給「有同步密碼、有通行金鑰、瀏覽器能用通行金鑰」的雲端帳號。設定在「安全性與登入」的「額外保護」組，一列「本機金鑰保護」：開關、「多久重新認證一次」（每次開啟／1／3／7／14／30 天，預設 7）、「現在鎖定」。開關不能用時卡片寫原因（沒有同步密碼、沒有通行金鑰、瀏覽器不支援、保險庫鎖著）。開或關都走三級確認（驗證器六位數，否則通行金鑰一點）。選擇只存這台裝置（localStorage `noureonLocalKeyProtection_v1_<使用者>`，沒有秘密），不同步。
- **做法**（`security/local-key-protection.js`）：開啟時用裝置金鑰讀出 API 金鑰，改用**同步保險庫的資料金鑰**封存（`nv1.<iv>.<密文>`，在 `local-key-seal.js` 裡，鍵名當認證資料），並讀回確認一樣才算成功，失敗就復原。保險庫鎖著時資料金鑰不在記憶體，所以金鑰讀不到。關閉則相反。
- **解鎖與天數**：解鎖（通行金鑰或同步密碼）後，資料金鑰依天數記在這台裝置（封存的，含到期時間；`sync-vault.js` 的記住解鎖加上到期）；「每次開啟」不記，重新載入就鎖；到期後下一次啟動（或頁面開著時每 5 分鐘與回到前景時檢查）就鎖。進階保護開啟時，「記住解鎖直到登出」那一層改依這個天數（`setSyncVaultRememberPolicy` 預設讀這個選擇）。
- **鎖著不是「沒有金鑰」**：儲存層讀到鎖著的金鑰會丟 `local-keys-locked`，不是回 null。所以：敏感設定儲存讀不到就當作沒有，**不會寫任何東西蓋過**；雲端同步 `prepareUpload`／`reconcileKind` 遇到鎖著就等待，**不會把「空」上傳去刪掉雲端金鑰**；鎖著時使用者輸入的金鑰留在記憶體，解鎖後併入再存。
- **第一次用到才解鎖**（`security/local-key-runtime.js`，只在雲端帳號啟動）：右上角小鎖頭（鎖著才顯示，點一下解鎖）；送出訊息（捕獲 `chat-form` 的 submit，解鎖後同一則自動再送）、碰到金鑰欄位、儲存金鑰時，跳出解鎖視窗（通行金鑰按鈕、同步密碼欄位、取消）。背景功能（自動命名、記憶整理、額度圈）鎖著時安靜略過，不會跳視窗。**已知風險**：用到金鑰的地方有 41 個檔案、130 處，這裡只擋了「使用者動作的入口」；沒擋到的入口表現是「像沒有金鑰」，再做一次動作才跳出。要在 iPhone 上實測。
- **配套**：開著保護時不能移除最後一把通行金鑰（`keyguard-needs-passkey`）；清除同步密碼或重新開始前先把金鑰放回裝置金鑰封存（保險庫開著）或丟掉（鎖著，雲端金鑰本來就清掉），並關閉保護（`releaseKeysBeforeVaultRemoval`、`removeSyncVault` 也清選擇）。
- **⑥**：「API 金鑰管理」卡片加五語提醒「到供應商後台設用量上限、用權限最小的金鑰」（`apiKeyLimitReminder`）。洩漏測試（`tests/security/local-key-protection.test.js`）：開、關、鎖、解鎖各狀態下，儲存層、localStorage、事件裡都沒有金鑰或同步密碼的明文。伺服器端清除金鑰字串的路徑本來就有測試；「模型自己把金鑰說出來」只能測這條，沒辦法保證所有情況。
- **沒做**：保護開關開啟／關閉時不寄安全通知信（要改伺服器的事件清單，另開）。

## 27. 本機金鑰保護跟著帳號同步（Allen 2026-11-13）

- **要求**：開關與「多久重新認證一次」跨裝置同步。
- **做法**：選擇是設定 `localKeyProtection`（`{ on, days }`，或沒選過時 `null`；`security/local-key-policy.js`，沒有 import，伺服器的設定正規化也讀它，所以在 `scripts/server-shared-modules.json` 的清單裡，待 Allen 確認）。它沒有祕密，跟其他設定一起上雲、逐項用時間戳合併（`data/settings-merge.js`），最近一次的更改勝出。各台裝置「實際做了什麼」仍存在本機（`local-key-rules.js`），因為金鑰是在各台裝置上封存的；金鑰本身不會因此上傳。
- **各裝置怎麼跟**（`security/local-key-policy-sync.js`，由 `local-key-runtime.js` 在同步開好之後啟動，只給雲端帳號）：①這台裝置改了保護（事件 `noureon:local-keys-changed`）→ 把結果寫進設定；②設定從別台來了、或解鎖了同步保險庫 → 這台照設定開啟、關閉或改天數。開啟與關閉要重新封存金鑰，需要保險庫開著；鎖著就什麼都不動，等解鎖後再做（設定卡片會寫「另一台裝置更改了這項保護；解鎖同步保險庫後，這台裝置會跟著更改」）。開啟還要求帳號有同步密碼與通行金鑰。
- **舊裝置**：這台已開保護、設定裡還沒有選擇（功能出現前開的）→ 以這台的選擇當第一次的選擇寫進設定。
- **取捨**：有帳號寫入權限的人可以把「開」改成「關」，各裝置解鎖時就會改回裝置金鑰封存。保護擋的是裝置被偷或被複製，不是雲端帳號被入侵；這個同步沒有放寬後者的防線，但要在報告裡如實告訴 Allen。
- **隱私政策**五語那句「這個設定只存在這台裝置，不會同步」已改成「開關與天數跟帳號同步，其他裝置解鎖後跟著；金鑰本身仍各自封存」。

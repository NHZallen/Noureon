# Noureon 安全優化與修復計畫書（優化版）

## 文件資訊

| 項目 | 內容 |
|---|---|
| 專案 | Noureon |
| 評估基準版本 | 16.4.5 |
| 文件版本 | 2.0 |
| 更新日期 | 2026-07-12 |
| 適用範圍 | 前端 DOM、備份匯入、P2P、雲端同步、IndexedDB 敏感設定、API 代理、同步密碼復原、Supabase、部署安全設定與測試 |
| 文件目的 | 將已確認漏洞、架構風險、待驗證事項及預防性要求分開管理，提供可執行、可驗收、可回復的修復順序 |

## 1. 執行摘要

目前最優先風險是：外部或持久化資料可未經完整 schema 驗證進入多個 `innerHTML` sink，形成儲存型 XSS 攻擊鏈。P2P、備份及雲端資料都應視為不可信來源。

在儲存型 XSS 與資料邊界修復完成前，不建議於 Noureon 保存高額度、主帳號或正式用途 API Key。改成 session-only 只能降低持久化及瀏覽器關閉後的暴露風險，不能阻止同源 XSS 讀取記憶體、應用狀態或攔截請求。

整體修復技術上可行，不需全面重寫，但應拆成以下交付批次：

1. 緊急控制與已確認 XSS 修復。
2. 統一的外部資料 schema、大小限制與圖片內容驗證。
3. API 身分驗證、request schema、body limit、速率限制及隱私揭露。
4. API Key 保存策略、既有明文資料遷移及 Recovery 架構重設計。
5. CSP、RLS、CI 與正式環境驗證。

## 2. 證據分級與用語

本計畫使用以下證據狀態，避免把尚未證實的防禦缺口寫成已確認漏洞：

| 狀態 | 定義 |
|---|---|
| 已確認漏洞 | 原始碼已顯示可疑來源抵達危險 sink，且具合理利用條件 |
| 已確認安全缺口 | 已確認缺少必要控制，但尚未完整證明可利用結果 |
| 架構／信任風險 | 架構本身不必然不安全，但增加站方可接觸敏感資料、營運或合規責任 |
| 待正式環境驗證 | 倉庫無法證明線上部署、Dashboard、CDN、WAF、日誌或資料庫實際狀態 |
| 預防性要求 | 為降低未來利用與回歸風險而加入，尚未認定為可利用漏洞 |

## 3. 風險登錄表

| 編號 | 風險 | 類型 | 等級 | 優先級 | 證據狀態 |
|---|---|---|---:|---:|---|
| R1 | Noura、資料夾、封存對話資料直接進入 `innerHTML` | 儲存型 XSS | Critical | P0 | 已確認漏洞 |
| R2 | P2P、備份及同步資料缺少一致的 schema、長度、URL 與資源限制 | 不可信資料邊界 | High | P0 | 已確認安全缺口，並可連接 R1 |
| R3 | API Key 以明文 JSON 寫入瀏覽器持久層 | 敏感資料保存 | High | P1 | 已確認安全缺口 |
| R4 | 使用者供應商 Key 經 Noureon 代理 | 信任、隱私與營運風險 | High | P1 | 已確認資料流；代理本身不等於漏洞 |
| R5 | Recovery 使用全站共用伺服器金鑰，可集中解密 recovery payload | 金鑰治理／架構風險 | High | P1 | 已確認架構風險 |
| R6 | Recovery 近期驗證主要依賴 JWT `iat`，未驗證 AMR 方法發生時間 | 身分驗證流程 | High | P1 | 已確認安全缺口 |
| R7 | API 代理缺少 Noureon 使用者驗證、速率限制與 request schema | API 濫用防護 | High | P1 | 已確認安全缺口 |
| R8 | 倉庫與 `vercel.json` 未定義安全 Header／CSP | 縱深防禦 | Medium | P1 | 倉庫已確認；正式環境待驗證 |
| R9 | 安全測試未覆蓋全部外部來源、DOM sink 與部署控制 | 回歸風險 | Medium | P0 | 已確認安全缺口 |
| R10 | 危險物件鍵未在外部資料邊界統一拒絕 | 原型污染防禦 | Medium | P1 | 預防性要求；尚未證明完整利用鏈 |
| R11 | 頭像 `data:` 與 ZIP 圖片未做完整內容級驗證 | 檔案內容驗證 | High | P0 | 已確認安全缺口 |

## 4. 已確認技術事實

### 4.1 DOM sink

下列欄位已確認直接插入 HTML：

- Noura 名稱與 `avatarUrl`。
- 資料夾名稱。
- 封存對話的 `conv.title`、`conv.summary` 與 `conv.id`。

`conv.title` 與 `conv.summary` 是直接 HTML 注入面。`conv.id` 位於帶引號的 attribute 中，若沒有固定格式與長度限制，可能形成 attribute injection；三者應分別測試，不應假設利用條件完全相同。

專案存在大量 `innerHTML`，但不能將每一處都視為漏洞。應依資料來源分成：

1. 靜態可信模板。
2. 已集中 sanitization 的 rich HTML。
3. 使用者或外部資料可達的 sink。
4. 尚未完成來源追蹤的 sink。

### 4.2 P2P 與匯入

P2P 流程目前會解壓 ZIP、執行 `JSON.parse()`、修改少量 ID，然後直接寫入應用資料並渲染。尚未形成一致的 schema、總大小、檔案數、解壓後大小、巢狀深度及 URL 驗證邊界。

### 4.3 API Key

專案已有敏感設定 store、遮罩及匯出 redaction，但持久化時仍會將 `apiKeys` 以明文 JSON 寫入儲存層。畫面遮罩不等於靜態資料保護。

### 4.4 API 代理

NVIDIA、StepFun 與 Tavily 代理會接收瀏覽器送來的供應商 Authorization 並轉送上游。這是已確認資料流，不應單獨描述為漏洞。實際安全缺口是：

- 缺少 Noureon 使用者驗證。
- 缺少每使用者／IP 的速率限制。
- 缺少 request schema 與欄位 allowlist。
- NVIDIA、StepFun 目前 25 MB body limit 過大。
- 尚未確認日誌、APM 及錯誤追蹤是否排除敏感 Header／body。
- UI 與隱私文件未充分揭露 Key 的傳輸與站方可接觸範圍。

### 4.5 Recovery

Recovery 使用單一 `SYNC_VAULT_RECOVERY_KEY` 進行 AES-256-GCM 加解密。若資料庫與環境金鑰同時外洩，存在批次解密能力。近期驗證檢查 JWT `iat` 及 AMR 方法名稱，但未確認指定 AMR 方法本身的驗證時間。

### 4.6 Supabase 與部署

倉庫中的 migration 已包含 RLS、`auth.uid() = user_id` policy 及 anon 權限撤銷。但正式 Supabase 專案是否套用全部 migration、是否存在 Dashboard 手動變更，仍須連線正式環境驗證。

倉庫與 `vercel.json` 未定義安全 Header。正式站是否由 Vercel Dashboard、CDN、WAF 或反向代理補上，必須檢查線上 HTTP 回應，不能只由原始碼下結論。

## 5. 修復原則

1. 所有備份、P2P、雲端同步、API 回應及伺服器回傳資料均視為不可信。
2. 純文字使用 `textContent` 或 `value`；DOM 使用 `createElement()` 與安全 property 建立。
3. 僅必要的 rich HTML 可經集中 sanitization policy 後渲染。
4. 驗證必須在資料進入持久層前完成，不能只在顯示時 escape。
5. 所有資料來源共用同一組 schema 與 normalizer，避免入口間規則漂移。
6. 加密、CSP 與 session-only 都是縱深防禦，不能取代 XSS 修復。
7. 代理架構必須明確說明資料流、信任邊界、日誌政策及責任歸屬。
8. 每項變更都要有回歸測試、觀測方式及回復方案。

## 6. 分階段執行計畫

### 階段 0：立即風險控制（0–24 小時）

#### 工作項目

1. 以遠端設定或緊急版本暫停不可信 Noura 匯入與 P2P 接收；若做不到，加入醒目風險警告。
2. 暫停或改為明確選配的同步密碼復原。
3. 提醒使用者只使用低額度、可撤銷、有每日上限的獨立 API Key。
4. 對曾匯入陌生備份或 P2P 資料的使用者提供 Key 輪替與 Session 登出指引。
5. 盤點正式站回應 Header、Supabase migration、Vercel secrets、CDN、APM 與日誌保存。

#### 驗收標準

- 高風險入口可以停止或降級。
- 已形成正式環境 Header、RLS、Secret 與日誌盤點紀錄。
- 使用者保護公告已準備完成。

### 階段 1：修復已確認 XSS（第 1–4 天）

#### 工作項目

1. 將 Noura、資料夾及封存對話文字改用 `textContent`。
2. 將資料 ID 設入 `dataset` property，而不是插入 HTML attribute 字串。
3. 頭像使用 `createElement('img')`，並在設置 `src` 前通過集中 URL／內容驗證。
4. 對所有已知 sink 建立來源追蹤表，標明可信模板、sanitized rich HTML 或不可信資料。
5. 不以全域正規表示式批次替換 `innerHTML`；逐處確認功能與資料來源。

#### 必要測試

- `</span><img src=x onerror="window.__xss=1">`
- `<svg onload="window.__xss=1"></svg>`
- `javascript:alert(1)`
- 含雙引號、單引號、反引號及控制字元的 ID／名稱。
- 從 P2P、備份、雲端同步及既有 IndexedDB 載入後重複測試。

#### 驗收標準

- payload 只能以文字顯示，不能建立事件 handler 或可執行節點。
- Noura、資料夾、封存對話功能與排序無回歸。
- 已確認的外部資料 sink 均有測試。

### 階段 2：統一外部資料邊界（第 3–10 天）

#### Schema 要求

對 Noura、資料夾、對話、訊息、設定與 workspace 定義版本化 schema：

- ID：固定 UUID 或明確格式，限制長度。
- 名稱與標題：字串、trim、最小／最大長度。
- 描述、summary、prompt：分欄位限制字元與位元組大小。
- enum：只接受 allowlist。
- 陣列：限制項目數量。
- 物件：限制巢狀深度與總欄位數。
- 額外欄位：明確選擇拒絕或移除。
- 危險鍵：拒絕 `__proto__`、`prototype`、`constructor`。

危險鍵拒絕屬預防性要求。目前雖有外部設定進入 `Object.assign()` 的路徑，但尚未確認能污染全域 prototype 或形成具安全影響的完整利用鏈。

#### ZIP／JSON 資源限制

- 原始上傳大小。
- ZIP entry 數量。
- 單檔壓縮及解壓後大小。
- 全部 entry 解壓後總大小。
- 壓縮比異常門檻。
- JSON 最大字元／位元組數、巢狀深度及陣列數量。
- 拒絕路徑穿越、重複必要檔名及不在 allowlist 的檔案。

#### 資料遷移

1. 新資料全部通過新 schema。
2. 舊資料讀取時執行版本化 normalizer。
3. 無法安全正規化的記錄進入隔離狀態，不自動渲染。
4. 遷移保留備份並可回復。

#### 驗收標準

- 所有外部入口共用同一驗證核心。
- 異常資料不寫入持久層。
- 舊版本資料有明確相容與隔離策略。

### 階段 3：頭像與 `data:` 圖片內容驗證（第 5–10 天）

#### 允許格式

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`：僅在產品確實需要 GIF／動畫時保留

#### 驗證流程

1. 限制 ZIP entry 與 Base64 解碼後大小。
2. 驗證 Base64／binary 解碼成功。
3. 依 magic bytes 判斷實際格式。
4. 驗證宣告 MIME 與內容一致。
5. 使用圖片解碼器實際解碼。
6. 限制最大寬、高、總像素及必要時的 GIF 幀數。
7. 拒絕 SVG、XML、HTML 及其他 active content。
8. 優先將解碼後圖片重新編碼為 PNG、JPEG 或 WebP，再保存及渲染。

只檢查字串前綴、副檔名或 ZIP 路徑不足以證明內容安全。若使用 canvas 重編碼，需接受 GIF 動畫遺失；若保留動畫，必須加入專用 GIF 資源限制。

### 階段 4：API 代理保護（第 2–3 週）

#### 工作項目

1. 驗證 Supabase access token，確認 issuer、audience、expiry 與 user ID。
2. 每支 API 建立 request schema、模型／欄位 allowlist 與合理長度限制。
3. 將一般文字請求 body limit 降至 256 KB–1 MB；大型媒體使用獨立上傳流程。
4. 加入每使用者與 IP 的分散式速率限制。
5. 加入 timeout、上游錯誤分類、有限重試與 circuit breaker。
6. 對錯誤訊息做收斂，不回傳底層敏感細節。
7. 日誌只記錄 request ID、雜湊 user ID、狀態碼、延遲、供應商與錯誤類別。
8. 禁止記錄 Authorization、Cookie、API Key、完整 prompt、同步密碼與 recovery payload。
9. 更新 UI 與隱私文件，清楚揭露哪些 Key 會經過 Noureon 代理。

#### 驗收標準

- 無 Token、錯誤 Token、過期 Token均回傳 401。
- 超限回傳 429，且多實例部署下仍有效。
- 未知欄位、超長 body 與不允許模型被拒絕。
- 5xx 不暴露 Key、Header、底層 stack 或完整 request body。

### 階段 5：API Key 保存與舊資料遷移（第 2–4 週）

#### 目標設計

1. 預設 session-only。
2. 「記住 Key」必須由使用者明確選擇。
3. 若提供本機加密，使用者必須提供解鎖秘密；不得把固定解密金鑰放入前端 bundle。
4. UI 清楚說明：session-only 不能防止當前頁面的同源 XSS。

#### 舊 Key 遷移決策

- 是否允許升級後一次性讀取舊明文 Key。
- 是否要求使用者重新同意「記住 Key」。
- 遷移成功後立即刪除舊 IndexedDB 記錄。
- 使用者拒絕持久化時，載入至本次 session 後刪除舊記錄，或要求重新輸入。
- 遷移失敗時不得無限保留明文；需提示、重試上限及刪除期限。
- 登出、刪除帳號、重設設定與瀏覽器共用裝置情境需有一致清除規則。

#### 驗收標準

- 新安裝不會默認持久化 Key。
- 舊明文資料有可測試、可回復、具截止期限的遷移流程。
- 匯出、日誌、錯誤訊息與雲端同步均不包含 Key。

### 階段 6：Recovery 重設計（第 3–6 週）

> 實作狀態（2026-07-12）：已完成 Recovery v2。瀏覽器使用由使用者持有的 Recovery Code 進行 PBKDF2-SHA256／AES-256-GCM 加密；伺服器只保存不透明密文，不再需要 `SYNC_VAULT_RECOVERY_KEY`。近期驗證改採 OTP／Magic Link AMR 項目的實際 `timestamp`。新增資料庫遷移會刪除舊版集中式解密記錄，既有使用者須在以目前同步密碼解鎖後，明確重新啟用 Recovery Code。

#### 優先方案

改成使用者持有的 recovery key／recovery code，伺服器只保存無法自行解密的 ciphertext。

#### 若必須保留伺服器協助復原

- 功能為明確選配，預設關閉。
- 使用 per-user data encryption key。
- 使用 KMS／HSM envelope encryption，不使用全站單一可直接解密金鑰。
- 近期驗證依指定 AMR 方法的實際驗證時間，不依 token refresh 後的 JWT `iat`。
- 使用一次性 challenge、防重放、短效期限與完整稽核。
- 對復原操作提供使用者通知、撤銷與異常偵測。
- 定義舊 recovery record 刪除與重新註冊流程。

#### 驗收標準

- Token refresh 不會被誤判為近期 Email 驗證。
- 重放 challenge 失敗。
- 伺服器無法使用單一秘密批次解密所有使用者資料。
- UI 不會在未明確同意下建立 recovery record。

### 階段 7：安全 Header 與 CSP（第 2–4 週）

> 實作狀態（2026-07-12）：倉庫 `vercel.json` 已加入 `nosniff`、Referrer-Policy、Permissions-Policy、`X-Frame-Options: DENY`，並正式強制 `base-uri 'none'`、`object-src 'none'`、`frame-ancestors 'none'`。完整 CSP 先以 Report-Only 部署，違規回報只保留指令及 origin。正式網站仍須在部署後以實際 HTTP 回應 Header 驗證。

#### 可先加入的獨立 Header

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

實際 Permissions Policy 應依產品功能調整；若未來需要相機掃碼或麥克風輸入，不可直接永久關閉。

#### 可先獨立強制的 CSP

若產品不需被 iframe 嵌入，可先發布較小的正式政策：

```http
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'
```

#### 完整 CSP 先用 Report-Only

```http
Content-Security-Policy-Report-Only:
  default-src 'self';
  script-src 'self';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'self';
  img-src 'self' https: blob: data:;
  connect-src 'self' <實際供應商 allowlist>;
  font-src 'self' data:;
  style-src 'self' 'unsafe-inline';
  upgrade-insecure-requests;
```

待違規來源、inline script、第三方載入及相容性完成盤點後再逐步 enforcement。Trusted Types 放在主要 DOM sink 修復之後，不列為第一輪阻擋條件。

### 階段 8：Supabase、CI 與正式環境驗證（持續進行）

> 實作狀態（2026-07-12）：CI 新增 `check:security`，目前核對 10 個由 migration 建立的應用資料表均啟用 RLS、撤銷 `anon` 權限、具有 `auth.uid()` owner policy，並拒絕無條件 `USING (true)`／`WITH CHECK (true)` policy。這是倉庫 migration 驗證；正式 Supabase 專案仍需部署後稽核實際 schema、policy 與跨使用者行為。

#### Supabase

- 比對正式環境 migration history 與倉庫。
- 驗證所有同步與 recovery table 已啟用 RLS。
- 使用 anon、使用者 A、使用者 B 測試跨租戶讀寫。
- 驗證 storage bucket 路徑與 function execute 權限。
- 將 RLS regression tests 納入 CI。

#### CI

- DOM XSS source-to-sink 測試。
- 匯入、P2P、雲端同步 schema 測試。
- ZIP bomb、超大 JSON、深層物件及圖片解碼資源測試。
- API auth、schema、body limit、timeout 與 error redaction 測試；依產品決策不加入請求次數限流。
- Recovery challenge、AMR 時間與跨使用者測試。
- Secret scanning、依賴漏洞掃描與安全 lint。
- `vercel.json`／部署 Header 靜態檢查，加上正式站 response smoke test。

## 7. 建議 Pull Request 拆分

1. `security/xss-safe-dom-rendering`
2. `security/external-data-schema-boundary`
3. `security/image-content-validation`
4. `security/proxy-auth-request-validation`
5. `security/proxy-observability`
6. `security/key-storage-migration`
7. `security/recovery-redesign`
8. `security/csp-and-security-headers`
9. `security/rls-regression-suite`

每個 PR 應保持單一責任，附上測試、回復方式、資料遷移影響與部署檢查清單。

## 8. 粗估工期

| 工作 | 粗估 |
|---|---:|
| 緊急控制與正式環境盤點 | 0.5–1.5 天 |
| 已確認 DOM XSS 修復 | 2–4 天 |
| 統一 schema 與 ZIP／JSON 限制 | 4–8 天 |
| 圖片內容驗證 | 2–5 天 |
| API auth、schema、body limit | 3–6 天 |
| 分散式 rate limit 與監控 | 2–5 天 |
| API Key 保存與遷移 | 3–7 天 |
| Header 與 CSP Report-Only | 1–3 天 |
| Recovery 重設計與遷移 | 1–3 週 |
| RLS 與安全回歸測試 | 2–5 天 |

整體合理期程約 4–7 週。第一個可顯著降低風險的版本應在 1–2 週內完成；Recovery 架構調整不應阻擋 P0 XSS 與資料邊界先行上線。

## 9. 發布門檻

Critical／High 項目必須符合以下條件才可視為完成：

1. 修復程式已合併並通過自動化測試。
2. 外部資料來源均通過統一驗證。
3. 攻擊 payload 在舊資料、P2P、備份及雲端同步路徑均不可執行。
4. 正式站 Header 已以實際 HTTP 回應核實。
5. 正式 Supabase RLS 已以不同身分執行回歸測試。
6. 日誌與 APM 已確認不記錄 Authorization、Cookie、Key、同步密碼或完整 recovery payload。
7. 資料遷移具有回復方案，且已在測試資料上演練。
8. 使用者公告、Key 輪替與隱私揭露已完成。

## 10. 不應混淆的安全結論

- API Key 經過代理是架構與信任風險，不必然是漏洞；缺少驗證、限流、schema、日誌保護及揭露才是具體缺口。
- `JSON.parse()` 本身不等於原型污染；危險鍵拒絕是必要防禦，但完整利用性需另行驗證。
- Session-only 不能防止同源 XSS，只降低持久化暴露。
- 本機加密不能在使用者已解鎖且 XSS 可執行時保護明文 Key。
- CSP 是縱深防禦，不能替代安全 DOM API 與輸入驗證。
- `frame-ancestors`、`object-src`、`base-uri` 是 CSP 指令，不是獨立安全 Header。
- 倉庫未設定 Header 不等於正式站必然未設定；正式環境必須以實際回應核實。
- 只檢查圖片副檔名、MIME 字串或 `data:` 前綴不足以驗證圖片內容。

## 11. 最終建議

立即批准 P0 的 XSS、外部資料 schema 與圖片內容驗證工作。API、Key 保存、Recovery、CSP 與 RLS 依本計畫分開交付，不等待大型架構改造完成才處理已確認漏洞。

在 P0 完成並通過驗收前，持續建議使用者不要在 Noureon 保存高額度、主帳號或正式用途 API Key，並對曾匯入不可信資料的使用者提供 Key 輪替與 Session 重設指引。

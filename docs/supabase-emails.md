# Noureon 的 Supabase 信件（貼到後台）

五封信，同一套設計（靠左、單欄、一個按鈕，品牌色取自 Logo），**只有英文**（Supabase 每種信只有一個範本欄位，owner 決定只做英文）。信裡只用 Supabase 每種範本都有的四個變數：`{{ .Email }}`、`{{ .SiteURL }}`、`{{ .ConfirmationURL }}`、`{{ .Token }}`，沒有使用者資料或條件，所以不會因為資料缺少而出錯。每一封都用 Go 的 `text/template` 和 `html/template` 驗證過。

檔案都在 [`email-templates/`](email-templates/)：每封有 `<名稱>.html`（內容）和 `<名稱>.subject.txt`（主旨）。要改文字就改 [`email-templates/build-emails.py`](email-templates/build-emails.py) 裡的 `EMAILS`，再執行 `python3 docs/email-templates/build-emails.py` 重新產生。

## 貼到哪裡（Supabase 後台 → Authentication → Emails）

| 檔案 | 後台位置 | 什麼時候寄 | 一定要有的東西 |
|---|---|---|---|
| `confirm-signup` | Templates →「確認註冊」(Confirm sign up) | 新使用者註冊、綁定 Email | `{{ .ConfirmationURL }}`（點了回到網站） |
| `reset-password` | Templates →「重設密碼」(Reset password) | 忘記登入密碼 | `{{ .Token }}`：App 要使用者輸入 **8 位數**驗證碼（`maxlength="8"`、`^\d{8}$`），所以後台「Email OTP Length」必須是 8；信裡**不放連結**（連結會到 `/reset-password`，那一頁要先通過驗證碼，直接點會被擋） |
| `magic-link` | Templates →「魔法連結或 OTP」(Magic link or OTP) | **目前沒有任何功能會寄**：以前是忘記同步密碼（`signInWithOtp`），那條 Email 救援流程在 2026-11-13 已停掉，現在改用通行金鑰或驗證器。留著不影響，後台可以不貼 | `{{ .ConfirmationURL }}` |
| `identity-linked` | Security →「登入方式連結」(Sign-in method linked)，開關要打開 | 有新的登入方式（例如 Google）連到帳號 | 按鈕連到 `{{ .SiteURL }}/forgot-password` |
| `password-changed` | Security →「密碼已更改」(Password changed)，開關要**關掉**（改由伺服器寄，見下方；**正式站等這版上線後才關**，之前忘記密碼那條路只有 Supabase 這封） | 改了登入密碼（現在不寄） | 按鈕連到 `{{ .SiteURL }}/forgot-password` |

每一封：Subject 貼 `.subject.txt` 的內容，內容欄貼 `.html` 的整份內容，按「Save changes」。Authentication → URL Configuration 的 **Site URL** 要是 `https://noureon.com`。

## 不需要的

邀請使用者、更改電子郵件地址、重新認證，以及 Security 區的電子郵件地址已更改、電話號碼更改、登入方式已移除：程式碼裡沒有對應功能，維持關閉即可。

Security 區的 **MFA 新增／移除**也維持關閉：驗證器（TOTP）和通行金鑰現在有功能了，但通知信由我們自己的伺服器寄（`server/security-notices.js`，一樣的版面，還帶時間、裝置、IP、大略地點），開 Supabase 的會變成同一件事收到兩封。

**改登入密碼的通知只留我們伺服器那封**（`login-password-changed`，有時間、裝置、IP、大略地點）：在設定裡改密碼、和忘記密碼用驗證碼重設完成（`password-reset-notice.js`，在登出前用驗證碼開的那個登入階段呼叫伺服器），兩條路都會寄。所以後台 Security →「密碼已更改」(Password changed) 的開關要**關掉**，否則同一件事收兩封；`password-changed` 這個範本檔留著備用（伺服器的信件服務壞掉、或之後想改回只用 Supabase 的時候用）。代價是通知信取決於伺服器的信件服務（Resend）有沒有設好。

**順序**：測試站（已有新版）現在就可以關；正式站要先上線，確認重設流程的伺服器信寄得出去，再關 Supabase 那封，不然中間有一段忘記密碼完全沒有通知。

**測試站的限制**：測試站沒有接 Resend SMTP，Supabase 不允許免費專案用內建信件服務改範本，所以測試站的 Supabase 信（確認註冊、重設密碼的驗證碼、登入方式連結）是內建的純文字版，貼不上我們的範本；伺服器寄的信（改密碼、安全通知）不受影響，樣式正常。

## 不能做到的

信裡沒有時間、裝置、地點：Supabase 的通知信只提供上面幾個變數，沒有編造其他欄位。信件的深色模式跟隨收信人的信箱設定（Apple Mail 會照做；Gmail、Outlook 會用自己的方式處理）。

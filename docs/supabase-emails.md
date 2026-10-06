# Noureon 的 Supabase 信件（貼到後台）

五封信，同一套設計（靠左、單欄、一個按鈕，品牌色取自 Logo），**只有英文**（Supabase 每種信只有一個範本欄位，owner 決定只做英文）。信裡只用 Supabase 每種範本都有的四個變數：`{{ .Email }}`、`{{ .SiteURL }}`、`{{ .ConfirmationURL }}`、`{{ .Token }}`，沒有使用者資料或條件，所以不會因為資料缺少而出錯。每一封都用 Go 的 `text/template` 和 `html/template` 驗證過。

檔案都在 [`email-templates/`](email-templates/)：每封有 `<名稱>.html`（內容）和 `<名稱>.subject.txt`（主旨）。要改文字就改 [`email-templates/build-emails.py`](email-templates/build-emails.py) 裡的 `EMAILS`，再執行 `python3 docs/email-templates/build-emails.py` 重新產生。

## 貼到哪裡（Supabase 後台 → Authentication → Emails）

| 檔案 | 後台位置 | 什麼時候寄 | 一定要有的東西 |
|---|---|---|---|
| `confirm-signup` | Templates →「確認註冊」(Confirm sign up) | 新使用者註冊、綁定 Email | `{{ .ConfirmationURL }}`（點了回到網站） |
| `reset-password` | Templates →「重設密碼」(Reset password) | 忘記登入密碼 | `{{ .Token }}`：App 要使用者輸入 **8 位數**驗證碼（`maxlength="8"`、`^\d{8}$`），所以後台「Email OTP Length」必須是 8；信裡**不放連結**（連結會到 `/reset-password`，那一頁要先通過驗證碼，直接點會被擋） |
| `magic-link` | Templates →「魔法連結或 OTP」(Magic link or OTP) | 忘記同步密碼（`signInWithOtp`） | `{{ .ConfirmationURL }}`；使用者要在**同一個瀏覽器**打開（App 比對儲存在該瀏覽器的狀態） |
| `identity-linked` | Security →「登入方式連結」(Sign-in method linked)，開關要打開 | 有新的登入方式（例如 Google）連到帳號 | 按鈕連到 `{{ .SiteURL }}/forgot-password` |
| `password-changed` | Security →「密碼已更改」(Password changed)，開關要打開 | 改了登入密碼 | 按鈕連到 `{{ .SiteURL }}/forgot-password` |

每一封：Subject 貼 `.subject.txt` 的內容，內容欄貼 `.html` 的整份內容，按「Save changes」。Authentication → URL Configuration 的 **Site URL** 要是 `https://noureon.com`。

## 不需要的

邀請使用者、更改電子郵件地址、重新認證，以及 Security 區的電子郵件地址已更改、電話號碼更改、登入方式已移除、MFA 新增／移除：程式碼裡沒有對應功能，維持關閉即可。

## 不能做到的

信裡沒有時間、裝置、地點：Supabase 的通知信只提供上面幾個變數，沒有編造其他欄位。信件的深色模式跟隨收信人的信箱設定（Apple Mail 會照做；Gmail、Outlook 會用自己的方式處理）。

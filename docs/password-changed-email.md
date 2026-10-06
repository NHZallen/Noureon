# 「登入密碼已變更」通知信（貼到 Supabase）

用途：使用者改登入密碼後，Supabase 會寄這封信到他的 Email（不管是不是本人改的都會寄）。信裡的按鈕連到 `{{ .SiteURL }}/forgot-password`（現成的重設頁：輸入 Email、過驗證、收驗證碼），所以信裡沒有任何可以直接重設密碼的憑證。

設計依據：照 GitHub、Linear、Dropbox 這類信的做法（靠左、單欄、一個按鈕、克制的版面），品牌色取自 Logo。信裡**沒有**時間、裝置、地點：Supabase 的這種通知只提供信箱（`{{ .Email }}`）和網站網址（`{{ .SiteURL }}`），沒有編造其他欄位。

## 檔案

- 內容（HTML，Go 範本）：[`email-templates/password-changed.html`](email-templates/password-changed.html)
- 主旨：[`email-templates/password-changed.subject.txt`](email-templates/password-changed.subject.txt)
- 產生器（要改文字就改裡面的 `S` 再執行）：[`email-templates/build-password-changed.py`](email-templates/build-password-changed.py)

## 貼到 Supabase

1. Supabase 後台 → Authentication → Emails → Security 區的「Password changed」。
2. 打開右邊的開關，點進去。
3. Subject 貼主旨檔的內容，內容欄貼 HTML 檔的整份內容。
4. 回到列表按「Save changes」。
5. Authentication → URL Configuration 確認 **Site URL** 是 `https://noureon.com`。

## 語言

Supabase 後台每種信只有**一個**範本欄位，沒有「每種語言各一份」的地方；多語言是在這一份範本裡用條件（Go 範本的 `if`）選，這是 Supabase 官方社群有記載的做法。

範本會讀使用者帳號資料（user metadata）裡的 `language`：`en`、`fr`、`ru`、`es` 各有一版，沒有這個欄位或不認識的值一律是繁體中文。**App 要把介面語言寫進 `language` 才會依人切換**（還沒做，在等 owner 決定）。範本用 Go 的 `text/template` 和 `html/template` 都驗證過：`Data` 缺少、是空值、是空的、`language` 不認識或型別不對，都會退回繁體中文，不會出錯。沒辦法在範本裡擋掉的只有「Supabase 給的資料根本不是 map」這種不太可能的情況；貼上後請用測試帳號改一次密碼，確認收到信。

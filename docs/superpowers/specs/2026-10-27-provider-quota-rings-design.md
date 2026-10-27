# 側邊欄額度圓環：OpenCode Go 與 OpenRouter（2026-10-27）

左側選單「擴充」上方有一列圓環，沒有文字，滑過看提示。兩組並排：左邊 OpenCode Go（三圈，由外到內月、週、5 小時，中間是 OpenCode 圖示），右邊 OpenRouter（一圈，中間「OR」）。每一組只在有對應金鑰、而且服務有回答時才出現；一組都沒有時，這一列不佔空間。OpenCode 的細節在 `2026-10-13-opencode-provider-design.md` 最後一節。

## OpenRouter（Allen 的決定，2026-10-27）

- **查什麼：** `GET https://openrouter.ai/api/v1/key`（一般金鑰、只帶 `Authorization`），回傳這把金鑰的 `limit`（在 OpenRouter 替這把金鑰設的額度上限，沒設是 null）、`limit_remaining`、`limit_reset`（daily／weekly／monthly）、`usage`、`usage_daily／weekly／monthly`。帳號餘額是 `GET /credits`，只有管理金鑰能查，**不用**（管理金鑰權限大，不放進保管庫）。
- **沒設上限的金鑰：不顯示圓環。** 圓環一定代表「剩多少」，不會用花費假裝。協助中心之後可以加一句：在 OpenRouter 替金鑰設額度上限就會出現。
- **圓環：** 剩餘額度上限的百分比（整圈＝全剩；低於 20% 琥珀色，用完紅色）。提示寫剩下百分比與金額（`$5.00 of $20`）、何時重設、今天／本週／本月花了多少。
- **何時查、快取：** 和 OpenCode 一樣（頁面載入、回到前景或視窗取得焦點、雲端金鑰同步進來、離開金鑰輸入框、點圓環；每把金鑰一分鐘內不重複查；服務沒回應時顯示上一次的數字並調淡）。沒設上限的結果也快取一分鐘，不會一直打。
- **程式：** `src/app/runtime/shell/usage-cache.js`（兩個服務共用的快取：單一金鑰、一分鐘、同時多個請求合併、點一下最少隔 5 秒、失敗時給舊答案並標 `stale`）；`openrouter-usage.js`（解析與讀取，不依賴瀏覽器）；`src/app/ui/provider-quota/`：`quota-row.js`（共用的那一列，放在「擴充」上方並一直留在上方）、`openrouter-ring.js`、`openrouter-texts.js`（五語言）、`start-quota.js`（啟動兩組；`shell.js` 只有這一行延遲載入）。樣式在 `src/styles/opencode-quota.css`（順序用 CSS `order`：OpenCode 在左）。
- **CSP：** `openrouter.ai` 早就在 `connect-src`（聊天本來就從瀏覽器直連），不用改。
- **隱私：** 隱私政策五語言加一句（請求從瀏覽器直送 OpenRouter、只帶金鑰、回傳只顯示並在記憶體留一分鐘），`PRIVACY.md` 已重新產生。

## 還沒驗證（我連不上 openrouter.ai）

- `/key` 的回傳欄位名稱照官方文件與第三方工具寫成，沒用真的金鑰打過；瀏覽器直接呼叫這個端點的 CORS 也沒實測（聊天的端點可以）。**請 Allen 用一把有設額度上限的 OpenRouter 金鑰在測試站看圓環有沒有出來**；欄位不對時圓環不會出現（不會壞）。

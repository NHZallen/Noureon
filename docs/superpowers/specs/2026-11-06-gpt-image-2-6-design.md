# GPT Image 2.6：換掉 2.5、GIF 與 SVG（2026-11-06）

Allen 的要求（2026-11-06）：OpenRouter 的生圖模型換成 `openai/gpt-image-2.6-flare` 與 `openai/gpt-image-2.6-sunburst`，OpenAI 供應商（直連）一起換；2.6 新增的格式 SVG 要能做，GIF 的影格數照 OpenAI 官方的參數做；價格那行文字不加提醒；探測腳本要給他在自己電腦跑。

## 1. 查到的（2026-11-06，沙盒打不開 openai.com 與 openrouter.ai，來源是搜尋到的官方文件片段與第三方文章，要用前請再對官方文件核對）

- 2026-11-04 發布。參數與 2.5 一樣（比例含 auto、品質 auto 到 max、背景、張數 1–10、參考圖 0–16、壓縮 0–100），新增格式 `gif` 與 `svg`。
- GIF：`output_format: "gif"`，`frame_count`（官方參考：沒給時預設 9，只有 gif 時有效；第三方說 2–64，官方參考有說法是 2–16，**兩邊矛盾，所以介面只給 2–16**，探測腳本的 `--tests frames` 會量出實際上限）與 `frame_duration_ms`（第三方：20–2000 毫秒，預設 200；四捨五入到 10 毫秒）。只有 generations 端點能出 GIF，edits 端點不行；不支援串流、部分圖、自訂壓縮。可能要預覽資格（有人回報 400「GIF output is not enabled for this request」）。
- SVG：`output_format: "svg"`，`n=1`，只有 generations 端點，不支援串流、部分圖、壓縮。官方參考還提到「SVG model selection」，細節不明（探測腳本會看實際行為）。
- 價格：每百萬 token 與 2.5 相同（圖片輸出 $30）；第三方量到 2.6 在低、中品質用的 token 多很多（約 3 到 4 倍），高品質一樣。不在說明文字加提醒（Allen 決定）。
- 2.6 不能用 Batch。
- OpenRouter：有一份 OpenRouter 文件庫的 issue 說它的驗證當時會擋 `gif`、沒有 `frame_count`；Allen 貼的 OpenRouter 參數表已列 `gif`，大概已開，**影格數與每格時間、svg 在 OpenRouter 是否被接受要實測**。我們照 OpenAI 官方的名字送（`frame_count`、`frame_duration_ms`），被拒時錯誤訊息會原樣顯示。

## 2. 做了什麼

- **模型**：兩個供應商的 2.5 換成 2.6（`openai/gpt-image-2.6-*` 與 `openai-api/gpt-image-2.6-*`），舊 id（含 `openai/gpt-image-2`）自動轉到同名的 2.6。模型多了 `supportedImageFormats`（沒列的模型只有 png、jpeg、webp），`supportedImageOptions` 多了 `frameCount`、`frameDuration`。共用常數與一個把請求整理好的函式在 `src/app/runtime/images/image-formats.js`（頁面與伺服器共用）。
- **請求**（`openai-image-generation.js`、`openrouter-image-generation.js` 都用 `settleImageFormatConfig`）：gif 帶 `frame_count`（2–16，預設 9）與 `frame_duration_ms`（20–2000，預設 200），不帶壓縮；svg 一定 `n=1`、不帶壓縮、不帶影格；其他格式沒有影格。回傳的類型照回答裡的 `media_type`，沒有時 gif 與 svg 照要求的格式，其餘當 png。
- **只用文字**：GIF 與 SVG 不能搭配「要修改的圖」（edits 端點不出這兩種）。介面選了這兩種會說明；附了圖就不送出並說明；前一張圖是 GIF 或 SVG 時不再自動拿來當底圖（新圖從文字畫）；伺服器的圖片工具遇到 GIF 或 SVG 當參考圖會告訴模型改用文字畫。目前不會把 GIF 的第一格或 SVG 轉成 png 當底圖（以後可以做）。
- **SVG 安全**（`src/app/runtime/images/svg-sanitize.js`，頁面與伺服器共用，沒有 DOM）：SVG 不只是圖，能含腳本、事件處理、連到外面的連結與外站圖片；blob 位址在新分頁打開會用 app 的權限執行。所以模型寫的 SVG 一律「逐個標籤讀、只把會畫的元素與屬性重新寫出」：白名單的元素（形狀、漸層、濾鏡、文字、`use`、`image` 等）與屬性；事件屬性、`script`、`foreignObject`、`iframe`、動畫、外部連結一律拿掉；`href` 只能是圖內的 `#id`，`image` 只能是 data 的 png、jpeg、webp、gif；`url(...)` 只能指向 `#id`；`style` 內容有 `@import`、反斜線、非 `#` 的 `url()` 就拿掉；屬性值先解碼實體再檢查，重新寫出時再跳脫；有 DOCTYPE 或實體宣告、根不是 `svg`、標籤沒閉合、太大（2 MB）、太多元素（2 萬）、太深（64 層）一律整個拒絕。產圖函式回傳前先清理（頁面與伺服器都一樣），**顯示前再清理一次**（`generated-image-assets.js` 的 `bind`），所以從雲端還原、匯入檔案、分享的對話進來的 SVG 也一樣安全；清不乾淨的不顯示。測試有各種攻擊與隨機組合（2 萬組）。
- **介面**（`image-mode-controls.js`）：格式選單依模型（GPT Image 2.6 有 gif 與 svg）；選 gif 才出現「影格數」與「每格時間（毫秒）」；選 svg 張數只剩 1；gif 與 svg 不顯示壓縮率；選了這兩種會有一行說明。新字串五語（`parts/model-descriptions.js`）。
- **伺服器**：`run-spec.js` 多收 `frameCount`（2–16）與 `frameDuration`（20–2000）；`image-tool.js` 對 GIF/SVG 參考圖的處理；匯出對話檔的副檔名多了 gif（`import-export-lifecycle.js`）。
- **幫助中心**：圖片生成那一段五語加了一句 GIF 與 SVG。
- **探測腳本**：`scripts/gpt-image-26-probe.mjs`（Allen 在自己電腦跑；金鑰只放環境變數、不印出不寫檔）。預設 `list,png,gif,svg` 約四個低品質小請求；`--tests frames` 量影格上限，`duration` 量每格時間上限，`svgcount` 試 `n=2`，`refs` 試 GIF/SVG 搭配參考圖；`--openai` 走直連。結果 JSON 與圖片檔寫在本機，貼 JSON 給我即可。

## 3. 還沒確定（等探測結果）

- GIF 在 OpenRouter 與直連各自能不能用、需不需要預覽資格；影格數的實際上限（目前介面給 2–16）；每格時間的上限。
- SVG 在 OpenRouter 是否被接受；官方提到的「SVG model selection」是不是還有一個要送的欄位。
- GIF 的尺寸限制（目前尺寸照比例與解析度 1K 算，太大可能被拒，錯誤會原樣顯示）。
- 這個模組放進 `scripts/server-shared-modules.json` 的兩個新檔（`image-formats.js`、`svg-sanitize.js`）需要 Allen 確認。

## 4. 測試

`tests/svg-sanitize.test.js`、`tests/gpt-image-26-formats.test.js`、`tests/gpt-image-26-probe.test.js`，以及 `image-mode-controls`、`image-generation-response-lifecycle`、`server-image`、`runtime-model-registry` 各補了一項。

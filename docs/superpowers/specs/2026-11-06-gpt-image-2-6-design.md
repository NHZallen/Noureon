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
- **只用文字、SVG 安全**：第一版有這兩條規則，探測之後（第 5 節）都拿掉了，不要照這一段做。
- **介面**（`image-mode-controls.js`）：格式選單依模型（GPT Image 2.6 有 gif 與 svg）；「影格數」與「每格時間（毫秒）」永遠都在（模型有這兩個選項時），不用先選 gif；選 svg 張數只剩 1。（第 5 節）新字串五語（`parts/model-descriptions.js`）。
- **伺服器**：`run-spec.js` 多收 `frameCount`（2–16）與 `frameDuration`（20–2000）；`image-tool.js` 對 GIF/SVG 參考圖的處理；匯出對話檔的副檔名多了 gif（`import-export-lifecycle.js`）。
- **幫助中心**：圖片生成那一段五語加了一句 GIF 與 SVG。
- **探測腳本**：`scripts/gpt-image-26-probe.mjs`（Allen 在自己電腦跑；金鑰只放環境變數、不印出不寫檔）。預設 `list,png,gif,svg` 約四個低品質小請求；`--tests frames` 量影格上限，`duration` 量每格時間上限，`svgcount` 試 `n=2`，`refs` 試 GIF/SVG 搭配參考圖；`--openai` 走直連。結果 JSON 與圖片檔寫在本機，貼 JSON 給我即可。

## 3. 第一版時還沒確定的事

見第 5 節的探測結果。

## 4. 測試

`tests/gpt-image-26-formats.test.js`、`tests/gpt-image-26-probe.test.js`，以及 `image-mode-controls`、`image-generation-response-lifecycle`、`runtime-image-decisions`、`server-image`、`runtime-model-registry` 各補了一項。

## 5. 探測之後（2026-11-06，Allen 跑了 `gpt-image-26-probe.mjs` 與三支補測腳本，報告 `GPT-Image-2.6-探測報告.md`）

**探測看到的**（flare、low 品質）：

| | OpenRouter | OpenAI 直連 |
|---|---|---|
| 文字 → GIF | 200，960×960，4 格、每格 200 ms、會循環；不指定格數 9 格（928×928） | 我們送的 1024×1024 一律 400（「找不到放得下 4 格的拼圖表」，最長邊 3840、像素上限）；960×960、512×512、`auto` 都 200 |
| 文字 → SVG | 400：OpenRouter 的 OpenAI 供應商只收 png、jpeg、webp、gif | 要帶 `svg: { model: <文字模型> }`，沒帶 400；`gpt-6-luna`、`gpt-5.6-luna` 可用，`gpt-image-2.6-flare` 404 |
| 圖 + 文字 → GIF | 200 但回的是 **PNG** 分格圖（`media_type` 也是 png，兩次一樣） | `/images/edits` 200，真的 GIF，4 格 |
| 圖 + 文字 → SVG | 400（同上） | `/images/edits` 400「Supported values are png, webp, jpeg」 |

**Allen 的決定（同日）**：不要 SVG 安全清理；GIF 與 SVG 都能搭配附上的圖（ChatGPT 的 app 都能「圖生向量、GIF」）；GIF/SVG 與影格數、每格時間都能從文字偵測；影格參數不用先選 GIF 就能選，用不到就不套用；不要多一個「選 SVG 用哪個模型」的選單。

**改了什麼**：

- **拿掉**：`svg-sanitize.js`、它的測試、`server-shared-modules.json` 的那一筆、`makeSvgsSafe` 與 `SVG_REFUSED_MESSAGE`、顯示前的清理（`generated-image-assets.js`）、「只用文字」的錯誤訊息與格式選單的提示。**風險要記著**：SVG 是 `<img>` 顯示，不會執行腳本；但把圖的 blob 位址單獨在新分頁打開，裡面的腳本會用 app 的權限執行（app 內目前沒有這個動作，下載是 `<a download>`）。以後若加「在新分頁開啟圖片」，SVG 要另外處理（例如開成下載或放在沙盒 iframe）。
- **請求**：有附圖時 GIF 和 SVG 都照送（OpenAI 走 `/images/edits`）。GIF 的尺寸預設自動（Allen 的決定）：OpenAI 在比例是「自動」或 1:1（設定的預設值，分不出是不是使用者選的）時送 `size: auto`，OpenRouter 這時不送 `aspect_ratio`（範圍探測沒送 aspect_ratio 也得到 512×512）；選了其他比例時，OpenAI 把最長邊畫成 512（`openAiGifSize`；1:1 的 512×512 在 2、4、16 格驗證過，其他比例同一條規則但沒實測，被拒時顯示 OpenAI 的原話），解析度（1K、2K…）不影響 GIF；OpenAI 的 SVG 自動帶 `svg: { model: 'gpt-6-luna' }`（`OPENAI_SVG_MODEL`，app 本來就有這個模型，不給人選）。前一張圖會自動當底圖給 png/webp/jpeg/gif；SVG 不自動帶（edits 做不了 SVG，只會 400）；前一張圖是 GIF 或 SVG 時一樣不當底圖（edits 只收 png、jpeg、webp）。
- **類型看位元組**：`sniffImageType`（`image-formats.js`）從開頭的位元組認出 gif/png/jpeg/webp/svg，優先於「回答說的」和「要求的」，所以 OpenRouter 在圖+文字要 GIF 時回的 PNG 分格圖會被當成 png，不會被存成壞掉的 gif。
- **文字偵測**（`decisions/image-decisions.js`、`images/image-spoken-request.js`）：判斷模型多四個是非題：要動的圖（`animated`）、要向量圖（`vector`）、有說影格數（`frames_stated`）、有說每格時間（`frame_time_stated`）。是就用，只對這一則訊息有效，設定不動；數字由 `readWrittenFrames`（「8 frames」「8 格」「六格」「12 кадров」…，「每秒 30 格」不算）和 `readWrittenFrameTime`（「200 ms」「0.5 秒」「0,5 s」…，換算成毫秒、取到 10，不在 20 到 2000 的不算，所以「整段 3 秒」不會被當成每格時間）從話裡讀。GIF 才讀影格；模型做不出該格式（不是 GPT Image 2.6）就不送並說明（`imageFormatOverLimit`，五語）。要動圖時 prompt 多一句，叫模型畫動作本身、不要畫一排格子或寫出數字（`GIF_INSTRUCTION`、`SVG_INSTRUCTION`）。判斷模型沒答（沒金鑰、太慢、暫停）就只照設定。
- **介面**：影格數、每格時間（和品質、背景、壓縮）只要模型有就一直顯示；格式不用的設定留著、不送出（`settleImageFormatConfig`）。
- **幫助中心**：那一句五語改成「可選或直接說」「附圖可當起點」。

**還沒驗證**（沒有 OpenAI、OpenRouter 的連線）：判斷模型對這四題的實際準確度（`scripts/decisions-image-probe.mjs` 的題組已加 GIF/SVG 的句子，要 Allen 跑）；OpenAI 直連的 GIF 在 `auto` 下 9 與 16 格是否都放得下；OpenRouter 的 SVG 是 API 不收（探測 400），app 只能把 API 的錯誤原樣顯示；OpenAI 的圖 → SVG：`/images/edits` 不收 svg，app 照送、顯示 API 的錯誤，是否有別的路（例如 Responses API 的圖片工具）要查 OpenAI 文件或問 OpenAI。

## 6. SVG 由文字模型寫（2026-11-06，Allen 的決定，補測之後）

**補測**（OpenRouter 三種路線都不行、OpenAI 的 generations 不收圖、Responses 圖片工具帶 svg 加圖連續 500）只有一條通：把圖直接給有視覺的文字模型（OpenAI Responses，`gpt-6-luna`），請它寫 SVG，200、4.9 秒，形狀顏色文字位置幾乎原樣。

**決定**：
- OpenAI 直連的**文字 → SVG** 維持官方方式（圖片端點加 `svg.model`，固定 `gpt-6-luna`）。
- **圖 + 文字 → SVG**（兩家）與 **OpenRouter 的任何 SVG**：由文字模型寫（`images/svg-writer.js`）。選 GPT Image 2.6 時固定用 GPT-6 Luna（OpenAI 直連 `gpt-6-luna`，OpenRouter `openai/gpt-6-luna`，不給人選）。
- **一般文字模型**：對話裡判斷模型（新問題 `svg`，要 0.8 以上的確定）認出要向量圖，就用**當下的文字模型**寫 SVG，用圖片卡片顯示與保存（`images/svg-chat-route.js`，走圖片的生命週期，伺服器也一樣：`config.svgWriter: true`）。能這樣做的只有 OpenAI 與 OpenRouter 的模型（寫請求的程式只認這兩個）；Gemini、NVIDIA 的模型照舊在回答裡貼程式碼。判斷模型沒答就照舊。文字模型看不到圖的，本來就不能附圖。
- **OpenRouter 的圖 + 文字 → GIF 不支援**：附了圖選 GIF 就不送出並說明（`imageGifPictureOpenRouter`，五語），前一張圖也不自動帶；maker 裡也擋一次（伺服器路徑）。OpenAI 直連的圖 → GIF 照常走 edits。
- 分派在 `image-generators.js` 的 `svgIsWrittenByTextModel`；寫 SVG 的程式頁面與伺服器共用，已列入 `scripts/server-shared-modules.json`（需 Allen 確認）。
- 沒有「GIF 模式」之類的切換鈕：格式只是進階設定裡的下拉，說一句「做成 GIF／SVG」就會自動切（只對那則訊息）。

**還沒驗證**：OpenRouter 的 `openai/gpt-6-luna` 帶圖片的 chat/completions 請求（OpenRouter 的視覺輸入格式是標準的 `image_url`，單元測試用假的回答驗證了請求長相和讀取，沒有真實連線）；判斷模型 `svg` 題的實際準確度（`scripts/decisions-image-probe.mjs` 可以加句子驗）；文字模型寫出很大的 SVG 時的耗時（非串流，一次等回答）。

## 7. 實測結果（2026-11-06 04:14–04:17，Allen 的兩份報告）

**SVG 寫手**（`svg-writer-probe-standalone.mjs`）：openrouter-text 21.3 秒、openrouter-picture 3.7 秒（方圓三角都有）、openai-picture 4.5 秒（同）、openai-images-svg（官方方式）61.1 秒。所以圖 → SVG 走文字模型比官方的 Images API 快很多。判斷模型 `svg` 題 14 句（五語）14 句全對，要的 0.96–0.99，不要的 0.01–0.09，門檻 0.8 沒有誤判。

**GIF 參數範圍**（flare、low）：
- `frame_count`：兩家都是 2–16（1、17 都 400），預設 9。與介面一致。
- `frame_duration_ms`：OpenAI 下限 20（10、15、19 回 400），文件寫四捨五入到 10 ms、上限 655,350，實測 3000 成功；OpenRouter 自己擋在 20–2000。介面用 20–2000（兩家共同的範圍），不改。
- 尺寸：OpenAI 1024×1024 配 4 或 9 格 400；512×512 在 2、4、16 格成功。OpenRouter 1:1 每格 512×512。16:9 沒測到（OpenRouter 402，見下）。
- OpenAI 的 GIF「需有 GIF 預覽權限」：沒有權限的帳號會收到 API 的錯誤，app 原樣顯示。
- OpenRouter 的 402 `in_flight_budget_exhausted` 是帳戶餘額不夠預留併發請求（報告寫總儲值 31 USD、已用 29.37 USD），不是程式或參數的問題。

## 8. Picture buttons that did nothing (2026-11-06, found on staging by Allen)

- **Cause**: the page policy in `vercel.json` has `connect-src` without `data:`, so `fetch('data:...')` is refused in production (not in the dev server, which has no policy). Two buttons fetched a data address: **Share** in the preview (`media-preview-lifecycle.js`) and the **confirm** of the picture editor (`generated-image-runtime.js`, `attachAnnotatedImage`). Both failed inside a `try/catch` that only logged, so they "did nothing", for every picture (a GIF too). Reproduced in Chromium with the policy of `vercel.json` (`fetch` of a data address: "Failed to fetch", the CSP violation in the console); after the change the share gets the file and no violation.
- **Fix**: `images/picture-blob.js` decodes a data address (`dataUrlToBlob`) instead of fetching it; the Share button is not drawn where `navigator.share` does not exist.
- **Save (download)**: `<a download>` works in Chromium under the same policy (a blob and a 3 MB data address were both downloaded), so the desktop was not the problem. On an iPhone or iPad (and in the browsers inside other apps, such as the Google app) the link is not acted on, so there `saveWithShareSheet` opens the share sheet with the file (it holds "Save Image" and "Save to Files"). The card button and the preview's Save button both do it. **Not tried on a real iPhone**: the sandbox has no WebKit.
- **Editing a GIF**: the editor draws the first frame of a GIF and attaches that picture (a PNG with the marks), as it does for any picture; the animation is not kept.
- The number on a picture stands where the Edit button stands (0.75rem from the corner).
- A rule from this: **never `fetch` a data address in the page**; decode it.

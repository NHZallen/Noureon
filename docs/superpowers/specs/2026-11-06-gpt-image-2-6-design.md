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

## 9. Editing a GIF frame by frame (2026-11-06, Allen's choice: A)

- **Why**: the editor drew only the first frame of a GIF, so a frame in the middle could not be marked, and the frames of an animation may differ a lot (at most 16).
- **The reading of the file**: `images/gif-frames.js` (`decodeGif`) reads a GIF into the whole picture of each frame (a frame that changes only a part is put on the ones before it; transparency, disposal 2 and 3, interlacing, the time of each frame), with plain arrays only. Browsers do not all have an `ImageDecoder`, so the file is read here. Tested against Pillow pixel for pixel (`tests/gif-frames.test.js`, `tests/fixtures-gif-frames.json`: 4 GIFs written by Pillow, expected pixels as Pillow shows them) and against damaged files (bytes changed at random never make it throw or loop: a damaged file gives null).
- **The editor** (`generated-image-interactions.js`, `gif-editor-frames.js`): for a GIF with two frames or more the editor has a strip of the frames between the picture and the colours: the play button, then a small picture for each frame (the one on the screen has a white frame, a frame with marks a red dot); a tap, or ← and → on a keyboard, shows a frame. **The marks and the history (undo, redo, clear) of each frame are its own.** Play runs all the frames with their marks at their own times; a touch on the picture stops it. Reduced to one picture, nothing changes for a still picture.
- **What is sent**: first the frames with marks as references to make the whole animation again (A); Allen tried it (§10) and chose B instead. See §10: the marked frames are edited one by one and put back.
- Seen in Chromium under the policy of `vercel.json` with an 8-frame GIF: strip, marks kept per frame, arrows, play, confirm attaches the marked frames. Not tried on a phone (touch and the strip).

## 10. Editing a frame puts the edited frame back (2026-11-06, Allen's choice B after trying A)

- **What went wrong with A** (screen recording on an iPhone, "小豬跳舞", GPT Image 2.6 Flare, OpenAI): he marked the motion lines on **one frame** and wrote "不要有這個波". The model was given that one picture and made a new GIF from it: the lines were gone, but so was the dance. Measured on the recording (frame to frame, same crop, 10 frames a second): the mean change between two frames was **6.7 in the first GIF and 1.1 in the new one**, six times less. Allen: he only wanted to change one frame. (Sending all the frames was tried for a moment and dropped: the model would still have made a new animation.)
- **B**: the editor attaches only the marked frames, each with its marks and with `targetedEdit: { index, count, source }` (`source` is the id of the GIF). The picture lifecycle, when it sees such frames, does not make a GIF: `images/gif-frame-edit.js` (`editGifFrames`) reads the GIF again (`gif-frames.js`), sends **each marked frame to the model on its own** as a picture to edit (the words of the person, the marks sentence, and "This picture is frame 4 of 16 of an animation. Change only what was asked and keep everything else exactly as it is… Answer with one still picture of the same shape."), in the shape of the GIF (the nearest the model takes), draws each answer to the size of the frame on a canvas, puts it in the place of its frame, and writes the GIF again (`images/gif-encode.js`). **The other frames are not touched** (they keep their pixels; a frame has at most 256 colours, so they are written exactly), and the times and the loop are kept. The result is a new GIF in the chat; the old one stays.
- **Any model that edits pictures works, OpenRouter's too** (the edit is a still, and the GIF is written here): the rule "OpenRouter makes no GIF from a picture" still holds for making a GIF, not for editing its frames.
- **The encoder**: the LZW of a GIF; a frame with 256 colours or fewer is written as it is, a frame with more (what the model answers) is reduced by the median cut on a 15-bit histogram and dithered (Floyd-Steinberg). Pillow opened a GIF written by it (size, 5 frames, times, loop), and Chromium's own decoder read the edited GIF of the test below. A frame of 960×960 with many colours takes about 1.5 seconds on this machine; a few seconds if many frames are edited; the page is busy meanwhile (a worker would be the next step).
- **Through the server** (Allen: "it has to go through the server"): the picture lifecycle first hands the frames to the server like any image (`startImage`, `image.gifEdit` in `server/run-spec.js`): `{ source, edits: [{ index, count }] }` with the marked frames as `references` in the same order. `source` is the GIF's file in the cloud space when the picture has one (`cloudAsset`), else the GIF itself as a data address (a request that is too large is made in the page). `server/image-run.js` reads the GIF, asks the model for each frame on its own through the same picture maker as any image, reads each answer on the canvas of `@napi-rs/canvas` (`server/picture-frame.js`: JPEG and WebP answers too, drawn to fill the frame), puts it back, writes the GIF again and keeps it in the cloud space like any picture: **so a page that is closed meanwhile finds the GIF done.** The shared parts (`gif-frames.js`, `gif-encode.js`, `gif-frame-edit.js`, `picture-blob.js`) are in `scripts/server-shared-modules.json` (to confirm); the only part with a canvas of the page is `gif-frame-edit-page.js`. If the server cannot take it (no account, busy, too large, an old server) the page does it as before, with the same code. A server image without `@napi-rs/canvas` says so and the error is shown (the picture was made by the model and paid for; a retry on the page is the person's).
- If the GIF is no longer in the conversation (deleted), nothing is sent and it says so (`imageGifSourceGone`, five languages).
- Tests: `tests/server/server-gif-edit.test.js` (the request, the server asking for each frame and keeping the GIF with the frame put back and the others untouched, the GIF read from the cloud space, a GIF with another number of frames), the lifecycle tests (to the server with the cloud file or the data address, the page when the server cannot), `tests/gif-encode.test.js` (written again = same pixels, times and count; reduction; shapes; an edited frame takes its place and the others stay), the lifecycle test. In Chromium: an 8-frame GIF, frame 4 edited with a made-up answer of 1024×1024: Chromium's decoder gives 8 frames of 480×320, frame 4 has the new colour at its centre, frames 3 and 5 the old one, in 0.3 seconds.
- **Not known yet**: how well the model keeps a frame in line with its neighbours (the prompt asks; if it drifts, the neighbours could be sent along as pictures to look at); a phone has not been tried.

## 11. The same change in every frame: the contact sheet (2026-11-06, Allen's choice 2)

- **The problem**: with B (§10) only the marked frame changes. A change that belongs to the whole animation (the colour of a nose) left the other frames as they were, and asking the model for each frame on its own would make each one a little different from the original (the drift of a picture model), so a GIF would flicker.
- **The way**: the frames are laid out in **one sheet** (`images/gif-sheet.js`: `sheetLayout`, `buildSheet`; as square as it can be, each cell the size of a frame, the sheet at most 2048 on a side, a hole in a frame white), the model changes the sheet **once** (so the change is the same in every cell), and the answer is cut up again (`sliceSheet`). The request has the sheet as the first picture and the marked frames (with their marks) after it, and says: a contact sheet of N frames, x across and y down; apply the change to every frame in the same way; keep the grid, the poses, the lighting and the style; the other pictures show where to look, draw no marks; answer with the whole sheet.
- **Only the places that changed are put back** (`compositeChanges`): the answer is not the original down to the pixel (grain, a shift of colour), so each cell is compared with the cell that was sent (`changeMap`: the biggest change of a colour after a small blur); the pixels over a threshold, grown by a few pixels and softened at the edge, are taken from the answer, **every other pixel stays the original's** (the alpha too, so a transparent GIF stays transparent). When more than 40% of a frame changed the edit is for the whole picture (a new light, a new style) and the answer is taken whole. The threshold is calibrated with the marks (`calibrateThreshold`, `markMask`): the places the person drew on are where a change is surely wanted; the highest of 48, 36, 26, 18, 12 that still sees 30% of the marked pixels as changed is used (26 when nothing is marked).
- **Where the choice comes from**: the button **All frames** in the strip of the editor (`gifAll`, five languages; `targetedEdit.all`), or the words "in every frame" (the Decisions question `all_frames`, `allFrames` of `readSpokenRequest`), when frames are marked. Without marks the editor attaches nothing, as before.
- **Server and page**: `image.gifEdit.all` in `server/run-spec.js` (`true` only); `server/image-run.js` calls `editGifSheet` instead of `editGifFrames` (the sheet becomes a PNG with `rgbaToPng` of `server/picture-frame.js`, the answer is read with `pictureToFrame(..., stretch)`, drawn to the whole size of the sheet so the cells stay where they are); the page does the same with `gif-frame-edit-page.js` when the server cannot take it. `gif-sheet.js` is in `scripts/server-shared-modules.json` (to confirm).
- **One request** for the whole GIF (not one per frame); the shape asked of the model is the nearest one to the sheet's.
- **Tests**: `tests/gif-sheet.test.js` (layout, cut, grain is not a change, a local change is taken exactly, the whole-picture edit, transparency, the threshold from marks, and an end-to-end run with a fake model that makes the nose blue in the sheet and drifts the rest: every frame has the blue nose, the far corner and the eye are the original's pixels, the times are kept), the server test, the lifecycle tests.
- **Not known yet**: how well a real model keeps a sheet's layout (cells that move or change size are cut wrong; the prompt asks for the same layout, and a model that cannot do it should be seen on staging); whether 2048 is the right size for the sheet; a GIF with a moving background that the model redraws would show the drift as a change (the threshold and the 40% rule keep the small ones out).

## 12. The grid view and the speed (2026-11-06, from Allen's recording of ChatGPT)

- **What ChatGPT does** (the recording of 13:37): a GIF has a speed chip on its card (1×, 0.5×, 2×, bottom left) and a player bar with the speed in the preview; a grid button in the top-right corner of the picture shows **all the frames as one grid**, and the person marks on the grid; the whole grid goes to the model. Allen: both, and send the grid, get the grid back, cut it into the GIF with the time the person chose.
- **The editor** (`generated-image-interactions.js`): the grid button in the top-right corner of the picture (`gif-editor-frames.js` draws the sheet with `buildSheet`, the same layout the server uses); pressed, the canvas is the size of the sheet and the person marks on all the frames at once; the grid is the last of the pictures that have their own marks and history, so the marks of each frame and of the grid are kept when the person goes between them; the grid button has a red ring when the grid has marks. **Marks on the grid win**: that one marked grid is sent (`targetedEdit: { index: 0, count, source, sheet: true }`), the marked frames are not sent besides it. The **speed button** (1×, 0.5×, 2×) is in the strip: it sets the speed of the play in the editor and goes with the request as `speed`.
- **The pipeline**: `editGifSheet` with `sheet`: the marked grid goes to the model as the only picture (it says marks were drawn on it, use them, draw no marks), the answer is cut up, and only the changed places are put back as in §11; where the person drew is the place that calibrates the threshold (the marked grid is cut into cells, each cell compared with the clean cell the server makes from the GIF). **The time of the new GIF** is the time of each frame divided by the speed (at least 20 ms); the speed works for the other ways of editing too (`editGifFrames`, the sheet of marked frames). `image.gifEdit` has `sheet` (true, with `all`, for exactly one picture) and `speed` (0.25 to 4) in `server/run-spec.js`.
- **On the card and in the preview** (`images/gif-speed.js`): the speed chip, bottom left, for a GIF. A browser cannot change the speed of a GIF, so at another speed the frames are shown one after the other (`loadGifFrames`) at their time divided by the speed, and at 1× the GIF itself is put back. The preview has the chip too.
- **Seen in Chromium** (the policy of `vercel.json`): 8-frame GIF, grid of 1440×960 with the canvas the same size, marks kept when going between the grid and a frame, confirm attaches one picture with `sheet` and `speed: 0.5`; the card chip changes the picture to the frames at 0.5× and back to the GIF at 1×. Not tried on a phone.
- **Not known yet**: whether the model keeps marks out of its answer (if it leaves them, the places they cover would be taken as changes: to watch on staging); the speed is not kept in the GIF other than as its new frame times.

## 13. The speed menu and a download at the chosen speed (2026-11-06, Allen's screenshot on a phone)

- **What was wrong**: the chip of §12 stood in the bottom-left corner, on top of the Edit button, and had its own size.
- **The button** is now in the top-right corner of the card and of the preview, the size of the other buttons of the card (`min-height: 2.25rem`, the same padding, colour and hover as Edit and Download, `--media-chip-bg`), and opens a **menu**: 0.25×, 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2× (`modal-bg`, `border-color`, radius 0.9rem, rows 2.5rem, a check on the one in use; text 0.9375rem, weights 400/500 as the style rules say). The editor's speed button opens the same menu. Seen in Chromium, light and dark.
- **Download and share follow the speed** (`images/gif-retime.js`): only the delay of each frame in the Graphic Control Extension is written again (the blocks are walked as the format says), so the pictures stay byte for byte what they were and nothing is decoded or reduced. It is made as soon as a speed is chosen (the iPhone's share sheet has to start in the press itself); the card's download link and its share sheet, and the preview's Save and Share, use it; at 1× the original is used again. The time of a frame is the time divided by the speed, in whole 10 ms, at least 20 ms (a GIF has no finer unit, so 100 ms at 0.75× is 130 ms).
- Tests: `tests/gif-sheet.test.js` (the times change, the pictures do not, a cut or foreign file is left as it was).

## 14. Three fixes after the phone (2026-11-06, Allen's recording and screenshot of 14:00)

- **The speed menu did not close** on a second press of its button (the press outside closed it, and the click that followed opened it again). Now the button toggles it: a press on the button is left to the button's own click, which closes the menu that is open; a press anywhere else, or Escape, closes it. Seen in Chromium, light and dark.
- **The All frames button is gone** from the editor (the grid makes it unnecessary: mark on the grid and the change is made in every frame). What stays: the words "in every frame" (Decisions `all_frames`), with frames marked in the editor, still make the same change in the whole GIF; the key `gifAll` and the button's style are removed.
- **The brush and its preview did not match**: the stroke and the ring that follows the pointer were the size of the slider (measured in Chromium: 14, 30 and 48 px gave 14.8, 31.2 and 49.3 px strokes and rings of 14, 30 and 48 px, on a frame and on the grid), but the ring in the box beside the slider was capped at 2.2 rem (35 px), so above about 35 the preview stopped growing while the stroke did not. The box is now 3.3 rem and the ring is not capped; the ring is the size of the stroke at every size (14, 30 and 48 checked).

## 15. The editor on a wide screen (2026-11-06, Allen's screenshots)

- The grey ring of the size preview (made 3.3 rem in §14) was outside the control, which was 2.9 rem wide: the control is now 3.9 rem wide.
- The size control was centered on the whole screen, not on the picture (the strip of frames and the colours are under the picture, so the picture is higher): `generated-image-interactions.js` sets `--stage-mid` (the middle of the picture's area, measured, kept up to date by a ResizeObserver) and the control stands there (`top: var(--stage-mid, 50%)`). Measured in Chromium at 1440×900 and again at 1100×700: the picture's middle and the control's middle are 1 px apart.
- The strip of frames is a grid of three (3.5 rem for Play, the frames, 3.5 rem for the speed) with the frames in the middle (auto margins on the first and the last: too many frames still scroll from the first); the first and the last frame of 8 are 240 px from the centre on each side.

## 16. How many pictures at once (2026-11-06, Allen's report from the count probe)

- **GIF**: both OpenAI and OpenRouter take `n` from 1 to 10 (the same as the other formats), so the Count of the settings goes to the request as it is (`settleImageFormatConfig` leaves `n` alone for a GIF: checked, 10 stays 10).
- **SVG**: always one picture (`n` is made 1 and the Count menu shows only 1): unchanged.
- Nothing to change in the code; this is the result of `scripts/gpt-image-26-probe.mjs --tests gifcount,svgcount`, told by Allen without the JSON (the numbers are his).

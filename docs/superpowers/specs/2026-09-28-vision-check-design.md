# V1 看圖檢查：詳細設計

**日期：** 2026-09-28
**狀態：** 設計已確認，V1 已於本機實作並通過自動測試、瀏覽器模擬模型流程與 PowerPoint 開檔；尚未推送或用真實模型驗證。
**前置閱讀：** [交接說明](../plans/2026-09-28-downloadable-files-handoff.md)（工作規則）、[總計畫](2026-09-26-downloadable-files-design.md)、[設計系統規格](2026-09-27-design-system.md)。

## 0. 使用者已確認的決定（2026-09-28）

| 項目 | 決定 |
|---|---|
| 何時執行 | **自動**：支援看圖的模型寫出簡報後，自動檢查一輪。設定裡可以關閉（預設開啟）。 |
| 結果怎麼呈現 | **AI 新回一則訊息**：說明發現的問題與修改內容，附上修正版檔案，和平常的對話一樣進入對話紀錄。 |
| 範圍 | **只做 PowerPoint（.pptx）**。Word、Excel、PDF 在 W2、A3、A5 各自加入。 |
| 次數 | 每份檔案最多一輪；修正版不會再被檢查（總計畫決定 9）。 |
| 模型 | 只對支援看圖的模型開放；不支援的模型完全不出現這個功能（總計畫決定 9）。 |

其餘細節（下面各節）是依這些決定與現有程式推導出的建議做法。實作時若遇到必須改變的地方，先問使用者。

## 1. 目標與非目標

**目標：** 程式檢查（`quality-checks.js`）抓得到文字溢出、超出頁面、對比不足這類可以量測的問題；看圖檢查補上只有「看」才知道的問題，例如：

- 標題斷行難看、最後一行只剩一兩個字，或字級縮得太小
- 版面失衡、留白過多或過擠、元素看起來疊在一起
- 圖片裁切不當（裁到人臉、主體偏出畫面）、佔位圖說明不清楚
- 圖表標籤擁擠、數值難讀、類別太多
- 一頁內容太密，應該拆成兩頁
- 前後頁的呈現方式不一致

**非目標：**

- 不重寫內容、不改事實與數字、不換語言。
- 不改設計（字型、配色、範本）；例外見 §6.3。
- 不做 Word、Excel、PDF。
- 不做模型理事會（council）的回覆（V1 只處理單一模型的回覆，理事會之後再評估）。

## 2. 參考的現成產品

- **Microsoft PowerPoint「協助工具檢查」**：逐頁列出錯誤與警告，每項附「建議動作」，可以一鍵修正。V1 的回覆訊息沿用這種「第 N 頁：問題 → 修正」的逐條寫法。
  - 參考：[Improve accessibility with the Accessibility Checker](https://support.microsoft.com/en-us/accessibility/office-accessibility/improve-accessibility-with-the-accessibility-checker)
- **Figma 的 Design Lint**：把問題分類成清單，修正後自動更新。V1 的問題也分類（文字、版面、圖片、圖表、一致性）。
  - 參考：[Design Lint](https://www.figma.com/community/plugin/801195587640428208/design-lint)
- **Copilot in PowerPoint**：由 AI 提出修改，使用者保留控制權。V1 保留原版，修正版另外提供。
  - 參考：[Edit with Copilot in PowerPoint](https://support.microsoft.com/en-us/powerpoint/edit-with-copilot-in-powerpoint)

視覺一律沿用現有聊天訊息與檔案卡片的樣式。使用者要求黑白極簡、不要漸層、不要自己加圖示。

## 3. 使用者流程

1. 使用者請 AI 做簡報；AI 回覆裡有一張 .pptx 檔案卡片（和現在一樣）。
2. 回覆完成後，如果符合 §4 的條件，對話最下方立刻出現一則新的 AI 訊息，顯示進度：
   - 「正在檢查簡報版面…」→「正在把頁面轉成圖片」→「{模型名稱} 正在看圖檢查」→「正在套用修正」
   - 進度列旁有「停止」，按了就取消這次檢查，並移除這則進度訊息。
3. 檢查完成：
   - **有問題並已修正**：進度訊息變成正式的 AI 回覆（格式見 §7.1），裡面有逐條說明與修正版檔案卡片。原本那張卡片保留不動，可以比較。
   - **沒有發現問題**：移除進度訊息，不新增訊息；顯示通知「看圖檢查完成，沒有發現需要修正的地方。」
   - **失敗**（模型錯誤、回覆看不懂、逾時）：移除進度訊息，顯示警告通知「看圖檢查沒有完成：{原因}」。原檔照常可用。
4. 檢查進行中，使用者仍可打字。如果在檢查完成前送出新訊息，就取消這次檢查，靜默移除進度訊息（避免 AI 訊息插在使用者的新訊息之後）。
5. 檢查進行中切換到別的對話，檢查繼續在背景完成，結果加到原本那個對話（比照現有「切換對話時保留進行中回覆」的做法，commit `d090e5b6`）。

## 4. 觸發條件（全部成立才執行）

1. 設定 `config.visionCheckEnabled !== false`（預設開啟，見 §9）。
2. 對話不是理事會模式（`isCouncilEnabled(conv)` 為 false），也不是圖片生成模式。
3. 對話目前的模型 `modelSupportsVision(model)` 為 true，而且不是圖片生成模型（`model.outputModality !== 'image'`）。
4. 剛完成的 AI 回覆沒有被中斷（`signal.aborted` 為 false）。
5. 回覆裡至少有一個**完整**的 .pptx 檔案區塊（`scanFileBlocks` 的 `complete === true`，檔名以 `.pptx` 結尾），而且 `parseDocumentSpec` 能讀取。
6. 這則回覆本身**不是**看圖檢查的結果（`message.metadata.visionCheck` 不存在）。
7. 這份檔案還沒檢查過：以檔案區塊的 id（`describeFileBlock(block).id`）記在來源訊息的 `metadata.visionChecked`（陣列）。

一則回覆有多份 .pptx 時，依序逐份檢查，每份產生一則結果訊息；V1 可以只檢查第一份，其餘在結果訊息裡註明「只檢查了第一份」，二選一實作時請寫進回報。

觸發位置：`finalizeAssistantResponse`（`src/app/legacy-runtime/features/assistant-response-finalization.js`）把訊息存好、畫面完成之後。建議在這裡只呼叫一個注入進來的 `scheduleVisionCheck({ conversation, message, targetElement })`，實際工作放在新模組（§10），用動態 `import()` 載入，避免把程式塞進啟動 chunk。

## 5. 頁面轉圖片

### 5.1 取得排版

用檔案卡片產生時同一套排版：`layoutDeck(spec, context)`（`src/app/ui/files/generators/pptx-layout.js`），`context` 與 `file-card-interactions.js` 的 `generatorContext()` 相同（語言、`document`、`window`、`loadChartImageRenderer`、`resolveImage`）。如果快取裡已經有這份檔案產生過的 Blob，可以直接用 `blob.presentation.layout`。

**需要補的資料：** 排版後的每一頁要知道它來自規格裡的哪一頁。`expandContinuations`（`slide-engine.js`）與 `splitOverfull` 拆頁時，在每個輸出的投影片規格加上 `sourceIndex`（原本 `spec.slides` 的索引）；`renderSlide` 產生的 slide 物件也帶上 `sourceIndex`。模型看到的是排版後的頁碼（1 起算），修正操作用的是規格頁碼，程式用 `sourceIndex` 對照（§6）。

### 5.2 每頁 SVG → PNG

1. `renderSlideSvg(document, slide, { layout, fontAlias, measure })`（`previews/slide-preview.js`）畫出 960×540 的 SVG。
2. **字型必須內嵌進 SVG**：SVG 以 `<img>` 或 `Image` 載入時，讀不到頁面用 `FontFace` 註冊的字型，會退回系統字型，模型看到的就不是真正的樣子。做法：
   - 收集這一頁每個文字元素用到的字型（與 `registerDeckFonts` 相同的家族與字重，別名是 `fontAlias(family)`）以及實際文字。
   - 用現有的 HarfBuzz 子集化（`pptx-assets.js` 的 `loadSubsetter()`、`loadFontFile()`，`font-embedding.js` 的 `subset`）把每個字重子集化成只含該頁文字的 TTF。
   - 在 SVG 開頭加入 `<style>@font-face{font-family:"<別名>";font-weight:<字重>;src:url(data:font/ttf;base64,…)}</style>`。
   - 可變字型要照 `fontSource(family, weight)` 固定字重（`variations`），和嵌入 PPTX 時一樣。
3. 已解析的上傳圖片（`element.resolved.data`）與圖表備援圖片（`element.image.data`）本來就是 data URL，可以直接留在 SVG 裡。
4. 把 SVG 字串轉成 `Blob`（`image/svg+xml`）→ `Image` → 等 `decode()` → 畫到 canvas。

### 5.3 拼成聯絡表，減少圖片數量

- 每張圖放 **2×2 共 4 頁**，每頁縮成 **800×450**；每頁上方留 28px 白底標示「第 N 頁」（用系統字，例如 `Arial, "Microsoft JhengHei", "PingFang TC", sans-serif`，文字依介面語言：`第 N 頁` / `Slide N` / `Diapositive N` / `Слайд N` / `Diapositiva N`）。
- 整張 1600×956，輸出 **JPEG 品質 0.85**（base64）。
- 最多檢查 **24 頁**（6 張圖）；超過時只檢查前 24 頁，並在結果訊息註明。
- 這樣一份 19 頁的簡報是 5 張圖，大約 1 萬～2 萬 token（依供應商計價方式而定）。

## 6. 送給模型與模型的回答

### 6.1 呼叫方式

- 用對話目前的模型，另外呼叫一次 `streamApiCall`，參考 `src/app/runtime/legacy-core/memory-model-runner.js`：
  - `historyForApi: []`、`currentMessageForApi: { role: 'user', parts }`，其中 `parts` 包含 §6.2 的文字，加上每張聯絡表 `{ inlineData: { mimeType: 'image/jpeg', data } }`
  - `disableReasoning: false`（讓會推理的模型照常推理），`ignoreConversationWebSearch: true`，`skipMemoryContext: true`，`skipConversationSystemContext: true`
  - 新增 `NOURAS_REQUEST_PURPOSE.VISION_CHECK = 'vision-check'`（`src/app/runtime/nouras/nouras-policy.js`），**不要**加進會套用 Nouras 人格的 `VISIBLE_PURPOSES`，也不要讓它觸發檔案提示詞（`FILE_OUTPUT_PURPOSES`）。
  - `genConfig: { temperature: 0.2, topP: null, maxTokens: 4000 }`
- 經由 `legacyRuntimeContext` 新增 binding（例如 `files.runVisionCheck`）時，**必須登記到 V5 contract map**，否則 `tests/structure/runtime-contracts.test.js` 會失敗；登記方式照該測試與 `src/app/runtime-entry.js` 的現有 binding。
- 逾時：120 秒；可由進度訊息的「停止」取消（`AbortController`）。

### 6.2 提示詞（英文，程式組成）

```
You are reviewing the rendered slides of a presentation for visual problems. You do not rewrite it.

## Deck
Title, document language, slide count, and the chosen design mode (AI adaptive or template "<id>").

## Slide specification (numbered as rendered)
For every rendered slide N: its layout, the spec slide it comes from, and its fields as JSON
(the same canonical JSON as §7.2, one line per slide, text trimmed to 300 characters).

## Automatic checks already run
The issues from layout.issues (id, slide, element), for example text-shrunk on slide 4.

## Images
Contact sheets of the rendered slides, four per image, each labelled with its slide number.

## What to look for
Awkward title breaks or a last line with one or two characters; text that is too small or crowded;
unbalanced or crowded layouts; elements that look overlapped; badly cropped photos; unreadable
charts; slides that should be split; inconsistent treatment of similar slides.
Ignore image placeholders' grey frames (the user replaces them) and anything that looks fine.

## Rules for fixes
- Keep the meaning, facts, numbers and language. Shorten wording instead of removing points.
- Use only the operations listed below, at most 20.
- Design parameters: <template mode: "must not change"> / <AI adaptive: "only density, titleSize, typeScale">.

## Answer
JSON only:
{"issues":[{"slide":N,"category":"text|layout|image|chart|consistency","problem":"…","fix":"…"}],
 "edits":[ …operations… ],
 "summary":"one or two sentences"}
Write "problem", "fix" and "summary" in <UI language name>. Return {"issues":[],"edits":[],"summary":""} when nothing needs fixing.
```

`<UI language name>` 依介面語言：Traditional Chinese (Taiwan)、English、French、Russian、Spanish。

### 6.3 允許的修正操作

所有操作用的是**規格頁碼**（`spec` 裡 `slides` 的索引＋1，欄位 `specSlide`）。模型看到的排版頁碼由程式在提示詞裡對照好：每頁都寫出「rendered slide N comes from spec slide M」。

| 操作 | 形狀 | 說明與限制 |
|---|---|---|
| `setText` | `{ "op":"setText", "specSlide":M, "field":"title", "value":"…" }` | 欄位限定：`title`、`subtitle`、`kicker`、`body`、`callout`、`takeaway`、`caption`、`quote`、`attribution`、`role`、`label`、`value`、`change`、`contact`。長度遵守 `SPEC_LIMITS`。 |
| `setItemText` | `{ "op":"setItemText", "specSlide":M, "list":"bullets", "item":2, "field":"text", "value":"…" }` | `list`：`bullets`、`items`、`cards`、`stats`、`steps`、`columns`、`images`；`field` 依清單：`text`（bullets/items）、`title`/`body`/`label`（cards、steps）、`value`/`label`/`note`（stats）、`heading`/`body`（columns）、`caption`（images）。`item` 從 0 起算，必須存在。 |
| `setLayout` | `{ "op":"setLayout", "specSlide":M, "layout":"cards" }` | 只能是 17 種版型之一；套用後重新正規化，內容不足時照現有規則退回。 |
| `splitSlide` | `{ "op":"splitSlide", "specSlide":M, "at":3 }` | 只適用有清單的版型（bullets、agenda、cards、stats、timeline、table 的 rows、closing 的 bullets）；把清單從 `at` 切成兩頁，第二頁標題沿用並加上續頁標記（`generatedText(language, 'continued')`），講者備註留在第一頁。 |
| `setImage` | `{ "op":"setImage", "specSlide":M, "fit":"cover", "focus":"top" }` | 只改 `fit`（cover/contain）與 `focus`（top/bottom/left/right/center）；`list:"images", item:i` 可指定照片牆裡的某一張。 |
| `setDesign` | `{ "op":"setDesign", "key":"density", "value":"airy" }` | **只在 AI 自適應時允許**，而且只限 `density`、`titleSize`、`typeScale`。指定範本時一律忽略（對話設定 `conversation.deckDesign` 不是 `auto`）。 |

程式要逐項驗證：規格頁碼、清單索引、欄位名稱、值的型別與長度都合法才套用；不合法的操作略過並記在 `metadata.visionCheck.skipped`。**不允許刪除頁面或項目**。

## 7. 結果訊息

### 7.1 訊息內容（程式組成，存成一般的 AI 訊息）

以繁體中文為例（其他語言見 §11）：

```
看圖檢查完成：發現 4 個問題，已修正 4 個。

- 第 3 頁（文字）：標題最後一行只剩一個字 → 縮短標題
- 第 6 頁（圖表）：類別標籤太擠 → 改成橫條圖
- 第 9 頁（圖片）：照片裁到人臉 → 改成靠上裁切
- 第 12 頁（版面）：內容太密 → 拆成兩頁

{模型的 summary}

````file 原檔名.pptx
{修正後的規格 JSON}
````
```

- 條列來自模型的 `issues`；已套用的標成「→ {fix}」，沒套用成功的標成「（未修正）」。
- 檔名與原檔相同。依現有協定，同名檔案視為新版本；送給模型的歷史會自動省略舊版（`compactFileHistoryForApi`）。
- 訊息的 `metadata.visionCheck = { sourceFileId, sourceFileName, model: 模型名稱, issues, applied: 套用數, skipped, checkedSlides, totalSlides }`。
- 來源訊息的 `metadata.visionChecked` 加上 `sourceFileId`，並更新 `conversation.lastUpdatedAt`，再呼叫 `saveAppData()`。
- 用現有的訊息加入與畫面流程（`addMessageToUI`、`message-list-lifecycle.js`）顯示，卡片、預覽、下載都照舊可用。

### 7.2 修正後的規格怎麼寫出來

新增 `serializeDeckSpec(spec)`（建議放在 `src/app/ui/files/design/document-spec.js` 旁的新檔 `spec-serializer.js`）：把**正規化後**的規格寫成標準 JSON，欄位名稱用正規名稱（`title`、`slides`、`layout`、`bullets`…），圖片寫成 `{ "upload": N, "alt": … }` 或 `{ "placeholder": "…" }`，圖表寫成 chart schema 物件。

- 設計：
  - 指定範本時寫 `{ "preset": "<id>" }` 加上原本的主色、輔色。會經過 `enforceDeckTemplate`，結果一致。
  - AI 自適應時寫完整的 25 項參數，加上 `setDesign` 的修改。
- **必須可以來回轉換**：`parseDocumentSpec(serializeDeckSpec(spec)).spec` 要與 `spec` 相同（`issues` 除外）。用 `tests/files/fixtures/sample-deck.json` 的 5 種語言測試。

### 7.3 對話歷史：連續兩則 AI 訊息

結果訊息接在原本的 AI 回覆之後，歷史裡會出現連續兩則 `model` 訊息。部分供應商（例如 Gemini）要求使用者與模型輪流發言。

在組成歷史時（`stream-api-call.js` 的 `compactFileHistoryForApi(...)` 之後），把相鄰的 `model` 訊息合併成一則：文字部分用空行連接，其他 parts 依序保留。要有測試。

## 8. 進度訊息

- 在對話最下方加入一則暫時的 AI 訊息元素（不存進 `conversation.messages`），樣式用現有的回覆進度（`response-progress-renderers.js` 的 `renderSingleModelProgress` 一類）。
- 階段文字見 §11；右側有「停止」按鈕。
- 完成時換成正式訊息；沒有問題或失敗時移除這個元素。
- 重新整理頁面時，進行中的檢查直接放棄，不要留下半成品。

## 9. 設定開關

- 位置：設定 →「輔助功能」，放在「自動聯網搜尋」開關（`#auto-web-search-toggle-switch`）的附近，樣式與它相同。相關程式在 `src/app/runtime/legacy-core/settings-output-translator-controls.js` 一帶。
- 設定鍵：`config.visionCheckEnabled`，預設 `true`，在 `src/app/runtime/kernel/config-normalization.js` 正規化（不是 `false` 就是 `true`），並照現有設定的方式保存與同步。
- 說明文字要提到會多花 token（§11）。

## 10. 建議的新增與修改檔案

| 檔案 | 內容 |
|---|---|
| `src/app/ui/files/vision/vision-check.js`（新，延後載入） | 流程主體：判斷條件、排版、轉圖、呼叫模型、驗證與套用修正、組成結果訊息 |
| `src/app/ui/files/vision/slide-rasterizer.js`（新） | §5：字型內嵌的 SVG → PNG、聯絡表 |
| `src/app/ui/files/vision/vision-edits.js`（新） | §6.3 的驗證與套用，純函式，方便測試 |
| `src/app/ui/files/vision/vision-prompt.js`（新） | §6.2 提示詞與回答解析（寬鬆 JSON，參考 `relaxed-json.js`） |
| `src/app/ui/files/design/spec-serializer.js`（新） | §7.2 |
| `src/app/ui/files/design/slide-engine.js` | 投影片帶 `sourceIndex` |
| `src/app/legacy-runtime/features/assistant-response-finalization.js` | 完成後呼叫注入的 `scheduleVisionCheck` |
| `src/app/legacy-runtime/features/stream-api-call.js` | §7.3 合併相鄰 AI 訊息 |
| `src/app/runtime/nouras/nouras-policy.js` | `VISION_CHECK` 用途 |
| 設定與 i18n 相關檔 | §9、§11 |
| `vite.config.js` | 確認 `src/app/ui/files/vision/` 不會被打包進啟動時的 `runtime-files`（`manualChunks` 規則目前只排除 `generators/`、`previews/`、`design/`，要把 `vision/` 也排除） |

**大小預算：** 主樣式表已經貼在上限，見交接說明 §5。V1 盡量不加全域 CSS；需要的樣式放進延後載入的 CSS，或沿用現有 class。

## 11. 介面文字（5 種語言）

| 鍵 | zh-TW | en | fr | ru | es |
|---|---|---|---|---|---|
| `visionCheckPreparing` | 正在檢查簡報版面… | Checking the slide layout… | Vérification de la mise en page… | Проверка макета слайдов… | Revisando el diseño de las diapositivas… |
| `visionCheckRendering` | 正在把頁面轉成圖片 | Turning slides into images | Conversion des diapositives en images | Преобразование слайдов в изображения | Convirtiendo las diapositivas en imágenes |
| `visionCheckReviewing` | {model} 正在看圖檢查 | {model} is reviewing the slides | {model} examine les diapositives | {model} проверяет слайды | {model} está revisando las diapositivas |
| `visionCheckApplying` | 正在套用修正 | Applying the fixes | Application des corrections | Применение исправлений | Aplicando las correcciones |
| `visionCheckStop` | 停止 | Stop | Arrêter | Остановить | Detener |
| `visionCheckHeading` | 看圖檢查完成：發現 {found} 個問題，已修正 {fixed} 個。 | Visual check done: {found} issues found, {fixed} fixed. | Vérification visuelle terminée : {found} problèmes trouvés, {fixed} corrigés. | Визуальная проверка завершена: найдено проблем — {found}, исправлено — {fixed}. | Revisión visual terminada: {found} problemas encontrados, {fixed} corregidos. |
| `visionCheckSlide` | 第 {number} 頁 | Slide {number} | Diapositive {number} | Слайд {number} | Diapositiva {number} |
| `visionCheckNotFixed` | （未修正） | (not fixed) | (non corrigé) | (не исправлено) | (sin corregir) |
| `visionCheckCategoryText` | 文字 | Text | Texte | Текст | Texto |
| `visionCheckCategoryLayout` | 版面 | Layout | Mise en page | Макет | Diseño |
| `visionCheckCategoryImage` | 圖片 | Image | Image | Изображение | Imagen |
| `visionCheckCategoryChart` | 圖表 | Chart | Graphique | Диаграмма | Gráfico |
| `visionCheckCategoryConsistency` | 一致性 | Consistency | Cohérence | Единообразие | Coherencia |
| `visionCheckPartial` | 只檢查了前 {count} 頁。 | Only the first {count} slides were checked. | Seules les {count} premières diapositives ont été vérifiées. | Проверены только первые {count} слайдов. | Solo se revisaron las primeras {count} diapositivas. |
| `visionCheckClean` | 看圖檢查完成，沒有發現需要修正的地方。 | Visual check done: nothing needs fixing. | Vérification visuelle terminée : rien à corriger. | Визуальная проверка завершена: исправлять нечего. | Revisión visual terminada: no hay nada que corregir. |
| `visionCheckFailed` | 看圖檢查沒有完成：{reason} | The visual check did not finish: {reason} | La vérification visuelle n’a pas abouti : {reason} | Визуальная проверка не завершена: {reason} | La revisión visual no terminó: {reason} |
| `visionCheckSetting` | 自動看圖檢查簡報 | Check presentations visually | Vérifier visuellement les présentations | Визуально проверять презентации | Revisar visualmente las presentaciones |
| `visionCheckSettingHint` | 支援看圖的模型寫完簡報後，會把頁面轉成圖片再檢查一輪並修正。每份會多用一些 token。 | After a model that can see images writes a presentation, its slides are checked as images once and fixed. Uses extra tokens for each deck. | Après qu’un modèle capable de voir les images a rédigé une présentation, ses diapositives sont vérifiées une fois en images et corrigées. Consomme des jetons supplémentaires. | После того как модель с поддержкой изображений создаст презентацию, слайды один раз проверяются как изображения и исправляются. Требует дополнительных токенов. | Cuando un modelo que puede ver imágenes escribe una presentación, sus diapositivas se revisan una vez como imágenes y se corrigen. Usa tokens adicionales. |

## 12. 測試與驗收

**單元與 DOM 測試**（`node --test`，放在 `tests/files/`）：

1. 觸發條件：
   - 支援看圖＋完整 pptx 時會觸發。
   - 以下情況都不觸發：不支援看圖、理事會、中斷、檔案不完整、檢查結果本身、已經檢查過、設定關閉。
2. `sourceIndex`：拆頁後的投影片都能對回正確的規格頁。
3. `vision-edits`：每種操作的成功與失敗案例。
   - 超出範圍的頁碼或索引要略過。
   - 範本模式下的 `setDesign` 要略過。
   - 不能刪除任何內容。
4. `serializeDeckSpec` 可以來回轉換：fixture 的 5 種語言都要測。
5. 回答解析：
   - 包在 ```json 裡、JSON 沒寫完、有多餘文字，都要能處理或安全失敗。
   - 空的 issues 不產生訊息。
6. 結果訊息：
   - 標題和條列的格式正確，5 種語言都要測。
   - metadata 正確，來源訊息標成已檢查。
7. 歷史：相鄰的 AI 訊息會合併，Gemini 與 OpenRouter 的請求格式都要測。
8. 聯絡表：
   - 4 頁一張、24 頁上限。
   - SVG 裡有 `@font-face`，而且用的是 data URL（在 happy-dom 環境可以只檢查 SVG 字串）。

**實際驗收（總計畫：實測修正前後差異；不支援的模型不出現此功能）：**

1. 在瀏覽器用支援看圖的模型，故意要求一份問題明顯的簡報。例如標題很長、一頁 10 個重點、圖表 12 個類別。確認：
   - 會自動出現檢查訊息。
   - 修正版在 PowerPoint 開啟正常。
   - 修正前後的差異合理。
2. 換成不支援看圖的模型，確認完全沒有檢查、也沒有進度訊息。
3. 關掉設定後，確認不會檢查。
4. 檢查中送出新訊息，確認檢查被取消、沒有殘留。
5. 檢查中切換對話，確認結果回到原本的對話。
6. 手機寬度（390px）看進度訊息與結果訊息的排版。
7. 通過 `npm test`、`npm run build`、`npm run check:sizes`、`npm run check:legacy-runtime`、`npm audit --omit=dev`。

## 13. 建議的實作順序

1. `sourceIndex`、`serializeDeckSpec` 與它們的測試（純函式，最好驗證）。
2. `vision-edits` 與測試。
3. 相鄰 AI 訊息合併與測試。
4. `slide-rasterizer`（字型內嵌、聯絡表），在瀏覽器實際輸出圖片確認字型正確。
5. 提示詞與解析、`VISION_CHECK` 呼叫。
6. 進度訊息、結果訊息、取消與切換對話。
7. 設定開關與 5 種語言文字。
8. 瀏覽器與 PowerPoint 實測、文件更新（總計畫的 V1 列標成 ✅，交接說明更新進度），本機 commit，回報使用者，等使用者同意再推上 `main`。

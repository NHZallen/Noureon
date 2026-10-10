# 生成圖片的等待畫面（點陣動畫與階段說明）

**狀態：** 已完成（版本 18.3.0）。
**起因：** owner 看過一段參考影片（點陣雲狀動畫、階段文字、百分比），要求優化生成圖片時的等待。

## 0. 18.3.1 改版（2026-10-10）

18.3.0 的第一版被 owner 退回（太粗糙）。逐格看過參考影片後重做，owner 看過三組渲染（飄雲、掃光、漣漪）後選了 A「飄雲」：點直接畫在頁面上（無卡片底、無邊框），點小而疏（格距 14px，半徑 0.35～2.85px，約格距的五分之一），大小與透明度隨六團柔和的雲漸變，雲在網格上緩慢飄移，有些區域幾乎全空；文字在點陣上方，完成時與圓點一起淡出。下面 §2 的第一點已被這段取代。

## 1. owner 的決定（2026-10-10）

1. 圓點顏色用**使用者的強調色**（`--button-primary-bg`）。
2. 階段文字用**一般性的說法**（依時間切換，不宣稱真實進度）。
3. **不要百分比**：OpenRouter 不回報生成進度，百分比只會是假的。
4. **不加計時量測**（不為了調整階段秒數而記錄真實耗時）。

## 2. 行為

- 等待區塊（`.generated-image-skeleton`）內是一個 canvas 點陣：14px 格點，三個緩慢漫遊的高斯團塊加漣漪，約 30 fps；`prefers-reduced-motion` 時只畫一張靜態圖。
- 左上角文字依經過時間切換四段：0 秒「正在建立圖像」、6 秒「正在構圖」、16 秒「正在細修」、40 秒「仍在處理中，高畫質的圖需要較長時間」。最後一段是誠實的說明，不是進度。
- 完成時沿用既有的 `generated-image-skeleton-finalizing` 變形，圓點以 CSS 淡出。
- 翻譯或「參考圖不可用」這類訊息會**釘住**文字（`label.dataset.pinned`），不被階段文字蓋掉；`refresh()` 還原階段文字。
- 關閉頁面再開啟、接回伺服器上仍在生成的圖片時，等待從**真正開始的時間**計算：載入中的訊息片段有 `imageStartedAt`，接回時取 `server_runs.created_at`。

## 3. 結構

- `src/app/ui/image-wait/image-wait.js`：純邏輯（`stageForElapsed`、`dotIntensity`、`drawDots`、`createImageWait`，依賴注入以便測試）與自訂元素 `noureon-image-wait`。這個檔案是**延遲載入**的，主 chunk 不背它。
- `src/app/ui/image-wait/image-wait-markup.js`：`imageWaitMarkup`、`loadImageWait`。
- 訊息渲染器（`message-markup-renderer.js`）必須保持純函式，因此直接輸出內嵌標記（空的文字標籤加 `<noureon-image-wait>`），不 import、不用 `globalThis`；文字由元素載入後填入。`message-list-lifecycle.js` 在加入載入中的圖片訊息時呼叫 `loadImageWait()`，元素自動升級。
- 樣式在 `src/styles/chat.css`（取代原本的光澤與閃爍動畫）。
- 文字：`imageWaitStage1`～`4`，五種語言。
- 預算：`legacy-submit-input` 的 gzip 上限 150 KB 本來剛好用滿，標記內嵌與延遲載入之後通過 `check:sizes`。

## 4. 驗證

- `tests/image-wait.test.js`（階段、強度、繪製、元素行為、停止）、渲染器、生命週期、接回與 i18n 測試。
- 在 Chromium 以真實 CSS 與模組實測：四段文字依時間切換、圓點為強調色、完成時淡出（截圖在回報中）。

## 5. 未定／備註

- 階段秒數（6／16／40）是估計值，沒有真實耗時資料；owner 不要量測，之後若要調整再討論。
- 文字壓在圓點上，淺色模式下對比尚可；若 owner 覺得不夠清楚，可加淡底。

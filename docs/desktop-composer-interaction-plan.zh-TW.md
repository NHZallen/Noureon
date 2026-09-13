# 電腦版輸入欄互動改版計畫書

## 1. 計畫摘要

本計畫要讓 Noureon 電腦版的新對話輸入欄，呈現參考影片中的核心互動：空白對話時置中，首次送出後平滑移到底部，並在同一時間顯示使用者訊息、生成中狀態與串流回覆。手機版維持現況。

這不是重做 composer，也不複製參考產品的品牌、文案或完整視覺；本次只學習其版面狀態與動態節奏。影片中出現的對話內容、建議文字與其他介面文字皆視為示範素材，不是本計畫的指令。

## 2. 參考影片觀察

影片長約 7.2 秒，解析度為 1856 × 1170。可拆成下列狀態：

| 時間 | 畫面狀態 | 可轉化的互動規則 |
| --- | --- | --- |
| 0.0–1.0 秒 | 空白對話；問候文字在輸入欄上方，輸入欄位於主要內容區中央 | 新對話採「置中模式」，焦點與所有 composer 功能仍留在同一元件 |
| 約 1.0 秒 | 使用者送出第一則訊息 | 先確認送出有效，再啟動版面轉場，避免空白或驗證失敗也讓輸入欄移動 |
| 1.0–1.5 秒 | 使用者訊息出現在右上方；輸入欄由中央往底部移動；送出鍵切成停止鍵 | 訊息、composer 與生成狀態應在同一幀序列內協調，不可先閃空白頁再重繪 |
| 1.5 秒後 | 輸入欄固定在底部，模型內容從左上方開始出現 | 首次轉場完成後進入「靠底模式」，串流期間不再改變 composer 位置 |
| 回覆完成 | 訊息操作按鈕出現；輸入欄仍在底部 | 後續對話、停止、錯誤與完成都保持靠底模式 |

參考影片的感受重點是「同一個輸入欄移動」，而不是切換成另一個輸入元件。因此實作時應保留既有 DOM 節點、輸入內容、焦點、附件與模式狀態。

## 3. 現況盤點

目前專案的 composer 位於 `src/templates/fragments/01-shell.fragment.js`，`#chat-container` 與 `#input-bar-container` 是同一個主畫面的 flex 子元素，所以輸入欄現在固定在底部。

既有能力可直接沿用：

- `src/app/runtime/legacy-core/settings-update-input-state-helper.js` 已能在請求進行中把送出圖示切成停止圖示。
- `src/app/runtime/features/app-bootstrap-lifecycle.js` 已處理 Enter 送出、點擊停止、textarea 自動增高與草稿保存。
- `src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js` 已依序加入使用者訊息、清空 composer、加入模型 loading message。
- `src/app/legacy-runtime/features/message-list-lifecycle.js` 已區分空白對話與有訊息對話，且能增量加入訊息。
- `src/app/legacy-runtime/features/single-model-response-lifecycle.js` 與既有串流 renderer 已負責漸進顯示回覆。
- `src/styles/mobile.css` 已有複雜的單行、多行、附件、引用與模式指示器版面，應避免重寫。

主要缺口：

1. 沒有明確的桌面 composer 版面狀態。
2. 新對話問候文字與 composer 沒有共享定位規則。
3. 首次有效送出時，現有流程會分別捲動使用者訊息與 loading message，可能和新的落底動畫互相搶動作。
4. 切換新對話、既有對話、封存對話及行動版編輯訊息時，尚無統一的狀態同步入口。

## 4. 建議互動規格

### 4.1 狀態模型

新增單一來源的版面狀態，不以零散 class 判斷：

- `empty`：電腦版、存在有效的目前對話、`messages.length === 0`、未封存。
- `docking`：第一則有效訊息已加入，composer 正由中央移到底部。
- `docked`：對話已有訊息，或正在生成、停止、錯誤、完成。
- `mobile`：寬度小於或等於 768px，完全沿用現況；不套用位移動畫。

狀態放在聊天主區的 `data-composer-layout` 屬性，例如 `empty`、`docking`、`docked`。業務邏輯只決定狀態，CSS 負責位置與動畫。

### 4.2 位置與動態

- 空白對話：composer 寬度維持現有 `max-w-4xl`，視覺中心落在主內容區約 47–52% 高度；問候文字位於其上方 20–28px。
- 首次有效送出：以同一個 `#input-bar-container` 做 transform/FLIP 位移，不 clone、不 reparent，避免焦點、IME、附件預覽與 popover 遺失。
- 建議時長 320–380ms，曲線 `cubic-bezier(0.22, 1, 0.36, 1)`；使用者訊息可在前 80–120ms 淡入。
- 生成期間：composer 固定靠底，停止鍵立即可用。
- `prefers-reduced-motion: reduce`：取消位移動畫，直接切換最終狀態。
- 視窗縮放、側欄開關、textarea 增高、附件與引用列變化時重新計算空白模式位移；靠底模式不需重算位置。

### 4.3 捲動規則

- 首次送出期間暫停 `scrollIntoView({ behavior: 'smooth' })`，避免它與 composer 動畫同時驅動視窗。
- 第一則使用者訊息固定從訊息區頂端開始排版；loading/串流回覆在其下方。
- composer 完成靠底後才恢復既有自動捲到底邏輯。
- 使用者手動離開底部後，仍遵守目前的自動捲動取消機制。

### 4.4 必須保留的功能

- Enter 送出、Shift+Enter 換行及 IME 組字。
- 生成中再次點擊送出鍵可停止。
- textarea 1–8 行自動增高。
- 附件預覽、引用詢問、推理深度、語音、網路搜尋、學習模式與 Model Council。
- 草稿、切換對話、自動命名、封存、雲端同步與自訂桌布。
- 行動版鍵盤與行動版訊息編輯流程。

## 5. 技術實作方案

### A. 建立桌面 composer 版面控制器

新增 `src/app/runtime/features/desktop-composer-layout.js`，職責限於：

- 根據目前對話、viewport 與生成狀態推導 layout state。
- 寫入 `data-composer-layout`，不直接處理訊息內容或 API 請求。
- 測量 composer 與可用聊天區中心，寫入 CSS custom property 作為位移量。
- 用 `ResizeObserver` 與 `matchMedia('(min-width: 769px)')` 處理 resize/breakpoint。
- 暴露 `sync({ animate })`、`beginFirstSubmit()`、`destroy()` 等小型介面。

### B. 增加穩定的 DOM hook

在 `src/templates/fragments/01-shell.fragment.js` 的聊天 `<main>` 增加明確 id 或 class，例如 `#chat-workspace`。保留 `#input-bar-container` 的位置與唯一性，不新增第二個 textarea。

`src/app/runtime/kernel/dom-registry.js` 登錄新的主區節點，讓 runtime 不需反覆 `querySelector`。

### C. 增加獨立桌面樣式層

新增 `src/styles/desktop-composer-layout.css`，並在 `src/styles/main.css` 中於 `mobile.css` 前引入。所有新規則限定在 `@media (min-width: 769px)` 與 layout data attribute 下。

樣式內容包括：

- 空白模式的 composer 位移與問候文字定位。
- `docking → docked` 的 transform/opacity 動畫。
- 轉場期間的 `will-change`，完成後移除以避免長期建立合成層。
- `prefers-reduced-motion` 規則。
- 自訂桌布、暗色主題與不同 composer 高度下的背景/陰影相容性。

現有單行、多行與附件 grid 規則繼續由 `src/styles/mobile.css` 管理；新檔只控制整個 `#input-bar-container` 的位置，不碰內部 grid。

### D. 接入既有生命週期

1. `src/app/runtime/legacy-core/legacy-core.js`
   - 建立並注入 composer layout controller。
   - `startNewChat()` 完成 render 後同步為 `empty`，初次呈現不播放從底部到中央的反向動畫。
   - `loadChat()` 與 `renderAll()` 後同步：空白暫存對話為 `empty`，已有訊息或封存對話為 `docked`。

2. `src/app/legacy-runtime/features/message-list-lifecycle.js`
   - `renderChat()` 完成 DOM 更新後呼叫 layout sync。
   - 空白問候節點加上穩定 class/data hook，讓它能與 composer 使用同一組位置變數。

3. `src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js`
   - 僅在驗證、Council 檢查與內容檢查都成功後呼叫 `beginFirstSubmit()`。
   - 第一則使用者訊息與 loading message 使用首次送出的專屬捲動策略，避免雙重 smooth scroll。
   - 驗證失敗、缺少金鑰或空白送出不得改變 layout state。

4. `src/app/runtime/features/app-bootstrap-lifecycle.js`
   - 初始化 viewport listener；app teardown 時解除 listener。
   - 保持現有停止請求行為，不把停止動作誤判成新的送出。

### E. 動畫時序

首次送出的建議順序：

1. 完成所有可送出檢查。
2. 設定 abort controller，送出鍵立即變停止鍵。
3. 記錄 composer 起始位置。
4. 加入使用者訊息及 loading message，但不啟動競爭性的 smooth scroll。
5. 下一個 animation frame 切到 `docking`，以 FLIP/transform 將 composer 移到底部。
6. transition 完成後切成 `docked`、清除暫時樣式並恢復正常自動捲動。
7. 串流內容沿用既有 renderer；不重新 render 整個 message list。

## 6. 測試計畫

### 自動化測試

新增 `tests/runtime-desktop-composer-layout.test.js`，至少覆蓋：

- 新暫存對話進入 `empty`。
- 第一則有效訊息觸發一次 `empty → docking → docked`。
- 空白送出、Council 驗證失敗與缺少 API key 不觸發落底。
- 已有訊息、封存對話、錯誤與中止請求維持 `docked`。
- 768/769px breakpoint 切換不殘留 transform。
- resize、textarea 高度與附件預覽改變會更新空白位移。
- reduced motion 直接完成狀態。
- destroy 後 observer/listener 都解除。

擴充既有測試：

- `tests/ui/composer-regressions.test.js`：保證新樣式不覆蓋 composer 內部 grid。
- `tests/runtime-app-bootstrap-lifecycle.test.js`：保證 listener 只註冊一次並可清除。
- `tests/message-editing-lifecycle.test.js`：保證手機版編輯訊息時的 composer reparent/restore 不受影響。
- `tests/app-shell-integrity.test.js` 與 `tests/runtime-dom-registry.test.js`：驗證新增 DOM hook。

### 手動驗收矩陣

- 桌面尺寸：1366×768、1440×900、1920×1080。
- 主題：亮色、暗色、自訂桌布。
- 內容：純文字、8 行文字、圖片/檔案、引用、Council、學習模式。
- 流程：首次送出、快速停止、API 錯誤、切換對話、連按新對話、重新整理恢復草稿。
- 裝置：桌面滑鼠、鍵盤、IME；手機尺寸確認完全維持現況。

驗證指令：

```text
npm test
npm run build
npm run check:legacy-runtime
```

## 7. 驗收標準

1. 電腦版空白對話的輸入欄位於主內容區中央，問候文字穩定顯示在上方。
2. 第一則有效送出後，輸入欄在 320–380ms 內平滑移到底部；畫面無閃爍、跳位或第二個輸入欄。
3. 使用者訊息在轉場開始時立即可見，模型 loading/串流內容在左側開始出現。
4. 生成中送出鍵為可點擊的停止鍵；停止、錯誤與完成都不讓輸入欄回到中央。
5. 切到全新空白對話時直接呈現置中狀態，不播放不必要的反向長動畫。
6. composer 的內容、焦點、IME、附件與功能模式在轉場中不遺失。
7. 手機版外觀及互動無差異。
8. reduced-motion 使用者不會看到位移動畫。
9. 全部測試與 production build 通過。

## 8. 風險與控制

| 風險 | 控制方式 |
| --- | --- |
| composer 動畫與 `scrollIntoView` 互相拉扯 | 首次送出採專屬 scroll policy，轉場後再恢復現有邏輯 |
| 多行/附件使中心點改變 | 以實際量測值與 ResizeObserver 更新 CSS 變數，不寫死高度 |
| 手機版訊息編輯會暫時搬動 composer | 所有新位置規則只在 769px 以上生效；controller 在手機狀態清除桌面 inline 變數 |
| 切換對話時播放錯誤動畫 | `sync({ animate: false })` 用於初始化與導覽，只有首次有效送出使用動畫 |
| CSS cascade 已有多層 override | 使用獨立、範圍明確的新檔，並加入 regression test，避免新增大量 `!important` |
| 重繪造成串流閃爍 | 沿用增量 `addMessageToUI` 與現有串流節點，不用 `renderChat()` 重建整串訊息 |

## 9. 建議執行順序與工期

1. 狀態控制器與單元測試：0.5–1 天。
2. DOM hook、桌面 CSS 與首次送出時序：1 天。
3. 導覽、resize、附件、多行與 reduced-motion 相容：0.5–1 天。
4. 回歸測試、三種桌面尺寸與手機檢查：0.5 天。

預估合計 2.5–3.5 個開發日。建議拆成一個功能分支、兩個可審查提交：先完成狀態與測試，再完成視覺轉場與 QA。

## 10. 不在本次範圍

- 不複製參考影片的頂部分頁、分享按鈕、建議提示或品牌文案。
- 不重設 Noureon 的訊息泡泡、色彩、字體與整體導航。
- 不改 API、模型串流協議、資料儲存格式或雲端同步 schema。
- 不改手機版 composer 版面。


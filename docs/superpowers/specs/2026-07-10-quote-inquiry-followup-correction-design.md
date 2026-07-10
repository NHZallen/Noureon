# 引用詢問後續修正設計

## 目標

修正來源文字提示、箭頭互動色與訊息送出後延遲捲動，同時確認引用來源的模型上下文。

## 核准行為

1. 點擊已送出的引用後，來源文字本身暫時變成主題藍色，背景不變，且不建立瀏覽器 Selection。效果維持 1.2 秒；若瀏覽器不支援 CSS Custom Highlight API，安全略過效果。
2. 輸入欄箭頭固定灰色。已送出引用的箭頭平時灰色，hover 或 focus 時與引用文字一起變黑。
3. 使用者訊息加入 DOM 後立即在下一個 animation frame 捲到底，不等待臨時對話儲存、自動命名、自動搜尋判斷或模型 API。
4. 模型上下文維持現狀：來源 A 的完整訊息由對話歷史傳送，被選取片段由本次隱藏 quote context 傳送，不重複附加 A 全文。
5. 保留桌面限定、最多三行、來源定位、雲端同步與既有資料格式。

## 技術選擇

- 使用 `CSS.highlights` 與 `Highlight` 將 Range 註冊為 `quote-source-flash`，搭配 `::highlight(quote-source-flash)` 只改文字顏色。
- 不使用 `window.getSelection().addRange()`，避免游標與原生選取狀態。
- 從第一次 `addMessageToUI` 的回傳元素立即排程 `scrollIntoView`；保留 loading 訊息建立後的第二次捲動。

## 驗證

- 先新增 CSS Highlight、箭頭互動色與 API 前立即捲動的失敗測試。
- 聚焦測試通過後執行完整測試、正式建置與 `git diff --check`。
- 不啟動 localhost 或本機瀏覽器測試。

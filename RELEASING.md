# 發布流程

本文件記錄 Noureon 的版本與發布規則。決策背景見 Vault 的《2026-07-20 語意化版本、持續部署與明確發布》。

## 語意化版本

產品版本使用三段式 `主版本.次版本.修訂版本`。

| 段位 | 何時遞增 |
|---|---|
| 主版本 | 不向下相容的產品、資料或公開介面變更，或明確的大型里程碑 |
| 次版本 | 向下相容的新功能或重要能力改善 |
| 修訂版本 | Bug、安全、小型體驗修正，或不改變產品能力的內部整理 |

## 持續部署不等於正式發布

`main` 每次推送都會由 Vercel 自動部署到 `noureon.com`。**自動部署不構成正式版本發布。**

因此正式網站可能包含尚未形成新版本的小型修改，這是預期行為。

## 版本來源

`src/data/version.js` 的 `PRODUCT_VERSION` 是唯一產品版本來源。以下必須與它一致，由 `npm run check:version` 在 CI 強制：

- `package.json` 的 `version`
- `package-lock.json` 的兩處 `version`
- `src/data/update-logs/entries.js` 最新一筆的 `version`

介面顯示的版本號來自 `PRODUCT_VERSION`；語言檔的 `versionNumber` 只存放標籤文字，**不得再包含版本數字**（檢查腳本會擋下）。

### 分開管理的版本

以下各有獨立責任，不得與產品版本統一：

| 版本 | 位置 |
|---|---|
| PWA 快取版本 | `public/service-worker.js` 的 `CACHE_NAME` |
| 記憶資料格式 | `src/app/runtime/memory/memory-schema.js` |
| 記憶同步投影 | `src/app/runtime/memory/memory-sync-projection.js` |
| 雲端同步 schema | `src/app/sync/cloud-sync-v2-shadow.js` |

資料格式變更必須自帶版本、遷移、失敗與復原策略，**不能只靠遞增產品版本處理**。

## 正式發布檢查表

1. 更新 `src/data/version.js` 的 `PRODUCT_VERSION`。
2. 同步更新 `package.json`、`package-lock.json`。
3. 在 `src/data/update-logs/entries.js` 最前面加入新版本的使用者變更紀錄。
4. 執行完整品質門檻：

   ```bash
   npm run build && npm test && npm run check:legacy-runtime && npm run check:sizes && npm run check:version
   ```

5. 推送 `main`，等待 Vercel 部署完成。
6. 在正式網站核對本次變更與版本號顯示。
7. 建立並推送 Git 標籤：

   ```bash
   git tag v16.4.5 && git push origin v16.4.5
   ```

標籤格式為 `v<版本號>`，用來標示已知良好版本與回復參考。

## 回復

回復前必須先確認舊版程式能安全讀取部署後已寫入的新資料。若期間有資料格式變更，單純回退程式並不安全。

## 變更紀錄格式

`src/data/update-logs/entries.js` 匯出 `updateLogEntries`，最新版本在陣列最前面。每筆為：

```js
{ version: '16.4.5', date: '2026-01-15', content: ['<strong>標題</strong>', '<ul><li>項目</li></ul>'] }
```

`content` 是原始 HTML 字串陣列，目前僅有繁體中文。發布紀錄不得包含秘密、內部權杖或真實使用者資料。

# 使用者頭像（2026-10-27）

Allen 的決定（2026-10-27）：頭像存雲端、同步到所有裝置；只顯示在側邊欄最下面與使用者頁，**聊天訊息裡不加**；用 Google 登入的人預設顯示 Google 大頭照，也可以自己換；形狀維持現在的圓形。

## 1. 現況（做之前）

- 使用者自己的頭像只有兩處，都是名字第一個字：側邊欄最下面 `.user-avatar`、設定的使用者頁 `#user-avatar`。
- 後台沒有頭像欄位或儲存空間。Nouras（助手）有自己的頭像，那套是另一回事（存成圖片資料放在 `avatarUrl`，隨 Noura 同步）。
- UID（`user_uids`，8 位數、不可改）早就寫在後台，頭像和它無關。

## 2. 後台（`supabase/migrations/20261027010000_add_user_avatars.sql`）

- 表 `public.user_profiles`：`user_id`（主鍵，隨帳號刪除）、`avatar_path`（空＝沒有自選頭像；只能是 `<user_id>/avatar.webp`）、`avatar_version`（每次寫入由觸發器加一，讓每個裝置知道要不要重抓）、`updated_at`。RLS：本人讀、增、改、刪自己那一列。
- 私有儲存桶 `user-avatars`：512 KB 上限，只收 webp／png／jpeg；規則只允許本人讀寫刪 `<自己的 id>/avatar.webp` 這一個名字（比既有桶更嚴：沒有別的資料夾、別的名字、`..`）。
- `orphan_user_avatars()`：沒有任何 `user_profiles` 列指向的檔案（刪帳號只帶走列，不帶走檔案），給伺服器的 asset-sweeper 每天清（和技能 zip 同一套，`ASSET_SWEEP=delete` 才真的刪）。
- **套用順序：** 先套測試站，確認後才套正式站（2026-10-27 寫好；套測試站時 Supabase 跳出需要 Allen 確認的提問，還沒套）。

## 3. 頁面（`src/app/ui/user-avatar/`、`src/styles/user-avatar.css`）

- `avatar-store.js`：不依賴瀏覽器。讀 `user_profiles` 與 Google 照片（登入工作階段的 `user_metadata.avatar_url`／`picture`，只收 `https://`）、下載頭像、上傳（`upsert` 同一個檔名）、回到預設（先清列、再刪檔案）。顯示優先序：自選頭像 → Google 照片 → 名字第一個字。最後一張頭像以帳號 id 為鍵存在瀏覽器（`noureon.userAvatar.v1.<id>`），開頁立刻顯示，版本不同才重抓；換帳號不會看到上一個人的。
- `user-avatar.js`：兩處圓形都由它畫（圖片填滿圓形；Google 照片載不出來就退回字母）；使用者頁的圓形右下角有小鉛筆：沒有自選頭像時直接開檔案選擇，有的話開小選單（更換頭像／使用 Google 頭像或移除頭像）。選了圖片開裁切視窗（Cropper.js，1:1，圓形導引），輸出 256×256 的 webp（瀏覽器做不出 webp 就是 png）；上限 10 MB、PNG／JPG／WebP／GIF。本機帳號（沒有雲端帳號）沒有鉛筆，只顯示字母。
- 接線：頁面知道是誰時發 `noureon:user-ready`（`app-bootstrap-lifecycle.js` 一次、`settings-sync-vault-controls.js` 每次整理使用者頁），頭像模組自己決定要不要重讀資料庫（同帳號一分鐘內不重讀）。`shell.js` 只加一行延遲載入。
- 文字：`avatar-texts.js`（五語言）。

## 4. 伺服器

- `server/avatar-files.js`：只能刪 `<人>/avatar.webp` 這個名字；`asset-sweeper.js` 多一輪 `orphan_user_avatars`（事件 `avatar_orphans_found`／`avatar_orphans_removed`／`avatar_sweep_failed`）。

## 5. 隱私

隱私政策五語言各加一句（Google 照片從 Google 的伺服器載入；自選頭像存在雲端私有桶、只有本人讀得到、可換可刪、刪除時一併刪檔案；只顯示給自己；瀏覽器也暫存一份）；`PRIVACY.md` 已重新產生。

## 6. 沒做、留意

- 備份匯出／匯入不含使用者頭像（它跟雲端帳號走，不是工作空間資料）。
- 瀏覽器暫存的頭像在登出後仍留在這個瀏覽器（以帳號 id 為鍵）；清除網站資料才會消失。
- 刪帳號後檔案由每日清理拿掉（先報告，`ASSET_SWEEP=delete` 才刪）。
- `shell.js` 離預算上限（53248 位元組）只剩約 460 位元組。

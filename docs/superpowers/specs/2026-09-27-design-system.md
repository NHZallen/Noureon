# 設計系統與 DocumentSpec（D1）

**日期：** 2026-09-27

**狀態：** D1 已完成（程式在 `src/app/ui/files/design/`，測試在 `tests/files/design-*.test.js`）。版型座標、字型嵌入與投影片預覽在 A4；範本挑選面板與 AI 調參數在 A4b。

**來源：** 使用者確認的第二版提案（第一版的 8 套風格被退回，要求參考各大設計廠商重做，並追加 20 套範本、AI 調參數與 5 種語言適配）。

## 目標

- 每份簡報依內容長得不一樣：AI 寫內容、選版型、調設計參數；位置、字級、配色與檢查由程式負責，所以任何組合都整齊。
- 任何參數組合都讀得清楚：文字與圖形的對比度由程式保證，AI 無法選出看不清楚的配色。
- 5 種介面語言（繁中、English、Français、Русский、Español）都適用，文件內容的語言也可以不同於介面語言。

## DocumentSpec

AI 在 ````file 名稱.pptx```` 區塊裡寫 JSON。不擅長 JSON 的小模型可以寫 Markdown（見〈Markdown 備援〉）。`parseDocumentSpec()` 讀取後，由 `normalizeDocumentSpec()` 產生乾淨的結構與一份修正清單（`issues`）。

```json
{
  "title": "2026 第三季亞太營運報告",
  "author": "Noureon 分析團隊",
  "date": "2026-10-05",
  "footer": "2026 Q3 營運報告 · 內部使用",
  "language": "zh-TW",
  "design": { "preset": "consulting", "accent": "#1B3A8C" },
  "slides": [
    { "layout": "cover", "kicker": "2026 第三季營運報告", "title": "亞太市場帶動第三季成長", "subtitle": "營收年增 7.3%，新加坡成長最快", "image": { "placeholder": "新加坡據點外觀" } },
    { "layout": "stats", "title": "本季重點數字", "stats": [{ "value": "2,630", "label": "營收（萬元）", "change": "+7.3%" }], "source": "資料來源：Noureon 財務部" }
  ]
}
```

### 整份

| 欄位 | 說明 |
|---|---|
| `title`、`subtitle`、`author`、`date`、`footer` | 封面與頁尾資訊；`date` 若是 `YYYY-MM-DD` 會依文件語言格式化 |
| `slideNumbers` | 是否顯示頁碼，預設 `true` |
| `language` | 文件語言（BCP 47）。沒寫時依內容文字判斷 |
| `design` | 設計參數，可只寫 `preset` 再覆寫幾項；也接受頂層的 `preset`／`style` 字串 |
| `designs` | 最多三組設計，供 A4b 挑選 |
| `slides` | 最多 60 張 |

### 每頁共同欄位

`layout`、`kicker`（小標）、`title`（寫結論，最多兩行）、`notes`（講者備註）、`source`（資料來源）、`background`（`default`／`accent`／`soft`）。

### 17 種版型

| 版型 | 主要欄位 | 內容不足時 |
|---|---|---|
| `cover` | `title`、`subtitle`、`kicker`、`image` | — |
| `agenda` | `items`（字串或 `{ title, description }`） | 改為 `bullets` |
| `section` | `title`、`subtitle`、`number`（沒寫時依序編號） | — |
| `bullets` | `bullets`（最多兩層）、`body`、`callout` | 沒有任何內容與標題時刪除該頁 |
| `split` | `body` 或 `bullets`、`image`、`imageSide` | — |
| `image` | `image`、`title`、`caption` | — |
| `twoColumn` | `columns`（`heading`、`items`、`body`） | 只有一欄改 `bullets`；三欄以上改 `cards` |
| `cards` | `cards`（`icon`、`label`、`title`、`body`） | 少於兩張改 `bullets` |
| `bigNumber` | `value`、`label`、`body`、`change` | 沒有數字改 `bullets` |
| `stats` | `stats`（`value`、`label`、`change`、`note`、`icon`） | 只有一個改 `bigNumber` |
| `timeline` | `steps`（`label`、`title`、`body`、`icon`） | 少於兩步改 `bullets` |
| `comparison` | `columns`（`heading`、`items`、`highlight`） | 只有一欄改 `bullets` |
| `quote` | `quote`、`attribution`、`role`、`image` | 沒有引言改 `bullets` |
| `gallery` | `images`（圖片＋`caption`） | 沒有圖改 `bullets` |
| `table` | `table`：物件、二維陣列或 Markdown 表格字串 | 沒有資料列改 `bullets` |
| `chart` | `chart`（與對話中的 ```` ```chart ```` 相同格式）、`takeaway` | 圖表無效改 `bullets`，重點變成條列 |
| `closing` | `bullets`、`contact`、`subtitle` | — |

- 沒寫 `layout` 或寫了別名時，依別名表或欄位推斷（例如有 `chart` 就是圖表頁、第一張是封面）。
- 每頁的建議容量（`LAYOUT_CAPACITY`）超過時記為 `over-capacity`，A4 的排版引擎會續頁；硬上限（`SPEC_LIMITS`）以外的內容會截掉並記錄。
- 表格的數字欄沒指定對齊時自動靠右。漲跌寫成 `+18%`／`-3.2%`，程式判斷方向並顯示 ▲▼，不用紅綠色。

### 圖片與圖示

- `"upload:N"` 或 `{ "upload": N }`：這段對話中使用者上傳的第 N 張圖。
- `"asset:檔名.png"`：方案 B 的程式產生的圖片。
- `{ "placeholder": "描述" }`：在 PowerPoint 裡可以替換的圖框。網址與「生成圖片」的要求一律變成圖框，檔案不從網路抓圖。
- 每份最多 20 張圖。
- `"icon"`：32 個名稱與常見別名（`growth` → `trending-up`、`money` → `coins`…）；圖形在 A4 加入。

## 設計參數（25 項）

範本與 AI 用的是同一組參數。`normalizeDesign()` 接受別名與錯誤型別（`"bold"`、`"centre"`、`"1.3x"`、`"lines, glow"`），換成最接近的合法值並回報；`describeDesignParameters()` 產生給模型的參數說明。

| 參數 | 可用的值 |
|---|---|
| `mode` | `light`、`dark` |
| `accent` | `#RRGGBB` |
| `accent2` | `#RRGGBB`，可為 null（由主色推算） |
| `background` | `neutral`、`warm`、`cool`、`tinted`、`accent` |
| `colorUse` | `restrained`、`balanced`、`vivid` |
| `fonts` | `modern`、`tight`、`geometric`、`condensed`、`editorial`、`modernSerif`、`consulting`、`classical`、`kai`、`rounded`、`plex`、`office` |
| `headingWeight` | `300`、`400`、`500`、`700`、`800`、`900`（再依字型組實際有的字重取最接近的） |
| `headingCase` | `normal`、`upper`（只影響西文與俄文） |
| `tracking` | `tight`、`normal`、`wide` |
| `typeScale` | 1.15～1.6 |
| `titleSize` | `regular`、`large`、`huge` |
| `density` | `compact`、`balanced`、`airy`（內文 16／18／20 pt 與對應的邊界、間距） |
| `align` | `left`、`center`（封面、章節、引言、結語） |
| `cover` | `type`、`split`、`bleed`、`band`、`frame` |
| `section` | `number`、`field`、`split`、`rule` |
| `imageShape` | `bleed`、`inset`、`rounded`、`arch`、`circle` |
| `motifs` | 最多 2 個：`rules`、`meta`、`grid`、`shapes`、`glow`、`frame`、`blob` |
| `labels` | `text`、`pill`、`tag`、`bracket` |
| `numbers` | `plain`、`padded`、`outline`、`circle` |
| `bullets` | `dot`、`square`、`dash`、`arrow`、`number` |
| `cards` | `flat`、`outline`、`line`、`shadow`、`glass` |
| `radius` | 0～28（pt） |
| `icons` | `none`、`line`、`badge` |
| `chart` | `accent`、`duo`、`categorical` |
| `imagery` | `none`、`some`、`rich` |

## 20 套範本

`reference` 只記在程式與文件裡，不出現在產品介面。名稱、特色與適用情境都有 5 種語言（`getPresetText()`）。預設範本是 `whitespace`。

| # | id | 名稱（zh-TW / en） | 參考 | 特色 |
|---|---|---|---|---|
| 1 | `keynote` | 發表會 / Launch | Apple product keynotes | 純黑底、超大置中標題、一頁一句話 |
| 2 | `whitespace` | 留白 / Whitespace | Apple Keynote "Basic White" | 白底、大量留白、沒有裝飾 |
| 3 | `consulting` | 顧問報告 / Consulting | McKinsey and BCG slide standards | 結論式標題、細線、段落追蹤、灰色加重點色的圖表 |
| 4 | `swiss` | 瑞士網格 / Swiss Grid | Figma Community "Design Review" and "Product Roadmap" | 黑底、緊湊無襯線字、四角小型資訊、細線 |
| 5 | `editorial` | 雜誌編輯 / Editorial | Pitch "Editorial" | 紙色底、全大寫襯線大標、滿版照片封面 |
| 6 | `softlight` | 柔光募資 / Soft Glow | Pitch "Scale-Up Pitch Deck" | 淡紫底、柔光漸層、細字重大標、半透明卡片 |
| 7 | `ainative` | AI 原生 / AI Native | Pitch "AI-Native Pitch Deck", Linear | 深藍黑底、紫藍柔光、格線、括號標籤 |
| 8 | `poster` | 大字海報 / Poster | Figma "Agency Pitch", Canva bold pitch decks | 整面橘色、壓縮全大寫標題、膠囊標籤 |
| 9 | `neon` | 螢光提案 / Neon | Figma "Startup Pitch" | 整面螢光黃、黑字、大圓角 |
| 10 | `noir` | 黑白極簡 / Noir | Canva black-and-white minimal, Figma "Voice of Customer" | 黑底白字，只有一個紅色重點 |
| 11 | `readout` | 研究筆記 / Research Notes | Figma "Research Readout" and "Product Review" | 淡藍紙底、等寬字標籤、內框、黃色重點 |
| 12 | `lecture` | 學術講堂 / Lecture | Google Slides "Simple Light" and academic conventions | 白底、宋體標題、編號清楚 |
| 13 | `material` | 活潑色調 / Tonal Play | Google Material 3 Expressive | 主色淡底、大圓角、幾何形、色調卡片 |
| 14 | `bauhaus` | 幾何色塊 / Geometric Blocks | Microsoft PowerPoint "Geometric color block", Bauhaus | 藍黃雙色、半圓與方塊、拱形圖片 |
| 15 | `classic` | 文藝典雅 / Classic | Microsoft PowerPoint "Floral flourish", Pitch "Lush Lux" | 深色底、古典明體、金色細框、置中 |
| 16 | `humane` | 溫暖人文 / Warm Humanist | Pitch "Infinite Hiatus", Canva cream neutral templates | 米色紙底、文楷、橄欖綠、拱形照片 |
| 17 | `playful` | 童趣圓體 / Playful | Canva education templates, Pitch "Virtual Team Games" | 天藍淡底、圓體字、有機形、圓圈編號 |
| 18 | `carbon` | 科技規格 / Tech Spec | IBM Carbon Design System, Pitch "Lattice" | 深灰底、細字重大標、格線、方角 |
| 19 | `brandbook` | 品牌手冊 / Brand Book | Figma "Brand Guidelines" | 深綠底配螢光綠、色塊標籤、角落資訊 |
| 20 | `office` | 通用相容 / Compatible | Microsoft Office default theme, Google Slides "Streamline" | 白底藍色、Office 內建字型、不放字型檔 |

## 配色

`buildPalette()` 由主色（與可選的輔色）、明暗與底色推算整組顏色：底色、卡片、線條、內文、次要文字、強調文字、色塊與色塊上的文字、淡色重點框、螢光筆標記、內框、柔光，以及 6 個圖表色。

- 在 OKLCH 中推算；不達標時只調整明度（超出 sRGB 時降低彩度），色相不變。
- 內文、次要文字、強調文字在底色、卡片與重點框上都至少 4.5:1；項目符號、線條、輔色與圖表色至少 3:1。
- 色塊上的文字選白色或深色中對比較高的一個，再把色塊明度推到 4.5:1。
- 底色是整面主色（`background: accent`）時：文字與標記改用文字色，強調改成螢光筆底線，色塊反轉成深色配主色字；卡片往遠離文字的方向調整。
- 圖表：`accent` 取主色深淺；`duo` 只有重點用主色、其他同一個灰；`categorical` 從主色與輔色出發取 6 個分得開的顏色。
- 測試涵蓋：20 套範本 × 淺色／深色、4 個 AI 示範組合 × 淺色／深色、16 個極端主色 × 5 種底色 × 2 種明暗 × 3 種圖表配色（480 組），全部達標。

## 字型

12 組字型，每組指定標題、內文、小標三個角色；每個角色有西文字型、需要時的西里爾字母替代字型，以及繁中、簡中、日文、韓文字型。

| 字型組 | 標題 | 內文 | 小標 | 中文 |
|---|---|---|---|---|
| `modern` | Inter | Inter | Inter | 思源黑體 |
| `tight` | Inter Tight | Inter | IBM Plex Mono | 思源黑體 |
| `geometric` | Manrope | Manrope | Manrope | 思源黑體 |
| `condensed` | Oswald | Inter | Inter | 思源黑體 |
| `editorial` | Playfair Display | Inter | Inter | 思源宋體（標題） |
| `modernSerif` | Instrument Serif（俄文改用 Playfair Display） | Inter | Inter | 思源宋體（標題） |
| `consulting` | Source Serif 4 | Source Sans 3 | Source Sans 3 | 思源宋體（標題）＋思源黑體 |
| `classical` | Cormorant Garamond | Inter | Inter | 仙人掌明體（標題） |
| `kai` | Lora | Lora | Lora | 霞鶩文楷 |
| `rounded` | Nunito | Nunito | Nunito | jf 粉圓 |
| `plex` | IBM Plex Sans | IBM Plex Sans | IBM Plex Mono | 思源黑體 |
| `office` | Aptos（沒有時 Calibri） | Aptos | Aptos | 微軟正黑體（不嵌入） |

- 簡中、日文、韓文沒有專屬的風格字型時，用同風格的思源黑體／宋體對應語言版。
- 西文與中文各自取最接近的實際字重，不會出現電腦合成的假粗體。
- 除 `office` 外都要子集化嵌入 PPTX（A4 先做可行性測試）。

## 文件語言

`language.js` 負責：

- **偵測**：有中文字就是中文（依常用字判斷繁簡），有假名是日文，有諺文是韓文，西里爾字母為主是俄文；拉丁字母沿用介面語言（介面是中文或俄文時視為英文）。
- **標點**：法文在「: ; ! ? %」前與書名號內側加窄的不換行空格。
- **引號**：繁中「」、英文 “”、法俄西 «»。
- **數字與日期**：百分比與 `YYYY-MM-DD` 日期依語言格式化；模型寫的數字原樣保留。
- **程式產生的文字**：續頁標記、預設目錄與結語標題、圖框提示、資料來源、頁碼格式，5 種語言都有，其他語言用英文。
- **容量換算**：版型的字數預算以中文為準，英文 × 2.1、其他拉丁與俄文 × 2.4。

## 文字排版

`text-layout.js` 提供排版引擎的文字部分：

- **量測**：瀏覽器用 canvas 以實際字型量寬度（有快取）；測試用每個字元的估計寬度。
- **斷行**：中文以 `Intl.Segmenter` 斷詞，只在詞與詞之間換行；避頭尾（，。、）」不在行首，（「不在行尾）；西文在空白處換行，不斷字；法文窄空格黏住前後；過長的網址或單字才逐字切開。
- **縮字**：從設計字級逐級縮到最小字級（內文 14 pt、標題 22 pt、封面 30 pt），找出放得下的最大字級；仍放不下就標示溢出。
- **平衡換行**：標題維持行數但盡量讓每行一樣長，避免最後一行只剩一兩個字。
- **餘量**：以可用寬度的 92% 排版，吸收 PowerPoint 與瀏覽器的字型差異。

## 程式檢查

`quality-checks.js`，每次產生都做，不花 token，不阻擋下載。

| 檢查 | 條件 | 等級 |
|---|---|---|
| `text-overflow` | 最小字級仍放不下 | error |
| `text-shrunk` | 字級比設計值小 15% 以上 | fixed |
| `out-of-bounds` | 元素超出投影片（裝飾元素除外） | error |
| `overlap` | 文字框互相重疊 | error |
| `low-contrast` | 配色有任何一組未達標 | error |
| `layout-repetition` | 連續 3 頁同版型；或 6 頁以上內容頁有一半以上同版型 | warning |
| `orphan-title` | 標題最後一行只剩一兩個字或一個單字 | warning |
| `empty-section` | 章節頁後面直接接章節頁、結語或結尾 | warning |
| `dense-content` | 字數超過該版型預算的 1.25 倍 | warning |
| `low-resolution` | 圖片以 150 dpi 計算不到所需像素的 80% | warning |
| `layout-changed` | 內容不足而自動改版型 | fixed |

## 寬鬆解析與 Markdown 備援

- `relaxed-json.js` 接受註解、多餘與結尾逗號、單引號與全形引號、未加引號的鍵與值（含 `#1F4E9A` 這類色碼）、字串裡的換行、`True`／`None` 等寫法、錯誤的結尾括號，以及被截斷的回覆（自動補上結尾）；忽略 `__proto__` 等危險鍵。每一項修正都記在 `repairs`。
- `markdown-deck.js`：front matter 放整份資訊、`preset` 與任何設計參數；第一個 `#` 是封面（下一段是副標），之後的 `#` 是章節頁，`##` 是內容頁；清單、表格、```` ```chart ````、引用（最後一行 `— 姓名，職稱` 是出處）、`![說明](upload:1)` 圖片、以「備註：」「Notes:」等開頭的段落（講者備註）都會對應到欄位，版型由內容推斷。

## 後續階段

- **A4**：字型嵌入可行性測試；17 種版型的座標與各參數（封面構圖、章節構圖、裝飾、卡片、編號、圖片形狀）的呈現；圖示圖形；pptxgenjs 輸出；與輸出共用座標的投影片預覽；元素層級的程式檢查接上實際座標。
- **A4b**：設計面板（20 套範本縮圖、AI 調參數、25 項參數的手動微調與 5 種語言的參數名稱、三組 `design` 挑選）；套用後把 `design` 寫回訊息裡的檔案規格。
- **W2／A5**：Word 與 PDF 沿用同一組參數、配色與字型。

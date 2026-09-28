# 設計系統、DocumentSpec 與 PPTX 輸出（D1、A4）

**日期：** 2026-09-27

**狀態：** D1 與 A4 已完成（設計系統在 `src/app/ui/files/design/`，PPTX 輸出在 `src/app/ui/files/generators/pptx-*.js`，投影片預覽在 `src/app/ui/files/previews/slide-*.js`；測試在 `tests/files/design-*.test.js` 與 `tests/files/pptx-generation.test.js`）。A4b（製作前選擇簡報設計）也已完成，見「簡報設計的選擇」。

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
| `designs` | 選填的其他設計方向（最多三組）；沒有 `design` 時用第一組 |
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

- 簡中、日文、韓文用系統內建字型，不放字型檔：簡中微軟雅黑／宋體，日文 Yu Gothic／Yu Mincho，韓文 Malgun Gothic／Batang（依字型組的黑體或明體取用）。這三種語言的思源字型每套都超過 10 MB，放進網站不划算。
- 西文與中文各自取最接近的實際字重，不會出現電腦合成的假粗體。
- 字型檔放在 `src/assets/fonts/`（21 個檔，共約 23 MB），由 `scripts/build-fonts.mjs` 從 google/fonts 的固定版本下載並子集化。西文保留拉丁、Latin-1、拉丁擴充、西里爾字母、標點與符號；繁中保留 Big5 常用字（第一級 5401 字）、Big5 符號、中文標點與全形字。這些檔是帶雜湊的建置資源，產生簡報時才下載，之後由 service worker 快取。
- 除了 `office` 與系統字型，其他字型都會子集化嵌入 PPTX（見下方「PPTX 輸出」）。

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
- **餘量**：以可用寬度的 92% 決定字級與行數，吸收 PowerPoint 與瀏覽器的字型差異。
- **斷行寫進檔案**：PowerPoint 會在任兩個中文字之間斷行，引擎只在詞與詞之間斷。所以標題、三行以內的文字和所有中文，都把引擎的斷行用 `<a:br/>` 寫進檔案，並關閉自動換行。畫出的每一行只用 97% 寬度，PowerPoint 不會再折行。較長的西文段落則交給 PowerPoint 自動換行。
- **標題斷詞**：平衡換行時把連續的單字詞合併成一段。ICU 字典沒收錄的繁中詞（如「營收」）因此不會被拆開。
- **孤字**：中文最後一行只剩一兩個字時，重新平均分配各行。西文最後一行只有一個單字，而且短於最長一行的 40%，才算孤字。

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

## PPTX 輸出（A4）

流程是 `parseDocumentSpec` → `layoutPresentation` → `writePresentation`：

- `layoutPresentation`（`slide-engine.js`、`slide-layouts.js`）排出 17 種版型。單位是點，投影片為 960 × 540。
- `writePresentation` 先用 pptxgenjs 產生檔案，再修改 XML。
- 投影片預覽直接畫同一份排版結果，所以預覽和檔案的位置、字級、斷行一致。

- **元素**：文字、形狀、線、圖片、圖示、圖表、表格、光暈。形狀有圓角、拱形、有機形、橢圓，可以加漸層、陰影、旋轉。
- **續頁**：清單超過容量時平均分到數頁。表格每頁 8 列，並加上「（續）」標記。條列頁仍然放不下時再拆一次。
- **行距**：一律寫固定行距（`spcPts`），不用倍數。PowerPoint 的單行行距取決於各字型的上升高度，而西文與中文字型差很多。第一條基線在「上緣 + 行距 × 0.75」，預覽也照這個規則畫；行高 1.12 時與 PowerPoint 差約 1 pt。
- **字型嵌入**：
  - 每個用到的字重都用 HarfBuzz 子集化，固定成靜態字重（PowerPoint 不支援可變字型）。
  - 重建 name 表，改成 Office 字型名，再存成 EOT（`ppt/fonts/fontN.fntdata`）。
  - 400、700 以外的字重用獨立的家族名，例如 `Inter Light`。中文字重和西文粗體槽位衝突時，中文改用「字型名 Bold」或「字型名 Regular」。
  - 子集包含實際文字的大寫與小寫、Latin-1 與法文連字，並一律保留整組可列印 ASCII。
  - 文件有中文字時才嵌入中文字型。
- **圖表**：
  - 能用原生圖表的類型都寫成可編輯的原生圖表：長條、直方、漏斗、堆疊、折線、面積、環圈、散佈、泡泡、雷達、瀑布。瀑布圖用一個透明的底層系列做成。
  - PowerPoint 沒有的類型改放聊天介面畫出的圖片：熱度圖、樹狀圖、桑基圖、盒鬚圖、甘特圖、儀表、KPI。
  - 預覽依同一份原生圖表定義畫示意圖。
- **圖片**：
  - `upload:N` 是這段對話中使用者附加的第 N 張圖片。程式從頁面上的附件讀取，不連網。
  - 不是 PNG 或 JPEG 的圖片會轉成 PNG，長邊上限 2400 px。檔案與預覽共用同一份解析結果。
  - 找不到的圖片和 `placeholder` 都會變成可替換的佔位圖（虛線框、相片圖示與說明）。在 PowerPoint 按「變更圖片」時，大小、裁切與形狀都會保留。
- **講者備註**：`notes` 寫進每頁的備忘稿。
- **失敗處理**：字型載入或子集化失敗時不嵌入字型，照樣產生檔案。

PowerPoint 實測結果：用 COM 把 6 份簡報匯出成 PDF 檢查，包括 whitespace 繁中、swiss 英文、softlight 繁中、bauhaus 法文、poster 繁中、classic 俄文。

- 嵌入的中文字型在編輯畫面與 PDF 匯出都正常。`Slide.Export` 匯出 PNG 時不用嵌入字型，所以不能拿來檢查字型。
- 圖表座標軸不用嵌入字型，因此圖表文字一律用系統字型：Arial，加上微軟正黑體、微軟雅黑、Yu Gothic 或 Malgun Gothic。
- Playfair Display 是 Office 雲端字型，已安裝的電腦會改用雲端版本。
- 子集只有部分數字時，PowerPoint 會把數字量得比畫出來寬，所以一律保留 0–9 和整組 ASCII。
- 法文的窄不換行空格：字型沒有這個字元時改用一般不換行空格，否則 PowerPoint 會留下很寬的空隙。
- 上傳圖片在圓角與滿版框裡都以置中方式裁切，不會變形。

授權：所有字型都是 SIL OFL，包括 jf 粉圓、霞鶩文楷、仙人掌明體；`LICENSES.txt` 和字型檔放在一起。嵌入文件的子集沿用原字型名。Playfair Display、Source 系列與 IBM Plex 帶有保留字型名稱（Reserved Font Name），上線前建議再確認文件內嵌的子集是否需要改名。

## 簡報設計的選擇（A4b）

使用者在請 AI 做簡報之前就決定設計，模型寫簡報時直接套用：

- **位置**：輸入框「＋」旁的「簡報設計」按鈕，外觀與「推理深度」按鈕相同，電腦版與手機版都在同一格。按鈕文字固定是「簡報設計」，目前的選擇顯示在提示文字與選單的勾選狀態。
- **選項**：「AI 自適應」（預設）或 20 套範本之一。範本以示範封面（介面語言）畫成縮圖，只載入西文字型；選單與它的樣式在第一次打開時才載入。
- **保存**：存在對話的 `deckDesign`（`auto` 或範本 id），和推理深度一樣只存在本機；每個對話各自記住。
- **提示詞**：AI 自適應時，簡報提示詞附上 25 項參數的可用值與說明，要求模型寫出完整的 `design`；指定範本時要求寫 `{ "preset": "…" }`，不沿用對話裡之前檔案的設計。不另外呼叫模型。
- **範本強制套用**：模型曾經寫了範本又用前一份簡報的設計把它蓋掉，所以指定範本時，回覆存進訊息前由程式改寫（`deck-template-enforcer.js`）：簡報規格的設計只留範本與主色、輔色，字型、明暗、版面、裝飾一律照範本，已串流的畫面會重畫。使用者可以在對話裡要求改顏色（模型只在最新一則訊息要求時寫 `accent`／`accent2`）；其他改動範本做不到，模型會建議改用 AI 自適應。
- 原本規劃的「產生後的設計面板」與「AI 給三組方向再挑選」依使用者決定不做。

## Word 文件設計（W2）

Word 文件和簡報一樣可以在製作前選設計；寫法仍是 Markdown，設計寫在最上面的 front matter。**沒有寫任何設計鍵的文件維持 W2 之前的外觀**（`legacyDocumentTheme`），舊對話裡的檔案不會變樣。

- **選擇位置**（2026-09-28 使用者確認）：輸入框的按鈕改名為「設計」（不加符號），打開後分「簡報」「Word 文件」兩個分頁，各自記住選擇；存在對話的 `deckDesign` 與 `documentDesign`（`auto` 或範本 id）。按鈕提示文字顯示兩者的目前選擇。
- **9 套 Word 範本**（`document-presets.js`，使用者確認「Word 專用的一組」）：

| id | 名稱 | 參考 | 重點 |
|---|---|---|---|
| standard | 標準 | Microsoft Word 預設樣式（Office 主題、Aptos） | Office 內建字型、不嵌入字型、藍色標題 |
| elegant | 典雅 | Word 樣式集「Basic (Elegant)」 | Cormorant Garamond 標題＋Source Serif 內文、大寫加寬字距、置中封面 |
| lines | 線條 | Word 樣式集「Lines (Simple)」＋封面「Sideline」 | 標題下方細線、標題區左側直線 |
| monochrome | 黑白 | Word 樣式集「Black & White (Classic)」 | 純黑白、襯線字、置中封面 |
| spearmint | 薄荷 | Google Docs「Spearmint」系列 | 薄荷綠標題、淺色表頭 |
| geometric | 幾何 | Google Docs「Geometric」系列 | 封面主色幾何色塊、標題左側色條 |
| swiss | 瑞士 | Google Docs「Swiss」、國際主義字體排印 | 粗體無襯線字、大字封面、紅色點綴 |
| academic | 學術 | Apple Pages「Essay」、APA 第 7 版 | 12 點襯線字、兩倍行距、首行縮排、APA 標題頁、頁碼在右上 |
| technical | 技術 | IBM Carbon（IBM Plex） | 藍色封面色帶、清楚的表格與程式碼 |

- **18 項文件參數**（`document-design.js`）：accent、accent2、fonts、headingWeight、headingCase（normal／upper／smallcaps）、tracking、headingColor、headings（plain／rule／bar／shaded／centered）、titleAlign、cover（none／block／page／band／shapes／title）、bodySize、lineSpacing、paragraphSpacing、paragraphs（spaced／indented）、typeScale、tables（grid／lines／shaded）、margins、pageNumber（footer／header）。字型組沿用簡報的，另加 `book`（全 Source Serif）與 `garamond`；配色沿用 `buildPalette`（文件一律淺色）。
- **標題層級**：模型通常用 `##` 寫章節，所以標題的大小與裝飾依「文件實際用到的最高層級」排名套用（`topLevel`），不是固定套在 Heading 1。
- **行距**：Word 的「單行」高度依字型差很多，中文字型還會多加約 30%（實測 Word for Microsoft 365，12 pt：Inter 1.2 em、Source Sans 3 1.4 em、Noto Sans TC 1.9 em、Noto Serif TC 1.85 em、LXGW 1.7 em、Huninn 1.45 em）。`lineSpacing` 定義為「1.2 em 的倍數」，產生時依內文字型換算給 Word 的倍數；中文與英文文件因此行距一致。系統字型當作 1.2，所以「標準」的 1.15 就是 Word 自己的 1.15。
- **封面**：page／band／shapes／title 是獨立一節（沒有頁首頁尾、不編頁碼），之後的頁碼從 1 開始、總頁數用本節頁數。band 與 shapes 的色塊用無框表格加固定列高畫成（Word 與預覽都能正確顯示），該節左右上邊界為 0；block 是第一頁上的標題區，左側直線用單格表格的左框，避免各家軟體把段落框線畫成斷開的線段。
- **表格**：lines 樣式的粗細線放在儲存格上（預覽和 LibreOffice 會把表格上下框線畫到每一列）。
- **字型嵌入**（使用者確認「嵌入」）：Word 用混淆的 TrueType（`word/fonts/*.odttf`，前 32 位元組與 GUID 反序 XOR，ECMA-376 Part 1 §17.8.1），寫進 `fontTable.xml`（含 embedRegular／embedBold 與 fontKey）、關聯檔、`settings.xml` 的 `embedTrueTypeFonts`／`saveSubsetFonts`。子集與簡報共用 `prepareEmbeddedFamilies`，一般中文文件約多 130～200 KB。docx 函式庫內建的嵌入只有一般字重，所以自己寫（`embedFontsInDocument`）。注意 docx 函式庫把空的關聯清單寫成自我結束的標籤，要先展開才能加入關聯（否則 Word 說檔案毀損）。
- **預覽**：Blob 帶 `documentFonts`（嵌入的同一批子集）與 `documentLayout.cover`。預覽在 shadow root 內，Chrome 不套用那裡的 `@font-face`，所以字型以每次預覽專屬的名稱（`Noureon Doc N 字型`）註冊到整頁的 `document.fonts`，並把 XML 裡的字型名稱換成這個名稱；關閉時移除。中文行高乘上 Word 的東亞字型額外行距（1.31）。封面依節的垂直對齊顯示，頁碼跳過封面。
- **範本強制套用**：指定 Word 範本時，回覆存進訊息前 `enforceDocumentTemplate` 把 front matter 改成只有 `template: …` 加主色、輔色（保留 title、toc、orientation 等文件資訊）。
- **選單縮圖**：`document-thumbnail.js` 以同一個 theme 畫出第一頁（封面或標題區、標題樣式、表格樣式），內文以線條表示，和 Word 範本庫的縮圖一樣。
- **已知限制**：用 Word「另存 PDF」時，襯線中文子集（Noto Serif TC、Cactus）在 PDF 的文字層會變成錯誤字元且檔案變大（畫面正確，Word 內文字也正確）；黑體（Noto Sans TC）正常。原因未查明，A5 做 PDF 時一併處理。

## 後續階段

- **A5**：PDF 沿用 Word 的文件參數、配色與字型（W2 已完成，見上節）。

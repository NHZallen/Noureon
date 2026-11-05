# 動態招呼語（時段、星期、深夜、節日）設計與實作紀錄

2026-11-05，Allen 要求：空對話的招呼語隨日期、星期、節日、時間變換。Allen 的決定：手機維持隱藏（手機本來就不顯示招呼語）；每個有 i18n 的語言都本地化；語氣簡潔溫暖；不做開關（招呼語本來就不能關）；名字「看情況帶」；節日只放真的知名的、不放婦女節、重陽節這類；深夜要有「夜貓子」之類的說法。

## 1. 做法

- 純前端、純本機：只用這台裝置的時間與時區，不問任何資料、不送出任何東西（隱私與法律文件不用改）。
- `src/app/ui/greeting/greeting.js`：引擎（純函式）。`pickGreeting({ date, language, name, timeZone })` 回傳 `{ text, kind, id }`；`greetingHtml()` 是畫面用的（已跳脫 HTML，沒有該語言文字或出錯時退回原本的 `名字, 有什麼可以為您服務的嗎？`）。`message-list-lifecycle.js` 只換了那一行。
- `src/app/ui/greeting/greeting-texts.js`：每個語言自己的文字與節日表（`GREETING_TEXTS`，登記在 `scripts/language-split-modules.json`，所以頁面只載入目前語言）。節日規則是純資料（日期、第 n 個星期幾、農曆、復活節前後、時區前綴），不是函式，建置才切得開。
- 選句：節日 > 深夜（0 到 5 點，夜貓子）> 時段（5-9、9-12、12-14、14-18、18-22、22-24）加上當天星期特色（週一、週五、週六、週日）。同一天同一小時的句子固定（不會每開一個新對話就換），下一小時或隔天才換。
- 名字：句子裡有 `{name}` 才帶（約三分之二的句子有），沒有名字時連同前面的逗號乾淨拿掉；名字是 email 時只用 @ 前面的部分。

## 2. 各語言的節日（只放知名的）

| 語言 | 節日 |
|---|---|
| 繁體中文（台灣） | 除夕、春節（初一至初三）、元宵、元旦、跨年夜、情人節、母親節、父親節（8/8）、端午、七夕、中秋、國慶日、萬聖節、平安夜、聖誕 |
| English | Lunar New Year、New Year、New Year's Eve、Valentine's、St. Patrick's、Easter、Mother's Day（歐洲時區不放，英國是另一天）、Father's Day（澳紐不放）、July 4 與 Thanksgiving（只在美國時區）、Halloween、Christmas Eve、Christmas |
| Français | Jour de l'An、Saint-Valentin、Pâques、Fête du Travail、Fête des mères（五月最後一個週日；遇聖靈降臨節改六月第一個週日）、Fête de la Musique、Fête des pères、14 juillet、Halloween、Toussaint、Réveillon 12/31 與 12/24、Noël |
| Русский | Новый год（含 31 日）、Рождество（1/7）、14 февраля、23 февраля、8 Марта、Пасха（東正教復活節）、1 мая、9 мая、День России、1 сентября、День матери |
| Español | Año Nuevo、Reyes（1/6）、San Valentín、Semana Santa、Pascuas、Día del Trabajo、Día de la Madre（西班牙五月第一個週日、墨西哥 5/10、其他五月第二個週日）、Día del Padre（西班牙 3/19、其他六月第三個週日）、Halloween、Día de Muertos（墨西哥時區 11/1–2）或 Todos los Santos、Nochebuena、Navidad、Nochevieja |

地區用瀏覽器的時區判斷（`Intl.DateTimeFormat().resolvedOptions().timeZone`）；農曆用瀏覽器內建的 `Intl` 中國曆，不用年表；復活節兩種都用公式算。

## 3. 已知限制

- 農曆需要瀏覽器有 `Intl` 的中國曆（現代瀏覽器都有）；沒有時農曆節日就不會出現，招呼語照常。
- 東正教復活節公式適用 1900 到 2099。
- 同語言不同地區（例如簡體或港澳的中文、加拿大的英文）沒有各自的節日表；加新語言時在 `greeting-texts.js` 加一個語言即可。
- 句子是人工寫的，不用模型生成（要金鑰、成本、延遲、品質不穩）。法文、俄文、西班牙文的句子請母語者看過更好。

## 4. 測試

`tests/greeting.test.js`：曆法（復活節、第 n 個週幾、農曆）、時段、夜貓子、同小時同句、星期特色、各語言節日（含時區條件）、法國母親節每年剛好一天且不在聖靈降臨節、名字的放法、五語言每天每小時（有名字與沒名字）都有乾淨的句子、HTML 跳脫與退回舊句子。瀏覽器（Chromium、假時鐘）看過：深夜、春節、一般下午、聖誕、週五。

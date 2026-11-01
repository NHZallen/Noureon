# 一般對話的影片與錄音（讓不收影片的模型也能看、能聽文字）— 設計（只有設計，還沒寫程式）

2026-11-01，Allen 的要求：所有對話（不只專案）都能附影片；用跟專案一樣的「向量＋切片段＋截圖」方式，**模型自己挑要看哪裡**；能看不了圖片的模型照舊不支援；**能加音轉文字就加**，這樣錄音也能用；附件上顯示「模型怎麼看了這支影片」的標示；理事會一起支援。

## 1. 別家怎麼做（查到的，部分是二手資料，標明來源）

- **Gemini（官方做法）**：影片整支送進去，每秒取 1 張畫面（每張約 258 tokens）、聲音約每秒 32 tokens，提示裡用 `MM:SS` 指定時間；長度靠 1M／2M 的上下文（約 1／2 小時）；已知時間戳會飄約 1 秒。（[二手整理](https://www.s-anand.net/blog/how-does-gemini-process-videos/)、[Google 聲音文件](https://ai.google.dev/gemini-api/docs/generate-content/audio)：可要求某段 `02:30` 到 `03:29` 的逐字稿。）
- **ChatGPT**：二手資料說是固定間隔抽畫面，再加上聲音轉文字（沒有官方文件可引，不確定）。
- **Claude API**：二手資料說只收圖片、PDF、文字，不收影片與聲音（我沒能對到 Anthropic 現在的文件，**不確定**）。
- **社群做法**（[claude-real-video](https://www.everydev.ai/tools/claude-real-video)）：用 ffmpeg 做場景切換偵測抽畫面、靜止畫面只留一張，加上 Whisper 逐字稿，一起丟給模型。
- 共同點：**畫面（抽樣）＋帶時間的逐字稿**。我們多的是：**模型能用工具再回頭看某一秒**（這是專案已經做好的 `view_project_file`），不用一次把畫面全塞進去。

## 2. 做法：把「專案檔案工具」搬到對話附件

專案已有：切片段（影片 30 秒、聲音 60 秒、掃描 PDF 逐頁）、向量（Gemini Embedding 2）、`search_project_files`／`read_project_file`／`view_project_file`、頁面（ffmpeg.wasm）和伺服器（ffmpeg）兩邊都能跑。對話附件用**同一套**：

- 附件當「檔案條目」：影片／聲音／掃描 PDF 是媒體條目（有長度、頁數），逐字稿是文字條目（用同一個 BM25 搜尋、能 `read` 一段）。`createProjectFilesLoader` 原樣用，名字改叫「這則對話的檔案」，工具名稱不變（`view_project_file` 等）。
- 碎片編號用 `src:att-<檔案 hash 前綴>:v<秒>`；雲端的 `match_project_vectors` 不用改（來源編號本來就可以是任何字串）。
- 向量**沿用同一個同意開關**（設定裡的「依語意搜尋」＋金鑰）。**沒開向量時**：模型照樣有 `view_project_file`（給秒數看畫面）、有逐字稿可以搜；只是不能「用語意找哪一秒有狗」。目錄裡會寫長度，並先給模型一張**接觸表**（6 張均勻畫面，約 6 張圖的 token）當起點。
- **模型本來就收影片的**（Gemini、Nemotron 等）：維持整支原樣送，不動。看不到圖片的模型：告訴使用者「這個模型看不到圖片，所以看不了影片」。
- 檔案從哪讀：頁面端用本機副本（IndexedDB／記憶體）；伺服器回覆用雲端儲存的 `${userId}/${hash}`（附件上雲端的路徑跟專案原檔同一個規則，要再確認）。本機帳號只在頁面跑。
- 一般對話的附件有「影片 1／共 2」的編號標籤（`attachment-labels.js`），工具的 `file` 參數接受這個名字。
- **畫面上**：附件下面一行小字「模型用工具看這支影片（可看到的畫面：…）」；步驟列沿用「查看了…」；理事會成員一樣拿到（看得懂圖的成員有 `view_project_file`，其他成員只有搜尋與逐字稿）。

## 3. 音轉文字（STT）

### 選項（查到的）

| 方案 | 價錢／限制 | 備註 |
|---|---|---|
| OpenRouter `POST /api/v1/audio/transcriptions`（[公告](https://openrouter.ai/announcements/announcing-audio-apis)） | Whisper 約 0.006 美元／分；Voxtral Mini 約 0.003 美元／分；Fish Audio Transcribe 1 約 0.0001 美元／秒（有字級時間戳）；Whisper 單檔 25 MB | base64 送，WAV／MP3／FLAC；專案已經有 OpenRouter 金鑰這個供應商 |
| OpenAI 直連（[說明](https://help.openai.com/en/articles/7031512-whisper-audio-api)） | whisper-1、gpt-4o-transcribe 約 0.006 美元／分；單請求 25 MB；有人回報 gpt-4o-transcribe 約 8 到 9 分鐘後輸出被截斷（[論壇](https://community.openai.com/t/gpt-4o-transcribe-truncates-output-after-8-9-minutes-even-on-short-segments/1354656)） | 長檔一定要切段 |
| Gemini 聲音理解（[文件](https://ai.google.dev/gemini-api/docs/generate-content/audio)） | 用 `generateContent` 加提示轉逐字稿，可指定 `MM:SS` 範圍 | 跟向量同一把 Gemini 金鑰；文件註明即時轉錄不支援；準確度與時間戳要自己驗 |
| 瀏覽器裡跑 Whisper（transformers.js） | tiny 約 75 MB、base 約 140 到 200 MB（[Remotion 的清單](https://www.remotion.dev/docs/whisper-web/get-available-models)） | 不用金鑰、不傳出去；手機慢、中文品質普通；要第一次下載 |

### 建議
- **用使用者自己的金鑰**，順序：OpenRouter 轉錄 → OpenAI → Gemini；沒有任何一把就不轉（錄音只能找位置，就像現在）。瀏覽器 Whisper 當之後可選的「完全不外傳」模式，這版不做。
- **切段**：沿用我們已經會切的 16 kHz 單聲道 WAV，每段 **5 分鐘不重疊**（約 9.6 MB，遠低於 25 MB；也避開 8 到 9 分鐘截斷的問題）；每段的文字前面加段落起點，輸出成 `[12:30] 文字…` 的行，這樣逐字稿自己就有時間，模型能對到 `view_project_file` 的 `at`。
- **同意**：送聲音給第三方轉錄是**新的資料流**，要有自己的開關（設定 → 隱私），開啟前列出「會把聲音送到 XXX（用你的金鑰），約 N 分鐘、約 N 美元」，跟向量的同意分開。關閉就刪掉已轉的逐字稿快取。隱私政策、協助中心五語言要加。
- **逐字稿存哪**：頁面用 IndexedDB 依檔案 hash 快取；伺服器回覆時，逐字稿以文字條目放進請求（單條 100,000 字元、總計 400,000 的上限內，大約 1 個多小時的演講）。雲端同步的存放要不要做，之後再說。
- **成本與上限**：每個檔最多轉 60 分鐘；顯示「轉文字中」；失敗就當沒有逐字稿，不擋回覆。

## 4. 階段

- **P1**：一般對話的影片與掃描 PDF（工具搬過來：目錄、接觸表、`view_project_file`、向量）＋附件小標示。純網頁加伺服器接線，不需要新金鑰。
- **P2**：音轉文字（供應商、同意、切段、逐字稿條目、設定頁、隱私文件五語言）＋錄音可用。
- **P3**：專案的影片與錄音也轉逐字稿（同一個模組）。
- **P4**：理事會成員拿到對話檔案工具（頁面與伺服器兩條路，跟專案那次一樣）。
- 之後可選：瀏覽器 Whisper。

## 5. 需要 Allen 決定的

1. 音轉文字的供應商順序（OpenRouter → OpenAI → Gemini）可以嗎？要不要把瀏覽器 Whisper 排進這一輪？
2. 轉文字要「開關打開就自動轉」，還是每次附檔都先問一次（顯示估價）？建議開關打開後自動轉，單檔上限 60 分鐘。
3. 沒開向量時給模型一張 6 張畫面的接觸表當起點，可以嗎？
4. 逐字稿放在頁面快取與請求裡就夠，還是要同步到雲端？
5. 理事會成員：看不到圖的成員只拿搜尋與逐字稿，可以嗎？

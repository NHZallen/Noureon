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

## 6. Allen 的決定（2026-11-02）與選定的轉錄模型

1. 供應商順序 OpenRouter → OpenAI → Gemini **照舊，再加瀏覽器裡跑 Whisper**（這一輪就做，當最後一個選擇，也是沒有任何金鑰時唯一的選擇）。
2. 開關打開後**自動轉**（單檔上限 60 分鐘）。
3. 沒開向量時先給模型 6 張畫面的接觸表當起點。
4. 逐字稿要**同步到雲端**：存在附件的訊息（`part.transcript`）或專案來源（`source.transcript`）的紀錄裡，跟著對話與專案一起同步，不另開資料表（不用 migration）。
5. 理事會裡看不到圖的成員只拿搜尋與逐字稿。

**選定的模型**（OpenRouter 的公開模型清單查過，價錢是每秒）：
- OpenRouter：`openai/whisper-large-v3`（約 0.027 美元／小時；Whisper 最大的多語言模型）。備選 `openai/whisper-large-v3-turbo`（更便宜、品質略低）、`qwen/qwen3-asr-1.7b`（中文可能更好，沒試過）。
- OpenAI 直連：`whisper-1`。
- Gemini 直連：`gemini-3.5-flash-lite`（用 `generateContent` 加提示轉逐字稿）。
- 瀏覽器：`onnx-community/whisper-base`（transformers.js，`q8` 量化，CPU 單執行緒；模型約 80 MB 第一次從 Hugging Face 抓，函式庫與 WebAssembly 約 14 MB 來自本站）。**已在真的 Chromium 驗過**：11 秒的英文錄音完整轉對，含載入模型共約 19 秒。限制：不會自動判斷語言（不給就當英文），所以用畫面語言當提示（繁中／英／法／俄／西）；中文輸出可能是簡體。
- 切段改成**每段 1 分鐘、不重疊**（原本寫 5 分鐘，太粗：時間只準到 5 分鐘）；每段約 1.9 MB，遠低於各家 25 MB 上限，也避開 gpt-4o-transcribe 8 到 9 分鐘截斷的問題；最多 60 段（60 分鐘）。
- OpenRouter 的轉錄請求格式我**查不到官方文件**（公告頁讀不到），所以 `stt-clients.js` 先送 JSON（`input_audio`），被拒（400／415／422）就改送 multipart 檔案，記住成功的那一種；`scripts/stt-probe.mjs` 讓 Allen 用真的金鑰跑一次確認。

## 7. 進度

- 完成：`src/app/runtime/transcription/`（四個供應商、切段、逐字稿、瀏覽器 Whisper）與測試；`vercel.json` 的 `connect-src` 加 `https://huggingface.co https://*.hf.co`；套件 `@huggingface/transformers` 4.3.2。
- 還沒做：設定頁的開關與同意說明（新的資料流）、逐字稿存進附件／專案來源、一般對話附件的檔案工具（P1）、專案與理事會（P3、P4）、隱私政策與協助中心五語言。

### 步驟 1 做完了（設定開關 + 一般對話的錄音與影片逐字稿）

- 設定 → 記憶 多一張「語音轉文字」卡（`transcription-card.js`）：預設關閉，開啟要同意（說明聲音送去哪裡；API 與瀏覽器 Whisper 兩種文案），可換方式、可關閉；設定存在記憶的設定裡（`settings.transcription`，跟著帳號同步）。
- `page-transcription.js`：開啟後，送出訊息前（`single-model-response-lifecycle.js`，顯示「正在把錄音和影片裡說的話轉成文字」與進度）替沒有逐字稿的錄音與影片補上 `part.transcript`（`{text, model, at}`，存在訊息的那一段裡，跟對話一起同步）；每個檔案只轉一次，失敗就不轉、下次再試。
- `transcript-parts.js`（頁面與伺服器共用）：不能直接收這種檔案的模型，請求裡用逐字稿文字取代檔案（`provider-request-support.js` 的 `buildSingleModelTranslatedRequestParts`，伺服器回覆的文件準備步驟也跑同一段）。本來就收錄音的模型（Gemini 等）維持整檔送。
- 還沒有的：影片的畫面（步驟 2）；逐字稿很長時目前整段放進請求（上限 6 萬字元，超過截斷並註明），搜尋與讀一段的工具等步驟 2 一起做；理事會（步驟 4）；專案（步驟 3）。

### 真金鑰試過的結果（Allen 跑 `scripts/stt-probe.mjs`，2026-11-02）

- **OpenAI `whisper-1`**：成功（約 3 秒），英文測試句轉對。
- **OpenRouter `openai/whisper-large-v3`**：第二次成功（0.85 秒），英文測試句轉對，所以請求格式可用；第一次回 429「OpenRouter could not verify available credits for this request in time. Retry shortly.」（暫時性）。→ 三家的客戶端都改成遇到 429／500／502／503／504 等 1.5 秒、再等 4 秒各重試一次（最多三次），401／402／403 不重試。
- **Gemini `gemini-3.5-flash-lite`**：回 409 `{"error":"ambiguous_account","provider":"google"}`，不是 Google 標準的錯誤格式，看起來是 Allen 那把金鑰（或中間的閘道）的帳號問題，不是我們的請求格式問題；Gemini 在順序裡排第三，先不處理。`stt-probe.mjs` 多了 `STT_GEMINI_MODEL` 環境變數，想換模型 id 試時用。

### 步驟 2a 與伺服器端語音轉文字做完了（2026-11-02）

- **對話附件的影片**（`messages/chat-video.js`）：看得到圖片、會呼叫工具、但不能整支收影片的模型，請求裡的影片換成一則說明（名字、長度、怎麼用 `view_project_file`、有逐字稿就附上），訊息本身仍留著影片。頁面第一次會用 ffmpeg 量長度與 sha256（存在 `part.mediaInfo`，跟訊息同步）。工具直接用專案那一套：`createProjectFilesAccess({ attachments })`（不在專案裡的對話也行）。伺服器回覆時，頁面先把影片存到雲端（`serverReply.keepFile`，路徑 `<user>/<sha256>`），請求只帶 `tools.projectFiles.media`（`kind: 'video'`、`fileHash`、`duration`），伺服器從雲端讀檔取畫面；存不上去就在頁面做回覆。**還沒做：影片的向量片段與語意搜尋（沒開向量時模型靠秒數與逐字稿；步驟 2b）、接觸表。**
- **伺服器端語音轉文字，關掉頁面也會繼續**（`server/transcribe-parts.js`）：請求新增 `tools.transcription: { provider: 'openrouter' | 'openai' | 'gemini' | 'whisper' }` 與 `secrets.sttKey`（只在這一則回覆用、不保留；Whisper 不需要）。轉文字開著而且回覆交給伺服器時，頁面不先轉，伺服器在「準備檔案」那一步（`document-prep.js`）：附件的錄音與影片切成一分鐘一段（伺服器的 ffmpeg）→ 供應商或伺服器上的 Whisper → 帶時間的逐字稿，代替檔案放進請求；影片被工具看的，逐字稿另外加一段文字（`media[].transcribe`），從雲端副本讀檔。頁面看得到步驟「正在把錄音和影片裡說的話轉成文字」（`dp: 'transcribing'`）。伺服器轉的逐字稿**只用在那一則回覆、不存回訊息**（頁面開著也一樣，之後同一個檔案再附會再轉一次）。伺服器做不了（沒有雲端帳號、太大、伺服器沒回應）就退回頁面轉（`speechHere`）。
- **伺服器上的 Whisper**（`server/whisper-runner.js`）：跟瀏覽器同一個模型（`onnx-community/whisper-base` q8），用 `@huggingface/transformers` 的 Node 版（onnxruntime-node，只留 Linux x64，不要 GPU 函式庫）。第一次用才載入、閒置 10 分鐘釋放（約 700 MB 記憶體）、一次只做一段；模型在建映像時抓進 `/app/.whisper`（`Dockerfile`、`server/whisper-download.mjs`，抓不到也不擋建置）。在這台 CPU 上試過：11 秒錄音約 2 秒轉完。**映像會變大約 200 MB，要重新建映像。**
- 設定頁與隱私政策、協助中心五語言都改成：Whisper 在頁面做回覆時在瀏覽器跑、聲音不離開裝置；伺服器做回覆時聲音送到 Noureon 的伺服器在那裡跑 Whisper，只用在那一則回覆、不保留。
- 真金鑰試過：OpenAI、OpenRouter、Gemini 都成功（Gemini 的 409 是 Allen 的測試環境注入金鑰的問題，不是程式）。

### 設定位置與 Whisper 大小（2026-11-02，Allen 決定）

- 語音轉文字的設定從「記憶」搬到**模型管理頁，API 金鑰下面**（`settings-speech-section.js`），存在 `config.speechToText`（`{ enabled, consentAt, provider, whisperSize }`，`data/speech-settings.js`），不再依賴記憶開關（原本記憶關掉時根本打不開）。
- Allen 貼來一段錄音在 `whisper-base` 轉成「把鑊子放在鑊子上…」不斷重複的亂碼（Whisper 小模型的重複迴圈，對短錄音、有停頓、非英文特別容易發生）。處理：**換較大的 Whisper**。預設改成 `small`（約 250 MB；在這台 CPU 上 11 秒錄音約 3.4 秒，記憶體約 1.3 GB；用一段中間有停頓、同一句重複兩次的測試音檔，base 只轉出第一句，small 兩句都轉出來），設定可選 `small`／`base`。伺服器映像內建 `small`（`base` 第一次用到才抓，快取目錄給 `node` 使用者寫入），瀏覽器第一次用才下載。請求 `tools.transcription.model`（`'base'`／`'small'`，只給 `whisper`）。
- 還沒做（Allen 這次沒選）：靜音段不送去轉、偵測重複並改用較大模型或有金鑰的供應商重試、「聽不清楚」標示、可選口說語言。注意：只用 `no_repeat_ngram_size` 擋重複會把真的重複的句子也吃掉（用測試音檔試過）。

## 8. Whisper 的防護與口說語言（2026-11-01，Allen 說「依序全部做完」）

- `transcription/speech-guards.js`（頁面與伺服器共用）：
  - **靜音不送**：一段聲音的最大振幅低於 0.01 或平均能量低於 0.003（約 -40／-50 dBFS）就當成沒有聲音，不送給任何供應商，Whisper 也不載入模型（小 Whisper 會從靜音或雜訊編出字，也省錢）。不是 16 位元單聲道 WAV 的檔案照舊送出。
  - **重複迴圈**：同一個詞組連續出現很多次（單字 8 次、2～3 字 5 次、更長 4 次）才算迴圈；說了兩次的句子不算。Whisper 轉出迴圈時，用 `repetition_penalty: 1.3` 重轉一次，還是迴圈就只留一次。供應商（API）轉出的迴圈也只留一次（`transcribe-file.js`）。只用 `no_repeat_ngram_size` 會把真的重複的句子吃掉，所以不用。
- **口說語言**：設定（模型管理 → 語音轉文字卡）多一排選項：跟隨畫面（預設）、中文、English、日本語、한국어、Français、Русский、Español、Deutsch；存在 `config.speechToText.language`。選了語言就當提示傳給 Whisper（瀏覽器與伺服器）和 OpenRouter／OpenAI（Gemini 不用）；沒選時 Whisper 用畫面語言，API 供應商自己判斷。請求 `tools.transcription.language`（選用，不在清單的值會被拒絕）。
- 預設仍是 Whisper（Allen 決定，有金鑰也不自動改用 API）。

## 9. 專案裡的影片與錄音有逐字稿（步驟 3）

- 逐字稿存在專案來源上（`source.transcript { text, model, at }`，`project-source-model.js` 驗證，只給有 `file` 的來源，隨專案同步，不需要 migration）；空字串表示「聽過了，沒有人說話」，不會再轉。
- `projects/project-transcripts.js`：語音轉文字開著時，背景一個一個替沒有逐字稿的影片與錄音轉（來源變動、剛開啟語音轉文字、頁面啟動後 10 秒會觸發；失敗的檔案這次開頁面期間不再試）；轉完由 `actions.setTranscript` 存起來並通知向量重建。頁面要開著才會轉。
- 逐字稿在工具眼裡是一個獨立的文字來源 `<來源 id>~tr`，名稱「<檔名> (transcript)」（`transcriptSourcesOf`，每次由來源算出，不另外存）：`search_project_files` 搜得到、`read_project_file` 讀得到、進向量（`src:<id>~tr:<n>`），一行行 `[m:ss] 文字` 讓模型知道要去影片的哪一秒看；伺服器回覆則直接拿到它的文字。

## 10. 對話影片的向量（步驟 2b）與理事會（步驟 4）

- **2b**：訊息裡已經量過的影片（`part.mediaInfo`，由 `chat-video.js` 量）也切成 30 秒的窗進向量，piece id `src:att-<hash 前 16 碼>:v<秒>`，跟專案影片同一套（`project-pieces.js` 的 `chatVideoSourcesOf`；已刪除與暫時對話不處理；單檔不超過 30 MB）。所以 `search_project_files` 可以用語意找「哪一秒有狗」，雲端同步與伺服器回覆（`match_project_vectors`）不用改。沒量過的影片仍只整支當一個向量（原本的 `media-pieces.js`）。**接觸表（6 張畫面）沒做**：不給 `at` 時 `view_project_file` 本來就給整支均勻 4 張。
- **4**：理事會成員拿到訊息裡影片的工具（頁面開會與伺服器開會兩條路都有）：訊息裡有影片時，用 `prepareChatVideos(parts, null, true, { all: true })`（每支影片都取，不論成員的模型收不收影片）量好，伺服器開會時先 `keepFile` 把影片存到雲端（存不上去的不列出），再把它們當 `attachments` 交給 `createProjectFilesAccess`；成員自己的模型決定能不能用 `view_project_file`（看得到圖的才有），其他成員只有搜尋與逐字稿。沒有專案的對話也行。成員收到的訊息本身不變（原本的翻譯員流程照舊）。

## 11. 網址來源與研究報告加入專案（2026-11-02，Allen 的決定）

- **網址來源**（Allen：不檢查，貼上就好，顯示網站 icon，單純讓模型可索取）：
  - 資料：`source.kind: 'url'` 加 `source.url`（`data/project-source-url.js`：只收 http／https、不收帳密、沒寫協定就補 `https://`、上限 2000 字元；標題預設是「網站名 + 路徑」）。只存網址，不存網頁內容，隨專案同步，沒有 migration；算在 20 個來源裡。
  - 介面：加來源選單「新增網址」（手機、電腦、新專案對話框的暫存清單都有）；表單只檢查格式，不連線；來源列的小圖示是瀏覽器直接向該網站要 `/favicon.ico`（`referrerPolicy: no-referrer`），載入前或失敗顯示地球圖示（跟處理面板的來源小圖示同一個做法）。
  - 模型：不進搜尋、不進向量（沒有存內容）。目錄列出「網頁（只存網址）」，模型用 `read_project_file`（給名稱或網址）才去抓，結果一次最多 12,000 字、可用 `start` 往後讀；每則回覆只抓一次。
  - 讀取：用「讀網頁」服務（`createWebResearchTools.fetchPageContents`，Tavily 或 TinyFish，使用者自己的金鑰），上限 10 萬字（`data/project-link-read.js`）。頁面端由 `runtime/projects/page-reader-ref.js` 取得（`model-request-engine.js` 設定）；伺服器端（單一模型與理事會成員）用請求帶來的金鑰讀。沒有金鑰就告訴模型「沒有讀網頁服務的金鑰」；讀不到就告訴模型「現在讀不到」。因為是服務去抓，不是我們的伺服器去連，沒有伺服器端請求偽造（SSRF）的風險。
  - 請求（相容性）：`tools.projectFiles.entries[]` 多一種 `{ id, name, size: 0, url }`（只收正規化後的 http／https 網址）；專案有網址來源時，頁面才把搜尋金鑰（`secrets.searchKey`）與 `tools.searchProvider` 帶給伺服器（沒開網頁搜尋也一樣）。舊伺服器看到未知欄位會拒絕，頁面退回本機回覆。
  - 隱私政策五語言多一段：網址只存網址；讀頁面時網址送到你選的讀網頁服務；網站小圖示由瀏覽器直接向網站取得。
- **研究報告加入專案**（Allen 選 A：報告卡上的按鈕）：
  - 報告卡的選單與閱讀器的選單多一項「加入專案」→ 小視窗選專案（最新的 30 個）→ 把報告存成 `.md` 檔案來源（`ui/research/research-project.js`；內容跟「匯出 Markdown」一樣，含尾端的引用清單，所以內文的 `[3]` 在專案裡找得到網址）。
  - 走一般的檔案加入流程（`runtime/projects/projects-api.js` 的 `addFile`）：文字檔當文字讀、可搜尋、可進向量；超過單一來源 10 萬字會截斷並提示；專案已有一模一樣的文字就提示「已經有這份報告了」；來源滿了（20 個）提示「來源已滿」。
  - 還沒做：專案內做深度研究時自動加入（Allen 說先做按鈕）。

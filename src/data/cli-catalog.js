// The official CLI tools ("命令工具"): the ones the owner puts in the CLI store (docs/superpowers/specs/2026-10-04-cli-store-design.md).
// A tool is a manifest: what it is called, who made it, where its program comes from (with the hash the file must have), what the
// model is told about using it. The page shows the names and descriptions; the server fetches the program and puts it in a sandbox.
// Both sides read this one list, so it may not use the browser (the server reaches it: scripts/server-shared-modules.json).

export const CLI_PLATFORM = 'linux-x64';

/** Where the program of an official tool may be downloaded from (the final address after redirects). */
export const CLI_DOWNLOAD_HOSTS = Object.freeze(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

/** Where the picture of a tool (its project's logo) may be loaded from: GitHub's pictures of a project's owner. A tool without one shows the terminal glyph. */
export const CLI_ICON_HOSTS = Object.freeze(['github.com', 'avatars.githubusercontent.com']);

/** The biggest download a tool may have (bytes). */
export const CLI_MAX_PROGRAM_BYTES = 150 * 1024 * 1024;

/** The biggest program that is taken out of an archive (bytes, once unpacked): Pandoc is 35 MB to download and 165 MB unpacked. */
export const CLI_MAX_UNPACKED_BYTES = 400 * 1024 * 1024;

// What a tool is: 'binary' (a program that is one file, fetched from where its makers publish it; when the download is a .tar.gz the artifact says
// which file in it is the program, `archive`), 'pip' (a Python package, installed once on the host and shared) or 'image' (a program that is in the
// sandbox's image already, such as SoX from Debian: nothing is fetched, the store only tells the model about it). `status`: 'ready' (it can be used now) or 'soon' (it is listed, but needs what a later stage of the
// store brings). `needs` says what a tool asks of the sandbox: 'network' (it reaches sites, which the person is asked about) and 'credentials'
// (the person's secure credentials, `credentials`, which the server puts in the tool's environment).
const KINDS = Object.freeze(['binary', 'pip', 'image']);
const STATUSES = Object.freeze(['ready', 'soon']);
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
/** What a secure credential is, so the person is asked for the right thing (a token, a cookie or a password) and not "a password" for everything. */
export const CREDENTIAL_TYPES = Object.freeze(['token', 'cookie', 'password']);

// What the server can make a login file of (see server/cli-credentials.js).
const CREDENTIAL_FILE_FORMATS = Object.freeze(['rdt-cookies']);

export const OFFICECLI_USAGE = `officecli reads, creates and edits Word (.docx), Excel (.xlsx) and PowerPoint (.pptx) files. No Office is installed; it is one program.
Work in /output (files there are given to the user) and read the user's files from /input (read only: copy a file to /output before changing it).
Start with \`officecli help\`; \`officecli help docx\`, \`officecli help xlsx\`, \`officecli help pptx\` list the elements and \`officecli help docx paragraph\` shows the properties of one. When unsure about a property or a value, run help instead of guessing. Add --json for structured output.

Create and read:
  officecli create report.docx            (type from the extension: .docx .xlsx .pptx)
  officecli view report.docx outline|stats|issues|text|annotated|html
  officecli get report.docx '/body/p[3]' --depth 2 --json
  officecli query report.docx 'paragraph[style=Heading1]'
  officecli validate report.docx

Change (paths use a stable id such as /body/p[@paraId=1A2B3C4D] when one is given; prefer those over positions):
  officecli add report.docx /body --type paragraph --prop text="Summary" --prop style=Heading1
  officecli add slides.pptx / --type slide --prop title="Q4 report"
  officecli add slides.pptx '/slide[1]' --type shape --prop text="Revenue +25%" --prop x=2cm --prop y=5cm --prop size=24
  Every slide gets a real title, made with the slide: --prop title="..." (add --prop layout="Title and Content" --prop text="..." for a body placeholder). A title written in a text box or shape is not a title: PowerPoint's outline, thumbnails and navigation then show the slide as "(untitled)" (check with: officecli view slides.pptx outline). Use shapes and text boxes only for the other elements of a slide.
  officecli set data.xlsx /Sheet1/A1 --prop value="Name" --prop bold=true
  officecli set report.docx '/body/p[@paraId=1A2B3C4D]' --prop text="New text"
  officecli remove report.docx '/body/p[@paraId=1A2B3C4D]'

Every command saves the file. After a series of commands, \`officecli validate <file>\` and \`officecli view <file> issues\` find problems to fix. Design it as a professional would: a clear hierarchy, one restrained palette, consistent spacing.`;

const FFMPEG_USAGE = `ffmpeg converts, trims, joins and re-encodes audio and video (a static build: the program is one file; there is no ffprobe).
Read the user's files from /input (read only) and write every result to /output. Always name an output file, add -y to overwrite and -hide_banner -loglevel error to keep the output short.
A step may run for at most about two minutes (give timeout_seconds up to 120): work on short clips, a lower resolution or a fast preset (-preset veryfast) for long files, and say so when a file is too long.
Leave only the finished file in /output (no intermediate files), and keep it under 50 MB: a larger file is not delivered, so lower the resolution or the bitrate (-crf 28, -vf scale=-2:480) when the result would be bigger.

  Convert / compress video:   ffmpeg -y -i /input/in.mov -c:v libx264 -crf 23 -preset veryfast -c:a aac /output/out.mp4
  Audio only:                 ffmpeg -y -i /input/in.mp4 -vn -c:a libmp3lame -q:a 2 /output/audio.mp3
  Trim without re-encoding:   ffmpeg -y -ss 00:00:10 -to 00:00:30 -i /input/in.mp4 -c copy /output/clip.mp4
  Resize:                     ffmpeg -y -i /input/in.mp4 -vf scale=-2:720 /output/small.mp4
  Frames / thumbnails:        ffmpeg -y -i /input/in.mp4 -vf fps=1 /output/frame_%03d.png      (one frame: -frames:v 1)
  GIF:                        ffmpeg -y -i /input/in.mp4 -vf "fps=12,scale=480:-1" /output/out.gif
  Join files of the same kind: put "file '/input/a.mp4'" lines in /output/list.txt, then ffmpeg -y -f concat -safe 0 -i /output/list.txt -c copy /output/joined.mp4
  What a file holds:          ffmpeg -hide_banner -i /input/in.mp4 2>&1   (it lists the streams, then complains that there is no output: that is expected)`;

const YTDLP_USAGE = `yt-dlp downloads video and audio from many sites (it is run as a Python program and reaches the sites through the network that the person allows).
Deliver ONE finished file and leave nothing else in /output: ask for MP4 straight away, keep scratch files in /work (-P "temp:/work"), and delete anything else it left in /output (a .webm or .m4a source, .part files, subtitles that were not asked for) with rm before you answer.
  Video (MP4):         yt-dlp -P "temp:/work" -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b" --merge-output-format mp4 -o "/output/%(title).80B.%(ext)s" "URL"
                       (joining a separate video and audio needs the ffmpeg tool; when it is not among the tools, use a single-file format: -f "b[ext=mp4]/b")
  Audio as mp3:        yt-dlp -P "temp:/work" -x --audio-format mp3 -o "/output/%(title).80B.%(ext)s" "URL"     (the conversion needs the ffmpeg tool)
  A limit on quality:  -f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]"
  Only one video:      add --no-playlist. Subtitles only: --write-subs --sub-langs "en.*,zh.*" --skip-download
  What exists:         yt-dlp -F "URL"      Information only: yt-dlp -J --no-playlist "URL"
Mind the time of a step (at most about two minutes: give timeout_seconds up to 120) and the size: a file larger than 50 MB is not delivered to the user, so for anything long choose a lower quality (720p or 480p) or only the audio, and say so.`;

const TWITTER_USAGE = `twitter reads and writes on X (Twitter) with the person's own login (the credentials are in the environment as TWITTER_AUTH_TOKEN and TWITTER_CT0). Add --json for structured output and --max N to limit how many.
  twitter feed [-t following]        the home timeline         twitter bookmarks
  twitter search "query" -t Latest --max 30 [--from handle --lang en --since 2026-01-01]
  twitter tweet <id or url>          a tweet with its replies  twitter user <handle>   twitter user-posts <handle> --max 20
  twitter followers <handle>         twitter following <handle>
  Writing (only when the person asked for it): twitter post "text" [--image file], twitter reply <id> "text", twitter like <id>, twitter retweet <id>, twitter bookmark <id>, twitter follow <handle>.
Known problem (X's redesign, Aug 2026): "twitter search" fails with HTTP 404 and the warning "Failed to init ClientTransaction ... 'group'". Do not retry it; tell the person search is not working at the moment and offer user-posts, tweet or user instead.`;

const RDT_USAGE = `rdt reads and writes on Reddit with the person's own login. Add --json (or --yaml) for structured output and --compact to save space.
  rdt feed [--subs-only]      rdt popular      rdt all      rdt sub <name> [-s top -t week]      rdt sub-info <name>
  rdt search "query" [-r subreddit -s top -t year]      rdt read <post id> [--expand-more]      rdt show <number from the last list>
  rdt user <name>      rdt user-posts <name>      rdt user-comments <name>
  Writing (only when the person asked for it): rdt upvote <n>, rdt save <n>, rdt subscribe <name>, rdt comment ...`;

const CSVKIT_USAGE = `csvkit is a set of command line tools for CSV files (it is already installed). Read the user's files from /input and write results to /output.
  csvstat /input/data.csv                 the type, range and most common values of each column
  csvcut -c name,price /input/data.csv    pick columns (csvcut -n lists them)      csvgrep -c city -m Taipei /input/data.csv    filter rows
  csvsort -c price -r /input/data.csv     sort                                     csvjoin -c id a.csv b.csv    join on a column
  csvsql --query "select city, count(*) from data group by city" /input/data.csv     run SQL on a file
  in2csv /input/book.xlsx > /output/book.csv    convert Excel or JSON to CSV       csvjson /input/data.csv > /output/data.json    CSV to JSON
Redirect results into /output; use csvlook to print a small table as text.`;

const PANDOC_USAGE = `pandoc converts documents between many formats (Markdown, Word, HTML, LaTeX, EPUB, PDF, ...).
  pandoc /input/in.docx -t markdown -o /output/out.md       pandoc /input/in.md -o /output/out.docx
  pandoc /input/in.md -s -o /output/out.html                 pandoc /input/in.md --toc -o /output/out.epub
  pandoc --list-input-formats / --list-output-formats list what it can read and write.
PDF: LaTeX is installed (XeLaTeX), so pandoc can write a PDF. Always name the engine and a font for Chinese, Japanese and Korean, else the text is lost:
  pandoc /input/in.md -o /output/out.pdf --pdf-engine=xelatex -V CJKmainfont="Noto Sans TC" -V geometry:margin=2.5cm [--toc] [-N]
  Fonts that exist: Noto Sans TC, Noto Serif TC, Noto Sans SC, Noto Sans JP, Noto Sans KR (CJKmainfont), Inter (mainfont). Without any CJK text leave -V CJKmainfont out.
A PDF takes a while (give timeout_seconds 120). If it fails, read the last lines of the error (a missing LaTeX package, a character the font does not have) and try again or make a Word or HTML file instead.`;

const SOX_USAGE = `sox is the Swiss army knife of sound: it converts, trims, mixes and applies effects to audio files.
  sox /input/in.wav /output/out.mp3        sox /input/in.wav /output/short.wav trim 0 30        sox /input/in.wav /output/loud.wav gain -n -3
  sox /input/a.wav /input/b.wav /output/joined.wav       sox --i /input/in.wav (what a file holds)       sox /input/in.wav -n stat (levels)`;

/** The tools of the store. Frozen: nothing changes them while the program runs. */
export const OFFICIAL_CLI_CATALOG = Object.freeze([
  Object.freeze({
    id: 'officecli',
    name: 'OfficeCLI',
    icon: 'https://github.com/iOfficeAI.png?size=96',
    kind: 'binary',
    status: 'ready',
    version: '1.0.153',
    author: 'iOfficeAI',
    license: 'Apache-2.0',
    homepage: 'https://github.com/iOfficeAI/OfficeCLI',
    category: 'documents',
    description: Object.freeze({
      'zh-TW': '建立、讀取與修改 Word、Excel、PowerPoint 檔案，不需要安裝 Office。',
      en: 'Create, read and edit Word, Excel and PowerPoint files without Office installed.',
      fr: 'Créer, lire et modifier des fichiers Word, Excel et PowerPoint sans Office.',
      ru: 'Создание, чтение и редактирование файлов Word, Excel и PowerPoint без установленного Office.',
      es: 'Crea, lee y edita archivos de Word, Excel y PowerPoint sin tener Office instalado.'
    }),
    artifacts: Object.freeze({
      [CLI_PLATFORM]: Object.freeze({
        url: 'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.153/officecli-linux-x64',
        sha256: 'dc1bf7ec9e0bf3ac45c5bd32934842ca2f8939775660526e057642ea68606a80',
        size: 35416933,
        file: 'officecli'
      })
    }),
    // What the program needs in the sandbox: no globalization data (the image has none), no update checks, no program left running in
    // the background that holds the file (every command writes it).
    details: Object.freeze({
      'zh-TW': 'OfficeCLI 讓 AI 直接建立、讀取與修改 Word、Excel、PowerPoint 檔案，不需要安裝 Office。適合製作報告、簡報與報表，或批次修改你上傳的檔案，做完後會自己檢查檔案有沒有問題。它在伺服器的獨立沙盒裡執行，本身用不到網路；做好的檔案會出現在回覆下方，可以直接下載。',
      en: 'OfficeCLI lets the AI create, read and edit Word, Excel and PowerPoint files without Office installed. It suits reports, presentations and spreadsheets, or changes to files you upload, and it checks the result for problems. It runs in an isolated sandbox on the server and does not need the network itself; the finished files appear under the reply, ready to download.',
      fr: 'OfficeCLI permet à l’IA de créer, lire et modifier des fichiers Word, Excel et PowerPoint sans Office installé. Il convient aux rapports, présentations et tableurs, ou à la modification de fichiers que vous envoyez, et il vérifie le résultat. Il s’exécute dans un bac à sable isolé sur le serveur et n’a pas besoin du réseau ; les fichiers terminés apparaissent sous la réponse, prêts à être téléchargés.',
      ru: 'OfficeCLI позволяет ИИ создавать, читать и изменять файлы Word, Excel и PowerPoint без установленного Office. Подходит для отчётов, презентаций и таблиц, а также для правки загруженных вами файлов; результат проверяется на ошибки. Работает в изолированной песочнице на сервере и сам не использует сеть; готовые файлы появляются под ответом и доступны для скачивания.',
      es: 'OfficeCLI permite que la IA cree, lea y edite archivos de Word, Excel y PowerPoint sin tener Office instalado. Sirve para informes, presentaciones y hojas de cálculo, o para modificar archivos que subas, y comprueba el resultado. Se ejecuta en un entorno aislado del servidor y no necesita red; los archivos terminados aparecen bajo la respuesta, listos para descargar.'
    }),
    env: Object.freeze({
      DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: '1',
      OFFICECLI_SKIP_UPDATE: '1',
      OFFICECLI_NO_AUTO_RESIDENT: '1'
    }),
    usage: OFFICECLI_USAGE
  }),
  Object.freeze({
    id: 'ffmpeg',
    name: 'FFmpeg',
    icon: 'https://github.com/FFmpeg.png?size=96',
    kind: 'binary',
    status: 'ready',
    version: '7.0.2',
    // The FFmpeg project publishes source code only: the program is the static build of John Van Sickle, as eugeneware/ffmpeg-static
    // publishes it on GitHub (its release b6.1.1).
    author: 'FFmpeg developers',
    license: 'GPL-3.0-or-later',
    homepage: 'https://github.com/FFmpeg/FFmpeg',
    category: 'media',
    description: Object.freeze({
      'zh-TW': '轉換、剪輯、合併與壓縮影片和音訊，也能擷取畫面與製作 GIF。',
      en: 'Convert, trim, join and compress video and audio; grab frames and make GIFs.',
      fr: 'Convertir, couper, assembler et compresser vidéo et audio ; extraire des images et créer des GIF.',
      ru: 'Конвертация, обрезка, склейка и сжатие видео и аудио; извлечение кадров и создание GIF.',
      es: 'Convierte, recorta, une y comprime vídeo y audio; extrae fotogramas y crea GIF.'
    }),
    artifacts: Object.freeze({
      [CLI_PLATFORM]: Object.freeze({
        url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64',
        sha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
        size: 79826272,
        file: 'ffmpeg'
      })
    }),
    details: Object.freeze({
      'zh-TW': 'FFmpeg 是處理影片與音訊的標準工具：轉換格式、剪裁片段、合併檔案、壓縮、抽出聲音、擷取畫面、製作 GIF。把影音檔附加到對話後，用 @ 選它並說明想怎麼處理。每一步最長約兩分鐘，所以建議處理短片或降低畫質。它在獨立沙盒裡執行；如果要處理網路上的檔案，連到該網站前會先問你。',
      en: 'FFmpeg is the standard tool for video and audio: convert formats, trim clips, join files, compress, extract sound, capture frames and make GIFs. Attach a media file to the conversation, choose it with @ and say what you want. A step may run for about two minutes, so work on short clips or a lower quality. It runs in an isolated sandbox; if it has to read a file from the internet, you are asked about that site first.',
      fr: 'FFmpeg est l’outil de référence pour la vidéo et l’audio : conversion de formats, découpe, assemblage, compression, extraction du son, capture d’images et création de GIF. Joignez un fichier à la conversation, choisissez l’outil avec @ et dites ce que vous voulez. Une étape dure environ deux minutes au plus : préférez de courts extraits ou une qualité réduite. Il s’exécute dans un bac à sable isolé ; s’il doit lire un fichier sur Internet, on vous demande d’abord l’autorisation pour ce site.',
      ru: 'FFmpeg — стандартный инструмент для видео и аудио: преобразование форматов, обрезка, склейка, сжатие, извлечение звука, снимки кадров и создание GIF. Прикрепите файл к разговору, выберите инструмент через @ и опишите, что нужно сделать. Один шаг длится не более двух минут, поэтому лучше работать с короткими фрагментами или снижать качество. Работает в изолированной песочнице; если нужно прочитать файл из интернета, сначала спросят вашего разрешения для этого сайта.',
      es: 'FFmpeg es la herramienta estándar para vídeo y audio: convierte formatos, recorta, une archivos, comprime, extrae el sonido, captura fotogramas y crea GIF. Adjunta un archivo a la conversación, elígela con @ y di qué quieres. Un paso puede durar unos dos minutos, así que conviene usar clips cortos o menor calidad. Se ejecuta en un entorno aislado; si tiene que leer un archivo de internet, primero se te pregunta por ese sitio.'
    }),
    env: Object.freeze({}),
    usage: FFMPEG_USAGE
  }),
  Object.freeze({
    id: 'yt-dlp',
    name: 'yt-dlp',
    icon: 'https://github.com/yt-dlp.png?size=96',
    kind: 'binary',
    status: 'ready',
    needs: Object.freeze(['network']),
    version: '2026.08.19',
    author: 'yt-dlp contributors',
    license: 'Unlicense',
    homepage: 'https://github.com/yt-dlp/yt-dlp',
    category: 'media',
    description: Object.freeze({
      'zh-TW': '從上千個網站下載影片與音訊，可選畫質、字幕與格式。',
      en: 'Download video and audio from thousands of sites, with a choice of quality, subtitles and format.',
      fr: 'Télécharger des vidéos et de l’audio depuis des milliers de sites, avec choix de la qualité, des sous-titres et du format.',
      ru: 'Загрузка видео и аудио с тысяч сайтов с выбором качества, субтитров и формата.',
      es: 'Descarga vídeo y audio de miles de sitios, con elección de calidad, subtítulos y formato.'
    }),
    // The program that is one Python file (it runs with the sandbox's Python; the one-file program for Linux unpacks itself into a folder
    // where the sandbox allows no programs to run).
    artifacts: Object.freeze({
      [CLI_PLATFORM]: Object.freeze({
        url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp',
        sha256: '1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6',
        size: 3072469,
        file: 'yt-dlp'
      })
    }),
    details: Object.freeze({
      'zh-TW': 'yt-dlp 可以從上千個網站下載影片、音訊與字幕，並能選擇畫質與格式，也能只查詢影片資訊。它需要連上網路：每個要連到的網站第一次都會先問你，你可以同意這一次、永遠同意或拒絕，之後也能在設定的「權限」裡調整。下載好的檔案會出現在回覆下方。請自行負責遵守各網站的使用條款與著作權，只下載你有權使用的內容。',
      en: 'yt-dlp downloads video, audio and subtitles from thousands of sites, with a choice of quality and format, and can also just look up a video’s details. It needs the network: you are asked about each site the first time (allow once, always allow, or refuse), and you can change that later under Permissions in the settings. The downloaded files appear under the reply. You are responsible for following each site’s terms of use and copyright law: only download what you have the right to use.',
      fr: 'yt-dlp télécharge vidéos, audio et sous-titres depuis des milliers de sites, avec choix de la qualité et du format, et peut aussi simplement consulter les informations d’une vidéo. Il a besoin du réseau : on vous demande l’autorisation pour chaque site la première fois (autoriser une fois, toujours autoriser ou refuser), et vous pouvez la modifier ensuite dans « Autorisations » des réglages. Les fichiers téléchargés apparaissent sous la réponse. Il vous appartient de respecter les conditions d’utilisation de chaque site et le droit d’auteur : ne téléchargez que ce que vous avez le droit d’utiliser.',
      ru: 'yt-dlp скачивает видео, аудио и субтитры с тысяч сайтов с выбором качества и формата, а также может просто показать сведения о видео. Ему нужна сеть: о каждом сайте вас спросят при первом обращении (разрешить один раз, всегда разрешать или отказать), а позже это можно изменить в разделе «Разрешения» в настройках. Скачанные файлы появляются под ответом. Вы сами отвечаете за соблюдение условий использования сайтов и авторских прав: скачивайте только то, что вправе использовать.',
      es: 'yt-dlp descarga vídeo, audio y subtítulos de miles de sitios, con elección de calidad y formato, y también puede solo consultar los datos de un vídeo. Necesita red: se te pregunta por cada sitio la primera vez (permitir una vez, permitir siempre o rechazar) y luego puedes cambiarlo en «Permisos» de los ajustes. Los archivos descargados aparecen bajo la respuesta. Eres responsable de cumplir los términos de uso de cada sitio y los derechos de autor: descarga solo lo que tengas derecho a usar.'
    }),
    env: Object.freeze({}),
    usage: YTDLP_USAGE
  }),
  Object.freeze({
    id: 'twitter-cli',
    name: 'twitter-cli',
    icon: 'https://github.com/public-clis.png?size=96',
    kind: 'pip',
    status: 'ready',
    needs: Object.freeze(['network', 'credentials']),
    version: '0.8.5',
    author: 'jackwener',
    license: 'Apache-2.0',
    homepage: 'https://github.com/public-clis/twitter-cli',
    category: 'social',
    description: Object.freeze({
      'zh-TW': '用你自己的帳號讀取 X（Twitter）的時間軸、搜尋、書籤與使用者，也能發文。',
      en: 'Read X (Twitter) timelines, search, bookmarks and users with your own account, and post.',
      fr: 'Lire les fils, la recherche, les signets et les profils de X (Twitter) avec votre compte, et publier.',
      ru: 'Чтение лент, поиска, закладок и профилей X (Twitter) с вашим аккаунтом, а также публикация.',
      es: 'Lee líneas de tiempo, búsquedas, marcadores y usuarios de X (Twitter) con tu cuenta, y publica.'
    }),
    pip: Object.freeze({ package: 'twitter-cli', version: '0.8.5', command: 'twitter' }),
    credentials: Object.freeze([Object.freeze({ env: 'TWITTER_AUTH_TOKEN', label: 'auth_token', type: 'token', site: 'x.com' }), Object.freeze({ env: 'TWITTER_CT0', label: 'ct0', type: 'cookie', site: 'x.com' })]),
    details: Object.freeze({
      'zh-TW': 'twitter-cli 用你自己的 X（Twitter）帳號讀取時間軸、搜尋、書籤與使用者，也能發文、回覆與按讚。它需要網路（連到 x.com 前會先問你），也需要你的登入憑證 auth_token 與 ct0：第一次用到時會跳出視窗請你輸入（之後可在設定的「權限」→「安全憑證」查看、更換或刪除）。憑證加密保存在伺服器，只在執行時使用，AI 看不到內容。請注意：X 的服務條款不允許自動化存取，帳號可能被限制；資料中心的網路位址也常被擋，所以不保證能用。 另外，X 改版後，搜尋目前常因此失敗（出現 404），要等工具更新才會恢復；讀取時間軸、使用者與貼文通常仍可用。',
      en: 'twitter-cli reads X (Twitter) timelines, search, bookmarks and users with your own account, and can post, reply and like. It needs the network (you are asked before it reaches x.com) and your login credentials, auth_token and ct0: a window asks for them the first time they are needed (you can then see, replace or delete them under Permissions → Secure credentials in the settings). They are kept encrypted on the server and only used while the tool runs; the AI never sees them. Note that X’s terms do not allow automated access, so the account may be restricted, and data-centre addresses are often blocked: it is not guaranteed to work. Also, since X’s redesign, search often fails right now (HTTP 404) until the tool is updated; reading timelines, users and posts usually still works.',
      fr: 'twitter-cli lit les fils, la recherche, les signets et les profils de X (Twitter) avec votre propre compte, et peut publier, répondre et aimer. Il a besoin du réseau (on vous demande avant qu’il n’accède à x.com) et de vos identifiants de connexion, auth_token et ct0 : une fenêtre les demande la première fois qu’ils sont nécessaires (vous pourrez ensuite les voir, les remplacer ou les supprimer dans Réglages → Autorisations → Identifiants sécurisés). Ils sont chiffrés sur le serveur et utilisés seulement pendant l’exécution ; l’IA ne les voit jamais. Attention : les conditions de X n’autorisent pas l’accès automatisé, le compte peut être restreint, et les adresses de centres de données sont souvent bloquées : le fonctionnement n’est pas garanti. De plus, depuis la refonte de X, la recherche échoue souvent actuellement (HTTP 404) jusqu’à la mise à jour de l’outil ; la lecture des fils, des profils et des publications fonctionne en général encore.',
      ru: 'twitter-cli читает ленты, поиск, закладки и профили X (Twitter) с вашим аккаунтом, а также может публиковать, отвечать и ставить отметки. Ему нужна сеть (перед обращением к x.com вас спросят) и данные для входа auth_token и ct0: окно запросит их при первой необходимости (позже их можно посмотреть, заменить или удалить в настройках: «Разрешения» → «Защищённые учётные данные»). Они хранятся на сервере в зашифрованном виде и используются только во время работы; ИИ их не видит. Учтите: условия X не разрешают автоматизированный доступ, аккаунт могут ограничить, а адреса дата-центров часто блокируются — работа не гарантируется. Кроме того, после обновления X поиск сейчас часто не работает (HTTP 404), пока инструмент не обновят; чтение лент, профилей и публикаций обычно по-прежнему работает.',
      es: 'twitter-cli lee líneas de tiempo, búsquedas, marcadores y usuarios de X (Twitter) con tu propia cuenta, y puede publicar, responder y dar me gusta. Necesita red (se te pregunta antes de que acceda a x.com) y tus credenciales de inicio de sesión, auth_token y ct0: una ventana te las pedirá la primera vez que hagan falta (después podrás verlas, reemplazarlas o eliminarlas en Ajustes → Permisos → Credenciales seguras). Se guardan cifradas en el servidor y solo se usan mientras la herramienta se ejecuta; la IA nunca las ve. Ten en cuenta que los términos de X no permiten el acceso automatizado, así que la cuenta puede ser restringida, y las direcciones de centros de datos suelen bloquearse: no se garantiza que funcione. Además, tras el rediseño de X, la búsqueda falla a menudo por ahora (HTTP 404) hasta que se actualice la herramienta; leer líneas de tiempo, usuarios y publicaciones suele seguir funcionando.'
    }),
    env: Object.freeze({}),
    usage: TWITTER_USAGE
  }),
  Object.freeze({
    id: 'rdt-cli',
    name: 'rdt-cli',
    icon: 'https://github.com/public-clis.png?size=96',
    kind: 'pip',
    // It reads its login from a browser on the machine it runs on, which a server has none of: the person's reddit_session cookie is
    // a secure credential, and the server writes the file the tool would have saved (credentialFiles) for the time a command runs.
    status: 'ready',
    needs: Object.freeze(['network', 'credentials']),
    version: '0.4.1',
    author: 'jackwener',
    license: 'Apache-2.0',
    homepage: 'https://github.com/public-clis/rdt-cli',
    category: 'social',
    description: Object.freeze({
      'zh-TW': '瀏覽 Reddit 的版面、貼文與留言、搜尋、查看使用者，也能投票與收藏。',
      en: 'Browse Reddit feeds, posts and comments, search, look up users, vote and save.',
      fr: 'Parcourir les fils, publications et commentaires de Reddit, rechercher, consulter des profils, voter et enregistrer.',
      ru: 'Просмотр лент, постов и комментариев Reddit, поиск, профили пользователей, голосование и сохранение.',
      es: 'Explora feeds, publicaciones y comentarios de Reddit, busca, consulta usuarios, vota y guarda.'
    }),
    pip: Object.freeze({ package: 'rdt-cli', version: '0.4.1', command: 'rdt' }),
    credentials: Object.freeze([Object.freeze({ env: 'REDDIT_SESSION', label: 'reddit_session', type: 'cookie', site: 'reddit.com' })]),
    credentialFiles: Object.freeze([Object.freeze({ path: '.config/rdt-cli/credential.json', format: 'rdt-cookies', from: 'REDDIT_SESSION' })]),
    details: Object.freeze({
      'zh-TW': 'rdt-cli 可以瀏覽 Reddit 的版面、貼文與留言、搜尋、查看使用者，也能投票與收藏。它需要網路（連到 reddit.com 前會先問你），也需要你的 Reddit 登入：它原本是從瀏覽器讀取登入，在伺服器上改用你提供的安全憑證，第一次用到時會跳出視窗請你輸入 reddit_session 這個 cookie 的值（瀏覽器開發者工具裡可以找到；之後可在設定的「權限」→「安全憑證」查看、更換或刪除）。憑證加密保存在伺服器，只在執行時使用，AI 看不到內容。請自行負責遵守 Reddit 的使用條款。',
      en: 'rdt-cli browses Reddit feeds, posts and comments, searches, looks up users, votes and saves. It needs the network (you are asked before it reaches reddit.com) and your Reddit login. It normally reads the login from a browser; on the server it uses a secure credential you provide instead: a window asks for the value of the reddit_session cookie the first time it is needed (found in your browser’s developer tools; you can then see, replace or delete it under Permissions → Secure credentials in the settings). It is kept encrypted on the server and only used while the tool runs; the AI never sees it. You are responsible for following Reddit’s terms of use.',
      fr: 'rdt-cli parcourt les fils, publications et commentaires de Reddit, recherche, consulte des profils, vote et enregistre. Il a besoin du réseau (on vous demande avant qu’il n’accède à reddit.com) et de votre connexion Reddit. Il lit normalement la connexion depuis un navigateur ; sur le serveur, il utilise à la place un identifiant sécurisé que vous fournissez : une fenêtre demande la valeur du cookie reddit_session la première fois qu’elle est nécessaire (visible dans les outils de développement du navigateur ; vous pourrez ensuite la voir, la remplacer ou la supprimer dans Réglages → Autorisations → Identifiants sécurisés). Il est chiffré sur le serveur et utilisé seulement pendant l’exécution ; l’IA ne le voit jamais. Il vous appartient de respecter les conditions d’utilisation de Reddit.',
      ru: 'rdt-cli просматривает ленты, посты и комментарии Reddit, ищет, показывает профили, голосует и сохраняет. Ему нужна сеть (перед обращением к reddit.com вас спросят) и ваш вход в Reddit. Обычно он берёт вход из браузера; на сервере вместо этого используются защищённые учётные данные, которые вы укажете: окно запросит значение cookie reddit_session при первой необходимости (его можно найти в инструментах разработчика браузера; позже его можно посмотреть, заменить или удалить в настройках: «Разрешения» → «Защищённые учётные данные»). Они хранятся на сервере в зашифрованном виде и используются только во время работы; ИИ их не видит. Вы сами отвечаете за соблюдение условий использования Reddit.',
      es: 'rdt-cli explora feeds, publicaciones y comentarios de Reddit, busca, consulta usuarios, vota y guarda. Necesita red (se te pregunta antes de que acceda a reddit.com) y tu inicio de sesión de Reddit. Normalmente lee el inicio de sesión de un navegador; en el servidor usa en su lugar una credencial segura que tú proporcionas: una ventana te pedirá el valor de la cookie reddit_session la primera vez que haga falta (se ve en las herramientas de desarrollo del navegador; después podrás verlo, reemplazarlo o eliminarlo en Ajustes → Permisos → Credenciales seguras). Se guarda cifrada en el servidor y solo se usa mientras la herramienta se ejecuta; la IA nunca la ve. Eres responsable de cumplir los términos de uso de Reddit.'
    }),
    env: Object.freeze({}),
    usage: RDT_USAGE
  }),
  Object.freeze({
    id: 'csvkit',
    name: 'csvkit',
    icon: 'https://github.com/wireservice.png?size=96',
    kind: 'pip',
    // A Python package: it is installed in the sandbox the first time, which needs pypi.org (allowed at first).
    status: 'ready',
    needs: Object.freeze(['network']),
    version: '2.2.0',
    author: 'wireservice',
    license: 'MIT',
    homepage: 'https://github.com/wireservice/csvkit',
    category: 'data',
    description: Object.freeze({
      'zh-TW': '處理 CSV 的一組工具：看欄位統計、挑欄位、篩選、排序、合併，還能用 SQL 查詢與轉成 JSON。',
      en: 'A set of tools for CSV files: column statistics, pick columns, filter, sort, join, run SQL and convert to JSON.',
      fr: 'Un ensemble d’outils pour les fichiers CSV : statistiques par colonne, sélection, filtre, tri, jointure, SQL et conversion en JSON.',
      ru: 'Набор инструментов для CSV: статистика по столбцам, выбор, фильтрация, сортировка, объединение, SQL и преобразование в JSON.',
      es: 'Un conjunto de herramientas para archivos CSV: estadísticas por columna, selección, filtros, orden, uniones, SQL y conversión a JSON.'
    }),
    pip: Object.freeze({ package: 'csvkit', version: '2.2.0', command: 'csvstat', commands: Object.freeze(['csvstat', 'csvcut', 'csvgrep', 'csvsort', 'csvjoin', 'csvsql', 'csvjson', 'csvlook', 'csvclean', 'csvformat', 'csvstack', 'csvpy', 'in2csv', 'sql2csv']) }),
    credentials: Object.freeze([]),
    details: Object.freeze({
      'zh-TW': 'csvkit 是一組處理 CSV 檔案的工具：統計每個欄位、挑選欄位、篩選與排序列、合併多個檔案、用 SQL 查詢，並在 Excel、JSON 與 CSV 之間轉換。適合整理與分析表格資料。它是 Python 套件，第一次使用時會在沙盒裡用 pip 安裝，需要連到 pypi.org（預設已允許，可在設定的「權限」裡調整）；處理你的資料本身不需要網路。',
      en: 'csvkit is a set of tools for CSV files: statistics for each column, picking columns, filtering and sorting rows, joining files, running SQL, and converting between Excel, JSON and CSV. It suits cleaning and analysing tables. It is a Python package that is installed with pip in the sandbox the first time, which needs pypi.org (allowed by default; you can change that under Permissions in the settings); working on your data does not need the network.',
      fr: 'csvkit est un ensemble d’outils pour les fichiers CSV : statistiques par colonne, sélection de colonnes, filtrage et tri des lignes, jointure de fichiers, requêtes SQL et conversion entre Excel, JSON et CSV. Il convient au nettoyage et à l’analyse de tableaux. C’est un paquet Python installé avec pip dans le bac à sable à la première utilisation, ce qui demande pypi.org (autorisé par défaut ; modifiable dans « Autorisations » des réglages) ; le traitement de vos données n’a pas besoin du réseau.',
      ru: 'csvkit — набор инструментов для CSV: статистика по столбцам, выбор столбцов, фильтрация и сортировка строк, объединение файлов, SQL-запросы и преобразование между Excel, JSON и CSV. Подходит для очистки и анализа таблиц. Это пакет Python, который при первом использовании устанавливается через pip в песочнице; для этого нужен pypi.org (по умолчанию разрешён, изменить можно в разделе «Разрешения» в настройках); для обработки ваших данных сеть не нужна.',
      es: 'csvkit es un conjunto de herramientas para archivos CSV: estadísticas por columna, selección de columnas, filtrado y orden de filas, unión de archivos, consultas SQL y conversión entre Excel, JSON y CSV. Sirve para limpiar y analizar tablas. Es un paquete de Python que se instala con pip en el entorno aislado la primera vez, lo que necesita pypi.org (permitido por defecto; puedes cambiarlo en «Permisos» de los ajustes); trabajar con tus datos no necesita red.'
    }),
    env: Object.freeze({}),
    usage: CSVKIT_USAGE
  }),
  Object.freeze({
    id: 'pandoc',
    name: 'Pandoc',
    kind: 'binary',
    status: 'ready',
    version: '3.12',
    author: 'John MacFarlane',
    license: 'GPL-2.0-or-later',
    homepage: 'https://github.com/jgm/pandoc',
    category: 'documents',
    description: Object.freeze({
      'zh-TW': '在 Markdown、Word、HTML、LaTeX、EPUB 等文件格式之間互相轉換。',
      en: 'Convert documents between Markdown, Word, HTML, LaTeX, EPUB and many other formats.',
      fr: 'Convertir des documents entre Markdown, Word, HTML, LaTeX, EPUB et bien d’autres formats.',
      ru: 'Преобразование документов между Markdown, Word, HTML, LaTeX, EPUB и другими форматами.',
      es: 'Convierte documentos entre Markdown, Word, HTML, LaTeX, EPUB y muchos otros formatos.'
    }),
    artifacts: Object.freeze({
      [CLI_PLATFORM]: Object.freeze({
        url: 'https://github.com/jgm/pandoc/releases/download/3.12/pandoc-3.12-linux-amd64.tar.gz',
        sha256: '67d7d011fed8c8543306022b985b9b2499ab9b74818df91d8727c7e9ebc5ba06',
        size: 35326100,
        file: 'pandoc',
        // The download is an archive: only this file in it is the program (165 MB unpacked); the runner checks the archive's hash as a whole.
        archive: Object.freeze({ format: 'tar.gz', member: 'pandoc-3.12/bin/pandoc', size: 165299760 })
      })
    }),
    details: Object.freeze({
      'zh-TW': 'Pandoc 在 Markdown、Word、HTML、LaTeX、EPUB 等上百種文件格式之間互相轉換，例如把 Word 檔轉成 Markdown，或把筆記轉成電子書。它在伺服器的沙盒裡執行，不需要網路，也不需要登入憑證。它也能輸出 PDF：沙盒裡裝了 LaTeX（XeLaTeX）和中文字型，轉 PDF 會比較慢（幾秒到幾十秒）。',
      en: 'Pandoc converts between Markdown, Word, HTML, LaTeX, EPUB and many other document formats, for example a Word file to Markdown, or notes to an e-book. It runs in the server’s sandbox and needs no network and no credentials. It can also write PDF: the sandbox has LaTeX (XeLaTeX) and Chinese fonts installed, and a PDF takes longer to make (seconds to tens of seconds).',
      fr: 'Pandoc convertit entre Markdown, Word, HTML, LaTeX, EPUB et de nombreux autres formats de documents, par exemple un fichier Word en Markdown ou des notes en livre numérique. Il s’exécute dans le bac à sable du serveur et n’a besoin ni du réseau ni d’identifiants. Il peut aussi produire du PDF : le bac à sable contient LaTeX (XeLaTeX) et des polices chinoises, et un PDF demande plus de temps (de quelques secondes à quelques dizaines de secondes).',
      ru: 'Pandoc преобразует документы между Markdown, Word, HTML, LaTeX, EPUB и многими другими форматами, например файл Word в Markdown или заметки в электронную книгу. Он работает в песочнице на сервере, ему не нужны ни сеть, ни учётные данные. Он умеет и PDF: в песочнице установлены LaTeX (XeLaTeX) и китайские шрифты, а создание PDF занимает больше времени (от нескольких секунд до десятков секунд).',
      es: 'Pandoc convierte entre Markdown, Word, HTML, LaTeX, EPUB y muchos otros formatos de documento, por ejemplo un archivo de Word a Markdown o apuntes a un libro electrónico. Se ejecuta en el entorno aislado del servidor y no necesita red ni credenciales. También puede escribir PDF: el entorno tiene LaTeX (XeLaTeX) y fuentes chinas instaladas, y un PDF tarda más en hacerse (de unos segundos a decenas de segundos).'
    }),
    env: Object.freeze({}),
    usage: PANDOC_USAGE
  }),
  Object.freeze({
    id: 'sox',
    name: 'SoX',
    // Its official releases on SourceForge are source code: the program is the one of Debian (the same version, 14.4.2), installed in the sandbox's image.
    kind: 'image',
    status: 'ready',
    version: '14.4.2',
    image: Object.freeze({ command: 'sox' }),
    author: 'SoX contributors',
    license: 'GPL-2.0-or-later',
    homepage: 'https://sourceforge.net/projects/sox/',
    category: 'media',
    description: Object.freeze({
      'zh-TW': '音訊處理工具：轉換格式、剪裁、混音與套用各種效果。',
      en: 'Audio processing: convert formats, trim, mix and apply effects.',
      fr: 'Traitement audio : conversion de formats, découpe, mixage et effets.',
      ru: 'Обработка звука: преобразование форматов, обрезка, микширование и эффекты.',
      es: 'Procesamiento de audio: convierte formatos, recorta, mezcla y aplica efectos.'
    }),
    details: Object.freeze({
      'zh-TW': 'SoX 是音訊處理工具：轉換格式、剪裁、合併、混音、調整音量，並能套用各種效果。它已經放在伺服器的沙盒映像檔裡（Debian 套件），在沙盒內執行，不需要網路，也不需要登入憑證。',
      en: 'SoX is an audio tool: convert formats, trim, join, mix, adjust volume and apply many effects. It is already part of the server’s sandbox image (the Debian package) and runs inside the sandbox, with no network and no credentials.',
      fr: 'SoX est un outil audio : conversion de formats, découpe, assemblage, mixage, réglage du volume et nombreux effets. Il fait déjà partie de l’image du bac à sable du serveur (le paquet Debian) et s’exécute dans le bac à sable, sans réseau ni identifiants.',
      ru: 'SoX — инструмент для звука: преобразование форматов, обрезка, склейка, микширование, регулировка громкости и множество эффектов. Он уже входит в образ песочницы на сервере (пакет Debian) и работает внутри песочницы, без сети и без учётных данных.',
      es: 'SoX es una herramienta de audio: convierte formatos, recorta, une, mezcla, ajusta el volumen y aplica muchos efectos. Ya forma parte de la imagen del entorno aislado del servidor (el paquete de Debian) y se ejecuta dentro de él, sin red ni credenciales.'
    }),
    env: Object.freeze({}),
    usage: SOX_USAGE
  })
]);

export const getCliTool = (id) => OFFICIAL_CLI_CATALOG.find((tool) => tool.id === id) || null;

/** The longer explanation of a tool (what it does, what it needs, what to keep in mind), in a language (else English). */
export const cliDetails = (tool, language) => String(tool?.details?.[language] || tool?.details?.en || '');

/** The words of a tool in a language (its own language, else English). */
export const cliDescription = (tool, language) => String(tool?.description?.[language] || tool?.description?.en || '');

/**
 * Whether a manifest is well formed. Returns a list of problems (empty when it is fine); the tests run the whole catalog through it,
 * and the server runs a tool through it before it fetches anything.
 */
export function validateCliManifest(tool) {
  const problems = [];
  if (!tool || typeof tool !== 'object') return ['not an object'];
  if (!ID.test(String(tool.id || ''))) problems.push('id');
  if (!String(tool.name || '').trim()) problems.push('name');
  if (!KINDS.includes(tool.kind)) problems.push('kind');
  if (tool.icon !== undefined) {
    let iconHost = '';
    try {
      const url = new URL(tool.icon);
      iconHost = url.protocol === 'https:' ? url.hostname : '';
    } catch { /* not an address */ }
    if (!CLI_ICON_HOSTS.includes(iconHost)) problems.push('icon (https, an allowed host)');
  }
  if (!STATUSES.includes(tool.status)) problems.push('status');
  // A tool that is only listed may leave its version out until its program is set.
  if (!(tool.status === 'soon' && !tool.version) && !/^\d+(?:\.\d+){0,3}(?:[-+][\w.]+)?$/.test(String(tool.version || ''))) problems.push('version');
  if (!tool.description || !LANGUAGES.every((language) => String(tool.description[language] || '').trim())) problems.push('description in the five languages');
  if (!tool.details || !LANGUAGES.every((language) => String(tool.details[language] || '').trim())) problems.push('details in the five languages');
  if (tool.kind === 'binary' && (tool.status === 'ready' || tool.artifacts)) {
    const artifact = tool.artifacts?.[CLI_PLATFORM];
    if (!artifact) problems.push(`artifact for ${CLI_PLATFORM}`);
    else {
      let host = '';
      try {
        const url = new URL(artifact.url);
        host = url.protocol === 'https:' ? url.hostname : '';
      } catch { /* not an address */ }
      if (!CLI_DOWNLOAD_HOSTS.includes(host)) problems.push('artifact url (https, an allowed host)');
      if (!SHA256.test(String(artifact.sha256 || ''))) problems.push('artifact sha256');
      if (!(Number(artifact.size) > 0 && Number(artifact.size) <= CLI_MAX_PROGRAM_BYTES)) problems.push('artifact size');
      if (!/^[A-Za-z0-9._-]{1,60}$/.test(String(artifact.file || ''))) problems.push('artifact file name');
      if (artifact.archive !== undefined) {
        const archive = artifact.archive;
        if (archive?.format !== 'tar.gz') problems.push('artifact archive format');
        if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(String(archive?.member || '')) || String(archive?.member).includes('..')) problems.push('artifact archive member');
        if (!(Number(archive?.size) > 0 && Number(archive?.size) <= CLI_MAX_UNPACKED_BYTES)) problems.push('artifact archive size');
      }
    }
  }
  if (tool.kind === 'image' && tool.status === 'ready' && !/^[A-Za-z0-9._-]{1,60}$/.test(String(tool.image?.command || ''))) problems.push('image command');
  if (tool.kind === 'pip') {
    const pip = tool.pip;
    if (!pip || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(String(pip.package || '')) || !/^\d+(?:\.\d+){0,3}$/.test(String(pip.version || '')) || !/^[A-Za-z0-9._-]{1,60}$/.test(String(pip.command || ''))) problems.push('pip package, version and command');
  }
  if (!String(tool.usage || '').trim() || String(tool.usage).length > 8000) problems.push('usage (1 to 8000 characters)');
  for (const [key, value] of Object.entries(tool.env || {})) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key) || typeof value !== 'string' || value.length > 200) problems.push(`env ${key}`);
  }
  for (const credential of tool.credentials || []) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(String(credential?.env || ''))) problems.push('credential env');
    if (!String(credential?.label || '').trim()) problems.push('credential label');
    if (!CREDENTIAL_TYPES.includes(credential?.type)) problems.push('credential type');
    if (!/^[a-z0-9.-]{3,80}$/.test(String(credential?.site || ''))) problems.push('credential site');
  }
  for (const file of tool.credentialFiles || []) {
    if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(String(file?.path || '')) || String(file.path).includes('..')) problems.push('credential file path');
    if (!CREDENTIAL_FILE_FORMATS.includes(file?.format)) problems.push('credential file format');
    if (!(tool.credentials || []).some((credential) => credential.env === file?.from)) problems.push('credential file source');
  }
  return problems;
}

/** Where a tool's Python packages are installed in the sandbox (a place that may run programs: some packages are compiled). */
export const CLI_PIP_TARGET = '/opt/pip';

/** The command that installs a pip tool in the sandbox ('' for a tool that is not one). The package and its version are the manifest's, never the model's. */
export const cliInstallCommand = (tool) => (tool?.kind === 'pip' && tool.pip
  ? `pip install --quiet --no-input --disable-pip-version-check --no-cache-dir --target ${CLI_PIP_TARGET} ${tool.pip.package}==${tool.pip.version} && test -x ${CLI_PIP_TARGET}/bin/${tool.pip.command}`
  : '');

/** The command names of a pip tool (what a command line says when it uses the tool). */
export const cliPipCommands = (tool) => (tool?.kind === 'pip' && tool.pip ? (tool.pip.commands?.length ? [...tool.pip.commands] : [tool.pip.command]) : []);

/** What the catalog knows of a credential by its name ('TWITTER_CT0'): { env, label, type, site, tool: { id, name } }, or null (a credential the person made up). */
export function cliCredentialInfo(env) {
  for (const tool of OFFICIAL_CLI_CATALOG) {
    const found = (tool.credentials || []).find((credential) => credential.env === env);
    if (found) return { ...found, tool: { id: tool.id, name: tool.name } };
  }
  return null;
}

/** The programs that make a tool's files for its login, in the form the sandbox's commands take: [{ path, format, from }]. */
export const cliCredentialFiles = (tool) => (Array.isArray(tool?.credentialFiles) ? tool.credentialFiles : []);

/** Whether a tool can be used now (a tool that is "soon" is listed in the store and cannot be added or chosen yet). */
export const isCliReady = (tool) => Boolean(tool) && tool.status === 'ready';

/** A list of tool ids as the settings keep them: the ones that look like ids, once each, at most `limit`. */
export function normalizeCliIds(value, limit = 100) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.filter((id) => typeof id === 'string' && ID.test(id)))].slice(0, limit);
}

/** The versions of the tools the person has added ({ id: version }), as the settings keep them. */
export function normalizeCliVersions(value) {
  const kept = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [id, version] of Object.entries(value)) {
      if (ID.test(id) && typeof version === 'string' && version.length > 0 && version.length <= 40) kept[id] = version;
    }
  }
  return kept;
}


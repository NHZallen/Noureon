// The official CLI tools ("命令工具"): the ones the owner puts in the CLI store (docs/superpowers/specs/2026-10-04-cli-store-design.md).
// A tool is a manifest: what it is called, who made it, where its program comes from (with the hash the file must have), what the
// model is told about using it. The page shows the names and descriptions; the server fetches the program and puts it in a sandbox.
// Both sides read this one list, so it may not use the browser (the server reaches it: scripts/server-shared-modules.json).

export const CLI_PLATFORM = 'linux-x64';

/** Where the program of an official tool may be downloaded from (the final address after redirects). */
export const CLI_DOWNLOAD_HOSTS = Object.freeze(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

/** Where the picture of a tool (its project's logo) may be loaded from: GitHub's pictures of a project's owner. A tool without one shows the terminal glyph. */
export const CLI_ICON_HOSTS = Object.freeze(['github.com', 'avatars.githubusercontent.com']);

/** The biggest program a tool may have (bytes). */
export const CLI_MAX_PROGRAM_BYTES = 150 * 1024 * 1024;

// What a tool is: 'binary' (a program that is one file, fetched from where its makers publish it) or 'pip' (a Python package, installed in the
// sandbox the first time it is used). `status`: 'ready' (it can be used now) or 'soon' (it is listed, but needs what a later stage of the
// store brings: the network for the sandbox, the person's credentials).
const KINDS = Object.freeze(['binary', 'pip']);
const STATUSES = Object.freeze(['ready', 'soon']);
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);

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
  officecli set data.xlsx /Sheet1/A1 --prop value="Name" --prop bold=true
  officecli set report.docx '/body/p[@paraId=1A2B3C4D]' --prop text="New text"
  officecli remove report.docx '/body/p[@paraId=1A2B3C4D]'

Every command saves the file. After a series of commands, \`officecli validate <file>\` and \`officecli view <file> issues\` find problems to fix. Design it as a professional would: a clear hierarchy, one restrained palette, consistent spacing.`;

const FFMPEG_USAGE = `ffmpeg converts, trims, joins and re-encodes audio and video (a static build: the program is one file; there is no ffprobe).
Read the user's files from /input (read only) and write every result to /output. Always name an output file, add -y to overwrite and -hide_banner -loglevel error to keep the output short.
A step may run for at most about two minutes (give timeout_seconds up to 120): work on short clips, a lower resolution or a fast preset (-preset veryfast) for long files, and say so when a file is too long.

  Convert / compress video:   ffmpeg -y -i /input/in.mov -c:v libx264 -crf 23 -preset veryfast -c:a aac /output/out.mp4
  Audio only:                 ffmpeg -y -i /input/in.mp4 -vn -c:a libmp3lame -q:a 2 /output/audio.mp3
  Trim without re-encoding:   ffmpeg -y -ss 00:00:10 -to 00:00:30 -i /input/in.mp4 -c copy /output/clip.mp4
  Resize:                     ffmpeg -y -i /input/in.mp4 -vf scale=-2:720 /output/small.mp4
  Frames / thumbnails:        ffmpeg -y -i /input/in.mp4 -vf fps=1 /output/frame_%03d.png      (one frame: -frames:v 1)
  GIF:                        ffmpeg -y -i /input/in.mp4 -vf "fps=12,scale=480:-1" /output/out.gif
  Join files of the same kind: put "file '/input/a.mp4'" lines in /output/list.txt, then ffmpeg -y -f concat -safe 0 -i /output/list.txt -c copy /output/joined.mp4
  What a file holds:          ffmpeg -hide_banner -i /input/in.mp4 2>&1   (it lists the streams, then complains that there is no output: that is expected)`;

const YTDLP_USAGE = `yt-dlp downloads video and audio from many sites (it is run as a Python program; it needs the network). Write everything to /output.
  Download:            yt-dlp -o "/output/%(title).80B.%(ext)s" "URL"
  Audio as mp3:        yt-dlp -x --audio-format mp3 -o "/output/%(title).80B.%(ext)s" "URL"     (the conversion needs the ffmpeg tool, when the user chose it too)
  A limit on quality:  yt-dlp -f "bv*[height<=720]+ba/b[height<=720]" "URL"
  Only one video:      add --no-playlist. Subtitles: --write-subs --sub-langs "en.*,zh.*" --skip-download
  What exists:         yt-dlp -F "URL"      Information only: yt-dlp -J --no-playlist "URL"
Mind the time of a step (at most about two minutes: give timeout_seconds up to 120) and the size of files: prefer a lower quality when asked for something long.`;

const TWITTER_USAGE = `twitter reads and writes on X (Twitter) with the person's own login (the credentials are in the environment as TWITTER_AUTH_TOKEN and TWITTER_CT0). Add --json for structured output and --max N to limit how many.
  twitter feed [-t following]        the home timeline         twitter bookmarks
  twitter search "query" -t Latest --max 30 [--from handle --lang en --since 2026-01-01]
  twitter tweet <id or url>          a tweet with its replies  twitter user <handle>   twitter user-posts <handle> --max 20
  twitter followers <handle>         twitter following <handle>
  Writing (only when the person asked for it): twitter post "text" [--image file], twitter reply <id> "text", twitter like <id>, twitter retweet <id>, twitter bookmark <id>, twitter follow <handle>.`;

const RDT_USAGE = `rdt reads and writes on Reddit with the person's own login. Add --json (or --yaml) for structured output and --compact to save space.
  rdt feed [--subs-only]      rdt popular      rdt all      rdt sub <name> [-s top -t week]      rdt sub-info <name>
  rdt search "query" [-r subreddit -s top -t year]      rdt read <post id> [--expand-more]      rdt show <number from the last list>
  rdt user <name>      rdt user-posts <name>      rdt user-comments <name>
  Writing (only when the person asked for it): rdt upvote <n>, rdt save <n>, rdt subscribe <name>, rdt comment ...`;

const CSVKIT_USAGE = `csvkit is a set of command line tools for CSV files (it is installed with pip the first time, so it needs the network). Read the user's files from /input and write results to /output.
  csvstat /input/data.csv                 the type, range and most common values of each column
  csvcut -c name,price /input/data.csv    pick columns (csvcut -n lists them)      csvgrep -c city -m Taipei /input/data.csv    filter rows
  csvsort -c price -r /input/data.csv     sort                                     csvjoin -c id a.csv b.csv    join on a column
  csvsql --query "select city, count(*) from data group by city" /input/data.csv     run SQL on a file
  in2csv /input/book.xlsx > /output/book.csv    convert Excel or JSON to CSV       csvjson /input/data.csv > /output/data.json    CSV to JSON
Redirect results into /output; use csvlook to print a small table as text.`;

const PANDOC_USAGE = `pandoc converts documents between many formats (Markdown, Word, HTML, LaTeX, EPUB, PDF, ...).
  pandoc /input/in.docx -t markdown -o /output/out.md       pandoc /input/in.md -o /output/out.docx
  pandoc /input/in.md -s -o /output/out.html                 pandoc /input/in.md --toc -o /output/out.epub
  pandoc --list-input-formats / --list-output-formats list what it can read and write. PDF output needs a LaTeX engine that the sandbox does not have: make a Word or HTML file instead.`;

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
      'zh-TW': 'OfficeCLI 讓 AI 直接建立、讀取與修改 Word、Excel、PowerPoint 檔案，不需要安裝 Office。適合製作報告、簡報與報表，或批次修改你上傳的檔案，做完後會自己檢查檔案有沒有問題。它在伺服器的獨立沙盒裡執行，沒有網路；做好的檔案會出現在回覆下方，可以直接下載。',
      en: 'OfficeCLI lets the AI create, read and edit Word, Excel and PowerPoint files without Office installed. It suits reports, presentations and spreadsheets, or changes to files you upload, and it checks the result for problems. It runs in an isolated sandbox on the server with no network; the finished files appear under the reply, ready to download.',
      fr: 'OfficeCLI permet à l’IA de créer, lire et modifier des fichiers Word, Excel et PowerPoint sans Office installé. Il convient aux rapports, présentations et tableurs, ou à la modification de fichiers que vous envoyez, et il vérifie le résultat. Il s’exécute dans un bac à sable isolé sur le serveur, sans réseau ; les fichiers terminés apparaissent sous la réponse, prêts à être téléchargés.',
      ru: 'OfficeCLI позволяет ИИ создавать, читать и изменять файлы Word, Excel и PowerPoint без установленного Office. Подходит для отчётов, презентаций и таблиц, а также для правки загруженных вами файлов; результат проверяется на ошибки. Работает в изолированной песочнице на сервере без доступа к сети; готовые файлы появляются под ответом и доступны для скачивания.',
      es: 'OfficeCLI permite que la IA cree, lea y edite archivos de Word, Excel y PowerPoint sin tener Office instalado. Sirve para informes, presentaciones y hojas de cálculo, o para modificar archivos que subas, y comprueba el resultado. Se ejecuta en un entorno aislado del servidor, sin red; los archivos terminados aparecen bajo la respuesta, listos para descargar.'
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
      'zh-TW': 'FFmpeg 是處理影片與音訊的標準工具：轉換格式、剪裁片段、合併檔案、壓縮、抽出聲音、擷取畫面、製作 GIF。把影音檔附加到對話後，用 @ 選它並說明想怎麼處理。每一步最長約兩分鐘，所以建議處理短片或降低畫質；它在沒有網路的獨立沙盒裡執行，不能直接下載網路上的影片。',
      en: 'FFmpeg is the standard tool for video and audio: convert formats, trim clips, join files, compress, extract sound, capture frames and make GIFs. Attach a media file to the conversation, choose it with @ and say what you want. A step may run for about two minutes, so work on short clips or a lower quality; it runs in an isolated sandbox with no network, so it cannot fetch videos from the internet.',
      fr: 'FFmpeg est l’outil de référence pour la vidéo et l’audio : conversion de formats, découpe, assemblage, compression, extraction du son, capture d’images et création de GIF. Joignez un fichier à la conversation, choisissez l’outil avec @ et dites ce que vous voulez. Une étape dure environ deux minutes au plus : préférez de courts extraits ou une qualité réduite ; il s’exécute dans un bac à sable isolé sans réseau et ne peut donc pas télécharger de vidéos.',
      ru: 'FFmpeg — стандартный инструмент для видео и аудио: преобразование форматов, обрезка, склейка, сжатие, извлечение звука, снимки кадров и создание GIF. Прикрепите файл к разговору, выберите инструмент через @ и опишите, что нужно сделать. Один шаг длится не более двух минут, поэтому лучше работать с короткими фрагментами или снижать качество; инструмент работает в изолированной песочнице без сети и не может скачивать видео из интернета.',
      es: 'FFmpeg es la herramienta estándar para vídeo y audio: convierte formatos, recorta, une archivos, comprime, extrae el sonido, captura fotogramas y crea GIF. Adjunta un archivo a la conversación, elígela con @ y di qué quieres. Un paso puede durar unos dos minutos, así que conviene usar clips cortos o menor calidad; se ejecuta en un entorno aislado sin red, por lo que no puede descargar vídeos de internet.'
    }),
    env: Object.freeze({}),
    usage: FFMPEG_USAGE
  }),
  Object.freeze({
    id: 'yt-dlp',
    name: 'yt-dlp',
    icon: 'https://github.com/yt-dlp.png?size=96',
    kind: 'binary',
    // It downloads from the internet, which the sandbox cannot do yet (the network comes with the permissions of the next stage).
    status: 'soon',
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
      'zh-TW': 'yt-dlp 可以從上千個網站下載影片、音訊與字幕，並能選擇畫質與格式，也能只查詢影片資訊。它需要連上網路，所以要等沙盒網路與權限功能推出後才能使用；到時候每次要連到的網站都會先問你。',
      en: 'yt-dlp downloads video, audio and subtitles from thousands of sites, with a choice of quality and format, and can also just look up a video’s details. It needs the network, so it can be used once the sandbox network and permissions arrive; each site it wants to reach will be asked about first.',
      fr: 'yt-dlp télécharge vidéos, audio et sous-titres depuis des milliers de sites, avec choix de la qualité et du format, et peut aussi simplement consulter les informations d’une vidéo. Il a besoin du réseau : il sera disponible avec le réseau du bac à sable et les autorisations ; chaque site à contacter vous sera demandé avant.',
      ru: 'yt-dlp скачивает видео, аудио и субтитры с тысяч сайтов с выбором качества и формата, а также может просто показать сведения о видео. Ему нужна сеть, поэтому он станет доступен вместе с сетью песочницы и разрешениями; о каждом сайте, к которому нужно подключиться, вас спросят заранее.',
      es: 'yt-dlp descarga vídeo, audio y subtítulos de miles de sitios, con elección de calidad y formato, y también puede solo consultar los datos de un vídeo. Necesita red, así que podrá usarse cuando lleguen la red del entorno aislado y los permisos; antes de conectar con cada sitio se te preguntará.'
    }),
    env: Object.freeze({}),
    usage: YTDLP_USAGE
  }),
  Object.freeze({
    id: 'twitter-cli',
    name: 'twitter-cli',
    icon: 'https://github.com/public-clis.png?size=96',
    kind: 'pip',
    status: 'soon',
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
    credentials: Object.freeze([Object.freeze({ env: 'TWITTER_AUTH_TOKEN', label: 'auth_token' }), Object.freeze({ env: 'TWITTER_CT0', label: 'ct0' })]),
    details: Object.freeze({
      'zh-TW': 'twitter-cli 用你自己的 X（Twitter）帳號讀取時間軸、搜尋、書籤與使用者，也能發文、回覆與按讚。需要網路和你的登入憑證（安全憑證），所以要等沙盒網路與權限功能推出後才能使用。請留意：X 的服務條款不允許自動化存取，帳號可能被限制，也不保證一定連得上。',
      en: 'twitter-cli reads X (Twitter) timelines, search, bookmarks and users with your own account, and can post, reply and like. It needs the network and your login (a secure credential), so it can be used once the sandbox network and permissions arrive. Note that X’s terms do not allow automated access, so the account may be restricted and it is not guaranteed to work.',
      fr: 'twitter-cli lit les fils, la recherche, les signets et les profils de X (Twitter) avec votre propre compte, et peut publier, répondre et aimer. Il a besoin du réseau et de votre connexion (identifiant sécurisé) : il sera disponible avec le réseau du bac à sable et les autorisations. Attention : les conditions de X n’autorisent pas l’accès automatisé ; le compte peut être limité et le fonctionnement n’est pas garanti.',
      ru: 'twitter-cli читает ленты, поиск, закладки и профили X (Twitter) с вашим аккаунтом, а также может публиковать, отвечать и ставить отметки. Нужны сеть и ваши данные для входа (защищённые учётные данные), поэтому инструмент станет доступен вместе с сетью песочницы и разрешениями. Учтите: условия X не разрешают автоматизированный доступ, аккаунт могут ограничить, а работа не гарантируется.',
      es: 'twitter-cli lee líneas de tiempo, búsquedas, marcadores y usuarios de X (Twitter) con tu propia cuenta, y puede publicar, responder y dar me gusta. Necesita red y tu inicio de sesión (una credencial segura), así que podrá usarse cuando lleguen la red del entorno aislado y los permisos. Ten en cuenta que las condiciones de X no permiten el acceso automatizado: la cuenta puede limitarse y no se garantiza que funcione.'
    }),
    env: Object.freeze({}),
    usage: TWITTER_USAGE
  }),
  Object.freeze({
    id: 'rdt-cli',
    name: 'rdt-cli',
    icon: 'https://github.com/public-clis.png?size=96',
    kind: 'pip',
    // Its login is read from a browser on the machine it runs on: on a server that needs the person's credentials another way.
    status: 'soon',
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
    credentials: Object.freeze([]),
    details: Object.freeze({
      'zh-TW': 'rdt-cli 可以瀏覽 Reddit 的版面、貼文與留言、搜尋、查看使用者，也能投票與收藏。需要網路與你的 Reddit 登入，所以要等沙盒網路與權限功能推出後才能使用；它原本是從瀏覽器讀取登入狀態，在伺服器上會改用你提供的安全憑證。',
      en: 'rdt-cli browses Reddit feeds, posts and comments, searches, looks up users, votes and saves. It needs the network and your Reddit login, so it can be used once the sandbox network and permissions arrive; it normally reads the login from a browser, and on the server it will use a secure credential you provide.',
      fr: 'rdt-cli parcourt les fils, publications et commentaires de Reddit, recherche, consulte des profils, vote et enregistre. Il a besoin du réseau et de votre connexion Reddit : il sera disponible avec le réseau du bac à sable et les autorisations ; il lit d’ordinaire la connexion depuis un navigateur, et sur le serveur il utilisera un identifiant sécurisé que vous fournissez.',
      ru: 'rdt-cli просматривает ленты, посты и комментарии Reddit, ищет, показывает профили, голосует и сохраняет. Нужны сеть и ваш вход в Reddit, поэтому инструмент станет доступен вместе с сетью песочницы и разрешениями; обычно он берёт вход из браузера, а на сервере будет использовать защищённые учётные данные, которые вы укажете.',
      es: 'rdt-cli explora feeds, publicaciones y comentarios de Reddit, busca, consulta usuarios, vota y guarda. Necesita red y tu inicio de sesión de Reddit, así que podrá usarse cuando lleguen la red del entorno aislado y los permisos; normalmente lee el inicio de sesión de un navegador y en el servidor usará una credencial segura que facilites.'
    }),
    env: Object.freeze({}),
    usage: RDT_USAGE
  }),
  Object.freeze({
    id: 'csvkit',
    name: 'csvkit',
    icon: 'https://github.com/wireservice.png?size=96',
    kind: 'pip',
    // A Python package: it is installed in the sandbox the first time, which needs the network.
    status: 'soon',
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
    pip: Object.freeze({ package: 'csvkit', version: '2.2.0', command: 'csvstat' }),
    credentials: Object.freeze([]),
    details: Object.freeze({
      'zh-TW': 'csvkit 是一組處理 CSV 檔案的工具：統計每個欄位、挑選欄位、篩選與排序列、合併多個檔案、用 SQL 查詢，並在 Excel、JSON 與 CSV 之間轉換。適合整理與分析表格資料。它要在沙盒裡用 pip 安裝，需要網路，所以要等沙盒網路功能推出後才能使用。',
      en: 'csvkit is a set of tools for CSV files: statistics for each column, picking columns, filtering and sorting rows, joining files, running SQL, and converting between Excel, JSON and CSV. It suits cleaning and analysing tables. It is installed with pip inside the sandbox, which needs the network, so it can be used once the sandbox network arrives.',
      fr: 'csvkit est un ensemble d’outils pour les fichiers CSV : statistiques par colonne, sélection de colonnes, filtrage et tri des lignes, jointure de fichiers, requêtes SQL et conversion entre Excel, JSON et CSV. Il convient au nettoyage et à l’analyse de tableaux. Il s’installe avec pip dans le bac à sable, ce qui demande le réseau : il sera disponible avec le réseau du bac à sable.',
      ru: 'csvkit — набор инструментов для CSV: статистика по столбцам, выбор столбцов, фильтрация и сортировка строк, объединение файлов, SQL-запросы и преобразование между Excel, JSON и CSV. Подходит для очистки и анализа таблиц. Устанавливается через pip в песочнице, для чего нужна сеть, поэтому станет доступен вместе с сетью песочницы.',
      es: 'csvkit es un conjunto de herramientas para archivos CSV: estadísticas por columna, selección de columnas, filtrado y orden de filas, unión de archivos, consultas SQL y conversión entre Excel, JSON y CSV. Sirve para limpiar y analizar tablas. Se instala con pip en el entorno aislado, lo que requiere red, así que podrá usarse cuando llegue la red del entorno aislado.'
    }),
    env: Object.freeze({}),
    usage: CSVKIT_USAGE
  }),
  Object.freeze({
    id: 'pandoc',
    name: 'Pandoc',
    kind: 'binary',
    // Its releases are archives (.tar.gz) of a large program, and the store takes one file for now; its address and hash are set when that is added.
    status: 'soon',
    needs: Object.freeze(['archive']),
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
    details: Object.freeze({
      'zh-TW': 'Pandoc 在 Markdown、Word、HTML、LaTeX、EPUB 等上百種文件格式之間互相轉換，例如把 Word 檔轉成 Markdown，或把筆記轉成電子書。目前還不能使用：它的官方下載是壓縮檔，商城要先支援解壓縮。',
      en: 'Pandoc converts between Markdown, Word, HTML, LaTeX, EPUB and many other document formats, for example a Word file to Markdown, or notes to an e-book. It cannot be used yet: its official download is an archive, and the store first has to support unpacking archives.',
      fr: 'Pandoc convertit entre Markdown, Word, HTML, LaTeX, EPUB et de nombreux autres formats de documents, par exemple un fichier Word en Markdown ou des notes en livre numérique. Il n’est pas encore utilisable : son téléchargement officiel est une archive et la boutique doit d’abord savoir la décompresser.',
      ru: 'Pandoc преобразует документы между Markdown, Word, HTML, LaTeX, EPUB и многими другими форматами, например файл Word в Markdown или заметки в электронную книгу. Пока недоступен: официальная загрузка — архив, а магазин сначала должен научиться его распаковывать.',
      es: 'Pandoc convierte entre Markdown, Word, HTML, LaTeX, EPUB y muchos otros formatos de documento, por ejemplo un archivo de Word a Markdown o apuntes a un libro electrónico. Aún no puede usarse: su descarga oficial es un archivo comprimido y la tienda primero debe poder descomprimirlo.'
    }),
    env: Object.freeze({}),
    usage: PANDOC_USAGE
  }),
  Object.freeze({
    id: 'sox',
    name: 'SoX',
    kind: 'binary',
    // Its official releases on SourceForge are source code (and Windows and macOS builds): a Linux program has to be built first.
    status: 'soon',
    needs: Object.freeze(['build']),
    version: '14.4.2',
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
      'zh-TW': 'SoX 是音訊處理工具：轉換格式、剪裁、合併、混音、調整音量，並能套用各種效果。目前還不能使用：官方只提供原始碼（以及 Windows、macOS 版本），要先在伺服器上編譯出 Linux 版本。',
      en: 'SoX is an audio tool: convert formats, trim, join, mix, adjust volume and apply many effects. It cannot be used yet: the official release is source code (plus Windows and macOS builds), so a Linux build has to be compiled on the server first.',
      fr: 'SoX est un outil audio : conversion de formats, découpe, assemblage, mixage, réglage du volume et nombreux effets. Il n’est pas encore utilisable : la version officielle est un code source (et des versions Windows et macOS), il faut donc d’abord compiler une version Linux sur le serveur.',
      ru: 'SoX — инструмент для звука: преобразование форматов, обрезка, склейка, микширование, регулировка громкости и множество эффектов. Пока недоступен: официально распространяется исходный код (и сборки для Windows и macOS), поэтому сначала нужно собрать версию для Linux на сервере.',
      es: 'SoX es una herramienta de audio: convierte formatos, recorta, une, mezcla, ajusta el volumen y aplica muchos efectos. Aún no puede usarse: la versión oficial es código fuente (y compilaciones para Windows y macOS), así que primero hay que compilar una versión para Linux en el servidor.'
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
    }
  }
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
  }
  return problems;
}

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


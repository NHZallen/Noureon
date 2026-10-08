// The update notes in English (see translations.js): `{ "<version>": [the strings of the note in src/data/update-logs/entries.js, translated] }`.
// Every version that has notes is here, with the same number of strings and the same HTML tags in the same order as the original (tests/update-logs-translations.test.js).
export default {
  "17.14.1": [
    "<strong>Noureon 17.14.1 Release Notes</strong>",
    "This version fixes three display problems reported after the dark mode of 17.14.0 and renames the setting to \"Appearance\".",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Settings on a phone:</strong> in dark mode the whole settings page was translucent and showed the side bar behind it; it now has an opaque background.</li><li><strong>Side bar fade:</strong> the fade at the top and the bottom of the side bar did not match the colour of the side bar, so a lighter band appeared in dark mode and the text of the list showed through the gap; the fade now uses the same colour as the side bar.</li><li><strong>File preview:</strong> the board under the pages of a preview, such as slides, is darker in dark mode, the page numbers follow the text colour and are readable again, and the edge of a slide has a thin line in dark mode.</li><li><strong>Name of the setting:</strong> \"Colour mode\" in Settings → Personalization → Appearance is renamed \"Appearance\".</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.14.0": [
    "<strong>Noureon 17.14.0 Release Notes</strong>",
    "This version adds a dark mode and brings the colours of the interface under one fixed set of names.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Appearance:</strong> Settings → Personalization → Appearance has a new \"Appearance\" option with Light, Dark and Follow system. The default is Light; the choice applies at once and is synced with the cloud settings. The dark theme is a dark grey.</li><li><strong>Every screen:</strong> the main screen, the side bar, conversations, all settings tabs, dialogs, the command tool store, the Nouras store, search, deep research, the personal data panel and its charts, and the citation and source panels have a dark version; file previews (Word, PDF, slides, spreadsheets) and generated images keep a white, paper-like background.</li><li><strong>One set of colours:</strong> text has three levels and backgrounds three layers, with shared lines, accent, state colours and shadows; the pale text of the light theme (hints, message times) is darker, raising its contrast on white from 2.5 to about 3.5.</li><li><strong>Start-up screen:</strong> a person who uses the dark theme no longer sees a white flash when the page opens; the browser bar, the status bar of an installed app and its splash screen are dark too. The home-screen app on iPhone and iPad has a light and a dark start-up picture that follow the appearance of the device.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>The start-up picture on iPhone and iPad follows the appearance of the device, not the Appearance set in the app; the screen of a new model that is not listed yet starts white.</li><li>After the Appearance setting is changed, an installed app changes its splash screen only when the browser next checks for an update.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration; the settings gain a colorScheme field that older versions ignore."
  ],
  "17.13.0": [
    "<strong>Noureon 17.13.0 Release Notes</strong>",
    "This version turns the Terms of Use, the Privacy Policy and the update notes into standalone public web pages that can be read and shared without signing in.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Public pages:</strong> the Terms of Use (noureon.com/terms), the Privacy Policy (noureon.com/privacy) and the full update notes (noureon.com/updates) each have their own address. They need no sign-in and do not load the app. The pages are available in 繁體中文, English, Français, Русский and Español; the language follows the browser setting and can be changed at the top right of the page. Light and dark mode follow the system.</li><li><strong>Update notes page:</strong> versions are grouped by month, and each version has a link that can be shared (for example noureon.com/updates#v17.13.0). The page has an index that folds in three levels (year, month, version) and keeps only the month being read open, so it stays short however many versions are added: on desktop it sits at the right and marks the version being read as you scroll; on phones and narrow windows the “Index” sits under the title and, once scrolled, stays in a bar at the top of the window where it can be opened. Once a page is scrolled, a button at the bottom right goes back to the top. Folds and the index sheet open and close with a short animation.</li><li><strong>Update notes in five languages:</strong> the notes of every version are available in 繁體中文, English, Français, Русский and Español. The update notes page shows the selected language, and the new-version window shows the language of the app.</li><li><strong>Entry points:</strong> “Terms and policies” and “Version info” in the settings are now links that open in a new tab; links to the Terms of Use and the Privacy Policy are added at the bottom of the sign-in page; “View full update history” in the new-version window leads to the update notes page. The former update history window in the settings and the expandable terms sections have been removed.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>The three pages are standalone web pages, not part of the app, and are not cached for offline use; they cannot be opened while offline.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.12.1": [
    "<strong>Noureon 17.12.1 Release Notes</strong>",
    "This version updates Claude 4.5 Haiku on OpenRouter to the newly released Claude Haiku 5.5.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Claude Haiku 5.5:</strong> Replaces Claude 4.5 Haiku and appears under Anthropic in the model menu. Priced at US$0.10 per million input tokens and US$0.50 per million output tokens (US$0.50 input and US$2.50 output when the prompt exceeds 100K tokens); the context length is 1M tokens, with up to 128K output tokens per response. Supports image and file input, with text output; can be used for tool calls in Advanced mode (Python).</li><li><strong>Thinking level:</strong> Five levels (Low, Medium, High, Extra high and Max); the default is Medium (the same as the default of the Anthropic API).</li><li><strong>Existing conversations:</strong> Conversations, Model Council groups and recently used models that used Claude 4.5 Haiku switch to Claude Haiku 5.5 automatically.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>Claude Haiku 5.5 uses a newer tokenizer; the same text comes to about 30% more tokens than with Claude 4.5 Haiku, so the actual cost does not fall proportionally.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration; existing conversations, memory and synced data are not affected."
  ],
  "17.12.0": [
    "<strong>Noureon 17.12.0 Release Notes</strong>",
    "This version adds the ability to remove a single model from a multi-model council while it is running, so that a model that is responding too slowly or is not suitable can be stopped.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>A single model can leave the council:</strong> While a council is running, a \"Leave\" button appears next to each model that is still answering. A confirmation window is shown first; once confirmed, that model stops immediately, the answer it has already produced is not included in the council result, and the remaining models finish the council. This applies to councils run on the device or on the server.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>A council must keep at least 2 models, so the \"Leave\" button is not shown when only 2 models remain.</li><li>The model that composes the final answer cannot leave; to cancel, press \"Stop\".</li><li>The provider may still charge for content a model generated before it left.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.11.0": [
    "<strong>Noureon 17.11.0 Release Notes</strong>",
    "This version moves the multi-model council to the server: once sent, the council completes even if the page is closed or the phone is locked, and the answer is already in the conversation when the page is reopened.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>The multi-model council runs on the server:</strong> When signed in to a cloud account, councils run on Noureon's server by default. The whole process (member answers, discussion, search and synthesis of the answer) is completed on the server; when the page is reopened (or the same conversation is opened on another device), it reattaches to the same progress panel and keeps showing the synthesized answer as it is produced. \"Stop\" can be pressed at any time, and the synthesized text already produced is kept.</li><li><strong>Resuming after a server restart:</strong> Completed member answers and searches are cached temporarily; after a restart only the synthesis is redone, and the models are not asked again.</li><li><strong>One model timing out does not affect the council:</strong> Each call to each model waits for at most 30 minutes; on timeout, that member is counted as failed and the other members finish as usual.</li><li><strong>No more white flash when Settings opens:</strong> Fixed a brief white flash on the screen the first time Settings is opened on a phone.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>A cloud account sign-in is required; when \"This device\" is selected, when not signed in, in a temporary chat, when keys are incomplete or when the request is too large (over 25MB), the council still runs in the browser. It also automatically runs on this device when the server cannot be reached.</li><li>The API keys used by the council (and search keys) are stored encrypted temporarily and deleted when the council ends, and are kept for 2 hours 15 minutes at most; conversation history, messages and attachments, and each model's answers pass through the server; see the Privacy tab and the Privacy Policy for details.</li><li>If the server restarts during synthesis, the synthesis is redone once, and that provider may charge twice.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.10.0": [
    "<strong>Noureon 17.10.0 Release Notes</strong>",
    "This version moves web search, for models that cannot search on their own, to the server: once sent, the search and the reply complete even if the page is closed or the phone is locked.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Search runs on the server:</strong> When web search is enabled and the model cannot search or call tools by itself (for example some NVIDIA and OpenRouter models), the server drafts search queries from the conversation, searches the web, and hands the retrieved pages to the model to answer. The reply still shows \"Searched N sites\" and [n] source labels; during the search, \"Searching with Tavily (or TinyFish)\" is shown.</li><li><strong>Search depth and fallback:</strong> The Tavily search depth chosen in Settings (Basic/Advanced) now also applies on the server (previously searches on the server were always Basic). When the chosen search service returns no results or fails, the other service is used instead (keys for both must be set), the same as in the browser.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>A cloud account sign-in is required; when \"This device\" is selected, when not signed in, in a temporary chat or when the request is too large, searching and replying still happen in the browser. It also automatically runs on this device when the server cannot be reached.</li><li>Search keys (Tavily, TinyFish) are stored encrypted temporarily, like API keys, and deleted when the reply ends; search queries and the retrieved pages pass through the server; see the Privacy tab and the Privacy Policy for details.</li><li>If the server restarts during a search, the search may be run again once.</li><li>In this version, searches for the multi-model council still run in the browser.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.9.2": [
    "<strong>Noureon 17.9.2 Release Notes</strong>",
    "This version adds a notice when a server reply fails, reduces flicker when Settings opens on phones, and fixes short conversations that could not be dragged on phones.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Notice on failure:</strong> If the page is closed after a message is sent and the server could neither complete the reply nor write the error into the conversation, an explanation (for example \"The server could not complete this reply\") is shown after the user's message when the conversation is reopened. Each failure is shown only once and does not reappear after it is deleted.</li><li><strong>Smoother opening of Settings:</strong> Previously, each time Settings was opened, its content was rebuilt while the screen slid in (most noticeable the first time), which appeared as flicker on phones. Now the first opening waits until the content is built before sliding in, and later openings no longer rebuild it.</li><li><strong>Short conversations can be dragged:</strong> Conversations with only one or two messages could not be dragged on iPhone. They now behave like long conversations: the screen follows the finger when dragged and springs back.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>Only replies that failed within the last 24 hours and after the last user message are filled in.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.9.1": [
    "<strong>Noureon 17.9.1 Release Notes</strong>",
    "This version fixes images generated on the server being completed but not appearing in the conversation.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Fix for images not appearing:</strong> In 17.9.0, server image generation computed the message position incorrectly when writing the image into the conversation, overlapping the position of the user's message, so the image could not be written. The image is now written after the user's message and remains visible after the page is closed and reopened.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>Image requests that were sent during 17.9.0 and failed must be sent again.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.9.0": [
    "<strong>Noureon 17.9.0 Release Notes</strong>",
    "This version adds server-side image generation: once sent, the image is completed even if the page is closed or the phone is locked, and it is already in the conversation when reopened. It also fixes the \"Where replies run\" setting.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Image generation runs on the server:</strong> When signed in to a cloud account, image generation runs on Noureon's server by default. After sending, the page can be closed, the phone locked or another device used; when the image is done it appears in the conversation automatically. If the page is reopened while it is in progress, \"Creating image\" is shown and the image is not generated twice. \"Stop\" can be pressed at any time.</li><li><strong>Preview images removed:</strong> The previews that GPT image models used to show step by step have been removed; during generation only \"Creating image\" is shown, and the full image appears once it is done.</li><li><strong>The \"Where replies run\" setting now takes effect:</strong> Previously, even when \"This device\" was selected on the Privacy tab of Settings, text replies were still handled by the server. Now, when This device is selected, both text replies and image generation run only in this browser.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>Server image generation requires a cloud account sign-in; when \"This device\" is selected, when not signed in, in a temporary chat, or when the attached reference images are too large (over 25MB), images are still generated in the browser. It also automatically runs on this device when the server cannot be reached.</li><li>The server temporarily keeps the OpenRouter key encrypted and deletes it when image generation ends, keeping it for 30 minutes at most; the prompt and reference images pass through the server, and the finished image is saved in the user's own cloud space; see the Privacy tab and the Privacy Policy for details.</li><li>If the server restarts during image generation, the request may be sent again once, and the OpenRouter account may be charged twice.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.8.2": [
    "<strong>Noureon 17.8.2 Release Notes</strong>",
    "This version adds the image generation model FLUX.3 Image (Black Forest Labs) and supports more image aspect ratios and qualities.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>FLUX.3 Image:</strong> Appears under Black Forest Labs in the model menu. It can reference up to 10 images at once for editing or compositing, and can generate images up to 4K directly.</li><li><strong>More qualities and ratios:</strong> FLUX.3 Image offers five qualities (768, 1K, 1.5K, 2K and 4K) and 15 aspect ratios, including 1:1, 16:9, 9:16, 3:2, 4:3, 7:5, 5:7, 9:21 and 21:9. The newly added 768 and 1.5K qualities and the 7:5 and 5:7 ratios appear in the menu only for models that support them.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>An OpenRouter key is required; FLUX.3 Image is billed per image, and higher quality costs more (4K is markedly higher than 1K), so please watch usage.</li><li>FLUX.3 Image does not support the \"seed\" setting; entering a seed under Advanced settings may cause failures.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.8.1": [
    "<strong>Noureon 17.8.1 Release Notes</strong>",
    "This version replaces Google's image generation models with the latest Nano Banana 2.1, and shows in Settings how data is currently stored.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>New image generation model:</strong> The former Gemini 3.1 Flash Image, Gemini 3.1 Flash Lite Image and Gemini 3 Pro Image are merged into \"Gemini Nano Banana 2.1\". It supports the ratios 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9 and 21:9, as well as the very narrow or very wide 1:4, 4:1, 1:8 and 8:1; three qualities are available: 1K, 2K and 4K.</li><li><strong>Automatic switch to the new model:</strong> Conversations and settings that used the old models switch to the new model automatically; a selected 512 quality becomes 1K, because the new model has no 512.</li><li><strong>Storage method shown in Settings:</strong> A line of small text is added at the bottom of Data Management stating that data uses split storage; if the line is not shown, the old storage method is still in use.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>Image generation requires an OpenRouter key; 2K and 4K quality cost more than 1K.</li><li>Google will retire the old Gemini 3.1 Flash Image on October 29, 2026; this update has already switched to the new model, so no action is needed from users.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.8.0": [
    "<strong>Noureon 17.8.0 Release Notes</strong>",
    "This version improves page load speed and memory usage: accounts with a large amount of data (especially many images) no longer experience stutter or excessive memory use when opening.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Faster opening, less memory:</strong> Conversations are no longer stored merged as a whole but are kept separately, one per conversation, and are read one by one on opening instead of loading all data into memory at once.</li><li><strong>Images and attachments stored separately:</strong> Images and files in conversations are no longer stored together with the text, for a smoother interface and faster saving.</li><li><strong>Lighter saving:</strong> Only conversations that changed are saved again; the whole data set is no longer rewritten each time.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>The first time the app is opened after the update, it takes a few seconds to reorganize the data into the new storage method; please wait for the screen to appear before using it. Accounts with a large amount of data may take longer.</li><li>After the reorganization is complete, the result is checked first and enabled only if it is correct; if it fails, the original data continues to be used automatically and nothing is lost.</li><li>The original old data is kept for at least another 30 days and is cleared automatically only after everything is confirmed to work.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update reorganizes the data once automatically on the user's device, with no manual action needed; cloud sync and memory work as usual, and cross-device use is unaffected."
  ],
  "17.7.0": [
    "<strong>Noureon 17.7.0 Release Notes</strong>",
    "This version adds \"CLI tools\": the AI can use command-line programs such as OfficeCLI and FFmpeg, run in an isolated sandbox on the server, and the files they produce are shown below the reply.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>CLI store:</strong> \"CLI\" is added to the left sidebar (at noureon.com/cli). The officially provided tools are OfficeCLI (Word, Excel, PowerPoint), FFmpeg (audio and video), yt-dlp (downloading audio and video), csvkit (CSV), Pandoc (document conversion), SoX (audio), twitter-cli and rdt-cli. After a tool is added with \"+\", type @ in the message box to select it; each tool's details page describes its uses and limits.</li><li><strong>Asking before connecting:</strong> When a tool wants to connect to a site, it asks \"Allow this time, Always allow, Refuse\" the first time for each site; internal addresses can never be connected to.</li><li><strong>New \"Permissions\" setting:</strong> Lets you set how network requests are asked about, manage the rules for each site, let the AI use a tool by itself, and keep the login details that tools need (secure credentials, stored encrypted, which can be viewed again and deleted).</li><li><strong>Visual check:</strong> The wait time for checking and redoing presentations is extended, reducing cases where a timeout leaves the presentation unchanged.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>CLI tools require a cloud account sign-in and are used with server replies.</li><li>twitter-cli and rdt-cli require users to provide their own login details; the terms of service of X and Reddit do not allow automated access, and the account may be restricted. When using yt-dlp, please follow each site's terms and copyright rules yourself.</li><li>Third-party software and licenses can be viewed at the bottom of Settings.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no client-side data migration; the new settings sync with the cloud settings."
  ],
  "17.6.0": [
    "<strong>Noureon 17.6.0 Release Notes</strong>",
    "This version adds \"Deep research\": after a topic is given, the system first drafts a research plan, then searches and reads many web pages on its own, and finally produces a complete report with citations. It continues on the server after the page is closed.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Deep research:</strong> Choose \"Deep research\" from the \"+\" menu in the input area. After sending, the research plan is shown first; when the countdown ends, the research starts, and \"Edit\" can be pressed to change the plan or \"Start\" to begin immediately.</li><li><strong>Progress display:</strong> During the research, a progress percentage and the current step are shown; it can be paused or stopped, and additional instructions can be added in the message box at any time, with later research adjusting accordingly.</li><li><strong>Complete report:</strong> The report includes citations and can be read in full screen, with a table of contents on the left and, on the right, the sources and the research process; charts are included when the content has data. It can be downloaded as PDF, Word or Markdown.</li></ul>",
    "<strong>Notes</strong>",
    "<ul><li>A cloud account sign-in is required, and a search key must be entered in Settings; Gemini models are not currently supported.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration."
  ],
  "17.5.0": [
    "<strong>Noureon 17.5.0 Release Notes</strong>",
    "This version allows replies to be produced on Noureon's server: once sent, the reply completes even if the page is closed, the phone is locked or another device is used, and it is already in the conversation when reopened. A \"Privacy\" tab is added to Settings, where replies can be set to be produced on the server or on this device.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Server replies:</strong> Replies are now produced by the server by default (a cloud account sign-in is required). The reply is written and synced as it goes; with the page open it is displayed word by word as usual, and other devices see it live. Pressing \"Stop\" tells the server to stop and keeps what has been written; each user can have at most 5 replies at a time, each lasting at most 2 hours; when the server updates or restarts, replies in progress resume automatically from the checkpoint.</li><li><strong>Live sync and resuming:</strong> The server pushes each small piece of reply text, the thinking process and the web pages found to all open tabs and devices in real time, so that all of them show the same content at the same time. After closing the page, switching to another tab or switching to another conversation and coming back, if the reply is still being produced, the current progress is shown first and then continues in sync with the other tabs; a reply that has finished is the complete reply. If the live channel cannot be reached, it automatically switches to reading the saved messages.</li><li><strong>Always live output:</strong> The \"Output mode\" and \"Typewriter after complete output\" settings are removed; replies are always displayed as they are produced, and those who had chosen the typewriter are switched to live output automatically.</li><li><strong>Python also runs on the server:</strong> Replies in Advanced mode that need to run Python (processing files and data, producing Word/PowerPoint/Excel/PDF files and charts) now run in a container on the server that is isolated from the outside: no internet access, limited memory and time, and deleted when the reply ends. The step list is shown live in every tab, and the reply finishes even if the page is closed; the Word and PowerPoint files produced embed the open-source fonts that Noureon supplies, so they do not shift layout when opened on another computer; the files produced are saved in the user's own cloud space and are shown below the message when reopened. Earlier files in the conversation are also sent only as cloud locations and are no longer uploaded again with every send.</li><li><strong>When the sandbox has problems:</strong> When the VPS cannot be reached or the sandbox is unavailable, Python replies automatically run in the user's browser instead; a brief disconnection during execution is retried automatically with a new sandbox; if retries still fail while the page is still open and the model has not yet written an answer, the reply is also handed back to the browser to be redone.</li><li><strong>Visual check runs on the server:</strong> After a reply writes a presentation, the server automatically draws the slides as images, has the model check them visually, fixes any problems found (for presentations made with Python, the model is asked to produce them again) and writes the result as a new reply. It also completes if the page is closed; all tabs and devices show the same progress line, and during this period no tab can send messages; \"Stop\" aborts it. If the server cannot draw the images, the browser still performs the check as before.</li><li><strong>Privacy tab:</strong> Lists where replies run, what is sent when the server is chosen, the features that currently always stay on the device, and where data is stored. API keys are stored encrypted only temporarily until the reply ends (2 hours 15 minutes at most), are never kept long term and do not appear in logs or error messages.</li><li><strong>Automatic fallback to the device:</strong> When the server cannot be reached, when too many replies are running at the same time, or when this reply uses web search with a model that does not support tool calls, the reply is produced on this device instead; a brief notice is shown when the server cannot be reached or is too busy.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>Web search with models that do not support tool calls, voice input and the camera currently always run on the device.</li><li>There is a limit on the number of Python replies running at the same time; any extra ones wait in a queue.</li><li>Replies when not signed in to a cloud account and in temporary chats are also produced on the device.</li><li>When the server updates, the model stream in progress is redone once.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. After the update, replies are produced by the server by default; those who need to stay on the device can choose This device under \"Settings → Privacy\". Devices that have not yet been updated can still display replies written by the server correctly."
  ],
  "17.4.0": [
    "<strong>Noureon 17.4.0 Release Notes</strong>",
    "This version lets tool-capable models search the web and read pages by themselves, and adds inline citations: small site labels appear at the cited places in the answer, source buttons appear below it, and the right sidebar gains Timeline and Sources tabs.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Models search by themselves:</strong> Models that call tools (including in Advanced mode) can search, open web pages and find text within long pages during a reply, with up to twenty calls, and decide for themselves whether to search. Multiple searches and pages needed in the same round are fetched together, if one search source fails the other is used, content searched recently is cached, and search results carry the date of the data. Search queries are now written by the replying model from the conversation.</li><li><strong>Inline citations:</strong> After a cited sentence in the answer, a small gray rounded label appears (the site icon and name; with several sources it shows \"Site name +1\"). With only one source, a click opens it directly in a new tab; with several sources, an \"N sources\" bottom panel appears. Citations are marked for the sources of a model's built-in search, for tool-calling models and for ordinary models. Copying a reply does not include the citation marks or the execution log.</li><li><strong>Source button and Sources tab:</strong> Below a reply that has sources, a \"Sources\" button (three overlapping site icons) is added next to the copy button: on phones it opens a bottom panel, and on desktop it opens the Sources tab in the right sidebar. Each source row shows the site icon and the name the site declares for itself, the title, the date and a two-line summary; sources now open directly without a confirmation window, and the related notification is removed.</li><li><strong>Right sidebar:</strong> \"Message directory\" is renamed \"Timeline\" and, together with \"Sources\", forms two tabs; the sidebar is wider; on desktop (1024px and above) it opens by pushing the chat page aside, has no white overlay and stays open until Close, Esc or the new panel button on the right of the title bar is pressed. The earlier behavior of popping up when the mouse reached the screen edge is removed, because that hot zone covered the chat scrollbar. The timeline is changed to black-and-white dots with thin lines, shows the speaker and up to three lines of content, and no longer shows markup symbols such as bold and headings (except for tables). While the panel is open it follows the conversation: it is redrawn automatically after switching conversations, a reply finishing, editing and deleting.</li><li><strong>Phone sources panel:</strong> Fills the width, sits flush with the bottom of the screen, follows the finger when dragged using translation only, can be pulled up to nearly full screen, and can be pulled down to close.</li><li><strong>URL display:</strong> In the input box and in sent messages, URLs are shown as a site icon with a short link.</li></ul>",
    "<strong>Fixes and improvements</strong>",
    "<ul><li><strong>Scrollbars:</strong> Unified across the whole site: thin, with a rounded gray thumb and no track background. Pressing the arrows at the ends of a vertical scrollbar scrolls to the very top or bottom with 0.5-second easing; the input area no longer covers the lower part of the chat scrollbar.</li><li><strong>Gradients:</strong> Fade-outs are added below the search bar and above the account bar in the left sidebar, and below the tabs and at the bottom of the right sidebar, so content is no longer cut off by a line when scrolling.</li><li><strong>Highlight in Sources and Timeline:</strong> The row under the mouse pointer now follows in real time during scrolling instead of waiting until scrolling ends; the Timeline no longer has a stuck gray background.</li><li><strong>Sidebar toggles:</strong> Fixed an issue where pressing the top-left menu button while the right sidebar was open (window narrower than 1024px) closed the right sidebar but did not open the left sidebar; fixed a transparent overlay still covering the chat page after the right sidebar was collapsed on desktop, which made the chat page unclickable.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>The names and dates of sources depend on the data provided by each site and search service; when a site has no name, its URL is shown.</li><li>The \"Sources\" tab in the right sidebar lists only the sources of the latest reply that has sources, or of the reply the user pressed, not a combined list for the whole conversation.</li><li>The arrows at the ends of the scrollbar are drawn by the browser and are available only in browsers on some desktop operating systems, not on phones.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. The sources in a reply's execution log gain number, date and summary fields, which are saved with the message; devices that have not been updated ignore these fields and can still display source rows in the old style. Existing conversations, memory and synced data are not affected."
  ],
  "17.3.1": [
    "<strong>Noureon 17.3.1 Release Notes</strong>",
    "This version folds in-progress steps into one line, adds several fixes for the visual check and editing, and makes the search bar's site icon fall back to the next site when the first site has no icon.",
    "<strong>Fixes and improvements</strong>",
    "<ul><li><strong>In-progress steps:</strong> While a reply is being made, the process is folded into one line describing where it is; the steps appear when it is opened (this can be set to expand by default in Settings). The model's thinking becomes a step under \"Working\", and the step timer stops when it ends. After the model has been quiet for a while, \"Writing the code\" is shown, and the words said during the quiet period are revealed gradually instead of all at once. Replies that only search the web and do not run code also get the same \"Processing time\" line. The purpose of each step is now given in the call's note field instead of in text output before the call, so every word of output is part of the answer and is displayed as soon as it appears.</li><li><strong>Visual check:</strong> Slide screens are captured only after fonts have finished loading, so the images the model sees contain text; when the visual-check reply cannot be parsed, the model is asked once more, with no length limit, and the reason is explained in each language; the message a check belongs to is found in the live conversation by message ID, which fixes presentations redone after a refresh being discarded and results being wrongly discarded when the message could not be found.</li><li><strong>Site icons:</strong> Site icons are now fetched by this site's own server (not through a third-party icon service), and sites without an icon no longer show a blank; the search bar's icon moves on to the next site when the first has none, until one is found.</li><li><strong>Editing and sending:</strong> A conversation truncated by editing stays truncated (the truncation point is marked and takes priority over longer copies, and messages after the truncation are synced to the cloud as deletions); replies and visual checks are stopped before an edit truncates the conversation; the notice shown when sending is locked is now displayed in full.</li><li><strong>Other:</strong> The \"[File: filename]\" marker embedded in a reply is removed when a file card exists, and the model is reminded not to write it; the arrow on the phone's collapsed row turns back; a conversation with very short content can still be scrolled; the close button of the file preview no longer has a focus outline. Cloud sync settings gain a \"Sync now\" button and the sync status of each type of data.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration; existing conversations, memory and synced data are not affected."
  ],
  "17.3.0": [
    "<strong>Noureon 17.3.0 Release Notes</strong>",
    "This version lets web search for OpenRouter and NVIDIA models use either Tavily or the free TinyFish, and adds reading of URLs in messages; it also adds automatic retirement of expired models and locking of sending during the visual check, and readjusts scrolling at the bottom of the chat on iPhone.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Selectable search source:</strong> \"Search source\" is added in Settings; choose Tavily or TinyFish, and only the API key of the chosen source is needed. Choosing TinyFish shows the TinyFish key field and a link to apply for a key. The default remains Tavily, and existing settings are unaffected.</li><li><strong>Reading URLs in messages:</strong> OpenRouter and NVIDIA models cannot open links themselves; when a message contains a URL, the app first reads the text of the page and then gives it to the model. The reading function of the chosen search source is used first (Tavily Extract or TinyFish Fetch); when there is no key or the page cannot be read, the other source reads it, and a key for only one of the two is enough. At most 5 URLs are read at a time, up to 15,000 characters per page and about 45,000 characters in total.</li><li><strong>URLs trigger search:</strong> When a message contains a URL, web search is enabled for that request regardless of the auto-search setting (when the model can search and the key is set), and a notice of the automatic activation is shown; the conversation's own search switch is unchanged.</li><li><strong>Read results and failure explanations:</strong> A \"Read N pages\" source row is added above the reply, separate from \"Searched N sites\". When a URL cannot be read, or no reading key is set, the model is told so and is asked to explain this honestly to the user rather than guess the content of the page. The council also reads URLs and provides them to the first-round members and the synthesizing model.</li><li><strong>Automatic retirement of expired models:</strong> A model with a retirement date is removed from the model list automatically on that day, and conversations and saved settings that use it switch to the default model, with no manual removal needed. A test model, Space Bunny Alpha (OpenRouter, free, supports image and video input, thinking level from Low to Max), is added, scheduled to retire on 2026-10-05, with the retirement date shown in the menu.</li><li><strong>Sending locked during the visual check:</strong> While the automatic visual check of a presentation is running, no new message can be sent in that conversation, and the input box states the reason; sending is released immediately when the check completes or \"Stop\" is pressed.</li></ul>",
    "<strong>Fixes</strong>",
    "<ul><li><strong>iPhone chat bottom scrolling:</strong> Removed the touch listeners that prevented pinch zoom and could delay swipes while the page was busy (Safari gesture events are used instead); when the finger-release signal is lost, scroll protection no longer wrongly assumes a finger is still pressed; the chat and the thinking, code and output boxes keep a small extra scroll range at the very bottom, so that a swipe starting from the very bottom scrolls normally.</li><li><strong>Thinking row spacing:</strong> Fixed the expand arrow sitting right next to the seconds count.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>Reading URLs depends on the Tavily or TinyFish service; PDFs, sites that require sign-in and sites that block automated reading may not be readable, in which case the model says so honestly.</li><li>For complex, multi-condition queries, TinyFish search may fall short of Tavily advanced search according to third-party evaluations; the response formats of TinyFish and Tavily Extract are implemented according to their documentation, so please report any abnormal reading results.</li><li>If scrolling on iPhone still has problems, please report them with a screen recording attached.</li><li>Space Bunny Alpha is an anonymous test model, and its provider may adjust its behavior before it is retired.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. Settings gain a search source field and a TinyFish key; if not set, Tavily is kept. Like other API keys, the TinyFish key is treated as a sensitive setting and is masked on export. The execution log of a reply gains a \"read\" marker for sources; devices that have not been updated ignore it."
  ],
  "17.2.1": [
    "<strong>Noureon 17.2.1 Release Notes</strong>",
    "This version updates Claude Sonnet 5 and OpenAI GPT-6 Sol on OpenRouter to the newer Claude Sonnet 5.5 and GPT-6.1 Sol.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Claude Sonnet 5.5:</strong> Replaces Claude Sonnet 5. The price is unchanged at US$2 per million input tokens and US$10 per million output tokens; supports image and file input; the thinking level has five steps (Low, Medium, High, Extra high and Max), with High as the default.</li><li><strong>OpenAI GPT-6.1 Sol:</strong> Replaces OpenAI GPT-6 Sol. The price is unchanged at US$2 per million input tokens and US$10 per million output tokens; supports image and file input. The thinking level changes to Low, Medium, High, Extra high and Max; \"Fast mode\" is no longer offered, and the default is Medium.</li><li><strong>GPT-6.1 Sol in Advanced mode:</strong> OpenAI documentation states that tool calls for this model require the Responses API, so in Advanced mode (Python) replies, every round for this model goes through OpenRouter's Responses API; thinking summaries are still shown live, and the model's thinking and tool calls are carried back unchanged between rounds. Ordinary conversations, Standard mode and other models keep the original call method.</li><li><strong>Existing conversations:</strong> Conversations, Model Council groups and recently used models that used Sonnet 5 or GPT-6 Sol switch automatically to the new versions; GPT-6 Sol conversations set to \"Fast mode\" use the default \"Medium\".</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>The Responses API path that GPT-6.1 Sol uses in Advanced mode is implemented according to the OpenAI and OpenRouter documentation; if an error appears in Advanced mode, please report the error message.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration; existing conversations, memory and synced data are not affected."
  ],
  "17.2.0": [
    "<strong>Noureon 17.2.0 Release Notes</strong>",
    "This version changes the execution process in Advanced mode into a processing panel with one line per step, adds a source row for web search, and lets Gemini use its built-in search and Python together.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Processing panel:</strong> A line \"Processed for 10m 28s\" is shown above the reply; when expanded, each step is one line of gray text that can be expanded individually. Code steps have a terminal icon, searches have a globe icon, and thinking is text only. The time in the title is the total time of the whole reply (search, thinking, execution and file handling); for old replies, the sum of the times of the steps and thinking is used instead. Replies with only thinking and no other steps keep the original single \"Thinking process\" line.</li><li><strong>Step content:</strong> When each code step is expanded, the code appears in a light card labeled \"Python\" with a copy button, syntax-highlighted and scrolling horizontally when too long; the output is shown below the card, and failed steps are marked in red. Collapsed steps show no expand arrow, which appears only on hover and points down when expanded; touch devices have no hover state, so no arrow is shown when collapsed. Step names no longer say \"Nth time\".</li><li><strong>Live display matches the saved one:</strong> The step list while a reply is in progress and the saved processing panel use the same styles, so what is seen matches what is seen when the reply is reopened later. The saved panel expands and collapses with an eased animation and respects the system's \"Reduce motion\" setting.</li><li><strong>Explanations between steps:</strong> What the model says before running code is shown as normal text between the steps, no longer mixed into the final answer, and is saved with the reply. One line is added to the system instructions: before each call of the execution tool, explain in one sentence what will be done and why. The first 400 characters at most of each round are buffered temporarily to decide whether they are an explanation or an answer; short answers appear all at once only when the round ends, and long answers stream as usual.</li><li><strong>Thinking collapsed by default:</strong> Thinking in progress no longer expands automatically; the user expands it when needed, and thinking that has been expanded is not closed when new content arrives. The same applies to the \"Thinking\" line in Standard mode.</li><li><strong>Search sources:</strong> For replies using Tavily or Gemini's built-in search, the processing panel shows \"Searched N sites\", which expands into site icons and domain names. Clicking a source first shows a confirmation window, and only after confirming does it open in a new tab; the window has a \"Don't remind me again\" checkbox, and this choice is remembered only on this device. The small icons are fetched by the browser directly from the site's /favicon.ico, and a globe icon is shown when one cannot be fetched. Only http and https URLs are accepted. Gemini returns Google redirect URLs, so the domain name it provides is shown.</li><li><strong>Gemini searching and running Python together:</strong> Gemini does not allow built-in search and function tools in the same request, so it used to fall back to Standard mode. Now it first runs a search on its own, produces a short summary, and hands the summary to the Python-running turns as reference material. During the search the progress line shows \"Searching the web\", which changes to \"Searched N sites\" when done; search time counts toward the total time; if the search fails, the reply proceeds as usual, only without a summary.</li></ul>",
    "<strong>Other improvements</strong>",
    "<ul><li><strong>Press feedback:</strong> All pressable controls dip slightly and spring back when pressed, and disabled controls shake slightly when pressed; hover styles apply only on devices with a pointer.</li><li><strong>Busy spinners:</strong> Buttons that require waiting, such as export, import, cloud data import, sign-in and image operations, show a spinner while processing.</li><li><strong>Files:</strong> When a file block that the model writes separately has the same name as a document produced by the design system, an extra blank card no longer appears; Word, PowerPoint, Excel and PDF file blocks with empty content are no longer shown as cards, and blank files are no longer produced.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>Search sources are supported only for Tavily and Gemini's built-in search; the built-in search of other providers does not resolve sources. Gemini's sources appear only after the reply is complete, and the Google redirects may stop working in the future.</li><li>Gemini's search is performed only once at the very beginning; the model cannot search again by itself while running code.</li><li>The explanations between steps depend on whether the model writes them as instructed.</li><li>There is currently no settings switch to restore \"Don't remind me again\"; the only way is to clear this site's data.</li><li>Blank file blocks that the model writes by itself in Standard mode are not covered by this change.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. The execution log gains three fields (total time, search sources and step explanations), which are saved with the message; devices that have not been updated ignore these fields and can still display steps in the old style. Existing conversations, memory and synced data are not affected."
  ],
  "17.1.1": [
    "<strong>Noureon 17.1.1 Release Notes</strong>",
    "This version fixes issues with the input area, model picker, chat scrolling and thinking display on phones and iPhone, and adjusts the page header.",
    "<strong>Fixes</strong>",
    "<ul><li><strong>Phone input box:</strong> Changed to two rows, with input on top and tools below, keeping the microphone button; the Settings title is kept, and when returning from Settings the back button returns to its original position.</li><li><strong>Phone model picker:</strong> Opens at the same position as the \"Design\" picker, with a fixed size that no longer changes or jitters during search and when the keyboard opens and closes; the highlight of the cancel button is cleared when the picker is closed from outside.</li><li><strong>Voice input:</strong> The waveform shown while dictating is enlarged.</li><li><strong>Header:</strong> Changed to a thin solid block of fixed height with no divider line, with messages fading out at its lower edge; the height no longer changes depending on whether the temporary chat button appears. When switching conversations, the previous conversation fades out instead of switching abruptly.</li><li><strong>Chat scrolling (iPhone):</strong> The phone's chat column is no longer a second scroll container; a swipe that starts at the bottom of the conversation stays on the conversation and no longer bounces back to the bottom. Opening a conversation no longer jitters first.</li><li><strong>Thinking and code boxes (iPhone):</strong> They can be scrolled normally for reading while a reply streams, and content is not moved under the finger; they can also be swiped up directly when resting at the bottom, with 2 pixels reserved at each end of the scroll box. Text that appears during streaming fades in instead of being blurred.</li><li><strong>Thinking display:</strong> When \"Stop\" is pressed in Advanced mode, the thinking produced so far is kept and marked \"Thinking interrupted\", collapsed by default; when expanded again it jumps to the latest content; thinking continues to be output while the user scrolls up to read; the thinking row responds to a single tap and no longer needs several.</li><li><strong>Reply time and copy:</strong> The time and copy row of each reply is fixed at the far right.</li><li><strong>Bubble color menu:</strong> Fixed the menu collapsing abnormally.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>If scrolling on iPhone still has problems, please report them with a screen recording attached.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration; existing conversations, memory and synced data are not affected."
  ],
  "17.1.0": [
    "<strong>Noureon 17.1.0 Release Notes</strong>",
    "This version redesigns the model selection next to the input box, adds nameable groups to the Model Council, and improves the controls for thinking level, voice input and notifications.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Model picker:</strong> Single model and Model Council are merged into one button and one panel next to the input box, replacing the model menu in the header and the council panel; the top of the panel switches between \"Single model\" and \"Council\". Single model becomes one searchable list grouped by company, with no more tapping through provider, tier, company and category; each row has two lines, the price and description are placed in a tooltip, and more models are visible at once.</li><li><strong>Recent:</strong> The three most recently used models are shown at the top of the single-model list and of the council's member and combiner lists; the list is updated when a model is selected or a message is sent, the model in use is always among them, and these models are also still kept in their original company groups.</li><li><strong>Council groups:</strong> Up to five groups can be saved, each with a name, members and a combiner, and a group is applied with a click; the current setup can be saved as a new group, and on the edit page a group can be renamed (up to 20 characters), have its members and combiner reselected, and be deleted. Consensus or discussion is not part of a group. The council label on the input box now shows only \"Consensus\" or \"Discussion\".</li><li><strong>Thinking level:</strong> Moved out of the model list into a separate button next to the input box (the current level is shown in gray) with a narrow panel. Adjustment is now a stepped slider: one dot per level, with a knob taller than the track, jumping step by step while dragging and showing the level name live, and saving only after release; the arrow keys, Home and End also work, and devices that support vibration give a light buzz at each step.</li><li><strong>Voice input:</strong> After the microphone is pressed, the whole input row becomes a dictation row: a dimmed \"+\", a waveform that grows with the volume, and cancel (✕) and done (✓). On completion the ✓ becomes a spinner, and the text is appended after the original message only once it is done; Enter completes, Esc cancels, and Ctrl+Shift+D starts or completes. Hovering over the microphone shows a tooltip and the shortcut in the interface language. Voice input in the search window is unchanged.</li><li><strong>Top-right notifications:</strong> Changed to white cards with a thin border, with small icons distinguishing success, warning and error, and optionally one action button and a close button; at most 3 are shown at once and the rest are queued, an identical message only updates the existing one, the countdown pauses while the pointer rests on it, notifications stay for 3 to 6 seconds, and on phones they sit at the top edge of the screen. The search notice shown when opening the Model Council is shortened to one sentence, with an \"Enable search\" button.</li><li><strong>Thinking display:</strong> Thinking uses the same style while in progress and after it is finished; in Advanced mode, once the model starts outputting the answer, the thinking row ends and collapses, recording the time spent thinking. The collapse and expand transitions and the panel open/close and page-change animations are adjusted together, and respect the system's \"Reduce motion\" setting.</li></ul>",
    "<strong>Other improvements</strong>",
    "<ul><li>When switching between single model and council, selecting a model, or saving a group, the screen updates first and saving begins only after the screen has been drawn, so it no longer waits for all conversations to be written.</li><li>The \"Design\" button on the input box preloads the picker when the browser is idle or when the pointer or a finger comes near; the picker is drawn only once and kept, thumbnails are drawn one at a time in idle moments, and a spinner is shown first if they are not loaded in time; the panel no longer applies a background blur.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>\"Recent\" follows the order of most recent use and does not count how many times a model has been used.</li><li>The price and description are placed in tooltips, which cannot be seen on touch devices without a pointer.</li><li>The voice waveform requires microphone permission, and the browser must allow the microphone to be used together with speech recognition; otherwise the waveform only fluctuates slightly, and the other functions are not affected. If Ctrl+Shift+D is taken by the browser, press the microphone instead.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. Settings gain two fields, \"Council groups\" and \"Recently used models\", which older versions ignore; existing conversations, memory and synced data are not affected."
  ],
  "17.0.0": [
    "<strong>Noureon 17.0.0 Release Notes</strong>",
    "This version lets AI replies produce and preview files such as Word, Excel, PowerPoint and PDF directly, adds an \"Advanced\" way of making them that runs Python in the browser, and provides live display of the thinking process, execution steps and automatic visual check.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Downloadable files:</strong> Files in AI replies appear as cards that can be previewed and downloaded, and multiple files in the same reply can be obtained at once with \"Download all (ZIP)\". Supported formats are text-based ones such as Markdown, CSV, JSON and code, as well as Word (docx), Excel (xlsx), PowerPoint (pptx) and PDF; HTML files are previewed in an isolated sandbox. On iPhone, non-Safari browsers such as Chrome save files through the share sheet.</li><li><strong>PowerPoint:</strong> 17 layouts, with support for native charts and tables, icons, speaker notes, uploaded images and slide preview. The AI adaptive design can be used according to the content, or one of 20 templates can be specified; when a template is specified, the program enforces it, and only the primary and accent colors may be adjusted in the conversation.</li><li><strong>Word and PDF:</strong> Word offers 9 templates and AI adaptive design, a cover page and font embedding, and can be viewed with page preview; PDF shares the same design with Word, all fonts are subset and embedded (including Simplified Chinese, Japanese, Korean and monochrome emoji), and it supports table-of-contents page numbers, bookmarks, vector charts, math formulas and PDF.js preview.</li><li><strong>Excel:</strong> Fixed styles with an adjustable primary color, a formula policy with cached values, frozen panes, filters and merged cells, and support for native charts and worksheet preview (including filter buttons).</li><li><strong>\"Design\" menu:</strong> The \"Design\" button in the input box is split into two pages, Presentations and Word/PDF, and \"Mode: Standard / Advanced\" is added. New conversations default to Advanced, and the default can be changed in Settings.</li><li><strong>Automatic visual check:</strong> After a vision-capable model writes a presentation, the program converts each slide into an image and has the model check it for one round; when problems are found, a new reply containing the corrected file is added. Each file is checked only once, and the check can be turned off in Settings. The check progress is shown as one line below the message, which can be expanded to see each step, and the check can be stopped.</li><li><strong>Advanced mode (Python):</strong> The model can run Python 3.14 and packages such as numpy, pandas, matplotlib, python-docx, python-pptx, openpyxl and reportlab in an isolated sandbox (run.noureon.com) in the browser, to analyze uploaded files, compute charts precisely and produce files. The first use requires a download of about 30 MB. Tool calls with Gemini and OpenRouter are supported; when the model does not support them, the browser does not support them, or the Model Council or Learning mode is used, Standard mode is used automatically and the reason is explained.</li><li><strong>Free-form file creation:</strong> In Advanced mode, the model designs Word, PowerPoint and PDF files itself by default; when a design template is selected, files of that type are handed to the design system instead. The sandbox has the Inter and Source Han Sans and Serif fonts (Traditional and Simplified Chinese, Japanese, Korean) built in, and Word and PowerPoint files automatically embed the fonts they use after the reply ends. Files are produced only when the user asks for a file or provides one; ordinary writing and Q&A are answered in text.</li><li><strong>File storage and preview:</strong> Files produced by Python are saved in the message and are synced, exported and shared with the conversation; custom-built xlsx and pptx readers are provided to preview freely designed files, and other files such as images and ZIP can also be previewed or downloaded. When a file is missing on a device, \"Run again\" can restore it. Freely designed presentations also go through the visual check, and when problems are found, the model re-runs Python to produce a corrected version.</li><li><strong>Execution display:</strong> A step list is shown in the message from the start of a reply: thinking, preparing Python, the code of each run, the live output and the files produced (images as thumbnails); running steps show a timer, and failed steps keep the error. Completed steps collapse to one line, and expanding and collapsing have a brief transition animation, respecting the system's \"Reduce motion\" setting.</li><li><strong>Thinking display:</strong> In any conversation, whenever the model sends thinking, an expandable thinking block is shown above the answer, and it is kept after completion as \"Thinking process\" or \"Thinking summary\" and can still be viewed after a refresh. A model's own thinking is labeled \"Thinking process\"; for models whose provider supplies only a summary (such as Gemini and Claude), it is labeled \"Thinking summary\". Reading earlier thinking is not forced to scroll to the latest content; if the reply is stopped before the answer appears, the thinking is kept as \"Thinking interrupted\" with the content generated so far. A thinking-stream parameter is added to requests to NVIDIA models.</li></ul>",
    "<strong>Other improvements</strong>",
    "<ul><li>When a page was already open before a new version was deployed, a failure to load the new files now shows \"Noureon has just been updated to a new version\" with a reload option, instead of the browser's raw error, and no repeated reload occurs within one minute.</li><li>When \"Stop\" is pressed, the partial reply already received is kept; a reply in progress is kept when switching conversations.</li><li>Code in chat messages and in the file source view is colored by language; the NVIDIA and OpenRouter model catalogs are updated; DOMPurify is upgraded to 3.4.13.</li></ul>",
    "<strong>Known limitations</strong>",
    "<ul><li>The thinking display depends on the provider: Gemini and Claude supply only summaries, and the OpenAI series does not supply thinking text, so in these cases a summary is shown or nothing is shown.</li><li>The preview of a freely designed PowerPoint is drawn approximately by the custom-built reader; shape gradient fills, shadows and some chart details differ from PowerPoint, and the downloaded file is authoritative.</li><li>NVIDIA models currently do not support tool calls and do not use Advanced mode.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. Conversations containing execution logs or files are synced to other devices; devices that have not yet been updated to this version show the execution log as a block of raw text and cannot see the files produced by Python, so please update them first. Existing conversations, memory and synced data are not affected."
  ],
  "16.9.1": [
    "<strong>Noureon 16.9.1 Release Notes</strong>",
    "This release improves the save action for temporary chats on desktop, preventing the message timeline on the right from interfering with the bookmark button.",
    "<strong>Fixes</strong>",
    "<ul><li><strong>Save action:</strong> The temporary chat status and bookmark button area at the top right no longer triggers the message timeline, so a temporary chat can be saved permanently reliably.</li><li><strong>Message timeline:</strong> On desktop, the hover trigger area along the right edge now starts below the top bar. The existing ways of opening it are unchanged.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. Existing regular chats, temporary chats and memory data are not affected."
  ],
  "16.9.0": [
    "<strong>Noureon 16.9.0 Release Notes</strong>",
    "This release adds a temporary chat mode that can be converted to a regular chat at any time, with a clear choice of memory access and a clear privacy boundary.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Temporary chat:</strong> Can be started from the bottom left of the chat interface. Temporary content does not appear in chat history, search, export or cloud sync, and does not create new memories.</li><li><strong>Personalization controls:</strong> Before starting, a chat can be set to reference existing memories, or to use a non-personalized mode that ignores memories, plugins and custom instructions.</li><li><strong>Permanent saving:</strong> Once a chat has started, it can be saved permanently from the bottom left, and it is converted in place to a regular chat. Content from before saving is not written back into memory retroactively.</li><li><strong>Interface status:</strong> Temporary mode shows its status at the top right, the notice in the center reuses the position of the greeting, and the bottom-left controls no longer shift or cover the main content.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. Existing regular chats, memories and sync data are not affected."
  ],
  "16.8.0": [
    "<strong>Noureon 16.8.0 Release Notes</strong>",
    "This release reworks the desktop input bar and its attachment-feature interactions, and fixes the layout stability of the attachment-feature menu on mobile.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Input bar:</strong> The desktop width, spacing, corner radius, shadow and top-edge hairline have been readjusted. Long text extends downward, and an expand control is provided beyond ten lines. Attachments and feature tags no longer deform the input bar.</li><li><strong>Attachment features:</strong> Camera, image, file, web search, Model Council and Learning Mode now use six original PNG icons. The desktop menu adds item highlighting and hides the move-to-bottom button when expanded, and the mobile menu also keeps a compact layout.</li><li><strong>Inline features:</strong> Supported feature tags can be inserted on any line and at any position of the cursor, and can be selected, copied and deleted with Backspace like text. After sending, they stay at the same horizontal level as the message text.</li><li><strong>Stability:</strong> Fixed the issues where attachment features could not be activated again after a message was sent, and where selecting the same attachment repeatedly did not trigger.</li></ul>",
    "<strong>Compatibility</strong>",
    "This update requires no data migration. Existing chats, attachments and model settings are not affected."
  ],
  "16.7.1": [
    "<strong>Noureon 16.7.1 Release Notes</strong>",
    "This release syncs the latest model lists, prices and multimodal capabilities for Gemini, OpenRouter and NVIDIA.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Model upgrades:</strong> Gemini is updated to 3.8 Flash; Claude Fable is updated to 5.1; OpenAI GPT-5.5 is updated to GPT-6 Astra.</li><li><strong>New models:</strong> OpenRouter adds Z.ai GLM 5.3 Flash; NVIDIA is updated to DeepSeek V4 Pro 0813 and Kimi K3.</li><li><strong>Capabilities and prices:</strong> Thinking levels, image input capabilities and prices are updated according to official data, and the DeepSeek descriptions are unified as concise input/output prices.</li><li><strong>Model cleanup:</strong> Ox Alpha is removed; existing model selections fall back safely through the settings migration mechanism.</li></ul>",
    "<strong>Compatibility</strong>",
    "Existing settings for Gemini 3.7 Flash, Claude Fable 5, GPT-5.5 and older NVIDIA models are migrated automatically to the corresponding new models."
  ],
  "16.7.0": [
    "<strong>Noureon 16.7.0 Release Notes</strong>",
    "This release adjusts the streaming presentation and layout stability of chat content, and fixes several issues with math formulas, charts, tables and message actions.",
    "<strong>Main changes</strong>",
    "<ul><li><strong>Math formulas:</strong> Fixed KaTeX command parsing in the production environment, and the splitting of inline delimiters and paired stretchy delimiters across lines. Formulas continue to render live as content streams in, and line wrapping and local horizontal scrolling of long formulas are improved.</li><li><strong>Charts and tables:</strong> While a chart is being generated, the raw code is no longer shown; a localized status message appears instead, and the chart is displayed as soon as the data is complete enough to render. While a table is being generated, repeated rebuilding that caused flicker is avoided, and the existing DOM and scroll state are preserved once it completes.</li><li><strong>Chat layout:</strong> The vertical spacing of user messages and assistant replies, the rhythm of headings and the use of dividers are adjusted to reduce unnecessary visual separation.</li><li><strong>Message and media actions:</strong> Fixed the copy and edit buttons of user messages on desktop hiding too early when the pointer moves over them, and a single image not being right-aligned on mobile.</li></ul>",
    "<strong>Compatibility</strong>",
    "This release does not change existing chat data, account data or the sync format."
  ],
  "16.6.7": [
    "<strong>🚀 Noureon 16.6.7: Video Preview and NVIDIA Model Updates</strong>",
    "This update fixes blank video thumbnails and the color of the media close button, and syncs the latest NVIDIA DeepSeek model.",
    "<strong>✨ What's new:</strong>",
    "<ul><li><strong>🎬 Video thumbnails:</strong> The video module in the input bar and after sending now captures a visible frame as the thumbnail, and uses a dark background while loading.</li><li><strong>✕ Media controls:</strong> The remove and close X buttons on image and video previews are now always shown in white.</li><li><strong>🧠 NVIDIA models:</strong> DeepSeek V4 Flash is updated to DeepSeek V4 Flash 0731, which supports three thinking levels (off, high and max), and existing model settings are migrated automatically.</li></ul>",
    "Noureon will continue to improve the multimedia experience and model support."
  ],
  "16.6.6": [
    "<strong>🚀 Noureon 16.6.6: New Visual Reasoning and Stealth Test Models</strong>",
    "This update adds the latest OpenRouter models, and adds a first-use terms confirmation for third-party Stealth models.",
    "<strong>✨ What's new:</strong>",
    "<ul><li><strong>🧠 New models:</strong> Adds the free test version Ox Alpha, and DeepSeek V4 Flash Vision Exp, which supports image input.</li><li><strong>🔐 First-use confirmation:</strong> The first time Ox Alpha is selected, the Stealth Model Terms are shown. After confirmation the state is saved and the prompt is not repeated.</li><li><strong>🌍 Multilingual and capability data:</strong> Syncs the terms prompt, thinking levels, image input capabilities and latest prices across the five interface languages.</li></ul>",
    "Noureon will continue to update model support and user protection measures."
  ],
  "16.6.5": [
    "<strong>[Noureon 16.6.5: Model List and Provider Support Updates]</strong>",
    "This update refreshes model versions, capability labels and prices based on the latest model data from the Google Gemini API and OpenRouter, and streamlines provider integrations.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>⚡ New-generation models:</strong> Gemini is upgraded to 3.7 Flash; OpenRouter updates DeepSeek, Qwen and Grok, and adds the free versions of GLM 5.3 and Nemotron 3.5 Lightning.</li><li><strong>🧠 Capability data sync:</strong> The selectable thinking levels, image input support, model prices and release ordering are updated according to provider data.</li><li><strong>🧹 Provider cleanup:</strong> The NVIDIA list keeps only DeepSeek, MoonshotAI, Step and Z.ai models; Xiaomi models and the native Step Plan provider integration are removed.</li></ul>",
    "The Noureon team"
  ],
  "16.6.4": [
    "<strong>[Noureon 16.6.4: More Stable Search on Mobile]</strong>",
    "This patch release continues to improve chat search on mobile, making the screen more stable and the interaction cleaner when the on-screen keyboard opens and closes.",
    "<strong>✨ Fix highlights:</strong>",
    "<ul><li><strong>⌨️ More stable keyboard transitions:</strong> The way the mobile browser's visible area is synchronized has been adjusted, reducing screen jumping, delay and brief flashes of the chat background when the keyboard opens and closes.</li><li><strong>📱 Search controls no longer covered:</strong> The input bar and mode selection are now laid out according to the visible area, so search results can still be viewed normally while the keyboard is open.</li><li><strong>✨ Cleaner idle screen:</strong> The magnifier icon and the “Search chats” hint in the center of the mobile search page are removed, so these elements no longer lag or jump when the keyboard switches.</li></ul>",
    "The Noureon team"
  ],
  "16.6.3": [
    "<strong>[Noureon 16.6.3: More Intuitive and Stable Chat Search]</strong>",
    "This patch release reorganizes the chat search experience so that chat content can be found faster on both desktop and mobile.",
    "<strong>✨ Fix highlights:</strong>",
    "<ul><li><strong>🔎 Three search methods:</strong> The title keyword, content keyword and natural language modes are kept, and the currently selected mode follows the user's custom interface colors.</li><li><strong>💬 Clearer results:</strong> Search lists only chats that already exist in the history, uses a single simple chat icon, and removes yellow highlighting, relevance levels and extra preview actions.</li><li><strong>🖥️ Desktop redesign:</strong> A centered search window is used, and the arrangement of the input bar, mode switch, voice and close controls is adjusted to reduce unnecessary whitespace.</li><li><strong>📱 More stable on mobile:</strong> A white search page suited to touch and the on-screen keyboard is used, improving flicker, jumping, obstruction and invisible results while typing.</li></ul>",
    "The Noureon team"
  ],
  "16.6.2": [
    "<strong>[Noureon 16.6.2: Clearer Safety Boundaries and Scope for Nouras]</strong>",
    "This patch release makes Nouras keep clearer boundaries of responsibility in chats, while preventing personalized instructions from affecting background processing.",
    "<strong>✨ Fix highlights:</strong>",
    "<ul><li><strong>🛡️ Reminder when creating high-risk Nouras:</strong> When creating or editing a custom Noura in a high-risk professional field such as medical, psychological, legal or investment, a reminder is shown that it is not professionally verified and cannot replace qualified professional help. Users can still decide whether to continue creating it.</li><li><strong>💬 Chat and background tasks separated:</strong> Noura instructions are applied only to answers visible to the user and to Model Council discussions. They do not enter background tasks such as search, attachment translation or memory organization, reducing unintended personalization effects.</li><li><strong>🤝 Safer mental health Nouras:</strong> “Inner Journey” and “Mindful Guide” are explicitly positioned as assistants for information and organizing thoughts, and do not provide diagnosis, treatment, medical orders or medication adjustment. In the event of imminent danger, they first encourage contacting local emergency resources or a trusted person.</li></ul>",
    "The Noureon team"
  ],
  "16.6.1": [
    "<strong>[Noureon 16.6.1: More Complete Automatic Repair of the Cross-Chat Index]</strong>",
    "This patch release completes the automatic repair of the media index, and makes background indexing progress easier to understand.",
    "<strong>✨ Fix highlights:</strong>",
    "<ul><li><strong>🖼️ Media index filled in automatically:</strong> When the local index of an existing image, audio, video or document is missing, the background check now restores it directly from the saved media summary and attachment. It is no longer necessary to run a manual check and press optimize first.</li><li><strong>🔎 Clearer index progress:</strong> Background processing now appears as “Check local index”, and the numbers of repaired, already present and failed items are distinguished, so the segment-by-segment scan no longer looks like the whole index is rebuilt every time.</li></ul>",
    "The Noureon team"
  ],
  "16.6.0": [
    "<strong>[Noureon 16.6.0: Automatic Search, Fresher Memory and More Reliable Cross-Chat Recall]</strong>",
    "This release makes web search more predictable and cross-chat memory more transparent and stable. An installed PWA can now rotate naturally with the device.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>🌐 More controllable automatic web search:</strong> Search is enabled automatically only for the current question when it clearly needs up-to-date external information. When turned on manually, it continues to apply to the current chat and is not changed by automatic detection.</li><li><strong>🧠 Fresher, more transparent memory:</strong> Adds a syncable memory summary. When an answer refers to an earlier chat, an expandable source is shown and the original chat can be opened to verify the content. When an earlier version of an answer is requested precisely, the system first retrieves the original content and key details.</li><li><strong>🛡️ More reliable local recall:</strong> Fixed the history index possibly being lost or going stale during refresh, sync and move-to-trash scenarios, and added safe recovery and protection of the last valid index.</li><li><strong>📱 PWA free rotation:</strong> An installed Noureon can switch naturally between portrait and landscape on phones and tablets, keeping the chat and core operation state.</li><li><strong>✨ More stable chats:</strong> Fixed the whole-page flash when a model reply completes, and improved presentation when switching models and quoting earlier answers.</li></ul>",
    "The Noureon team"
  ],
  "16.5.0": [
    "<strong>[Noureon 16.5.0: A More Reliable Workspace, Smarter Memory and More Complete Creation Tools]</strong>",
    "This official release brings together the recent core capability upgrades: the cloud workspace moves to a safer, recoverable sync flow; the memory system offers clearer management and consent for cross-chat recall; and creation, image and data presentation features are expanded as well.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>☁️ Safer cloud sync:</strong> Adds live workspace updates, incremental sync, on-demand asset loading, recovery backups and safe deletion, reducing the risk of cross-device sync conflicts and accidental loss.</li><li><strong>🧠 Memory and recall upgrades:</strong> Strengthens personal memory review, conflict handling, topic summaries, media memory and the local history index. Cross-chat recall now requires consent separately on each device.</li><li><strong>🎨 Image and content creation:</strong> Adds OpenRouter and Step Plan image generation, continued editing of the most recently generated image, editing of a specified region, and interactive in-message charts.</li><li><strong>💬 Better chat efficiency:</strong> Supports editing sent messages, quoted follow-up questions, and combined rules for Learning Mode and Noura, and improves the responsiveness of Model Council and the chat interface.</li><li><strong>🔐 Privacy and account protection:</strong> Adds a secure password recovery flow, API key masking and separation of sensitive settings, and sensitive information is better protected when exporting data.</li><li><strong>🌍 Interface and model updates:</strong> Expands the Russian and Spanish interfaces, folder customization, and model ordering and the selectable model list. Several models and the mobile experience are also updated.</li></ul>",
    "The Noureon team"
  ],
  "16.4.5": [
    "<strong>[Gemini 3.0 Flash Now Available and Model List Adjustments]</strong>",
    "This update adds Google Gemini 3.0 Flash Preview and tidies the model list: the older Gemini 2.5 series models are retired, and several cost-effective models are added.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>⚡ Gemini update:</strong> Adds <strong>Gemini 3.0 Flash Preview</strong> (supported through Google native and OpenRouter), with image input support. The older models Gemini 2.5 Pro, Flash and Flash-Lite are retired at the same time.</li><li><strong>🌟 New models:</strong> Adds OpenRouter's <strong>Xiaomi Mimo V2 Flash</strong> (free) and <strong>Minimax M2.1</strong>.</li><li><strong>💻 Coding model update:</strong> Adds <strong>OpenAI GPT-5.2 Codex</strong> (with image input support), replacing GPT-5.1 Codex.</li></ul>",
    "The Noureon team"
  ],
  "16.4.4": [
    "<strong>[GPT-5.2 Series Added and Model List Adjusted]</strong>",
    "This update adds the OpenAI GPT-5.2 series, removes older versions, and adjusts the Qwen series pricing.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>🚀 Model updates:</strong> Adds <strong>OpenAI GPT-5.2</strong> and <strong>GPT-5.2 Pro</strong>. Older models such as GPT-5.1, GPT-4.1 and Grok 4 Fast are retired at the same time.</li><li><strong>⚖️ Pricing changes:</strong> The pricing of <strong>Qwen 3 Next 80B</strong> and <strong>Qwen 3 Coder Exact</strong> has been updated. Please refer to the model list for the latest pricing.</li></ul>",
    "The Noureon team"
  ],
  "16.4.3": [
    "<strong>[Free Coding Model Added, Grok Pricing Adjusted]</strong>",
    "This update adds the free coding model Mistral Devstral 2512, and moves Grok 4.1 Fast to official pricing.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>💻 Free coding model:</strong> Adds <strong>Mistral Devstral 2512</strong>, aimed at code generation and technical questions and answers, free to use.</li><li><strong>💰 Pricing update:</strong> The limited-time free period of <strong>Grok 4.1 Fast</strong> has ended, and it is updated to official pricing (input $0.20 / output $0.50). The old free channel is removed to ensure service stability.</li></ul>",
    "The Noureon team"
  ],
  "16.4.2": [
    "<strong>[Free Vision Models Added]</strong>",
    "This update adds Amazon Nova 2 Lite and DeepSeek V3.2.",
    "<strong>✨ Highlights:</strong>",
    "<ul><li><strong>👁️ Free vision model:</strong> Adds <strong>Amazon Nova 2 Lite</strong>, with image input support, free to use.</li><li><strong>🧠 Text model:</strong> Adds <strong>DeepSeek V3.2</strong>, with lower pricing and reasoning capability.</li></ul>",
    "The Noureon team"
  ],
  "16.4.1": [
    "<strong>[Model Database Cleanup: Vision and Coding Models Added]</strong>",
    "Version 16.4.1 tidies the model database, adds programming and advanced vision recognition models, adjusts the prices of some models and removes outdated options.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>🚀 New models:</strong> Adds <strong>OpenAI GPT-5.1 Codex</strong> and <strong>Claude 4.5 Opus</strong>, both with image input support, as well as <strong>Qwen3 Next 80B</strong> and <strong>Qwen3 VL 30B</strong>.</li><li><strong>💰 Price changes:</strong> The usage rate of <strong>Qwen3 235B</strong> is lowered (to $0.07/$0.46), and the free model <strong>TNG R1T Chimera</strong> is added.</li><li><strong>🧹 List cleanup:</strong> Removes older and duplicate models (such as GPT-oss, the Nano series and the older Qwen VL), and updates the pricing information of Gemini 2.5 Flash Lite Preview.</li></ul>",
    "The Noureon team"
  ],
  "16.4.0": [
    "<strong>[P2P Cross-Device Sync]</strong>",
    "Version 16.4.0 adds the “P2P cross-device sync” feature, which transfers data between devices without registering an account and without storage on a cloud server.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>📲 P2P cross-device sync (Peer-to-Peer Sync):</strong> Devices connect directly to each other using WebRTC. The old device generates a QR code, and after the new device scans it with the camera, chat history, settings and Nouras are synced.</li><li><strong>🔒 Privacy protection:</strong> Chat history is transmitted directly through an encrypted channel throughout, without being stored on any third-party server.</li><li><strong>⚡ How to use:</strong> Located in “Settings > Data Management”. No backup export and import steps are needed, and data can be transferred across platforms (mobile / desktop).</li></ul>",
    "The Noureon team"
  ],
  "16.3.0": [
    "<strong>[Full-Screen Interface Adjustments]</strong>",
    "Version 16.3.0 adjusts the interface of the core feature windows to improve the experience on mobile devices.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>📱 Full Screen Mode:</strong> The “Settings page”, “Search history messages” and “Personal Data Dashboard” are now presented in full screen.<ul><li><strong>Larger display area:</strong> The previous window margins and maximum width limit are removed so the content fills the whole screen, showing more information and requiring less scrolling when viewing data charts or adjusting multiple settings.</li><li><strong>Mobile experience:</strong> Mobile operation is improved, replacing the previous floating window with an experience close to a native app.</li></ul></li><li><strong>🎨 Visual design:</strong> To match the full-screen layout, the window rounded borders (Rounded Borders) and the surrounding gaps are removed.</li></ul>",
    "The Noureon team"
  ],
  "16.2.0": [
    "<strong>[Backup Compression and Performance Optimization]</strong>",
    "Version 16.2.0 adds a backup compression mechanism and fixes interface issues.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>📦 Backup compression (ZIP support):</strong> When data is exported, it is packaged automatically in <code>.zip</code> format.<ul><li><strong>Image compression:</strong> Oversized images are automatically resized to 1920px and converted to JPEG, reducing file size (by up to 90%) while keeping visual clarity.</li><li><strong>File structure:</strong> Images and other attachments (such as PDF and TXT) are stored in the <code>images/</code> and <code>files/</code> folders respectively.</li></ul></li><li><strong>🔄 Backward compatibility:</strong> Import recognizes the new <code>.zip</code> backups and also supports older <code>.json</code> files exported previously.</li><li><strong>🛠️ Interface fix:</strong> Fixed the issue where, after importing records directly on the login page, the old login screen could remain and block scrolling or taps.</li></ul>",
    "The Noureon team"
  ],
  "16.1.1": [
    "<strong>[Vision Models Added and Image Generation Category]</strong>",
    "Version 16.1.1 adds a free model with vision capability, and adds the interface for an image generation category in advance.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>🚀 Grok free vision model:</strong> Adds <code>x-ai/grok-4.1-fast:free</code>, with image input support, free to use.</li><li><strong>🍌 Image generation category:</strong> Adds an “Image Generation” category, with two model options, <strong>Nano banana pro🍌</strong> and <strong>Nano banana🍌</strong>, listed in advance.</li><li><strong>🚧 Notes:</strong> Currently the Nano banana series models provide only the <strong>interface options</strong>. The image generation feature is not yet available, so selecting these models cannot produce images yet. It will be provided in a later version.</li></ul>",
    "The Noureon team"
  ],
  "16.1.0": [
    "<strong>[Mobile Experience and Visual Adjustments]</strong>",
    "Version 16.1.0 adjusts the mobile experience and interface details to keep features consistent across platforms.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>📱 Mobile OpenRouter file upload fix:</strong> Fixed the filtering logic of the bottom menu on mobile. When using OpenRouter models (such as Claude and GPT-4), the pull-up menu on the phone now correctly shows the “📁 File” button.</li><li><strong>👀 Shortened file names:</strong> Overly long file names are visually truncated in chat bubbles (first five characters + ...). This is a display adjustment only; the AI model still receives the full file name.</li><li><strong>⚡ Stability:</strong> Optimized the button state detection when switching between Gemini and OpenRouter.</li></ul>",
    "The Noureon team"
  ],
  "16.0.0": [
    "<strong>[OpenRouter File Support and Underlying Upgrade]</strong>",
    "Version 16.0.0 lets models accessed through OpenRouter read files as well, so they can analyze PDF reports and images.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>📁 OpenRouter file support:</strong> PDF documents or images can be uploaded to supported OpenRouter models. The system integrates a file parsing engine so that these models can read and analyze the content of uploaded documents, no longer limited to Gemini models.</li><li><strong>🔧 Dual-platform compatibility:</strong> To handle data format differences between platforms, the underlying file transfer logic has been restructured. The system adjusts the format to the target model: for OpenRouter it sends the complete information including the file name to aid parsing, and for Gemini it organizes the data format automatically, resolving transfer errors between the two platforms.</li><li><strong>🎨 Interface adapts to the model:</strong> The attachment menu shows or hides the corresponding upload buttons automatically according to the capabilities of the selected model (whether it supports vision and whether it supports documents).</li></ul>",
    "This update widens the range of file handling in Noureon, which is no longer limited to a single model provider.<br><br>The Noureon team"
  ],
  "15.10.3": [
    "<strong>[Smart Tables and Model Updates]</strong>",
    "Version 15.10.3 improves table reading on mobile devices and updates the model options.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>📊 Table scrolling:</strong> When the AI produces a wide table, an internal horizontal scrollbar is generated automatically. The chat bubble width stays the same, and the full table can be viewed by swiping left and right inside the bubble, so the layout no longer breaks.</li><li><strong>👆 Prevention of accidental mobile gestures:</strong> While swiping to view inside a table, the gesture that brings out the sidebar is temporarily disabled to avoid opening the sidebar by mistake.</li><li><strong>🤖 Model library changes:</strong> Adds <strong>x-ai/grok-4.1-fast</strong> (with image input support, free for a limited time); removes the Sherlock series test models.</li></ul>",
    "The Noureon team"
  ],
  "15.10.2": [
    "<strong>[Folder Customization Update]</strong>",
    "Version 15.10.2 reworks the folder customization system, replacing emoji with SVG line icons.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>🎨 SVG line icons:</strong> Emoji icons are replaced with minimalist SVG icons (including folder, cloud and tag shapes).</li><li><strong>🖌️ Independent colors:</strong> The “icon line color” and the “text label color” can be set independently (black, white and gray are provided).</li><li><strong>📱 Mobile adjustments:</strong> The mobile action menu icons are redesigned (a slider icon represents “Customize”), and layout problems in the customize window and icons overlapping each other are fixed.</li></ul>",
    "The Noureon team"
  ],
  "15.10.1": [
    "<strong>[Model Library Update: Experimental Models Added and List Streamlined]</strong>",
    "Version 15.10.1 adds two free test models provided by OpenRouter, and removes some models.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>🚀 New experimental models:</strong> Adds two Alpha test models, currently free and both supporting image input:<ul style='margin-left: 20px; margin-top: 5px;'><li><strong>Sherlock Dash Alpha:</strong> Designed for fast, direct question answering and task execution.</li><li><strong>Sherlock Think Alpha:</strong> Designed for complex tasks that require deep thinking, reasoning and planning.</li></ul></li><li><strong>🧹 Model list streamlined:</strong> Removes the <strong>Minimax M2</strong> model.</li></ul>",
    "Noureon will keep evaluating and adding models. Feel free to try the test models and give feedback.<br><br>The Noureon team"
  ],
  "15.10.0": [
    "<strong>[Noureon Now Supports PWA Installation]</strong>",
    "Version 15.10.0 upgrades Noureon to a Progressive Web App (PWA), providing an experience closer to a native app.",
    "<strong>✨ Highlights of this update:</strong>",
    "<ul><li><strong>Install to desktop / home screen:</strong> Noureon can be installed on a computer desktop or a phone home screen and launched with one tap. Click the install icon in the browser address bar.</li><li><strong>Offline access:</strong> When the network is unstable or offline, the basic interface of the app can still load, and past records can be viewed.</li><li><strong>Standalone window:</strong> After launching from the desktop icon, Noureon runs in a standalone window, hiding the browser's address bar and buttons.</li><li><strong>Loading speed:</strong> Through caching, launch and loading are faster after the first visit.</li></ul>",
    "The Noureon team"
  ],
  "15.9.1": [
    "<strong>[Model Library Update and Performance Optimization]</strong>",
    "Version 15.9.1 updates the core model library and adjusts the underlying architecture:",
    "<strong>Model updates:</strong>",
    "<ul><li><strong>OpenAI GPT-5.1 model added:</strong> Introduces OpenAI's GPT-5.1.</li><li><strong>Model library cleanup:</strong> Removes the test model <code>Polaris Alpha</code> and the older <code>GPT-5</code>, which is replaced by GPT-5.1.</li></ul>",
    "<strong>Stability and experience optimization:</strong>",
    "<ul><li><strong>Backend architecture adjustment:</strong> The backend services are adjusted to support the new model and improve overall performance.</li><li><strong>Interface fine-tuning:</strong> Fixed style display problems in some interfaces under specific conditions, improving visual consistency.</li></ul>",
    "The Noureon team"
  ],
  "15.9.0": [
    "<strong>[Core Simplification and Experience Optimization]</strong>",
    "Version 15.9.0 adjusts core features and the interface:",
    "<ul><li><strong>Cross-chat memory (Type 2) removed:</strong> To make the AI's responses more focused and predictable, the “cross-chat memory” feature is removed. The AI's memory will contain only the <strong>“personal habit memory (Type 1)”</strong> explicitly set by the user and the context of the current chat. This change simplifies the settings options and makes the AI's behavior more stable and consistent.</li><li><strong>Memory management layout fix:</strong> Fixed the issue in “Settings > Memory Management” where a single overly long personalized memory entry stretched the settings dialog and broke the layout. The text now wraps automatically.</li></ul>",
    "<strong>[Notes]</strong>",
    "This update focuses on adjusting and simplifying core features, making memory management simpler and more reliable.",
    "The Noureon team"
  ],
  "15.8.1": [
    "<strong>[Output Speed and Interface Adjustments]</strong>",
    "Version 15.8.1 improves the display speed of message output and interface details:",
    "<ul><li><strong>New streaming output engine:</strong> The way messages are displayed has been rewritten. The new “frame-synchronized rendering” technology reflects the model's original output speed and eliminates the delay of “the model has finished outputting but the text is still appearing character by character”. The text rendering catch-up delay is <strong>reduced from an average of 2400 ms to 140 ms</strong>.</li><li><strong>Simplified operation:</strong> Based on user feedback, the “tap twice to send” confirmation mechanism is removed, and every tap now sends the message directly.</li></ul>",
    "<strong>[UI Adjustments and Animation Fixes]</strong>",
    "Interface details are adjusted as follows:",
    "<ul><li><strong>Adaptive input bar animation:</strong> Fixed the choppy animation transition when the input bar switches between the “oval” and “rounded rectangle” shapes.</li><li><strong>Layout fix:</strong> Fixed the attachment feature tags or buttons in the oval input bar extending beyond the edge. An adaptive rounded-corner design is now used so that all elements fit inside the input bar in every state.</li></ul>",
    "The Noureon team"
  ],
  "15.8.0": [
    "<strong>[Follow-Up Questions Feature Redesign]</strong>",
    "Version 15.8.0 redesigns the “Follow-Up Questions” feature:",
    "<ul><li><strong>Floating panel:</strong> Follow-up suggestions are shown in a floating panel at the top of the screen. Click the “idea lightbulb” button at the top right to show the suggestions, with no need to scroll to find them.</li><li><strong>Mobile devices:</strong> On phones, the follow-up options change to a “swipe card” mode that can be browsed by swiping left and right, saving screen space and resolving the gesture conflict with the sidebar.</li></ul>",
    "<strong>[Interface Adjustments and Stability Fixes]</strong>",
    "Interface adjustments are as follows:",
    "<ul><li><strong>Chat view:</strong> Removes the dividers between sidebar sections, reduces the spacing, and makes the desktop top title bar thinner, leaving more room for the chat.</li><li><strong>Operation stability:</strong> Fixed the “scroll to bottom” button jumping up and down under certain operations, and removed the duplicate “New Chat” button.</li></ul>",
    "The Noureon team"
  ],
  "15.7.12": [
    "<strong>[Startup Flow Optimization]</strong>",
    "This update optimizes the loading flow, improving issues at startup and refresh:",
    "<ul><li><strong>[Experience fix]</strong> The signed-in state is now kept after refreshing the page, with no need to sign in again.</li><li><strong>[Visual fix]</strong> Fixed the model name above the chat appearing late at startup or refresh.</li><li><strong>[Visual fix]</strong> Fixed the color of main buttons such as the send button first flashing the default blue while loading before changing to the custom color.</li></ul>",
    "The Noureon team"
  ],
  "15.7.11": [
    "<strong>[Model Library Update] Test Model Added</strong>",
    "This update adds one free test model:",
    "<ul><li><strong>[Added]</strong> Adds the <strong>Polaris Alpha (free)</strong> model from OpenRouter, which can be selected in the “Beta Models” category of the model picker.</li></ul>",
    "The Noureon team"
  ],
  "15.7.10": [
    "<strong>[Model Library Update]</strong>",
    "This update includes the following:",
    "<ul><li><strong>[Added]</strong> Adds the <strong>Kimi K2 Thinking</strong> model from Moonshot AI, suited to deep analysis and complex reasoning.</li><li><strong>[Streamlined]</strong> Removes <code>Deepseek V3.1 Chat</code>, <code>Qwen3 235B</code> and <code>Llama 3.3 70B Instruct</code>.</li></ul>",
    "The Noureon team"
  ],
  "15.7.9": [
    "<strong>[Model Library Expansion]</strong>Adds two models that support image input:",
    "<ul><li><strong>Free vision model added (NVIDIA Nemotron):</strong> Introduces NVIDIA's free multimodal model, which supports image understanding and analysis.</li><li><strong>Advanced vision model added (Qwen 2.5 VL):</strong> Adds Qwen's (Tongyi Qianwen) large vision-language model, suited to scenarios that require in-depth image analysis.</li></ul>",
    "<strong>[Model Library Optimization]</strong>Removes the test-stage model <code>Andromeda Alpha</code>.",
    "The Noureon team"
  ],
  "15.7.8": [
    "<strong>[Main Interface Layout Adjustment]</strong> The “model picker” moves from the top right to the top of the chat, replacing the original chat title. Switching models is more direct, and the chat view is cleaner.",
    "<strong>[Sidebar Top Redesign]</strong> Based on user suggestions, the top of the left sidebar is redesigned:",
    "<ul><li><strong>Search first:</strong> The “Search” feature is presented as a wider search box, making it easier to locate past chats.</li><li><strong>Balanced layout:</strong> “New Chat” and “Batch Select” become separate icon buttons.</li></ul>",
    "<strong>[Detail and Experience Fixes]</strong>Adjusts interface interaction details:",
    "<ul><li><strong>Positioning alignment:</strong> Fixed the positioning of the model picker popup, which now expands from the model name text instead of sitting against the screen edge.</li><li><strong>Scrolling fix:</strong> Fixed the model picker popup possibly being unable to scroll, or showing extra blank space, when switching between long and short lists.</li></ul>",
    "<strong>[Visual Space Adjustment]</strong>Slightly increases the default expanded width of the left and right sidebars, making it easier to browse the chat list and the message timeline.",
    "The Noureon team"
  ],
  "15.7.7": [
    "<strong>[Model Library Expansion] Three Qwen3 Series Models Added</strong> Three new Qwen models are now available through OpenRouter.",
    "<strong>[Vision Capability] Qwen3 VL 8B Instruct added:</strong> This lightweight vision model has image recognition capability and stands out among models of its class, <strong>outperforming Gemini 2.5 Flash Lite and GPT-5 Nano</strong>.",
    "<strong>[Two 2507 Models Added]</strong> <strong>`Qwen3 235B (2507)`</strong> and <strong>`Qwen3 235B Thinking (2507)`</strong>, optimized for deep thinking, with <strong>greatly improved</strong> performance over the previous version.",
    "<strong>[Backend Updates and Fixes]</strong>Integrates the new models above into the model picker, and marks the vision capability of `Qwen3 VL 8B Instruct` in the system. The version number is updated to 15.7.7.",
    "Noureon will continue to introduce new models and improve the user experience.<br><br>The Noureon team"
  ],
  "15.7.6": [
    "<strong>[Multimodal Support] Noureon supports OpenRouter vision models.</strong> When a model with vision support is selected, images can be uploaded so that the AI understands the image content, enabling text-and-image chats.",
    "<strong>[Model Library Expansion] Two Qwen (Tongyi Qianwen) vision models added:</strong> Adds <strong>`qwen3-vl-235b-instruct` (paid)</strong> and <strong>`qwen2.5-vl-72b-instruct:free` (free)</strong>.",
    "<strong>[Interface Adjustment] Dynamic feature buttons:</strong> The “Camera” and “Image” options in the “+” button next to the input box are shown only when a model with vision support is selected.",
    "<strong>[Backend Updates and Fixes]</strong>The application version number is updated to 15.7.6, and descriptions of the new models are added to the language file (`i18n.js`) to provide more complete information."
  ],
  "15.7.5": [
    "<strong>[Interface Update] New “tiered” model picker.</strong> To cope with the growing model library, the model selection flow is restructured. Choices are made in order: “Provider” > “Pricing type” > “AI company” > “Model purpose”.",
    "<strong>[Model Library Expansion] 12 models added.</strong> OpenRouter support is expanded with 12 models from companies such as OpenAI, Anthropic, Deepseek and MoonshotAI, including the <strong>GPT-4.1 series</strong> and <strong>Claude 4.5 Sonnet</strong>.",
    "<strong>[Management Adjustment] The model ordering feature on the settings page is synchronized with the picker.</strong> The model management page in “Settings” uses the same category structure, and models can be reordered within each category group.",
    "<strong>[Fix]</strong>Fixed the model picker popup keeping its height and showing an extra scrollbar when “Back” is clicked, and fixed the error in an earlier version where OpenRouter models could not be clicked to select."
  ],
  "15.7.4": [
    "<strong>[Interface Update] Multi-level model picker added.</strong> The model picker is restructured, and choices are made in order: “Provider” > “Pricing type” > “AI company”.",
    "<strong>[Model Library Expansion] 9 models added.</strong> Nine models are added for OpenRouter, including <strong>OpenAI's GPT-5 series and GPT-4.1 Mini</strong>, <strong>x-ai's Grok models</strong> and <strong>Qwen's coding-specific models</strong>.",
    "<strong>[Synchronized Update] Model management interface.</strong> The model management page in “Settings” is updated to the new category structure, and models can be ordered within their own category groups.",
    "<strong>[Naming Change]</strong>To standardize model names, the \"Noureon-\" prefix is removed from all model names, and generic names are used instead (for example, Gemini 2.5 Pro).",
    "<strong>[Fix]</strong>Fixed the model picker keeping its height after “Back” is clicked, and OpenRouter models being unable to be clicked to select in certain flows."
  ],
  "15.7.3": [
    "<strong>[Backend System Update] Data channel upgrade:</strong> The backend processing systems for “Chat history”, “Feedback” and “Noureon proposals” have been upgraded, so that each type of data is received more stably and reliably, laying the groundwork for future personalization features.",
    "<strong>[Data Logging] “Model used” logging added:</strong> The new data channel adds logging of the “model used”, to understand how different models perform on specific tasks and to continuously improve the Noureon service.",
    "<strong>Help Center, Terms of Use and Privacy Policy updates:</strong> The Help Center, Terms of Use and Privacy Policy have been updated. Please review them."
  ],
  "15.7.2": [
    "<strong>[New Feature] Noureon Improvement Program:</strong> To keep improving the quality of Noureon's replies, an AI learning process has been established. Some anonymized chat data will be used to analyze and optimize AI models.",
    "<strong>Privacy protection:</strong> All data used in this program is protected, is used solely to train Noureon, and is not used for any other purpose or shared with any third party.",
    "<strong>[Important Fix]</strong>Fixed an occasional issue: when a brand-new chat was opened, the first round of question-and-answer data sometimes could not be included in the AI model's learning process. The new version ensures that this process is stable."
  ],
  "15.7.1": [
    "<strong>[New Feature] Message timeline highlighting and sync.</strong> The message timeline automatically highlights the message currently being viewed in the main screen.",
    "<strong>Live positioning:</strong> While scrolling through a long chat, the timeline updates the highlighted item in real time, making it easy to follow the current reading position.",
    "<strong>[Important Fix] Interface overlap fixed:</strong> Fixed a display error on mobile devices where the initial welcome message overlapped the top function bar. The new dynamic layout works on all screen sizes.",
    "<strong>Optimization:</strong> Improved rendering performance during page scrolling, ensuring that the new feature does not affect the smoothness of the app."
  ],
  "15.7.0": [
    "<strong>[New Feature] “Message timeline” sidebar added.</strong> In long chats, a specific message can be located quickly.",
    "<strong>Swipe to open:</strong> On desktop, move the pointer to the right edge of the screen; on mobile, swipe from right to left.",
    "<strong>Quick jump:</strong> Click a message in the timeline to jump immediately to the corresponding position in the main screen, with a highlight effect.",
    "<strong>Optimization:</strong> The transition animation of the sign-in flow is smoother and faster, providing a better startup experience.",
    "<strong>Optimization:</strong> When the chat being viewed is deleted, the system now opens a new chat automatically, making the flow more intuitive.",
    "<strong>Fix:</strong> Resolved screen flicker or rough transitions that could occur after sign-in on certain devices."
  ],
  "15.6.1": [
    "<strong>Improved:</strong> Smoothness of the sidebar's internal collapse and expand animations",
    "<strong>Improved:</strong> Uploading files and images is merged into a single Upload",
    "<strong>Improved:</strong> Expanded UI style of the input box + extended features",
    "<strong>Fixed:</strong> The model menu being too transparent"
  ],
  "15.6.0": [
    "<strong>Improved:</strong> New highlight for the selected chat in history, making it clearer which chat is currently in use",
    "<strong>Added:</strong> More Nouras",
    "<strong>Fixed:</strong> Global search returning records from the trash"
  ],
  "15.5.0": [
    "<strong>Updated:</strong> New sidebar style"
  ],
  "15.4.9": [
    "<strong>Fixed:</strong> The loading screen letting the home page underneath scroll"
  ],
  "15.4.6": [
    "<strong>Improved:</strong> Text output style"
  ],
  "15.4.2": [
    "<strong>Improved:</strong> The issue of forced scrolling to the bottom while the AI is outputting"
  ],
  "15.3.8": [
    "<strong>Fixed:</strong> Duplicate content appearing in search"
  ],
  "15.3.7": [
    "<strong>Fixed:</strong> The input bar causing the screen to zoom"
  ],
  "15.3.6": [
    "<strong>Fixed:</strong> The input bar being obscured"
  ],
  "15.3.5": [
    "<strong>Fixed:</strong> Tables in AI replies extending beyond the screen on mobile"
  ],
  "15.3.4": [
    "<strong>Added:</strong> gemini2.5-Pro, gemini2.5-flash preview, gemini2.5-flash-lite preview",
    "<strong>Removed:</strong> Pico model"
  ],
  "15.3.3": [
    "<strong>BETA:</strong> Internal test version"
  ],
  "15.3.2": [
    "<strong>BETA:</strong> Internal test version"
  ],
  "15.3.1": [
    "<strong>Improved:</strong> Follow-up questions better match user habits",
    "<strong>Replaced:</strong> The Mill model is replaced by the Mistral3.2 model"
  ],
  "15.3.0": [
    "<strong>Added:</strong> Feedback and Nouras proposal features"
  ],
  "15.2.1": [
    "<strong>Fixed:</strong> In the input field, Enter now inserts a line break and Shift+Enter now confirms",
    "<strong>Fixed:</strong> Code in AI replies extending beyond the screen border"
  ],
  "15.2.0": [
    "<strong>Fixed:</strong> The input field being unable to wrap lines and expand"
  ],
  "15.1.1": [
    "<strong>Fixed:</strong> The + features being shown incorrectly for openrouter models"
  ],
  "15.0.1": [
    "<strong>Fixed:</strong> The update dialog popping up by mistake",
    "<strong>Replaced:</strong> The Ultra model is replaced with Grok4-fash"
  ],
  "15.0.0": [
    "<strong>Added:</strong> Cross-chat memory feature",
    "<strong>Improved:</strong> Logic and prompts of the cross-chat memory feature",
    "<strong>Improved:</strong> Logic and prompts of the learning and research features",
    "<strong>Fixed:</strong> Add-on features inside and outside the input bar extending past the right side of the input box",
    "<strong>Fixed:</strong> The import feature on the mobile home page being unable to import",
    "<strong>Fixed:</strong> Add-on features inside and outside the input bar overlapping the input box"
  ],
  "14.9.9": [
    "<strong>Improved:</strong> Logic of version update push notifications"
  ],
  "14.9.8": [
    "<strong>Improved:</strong> Animation of the input bar's extended features",
    "<strong>Improved:</strong> Blurry text in the input bar"
  ],
  "14.9.7": [
    "<strong>Fixed:</strong> Inconsistent top and bottom width of the input bar",
    "<strong>Fixed:</strong> The input bar not collapsing properly after extended features are cancelled",
    "<strong>Improved:</strong> How the input bar's extended features are displayed"
  ],
  "14.9.6": [
    "<strong>Added:</strong> Changed the position where the in-use status of web search and Nouras is shown"
  ],
  "14.9.5": [
    "<strong>Fixed:</strong> Gradient colors not filling buttons"
  ],
  "14.9.4": [
    "<strong>Improved:</strong> Changed the background color transparency of content attached in the input field"
  ],
  "14.9.3": [
    "<strong>Fixed:</strong> Content attached in the input field being covered when it pops up"
  ],
  "14.9.2": [
    "<strong>Improved:</strong> Navigation issue in the Nouras Store"
  ],
  "14.9.1": [
    "<strong>Improved:</strong> Font color of the Nouras Store"
  ],
  "14.9.0": [
    "<strong>Added:</strong> The Nouras Store now integrates with the custom wallpaper, and a gel glass effect is added"
  ],
  "14.8.17": [
    "<strong>Added:</strong> Interaction effects between the chat input bar and the follow-up questions module"
  ],
  "14.8.16": [
    "<strong>Improved:</strong> Removed pinch-to-zoom and double-tap zoom on mobile"
  ],
  "14.8.15": [
    "<strong>Improved:</strong> Improved the existing animations"
  ],
  "14.8.14": [
    "<strong>Improved:</strong> Changed the expand and close logic of follow-up questions"
  ],
  "14.8.13": [
    "<strong>Improved:</strong> The follow-up questions module being too large on desktop",
    "<strong>Removed:</strong> The gray overlay shown when the sidebar expands"
  ],
  "14.8.12": [
    "<strong>Improved:</strong> The gel glass material of the sidebar, the follow-up questions bar and message bubbles"
  ],
  "14.8.11": [
    "<strong>Improved:</strong> The follow-up questions background is changed to a floating-marker style",
    "<strong>Fixed:</strong> The chat window name not adapting and changing"
  ],
  "14.8.10": [
    "<strong>Improved:</strong> Reduced the range of selectable text on the page to improve the experience",
    "<strong>Added:</strong> Added a message hold feature: messages that were sent are retained when switching between chats"
  ],
  "14.8.9": [
    "<strong>Added:</strong> Added a Trash feature to the “Settings” page, so users can view deleted items and permanently delete or restore them."
  ],
  "14.8.8": [
    "<strong>Added:</strong> Added an entry for version update information on the “About” page, so users can view the update logs of all versions.",
    "<strong>Added:</strong> Added an “Enable Update Notifications” switch. When turned on, the latest version's update content pops up on every load.",
    "<strong>Improved:</strong> The update log content is consolidated into a standalone update-logs.js file, making later maintenance and edits easier."
  ],
  "14.8.6": [
    "<strong>Added:</strong> Sidebar items on mobile now support long press to open a shortcut menu.",
    "<strong>Improved:</strong> The message distribution chart on the data dashboard gains year / month / day filtering.",
    "<strong>Fixed:</strong> Fixed page elements in the Nouras Store being hard to see in custom wallpaper mode."
  ],
  "14.8.5": [
    "<strong>Added:</strong> A new personal data dashboard, providing statistical charts such as model usage share and message count distribution.",
    "<strong>Added:</strong> A “Scroll to bottom” button, making it easy to jump quickly to the latest message when there are many messages.",
    "<strong>Improved:</strong> The natural language search feature now calculates a relevance score based on keyword weights, making search results more accurate."
  ]
};

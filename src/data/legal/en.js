// Help Center, Terms of Use and Privacy Policy (English). Same structure as zh-TW.js: sections with the same ids, in the same order, with the same number of blocks.

export default {
  help: {
    title: 'Help Center',
    updated: 'Last updated: October 10, 2026 (applies from Noureon 18.1.0)',
    intro: [
      'Noureon is a web app that puts AI models from many vendors in one workspace: multi-model chat, the Model Council, deep research, files and decks, image generation, extensions (skills and command tools), memory and cloud sync, all in the browser, and it can be installed as an app. This page explains how each feature works, where your data goes, and what to do when something goes wrong.',
      'If you cannot find an answer, write to support@noureon.com (what to include is listed under "Contact us and report a problem" at the end). The Terms of Use and the Privacy Policy are separate documents; read them before you use the cloud features.'
    ],
    sections: [
      {
        id: 'start',
        h: '1. Getting started',
        blocks: [
          'Noureon does not provide model credit and does not resell model usage: you bring an API key from each provider you want to use, and you settle the cost with the provider directly. The shortest way to start:',
          [
            'On the sign-in page, enter a name and a password to create a "local account": its data stays in this browser. You can also bind an Email or a Google account in Settings → Personalization to use a cloud account and cloud sync.',
            'Go to Settings → Model management, find API key management, and enter a key for at least one provider: Google Gemini, OpenRouter (one key opens every model it routes to) or NVIDIA (free models). Set up only the ones you will use.',
            'Back in the chat, pick a model next to the message box, type a message and send it. With no key, the message box reminds you to add one in Settings first.'
          ],
          'Keys stay in your browser by default and are not uploaded. Only when you choose to have replies made by the server are they sent, encrypted and temporarily, to Noureon\'s server (see "Server-side running" and the Privacy Policy). Never send a key, a sync password or recovery data to anyone, support included.'
        ]
      },
      {
        id: 'accounts',
        h: '2. Accounts, signing in and recovery',
        blocks: [
          [
            'Local account: created on the sign-in page with a name and a password; its data lives only in this browser. If you clear browser data or change browser or device, you will not see it, so export a backup from time to time.',
            'Cloud account: bind an Email (password of at least 8 characters, verified from your inbox) or a Google account; you can bind both. You need a cloud account for cloud sync, server-side running, cloud storage of skills and secure credentials.',
            'Registration, sign-in and password recovery show a Cloudflare Turnstile bot check, which keeps automated abuse out.'
          ],
          'Forgot the sign-in password: choose "forgot password" on the sign-in screen; an 8-digit code is sent to your inbox, and you enter it to set a new password. Forgot the sync password: choose recovery by Email; a link is sent, which you must open in the same browser that asked for it. You also get an email when a new sign-in method is added (for example Google) or when the password is changed; if it was not you, change the password at once and tell us.',
          'To delete a cloud account and everything in it, write to support@noureon.com from the Email you registered with; we handle it under the keeping and deletion rules of the Privacy Policy.'
        ]
      },
      {
        id: 'chat',
        h: '3. Chat and organizing',
        blocks: [
          [
            'Choosing a model: the model picker next to the message box lists every available model (currently 38 options from 14 vendors), with search and grouping by vendor; models that support thinking levels show a thinking-level slider.',
            'The message box: paste text, attach files, take a photo, dictate by voice, choose a skill with / and a command tool with @. The box can be expanded into a large window.',
            'Nouras: reusable AI assistants with their own name, description, instructions and avatar. Pick official Nouras in the Nouras store, create your own, propose a new Noura, or share one with someone by peer-to-peer transfer.',
            'Folders, archive and trash: conversations can go into folders (with your own color and icon), be archived, or be moved to the trash; select and move several at once; the trash can restore or delete for good.',
            'Temporary chat: use it and go; no record is kept, and the reply is made on your own device, never on the server.',
            'Searching history: search conversations by title keyword, content keyword or natural language; a timeline lets you jump to a message in a long conversation.',
            'Personal dashboard: total conversations, number of folders, most used model, share of use by model and the time distribution of messages, all counted on your device.',
            'Smart features: in Settings you can switch "automatic conversation naming" and "smart search" on or off.'
          ]
        ]
      },
      {
        id: 'council',
        h: '4. Model Council',
        blocks: [
          'The Model Council lets 2 to 5 models each give their view on the same question, and a synthesizer you choose writes one answer.',
          [
            'Consensus mode: each member answers independently and the synthesizer pulls them together. Discussion mode: members first answer independently, then revise after reading each other, and the synthesizer writes the conclusion.',
            'The answer comes with a "consensus and differences" table: who agreed, who held back, and how it was settled.',
            'When it helps, the council searches once together and every member speaks from the same "shared search packet". Attachments a member cannot read are first turned into a text packet by the "Council document translation" model you set in Settings.',
            'A set of members can be saved as a group and applied later.',
            'By default the council is held on Noureon\'s server and finishes even if you close the page; if you choose to run only on your device it runs in the browser. Each call to a model waits at most 30 minutes; a member that runs out of time counts as failed and the others carry on.'
          ]
        ]
      },
      {
        id: 'research',
        h: '5. Deep research',
        blocks: [
          'Deep research is for questions that need a lot of looking up and a report with its sources. Start it from the menu of the message box.',
          [
            'Plan first: the model drafts a research plan (up to 8 items) and a 60-second countdown starts, in which you can change the items; while you are editing it waits up to 10 minutes. When the countdown ends it starts by itself.',
            'Item by item: it searches, reads pages, cross-checks and writes notes for each item. One research uses at most about 300 calls (searches, pages opened, lookups inside a page) and at most 60 minutes of research time.',
            'Visible progress: the card shows finished items, the percentage, the number of searches and the time used, live, and you can open the sources and the activity.',
            'You can pause, stop, or send a message with extra instructions; one pause lasts at most 24 hours; the whole research at most about 26 hours.',
            'The research runs on Noureon\'s server: close the tab or lock the phone, and the result is in the chat when you come back. After a server restart it carries on from its last checkpoint.',
            'The result is a report with citations and charts: preview it in the chat or open it full screen (table of contents, citation cards, sources and activity panels), and export it as PDF, Word or Markdown; the file is made when you export.'
          ],
          'Research needs a web search service: Gemini models can use their built-in search; for other models enter a Tavily or TinyFish key under "Web search" in Settings. A report may contain wrong or outdated information; check the important facts against the cited sources.'
        ]
      },
      {
        id: 'search',
        h: '6. Web search',
        blocks: [
          [
            'Gemini models can use their built-in search. OpenRouter and NVIDIA models use the Tavily or TinyFish service you choose: in Settings → Model management → Web search choose the source and enter the key; Tavily has basic and advanced depth, and TinyFish is also used to read the addresses you paste.',
            'With "smart search" on, Noureon decides whether a message should search the web first; with an OpenRouter key a small judgement model helps decide (what it receives is in the Privacy Policy), and when it fails or is slow the app uses its own word lists.',
            'When a model has no tool ability, the server makes the search first and gives the pages it found to the model as a "search packet"; you can also change this in Settings so that searches are made only on your own device.',
            'The sources cited in an answer are numbered, with the site\'s name and small icon beside them.'
          ]
        ]
      },
      {
        id: 'attachments',
        h: '7. Attachments, camera and voice',
        blocks: [
          [
            'Attachments: images, documents, audio and video. Whether a model can read one directly depends on the model and provider; a document the model cannot read can be turned into detailed text first by the "single-model document translation model" in Settings, for that one request only.',
            'Camera: take a photo and attach it directly.',
            'Voice input: press the microphone, a waveform shows your voice, press the tick to finish or the cross to throw it away. Your browser turns the voice into text and may pass the audio to your operating system or an online speech service; Noureon does not keep a separate recording. This is explained the first time you use it.'
          ],
          'A request has a size limit (the server accepts requests of up to 25 MB), so send very large attachments in parts.'
        ]
      },
      {
        id: 'files',
        h: '8. Files and decks',
        blocks: [
          'Ask the model in the chat to make files: decks (PPTX), Word (DOCX), Excel (XLSX), PDF, and a dozen more formats such as CSV, calendars and subtitles.',
          [
            'Files appear as cards; each can be previewed and downloaded, and several can be bundled into one ZIP.',
            'There are 20 deck designs and 9 document styles to choose from; the model can also follow a style you describe.',
            'Visual check: after a deck is made, each slide can be drawn as an image for a model of your choice to check the layout again and fix it if needed; switch automatic visual check on or off in Settings. The pictures are not kept.',
            'Files are made in your browser (or in the server\'s sandbox); with a cloud account, the files made are saved in your own cloud storage.'
          ]
        ]
      },
      {
        id: 'images',
        h: '9. Image generation',
        blocks: [
          [
            'Models that support image generation (currently 4 image models, including GPT Image, FLUX and Nano Banana) can draw in the chat, take reference pictures, aspect ratio and quality, and keep editing afterwards.',
            'Images can be previewed, downloaded, reused or opened in the image editing workflow.',
            'By default images are made by the server and finish even if you close the page; if the server restarts while one is being drawn, the request may be sent to the provider a second time, and the provider may charge twice. If you choose to run only on your device, or use a temporary chat or are not signed in, images are made in the browser.'
          ]
        ]
      },
      {
        id: 'advanced',
        h: '10. Advanced mode (Python sandbox)',
        blocks: [
          'Advanced mode lets the model write Python to process data, draw charts and make files. The code runs in an isolated sandbox:',
          [
            'Run by the server: the code and the files you attached go to Noureon\'s sandbox server and run in a container with no network and limited memory and CPU, which is removed when the reply ends; the files made are saved in your own cloud storage and listed in the reply.',
            'Run in the browser: the code runs in an isolated page (run.noureon.com) with Pyodide, which is loaded from jsDelivr.',
            'When the sandbox fails, the connection is retried, and if needed the work is handed back to the browser.'
          ],
          'Cloud storage is limited to 500 MB per user (attachments and made files together; Settings shows the use); files that no conversation refers to any more (for example after a conversation was deleted) are removed automatically after about a day.'
        ]
      },
      {
        id: 'extensions',
        h: '11. Extensions: skills and command tools',
        blocks: [
          'The Extensions page (left sidebar, or the left list on desktop) has two parts.',
          [
            'Skills: a written-down way of working (SKILL.md: name, description, text). There are 11 official skills (including the official skill for making skills). Type / in the message box and choose a skill, and that reply follows it; the model can also decide by itself: it sees only the name and one line of each skill you allow, and loads the full text when it needs it (at most 5 in one reply; each skill has an "allow the model to use it by itself" switch).',
            'Your own skills: paste text, or upload a zip (SKILL.md plus notes, scripts and assets; within 5 MB and 60 files; checked in the browser and again on the server, which refuse programs and installers, links and unsafe paths). Up to 50 skills. You can also ask the model to help make a skill; the draft is shown as a card and saved only after you confirm.',
            'Skills with scripts: a script runs only when the model explicitly runs it, in an isolated sandbox container on the server (the skill folder is read only and not executable, and there is no network by default); temporary chats do not offer skills with scripts.',
            'Command tools: 8 official command-line tools (for example Pandoc, FFmpeg, yt-dlp, csvkit), run in an isolated container on the server. Turn them on in the Extensions page, then choose one with @, or allow the model to use them by itself. A tool\'s program is downloaded by the sandbox host from its official release (GitHub) and checked against a fixed hash.',
            'Website connections and consent: whenever a tool needs a website, the connection goes through a filtering proxy on the server, which opens only ports 80 and 443 and never reaches the server itself or its internal network. Each site is handled by your rules in Settings → Permissions: allow, ask or refuse; a site with no rule is asked about in the conversation, and no answer in 10 minutes counts as a refusal.',
            'Secure credentials: when a tool needs a login (for example the login cookie of an account), a window asks you for it and it is kept encrypted on the server; you can look at, replace or delete it any time in Settings → Permissions. The model never sees the value, and a credential in the output of a command is hidden.'
          ],
          'When a tool fetches content from websites, follow those websites\' terms and copyright rules; see the Terms of Use for details.'
        ]
      },
      {
        id: 'server',
        h: '12. Server-side running and closing the tab',
        blocks: [
          'When you are signed in to a cloud account, replies are made on Noureon\'s server by default, so closing the tab or locking the phone does not stop them and the result is in the chat when you come back. This covers ordinary replies, the Model Council, deep research, image generation, web search, Advanced mode and the visual check.',
          [
            'To make replies only on your own device: Settings → Privacy, choose "This device".',
            'Temporary chats, users who are not signed in, and replies that need the browser (voice input, the camera) are always made on your device.',
            'One reply may run for 2 hours at most; at most 5 run at once; at most 10 new ones may start in a minute.',
            'For the reply, your API key is kept encrypted for a short time and deleted when the reply ends (at most 2 hours 15 minutes for an ordinary reply, 30 minutes for an image, 27 hours for deep research); it is never kept long term or written to logs.',
            'With several tabs open, the reply is shown live in all of them; a lost connection reconnects by itself.'
          ]
        ]
      },
      {
        id: 'memory',
        h: '13. Memory and cross-conversation recall',
        blocks: [
          [
            'Confirmed personal preferences: in Settings → Memory management you can add, replace or delete them yourself, and add "do not bring up" rules, for example not to mention your name or health information.',
            'Automatic memory: when on, Noureon uses your Gemini key to turn conversations into summaries and possible preferences for you to confirm; turning it off only stops new memories, confirmed ones stay and are removed one by one.',
            'Cross-conversation recall: needs your explicit consent. When on, this device sends your current question to Gemini Embedding 2 and uses a local index to find up to three relevant summaries of earlier conversations; the sources are not shown in the chat. Consent follows your account to all devices, but the index and the vectors are not synced: each device builds its own; you can check or optimize the local index in Settings.',
            'Attached pictures, video, audio and documents may be summarized through Gemini\'s file feature when memory is built.'
          ]
        ]
      },
      {
        id: 'data',
        h: '14. Data, sync, export and deletion',
        blocks: [
          [
            'Local first: conversations, folders, the archive, settings, Nouras, API keys, appearance preferences and the memory index are kept in your browser by default. Clearing browser data can remove them.',
            'Cloud sync: turn it on in Settings → Personalization after binding an Email or Google account. It includes conversations and messages, folders, Nouras, memories and summary records, sync metadata, deletion markers, and the files you upload or make. To sync API keys you must first create a sync password (at least 10 characters); keys and other sensitive data are encrypted with it before they are uploaded.',
            'Keep the sync password yourself: after it is cleared, existing encrypted data cannot be decrypted. The sync password itself is kept encrypted with a server-side key, for cross-device and Email recovery.',
            'Export and import (Settings → Data management): export .json or .zip (conversation history with the archive and folders, Nouras, app settings, confirmed personal preferences; API keys need a sync password to be exported safely). Importing replaces your current data, so check first. Review an exported file before sharing it, especially if you chose to include sensitive data.',
            'Peer-to-peer transfer: in Settings, "Cross-device sync (P2P)", choose "I want to send" or "I want to receive", connect with an 8-character code or by scanning a QR code, and the items you chose go straight between the two devices; Nouras can be shared this way too.',
            'Storage: cloud attachments and made files together are limited to 500 MB per user; generated images are not stopped by that limit.',
            'Danger zone: "Clear all records and data" permanently deletes everything in this browser and cannot be undone. When you are signed in and syncing, deletion and restoration are also synced to the cloud.'
          ]
        ]
      },
      {
        id: 'appearance',
        h: '15. Appearance, language and installing',
        blocks: [
          [
            'Appearance: light, dark or follow the system, with an accent color; the home page before sign-in also has a light/dark button at the top right.',
            'Language: the interface is available in Traditional Chinese, English, French, Russian and Spanish, switched in Settings → Personalization; "AI default reply language" sets the language the AI answers in unless you ask otherwise in a conversation.',
            'Accessibility: Settings has accessibility options.',
            'Install as an app: Noureon is a progressive web app (PWA); use "Add to Home Screen" or "Install" in your browser. Offline, only the cached app itself works; anything that needs a model or the cloud still needs a network.',
            'Update notices: when there is a new version an update notice can appear (switch it off in Settings); the full update history is at noureon.com/updates.'
          ]
        ]
      },
      {
        id: 'troubleshooting',
        h: '16. Troubleshooting',
        blocks: [
          [
            'No reply after sending: check that the key of that model\'s provider is right and has credit, then try another model. Gemini, OpenRouter and NVIDIA each have their own error messages and quota rules.',
            'A reply is slow or stops: long answers, deep research and the council take time; when the server runs them you can leave and come back. The server allows 5 replies at once and 10 new ones a minute per person.',
            'Sync does not update: check that you are signed in, the sync password is unlocked (enter it in the cloud sync area of Settings when needed) and the network works, then press "Sync now". Offline changes sync when the connection returns.',
            'Forgot the sync password: recover by Email (see "Accounts, signing in and recovery"). If the sync password was cleared, old encrypted data cannot be decrypted.',
            'Data is missing: check whether you changed browser or device or cleared browser data; a local account\'s data exists only in the browser where it was made. Look in the trash for deleted conversations, or import a backup you exported earlier.',
            'Advanced mode or a command tool fails: the sandbox sometimes fails from connection or resource limits, and Noureon retries by itself; if it still fails, ask in a different way or reduce the size of the files.',
            'A file or deck looks wrong: check it in the preview; ask the model to adjust the layout, or turn on the visual check so that a model checks it.',
            'The page behaves oddly: reload it, and if needed clear this site\'s cache and load it again; if it persists, report it.'
          ]
        ]
      },
      {
        id: 'contact',
        h: '17. Contact us and report a problem',
        blocks: [
          [
            'Email: support@noureon.com, for account, sign-in, sync, mail, data and usage questions.',
            'Please include: your browser and device (for example iPhone Safari 18), the model or provider you used, when it happened, what you did, and a screenshot or the error from the Console.',
            'Never send API keys, sync passwords, recovery data or any login credential.',
            'Feedback: the feedback form in Settings is sent only when the operator has configured a feedback endpoint; Noura proposals go to the developers the same way.',
            'Official X account: @NoureonAi (https://x.com/NoureonAi).',
            'Source code and issues: https://github.com/NHZallen/Noureon; you are welcome to report problems or make suggestions on GitHub.'
          ]
        ]
      },
      {
        id: 'opensource',
        h: '18. Open source and third-party software',
        blocks: [
          'The source code of Noureon is public on GitHub under the MIT license; you can read it line by line, or host it yourself. If you host it, never commit real provider keys, SMTP credentials, Supabase service keys or other secrets to the repository; use environment variables.',
          'Noureon uses a lot of third-party software (for example Python and its libraries in the sandbox, the command tools, and the libraries of the app itself), each under its own license; the full list is linked as "Third-party software and licenses" on the Extensions page.'
        ]
      }
    ]
  },

  terms: {
    title: 'Terms of Use',
    updated: 'Last updated: October 10, 2026 (applies from Noureon 18.1.0)',
    intro: [
      'Welcome to Noureon. These terms set out the rights and duties of both sides when you use the Noureon service at noureon.com ("the service"). By using the service you confirm that you have read and agree to these terms and to the Privacy Policy; if you do not agree, do not use the service.',
      'The terms are offered by the team that operates Noureon ("we"). The source code of Noureon is published separately under the MIT license; these terms govern the service we operate and do not change the rights that open-source license gives you.'
    ],
    sections: [
      {
        id: 'service',
        h: '1. What the service is',
        blocks: [
          'Noureon is an AI workspace: with your own API keys you use AI models from several providers in one interface, and it offers the Model Council, deep research, web search, attachment analysis, file and deck generation, image generation, Advanced mode (a Python sandbox), extensions (skills and command tools), Nouras, folders and search, memory, import and export, peer-to-peer transfer, PWA installation, and optional cloud sync and server-side running.',
          'An important fact: Noureon does not provide or resell access to or usage of any model. Models are provided by the third-party AI and search providers you choose, and you settle the cost with them directly.'
        ]
      },
      {
        id: 'accounts',
        h: '2. Accounts and responsibility for data',
        blocks: [
          [
            'You may use only a local account (its data stays in this browser) or bind an Email or Google account to use a cloud account. Give correct information and take responsibility for what happens under your account.',
            'Keep your sign-in password, sync password, recovery data and API keys safe yourself. After a sync password is cleared or lost, existing encrypted data may not be decryptable and we cannot restore it for you.',
            'Local first means your device controls the data, and it also means backups are your responsibility: clearing browser data or changing device or browser can make local data disappear, so export a backup from time to time.',
            'You may not transfer your account to someone else or create accounts in bulk by automation.',
            'An account is for one person; if you use it for an organization, make sure you are entitled to do so.'
          ]
        ]
      },
      {
        id: 'content',
        h: '3. Your content and rights',
        blocks: [
          [
            'The prompts you type, the files you upload, the Nouras, skills and memories you create and the outputs you obtain belong to you or their original rights holders; we do not claim to own them.',
            'You allow us to process this content to the extent needed to provide the features you use, for example saving it in your cloud workspace, sending it to the provider you chose, running it in the sandbox, making files or summaries. We do not use your content for other purposes and we do not sell personal data (see the Privacy Policy).',
            'You must make sure you have the right to use what you upload or ask us to process (including other people\'s works, personal data and confidential information) and you bear the responsibility that follows.',
            'AI output may be similar to what others receive; we do not promise that output is original or that it does not infringe third-party rights.'
          ]
        ]
      },
      {
        id: 'ai',
        h: '4. Limits of AI replies',
        blocks: [
          [
            'AI replies, deep research reports, council conclusions, generated files, images and code may be wrong, incomplete, outdated, biased or unsuitable for a purpose. Cited sources may also be misread or no longer available.',
            'Do not treat them as the only basis for medical, legal, financial, safety, mental-health or other high-risk decisions; confirm important matters with a qualified professional. The mental-health related Nouras in Noureon are not human professionals and do not diagnose; in an emergency contact your local emergency services.',
            'Agreement among several models does not make something correct, and automatic checks such as the visual check cannot promise there are no mistakes. Check every result yourself, especially before you publish, submit or run it.',
            'You decide whether to use AI output and you are responsible for what follows from using it.'
          ]
        ]
      },
      {
        id: 'providers',
        h: '5. Providers, keys and costs',
        blocks: [
          [
            'Using the service requires you to obtain API keys from third-party providers (for example Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish) and to follow each provider\'s terms of service, usage policies and privacy policy. What you send is handled under those providers\' rules, which we do not control; we are not responsible for their service quality, availability, content policies or price changes.',
            'All model and search costs are charged to you by the providers. Watch your credit and billing yourself, and we suggest you set a usage limit with the provider.',
            'When the server runs a reply, your key is kept encrypted for a short time and used to call the provider on your behalf to complete that reply (see the Privacy Policy for how long). If the server restarts during an image or the synthesis of a council, a request may be sent again and the provider may charge twice; we do not refund such costs.',
            'The service may also use other third-party infrastructure, for example Supabase (accounts and database storage), Cloudflare (bot checks), GitHub (programs and icons of command tools) and Vercel (web hosting).'
          ]
        ]
      },
      {
        id: 'server',
        h: '6. Server-side running and the sandbox',
        blocks: [
          [
            'Replies run by the server by default so that they continue after the page is closed. You can switch to making replies only on your own device any time in Settings → Privacy.',
            'The server and the sandbox have limits, to keep the service stable: a reply runs for 2 hours at most, 5 at a time per person, 10 new ones a minute, requests of up to 25 MB, deep research up to about 26 hours, one model call up to 30 minutes, and cloud storage up to 500 MB per person. The limits may change with the state of the service.',
            'We do not promise that every run will succeed or finish in a given time. The server may restart and a provider may fail; the system tries to retry or continue from a checkpoint, but it can still fail.',
            'Code in the sandbox runs in an isolated container with no network, which is removed when the reply ends. You may not try to break out of the sandbox, reach other users or the internal network, or use it to consume excessive computing resources.'
          ]
        ]
      },
      {
        id: 'extensions',
        h: '7. Skills, command tools and code',
        blocks: [
          [
            'The skills you add yourself (including the notes and scripts inside a zip) are your responsibility. Make sure you have the right to use their content and that they contain no malicious code. A script runs only when the model explicitly runs it, in the sandbox.',
            'Command tools use the connections and credentials you provide. You are responsible for following the terms of use, robots rules and copyright rules of the websites they connect to, and for downloading, reading or publishing only what you are entitled to use.',
            'Website connections are handled by the rules you set (allow, ask, refuse). You are responsible for the connections you allow or confirm.',
            'Do not use command tools or skills for anything unlawful, to get around paywalls or access controls, to invade others\' privacy, to send spam, to attack other systems, or to scrape in bulk against a website\'s rules.',
            'Command tools and the sandbox software are third-party software, each with its own license and disclaimer; we obtain them from the official release and check the hash, but we do not promise they are free of defects or insecurity.',
            'Use only your own accounts for the secure credentials you save (for example login cookies); you can look at, replace or delete them any time.'
          ]
        ]
      },
      {
        id: 'acceptable',
        h: '8. Prohibited conduct',
        blocks: [
          'When using the service you may not:',
          [
            'break the law, or ask for output that helps break the law.',
            'infringe anyone\'s intellectual property, privacy, reputation or other rights, or process other people\'s personal data without consent.',
            'make or spread malware, fraud, phishing, harassment, hate, threats of violence, or sexual content involving children.',
            'use the service to harm others, or to create false identities or information that misleads people.',
            'attack, probe or disturb the service, its servers, its account system or the sandbox, or try to get around rate limits, verification and security measures.',
            'access the service by automation beyond normal use, or consume resources in a way that affects other users.',
            'break the terms and usage policies of the third-party providers you use.'
          ],
          'If you do, we may limit or stop your access, remove the related content and, where necessary, cooperate with investigations as the law requires.'
        ]
      },
      {
        id: 'ip',
        h: '9. Intellectual property and open source',
        blocks: [
          [
            'The source code of Noureon is published under the MIT license; see LICENSE on GitHub. You may use, change and distribute the code under that license.',
            'The third-party software that Noureon uses is under its own licenses; the list is on the Extensions page.',
            'Do not use the name and logo of Noureon to suggest that your product or service is provided, endorsed or approved by us.'
          ]
        ]
      },
      {
        id: 'privacy',
        h: '10. Privacy',
        blocks: [
          'How we handle your data is written in the Privacy Policy, which is part of these terms. In short: local first by default; what you send goes to the providers you choose; when you choose cloud sync or server-side running, the data needed is stored on or passes through our servers; we do not sell personal data and have no built-in advertising or cross-site tracking.'
        ]
      },
      {
        id: 'changes',
        h: '11. Changes, interruption and ending of the service',
        blocks: [
          [
            'The service is under constant development: features, limits, and the providers and models supported may be added, changed or removed, and the service may be interrupted for a time or for good. Important changes are written in the update history (noureon.com/updates).',
            'You may stop using it at any time and export or delete your data; to delete a cloud account, write to us as the Help Center describes.',
            'If you break these terms, endanger the service or other users, or the law requires it, we may suspend or end your access.'
          ]
        ]
      },
      {
        id: 'disclaimer',
        h: '12. Disclaimer',
        blocks: [
          'The service is provided "as is" and "as available". To the fullest extent the law allows, we make no warranty, express or implied, that the service is fit for any purpose, uninterrupted, error-free, secure, accurate, complete or non-infringing. This is especially so for AI output and the services of third-party providers.'
        ]
      },
      {
        id: 'liability',
        h: '13. Limitation of liability',
        blocks: [
          [
            'To the fullest extent the law allows, we are not liable for any indirect, incidental, special, consequential or punitive damages arising from use of or inability to use the service, including loss of data, loss of profit, provider fees and loss from relying on AI output.',
            'To the fullest extent the law allows, our total liability to you is limited to the amount you paid us for the service; as the service does not currently charge you, that amount is zero.',
            'Liability that the law does not allow to be excluded or limited (for example liability for intent or gross negligence, or rights under local consumer protection law) is not affected by this section.'
          ]
        ]
      },
      {
        id: 'update',
        h: '14. Changes to these terms',
        blocks: [
          'We may change these terms. The new version is published on this page with the date at the top updated, and important changes are also written in the update history. If you keep using the service after a change takes effect, you accept the changed terms; if you do not agree, stop using the service.'
        ]
      },
      {
        id: 'general',
        h: '15. Other',
        blocks: [
          [
            'If any part of these terms is found invalid or unenforceable, the rest stays in force.',
            'The Traditional Chinese version of these terms prevails; versions in other languages are for ease of reading and, if they differ, the Traditional Chinese version applies.',
            'These terms do not replace any agreement between you and a third-party provider.',
            'Where local law requires otherwise, that law applies.'
          ]
        ]
      },
      {
        id: 'contact',
        h: '16. Contact us',
        blocks: [
          'For questions about these terms, write to support@noureon.com (without API keys or passwords). The official X account is @NoureonAi.'
        ]
      }
    ]
  },

  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: October 10, 2026 (applies from Noureon 18.1.0)',
    intro: [
      'This policy explains what data Noureon handles, where it is kept, who receives it, for how long, and what choices you have. It covers the default data flows and the extra ones that appear when you turn on cloud sync, server-side running, memory and other features.',
      'In one sentence: Noureon is "local first" by default, so conversations, settings and keys are kept in your browser; what you send goes to the AI and search providers you choose; only when you sign in to a cloud account, turn on sync or have the server run replies does the data needed get stored on or pass through Noureon\'s servers. We do not sell personal data and have no built-in advertising or cross-site tracking.',
      '"Local first" does not mean every AI request runs offline: to get an AI reply, your content has to be sent to the model provider.'
    ],
    sections: [
      {
        id: 'summary',
        h: '1. Data at a glance',
        blocks: [
          [
            'In your browser: conversations, folders and the archive, settings, Nouras, memories and the local index, API keys, appearance preferences, local account data.',
            'Sent to AI and search providers: your prompts, conversation context, attachments, system instructions and the model options you choose (section 6).',
            'In Noureon\'s cloud (when you sign in and sync): workspace data (conversations, messages, folders, Nouras, memory summaries), uploaded and generated files, an encrypted copy of the sync password, skills and skill packs, secure credentials (section 4 and section 8).',
            'Passing through Noureon\'s server for a while (when you choose server-side running): the history, system instructions and your key that one reply needs, deleted when the reply ends (section 7).',
            'Third-party infrastructure: Supabase, Cloudflare Turnstile, GitHub, Vercel, PeerJS and others (section 17).'
          ]
        ]
      },
      {
        id: 'controller',
        h: '2. Who is responsible, and how to contact us',
        blocks: [
          'Noureon is operated by its development team. For privacy, account, sync, mail or data questions write to support@noureon.com, without API keys, sync passwords or recovery data. The official X account is @NoureonAi. Whoever hosts Noureon themselves is the data controller of that deployment and has to describe their own practices.'
        ]
      },
      {
        id: 'local',
        h: '3. Data kept in your browser',
        blocks: [
          [
            'By default Noureon keeps conversations and messages, folders and the archive, app settings, Nouras, confirmed personal preferences and memories, the local index and vectors for cross-conversation recall, provider API keys, appearance preferences, generated-image information and the local profile in the browser\'s storage (IndexedDB and localStorage).',
            'localStorage also holds a copy of your light/dark choice, so the page has the right theme when it opens.',
            'The public pages (Help Center, Terms of Use, Privacy Policy, update history) also remember in localStorage the language you chose there; it is sent to no one.',
            'As a PWA, the service worker caches only the files of the app itself (programs, styles, icons), not your conversations or personal data.',
            'The connection details of a cloud sign-in (the session) are kept in the browser by Supabase\'s Auth library.',
            'Clearing browser data can remove the local workspace; exported files are kept by you.'
          ],
          'Noureon uses no advertising or tracking cookies and has no third-party analytics scripts.'
        ]
      },
      {
        id: 'cloud',
        h: '4. Accounts and cloud sync',
        blocks: [
          [
            'Sign-in methods: Email with a password, or a Google account. Verification and mail are handled by Supabase Auth; for Email sign-in we process your Email and a hash of the password, and for Google sign-in we receive the basic details Google provides (for example Email and display name). We never see your Google password.',
            'Registration, sign-in, password recovery and the feedback form use Cloudflare Turnstile as a bot check, so Cloudflare sees browser and connection details.',
            'The mail we send is used only for account access and recovery: confirmation of registration, password reset (a code), the link for a forgotten sync password, and notices that a sign-in method was added or the password changed.',
            'With cloud sync on, Supabase keeps what is needed for cross-device sync: folders, conversations, messages (with their metadata), Nouras, memories and memory summary records, sync metadata, deletion markers (tombstones), and the files you upload or make (in Supabase Storage).',
            'The sync password: keys and other sensitive content are first encrypted in the browser with your sync password before they go into the cloud vault; without a sync password, provider API keys are not uploaded. The sync password itself is kept encrypted with a server-side key, for cross-device and Email recovery, and the database holds no plain text. Note that this means recovery of the sync password is carried out with the help of the service; it is not true in every case that only you can unlock it.',
            'You can choose not to sign in to a cloud account; then none of this data leaves your device (apart from the requests you send to providers).'
          ]
        ]
      },
      {
        id: 'providers',
        h: '5. The third-party providers you set up',
        blocks: [
          [
            'Providers you can use include Google Gemini, OpenRouter (which passes requests on to the model vendors), NVIDIA API Catalog, and the search services Tavily and TinyFish. Set up only the ones you use.',
            'These providers handle your data under their own terms and privacy policies, including whether they log it, keep it or use it for training; we do not control this, and we suggest you check each one\'s settings.',
            'By default your keys are kept in the browser and the browser calls the provider directly, so the requests do not pass through Noureon\'s server; the exceptions are when you choose server-side running, and the proxy endpoints of this site (see below).'
          ]
        ]
      },
      {
        id: 'sent',
        h: '6. What is sent to providers',
        blocks: [
          [
            'When you send a message, the needed prompt content, conversation context, attachments you choose and inputs of generated media, system instructions (including your memories, the Noura in use, and the full text of skills you chose with / or the model loaded) and model options go to the model provider you chose; when a search is needed, the search terms and the addresses you pasted go to the search provider.',
            'The Model Council, deep research and the visual check send requests of the same kind to each of the models you chose.',
            'Attachments some models cannot read are first turned into a text packet by the translation model you set, and then handed on to the models that need them.',
            'You can review the message and attachments before sending; once sent, they are subject to the provider\'s rules.'
          ]
        ]
      },
      {
        id: 'server',
        h: '7. Replies made by Noureon\'s server',
        blocks: [
          'For users signed in to a cloud account, replies are made on Noureon\'s server by default, so that a reply continues when the page is closed. In Settings → Privacy you can switch to making replies only on your own device.',
          [
            'What is sent: the browser sends the server the conversation history, system instructions, selected model and provider key (and the search key when search is used) that this one reply needs.',
            'Keeping keys: keys are kept encrypted, only for that reply, and deleted when it ends; at most 2 hours 15 minutes for an ordinary reply, 30 minutes for image generation, and 27 hours for deep research (which may be paused for up to a day). They are never kept long term, never written to logs or error messages, and error messages sent back by providers are scrubbed of keys first.',
            'The reply: the server writes the reply into the same cloud workspace the app already syncs.',
            'Replies that must be finished in the browser (voice input, the camera), users who are not signed in and temporary chats are always made on your device and are not sent to the server.',
            'Run records: the server keeps a record of each run (without keys), so that a run can be taken up again after a server restart and, once finished, is kept as the request record of that reply until it is removed; the prompt and the reference pictures of an image are deleted from the record when the image ends. Server logs have one line per event and contain no request content, keys or tokens; fields whose names look like secrets are hidden.',
            'Limits: at most 5 replies at once per person, 10 new ones a minute, requests of up to 25 MB.'
          ]
        ]
      },
      {
        id: 'features',
        h: '8. Data flows of each feature',
        blocks: [
          'Feature by feature, this is which data passes where.',
          [
            'Advanced mode (Python): when run by the server, the code the model writes and the files you attached go to Noureon\'s sandbox server and run in an isolated container with no network and limited resources, which is removed when the reply ends; the files made are saved in your own cloud storage and listed in the reply, up to 500 MB per user, and files no conversation refers to any more are removed automatically after about a day. When run in the browser, the code runs in an isolated page (run.noureon.com) with Pyodide, loaded from jsDelivr.',
            'Deep research: the plan, notes, pages searched and read, report and progress are saved in your cloud workspace; pages are read by the server on your behalf; searches use the search provider key you set. The PDF, Word or Markdown file is made at the moment you export.',
            'Web search: when a model cannot search by itself, the server writes the search query from the conversation with the model you chose (with your own key), sends it to your search provider and puts the pages found in front of the request as a "search packet"; the query, the pages and the answer are written into your cloud workspace. If the server restarts, the search may be made again.',
            'Image generation: when made by the server, the prompt, the options (aspect ratio, size, advanced settings), the reference pictures you attached and the OpenRouter key go to the server over HTTPS; the server asks OpenRouter\'s image endpoint for the image with your key and keeps the picture in your own cloud space. The prompt and reference pictures are kept with the run\'s record (without the key) until the image ends. No preview pictures are made. If the server restarts midway, the request may be sent again and your OpenRouter account may be charged twice.',
            'Model Council: when held by the server, the browser sends the history, your message and attachments, the members and synthesizing model, what each kind of call is to be told (including system instructions, memory and Nouras) and the provider keys used (and the search keys when it searches). The server asks each model with your key; what finished members answered is kept with the run so that a restart does not ask again, and deleted when the council ends; the synthesis is made again after a restart, so the synthesizing model\'s provider may charge twice. Each model call takes at most 30 minutes.',
            'Visual check: when automatic check is on and a reply writes a deck, the server draws the slides as pictures, shows them to the model you chose with your own key, and writes any corrected reply into the conversation; the pictures are not kept.',
            'The judgement model: with an OpenRouter key, the text of each message (with short excerpts of the previous two messages, whether a file is attached, and the names and descriptions of the command tools you let the model use by itself) is sent from the browser to OpenRouter\'s Decisions API, where a small judgement model decides whether the message needs a web search, a downloadable file, a chart or a command tool. Your own OpenRouter key is used and Noureon keeps none of it; image conversations are not sent. With no key, a failed call or a call over one second, the app decides with its own word lists; after two failures in a row it is not tried again for ten minutes. There is no separate switch for it, and choosing "only on my device" does not turn it off, because the call is made by the browser.',
            'Skills: the skills you paste are kept in your own cloud account (only you can read and change them; the server reads them with its service role); a zip skill pack is kept in a private bucket in a folder only you can read and change, and its file list in the skill\'s row. When you choose a skill with /, or the model decides to load one, the full text goes with the message to the provider you chose (and through the server when the server makes the reply, which reads only the one used). When the model reads a text file of a skill (at most 20,000 characters, at most 10 files in a reply), the content goes to the provider the same way. A skill that was neither asked for nor loaded is not sent. When you delete a skill it is deleted with its zip; a zip that no skill points to any more is removed by the server\'s daily clean-up.',
            'Command tools: the list of tools you added is kept in your settings (and synced with them). A tool runs only in an isolated container on the sandbox server; the command the model writes and the files of the conversation are handled as above; the tool\'s program is downloaded by the sandbox host from its official release (GitHub) and checked against a hash. The Extensions page loads each project\'s icon from GitHub, so GitHub sees that request.',
            'Website connections: when a tool needs the internet (to download a video, to read a social network, to install its own Python package) it can reach it only through the sandbox host\'s filtering proxy. The proxy decides by your rules in Settings → Permissions (allow, ask or refuse; pypi.org, files.pythonhosted.org, registry.npmjs.org, github.com and two GitHub file hosts are allowed at first); a site with no rule is asked about in the conversation, and no answer in 10 minutes counts as a refusal. The proxy opens only ports 80 and 443, looks up the site itself and refuses every address inside the server (the machine itself, private and pod networks, link-local and metadata addresses and its own public address), whatever the rules say. It sees the site name and the port, never the page or what is sent, and logs the site name and port with the decision (no page address, no content). Your rules are kept in your settings (and synced with them).',
            'Secure credentials: a credential you add for a tool (for example the login cookie of an account) is kept encrypted with AES-256-GCM on the server, under a master key that lives only in the server\'s environment and bound to you and the credential\'s name, in a table only the server can read. It is put in the environment of the tool (or in the login file the tool would save itself, for one command only) only while your own tool runs; what the command prints is scrubbed of the credential before the model or the page sees it, and the model never receives the value. You can look at, replace or delete it in Settings → Permissions; it is deleted when you delete it or the account.',
            'Icons and names of cited sources: beside a source in an answer the site\'s small icon and name are shown. Noureon\'s server fetches these (reading the site\'s own page markup, public sites only, with a size and time limit and every redirect checked), so the sites you looked at stay between you and Noureon\'s server and no third-party icon service is asked.',
            'Feedback and Noura proposals: these forms are optional and send only the fields you fill in, only through this site\'s same-origin proxy (/api/google-form-submit, which requires a Turnstile check); if the operator has not set a receiving endpoint the proxy forwards nothing. What is sent goes to the Google Form the operator set up.'
          ]
        ]
      },
      {
        id: 'memory',
        h: '9. Memory and cross-conversation recall',
        blocks: [
          [
            'Automatic memory: when on, the browser uses your Gemini key to turn the last turns of a conversation, topics and the attachments you provided into summaries and possible personal preferences (with a light Gemini model); the summaries and confirmed memories are kept in your workspace, and when you sign in and sync, memories and summary records are synced to the cloud. You can look at, replace or delete each at any time, and turning automatic memory off only stops new memories.',
            'Cross-conversation recall: needs your explicit consent. Once given, each question is sent to Gemini Embedding 2 for a vector and a local index on this device finds up to three relevant summaries, which become part of the request sent to the model provider you chose. The state of consent follows the account to all devices, but vectors and the index are not synced: each device builds its own. Without consent, earlier conversations are not searched or sent and Embedding is not called.',
            'Attachment memory: pictures, video, audio and documents may be summarized into key points through Gemini\'s file feature when memory is built.',
            'You can switch these features on or off in Settings, check or optimize the index, and export the confirmed personal preferences.'
          ]
        ]
      },
      {
        id: 'voice',
        h: '10. Voice input, camera and microphone',
        blocks: [
          [
            'Voice input is turned into text by your browser, which may pass the audio to your operating system or an online speech service; Noureon keeps no separate recording, and the waveform is drawn live on your device. An explanation is shown, and your agreement asked for, before the first use.',
            'The camera and the microphone are used only after you press the matching button and agree to the browser\'s permission prompt; a photo you take is the attachment you add and is handled under the rules for attachments.'
          ]
        ]
      },
      {
        id: 'p2p',
        h: '11. Peer-to-peer transfer',
        blocks: [
          'Peer-to-peer transfer between devices uses PeerJS: its public pairing server (0.peerjs.com) only lets two devices find each other, with an 8-character code, or a QR code. Once connected, the items you chose (for example conversations, Nouras, settings) go straight between the two devices and neither pass through nor are stored on Noureon\'s servers. Pair only with devices you trust, and check which items you are about to send.'
        ]
      },
      {
        id: 'logs',
        h: '12. Logs, security and rate limits',
        blocks: [
          [
            'Our server logs have one line per event and hold only fields chosen one by one; they hold no request content, keys or tokens, and fields whose names look like secrets are hidden.',
            'For safety and stability the server has rate limits, counted per account and kept only in the server\'s memory.',
            'All traffic to Noureon\'s servers uses HTTPS; keys and credentials on the server are stored encrypted.',
            'The website has a content security policy (CSP) limiting where the page may load from and connect to.',
            'The sandbox has limits on memory and CPU, and the container is removed when the reply ends.'
          ]
        ]
      },
      {
        id: 'analytics',
        h: '13. Analytics, advertising and tracking',
        blocks: [
          'Noureon has no built-in analytics, advertising tracking or cross-site tracking scripts, and does not sell personal data. The home page before sign-in and the public pages (Terms of Use, Privacy Policy, update history) have no analytics scripts either. The providers that host the website and the servers handle connection details (for example IP addresses and request records) to deliver pages and keep the service running. Anyone who hosts Noureon themselves and adds analytics has to describe it separately.'
        ]
      },
      {
        id: 'retention',
        h: '14. How long data is kept, and deletion',
        blocks: [
          [
            'Data in the browser: until you delete it or clear browser data.',
            'The cloud workspace: until you delete it or delete the account; when you are signed in and syncing, deletion and restoration sync to the cloud (with deletion markers). Items in the trash can be restored or deleted for good.',
            'Keys kept temporarily on the server: at most 2 hours 15 minutes for an ordinary reply, 30 minutes for an image, 27 hours for deep research; usually deleted when the reply ends.',
            'Sandbox containers and what is in memory: deleted when the reply ends.',
            'Cloud files: files that no conversation refers to are removed automatically after about a day; a skill\'s zip is deleted with the skill, and a zip no skill points to is removed by the daily clean-up.',
            'Secure credentials: until you delete them or delete the account.',
            'Server logs: only event records without content, kept as operations require. Run records (without keys) are kept until they are removed; the prompt and reference pictures of an image are deleted when the image ends.',
            'Mail sent to support: kept to deal with your question and, where needed, deleted at your request.'
          ]
        ]
      },
      {
        id: 'rights',
        h: '15. Your choices and rights',
        blocks: [
          [
            'Do not sign in to a cloud account, and no workspace data leaves your device (apart from the requests you send to providers).',
            'In Settings → Privacy choose to make replies only on your own device, and the history and keys are not sent to our servers.',
            'Turn off automatic memory and cross-conversation recall to stop those data flows.',
            'Export, import, delete, restore or permanently delete your data at any time; use "Clear all records and data" to empty this browser.',
            'Look at, replace or delete your secure credentials, skills and website rules.',
            'To obtain, correct or delete the data of your cloud account, write to support@noureon.com from the Email you registered with; we will reply within a reasonable time. Depending on the law where you live you may also have rights of access, correction, erasure, restriction, portability and objection; write to us to exercise them.'
          ]
        ]
      },
      {
        id: 'children',
        h: '16. Children and international transfer',
        blocks: [
          [
            'Noureon is not a service designed for children. The providers you use also have age rules; follow them.',
            'The providers you choose and the infrastructure we use may be in different countries, so data may be processed outside where you live.'
          ]
        ]
      },
      {
        id: 'thirdparties',
        h: '17. Third-party services at a glance',
        blocks: [
          [
            'Supabase: account verification, database and file storage (for cloud sync and server-side running).',
            'Cloudflare: the Turnstile bot check.',
            'Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish: the model and search providers you set up.',
            'GitHub: downloads and icons of command tools, and the source code.',
            'Vercel: web hosting and delivery.',
            'jsDelivr: loading of Python in the browser (Pyodide).',
            'PeerJS: the pairing server of peer-to-peer transfer.',
            'Google Forms: feedback and Noura proposals (when the operator sets it up).',
            'An email delivery service: account verification and recovery mail.',
            'Your browser and operating system: speech recognition.'
          ],
          'Each of these services has its own privacy policy.'
        ]
      },
      {
        id: 'selfhost',
        h: '18. Hosting it yourself',
        blocks: [
          'When you host Noureon yourself, never commit real provider keys, SMTP credentials, Resend keys, Supabase service keys, Google Apps Script URLs or other secrets to the repository; use environment variables for server-side settings, and keep provider keys in the local settings unless you have a separate encrypted secret-management plan. If the deployment adds analytics, its owner has to describe it separately.'
        ]
      },
      {
        id: 'changes',
        h: '19. Changes to this policy',
        blocks: [
          'We may change this policy as features change. The new version is published on this page with the date at the top updated, and important changes are also written in the update history (noureon.com/updates). PRIVACY.md on GitHub is updated with it.'
        ]
      },
      {
        id: 'contact',
        h: '20. Contact us',
        blocks: [
          'For privacy, account, sync, mail or data questions: support@noureon.com. Please do not attach API keys, sync passwords or recovery data.'
        ]
      }
    ]
  }
};

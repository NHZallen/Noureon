<p align="center">
  <img src="./public/logo.png" alt="Noureon logo" width="220">
</p>

<h1 align="center">Noureon</h1>

<p align="center"><strong>Think beyond one model.</strong></p>

<p align="center">
  An AI workspace that puts models from many vendors in one place: multi-model chat, a Model Council, deep research,
  files and decks, image generation, extensions, memory and optional cloud sync. It runs in the browser, installs as an app,
  and keeps your data on your own device unless you choose otherwise.
</p>

<p align="center">
  <a href="https://noureon.com/">Open Noureon</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#run-it-locally">Run it locally</a>
  ·
  <a href="./README.zh-TW.md">繁體中文</a>
</p>

<p align="center">
  <a href="https://github.com/NHZallen/Noureon/actions/workflows/ci.yml"><img src="https://github.com/NHZallen/Noureon/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6D5CE7.svg" alt="MIT License"></a>
</p>

---

## Get started

**Use it online.** Open [noureon.com](https://noureon.com/), create a local profile with a name and a password (or bind an email or Google account to use a cloud account), add an API key for at least one provider in **Settings → Model management**, pick a model next to the message box and start a conversation. The in-app [Help Center](https://noureon.com/help) explains every feature.

**Run it yourself.** Noureon is open source under the MIT license.

```bash
git clone https://github.com/NHZallen/Noureon.git
cd Noureon
npm ci
npm run dev
```

Then open `http://localhost:5173`. More in [Run it locally](#run-it-locally).

## Contents

- [What Noureon is](#what-noureon-is)
- [Features](#features)
  - [Models and providers](#models-and-providers)
  - [Chat](#chat)
  - [Model Council](#model-council)
  - [Deep research](#deep-research)
  - [Web search and reading pages](#web-search-and-reading-pages)
  - [Attachments, camera and voice](#attachments-camera-and-voice)
  - [Files and decks](#files-and-decks)
  - [Image generation and editing](#image-generation-and-editing)
  - [Advanced mode (Python)](#advanced-mode-python)
  - [Extensions: skills, command tools and connectors](#extensions-skills-command-tools-and-connectors)
  - [Projects](#projects)
  - [Memory](#memory)
  - [Accounts, sync and your data](#accounts-sync-and-your-data)
  - [Interface, languages and installing](#interface-languages-and-installing)
- [Your data and privacy](#your-data-and-privacy)
- [Run it locally](#run-it-locally)
- [Configuration](#configuration)
- [Development](#development)
- [Project structure](#project-structure)
- [Conventions](#conventions)
- [Documentation](#documentation)
- [Status and roadmap](#status-and-roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [Support](#support)
- [License](#license)

## What Noureon is

Most AI chat apps are built around one model from one vendor. Noureon is built for work that benefits from choice, comparison and collaboration between models, and for people who want to stay in control of their data.

- **Bring your own keys.** Noureon does not sell model usage and does not provide model credit. You add an API key for each provider you want to use and pay that provider directly.
- **Local-first.** Conversations, projects, settings, assistants, API keys and appearance preferences are stored in your browser by default.
- **Optional account.** A cloud account unlocks sync across devices, replies that continue after you close the page, cloud file storage, extensions that need a server, and sharing. You can use Noureon without one.
- **One workspace.** Chat, search the web, read attachments, research a topic, make files and decks, draw images, run code and use connected services without switching tools.
- **Works everywhere.** It is a progressive web app: use it in a browser on a computer or a phone, or install it from the browser.

## Features

### Models and providers

Use models from different vendors in the same conversation list and switch between them at any time.

| Service | What it gives you |
| --- | --- |
| Google Gemini | Gemini models, with their own built-in web search |
| OpenRouter | One key for models from many labs, and image models |
| OpenAI | OpenAI text and image models, with OpenAI's own web search |
| NVIDIA | Free hosted models from the NVIDIA catalog |
| OpenCode Go | Models from several vendors on an OpenCode Go subscription |
| Tavily, TinyFish | Web search and page reading for models that have no search of their own |

- The model picker next to the message box lists every available model (more than 80 options from about 20 vendors), with search and grouping by vendor. Models that support thinking levels show a slider for how deeply the model thinks.
- You only configure the providers you intend to use. Availability, price, limits and regional access are decided by each provider.
- An optional small "judgement model", chosen in Settings, helps decide things like whether a message needs a web search. When it is slow or fails, the app falls back to its own word lists.

### Chat

- **Message box:** paste text, attach files, take a photo, dictate by voice, type `/` to choose a skill and `@` to choose a command tool, and expand the box into a large editor. On a phone, the **+** button opens a bottom panel with camera, photos, files, Google Drive, search, council, deep research, learning and design.
- **Steering while a reply runs:** sending a message during a reply can steer it (the model sees your message the next time it finishes using a tool), queue it for after the reply, or stop the reply and send it at once. You choose the default in Settings.
- **Nouras:** reusable assistants with their own name, description, instructions and avatar. Pick official ones from the Nouras store, create your own, propose a new one, or hand one to another person directly between devices.
- **Organizing:** put conversations in projects, archive them, or move them to the trash. Select and move several at once. The trash can restore or delete for good.
- **Temporary chat:** nothing is recorded, and the reply is made on your own device.
- **Searching history:** search conversation titles, message text, or ask in natural language. A timeline lets you jump to a message in a long conversation.
- **Learning mode:** a mode of the message box for studying a subject step by step.
- **Branching and editing:** edit a message and continue from there, or branch a conversation into a new one that copies everything up to a message you choose.
- **Automatic naming:** conversations get a short title; you can switch this off.
- **Personal dashboard:** totals, the models you use most, share of use by model and when you write, all counted on your own device.
- **Sharing a conversation:** make a link to a read-only copy, or to one that people with a cloud account can copy and continue with their own keys. Memory, assistant instructions and your keys are never shared. You can update the link or stop sharing at any time.

### Model Council

The Model Council lets 2 to 5 models give their view on the same question, and a model you choose as the synthesizer writes one answer.

- **Consensus mode:** each member answers on its own and the synthesizer pulls the answers together.
- **Discussion mode:** members answer, read each other, revise, and then the synthesizer writes the conclusion.
- **Consensus and differences table:** the answer comes with a table of who agreed, who held back and how it was settled.
- **Members can work:** with web search on, each member searches and opens pages by itself; members can also load your skills and, with your permission, read connected services. Members only read; they change nothing.
- **Live timeline:** while it runs you see the stages and what each member is doing; afterwards the reply keeps a one-line summary that opens to the timeline.
- **Saved groups:** save a set of members and the synthesizer, and apply it later.
- **Runs without the page:** with a cloud account the council is held on the server and finishes even if you close the page.

### Deep research

For questions that need a lot of looking up and a report with sources.

1. The model drafts a research plan of up to eight items, and you get a short countdown to change them.
2. It works through the items one by one: searching, reading pages, cross-checking and writing notes.
3. You watch progress live (items done, percentage, searches, time used) and can open the sources and activity. You can pause, stop, or send extra instructions.
4. The result is a report with citations and charts. Read it in the chat or full screen with a table of contents, and export it as PDF, Word or Markdown.

Research runs on the server for accounts that use it, so you can leave and come back to the finished report. It needs a web search source: Gemini and OpenAI models have their own, other models use a Tavily or TinyFish key.

### Web search and reading pages

- Models with built-in search (Gemini, OpenAI) can use it; other models use the Tavily or TinyFish source you choose.
- **Smart search** decides whether a message should search the web at all.
- Addresses you paste into a message are read for you.
- For a model that cannot use tools, a search is made first and the pages found are given to it as a "search packet".
- Cited sources are numbered in the answer, with the site's name and icon beside them.

### Attachments, camera and voice

- Attach images, documents, audio and video. Whether a model can read a file directly depends on the model.
- When a model cannot read a document, a "document translation" model you choose can turn it into detailed text for that one request. Word, PowerPoint and Excel files are read (text, tables, charts, pictures) for models that cannot open them.
- Each attachment is numbered for the model ("Image 2 of 3 in this message"), so you can say "the second picture" or "what does the contract say?".
- **Camera:** take a photo and attach it in one step.
- **Voice input:** dictate with the microphone; your browser turns speech into text.
- **Speech to text for recordings** (off by default): write down what is said in recordings and videos you attach so that a model that cannot listen can read it, using your own key or a Whisper model that needs none.

### Files and decks

Ask in the chat for a deck (PPTX), Word (DOCX), Excel (XLSX), PDF or a dozen other formats such as CSV, calendars and subtitles.

- Files appear as cards you can preview and download, several at a time as one ZIP.
- **Designs:** 20 deck designs and 9 document styles, a design panel to choose them, or describe a style in words.
- **Visual check:** after a deck is made, each slide can be drawn as an image for a model of your choice to check the layout and fix it.
- **Charts:** interactive charts and diagrams in replies and in exported files.
- With a cloud account the files you make are saved to your own cloud storage.

### Image generation and editing

- Image models (GPT Image, FLUX, Nano Banana and others) draw in the chat with reference pictures, aspect ratio, resolution and quality settings, and keep editing afterwards.
- **GIF and SVG:** the newest GPT Image model can make an animated GIF (you choose frames and timing) and SVG drawings.
- **Editing:** mark an area of a picture and ask for a change; for GIFs, mark single frames or a grid of frames, and set the playback speed.
- A text model can also draw by itself when you give it a picture model to call, and the pictures appear in its own reply, numbered so you can refer to them later.
- With a cloud account, images are made on the server and finish even if you close the page.

### Advanced mode (Python)

The model can write Python to process data, draw charts and make files. Noureon uses this automatically when the model and the device can run it, and otherwise falls back to Standard mode, so there is nothing to choose. Code runs in an isolated environment, either on the server or in the browser, and the files it makes are listed in the reply.

### Extensions: skills, command tools and connectors

The Extensions page has three parts.

- **Skills:** written-down ways of working (a `SKILL.md` with a name, a description and instructions). Eleven official skills ship with Noureon, including one that helps you write your own. Choose one with `/`, or let the model load the ones you allow when it needs them. Add your own by pasting text or uploading a zip with notes, scripts and assets.
- **Command tools:** eight official command-line tools (for example Pandoc, FFmpeg, yt-dlp, csvkit and SoX) that run in an isolated environment on the server. Turn them on, choose one with `@`, or let the model use them. When a tool needs a website or a login, Noureon asks you first.
- **Connectors:** log in to your own account at a service and the model can read what is yours there and, where you allow it, change it. Currently Google (Calendar, Sheets, Docs, Slides, Drive and Gmail), Notion, Linear, Miro, Canva, Context7, Upstash, Vercel, GitHub, Supabase, Hugging Face, Pally and ether.fi. You log in on the service's own page, and for every tool you decide whether it is allowed, asked about each time, or refused. Reading tools start as allowed and tools that change things start as ask.

### Projects

A project groups conversations and gives them shared context.

- **Instructions** that every conversation in the project follows.
- **Sources:** texts and files (kept as they are), and files you pick from Google Drive with Google's own file picker. The model searches and reads them by itself, including pictures, video frames and scanned PDF pages.
- **Project memory:** a project can have its own notes that no other chat sees.
- **Sharing:** invite people by link or email as editors or chat members. Everyone can read the project's conversations and branch one into their own; each conversation keeps its author. The owner manages members and the project.
- Your own color and icon for each project.

### Memory

- **Notes:** Noureon keeps what is worth remembering about you as short notes, one fact each. You can see, edit, pin, mark as "do not bring up", delete, export or clear them. A note you delete is not learned again.
- **Used carefully:** pinned notes go with every message; other notes are looked up only when they bear on what you ask, and you can see which ones a reply used and mark one as not relevant.
- **Learning:** the model may save a note while you chat, and every note must quote your own words. Learning, use and pause can each be switched off. An automatic tidy merges and archives notes, and its changes can be undone for 30 days.
- **Past conversations:** a keyword index is built in your browser from your conversations. Search by meaning is off until you agree to it.

### Accounts, sync and your data

- **Local account:** a name and a password; its data stays in that browser.
- **Cloud account:** bind an email or a Google account. Sign-in options include a passkey and an authenticator app, and Settings shows the devices that are signed in.
- **Cloud sync:** conversations, projects, assistants, memory notes and the files you make sync across devices. API keys sync only after you create a sync password, and are encrypted before they leave the device.
- **Export and import:** back up everything as `.json` or `.zip` and restore it later.
- **Device to device:** send or receive conversations and assistants directly between two devices with a short code or a QR code.
- **Shared items:** one place that lists every link you shared, where you can revoke each one.
- **Storage:** cloud files are limited per account; Settings shows your usage.
- **Delete everything:** one button clears all records in the browser for good.

### Interface, languages and installing

- **Languages:** Traditional Chinese, English, French, Russian and Spanish.
- **Appearance:** light, dark or follow the system, with a choice of accent color.
- **Computer:** an icon rail with a navigation panel that can stay open or appear on hover, full-page settings, and keyboard shortcuts you can switch off or change.
- **Phone:** bottom panels that move with your finger, and the message box laid out for one hand.
- **Install as an app:** use "Add to Home Screen" or "Install" in your browser. Offline, only the cached app works; anything that needs a model or the cloud still needs a network.
- **Accessibility:** options to reduce motion and for how a message is sent while a reply is running.

## Your data and privacy

Local-first means your workspace is controlled from your own device. It does not mean every request runs offline.

- When you send a message, the prompt, the conversation context and the attachments needed go to the model provider you chose. Web search requests go to the search source you chose. Each provider's terms and privacy policy apply.
- API keys stay in your browser by default. If you choose to have replies made on the server, the key is used for that reply only.
- Cloud sync, replies that continue after you close the page, cloud files, sharing and connectors are available only with a cloud account and are optional.
- Read the full [Privacy Policy](./PRIVACY.md). The Help Center and the Terms of Use are available on the site.

## Run it locally

### Requirements

- Node.js `20.19+` or `22.12+`
- npm
- An API key for at least one supported provider

### Start

```bash
git clone https://github.com/NHZallen/Noureon.git
cd Noureon
npm ci
npm run dev
```

Open the address Vite prints, normally `http://localhost:5173`. Then:

1. Create a local profile on the sign-in page.
2. Open **Settings → Model management** and add an API key for the provider you want.
3. Pick a model next to the message box and start a conversation.

Provider keys are entered in the app and do not belong in `.env`.

### What works without extra services

Without any server configuration, a local profile gives you chat, the Model Council, search, attachments, file and deck making, image generation, memory, projects, import and export, and the browser-based Python mode. Features that need an account (cloud sync, replies that continue after you close the page, cloud file storage, sharing, connectors, command tools and server-run skills) need a cloud account and the hosted runtime, and are not part of a plain local setup.

## Configuration

Most installations need no environment variables. The optional ones are read from a `.env` file (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | Local development port |
| `GOOGLE_FORM_ENDPOINT` | Lets the included API route forward feedback and assistant proposals to a form you own |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser client settings for the sign-in and sync service (both values are meant to be public) |
| `VITE_TURNSTILE_SITE_KEY` | Public site key for the bot check on sign-in pages |
| `VITE_GOOGLE_PICKER_CLIENT_ID`, `VITE_GOOGLE_PICKER_API_KEY`, `VITE_GOOGLE_PICKER_APP_ID` | Public settings for choosing files from Google Drive in a project |

Never commit real service endpoints, secrets or provider keys. If you host Noureon yourself, keep secrets in your platform's environment settings.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build in `dist/` and the public pages |
| `npm run preview` | Preview the production build |
| `npm test` | Run the regression test suite |
| `npm run test:browser` | Run the browser end-to-end tests (needs Chromium) |
| `npm run lint` | Run ESLint |
| `npm run check:shell` | Check the boundaries of the chat page shell |
| `npm run check:server` | Check that modules shared with the server use no browser-only APIs |
| `npm run check:sizes` | Check source and bundle size budgets |
| `npm run check:version` | Check that the version is the same everywhere it appears |
| `npm audit --omit=dev` | Audit production dependencies |

Before submitting a change, run:

```bash
npm run build && npm test && npm run lint && npm run check:shell && npm run check:server && npm run check:sizes && npm run check:version && npm audit --omit=dev
```

See [TESTING.md](./TESTING.md) for how the tests are laid out.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/runtime/` | The chat page by area: replies, council, research, images, messages, settings, memory, projects, sharing, skills, command tools, connectors and more |
| `src/app/runtime/shell/` | The page shell: creates the stores and every feature, and starts the page |
| `src/app/ui/` | Interface components: model picker, sheets, citations, charts, files, projects, rail and more |
| `src/app/auth/`, `src/app/sync/` | Sign-in and cloud sync |
| `src/app/share-page/` | The page that shows a shared conversation |
| `src/data/` | Languages, the catalogs of skills, command tools and connectors, assistants, and update notes |
| `src/styles/` | Styles organized by feature, with the shared colour names in `tokens.css` |
| `server/` | The optional server runtime for replies that continue after the page closes |
| `sandbox-host/`, `sandbox-probe/` | Files for the isolated code runner |
| `api/` | Optional serverless endpoints |
| `public/` | PWA assets, the home page assets and static files |
| `scripts/` | Build, boundary, size and probing scripts |
| `tests/` | Regression, rendering, security and behaviour tests |

## Conventions

- Every piece of user-facing text exists in all five languages (`zh-TW`, `en`, `fr`, `ru`, `es`). Interface texts live in `src/data/i18n/parts/`, one file per area with the five languages side by side.
- Colors come from the names in `src/styles/tokens.css`, never from values written into a stylesheet, so the light and the dark theme stay in step.
- A new feature is its own module with one line of registration in a core file. Size budgets are checked by `npm run check:sizes`.
- Modules shared by the browser and the server must not use `window`, `document`, browser storage or `import.meta.env`; `npm run check:server` enforces it.

## Documentation

- **[Help Center](https://noureon.com/help):** how each feature works, where your data goes, and what to do when something goes wrong, in five languages.
- **[Privacy Policy](./PRIVACY.md)** and the Terms of Use on the site.
- **[Update history](https://noureon.com/updates):** what changed in every version.
- **[TESTING.md](./TESTING.md):** how the tests are laid out.
- **[ROADMAP.md](./ROADMAP.md):** public direction.

## Status and roadmap

Noureon is under active development. Interfaces, model availability and internal structure continue to evolve; the update history lists every change.

## Contributing

Contributions of all kinds are welcome.

- **Bugs and ideas:** [open an issue](https://github.com/NHZallen/Noureon/issues). For a new feature or a larger change, start with an issue so the scope and direction can be discussed before you write code.
- **Code:** fork the repository, make your change on a branch, run the full set of checks listed under [Development](#development), and open a pull request. Follow the [Conventions](#conventions) above.
- **Translations:** every piece of text exists in Traditional Chinese, English, French, Russian and Spanish. Fixes and improvements to the wording are welcome; the interface texts are in `src/data/i18n/parts/`.

## Security

If you find a security problem, please report it privately by email to [support@noureon.com](mailto:support@noureon.com) rather than in a public issue, and give us a reasonable time to fix it before you share it.

## Support

- Account, sign-in, sync, email and data questions: [support@noureon.com](mailto:support@noureon.com). Please never send API keys, passwords or recovery data.
- News: [@NoureonAi](https://x.com/NoureonAi) on X.

## License

Noureon is released under the [MIT License](./LICENSE). Third-party software keeps its own licenses; the list is linked from the Extensions page in the app.

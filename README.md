<p align="center">
  <img src="./public/logo.png" alt="Noureon logo" width="220">
</p>

<h1 align="center">Noureon</h1>

<p align="center"><strong>Think beyond one model.</strong></p>

<p align="center">
  A local-first AI workspace for multi-model chat, collaboration, search, image generation, and reusable assistants.
</p>

<p align="center">
  <a href="https://noureon.com/">Live Demo</a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="./README.zh-TW.md">繁體中文</a>
</p>

<p align="center">
  <a href="https://github.com/NHZallen/Noureon/actions/workflows/ci.yml"><img src="https://github.com/NHZallen/Noureon/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-6D5CE7.svg" alt="MIT License"></a>
</p>

---

## Why Noureon?

Most AI chat interfaces are built around one model at a time. Noureon is designed for workflows that benefit from choice, comparison, and collaboration.

- **Think with more than one model.** Compare responses or use Model Council to combine multiple perspectives into one synthesized answer.
- **Keep control of your workspace.** Conversations, preferences, Nouras, and API credentials are stored locally in your browser by default.
- **Work without switching tools.** Chat, search the web, analyze attachments, generate images, and organize reusable assistants from one interface.

## Live demo

Open the hosted version:

**https://noureon.com/**

Noureon can run as a local-first workspace or as a signed-in cloud-sync workspace. By default, conversations, settings, Nouras, and provider API credentials stay in the current browser. Signed-in users can enable Supabase cloud sync to keep conversations, folders, Nouras, and supported assets available across devices.

Provider API keys are still managed from **Settings** and are not required in `.env` for normal use. To send real model requests, add an API key for at least one supported provider in **Settings**.

## Features

### Multi-provider chat

Use models from different providers without moving conversations between separate applications.

Noureon currently supports:

- Google Gemini
- OpenRouter
- NVIDIA API Catalog
- Step Plan
- Tavily web search

You only need to configure the providers you intend to use.

### Model Council

Model Council allows several AI models to work on the same request.

- Select between 2 and 5 participant models
- Choose a separate synthesizer model
- Compare different model perspectives
- Use consensus or discussion workflows
- Produce one final synthesized response

This makes it easier to examine difficult questions, compare reasoning approaches, and reduce dependence on a single model response.

### Search and attachments

Noureon supports workflows involving:

- Web search
- Images
- Documents
- Media attachments
- Search-assisted model responses

Gemini models can use their supported native search capabilities. Other supported providers can use Tavily when a Tavily API key is configured.

Attachment support depends on the selected model and provider.

### Image generation

Supported image models can generate images directly inside a conversation.

Generated images can be previewed, downloaded, reused, or opened in the image editing workflow.

### Nouras

Nouras are reusable assistants with their own:

- Name
- Description
- Instructions
- Avatar
- Specialized behavior

They can be used for writing, planning, language learning, analysis, creative work, and other repeatable workflows.

### Conversation workspace

Noureon also includes:

- Conversation folders and archives
- Temporary conversations
- Searchable conversation history
- Markdown rendering
- Mathematical formulas
- Charts and structured visual output
- Media previews
- Model reasoning controls
- Import and export
- Peer-to-peer data transfer
- English, Traditional Chinese, and French interfaces
- Progressive Web App installation

## Local-first by default

Noureon stores the following data in your browser by default:

- Conversations
- Folders and archives
- Application settings
- Nouras
- Provider API credentials
- Appearance preferences
- Local profile information

When you send a message, the required prompt, conversation context, and attachments are transmitted to the AI provider you selected.

Web search requests may be sent to the configured search provider. Provider requests are governed by the terms and privacy policies of those services.

Local-first means your workspace is controlled from your device. It does not mean every AI request runs offline.

Signed-in cloud sync is optional. When enabled, Supabase stores the workspace records needed for cross-device sync, including conversations, folders, Nouras, messages, sync metadata, deletion markers, and supported uploaded/generated assets. Sensitive cloud vault or recovery payloads are encrypted with the user's sync key/password when configured.

Read the full [Privacy Policy](./PRIVACY.md).

## Quick start

### Requirements

- Node.js `20.19+` or `22.12+`
- npm
- An API key for at least one supported AI provider

### Run locally

```bash
git clone https://github.com/NHZallen/Noureon.git
cd Noureon
npm ci
npm run dev
```

Open the local URL printed by Vite, normally:

```text
http://localhost:5173
```

Then:

1. Create a local Noureon profile.
2. Open **Settings**.
3. Add an API key for the provider you want to use.
4. Select a model and start a conversation.

Provider API keys do not need to be added to `.env`.

## Provider configuration

| Service | Purpose | Configuration |
| --- | --- | --- |
| Google Gemini | Native Gemini models and supported search | Noureon Settings |
| OpenRouter | Models from multiple AI labs and image generation | Noureon Settings |
| NVIDIA | Supported NVIDIA-hosted models | Noureon Settings |
| Step Plan | StepFun reasoning models | Noureon Settings |
| Tavily | Web search for supported non-native providers | Noureon Settings |

Model availability, pricing, rate limits, and regional access are determined by each provider.

Noureon does not provide or resell model access.

## Environment variables

Most installations do not require server-side environment variables.

The optional `.env` configuration is used for self-hosted feedback and Noura proposal forms:

```env
GOOGLE_FORM_ENDPOINT=
PORT=5173
```

Do not commit real service endpoints, API keys, or other sensitive values.

## Production build

Create a production build with:

```bash
npm run build
```

Preview it locally:

```bash
npm run preview
```

The generated frontend is written to `dist/`.

The included serverless API route can optionally proxy feedback and Noura proposal submissions when `GOOGLE_FORM_ENDPOINT` is configured by the deployment platform.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run the regression test suite |
| `npm run check:legacy-runtime` | Validate legacy runtime boundaries |
| `npm run check:sizes` | Check source file size budgets |
| `npm audit --omit=dev` | Audit production dependencies |

Before submitting a change, run:

```bash
npm run build
npm test
npm run check:legacy-runtime
npm run check:sizes
npm audit --omit=dev
```

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/runtime/` | Application runtime, features, state, and UI coordination |
| `src/app/legacy-runtime/` | Legacy functionality being migrated into smaller modules |
| `src/data/` | Languages, Nouras, demo conversations, and update information |
| `src/styles/` | Application styles organized by feature |
| `api/` | Optional serverless endpoints |
| `tests/` | Regression, rendering, security, and behavior tests |
| `scripts/` | Boundary, size, and development checks |
| `public/` | PWA assets and static files |

## Project status

Noureon is under active development.

Core chat, Model Council, search, image, PWA, personalization, and data portability workflows are available. The project is also migrating legacy runtime modules into smaller feature boundaries while maintaining regression coverage.

Interfaces, model availability, and internal architecture may continue to evolve.

See the public [Roadmap](./ROADMAP.md) for current direction.

## Feedback and contributions

Found a bug or have an idea?

For account, sign-in, sync, mail, or data-support questions, email [support@noureon.com](mailto:support@noureon.com).

[Open an issue](https://github.com/NHZallen/Noureon/issues).

For larger changes, please start with an issue so the scope and direction can be discussed before implementation.

## License

Noureon is released under the [MIT License](./LICENSE).

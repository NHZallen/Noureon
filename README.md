# AstraChat

[![CI](https://github.com/NHZallen/Astra-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/NHZallen/Astra-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-6D5CE7.svg)](./LICENSE)

**Think beyond one model.**

AstraChat is a local-first AI workspace that brings multiple AI providers, model collaboration, web search, image generation, and reusable AI assistants into one focused interface.

[Try the live demo](https://astranos-chatbot.vercel.app/) · [Quick start](#quick-start) · [繁體中文](./README.zh-TW.md)

---

## Why AstraChat?

Most AI chat interfaces are built around one model at a time. AstraChat is designed for workflows that benefit from choice, comparison, and collaboration.

- **Think with more than one model.** Compare responses or use Model Council to combine multiple perspectives into one synthesized answer.
- **Keep control of your workspace.** Conversations, preferences, Astras, and API credentials are stored locally in your browser by default.
- **Work without switching tools.** Chat, search the web, analyze attachments, generate images, and organize reusable assistants from one interface.

## Live demo

Open the hosted version:

**https://astranos-chatbot.vercel.app/**

AstraChat uses local browser profiles instead of a hosted account system. The username, password verification data, conversations, settings, and API credentials remain in the current browser environment by default.

To send real model requests, add an API key for at least one supported provider in **Settings**.

## Features

### Multi-provider chat

Use models from different providers without moving conversations between separate applications.

AstraChat currently supports:

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

AstraChat supports workflows involving:

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

### Astras

Astras are reusable assistants with their own:

- Name
- Description
- Instructions
- Avatar
- Specialized behavior

They can be used for writing, planning, language learning, analysis, creative work, and other repeatable workflows.

### Conversation workspace

AstraChat also includes:

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

AstraChat stores the following data in your browser by default:

- Conversations
- Folders and archives
- Application settings
- Astras
- Provider API credentials
- Appearance preferences
- Local profile information

When you send a message, the required prompt, conversation context, and attachments are transmitted to the AI provider you selected.

Web search requests may be sent to the configured search provider. Provider requests are governed by the terms and privacy policies of those services.

Local-first means your workspace is controlled from your device. It does not mean every AI request runs offline.

Read the full [Privacy Policy](./PRIVACY.md).

## Quick start

### Requirements

- Node.js `20.19+` or `22.12+`
- npm
- An API key for at least one supported AI provider

### Run locally

```bash
git clone https://github.com/NHZallen/Astra-chat.git
cd Astra-chat
npm ci
npm run dev
```

Open the local URL printed by Vite, normally:

```text
http://localhost:5173
```

Then:

1. Create a local AstraChat profile.
2. Open **Settings**.
3. Add an API key for the provider you want to use.
4. Select a model and start a conversation.

Provider API keys do not need to be added to `.env`.

## Provider configuration

| Service | Purpose | Configuration |
| --- | --- | --- |
| Google Gemini | Native Gemini models and supported search | AstraChat Settings |
| OpenRouter | Models from multiple AI labs and image generation | AstraChat Settings |
| NVIDIA | Supported NVIDIA-hosted models | AstraChat Settings |
| Step Plan | StepFun reasoning models | AstraChat Settings |
| Tavily | Web search for supported non-native providers | AstraChat Settings |

Model availability, pricing, rate limits, and regional access are determined by each provider.

AstraChat does not provide or resell model access.

## Environment variables

Most installations do not require server-side environment variables.

The optional `.env` configuration is used for self-hosted feedback and Astra proposal forms:

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

The included serverless API route can optionally proxy feedback and Astra proposal submissions when `GOOGLE_FORM_ENDPOINT` is configured by the deployment platform.

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
| `src/data/` | Languages, Astras, demo conversations, and update information |
| `src/styles/` | Application styles organized by feature |
| `api/` | Optional serverless endpoints |
| `tests/` | Regression, rendering, security, and behavior tests |
| `scripts/` | Boundary, size, and development checks |
| `public/` | PWA assets and static files |

## Project status

AstraChat is under active development.

Core chat, Model Council, search, image, PWA, personalization, and data portability workflows are available. The project is also migrating legacy runtime modules into smaller feature boundaries while maintaining regression coverage.

Interfaces, model availability, and internal architecture may continue to evolve.

See the public [Roadmap](./ROADMAP.md) for current direction.

## Feedback and contributions

Found a bug or have an idea?

[Open an issue](https://github.com/NHZallen/Astra-chat/issues).

For larger changes, please start with an issue so the scope and direction can be discussed before implementation.

## License

AstraChat is released under the [MIT License](./LICENSE).

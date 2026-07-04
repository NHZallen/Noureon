# AstraChat

AstraChat is a local-first multi-provider AI chat client built with Vite. It supports model switching, model council workflows, image generation, web search, PWA installability, conversation import/export, and a broad regression test suite.

## Features

1. Multi-provider chat with Gemini, OpenRouter, Step Plan, NVIDIA, and Tavily search integration.
2. Model council workflows for multi-model comparison and synthesis.
3. Image generation and generated image editing flows.
4. Local-first settings and conversation persistence.
5. PWA support with service worker update handling.
6. Import and export for conversations, settings, Astras, and optional sensitive data.
7. Markdown, formulas, charts, attachments, and media previews.
8. Regression tests for runtime behavior, security boundaries, UI rendering, and chart output.

## Screenshots

Add screenshots or GIFs here before a public launch.

## Quick Start

```bash
npm ci
npm run dev
```

## Development Commands

```bash
npm run build
npm test
npm run check:legacy-runtime
npm run check:sizes
npm audit --omit=dev
```

## Environment Variables

Most provider API keys are stored locally through the app settings UI. Server-side proxy features are optional.

See `.env.example`.

## Privacy

AstraChat stores app data locally by default. Provider requests are sent to the selected model provider when you submit a prompt. Feedback and Astra proposal forms are optional self-hosted features that only send when `GOOGLE_FORM_ENDPOINT` is configured on the server. The legacy automatic conversation mail export path has been removed. See `PRIVACY.md`.

## Project Status

This codebase is actively migrating legacy runtime modules into smaller feature boundaries. Size budgets and boundary checks are included to keep that migration measurable.

## License

MIT

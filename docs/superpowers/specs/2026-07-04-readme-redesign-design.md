# AstraChat README Redesign

## Objective

Replace the current release-oriented README with a polished, product-first introduction that serves three audiences in this order:

1. People deciding whether to try AstraChat.
2. Developers who want to run or inspect the project.
3. Potential collaborators evaluating the project's quality and direction.

The README must explain AstraChat's distinctive value without exaggerating privacy, maturity, or provider capabilities.

## Positioning

The primary product message is multi-model collaboration, expressed through the tagline:

> Think beyond one model.

The supporting message is local-first ownership. The broader feature set—chat, search, attachments, image generation, Astras, PWA installation, and data portability—demonstrates that AstraChat is a complete workspace rather than a single-purpose demo.

## Language Strategy

- `README.md` is the canonical English README.
- `README.zh-TW.md` is a complete Traditional Chinese counterpart with the same structure and claims.
- The English hero links directly to the Traditional Chinese README.
- The Traditional Chinese hero links directly back to the English README.
- Both documents use the renamed repository identity `NHZallen/Astra-chat` in clone, CI, Issue, and repository links.

## Visual and Brand Direction

The initial implementation is text-first. It does not add screenshots, GIFs, the old robot mark, or a temporary image placeholder.

The future visual direction is minimal and spacious: restrained black-and-white documentation styling with purple accents derived from the new circular AstraChat logo. Future media should use one short Model Council GIF, three focused product screenshots, and at most one mobile composite. Those assets are outside this implementation.

The README uses only two badges:

- The real GitHub Actions CI workflow status.
- The MIT license.

It does not add decorative technology badges, a table of contents, star-history graphics, sponsorship sections, or social badge rows.

## README Structure

Both language versions use this order:

1. Product name, CI and license badges, tagline, one-paragraph positioning, and navigation links.
2. `Why AstraChat?` with three reasons: multi-model thinking, local ownership, and a unified workflow.
3. Live demo with the deployed URL and an explanation that profiles are browser-local rather than hosted accounts.
4. Feature overview covering multi-provider chat, Model Council, search and attachments, image generation, Astras, and the conversation workspace.
5. Local-first behavior, including an explicit distinction between local storage and external provider requests.
6. Quick Start with supported Node.js versions, the renamed clone URL, installation commands, and first-run steps.
7. Provider configuration for Gemini, OpenRouter, NVIDIA, Step Plan, and Tavily.
8. Optional environment variables and production build instructions.
9. Development commands and the expected pre-change verification sequence.
10. High-level project structure.
11. Active-development status and roadmap link.
12. Issue-first feedback and contribution guidance.
13. MIT license link.

## Hero Content

The English README opens with:

```text
# AstraChat

**Think beyond one model.**

AstraChat is a local-first AI workspace that brings multiple AI providers, model collaboration, web search, image generation, and reusable AI assistants into one focused interface.
```

The primary links are:

- Live demo: `https://astranos-chatbot.vercel.app/`
- Quick Start: the local `#quick-start` anchor.
- Traditional Chinese: `./README.zh-TW.md`.

## Feature Claims

The documentation may make these verified claims:

- Gemini, OpenRouter, NVIDIA, Step Plan, and Tavily integrations are available.
- Model Council supports 2–5 participant models and one synthesizer.
- Model Council offers consensus and discussion workflows.
- Search, supported attachments, image generation, generated-image editing, and reusable Astras are available.
- Conversations, settings, Astras, credentials, folders, and related workspace data are stored in the browser by default.
- Markdown, formulas, charts, media previews, folders, archives, temporary conversations, import/export, P2P transfer, PWA installation, and English, Traditional Chinese, and French interfaces are available.

The README must not claim that requests run fully offline, that no data ever leaves the device, or that every model supports every attachment or search capability.

## Privacy Language

The README explains both halves of local-first behavior:

- Workspace data remains in the browser by default.
- Prompts, required context, attachments, and searches are transmitted to the provider selected by the user when the corresponding feature is used.

Both language versions link to `PRIVACY.md` as the complete policy.

## Installation and Configuration

The documented runtime requirement is taken from Vite 8:

- Node.js `20.19+` or `22.12+`.
- npm.
- At least one supported provider API key for real model requests.

The canonical setup commands are:

```bash
git clone https://github.com/NHZallen/Astra-chat.git
cd Astra-chat
npm ci
npm run dev
```

The README directs users to create a local profile, open Settings, add a provider key, select a model, and start a conversation. Provider keys are configured through the UI rather than `.env`.

The only documented environment variables are the existing optional `GOOGLE_FORM_ENDPOINT` and `PORT` values from `.env.example`.

## Contributor Guidance

The project accepts bug reports and feature ideas through GitHub Issues. The README does not actively solicit unsolicited pull requests. It asks contributors to open an Issue before beginning a larger change so scope and direction can be discussed.

## Validation

Implementation is complete when:

- `README.md` contains the approved English product-first template.
- `README.zh-TW.md` contains a faithful Traditional Chinese counterpart.
- Cross-language, live-demo, clone, CI, Issue, privacy, roadmap, and license links use the approved targets.
- Every documented command exists in `package.json`.
- No screenshot, GIF, old logo, or unfinished visual placeholder is added.
- Markdown structure and local relative links pass a focused documentation check.

## Out of Scope

- Adding or replacing application icons and logos.
- Capturing screenshots or recording GIFs.
- Redesigning the deployed application.
- Changing provider integrations, runtime behavior, CI, privacy policy, roadmap, or package scripts.

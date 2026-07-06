# Privacy

Noureon is designed as a local-first chat client. This document describes the default data flows in this repository.

## Local Data Storage

Conversations, settings, Nouras, generated image metadata, and app state are stored in the browser by default. Import and export tools can move this data into files you choose.

## Provider Requests

When you send a prompt, Noureon sends the required prompt content, selected attachments, and model options to the selected model or search provider. This is necessary for chat, web search, image generation, and model council workflows.

## API Keys

Most provider API keys are entered in the app settings UI and stored locally. Sensitive export paths use redaction controls so secrets are not included unless an export flow explicitly supports and requests them.

## Automatic Conversation Export

The legacy automatic conversation mail export feature has been removed. Noureon does not automatically send conversation titles, user messages, or assistant responses to a mail or form endpoint.

## Feedback And Noura Proposals

Feedback and Noura proposal forms are optional. They send only the form fields the user submits, and only through the same-origin `/api/google-form-submit` proxy. The proxy refuses to forward anything unless the server has `GOOGLE_FORM_ENDPOINT` configured.

## Import And Export

User-triggered import/export may read or write conversations, folders, Nouras, settings, and generated assets. Review exported files before sharing them.

## Analytics

This repository does not include built-in analytics or telemetry scripts. If a deployment adds analytics, the deployment owner should document that separately.

## Self Hosting

Do not commit real provider keys, Google Apps Script URLs, or other secrets. Use environment variables for server-side endpoints and keep provider keys in the local app settings unless your deployment has a separate secret-management plan.

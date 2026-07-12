# Privacy

Noureon is a local-first AI workspace with optional account sign-in and cloud sync. This document describes the default data flows in this repository and the hosted Noureon deployment.

## Contact

For privacy, account, sync, mail, or data questions, contact [support@noureon.com](mailto:support@noureon.com). Do not include API keys, sync passwords, or recovery secrets in support messages.

## Local Data Storage

By default, Noureon stores conversations, folders, Nouras, app settings, appearance preferences, generated image metadata, app state, and encrypted provider API keys in the browser. API keys are encrypted with a non-extractable browser-managed AES-GCM key before persistent storage. Import/export tools can move data into files you choose. Clearing browser data may remove the local workspace and saved keys.

## Optional Sign-In And Cloud Sync

When a user signs in and enables cloud sync, Supabase stores the workspace records required for cross-device sync, including conversations, messages, folders, Nouras, sync metadata, deletion markers/tombstones, and supported uploaded or generated assets in Supabase Storage.

Sensitive cloud vault data is encrypted with the user's sync password when configured. Recovery is disabled until the user explicitly creates and confirms a Recovery Code; the browser encrypts the recovery payload with that user-held code before upload, so the server does not hold a shared key capable of decrypting all recovery records. Provider API keys persist locally as browser-key ciphertext unless the user clears them, exports them explicitly, or syncs them through a supported encrypted flow. Local encryption protects against direct plaintext inspection of storage, but it cannot prevent scripts running in the current page or a compromised browser profile from using the keys. Losing both the sync password and Recovery Code makes encrypted cloud data unrecoverable.

## Authentication And Email

Noureon supports account sign-in and recovery for users who choose cloud sync. Authentication-related emails are used only for account access and recovery.

## Provider Requests

When you send a prompt, Noureon sends the required prompt content, selected attachments, conversation context, generated media inputs, and model options to the selected model or search provider. This is necessary for chat, web search, image generation, attachment analysis, and Model Council workflows. Provider requests are governed by the selected provider's terms and privacy policy.

NVIDIA, StepFun, and Tavily requests use same-origin Noureon server proxies. For those routes, the provider API key is sent in the provider `Authorization` header and a separate Supabase session token is sent in `X-Noureon-Authorization`. The proxy validates the Noureon session and then forwards the provider request. The deployment server can therefore process the provider key and request content while the request is in transit. Use a separate, revocable provider key with an appropriate spending limit.

The included proxy event record contains only a server-generated request ID, proxy route, HTTP status, outcome, request duration, and a shortened one-way hash of the authenticated user ID when available. It must not contain provider API keys, Supabase tokens, cookies, prompts, attachments, request bodies, recovery data, or response content. Noureon does not impose its own request-count rate limit on these proxy routes; provider quotas and billing limits still apply.

Content Security Policy reports contain only the violated directive, disposition, and the origins of the document and blocked resource. Paths, query strings, page content, credentials, and user identifiers are removed before the event is recorded.

## API Keys

Most provider API keys are entered in the app settings UI and persist locally as browser-key ciphertext until the user clears them. Export and sync flows treat keys as sensitive: do not include them unless an explicit encrypted or user-confirmed flow supports it. Never send API keys to support.

## Feedback And Noura Proposals

Feedback and Noura proposal forms are optional. They send only the form fields the user submits, and only through the same-origin `/api/google-form-submit` proxy. The proxy refuses to forward anything unless the server has `GOOGLE_FORM_ENDPOINT` configured.

## Import And Export

User-triggered import/export may read or write conversations, folders, Nouras, settings, and generated or uploaded assets. Review exported files before sharing them, especially if you chose to include sensitive data.

## Analytics

This repository does not include built-in analytics, ad tracking, or cross-site tracking scripts. If a deployment adds analytics, the deployment owner should document that separately.

## User Control

Users can export, import, delete, restore, permanently delete, or clear local browser data through the app and browser controls. Signed-in cloud data may sync across devices, so deletion and restoration actions may also be reflected in the cloud workspace.

## Self Hosting

Do not commit real provider keys, SMTP credentials, Resend keys, Supabase service keys, Google Apps Script URLs, or other secrets. Use environment variables for server-side endpoints and keep provider keys in the local app settings unless your deployment has a separate encrypted secret-management plan.

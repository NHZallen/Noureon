# Privacy

Noureon is a local-first AI workspace with optional account sign-in and cloud sync. This document describes the default data flows in this repository and the hosted Noureon deployment.

## Contact

For privacy, account, sync, mail, or data questions, contact [support@noureon.com](mailto:support@noureon.com). Do not include API keys, sync passwords, or recovery secrets in support messages.

## Local Data Storage

By default, Noureon stores conversations, folders, Nouras, app settings, appearance preferences, provider API keys, generated image metadata, and app state in the browser. Import/export tools can move this data into files you choose. Clearing browser data may remove the local workspace.

## Optional Sign-In And Cloud Sync

When a user signs in and enables cloud sync, Supabase stores the workspace records required for cross-device sync, including conversations, messages, folders, Nouras, sync metadata, deletion markers/tombstones, and supported uploaded or generated assets in Supabase Storage.

Sensitive cloud vault or recovery payloads are encrypted with the user's sync key/password when configured. Provider API keys remain local by default (apart from the temporary, encrypted copy a reply made by the server needs, described below) unless the user explicitly includes or syncs them through a supported encrypted flow. Users are responsible for keeping sync passwords and recovery secrets safe.

## Replies Made By The Server

Signed-in cloud users can have replies made on the Noureon server, so a reply continues when the page is closed. This is the default; Settings → Privacy lets a user make replies only on their own device instead. When a reply runs on the server, the browser sends it the conversation history, the system instructions, the selected model and the provider API key (and, for searches by the model, the search provider key) needed for that one reply.

The keys are kept encrypted, and only for the reply: they are deleted when the reply ends, or after 2 hours 15 minutes at most, and they are never stored long term, written to logs or put in error messages. The server writes the reply into the same cloud workspace record the app already syncs. Replies that need the browser (web search for models that cannot call tools, voice input, the camera), replies of users who are not signed in, and temporary chats are made on the user's device.

When a reply needs Python (Advanced mode), the code the model writes and the files attached to the conversation are sent to Noureon's sandbox server, which runs them in an isolated container with no network access, its own limited memory and CPU, and no access to anything else; the container is removed when the reply ends. The files the code makes are saved in the user's own cloud storage (the same place attachments are kept) and listed in the reply.

## Authentication And Email

Noureon supports account sign-in and recovery for users who choose cloud sync. Authentication-related emails are used only for account access and recovery.

## Provider Requests

When you send a prompt, Noureon sends the required prompt content, selected attachments, conversation context, generated media inputs, and model options to the selected model or search provider. This is necessary for chat, web search, image generation, attachment analysis, and Model Council workflows. Provider requests are governed by the selected provider's terms and privacy policy.

## API Keys

Most provider API keys are entered in the app settings UI and stored locally. Export and sync flows should treat keys as sensitive: do not include them unless an explicit encrypted or user-confirmed flow supports it. Never send API keys to support.

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

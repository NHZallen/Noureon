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

The keys are kept encrypted, and only for the reply: they are deleted when the reply ends, or after 2 hours 15 minutes at most, and they are never stored long term, written to logs or put in error messages. The server writes the reply into the same cloud workspace record the app already syncs. Replies that need the browser (voice input, the camera), replies of users who are not signed in, and temporary chats are made on the user's device.

When a reply needs Python (Advanced mode), the code the model writes and the files attached to the conversation are sent to Noureon's sandbox server, which runs them in an isolated container with no network of its own, its own limited memory and CPU, and no access to anything else; the container is removed when the reply ends. The files the code makes are saved in the user's own cloud storage (the same place attachments are kept) and listed in the reply. Each user may keep up to 500 MB there (attachments and made files together; the settings show the use). Files that no conversation refers to any more (for example after a conversation was deleted) are removed automatically about a day later.

The CLI store (命令工具) lets a signed-in user add command-line tools. Which tools a user added is kept in their settings (and synced like the other settings). A tool runs only on the sandbox server, in the same isolated container as Python, when the user chooses it with "@"; the command the model writes and the files of the conversation are handled as described above, and the tool's program is downloaded by the sandbox host from its official release (GitHub), checked against a fixed hash. The store page loads each project's logo from GitHub (github.com), which therefore sees that request.

A tool that needs the internet (to download a video, to read a social network, to install its own Python package) reaches it only through a filtering proxy of the sandbox host, which the container is connected to by a socket (the container itself still has no network). The proxy decides for each site by the user's rules (Settings → Permissions: allow, ask or refuse; the sites that tools are made of, pypi.org, files.pythonhosted.org, registry.npmjs.org, github.com and two GitHub file hosts, are allowed at first): a site with no rule is asked about in the conversation (allow once, always allow, or refuse; no answer in 10 minutes counts as a refusal), and the user's rules are kept in their settings (and synced like the other settings). The proxy only opens the web ports (80 and 443), looks the site up itself and refuses every address inside the server (the machine itself, its private and pod networks, link-local and metadata addresses and its own public address), whatever the rules say. It sees the name of the site and the port, never the page or what is sent, and logs the site name and port with the decision (no page address, no content). The sites the user's tools reached are not otherwise kept on Noureon's servers except as the rules the user chose.

The skills (技能) a signed-in user pastes into the Extensions page (擴充) are kept in the table `user_skills` of the user's own cloud account (name, description and text; a row can be read and changed only by its owner, and the server reads it with its service role). A skill is only text: it is not run and it reaches no network by itself. When the user asks for a skill with "/" in a message, the full text of the skill is put in the system instructions of that reply, so it is sent to the AI provider the user chose for it (and through Noureon's server when the server makes the reply, as with the rest of the system instructions); skills that were not asked for are not sent. A skill is deleted when the user removes it (or the account is deleted).

The secure credentials (安全憑證) a user adds for a tool (for example the login cookies of an account) are kept on Noureon's server in an encrypted form (AES-256-GCM under a master key that lives only in the server's environment, bound to the user and the credential's name), in a table that only the server can read. When a tool needs a login, a window asks the user for it and what is entered is always saved; the user may look at, replace or delete the credentials in Settings → Permissions. A credential is put in the environment of the tool's command (or in the login file the tool would have saved itself, for the time of one command) only while the user's own tool runs; what the command prints is scrubbed of the credential before the model or the page sees it, and the model is never given the value. A credential is deleted when the user deletes it (or the account is deleted).

When the automatic visual check is on and a reply writes a presentation, the server draws its slides into pictures and shows them to the model the user chose (with the user's own key), then writes any corrected reply into the conversation; the pictures are not kept.

When an image is made by the server (the same setting, and a signed-in user whose chat is kept in the cloud), the prompt, the options (aspect ratio, size and the advanced settings), the reference pictures the user attached and the OpenRouter key are sent to the Noureon server over HTTPS. The key is kept encrypted for that image only: it is deleted when the image ends, or after 30 minutes at most, and it is never written to logs or error messages. The server asks OpenRouter's images endpoint for the image (the same request the browser makes when it does this itself), keeps each picture in the user's own cloud space (the same space the app's sync keeps generated images in; a generated image is not stopped by the 500 MB limit), and writes the message into the cloud workspace. The prompt and the reference pictures are kept with the run's record (without the key) only so that the run can be taken up again after a server restart, and are deleted from it when the image ends. If the server restarts while an image is being made, the request may be sent to OpenRouter a second time, and the user's OpenRouter account may be charged twice. No preview pictures are made. Users who choose their own device in Settings → Privacy, who are not signed in, or whose chat is temporary, get the image made in the browser as before.

When web search is on and the model cannot search by itself (an OpenRouter or NVIDIA model that does not call tools, or one used without a search key), the search is made by the server too (the same setting, and a signed-in user whose chat is kept in the cloud): the user's search service key (Tavily or TinyFish; a second key, for the other service, is sent as a backup) is kept encrypted with the other keys, for that reply only, and is never written to logs or error messages. The server writes the search query from the conversation with the model the user chose (with the user's own key, as the browser does), sends it to the search service, and puts the pages it found in front of the request as a "web search packet"; the search depth chosen in Settings is used. The query, the pages found and the answer are written into the cloud workspace like any other reply. If the server restarts while it is searching, the search may be made again. Users who choose their own device in Settings → Privacy, who are not signed in, or whose chat is temporary get the search made in the browser as before.

When a Model Council is held by the server (the same setting, and a signed-in user whose chat is kept in the cloud), the browser sends it the conversation history, the user's message with its attachments, the models the council uses, what each kind of call is to be told (the system instructions, memory and Nouras included), and the API key of every provider those models use (and the search keys, when the council searches). The server asks each model with the user's own key, as the browser does when it holds the council itself: the members answer, in a deliberation they answer again after reading each other, and the synthesizing model writes the answer, which is written into the cloud workspace as it comes. The server also writes down the attachments for the models that cannot read them, reads the pages the message links to, and searches, when the council needs it. The keys are kept encrypted for that council only, are deleted when it ends (or after 2 hours 15 minutes at most), and are never written to logs or error messages, including the messages the providers send back. While the council runs, the answers of the calls that have finished are kept with the run so that a council interrupted by a server restart does not ask those models again (they are deleted when the council ends); the synthesis is made again after a restart, so the synthesizing model's provider may charge for it twice. Each call to a model has a limit of 30 minutes. The request of a finished council is kept with the run's record, as for any reply, until it is removed. Users who choose their own device in Settings → Privacy, who are not signed in, or whose chat is temporary get the council held in the browser as before.

When the user has an OpenRouter key, the text of each message sent (with short excerpts of the last two earlier messages, whether a file is attached, and the names and short descriptions of the command tools the user lets the model use by itself) is also sent from the browser to OpenRouter's Decisions API, where a small judgement model decides whether the message needs a web search, a downloadable file, a chart or a command tool. The user's own OpenRouter key is used for the call; Noureon stores none of it. Messages in image conversations are not sent. If there is no OpenRouter key, or the call fails or takes longer than one second, no judgement is made and the app decides with its own word lists, as before; after two failures in a row the call is not tried again for ten minutes. There is no setting to switch it off.

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

# Privacy

_Last updated: October 10, 2026 (applies from Noureon 18.4.0)_

> This file is made from `src/data/legal/en.js` (`node scripts/generate-privacy-md.mjs`). The same text, in five languages, is published at https://noureon.com/privacy.

This policy explains what data Noureon handles, where it is kept, who receives it, for how long, and what choices you have. It covers the default data flows and the extra ones that appear when you turn on cloud sync, server-side running, memory and other features.

In one sentence: Noureon is "local first" by default, so conversations, settings and keys are kept in your browser; what you send goes to the AI and search providers you choose; only when you sign in to a cloud account, turn on sync or have the server run replies does the data needed get stored on or pass through Noureon's servers. We do not sell personal data and have no built-in advertising or cross-site tracking.

"Local first" does not mean every AI request runs offline: to get an AI reply, your content has to be sent to the model provider.

## 1. Data at a glance

- In your browser: conversations, folders and the archive, settings, Nouras, memories and the local index, API keys, appearance preferences, local account data.
- Sent to AI and search providers: your prompts, conversation context, attachments, system instructions and the model options you choose (section 6).
- In Noureon's cloud (when you sign in and sync): workspace data (conversations, messages, folders, Nouras, memory summaries), uploaded and generated files, an encrypted copy of the sync password, skills and skill packs, the logins and tool settings of connectors, secure credentials (section 4 and section 8).
- Passing through Noureon's server for a while (when you choose server-side running): the history, system instructions and your key that one reply needs, deleted when the reply ends (section 7).
- Third-party infrastructure: Supabase, Cloudflare Turnstile, GitHub, Vercel, PeerJS and others (section 17).

## 2. Who is responsible, and how to contact us

Noureon is operated by its development team. For privacy, account, sync, mail or data questions write to support@noureon.com, without API keys, sync passwords or recovery data. The official X account is @NoureonAi. Whoever hosts Noureon themselves is the data controller of that deployment and has to describe their own practices.

## 3. Data kept in your browser

- By default Noureon keeps conversations and messages, folders and the archive, app settings, Nouras, confirmed personal preferences and memories, the local index and vectors for cross-conversation recall, provider API keys, appearance preferences, generated-image information and the local profile in the browser's storage (IndexedDB and localStorage).
- localStorage also holds a copy of your light/dark choice, so the page has the right theme when it opens.
- The public pages (Help Center, Terms of Use, Privacy Policy, update history) also remember in localStorage the language you chose there; it is sent to no one.
- As a PWA, the service worker caches only the files of the app itself (programs, styles, icons), not your conversations or personal data.
- The connection details of a cloud sign-in (the session) are kept in the browser by Supabase's Auth library.
- Clearing browser data can remove the local workspace; exported files are kept by you.

Noureon uses no advertising or tracking cookies and has no third-party analytics scripts.

## 4. Accounts and cloud sync

- Sign-in methods: Email with a password, or a Google account. Verification and mail are handled by Supabase Auth; for Email sign-in we process your Email and a hash of the password, and for Google sign-in we receive the basic details Google provides (for example Email and display name). We never see your Google password.
- Registration, sign-in, password recovery and the feedback form use Cloudflare Turnstile as a bot check, so Cloudflare sees browser and connection details.
- The mail we send is used only for account access and recovery: confirmation of registration, password reset (a code), the link for a forgotten sync password, and notices that a sign-in method was added or the password changed.
- With cloud sync on, Supabase keeps what is needed for cross-device sync: folders, conversations, messages (with their metadata), Nouras, memories and memory summary records, sync metadata, deletion markers (tombstones), and the files you upload or make (in Supabase Storage).
- The sync password: keys and other sensitive content are first encrypted in the browser with your sync password before they go into the cloud vault; without a sync password, provider API keys are not uploaded. The sync password itself is kept encrypted with a server-side key, for cross-device and Email recovery, and the database holds no plain text. Note that this means recovery of the sync password is carried out with the help of the service; it is not true in every case that only you can unlock it.
- You can choose not to sign in to a cloud account; then none of this data leaves your device (apart from the requests you send to providers).

## 5. The third-party providers you set up

- Providers you can use include Google Gemini, OpenRouter (which passes requests on to the model vendors), NVIDIA API Catalog, and the search services Tavily and TinyFish. Set up only the ones you use.
- These providers handle your data under their own terms and privacy policies, including whether they log it, keep it or use it for training; we do not control this, and we suggest you check each one's settings.
- By default your keys are kept in the browser and the browser calls the provider directly, so the requests do not pass through Noureon's server; the exceptions are when you choose server-side running, and the proxy endpoints of this site (see below).

## 6. What is sent to providers

- When you send a message, the needed prompt content, conversation context, attachments you choose and inputs of generated media, system instructions (including your memories, the Noura in use, and the full text of skills you chose with / or the model loaded) and model options go to the model provider you chose; when a search is needed, the search terms and the addresses you pasted go to the search provider.
- The Model Council, deep research and the visual check send requests of the same kind to each of the models you chose.
- Attachments some models cannot read are first turned into a text packet by the translation model you set, and then handed on to the models that need them.
- You can review the message and attachments before sending; once sent, they are subject to the provider's rules.

## 7. Replies made by Noureon's server

For users signed in to a cloud account, replies are made on Noureon's server by default, so that a reply continues when the page is closed. In Settings → Privacy you can switch to making replies only on your own device.

- What is sent: the browser sends the server the conversation history, system instructions, selected model and provider key (and the search key when search is used) that this one reply needs.
- Keeping keys: keys are kept encrypted, only for that reply, and deleted when it ends; at most 2 hours 15 minutes for an ordinary reply, 30 minutes for image generation, and 27 hours for deep research (which may be paused for up to a day). They are never kept long term, never written to logs or error messages, and error messages sent back by providers are scrubbed of keys first.
- The reply: the server writes the reply into the same cloud workspace the app already syncs.
- Replies that must be finished in the browser (voice input, the camera), users who are not signed in and temporary chats are always made on your device and are not sent to the server.
- Run records: the server keeps a record of each run (without keys), so that a run can be taken up again after a server restart and, once finished, is kept as the request record of that reply until it is removed; the prompt and the reference pictures of an image are deleted from the record when the image ends. Server logs have one line per event and contain no request content, keys or tokens; fields whose names look like secrets are hidden.
- Limits: at most 5 replies at once per person, 10 new ones a minute, requests of up to 25 MB.

## 8. Data flows of each feature

Feature by feature, this is which data passes where.

- Advanced mode (Python): when run by the server, the code the model writes and the files you attached go to Noureon's sandbox server and run in an isolated container with no network and limited resources, which is removed when the reply ends; the files made are saved in your own cloud storage and listed in the reply, up to 500 MB per user, and files no conversation refers to any more are removed automatically after about a day. When run in the browser, the code runs in an isolated page (run.noureon.com) with Pyodide, loaded from jsDelivr.
- Deep research: the plan, notes, pages searched and read, report and progress are saved in your cloud workspace; pages are read by the server on your behalf; searches use the search provider key you set. The PDF, Word or Markdown file is made at the moment you export.
- Web search: when a model cannot search by itself, the server writes the search query from the conversation with the model you chose (with your own key), sends it to your search provider and puts the pages found in front of the request as a "search packet"; the query, the pages and the answer are written into your cloud workspace. If the server restarts, the search may be made again.
- Image generation: when made by the server, the prompt, the options (aspect ratio, size, advanced settings), the reference pictures you attached and the OpenRouter key go to the server over HTTPS; the server asks OpenRouter's image endpoint for the image with your key and keeps the picture in your own cloud space. The prompt and reference pictures are kept with the run's record (without the key) until the image ends. No preview pictures are made. If the server restarts midway, the request may be sent again and your OpenRouter account may be charged twice.
- Model Council: when held by the server, the browser sends the history, your message and attachments, the members and synthesizing model, what each kind of call is to be told (including system instructions, memory and Nouras) and the provider keys used (and the search keys when it searches). The server asks each model with your key; what finished members answered is kept with the run so that a restart does not ask again, and deleted when the council ends; the synthesis is made again after a restart, so the synthesizing model's provider may charge twice. Each model call takes at most 30 minutes.
- Visual check: when automatic check is on and a reply writes a deck, the server draws the slides as pictures, shows them to the model you chose with your own key, and writes any corrected reply into the conversation; the pictures are not kept.
- The judgement model: with an OpenRouter key, the text of each message (with short excerpts of the previous two messages, whether a file is attached, and the names and descriptions of the command tools you let the model use by itself) is sent from the browser to OpenRouter's Decisions API, where a small judgement model decides whether the message needs a web search, a downloadable file, a chart or a command tool. Your own OpenRouter key is used and Noureon keeps none of it; image conversations are not sent. With no key, a failed call or a call over one second, the app decides with its own word lists; after two failures in a row it is not tried again for ten minutes. There is no separate switch for it, and choosing "only on my device" does not turn it off, because the call is made by the browser.
- Skills: the skills you paste are kept in your own cloud account (only you can read and change them; the server reads them with its service role); a zip skill pack is kept in a private bucket in a folder only you can read and change, and its file list in the skill's row. When you choose a skill with /, or the model decides to load one, the full text goes with the message to the provider you chose (and through the server when the server makes the reply, which reads only the one used). When the model reads a text file of a skill (at most 20,000 characters, at most 10 files in a reply), the content goes to the provider the same way. A skill that was neither asked for nor loaded is not sent. When you delete a skill it is deleted with its zip; a zip that no skill points to any more is removed by the server's daily clean-up.
- Command tools: the list of tools you added is kept in your settings (and synced with them). A tool runs only in an isolated container on the sandbox server; the command the model writes and the files of the conversation are handled as above; the tool's program is downloaded by the sandbox host from its official release (GitHub) and checked against a hash. The Extensions page loads each project's icon from GitHub, so GitHub sees that request.
- Website connections: when a tool needs the internet (to download a video, to read a social network, to install its own Python package) it can reach it only through the sandbox host's filtering proxy. The proxy decides by your rules in Settings → Permissions (allow, ask or refuse; pypi.org, files.pythonhosted.org, registry.npmjs.org, github.com and two GitHub file hosts are allowed at first); a site with no rule is asked about in the conversation, and no answer in 10 minutes counts as a refusal. The proxy opens only ports 80 and 443, looks up the site itself and refuses every address inside the server (the machine itself, private and pod networks, link-local and metadata addresses and its own public address), whatever the rules say. It sees the site name and the port, never the page or what is sent, and logs the site name and port with the decision (no page address, no content). Your rules are kept in your settings (and synced with them).
- Secure credentials: a credential you add for a tool (for example the login cookie of an account) is kept encrypted with AES-256-GCM on the server, under a master key that lives only in the server's environment and bound to you and the credential's name, in a table only the server can read. It is put in the environment of the tool (or in the login file the tool would save itself, for one command only) only while your own tool runs; what the command prints is scrubbed of the credential before the model or the page sees it, and the model never receives the value. You can look at, replace or delete it in Settings → Permissions; it is deleted when you delete it or the account.
- Connectors: when you connect one (for now Notion, Linear, Context7, Upstash, Vercel and GitHub), you log in on the service's own page (Noureon never sees your password); the server keeps the access token and the refresh token encrypted with AES-256-GCM under a master key that lives only in the server's environment, bound to you and the connector, in a table only the server can read, and never gives them to the browser or the model. The server also keeps the list of the service's tools and what you let each tool do (allow, ask or refuse). Connectors work only in replies the server makes, not in temporary chats. When the model uses a tool, the server calls the service with your token and sends what the service returns (for example the content of a page or an issue) to the model provider you chose, as part of the conversation; a tool you set to ask shows its exact inputs in a card first. A reply makes at most 30 calls to services, and a result is cut at 30,000 characters. Disconnecting revokes the token at the service where it offers that and deletes everything kept here; GitHub offers no revocation, so to cancel the authorisation there, remove Noureon under Settings → Applications at GitHub. The Extensions page, the confirmation card and the settings load the logo of each connector from GitHub, so GitHub sees that request.
- Icons and names of cited sources: beside a source in an answer the site's small icon and name are shown. Noureon's server fetches these (reading the site's own page markup, public sites only, with a size and time limit and every redirect checked), so the sites you looked at stay between you and Noureon's server and no third-party icon service is asked.
- Feedback and Noura proposals: these forms are optional and send only the fields you fill in, only through this site's same-origin proxy (/api/google-form-submit, which requires a Turnstile check); if the operator has not set a receiving endpoint the proxy forwards nothing. What is sent goes to the Google Form the operator set up.

## 9. Memory and cross-conversation recall

- Automatic memory: when on, the browser uses your Gemini key to turn the last turns of a conversation, topics and the attachments you provided into summaries and possible personal preferences (with a light Gemini model); the summaries and confirmed memories are kept in your workspace, and when you sign in and sync, memories and summary records are synced to the cloud. You can look at, replace or delete each at any time, and turning automatic memory off only stops new memories.
- Cross-conversation recall: needs your explicit consent. Once given, each question is sent to Gemini Embedding 2 for a vector and a local index on this device finds up to three relevant summaries, which become part of the request sent to the model provider you chose. The state of consent follows the account to all devices, but vectors and the index are not synced: each device builds its own. Without consent, earlier conversations are not searched or sent and Embedding is not called.
- Attachment memory: pictures, video, audio and documents may be summarized into key points through Gemini's file feature when memory is built.
- You can switch these features on or off in Settings, check or optimize the index, and export the confirmed personal preferences.

## 10. Voice input, camera and microphone

- Voice input is turned into text by your browser, which may pass the audio to your operating system or an online speech service; Noureon keeps no separate recording, and the waveform is drawn live on your device. An explanation is shown, and your agreement asked for, before the first use.
- The camera and the microphone are used only after you press the matching button and agree to the browser's permission prompt; a photo you take is the attachment you add and is handled under the rules for attachments.

## 11. Peer-to-peer transfer

Peer-to-peer transfer between devices uses PeerJS: its public pairing server (0.peerjs.com) only lets two devices find each other, with an 8-character code, or a QR code. Once connected, the items you chose (for example conversations, Nouras, settings) go straight between the two devices and neither pass through nor are stored on Noureon's servers. Pair only with devices you trust, and check which items you are about to send.

## 12. Logs, security and rate limits

- Our server logs have one line per event and hold only fields chosen one by one; they hold no request content, keys or tokens, and fields whose names look like secrets are hidden.
- For safety and stability the server has rate limits, counted per account and kept only in the server's memory.
- All traffic to Noureon's servers uses HTTPS; keys and credentials on the server are stored encrypted.
- The website has a content security policy (CSP) limiting where the page may load from and connect to.
- The sandbox has limits on memory and CPU, and the container is removed when the reply ends.

## 13. Analytics, advertising and tracking

Noureon has no built-in analytics, advertising tracking or cross-site tracking scripts, and does not sell personal data. The home page before sign-in and the public pages (Terms of Use, Privacy Policy, update history) have no analytics scripts either. The providers that host the website and the servers handle connection details (for example IP addresses and request records) to deliver pages and keep the service running. Anyone who hosts Noureon themselves and adds analytics has to describe it separately.

## 14. How long data is kept, and deletion

- Data in the browser: until you delete it or clear browser data.
- The cloud workspace: until you delete it or delete the account; when you are signed in and syncing, deletion and restoration sync to the cloud (with deletion markers). Items in the trash can be restored or deleted for good.
- Keys kept temporarily on the server: at most 2 hours 15 minutes for an ordinary reply, 30 minutes for an image, 27 hours for deep research; usually deleted when the reply ends.
- Sandbox containers and what is in memory: deleted when the reply ends.
- Cloud files: files that no conversation refers to are removed automatically after about a day; a skill's zip is deleted with the skill, and a zip no skill points to is removed by the daily clean-up.
- Secure credentials: until you delete them or delete the account.
- Connector logins: until you disconnect (the token is then revoked at the service where it offers that, and deleted here) or delete the account.
- Server logs: only event records without content, kept as operations require. Run records (without keys) are kept until they are removed; the prompt and reference pictures of an image are deleted when the image ends.
- Mail sent to support: kept to deal with your question and, where needed, deleted at your request.

## 15. Your choices and rights

- Do not sign in to a cloud account, and no workspace data leaves your device (apart from the requests you send to providers).
- In Settings → Privacy choose to make replies only on your own device, and the history and keys are not sent to our servers.
- Turn off automatic memory and cross-conversation recall to stop those data flows.
- Export, import, delete, restore or permanently delete your data at any time; use "Clear all records and data" to empty this browser.
- Look at, replace or delete your secure credentials, connectors, skills and website rules.
- To obtain, correct or delete the data of your cloud account, write to support@noureon.com from the Email you registered with; we will reply within a reasonable time. Depending on the law where you live you may also have rights of access, correction, erasure, restriction, portability and objection; write to us to exercise them.

## 16. Children and international transfer

- Noureon is not a service designed for children. The providers you use also have age rules; follow them.
- The providers you choose and the infrastructure we use may be in different countries, so data may be processed outside where you live.

## 17. Third-party services at a glance

- Supabase: account verification, database and file storage (for cloud sync and server-side running).
- Cloudflare: the Turnstile bot check.
- Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish: the model and search providers you set up.
- GitHub: downloads and icons of command tools, and the source code.
- Notion, Linear, Context7, Upstash, Vercel, GitHub: the services you connect as connectors, when you connect them (each has its own terms and privacy policy).
- Vercel: web hosting and delivery.
- jsDelivr: loading of Python in the browser (Pyodide).
- PeerJS: the pairing server of peer-to-peer transfer.
- Google Forms: feedback and Noura proposals (when the operator sets it up).
- An email delivery service: account verification and recovery mail.
- Your browser and operating system: speech recognition.

Each of these services has its own privacy policy.

## 18. Hosting it yourself

When you host Noureon yourself, never commit real provider keys, SMTP credentials, Resend keys, Supabase service keys, Google Apps Script URLs or other secrets to the repository; use environment variables for server-side settings, and keep provider keys in the local settings unless you have a separate encrypted secret-management plan. If the deployment adds analytics, its owner has to describe it separately.

## 19. Changes to this policy

We may change this policy as features change. The new version is published on this page with the date at the top updated, and important changes are also written in the update history (noureon.com/updates). PRIVACY.md on GitHub is updated with it.

## 20. Contact us

For privacy, account, sync, mail or data questions: support@noureon.com. Please do not attach API keys, sync passwords or recovery data.

# `src/app/runtime/` — the chat page, by area

`shell/shell.js` is the composition root of the signed-in page: it creates the stores (settings, workspace, the active conversation),
the small stores the parts share (`shell/shell-state.js`: who is signed in, the files waiting to be sent, the reply being made, the
batch selection, the quoted text, the sidebar; each changed only through its named functions), and every feature, and wires them
together, up to the start of the page. Production boots it through `src/app/runtime-entry.js`, which only imports it and calls
`startPage()`. Each feature is made with what it uses, not handed through another module; a part made before a function it needs gets
a closure over that function (called only once the page runs), never a name to look up: `npm run check:shell` fails on
`resolveBinding` / `registerLazyBinding`. No library is read from `globalThis` (only KaTeX, by its loader in `../vendors/`).

| Folder | What is in it |
| --- | --- |
| `shell/` | `shell.js` and what it makes directly: `shell-state.js`, `conversation-actions.js`, `workspace-load.js`, `workspace-features.js` (search, uploads, import/export, voice, the memory and its dashboard), `page-features.js` (theme, store, language, scrolling, update notice, trash), the sidebar, the model request runtime and the sending of a message (`submit-input-*.js`, its own chunk) |
| `settings/` | The settings dialog, sign-in and sign-out (`settings-auth-provider-lifecycle.js` and its `settings-*` parts; the heavier ones load with the dialog) |
| `reply/` | The reply of one model and its stages (`single-model-reply-*.js`), streaming and its rendering, search packets, provider request formats |
| `council/` | The multi-model council: the model picker (`council-controls-*.js`), the members, the synthesis and their rendering |
| `messages/` | Drawing messages and conversations, attachments and their previews, editing a message, quoting |
| `images/` | Image generation, generated pictures and the image editor |
| `features/` | The other features of the page, one per module (`create…Lifecycle(deps)` factories): start of the page, trash, store, folders, P2P sharing… |
| `kernel/` | The stores and the access objects the features receive: config, workspace data, conversation state, DOM, dialogs, rendering |

Every module is a factory or plain functions that receive what they need; nothing here starts on its own except through `startPage()`.
The size budgets of the large files are in `scripts/check-file-sizes.mjs`.

Where new code goes: a new feature is its own module (in the folder of its area, or `src/app/ui/` for something drawn) with one line of
registration in `shell.js`, not code added to the large lifecycles. The old `virtual:legacy-app-runtime` concatenation and its
`fragments/` are gone; `src/templates/fragments/` (the markup of the page) is unrelated.

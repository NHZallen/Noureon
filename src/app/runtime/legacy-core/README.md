# `src/app/runtime/legacy-core/` — the application shell of the chat page

`legacy-core.js` is the composition root of the signed-in page: it creates the stores (settings, workspace, the active conversation),
the shared shell state (`shell-state.js`), and every lifecycle, and wires them together. Production boots it through
`src/app/runtime-entry.js`, which makes the core tail from `coreTailDependencies` and connects it and the app start back with
`connectCoreTail()` and `connectRuntimeEntry()`. A part made before a function it needs gets a closure over that function (called
only once the page runs), never a name to look up: `npm run check:legacy-runtime` fails on `resolveBinding` / `registerLazyBinding`.

The other modules here are the lifecycles the shell creates and the parts they were split into (NOU-75):

| Lifecycle | Its parts |
| --- | --- |
| `legacy-core.js` | `shell-state.js`, `conversation-actions.js`, `workspace-load.js`, `council-validation.js` (and `../security/password-records.js`) |
| `submit-input-council-lifecycle.js` (sending a message, ships in its own chunk) | `submit-input-composer.js`, `submit-input-playback.js`, `submit-input-image-reveal.js`, `submit-input-reply-services.js` |
| `settings-auth-provider-lifecycle.js` (settings, sign-in, asking a model) | `model-request-runtime.js`, `settings-modal-lifecycle.js`, `settings-dialog-parts.js` (loaded with the dialog), the `settings-*-controls.js` / `settings-*-helper.js` modules |
| `settings-sync-vault-controls.js` (the user page, loaded with the dialog) | `settings-user-section-markup.js`, `settings-account-linking-actions.js`, `settings-sync-vault-actions.js` |
| `transition-bus-lifecycle.js` (search, uploads, import/export, voice, the dashboard) | `../memory/memory-runtime.js` and the lifecycles it creates |
| `core-tail-lifecycle.js` (store, language, scrolling, update notice, trash, start) | modules in `../features/` |

How it differs from `src/app/legacy-runtime/`: this folder is the shell and its lifecycles; `legacy-runtime/` holds the features and
access objects they use. The size budgets of the large files are in `scripts/check-file-sizes.mjs`; tests that read a lifecycle as text
read it with its parts (`readUiSource` in `tests/helpers/source-guards.js`).

Where new code goes: a new feature is its own module (in `../features/` or `src/app/ui/`) with one line of registration here, not code
added to these lifecycles.

# `src/app/legacy-runtime/` — the parts the old runtime was cut into

This folder holds what was cut out of the old single-file runtime (2026-06 to 2026-10): self-contained features and helpers that the
application shell in `src/app/runtime/legacy-core/` puts together. Nothing here starts on its own; every module is a factory or plain
functions that receive what they need.

| Folder | What is in it |
| --- | --- |
| `features/` | One feature per module, usually a `create…Lifecycle(deps)` factory: rendering messages and conversations, the reply of one model and its stages (`single-model-reply-*.js`), the council (`council-*.js`, the model picker `council-controls-*.js`), media previews, editing a message, the model switcher… |
| `runtime/` | The small access objects the shell hands to the features: config, conversation state, DOM, dialog and render coordinators. (Parts made at different times are connected by parameters and named exports, not by a runtime context: NOU-76.) |
| `data/` | Static data of the old runtime (folder icons and colours). |

How it differs from `src/app/runtime/legacy-core/`: that folder is the shell (it creates the stores and the lifecycles and wires them
together); this one is what the shell wires. A module here never imports `legacy-core.js`.

Where new code goes: a new feature of the chat page is written as its own module under `src/app/runtime/features/` (or `src/app/ui/`
for something drawn), and registered in the shell with one line. This folder takes only fixes of what is here and further splits of its
large modules. The old `virtual:legacy-app-runtime` concatenation and `fragments/` are gone; `src/templates/fragments/` (the markup of
the page) is unrelated.

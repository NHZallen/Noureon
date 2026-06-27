# V5 Runtime Contracts

This document is the Phase 2 ownership map for the string bindings still carried
by `legacyRuntimeContext`. It describes the current production graph; it does not
authorize new bindings or change runtime behavior.

## Current Production Runtime Graph

```text
src/main.js
-> src/app/legacy-app.js
-> src/app/runtime-entry.js
-> dynamic import ./runtime/legacy-core/legacy-core.js
-> legacy-core.js creates and exports legacyRuntimeContext
-> runtime-entry resolves runtime.entryDependencies
-> runtime-entry composes core-tail, app-bootstrap, and startup lifecycles
-> runtime-entry registers app, startup, and coreTail.* handoff bindings
```

`legacy-core.js`, `core-tail-lifecycle.js`, and `transition-bus-lifecycle.js`
register the compatibility-side dependencies before `runtime-entry.js` consumes
them. Runtime entry then registers the functions owned by the real startup and
core-tail lifecycle modules for compatibility consumers that have not yet moved
to explicit imports or injected facades.

## Current Context Ownership

`legacyRuntimeContext` owns only the lazy binding registry contract:

- unique binding-name registration;
- lazy retrieval of the latest registered function or dependency object;
- required resolution through `resolveBinding`;
- optional resolution through `resolveOptionalBinding`;
- duplicate-registration rejection.

It does not own application data, configuration, conversations, DOM state, or
the business behavior behind a binding. Those remain owned by the module named
in the inventory below.

## Binding Inventory

The inventory contains 48 unique production binding names. The explicit
allowlist in `tests/structure/runtime-contracts.test.js` and this table must be
updated together in the same reviewed slice. The test also expands the dynamic
`coreTail.${name}` family from `CORE_TAIL_BINDING_NAMES`, so a new dynamic name
cannot bypass classification.

<!-- runtime-contract-inventory:start -->
| Binding name | Registration location | Resolver location | Category | Owner | Consumer | Retirement plan | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `app.initChatApp` | `runtime-entry.js::registerRuntimeEntryBindings` | `batch-import-voice-lifecycle.js`; `settings-auth-actions-helper.js` | `startup/bootstrap` | `app-bootstrap-lifecycle.js` | auth and auth-import handoffs | Inject the bootstrap action directly after startup composition is separated from legacy core. | high |
| `input.updateFunctionButtonsState` | `legacy-core.js` | `legacy-core.js` | `input` | `submit-input-council-lifecycle.js` | legacy input mode transitions | Replace with an explicit input-controls facade during Phase 3 shell reduction. | medium |
| `input.updateInputState` | `legacy-core.js` | `legacy-core.js`; sidebar, submit, transition, and core-tail lifecycles | `input` | `settings-update-input-state-helper.js` via `settings-auth-provider-lifecycle.js` | input, sidebar, language, council, and startup transitions | Inject the stable input-state updater into consumers, then retire the registry name. | high |
| `runtime.coreTailDependencies` | `transition-bus-lifecycle.js` | `runtime-entry.js` | `core tail` | `transition-bus-lifecycle.js` | runtime-entry core-tail composition | Replace the dependency bundle with explicit Phase 4 core-tail module contracts. | high |
| `runtime.entryDependencies` | `core-tail-lifecycle.js` | `runtime-entry.js` | `runtime entry` | `core-tail-lifecycle.js` | app-bootstrap and startup composition | Move dependency assembly to a stable runtime composition module, then remove this bundle binding. | high |
| `runtimeEntry.submit.adjustTextareaHeight` | `runtime-entry.js::registerRuntimeEntryBindings` | `legacy-core.js` | `runtime entry` | `startup-lifecycle.js` | legacy submit alias | Inject startup textarea sizing into the submit owner and remove the reverse runtime-entry handoff. | medium |
| `settings.setupSettingsModal` | `legacy-core.js` | `batch-import-voice-lifecycle.js`; `core-tail-lifecycle.js` | `settings` | `settings-auth-provider-lifecycle.js` | bootstrap and settings setup handoffs | Expose a settings setup facade and inject it into bootstrap consumers after modal setup ownership is stable. | high |
| `sidebar.toggleSidebar` | `transition-bus-lifecycle.js` | `legacy-core.js`; sidebar lifecycle | `sidebar` | `search-upload-sidebar-lifecycle.js` | sidebar render and Astra interactions | Inject a sidebar controller into callers during Phase 3, then ban this binding name. | medium |
| `submit.adjustTextareaHeight` | `legacy-core.js` | submit and core-tail lifecycles | `transitional-only` | legacy alias over `startup-lifecycle.js` | submit form and bootstrap compatibility paths | Retire first by routing consumers to the runtime-entry startup contract directly. | medium |
| `submit.generateTitleAndSummary` | `legacy-core.js` | `submit-input-council-lifecycle.js` | `submit` | `settings-auth-provider-lifecycle.js` and title-summary helpers | submit completion flow | Move title-summary orchestration behind an explicit submit dependency. | medium |
| `submit.renderFilePreviews` | `legacy-core.js` | `submit-input-council-lifecycle.js` | `submit` | `search-upload-sidebar-lifecycle.js` | upload and submit UI | Inject the upload preview renderer into submit composition. | medium |
| `submit.shouldPerformWebSearch` | `legacy-core.js` | `submit-input-council-lifecycle.js` | `submit` | `settings-provider-structured-helpers.js` | submit routing | Inject the provider/search policy into the submit lifecycle. | high |
| `submit.updateSubmitButtonState` | `legacy-core.js` | `submit-input-council-lifecycle.js` | `submit` | `settings-auth-provider-lifecycle.js` | streaming and council submit paths | Move button-state ownership to an explicit input/submit controls facade. | medium |
| `coreTail.setupTimeAnalysis` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | transition-bus analytics callers | Extract an analytics lifecycle and inject it directly in Phase 4. | low |
| `coreTail.updateTimeDistributionChart` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | transition-bus analytics callers | Extract an analytics lifecycle and inject it directly in Phase 4. | low |
| `coreTail.getDominantColorPalette` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | appearance and image callers | Move to an explicit appearance/image dependency. | medium |
| `coreTail.applyUiTheme` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | settings and startup appearance callers | Extract appearance application and inject it directly. | high |
| `coreTail.renderUiColorOptions` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | settings appearance callers | Move to the appearance/settings composition boundary. | medium |
| `coreTail.analyzeImageBrightness` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | wallpaper and image callers | Move to an explicit appearance/image dependency. | medium |
| `coreTail.applyCustomWallpaper` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | startup and wallpaper callers | Extract wallpaper lifecycle and inject it directly. | medium |
| `coreTail.handleWallpaperUpload` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | settings wallpaper UI | Extract wallpaper lifecycle and inject it directly. | medium |
| `coreTail.handleConfirmCrop` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | wallpaper crop UI | Extract wallpaper lifecycle and inject it directly. | medium |
| `coreTail.restoreDefaultWallpaper` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | settings wallpaper UI | Extract wallpaper lifecycle and inject it directly. | medium |
| `coreTail.openStore` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | store UI | Extract store lifecycle and inject it directly. | medium |
| `coreTail.closeStore` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | store UI | Extract store lifecycle and inject it directly. | medium |
| `coreTail.renderStore` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | store UI | Extract store lifecycle and inject it directly. | medium |
| `coreTail.handleSubscription` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | store subscription UI | Extract store lifecycle with focused behavior coverage before direct injection. | high |
| `coreTail.openAvatarEditor` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | profile avatar UI | Extract avatar lifecycle and inject it directly. | medium |
| `coreTail.handleAvatarUpload` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | profile avatar UI | Extract avatar lifecycle and inject it directly. | medium |
| `coreTail.handleConfirmAvatarCrop` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | profile avatar UI | Extract avatar lifecycle and inject it directly. | medium |
| `coreTail.applyLanguage` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | startup and settings localization | Inject a localization applicator after input-state coupling is removed. | high |
| `coreTail.showMobileContextMenu` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | conversation sidebar mobile menu | Move into an explicit sidebar menu lifecycle. | medium |
| `coreTail.showMobileContextMenuForFolder` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | folder sidebar mobile menu | Move into an explicit sidebar menu lifecycle. | medium |
| `coreTail.showMobileContextMenuForAstras` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | Astra sidebar mobile menu | Move into an explicit sidebar menu lifecycle. | medium |
| `coreTail.setupScrollToBottomButton` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | bootstrap chat viewport setup | Move to a focused chat viewport setup module. | low |
| `coreTail.showUpdateHistory` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | update-history UI | Move to an update lifecycle dependency. | low |
| `coreTail.checkAndShowLatestUpdate` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | startup postlude | Move to an update lifecycle dependency after startup tests cover the handoff. | medium |
| `coreTail.setupMessageIntersectionObserver` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | bootstrap message rendering | Move to a chat viewport/render observer module. | medium |
| `coreTail.renderTrash` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | trash UI | Inject the existing trash lifecycle through an explicit facade. | high |
| `coreTail.handleRestoreTrashItem` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | trash restore flow | Inject the existing trash lifecycle after destructive-flow guards remain green. | high |
| `coreTail.handleDeleteTrashItemPermanently` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | permanent delete flow | Inject the existing trash lifecycle after destructive-flow guards remain green. | high |
| `coreTail.showTrashItemInViewModal` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | trash preview UI | Inject the existing trash lifecycle through an explicit facade. | medium |
| `coreTail.toggleTrashSelectionMode` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | trash selection UI | Inject the existing trash lifecycle through an explicit facade. | medium |
| `coreTail.renderTrashBatchActionBar` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | trash batch UI | Inject the existing trash lifecycle through an explicit facade. | medium |
| `coreTail.handleBatchRestoreFromTrash` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | batch restore flow | Inject the existing trash lifecycle after destructive-flow guards remain green. | high |
| `coreTail.handleBatchDeleteFromTrash` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | batch permanent delete flow | Inject the existing trash lifecycle after destructive-flow guards remain green. | high |
| `coreTail.handleEmptyTrash` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | empty-trash flow | Inject the existing trash lifecycle after destructive-flow guards remain green. | high |
| `coreTail.updateDisplayedVersion` | `runtime-entry.js::registerCoreTailBindings` | `transition-bus-lifecycle.js::resolveCoreTailFunction` | `core tail` | `core-tail-lifecycle.js` | bootstrap version display | Move to startup/update lifecycle composition. | low |
<!-- runtime-contract-inventory:end -->

## Category Classification

- `settings`: settings modal setup contracts.
- `input`: composer and function-button state contracts.
- `submit`: submit, title, search-policy, and upload-preview contracts.
- `sidebar`: sidebar visibility/controller contracts.
- `runtime entry`: dependency bundles and reverse handoffs owned by runtime entry.
- `core tail`: the core-tail dependency bundle and the `coreTail.*` function family.
- `startup/bootstrap`: application initialization handoffs.
- `transitional-only`: aliases that exist only to bridge two already-real modules.

## Retired Paths That Must Stay Retired

- `virtual:legacy-app-runtime`
- the Vite virtual runtime concat plugin and its retired plugin symbols
- `src/app/legacy-runtime/fragments/*.fragment.js`

The primary retired-path enforcement remains
`npm.cmd run check:legacy-runtime`; the focused contract test complements it.

## Rules For Adding Or Retiring Bindings

1. Do not add an ad-hoc binding string without a named owner and consumer.
2. Add every new binding to this inventory and the test allowlist in the same
   slice, including category, registration, resolver, retirement plan, and risk.
3. Prefer explicit imports or dependency injection when both sides are already
   real modules; a new binding needs a written compatibility reason.
4. Dynamic binding families require a finite source list that the structure test
   can expand. Arbitrary runtime-generated names are not allowed.
5. When a binding is retired, remove it from the inventory and allowlist and add
   a focused guard that prevents the retired name from returning.
6. Keep behavior/security tests for the receiving owner before removing a bridge.

## Candidate Retirement Order

1. Retire `submit.adjustTextareaHeight`, the transitional alias over the existing
   runtime-entry startup binding.
2. Replace `runtimeEntry.submit.adjustTextareaHeight` and `app.initChatApp` with
   explicit startup/bootstrap dependencies where their consumers are isolated.
3. Move settings and input bindings behind stable injected facades during Phase
   3 legacy-core shell reduction.
4. Replace submit and sidebar bindings with explicit lifecycle dependencies.
5. Move `runtime.entryDependencies` assembly out of core tail and replace
   `runtime.coreTailDependencies` with normal runtime composition.
6. Split the `coreTail.*` family by appearance, analytics, store/avatar, sidebar,
   viewport/update, and trash ownership during Phase 4.
7. Retire the registry only after no documented production binding remains.

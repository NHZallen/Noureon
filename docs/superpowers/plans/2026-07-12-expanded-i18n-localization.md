# Expanded i18n Localization Implementation Plan

> Superseded for Arabic support by `2026-07-12-remove-arabic-localization.md`. The current supported locale set is `zh-TW`, `en`, `fr`, `ru`, and `es`; Arabic and its RTL implementation have been removed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete, idiomatic Russian, Spanish, and Arabic UI localization, six-language AI reply selection, and a correctly mirrored Arabic RTL experience.

**Architecture:** Keep one plain-object locale module per language and register all locales through `src/data/i18n/index.js`. Extend the existing static selectors and locale-aware runtime boundaries, while centralizing document language/direction behavior in `applyLanguage`; use narrowly scoped RTL CSS for components that do not mirror naturally.

**Tech Stack:** JavaScript ES modules, static HTML fragments, CSS, Node.js test runner, Vite

## Global Constraints

- Locale order is exactly `zh-TW`, `en`, `fr`, `ru`, `es`, `ar` everywhere.
- Russian is idiomatic contemporary Russian, Spanish is neutral international Spanish, and Arabic is natural Modern Standard Arabic.
- Every new locale has the same translation keys as the reference locale, with non-empty localized strings.
- Arabic sets `lang="ar" dir="rtl"`; all other supported languages set their own `lang` and `dir="ltr"`.
- AI reply language uses the same six codes and persists through the existing `aiDefaultLanguage` field.
- Existing language codes, saved data, exports, fallbacks, and product proper nouns remain compatible.
- No new dependencies or schema migrations.

---

### Task 1: Locale modules and registration

**Files:**
- Create: `src/data/i18n/ru.js`
- Create: `src/data/i18n/es.js`
- Create: `src/data/i18n/ar.js`
- Modify: `src/data/i18n/index.js`
- Modify: `tests/data-modules-compatibility.test.js`
- Create: `tests/i18n-locales.test.js`

**Interfaces:**
- Consumes: the complete key set exported by `src/data/i18n/en.js`.
- Produces: default exports `ru`, `es`, and `ar`; `i18n` registered in exact six-language order.

- [x] **Step 1: Write failing registration and parity tests**

Assert `Object.keys(i18n)` equals `['zh-TW', 'en', 'fr', 'ru', 'es', 'ar']`. For each new locale, recursively compare its object key paths and value types with English, require every leaf to be a non-empty string, and assert representative native copy including `settings`, `uiLanguage`, `aiReplyLanguage`, `save`, `cancel`, `errorPrefix`, `welcome`, and `passwordRecoveryTitle` is not identical to English.

- [x] **Step 2: Run tests and verify RED**

Run: `node --test tests/data-modules-compatibility.test.js tests/i18n-locales.test.js`

Expected: FAIL because `ru`, `es`, and `ar` modules and registrations do not exist.

- [x] **Step 3: Create complete localized modules**

Copy the full object structure of `en.js` into each new module, rename the binding to `ru`, `es`, or `ar`, translate every user-facing string idiomatically, preserve interpolation tokens, HTML fragments, product names, and data placeholders exactly, then export the locale as default. Register imports and object entries in exact required order.

- [x] **Step 4: Run parity tests and verify GREEN**

Run: `node --test tests/data-modules-compatibility.test.js tests/i18n-locales.test.js`

Expected: all registration, parity, leaf-value, and representative-copy tests pass.

### Task 2: Six-language UI and AI selectors

**Files:**
- Modify: `src/templates/fragments/00-shell.fragment.js`
- Modify: `src/templates/fragments/02-shell.fragment.js`
- Modify: `src/app/runtime/legacy-core/core-tail-lifecycle.js`
- Modify: `tests/i18n-locales.test.js`

**Interfaces:**
- Consumes: locale codes and `languageNameZhTW`, `languageNameEn`, `languageNameFr`, `languageNameRu`, `languageNameEs`, `languageNameAr` strings.
- Produces: login, UI, and AI reply selectors in identical six-language order; localized AI option labels.

- [x] **Step 1: Add failing source-order tests**

Extract the login menu, `#ui-language-select`, and `#ai-language-select` regions and assert each contains `zh-TW`, `en`, `fr`, `ru`, `es`, `ar` in that exact order with no duplicates. Assert `replyLanguageLabels` maps all six values.

- [x] **Step 2: Run the selector test and verify RED**

Run: `node --test tests/i18n-locales.test.js`

Expected: FAIL on missing `ru`, `es`, and `ar` options and reply labels.

- [x] **Step 3: Extend all selector markup and reply labels**

Add `Русский`, `Español`, and `العربية` after French in the login, UI, and AI menus. Extend `replyLanguageLabels` with the three matching translation keys without changing persistence logic.

- [x] **Step 4: Run selector and persistence tests**

Run: `node --test tests/i18n-locales.test.js tests/runtime-settings-save-settings-helper.test.js tests/runtime-config-persistence.test.js`

Expected: all tests pass and the existing settings persistence still records arbitrary supported string codes.

### Task 3: Arabic direction and RTL layout

**Files:**
- Modify: `src/app/runtime/legacy-core/core-tail-lifecycle.js`
- Modify: `src/styles/regression-overrides.css`
- Modify: `tests/runtime-core-tail-lifecycle.test.js`
- Modify: `tests/i18n-locales.test.js`

**Interfaces:**
- Consumes: `applyLanguage(lang)` and document root.
- Produces: root `lang` matching the selected locale and root `dir` equal to `rtl` only for `ar`.

- [x] **Step 1: Write failing direction tests**

Exercise or source-assert `applyLanguage('ar')` setting `document.documentElement.lang = 'ar'` and `.dir = 'rtl'`, then `applyLanguage('es')` restoring `lang = 'es'` and `dir = 'ltr'`. Require `[dir="rtl"]` rules for shell/sidebar/settings/popover alignment and `direction: ltr` safeguards for `pre`, `code`, URLs, email inputs, and chart roots.

- [x] **Step 2: Run direction tests and verify RED**

Run: `node --test tests/runtime-core-tail-lifecycle.test.js tests/i18n-locales.test.js`

Expected: FAIL because document direction and RTL CSS are absent.

- [x] **Step 3: Implement root direction and scoped RTL CSS**

At the start of `applyLanguage`, set root `lang` to the resolved supported language and root `dir` to `rtl` for Arabic or `ltr` otherwise. Add scoped RTL rules that mirror sidebars, settings navigation borders, popover anchoring, row text alignment, directional margins, and chevrons while keeping technical content explicitly LTR.

- [x] **Step 4: Run direction and UI regression tests**

Run: `node --test tests/runtime-core-tail-lifecycle.test.js tests/i18n-locales.test.js tests/ui/settings-regressions.test.js tests/ui/sidebar-regressions.test.js`

Expected: all tests pass.

### Task 4: Password recovery and dynamic locale helpers

**Files:**
- Modify: `src/app/auth/password-recovery-page.js`
- Modify: `src/app/runtime/legacy-core/council-runtime-texts.js`
- Modify: `src/app/runtime/legacy-core/submit-input-council-lifecycle.js`
- Modify: `src/app/runtime/legacy-core/model-registry.js`
- Modify: `tests/password-recovery-page.test.js`
- Modify: `tests/runtime-council-runtime-texts.test.js`
- Modify: `tests/runtime-submit-input-council-lifecycle.test.js`
- Modify: `tests/runtime-model-registry.test.js`

**Interfaces:**
- Consumes: locale codes `ru`, `es`, `ar`.
- Produces: localized recovery UI, council labels, reasoning labels, and dynamic mode names.

- [x] **Step 1: Write failing behavior tests**

Assert browser-language normalization recognizes `ru-*`, `es-*`, and `ar-*`; recovery language labels use the required order; recovery root uses RTL for Arabic; council/reasoning helpers return representative native labels for every new language instead of English or Chinese fallbacks.

- [x] **Step 2: Run focused helper tests and verify RED**

Run: `node --test tests/password-recovery-page.test.js tests/runtime-council-runtime-texts.test.js tests/runtime-submit-input-council-lifecycle.test.js tests/runtime-model-registry.test.js`

Expected: FAIL for unsupported locale codes and fallback copy.

- [x] **Step 3: Add localized branches and recovery support**

Extend supported locale sets, normalization, ordered labels, recovery messages, council text objects, mode prefixes, and reasoning effort labels for Russian, Spanish, and Arabic. Reuse locale strings from i18n where the runtime boundary already receives i18n; keep isolated pure helpers as local constant maps.

- [x] **Step 4: Run focused helper tests and verify GREEN**

Run the same command as Step 2.

Expected: all focused helper tests pass.

### Task 5: Full verification and delivery

**Files:**
- Modify: `docs/superpowers/plans/2026-07-12-expanded-i18n-localization.md` to record completed checks.

**Interfaces:**
- Consumes: complete six-locale implementation.
- Produces: verified commits ready for the user-requested integration workflow.

- [x] **Step 1: Inspect locale completeness and diff hygiene**

Run: `node --test tests/i18n-locales.test.js && git diff --check && git status --short --branch`

Expected: locale tests pass, no whitespace errors, and only planned files are changed.

- [x] **Step 2: Run all verification gates**

Run each command and require exit code 0:

```text
npm.cmd test
npm.cmd run check:legacy-runtime
npm.cmd run check:sizes
npm.cmd run build
```

- [ ] **Step 3: Commit the implementation**

Stage only planned localization, RTL, tests, and plan files, then run:

```text
git commit -m "feat: add Russian Spanish and Arabic localization"
```

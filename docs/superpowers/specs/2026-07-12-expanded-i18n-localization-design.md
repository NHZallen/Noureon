# Expanded i18n Localization Design

## Goal

Add complete Russian, Spanish, and Arabic localization across the application, including AI reply language support and a fully right-to-left Arabic interface.

## Locale Set and Order

Every UI language selector must use this exact order:

1. `zh-TW` - 繁體中文
2. `en` - English
3. `fr` - Français
4. `ru` - Русский
5. `es` - Español
6. `ar` - العربية

The AI default reply language selector uses the same codes and order. Saved configuration continues to store the language code as a string, so existing users and exports remain compatible.

## Translation Quality

Create complete `ru.js`, `es.js`, and `ar.js` locale modules with the same translation-key surface as the established locales. Translations must be idiomatic and locally natural rather than literal word-for-word conversions:

- Russian copy uses standard contemporary product terminology, natural case and number agreement, and concise button labels.
- Spanish copy uses neutral international Spanish suitable across regions, with natural UI imperatives and terminology rather than English calques.
- Arabic copy uses clear Modern Standard Arabic, natural product wording, appropriate punctuation, and concise controls that read correctly right-to-left.
- Product names such as Noureon, Noura, provider names, and model identifiers remain unchanged where they are proper nouns.
- Placeholders, titles, notifications, validation errors, auth and password-recovery copy, settings, memory, charts, folders, P2P, council, and update surfaces are all included.

## Architecture

Add the three locale modules under `src/data/i18n/` and register them in the shared i18n index in the required order. Existing code continues to consume `i18n[languageCode]`; unsupported values retain the current Traditional Chinese or English fallback at their established boundaries.

Update every user-facing language selector, including the login shell, settings UI, AI reply language selector, and password-recovery page. Extend locale-aware helpers that currently branch only for Chinese, English, or French so Russian, Spanish, and Arabic receive localized council, reasoning, and recovery text.

## RTL Behavior

Applying Arabic sets the document root to `lang="ar"` and `dir="rtl"`. Applying any other supported language sets its matching `lang` and restores `dir="ltr"`.

Add narrowly scoped `[dir="rtl"]` CSS only where logical CSS or flex direction does not already mirror correctly. The RTL pass covers navigation, sidebars, modal layout, popover anchoring, icon/text gaps, text alignment, inputs, settings, login, recovery, and chat controls. Code blocks, model identifiers, URLs, email addresses, numeric data, charts, and other inherently left-to-right content remain LTR where required for readability.

## Data Flow and Compatibility

Selecting a UI language updates the saved `uiLanguage`, applies translated text, updates document language and direction, and re-renders locale-sensitive dynamic content. Selecting an AI reply language updates `aiDefaultLanguage`; existing prompt construction continues to pass that value so models are instructed to answer in the selected language.

No schema migration is required. Existing `zh-TW`, `en`, and `fr` values and exports remain valid.

## Testing

Use TDD to add coverage before implementation for:

- Exact six-language registration and selector ordering.
- Key parity between each new locale and the reference locale, with non-empty string values.
- Native language names and representative localized strings in Russian, Spanish, and Arabic.
- Arabic `lang` and RTL application plus LTR restoration when switching away.
- AI reply language options, persistence, and prompt handoff for all three new codes.
- Login and password-recovery language support.
- Locale-aware dynamic council and reasoning labels.
- RTL CSS safeguards for LTR-only technical content.

Run the focused i18n and runtime tests, then the complete test suite, legacy-runtime boundary check, size check, and production build.


# Remove Arabic Localization Design

## Goal

Completely remove Arabic UI and AI reply localization while preserving a safe experience for users whose saved configuration still contains the `ar` locale code.

## Remaining Locale Set and Order

Every language selector and locale registry must contain exactly:

1. `zh-TW` - 繁體中文
2. `en` - English
3. `fr` - Français
4. `ru` - Русский
5. `es` - Español

The UI language and AI default reply language selectors use the same order.

## Removal Scope

- Delete `src/data/i18n/ar.js`.
- Remove the Arabic import, export, registry entry, language-name keys, selector options, recovery label, AI reply instruction, reasoning labels, and tests.
- Remove Arabic-specific RTL application logic and the dedicated RTL correction block.
- Remove Arabic requirements from the expanded-localization implementation plan so project documentation describes the supported result accurately. Keep the historical design specs unchanged as records of prior decisions.

## Saved Configuration Compatibility

Older local or imported configuration can still contain `uiLanguage: 'ar'` or `aiDefaultLanguage: 'ar'`. Normalize those unsupported values to `en` at configuration loading/normalization boundaries. Runtime locale application also retains its established fallback behavior, so stale values cannot produce missing text or an empty AI language instruction.

No storage schema migration is required.

## Testing

Use TDD to update coverage before implementation:

- Assert the exact five-locale registry and selector order.
- Assert Arabic locale files, selector options, prompt instructions, language-name keys, and dedicated RTL rules are absent.
- Assert stale `ar` UI and AI language configuration normalizes to `en`.
- Preserve complete key parity, interpolation-token parity, password recovery, reasoning labels, and AI prompt behavior for Russian and Spanish.
- Update locale content hashes after the intentional key removal.

Run focused localization/config tests, the complete test suite, legacy-runtime boundary check, size check, and production build before committing and pushing `main`.


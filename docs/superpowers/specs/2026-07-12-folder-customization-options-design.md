# Folder Customization Options Design

## Goal

Expand folder customization with seven additional icon colors and two additional SVG icons while preserving all existing saved folder data and UI behavior.

## Scope

- Add the following folder icon colors to every palette used by folder rendering and folder menus:
  - `orange`: `#fb923c`
  - `amber`: `#fbbf24`
  - `lime`: `#a3e635`
  - `emerald`: `#34d399`
  - `teal`: `#2dd4bf`
  - `cyan`: `#22d3ee`
  - `rose`: `#fb7185`
- Add two 24x24 outline SVG choices to `FOLDER_SVGS`:
  - `book` for learning and reference folders.
  - `code` for software and technical folders.
- Keep all existing palette keys, icon keys, saved values, defaults, and fallback behavior unchanged.

## Implementation

The canonical selectable color palette remains in `legacy-core.js`. The matching fallback palette used by the history move menu must contain the same additions so saved folders render consistently in both locations. SVG path markup remains in `folder-metadata.js` and follows the existing `currentColor`, round-cap, round-join outline style.

No localization additions are needed because the folder customization UI presents colors as swatches and icons visually rather than using per-option labels.

## Compatibility and Error Handling

Existing folder records continue to resolve through their current keys or direct CSS color values. Unknown icon keys continue to fall back to `default`, and unknown colors continue to use the existing gray fallback. No data migration or schema change is required.

## Testing

- Extend folder metadata tests first to require `book` and `code`, and verify their SVG markup remains safe, outline-based markup.
- Add a source-level regression test requiring all seven named color/value pairs in both folder palettes.
- Run the focused tests and observe the expected failures before implementation.
- After implementation, run the focused tests, the complete test suite, the legacy-runtime boundary check, file-size check, and production build.

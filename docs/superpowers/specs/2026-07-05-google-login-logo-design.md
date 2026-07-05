# Google Login Logo Design

## Goal

Add the official multicolor Google "G" logo before the existing Google login text without changing the current Supabase OAuth flow.

## Approach

- Use Google's approved multicolor "G" SVG artwork as a local static asset.
- Keep `#supabase-google-btn` as the interactive button so its existing Supabase `signInWithOAuth` listener remains unchanged.
- Render the icon and label as separate child elements, with the icon fixed at 20 by 20 pixels and the label visually centered.
- Preserve the current white background, border, hover state, disabled state, and localized login text.
- Do not add a third-party icon package or load the Google Identity Services SDK, because either choice is unnecessary for this visual-only change.

## Accessibility

The button text remains the accessible name. The decorative logo uses an empty alternative text so screen readers do not announce "Google" twice.

## Testing

- Add a DOM test that initially fails because the Google button has no image.
- Verify the image exists inside `#supabase-google-btn`, uses the local official asset, has fixed dimensions, and has an empty `alt` value.
- Re-run the focused auth bridge test and the full test suite.
- Build the app and inspect the login screen at desktop and mobile widths.

## Non-Goals

- Replacing Supabase OAuth with Google Identity Services.
- Changing login behavior, account retention, or logout behavior.
- Restyling unrelated authentication controls.

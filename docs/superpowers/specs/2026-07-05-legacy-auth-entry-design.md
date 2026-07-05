# Legacy Auth Entry Design

## Goal

Replace the duplicate legacy login and import entries on the cloud login screen with one dark gray button while retaining every legacy login and import capability.

## Cloud Mode

- Show one full-width button labeled `使用舊版本機登入 / 匯入`.
- Use a dark gray surface, white text, and a slightly darker hover state.
- Hide the separate `匯入舊版紀錄` button so the two duplicate entry points appear as one control.
- Clicking the combined button signs out the local Supabase session and opens the existing legacy login/import mode.

## Legacy Mode

- Keep the username and password fields and both legacy login and backup import behavior unchanged.
- Show the actual `匯入紀錄` action as a dark gray button instead of green.
- Keep `返回 Email / Google 登入` as a lightweight text action.

## Support Policy

The legacy login and import feature remains available. Do not add a deadline notice, automatic cutoff, or disabled state based on date.

## Implementation

- Reuse `#local-mode-btn` as the single cloud-mode entry because it already owns the Supabase local sign-out handoff.
- Reuse `#import-btn-auth` only inside legacy mode for the actual import action.
- Swap visibility and style classes when `setCloudMode` and `setLocalMode` run.
- Update the base template button classes so no green import button flashes before the auth bridge initializes.

## Testing

- Verify cloud mode shows the combined dark gray entry and hides the separate import button.
- Verify legacy mode hides the combined cloud entry style, shows the dark gray import action, and preserves the return action.
- Verify no green classes remain on the auth import button.
- Run the focused auth bridge tests, full test suite, production build, and desktop/mobile visual checks.

# Connector login by pasting a token (Vercel first)

Status: written 2026-11-14, built the same day on `staging`, to be tried with a real Vercel token by the owner.

## 1. Why

The connectors of Noureon are OAuth only (`2026-10-10-mcp-connectors-design.md`, §3). Vercel's MCP server (`mcp.vercel.com`) answered our registration with
`invalid_redirect_uri: not approved` (13.1 of that design): it takes only clients it has approved. The application for approval was sent on 2026-10-11 and
nobody has answered. Vercel's documentation now also names a second way in, a Client ID Metadata Document (CIMD), which we have not tried again.

The owner decided (2026-11-14) not to wait: a person may paste a token of their own, which gives about the same effect.

## 2. What was checked, and what was not

- Vercel's own REST API takes `Authorization: Bearer <token>` with a token made at `vercel.com/account/tokens` (documented; the endpoints used below were read in Vercel's documentation on 2026-11-14).
- Whether `mcp.vercel.com` takes such a token is **not** documented by Vercel (only a third-party page says it does), so this connector does not use the MCP server. It is a *native* connector, like Google (`2026-10-25-google-connector-design.md`): our server calls Vercel's REST API by itself, and the tools are our own code.
- Not verified from the sandbox: nothing could be sent to Vercel from here. The tools are tested against a fake network; the first real test is the owner's, on `staging`.

## 3. How it works

- The catalog entry of `vercel` is `native: 'vercel'` with `tokenLogin: { url }` instead of `oauth`. The page shows a sheet with one field (type password), a link to where a token is made, and what will be kept.
- `POST /v1/connectors/<id>/token` `{ token }` (`connectWithToken` in `server/mcp/connections.js`): the shape of the token is checked, the token is tried once at the service (`GET /v2/user`), then it is **sealed with the master key, bound to the person and the connector** (the same as an OAuth token) in `user_mcp_connections`. It is never given back to the page, the model or the logs. The login of the person is shown as connected; the list of tools is read as for any connector.
- A token has no refresh token and no end date known to us. When Vercel answers 401 the connection becomes `needs_login`, and the person pastes a new token.
- Disconnecting deletes what we keep. A token cannot be revoked by us (Vercel's way needs the id of the token, which we never learn): the sheet and the card say the person can revoke it at `vercel.com/account/tokens`.

## 4. Choices (the owner may change them)

- **Tools:** reads `vercel_list_teams`, `vercel_list_projects`, `vercel_get_project`, `vercel_list_deployments`, `vercel_get_deployment`, `vercel_get_build_logs`, `vercel_list_project_domains`, `vercel_list_env_vars` (names, types and targets only, **never the values**); writes `vercel_redeploy`, `vercel_cancel_deployment`. Buying domains, deleting, and changing environment variables are not offered. Reads are allowed, writes ask first, as for every connector (the person may change each tool).
- **No read-only token:** Vercel's tokens have no read-only kind, so this is not a read-only login; what a reply may do is the person's setting for each tool. The card says so (as for Notion).
- **Team:** a token of the whole account reaches every team; a tool takes an optional `team_id` (found with `vercel_list_teams`).
- **Texts:** the five languages, the privacy policy (a token kept sealed, on the server, until it is disconnected) and the help center.

## 5. Update, same day: CIMD works, the token is the second card

The probe on the VPS (2026-11-14, after the small logo was deployed) shows `Vercel: CIMD` (PKCE S256, refresh and revocation endpoints). So the catalog now has two Vercel cards:
`vercel` (Vercel's own MCP, OAuth, the client is our metadata document, `logo-small.png` under 100 KB, the "under review" mark taken out) and `vercel-token` ("Vercel (token)", this design). The owner prefers the CIMD login; the token card stays until the owner has seen the CIMD login work on `staging`, and may then be taken out (the catalog entry, `server/mcp/native/vercel/`, the route and the sheet are all in commit c48e9d3c).
Not verified yet: that Vercel's authorisation page accepts our document (only a real login shows it).

## 6. What is left

- A real token on `staging` (the owner), then a look at the list of tools and what a reply does with them.
- A real login of the `vercel` card on `staging` (the owner); if it works, decide whether the `vercel-token` card goes.

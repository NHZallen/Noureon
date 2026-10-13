// Whether someone with a workspace is coming back (the page that shows while the app loads says "getting your workspace ready" only to them: for a first
// visit or someone signed out there is no workspace to get ready). It is kept in the browser's storage, where the page can read it before anything is
// loaded (public/startup-language.js reads the same key), and is written once the app knows who is there.
export const WORKSPACE_HINT_KEY = 'noureon_workspace_hint';

/** `mode` is the one of resolveStartupIdentity: a workspace (local or cloud) is there for 'local', 'cloud' and 'cloud-pending'. */
export function rememberWorkspaceHint(mode, storage = globalThis.localStorage) {
  try {
    if (['local', 'cloud', 'cloud-pending'].includes(mode)) storage?.setItem(WORKSPACE_HINT_KEY, '1');
    else storage?.removeItem(WORKSPACE_HINT_KEY);
  } catch {
    // A browser that refuses storage shows the lines as it did before.
  }
}

// Google's own file picker for the sources of a project (docs/superpowers/specs/2026-10-31-projects-design.md, §13.2): the window of Google Drive that the phone and the big AI apps show (its places,
// its search, its folders), made by Google, not by us. It needs three things from the page: a short sign-in of Google (Google Identity Services, the scope `drive.file`: the page can read only the
// files the person picks, nothing else of their Drive), the picker script, and the project's keys (an OAuth client of the web with this page's address, an API key, and the project number). The
// token lives for an hour (kept in the tab's session storage, so a reload does not ask again) and is used for nothing but taking the picked files; it is not the login of the Google connector,
// which stays on the server. When it has run out, the sign-in is asked again with the address of the account the person used last time (kept in the browser's storage, with a note that they agreed),
// so Google does not show the choice of accounts and, the access being already given, asks for nothing: no new login. `config` has
// { clientId, apiKey, appId } (none: no picker). Everything the browser gives (the document, the window, fetch) comes in through `deps`.

import { PROJECT_SOURCE_FILE_BYTES_MAX } from './project-source-model.js';

const API_SCRIPT = 'https://apis.google.com/js/api.js';
const GSI_SCRIPT = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
export const GOOGLE_FILE_MAX_BYTES = PROJECT_SOURCE_FILE_BYTES_MAX;
const EXPORTABLE = new Set(['application/vnd.google-apps.document', 'application/vnd.google-apps.presentation', 'application/vnd.google-apps.spreadsheet']);
// Google's own kinds are taken as a PDF (its pictures and layout stay); the others of Google's (a form, a map...) cannot be taken as a file.
const isGoogleOwn = (mimeType) => String(mimeType || '').startsWith('application/vnd.google-apps.');

export const googlePickerConfigured = (config) => Boolean(config?.clientId && config?.apiKey && config?.appId);

export const DRIVE_TOKEN_KEY = 'noureon.googleDrive.token.v1';
export const DRIVE_ACCOUNT_KEY = 'noureon.googleDrive.account.v1';

const guarded = (read) => { try { return read(); } catch { return null; } };

export function createGooglePicker({ config, document, win = document?.defaultView, fetchImpl = (...args) => globalThis.fetch(...args), getLanguage = () => 'en', sessionStore = () => win?.sessionStorage, localStore = () => win?.localStorage, now = () => Date.now() }) {
  const scripts = new Map();
  const loadScript = (src) => {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => { scripts.delete(src); reject(new Error(`${src} did not load`)); };
        document.head.appendChild(tag);
      }));
    }
    return scripts.get(src);
  };
  let ready = null;
  const prepare = () => {
    if (!ready) {
      ready = Promise.all([loadScript(API_SCRIPT), loadScript(GSI_SCRIPT)])
        .then(() => new Promise((resolve, reject) => win.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('the picker did not load')) })))
        .catch((error) => { ready = null; throw error; });
    }
    return ready;
  };

  let token = null;
  let tokenUntil = 0;
  // The token of this tab, if it is still good (the page was reloaded, or the picker is opened again from another place).
  const remembered = () => {
    if (token && now() < tokenUntil) return token;
    const saved = guarded(() => JSON.parse(sessionStore()?.getItem(DRIVE_TOKEN_KEY) || 'null'));
    if (saved?.token && Number(saved.until) > now()) { token = saved.token; tokenUntil = Number(saved.until); return token; }
    return null;
  };
  const account = () => guarded(() => localStore()?.getItem(DRIVE_ACCOUNT_KEY)) || '';
  const rememberAccount = async (accessToken) => {
    try {
      const response = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error' });
      const email = response.ok ? (await response.json())?.user?.emailAddress : '';
      // What is kept is the address (the hint for the next sign-in) and that access was given: nothing that can be used without Google's own sign-in.
      if (email) guarded(() => localStore()?.setItem(DRIVE_ACCOUNT_KEY, String(email)));
    } catch { /* The next sign-in then shows the choice of accounts once. */ }
  };
  const signIn = () => new Promise((resolve, reject) => {
    const good = remembered();
    if (good) { resolve(good); return; }
    const hint = account();
    const client = win.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPE,
      ...(hint ? { hint } : {}),
      callback: (response) => {
        if (response?.error || !response?.access_token) { reject(new Error(response?.error || 'no token')); return; }
        token = response.access_token;
        tokenUntil = now() + Math.max(60, Number(response.expires_in) || 3600) * 1000 - 60_000;
        guarded(() => sessionStore()?.setItem(DRIVE_TOKEN_KEY, JSON.stringify({ token, until: tokenUntil })));
        if (!hint) void rememberAccount(token);
        resolve(token);
      },
      error_callback: (error) => reject(Object.assign(new Error(error?.type || 'sign-in failed'), { code: error?.type === 'popup_closed' ? 'cancelled' : 'blocked' }))
    });
    // With an account remembered, the access was given before: Google asks for nothing (prompt '' = only what is missing).
    client.requestAccessToken({ prompt: hint ? '' : undefined });
  });

  const showPicker = (accessToken) => new Promise((resolve) => {
    const picker = win.google.picker;
    const views = [
      new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false),
      new picker.DocsView(picker.ViewId.DOCS).setOwnedByMe(false).setIncludeFolders(true).setSelectFolderEnabled(false),
      new picker.DocsView(picker.ViewId.DOCS).setStarred(true),
      picker.ViewId.RECENTLY_PICKED
    ];
    const builder = new picker.PickerBuilder();
    for (const view of views) builder.addView(view);
    builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken).setDeveloperKey(config.apiKey).setAppId(config.appId)
      .setLocale(getLanguage()).setOrigin(`${win.location.protocol}//${win.location.host}`)
      .setCallback((data) => {
        if (data?.action === picker.Action.PICKED) resolve({ ok: true, docs: Array.isArray(data.docs) ? data.docs : [] });
        else if (data?.action === picker.Action.CANCEL) resolve({ ok: false, code: 'cancelled' });
      });
    builder.build().setVisible(true);
  });

  async function take(doc, accessToken) {
    const own = isGoogleOwn(doc.mimeType);
    if (own && !EXPORTABLE.has(doc.mimeType)) return { ok: false, code: 'failed' };
    if (!own && Number(doc.sizeBytes) > GOOGLE_FILE_MAX_BYTES) return { ok: false, code: 'too_big' };
    const url = own ? `${DRIVE_FILES}/${encodeURIComponent(doc.id)}/export?mimeType=application%2Fpdf` : `${DRIVE_FILES}/${encodeURIComponent(doc.id)}?alt=media&supportsAllDrives=true`;
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error' });
    // A token Google no longer takes (revoked, or older than it said): it is forgotten, and the next time the sign-in is asked again.
    if (response.status === 401) { token = null; tokenUntil = 0; guarded(() => sessionStore()?.removeItem(DRIVE_TOKEN_KEY)); }
    if (!response.ok) return { ok: false, code: 'failed' };
    const blob = await response.blob();
    if (blob.size > GOOGLE_FILE_MAX_BYTES) return { ok: false, code: 'too_big' };
    const name = String(doc.name || 'file');
    return { ok: true, file: new File([blob], own && !/\.pdf$/i.test(name) ? `${name}.pdf` : name, { type: own ? 'application/pdf' : String(doc.mimeType || blob.type || 'application/octet-stream') }) };
  }

  return {
    /** Loads Google's scripts ahead, so that the sign-in window can open at the moment of a tap (a browser opens a window only from a tap). */
    warm() { void prepare().catch(() => {}); },
    /** Forgets the token and the account (a sign-out of this device). */
    forget() {
      token = null;
      tokenUntil = 0;
      guarded(() => sessionStore()?.removeItem(DRIVE_TOKEN_KEY));
      guarded(() => localStore()?.removeItem(DRIVE_ACCOUNT_KEY));
    },
    /** Shows the picker: { ok: true, files: [File], failed: [{ name, code }] } or { ok: false, code: 'cancelled' | 'blocked' | 'failed' }. */
    async pick() {
      try {
        await prepare();
        const accessToken = await signIn();
        const picked = await showPicker(accessToken);
        if (!picked.ok) return picked;
        const files = [];
        const failed = [];
        for (const doc of picked.docs) {
          const taken = await take(doc, accessToken).catch(() => ({ ok: false, code: 'failed' }));
          if (taken.ok) files.push(taken.file); else failed.push({ name: String(doc.name || ''), code: taken.code });
        }
        return { ok: true, files, failed };
      } catch (error) {
        return { ok: false, code: error?.code === 'cancelled' ? 'cancelled' : error?.code === 'blocked' ? 'blocked' : 'failed' };
      }
    }
  };
}

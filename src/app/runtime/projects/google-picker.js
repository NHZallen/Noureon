// Google's own file picker for the sources of a project (docs/superpowers/specs/2026-10-31-projects-design.md, §13.2): the window of Google Drive that the phone and the big AI apps show (its places,
// its search, its folders), made by Google, not by us. It needs three things from the page: a short sign-in of Google (Google Identity Services, the scope `drive.file`: the page can read only the
// files the person picks, nothing else of their Drive), the picker script, and the project's keys (an OAuth client of the web with this page's address, an API key, and the project number). The
// token lives in this page for an hour and is used for nothing but taking the picked files; it is not the login of the Google connector, which stays on the server. `config` has
// { clientId, apiKey, appId } (none: no picker). Everything the browser gives (the document, the window, fetch) comes in through `deps`.

const API_SCRIPT = 'https://apis.google.com/js/api.js';
const GSI_SCRIPT = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
export const GOOGLE_FILE_MAX_BYTES = 20 * 1024 * 1024;
const EXPORTABLE = new Set(['application/vnd.google-apps.document', 'application/vnd.google-apps.presentation', 'application/vnd.google-apps.spreadsheet']);
// Google's own kinds are taken as a PDF (its pictures and layout stay); the others of Google's (a form, a map...) cannot be taken as a file.
const isGoogleOwn = (mimeType) => String(mimeType || '').startsWith('application/vnd.google-apps.');

export const googlePickerConfigured = (config) => Boolean(config?.clientId && config?.apiKey && config?.appId);

export function createGooglePicker({ config, document, win = document?.defaultView, fetchImpl = (...args) => globalThis.fetch(...args), getLanguage = () => 'en' }) {
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
  const signIn = () => new Promise((resolve, reject) => {
    if (token && Date.now() < tokenUntil) { resolve(token); return; }
    const client = win.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response?.error || !response?.access_token) { reject(new Error(response?.error || 'no token')); return; }
        token = response.access_token;
        tokenUntil = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000 - 60_000;
        resolve(token);
      },
      error_callback: (error) => reject(Object.assign(new Error(error?.type || 'sign-in failed'), { code: error?.type === 'popup_closed' ? 'cancelled' : 'blocked' }))
    });
    client.requestAccessToken({ prompt: token ? '' : undefined });
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
    if (!response.ok) return { ok: false, code: 'failed' };
    const blob = await response.blob();
    if (blob.size > GOOGLE_FILE_MAX_BYTES) return { ok: false, code: 'too_big' };
    const name = String(doc.name || 'file');
    return { ok: true, file: new File([blob], own && !/\.pdf$/i.test(name) ? `${name}.pdf` : name, { type: own ? 'application/pdf' : String(doc.mimeType || blob.type || 'application/octet-stream') }) };
  }

  return {
    /** Loads Google's scripts ahead, so that the sign-in window can open at the moment of a tap (a browser opens a window only from a tap). */
    warm() { void prepare().catch(() => {}); },
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

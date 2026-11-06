// What the buttons of a picture (save, share, edit) need to turn a picture into a file. The page's policy (vercel.json) lets `fetch` reach only the app and the services it names, not `data:`, so a
// picture held as a data address is decoded here and never fetched: `fetch(dataUrl)` was refused in production (the share and the edit buttons did nothing; the dev server has no such policy).

/** The Blob of a data address (`data:image/png;base64,...`), or null when it is not one. */
export function dataUrlToBlob(url) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(url || ''));
  if (!match) return null;
  let raw;
  try {
    raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' });
}

const isIos = (nav) => /iP(hone|ad|od)/.test(nav?.userAgent || '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);

/**
 * Saving on an iPhone or iPad: the browsers of the phone (and the browsers inside other apps) do not act on `<a download>`, so the file goes to the share sheet (it holds "Save Image" and "Save to Files").
 * Must be called inside the click, before anything is waited for. Returns true when the sheet was opened, so the caller keeps the link from being followed; false leaves the link as it is.
 */
export function saveWithShareSheet({ blob, name, navigator: nav = globalThis.navigator, FileCtor = globalThis.File }) {
  if (!blob || !isIos(nav) || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  const file = new FileCtor([blob], name, { type: blob.type });
  if (!nav.canShare({ files: [file] })) return false;
  nav.share({ files: [file] }).catch(() => {});
  return true;
}

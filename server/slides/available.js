// Whether this server can draw slides: its native tools load and the fonts can be made. Asked once a reply with a presentation is accepted;
// a yes is kept, a no is asked again after a few minutes (a deployment that lacks the tools does not get them back by itself, but the
// first look may have been made while the process was starting).

import { getFontKit } from './font-kit.js';

const RETRY_MS = 5 * 60 * 1000;
let known = null;

export async function canDrawSlides({ now = Date.now } = {}) {
  if (known?.ok || (known && now() - known.at < RETRY_MS)) return known.ok;
  try {
    await Promise.all([import('@napi-rs/canvas'), import('@resvg/resvg-js'), import('@xmldom/xmldom'), import('jszip'), getFontKit()]);
    known = { ok: true, at: now() };
  } catch {
    known = { ok: false, at: now() };
  }
  return known.ok;
}

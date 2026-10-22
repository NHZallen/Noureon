// What a reply keeps of the pictures its model looked at, asked about and drew (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md, §2-11), so that
// the step list reads the same on any page, when the reply is opened later, and on another device. It is part of the run record kept in the message (sandbox-run-block.js):
//   { kind: 'view', reason, shown: [picture], used: [ref] }     the pictures looked at, and which of them were used afterwards
//   { kind: 'pick', title, picked: picture }                    the picture the person chose when asked
//   { kind: 'draw', count, references: [picture] }              what was drawn, and from which pictures
// A picture is { round, source: 'user' | 'generated', number, thumb?: { mimeType, data } } with a tiny picture as base64. The server and the page both read this file, so it
// may not use the browser (scripts/server-shared-modules.json).

const MAX_STEPS = 40;
const MAX_PICTURES = 16;
const MAX_THUMB_CHARS = 12000;
const THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const whole = (value) => (Number.isInteger(value) && value >= 1 && value <= 100_000 ? value : null);
const words = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

export function normalizePictureRef(value) {
  const round = whole(value?.round);
  const number = whole(value?.number);
  const source = value?.source === 'user' || value?.source === 'generated' ? value.source : '';
  return round && number && source ? { round, source, number } : null;
}

export function normalizePicture(value) {
  const ref = normalizePictureRef(value);
  if (!ref) return null;
  const thumb = value?.thumb;
  const kept = thumb && THUMB_TYPES.has(thumb.mimeType) && typeof thumb.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(thumb.data) && thumb.data.length > 0 && thumb.data.length <= MAX_THUMB_CHARS
    ? { mimeType: thumb.mimeType, data: thumb.data }
    : null;
  return kept ? { ...ref, thumb: kept } : ref;
}

const pictures = (list) => (Array.isArray(list) ? list : []).slice(0, MAX_PICTURES).map(normalizePicture).filter(Boolean);

/** The steps as the record keeps them (anything that is not a step is left out). */
export function normalizePictureSteps(steps) {
  const kept = [];
  for (const step of Array.isArray(steps) ? steps : []) {
    if (kept.length >= MAX_STEPS) break;
    if (step?.kind === 'view') {
      const shown = pictures(step.shown);
      if (!shown.length) continue;
      kept.push({ kind: 'view', reason: words(step.reason, 300), shown, used: (Array.isArray(step.used) ? step.used : []).slice(0, MAX_PICTURES).map(normalizePictureRef).filter(Boolean) });
    } else if (step?.kind === 'pick') {
      const picked = normalizePicture(step.picked);
      if (picked) kept.push({ kind: 'pick', title: words(step.title, 120), picked });
    } else if (step?.kind === 'draw') {
      const count = whole(step.count);
      if (count) kept.push({ kind: 'draw', count: Math.min(count, 99), references: pictures(step.references) });
    }
  }
  return kept;
}

/** "3, 5" for the numbers of some pictures, each once and in order. */
export const pictureNumbers = (list) => [...new Set((Array.isArray(list) ? list : []).map((entry) => entry.number))].sort((a, b) => a - b);

export const sameRef = (a, b) => a.round === b.round && a.source === b.source && a.number === b.number;

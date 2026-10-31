// The files of a shared conversation (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §3.3): the snapshot holds `{ __astraSharedAsset: { path, mimeType, encoding } }` where a file was,
// and the file itself is in the public bucket `shared-assets`. The viewer brings them back to the shape the app's renderers read (base64 or a data URL in the part); a picture a model drew is
// not downloaded: its address is enough for an <img>.

const MARKER = '__astraSharedAsset';
const BUCKET = 'shared-assets';
const SAFE_PATH = /^[0-9a-f-]{36}\/[0-9a-f]{64}$/;

export const sharedAssetUrl = (baseUrl, path) => (SAFE_PATH.test(String(path || '')) ? `${String(baseUrl).replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}` : '');

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

class Holder { constructor() { this.value = ''; } }

const isMarker = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && value[MARKER] && typeof value[MARKER] === 'object');

async function download(marker, { baseUrl, fetchImpl }) {
  const url = sharedAssetUrl(baseUrl, marker.path);
  if (!url) return null;
  try {
    const response = await fetchImpl(url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) return null;
    const base64 = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
    return marker.encoding === 'data-url' ? `data:${marker.mimeType || 'application/octet-stream'};base64,${base64}` : base64;
  } catch {
    return null;
  }
}

/**
 * The snapshot with every file marker replaced by the file (`''` where it is gone: `{ missing: true }` or a download that failed). Pictures under `generatedImage` get `url` instead.
 * Resolves { snapshot, missing } (`missing`: how many files could not be brought).
 */
export async function hydrateSharedSnapshot(snapshot, { baseUrl, fetchImpl = globalThis.fetch.bind(globalThis), concurrency = 4 } = {}) {
  const jobs = [];
  let missing = 0;
  const walk = (value, inPicture = false) => {
    if (Array.isArray(value)) return value.map((item) => walk(item, inPicture));
    if (!value || typeof value !== 'object') return value;
    if (isMarker(value)) {
      const marker = value[MARKER];
      if (inPicture) return { url: marker.missing ? '' : sharedAssetUrl(baseUrl, marker.path), mimeType: marker.mimeType || '' };
      const holder = new Holder();
      if (marker.missing) missing += 1;
      else jobs.push(async () => { const data = await download(marker, { baseUrl, fetchImpl }); if (data === null) missing += 1; holder.value = data ?? ''; });
      return holder;
    }
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = walk(inner, inPicture || key === 'generatedImage');
    return out;
  };
  const walked = walk(snapshot);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => { while (next < jobs.length) await jobs[next++](); }));
  // The holders (made while walking) are replaced by what they now hold.
  const settle = (value) => {
    if (Array.isArray(value)) return value.map(settle);
    if (value instanceof Holder) return value.value;
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = settle(inner);
    return out;
  };
  return { snapshot: settle(walked), missing };
}

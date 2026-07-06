const ASSET_MARKER = '__astraCloudAsset';
const DEFAULT_BUCKET = 'user-assets';

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function dataUrlToBlob(value) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) return null;
  const mimeType = match[1] || 'application/octet-stream';
  const bytes = match[2]
    ? base64ToBytes(match[3])
    : new TextEncoder().encode(decodeURIComponent(match[3]));
  return new Blob([bytes], { type: mimeType });
}

async function blobToEncodedValue(blob, encoding) {
  const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  return encoding === 'data-url' ? `data:${blob.type || 'application/octet-stream'};base64,${base64}` : base64;
}

async function sha256(blob, cryptoProvider) {
  const digest = await cryptoProvider.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function marker(path, mimeType, encoding) {
  return { [ASSET_MARKER]: { path, mimeType, encoding } };
}

function getMarker(value) {
  return value && typeof value === 'object' && value[ASSET_MARKER] ? value[ASSET_MARKER] : null;
}

function isBlobLike(value) {
  return value instanceof Blob || Boolean(value && typeof value.arrayBuffer === 'function' && typeof value.size === 'number');
}

export function createCloudAssetTransport({
  supabase,
  storage,
  userId,
  bucket = DEFAULT_BUCKET,
  cryptoProvider = globalThis.crypto,
  logger = console
} = {}) {
  const uploadedPaths = new Set();
  const downloadedBlobs = new Map();
  const dataUrlMarkers = new Map();
  const base64Markers = new Map();
  const generatedImageMarkers = new Map();
  const hydratedValues = new Map();
  const restoredGeneratedImages = new Set();
  const unavailablePaths = new Set();
  const pendingDownloads = new Map();
  const storageBucket = supabase.storage.from(bucket);

  async function uploadBlob(blob, encoding) {
    const hash = await sha256(blob, cryptoProvider);
    const path = `${userId}/${hash}`;
    if (!uploadedPaths.has(path)) {
      const { error } = await storageBucket.upload(path, blob, {
        cacheControl: '31536000',
        contentType: blob.type || 'application/octet-stream',
        upsert: false
      });
      const duplicate = error && (String(error.statusCode) === '409' || /already exists|duplicate/i.test(error.message || ''));
      if (error && !duplicate) throw error;
      uploadedPaths.add(path);
    }
    return marker(path, blob.type || 'application/octet-stream', encoding);
  }

  async function downloadMarker(assetMarker) {
    if (unavailablePaths.has(assetMarker.path)) return null;
    if (!downloadedBlobs.has(assetMarker.path)) {
      if (!pendingDownloads.has(assetMarker.path)) {
        pendingDownloads.set(assetMarker.path, storageBucket.download(assetMarker.path));
      }
      const { data, error } = await pendingDownloads.get(assetMarker.path);
      pendingDownloads.delete(assetMarker.path);
      if (error) {
        if (!unavailablePaths.has(assetMarker.path)) {
          unavailablePaths.add(assetMarker.path);
          logger.warn('Noureon cloud asset is unavailable; continuing workspace sync without it.', {
            path: assetMarker.path,
            status: error.statusCode || error.status,
            message: error.message || String(error)
          });
        }
        return null;
      }
      downloadedBlobs.set(assetMarker.path, data);
    }
    const source = downloadedBlobs.get(assetMarker.path);
    if (!source) return null;
    return source.type ? source : new Blob([source], { type: assetMarker.mimeType || 'application/octet-stream' });
  }

  async function externalize(value) {
    if (typeof value === 'string' && value.startsWith('data:')) {
      if (dataUrlMarkers.has(value)) return dataUrlMarkers.get(value);
      const blob = dataUrlToBlob(value);
      if (!blob) return value;
      const assetMarker = await uploadBlob(blob, 'data-url');
      dataUrlMarkers.set(value, assetMarker);
      return assetMarker;
    }
    if (!value || typeof value !== 'object' || value instanceof Blob) return value;
    if (getMarker(value)) return value;
    if (Array.isArray(value)) return Promise.all(value.map(externalize));

    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'data' && typeof child === 'string' && typeof value.mimeType === 'string') {
        let markersForMime = base64Markers.get(value.mimeType);
        if (!markersForMime) {
          markersForMime = new Map();
          base64Markers.set(value.mimeType, markersForMime);
        }
        if (!markersForMime.has(child)) {
          const blob = new Blob([base64ToBytes(child)], { type: value.mimeType || 'application/octet-stream' });
          markersForMime.set(child, await uploadBlob(blob, 'base64'));
        }
        output[key] = markersForMime.get(child);
      } else {
        output[key] = await externalize(child);
      }
    }

    if (value.generatedImage?.storageKey) {
      const expectedKey = `generatedImage:supabase:${userId}:${value.generatedImage.id}`;
      let storageKey = value.generatedImage.storageKey;
      let blob = await storage.getItem(storageKey);
      if (!isBlobLike(blob) && storageKey !== expectedKey) {
        blob = await storage.getItem(expectedKey);
        if (isBlobLike(blob)) storageKey = expectedKey;
      }
      if (isBlobLike(blob)) {
        let assetMarker = generatedImageMarkers.get(storageKey);
        if (!assetMarker) {
          assetMarker = await uploadBlob(blob, 'blob');
          generatedImageMarkers.set(storageKey, assetMarker);
        }
        output.generatedImage = {
          ...output.generatedImage,
          storageKey,
          cloudAsset: assetMarker
        };
      }
    }
    return output;
  }

  async function hydrate(value) {
    const assetMarker = getMarker(value);
    if (assetMarker) {
      const blob = await downloadMarker(assetMarker);
      if (!blob) return null;
      if (assetMarker.encoding === 'blob') return blob;
      const cacheKey = `${assetMarker.path}:${assetMarker.encoding}`;
      if (!hydratedValues.has(cacheKey)) hydratedValues.set(cacheKey, blobToEncodedValue(blob, assetMarker.encoding));
      return hydratedValues.get(cacheKey);
    }
    if (!value || typeof value !== 'object' || value instanceof Blob) return value;
    if (Array.isArray(value)) return Promise.all(value.map(hydrate));

    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'generatedImage' && child?.cloudAsset && child?.storageKey) {
        const generatedImage = { ...child };
        const generatedMarker = getMarker(child.cloudAsset);
        const restoreKey = generatedMarker && `${generatedMarker.path}:${child.storageKey}`;
        if (restoreKey && !restoredGeneratedImages.has(restoreKey)) {
          const blob = await downloadMarker(generatedMarker);
          if (blob) {
            await storage.setItem(child.storageKey, blob);
            restoredGeneratedImages.add(restoreKey);
          }
        }
        delete generatedImage.cloudAsset;
        output[key] = await hydrate(generatedImage);
      } else {
        output[key] = await hydrate(child);
      }
    }
    return output;
  }

  return { externalize, hydrate };
}

export const cloudAssetPolicy = Object.freeze({ bucket: DEFAULT_BUCKET, marker: ASSET_MARKER });

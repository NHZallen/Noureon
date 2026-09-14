const extensionForMediaType = (mediaType = '') => ({
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
}[mediaType] || 'png');

const decodeBase64 = (value) => {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const encodeBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const applyNaturalImageAspect = (imageElement) => {
  const width = Number(imageElement?.naturalWidth);
  const height = Number(imageElement?.naturalHeight);
  if (!width || !height) return;
  const card = imageElement.closest?.('.generated-image-card');
  if (!card) return;
  card.style.aspectRatio = `${width} / ${height}`;
  card.classList.add('has-natural-aspect');
};

export function createGeneratedImageAssetStore({
  setItem,
  getItem,
  getUserName = () => 'anonymous',
  randomUUID = () => crypto.randomUUID(),
  createObjectURL = (blob) => URL.createObjectURL(blob),
  shouldPersist = () => true
} = {}) {
  const volatileBlobs = new WeakMap();

  const put = async (descriptor, blob) => {
    if (shouldPersist()) {
      descriptor.storageKey ||= `generatedImage:${getUserName() || 'anonymous'}:${descriptor.id}`;
      delete descriptor.ephemeral;
      await setItem(descriptor.storageKey, blob);
      volatileBlobs.delete(descriptor);
    } else {
      delete descriptor.storageKey;
      descriptor.ephemeral = true;
      volatileBlobs.set(descriptor, blob);
    }
    return descriptor;
  };

  const save = async ({ b64Json, mediaType = 'image/png', aspectRatio = '' }) => {
    const id = randomUUID();
    const bytes = decodeBase64(b64Json);
    const blob = new Blob([bytes], { type: mediaType });
    const descriptor = {
      id,
      mediaType,
      size: blob.size
    };
    if (aspectRatio) descriptor.aspectRatio = aspectRatio;
    await put(descriptor, blob);
    return descriptor;
  };

  const getBlob = async (descriptor) => {
    const volatileBlob = descriptor && volatileBlobs.get(descriptor);
    if (volatileBlob instanceof Blob) return volatileBlob;
    if (!descriptor?.storageKey) return null;
    const value = await getItem(descriptor.storageKey);
    return value instanceof Blob ? value : null;
  };

  const persist = async (descriptor) => {
    if (!descriptor || (descriptor.storageKey && !descriptor.ephemeral)) return descriptor;
    const blob = await getBlob(descriptor);
    if (!blob) return descriptor;
    descriptor.storageKey = `generatedImage:${getUserName() || 'anonymous'}:${descriptor.id}`;
    delete descriptor.ephemeral;
    await setItem(descriptor.storageKey, blob);
    volatileBlobs.delete(descriptor);
    return descriptor;
  };

  const discard = (descriptor) => {
    if (descriptor) volatileBlobs.delete(descriptor);
  };

  const getDataUrl = async (descriptor) => {
    const blob = await getBlob(descriptor);
    if (!blob) return '';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${descriptor.mediaType || blob.type || 'image/png'};base64,${encodeBase64(bytes)}`;
  };

  const bind = async (root, descriptors = []) => {
    await Promise.all(descriptors.map(async descriptor => {
      const blob = await getBlob(descriptor);
      if (!blob) return;
      const objectUrl = createObjectURL(blob);
      root.querySelectorAll(`[data-generated-image-id="${descriptor.id}"]`)
        .forEach(element => {
          if (typeof element.addEventListener === 'function') {
            element.addEventListener('load', () => applyNaturalImageAspect(element), { once: true });
          }
          element.src = objectUrl;
          applyNaturalImageAspect(element);
        });
      root.querySelectorAll(`[data-generated-image-download="${descriptor.id}"]`)
        .forEach(element => {
          element.href = objectUrl;
          element.download = `astra-generated-${descriptor.id}.${extensionForMediaType(descriptor.mediaType)}`;
        });
    }));
  };

  return { bind, discard, getBlob, getDataUrl, persist, put, save };
}

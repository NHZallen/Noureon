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

export function createGeneratedImageAssetStore({
  setItem,
  getItem,
  getUserName = () => 'anonymous',
  randomUUID = () => crypto.randomUUID(),
  createObjectURL = (blob) => URL.createObjectURL(blob)
} = {}) {
  const save = async ({ b64Json, mediaType = 'image/png', aspectRatio = '' }) => {
    const id = randomUUID();
    const bytes = decodeBase64(b64Json);
    const blob = new Blob([bytes], { type: mediaType });
    const descriptor = {
      id,
      mediaType,
      size: blob.size,
      storageKey: `generatedImage:${getUserName() || 'anonymous'}:${id}`
    };
    if (aspectRatio) descriptor.aspectRatio = aspectRatio;
    await setItem(descriptor.storageKey, blob);
    return descriptor;
  };

  const getBlob = async (descriptor) => {
    if (!descriptor?.storageKey) return null;
    const value = await getItem(descriptor.storageKey);
    return value instanceof Blob ? value : null;
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
        .forEach(element => { element.src = objectUrl; });
      root.querySelectorAll(`[data-generated-image-download="${descriptor.id}"]`)
        .forEach(element => {
          element.href = objectUrl;
          element.download = `astra-generated-${descriptor.id}.${extensionForMediaType(descriptor.mediaType)}`;
        });
    }));
  };

  return { bind, getBlob, getDataUrl, save };
}

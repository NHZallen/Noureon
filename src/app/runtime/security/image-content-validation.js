const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

const EXTENSION_MIME_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
});

export const AVATAR_IMAGE_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
  maxPixels: 16 * 1024 * 1024,
  maxUrlLength: 2048
});

export class ImageContentValidationError extends Error {
  constructor(message, code = 'INVALID_IMAGE') {
    super(message);
    this.name = 'ImageContentValidationError';
    this.code = code;
  }
}

const fail = (message, code) => {
  throw new ImageContentValidationError(message, code);
};

function decodeBase64(value, limits) {
  if (typeof value !== 'string' || !value.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    fail('Image Base64 is invalid', 'INVALID_BASE64');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const decodedLength = (value.length / 4) * 3 - padding;
  if (decodedLength > limits.maxBytes) fail('Image exceeds the byte limit', 'IMAGE_SIZE_LIMIT');

  let binary;
  try {
    binary = atob(value);
  } catch {
    fail('Image Base64 cannot be decoded', 'INVALID_BASE64');
  }
  if (binary.length !== decodedLength) fail('Image Base64 length is inconsistent', 'INVALID_BASE64');
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

const readU16LE = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8);
const readU24LE = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const readU32BE = (bytes, offset) => (
  ((bytes[offset] << 24) >>> 0)
  + (bytes[offset + 1] << 16)
  + (bytes[offset + 2] << 8)
  + bytes[offset + 3]
);

function inspectPng(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail('PNG is missing IHDR', 'INVALID_IMAGE_STRUCTURE');
  return { mimeType: 'image/png', width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) };
}

function inspectGif(bytes) {
  if (bytes.length < 10) return null;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return { mimeType: 'image/gif', width: readU16LE(bytes, 6), height: readU16LE(bytes, 8) };
}

function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 1 >= bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) fail('JPEG segment is invalid', 'INVALID_IMAGE_STRUCTURE');
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (length < 7) fail('JPEG frame is invalid', 'INVALID_IMAGE_STRUCTURE');
      return {
        mimeType: 'image/jpeg',
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        height: (bytes[offset + 3] << 8) | bytes[offset + 4]
      };
    }
    offset += length;
  }
  fail('JPEG dimensions are missing', 'INVALID_IMAGE_STRUCTURE');
}

function inspectWebp(bytes) {
  if (bytes.length < 30) return null;
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff !== 'RIFF' || webp !== 'WEBP') return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X') {
    return { mimeType: 'image/webp', width: readU24LE(bytes, 24) + 1, height: readU24LE(bytes, 27) + 1 };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      mimeType: 'image/webp',
      width: readU16LE(bytes, 26) & 0x3fff,
      height: readU16LE(bytes, 28) & 0x3fff
    };
  }
  fail('WebP dimensions are missing', 'INVALID_IMAGE_STRUCTURE');
}

function inspectImage(bytes) {
  return inspectPng(bytes) || inspectGif(bytes) || inspectJpeg(bytes) || inspectWebp(bytes)
    || fail('Image magic bytes are not allowed', 'IMAGE_MAGIC_MISMATCH');
}

function enforceDimensions(metadata, limits) {
  const { width, height } = metadata;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    fail('Image dimensions are invalid', 'INVALID_IMAGE_DIMENSIONS');
  }
  if (width > limits.maxWidth || height > limits.maxHeight || width * height > limits.maxPixels) {
    fail('Image dimensions exceed the limit', 'IMAGE_DIMENSION_LIMIT');
  }
}

export function validateImageBase64({ base64, mimeType, limits = AVATAR_IMAGE_LIMITS }) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedMime)) {
    fail('Image MIME type is not allowed', 'IMAGE_MIME_NOT_ALLOWED');
  }
  const bytes = decodeBase64(base64, limits);
  const metadata = inspectImage(bytes);
  if (metadata.mimeType !== normalizedMime) {
    fail('Image MIME type does not match its content', 'IMAGE_MIME_MISMATCH');
  }
  enforceDimensions(metadata, limits);
  return { ...metadata, bytes, base64, mimeType: normalizedMime };
}

export function validateDataImageUrl(value, options = {}) {
  if (typeof value !== 'string') fail('Image data URL must be a string', 'INVALID_IMAGE_URL');
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
  if (!match) fail('Image data URL is invalid', 'INVALID_IMAGE_URL');
  const validated = validateImageBase64({ base64: match[2], mimeType: match[1], ...options });
  return `data:${validated.mimeType};base64,${validated.base64}`;
}

export function validateAvatarSource(value, { baseUrl = 'https://noureon.invalid/' } = {}) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') fail('Avatar URL must be a string', 'INVALID_IMAGE_URL');
  if (value.startsWith('data:')) return validateDataImageUrl(value);
  if (value.length > AVATAR_IMAGE_LIMITS.maxUrlLength || !/^(https:|blob:)/i.test(value)) {
    fail('Avatar URL scheme is not allowed', 'IMAGE_URL_SCHEME');
  }
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    fail('Avatar URL is invalid', 'INVALID_IMAGE_URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'blob:') {
    fail('Avatar URL scheme is not allowed', 'IMAGE_URL_SCHEME');
  }
  return url.href;
}

export async function verifyDataImageDecode(dataUrl, {
  createImageBitmapImpl = globalThis.createImageBitmap,
  BlobCtor = globalThis.Blob
} = {}) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
  if (!match) fail('Image data URL is invalid', 'INVALID_IMAGE_URL');
  const validated = validateImageBase64({ base64: match[2], mimeType: match[1] });
  if (typeof createImageBitmapImpl !== 'function' || typeof BlobCtor !== 'function') return dataUrl;

  let bitmap;
  try {
    bitmap = await createImageBitmapImpl(new BlobCtor([validated.bytes], { type: validated.mimeType }));
  } catch {
    fail('Image content cannot be decoded', 'IMAGE_DECODE_FAILED');
  }
  try {
    if (bitmap.width !== validated.width || bitmap.height !== validated.height) {
      fail('Decoded image dimensions do not match its header', 'IMAGE_DIMENSION_MISMATCH');
    }
  } finally {
    bitmap.close?.();
  }
  return dataUrl;
}

export async function validateAvatarSourceContent(value, options = {}) {
  const validated = validateAvatarSource(value, options);
  if (validated?.startsWith('data:')) await verifyDataImageDecode(validated, options);
  return validated;
}

function mimeTypeForZipReference(reference) {
  const normalized = String(reference || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    fail('Avatar ZIP path is invalid', 'ZIP_PATH');
  }
  const extension = normalized.split('.').pop()?.toLowerCase();
  const mimeType = EXTENSION_MIME_TYPES[extension];
  if (!mimeType) fail('Avatar ZIP format is not allowed', 'IMAGE_MIME_NOT_ALLOWED');
  return mimeType;
}

export async function validateBackupAstraAvatars(backup, zip) {
  for (const astra of backup?.astras || []) {
    if (astra._avatarZipRef) {
      if (!zip) fail('Avatar ZIP reference requires a ZIP archive', 'MISSING_IMAGE_FILE');
      const mimeType = mimeTypeForZipReference(astra._avatarZipRef);
      const file = zip.file(astra._avatarZipRef);
      if (!file) fail('Avatar ZIP entry is missing', 'MISSING_IMAGE_FILE');
      const base64 = await file.async('base64');
      const validated = validateImageBase64({ base64, mimeType });
      astra.avatarUrl = `data:${validated.mimeType};base64,${validated.base64}`;
      await verifyDataImageDecode(astra.avatarUrl);
      delete astra._avatarZipRef;
    } else {
      astra.avatarUrl = await validateAvatarSourceContent(astra.avatarUrl);
    }
  }
  return backup;
}

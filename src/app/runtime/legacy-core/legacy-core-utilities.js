export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

export const renderUserText = (value = '') => escapeHTML(value).replace(/\n/g, '<br>');

export function createTrustedHtmlSanitizer({ sanitizer } = {}) {
  return (value = '') => {
    if (sanitizer?.sanitize) {
      return sanitizer.sanitize(String(value));
    }
    return escapeHTML(value);
  };
}

export const readErrorBody = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || response.statusText } };
  }
};

export const getErrorMessage = (errorBody, fallback = 'API 請求失敗') => (
  errorBody?.error?.message ||
  errorBody?.message ||
  fallback
);

export const postJsonWithReadableError = async (url, data, options = {}) => {
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(options.headers || {}) },
    body: JSON.stringify(data),
    signal: options.signal
  };
  let response;
  try {
    response = await fetch(url, request);
  } catch (error) {
    if (options.allowOpaqueFallback !== false) {
      await fetch(url, { ...request, mode: 'no-cors' });
      return { ok: true, opaque: true };
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    throw new Error(getErrorMessage(errorBody, `HTTP ${response.status}`));
  }

  return response;
};

export const getBackupUsername = (rawData) => rawData?.backup_identity?.username || rawData?.user_credentials?.username || '';

export async function processInChunks(items, processFn, chunkSize = 50, onProgress) {
  const total = items.length;
  let index = 0;

  while (index < total) {
    const chunk = items.slice(index, index + chunkSize);
    await Promise.all(chunk.map((item) => processFn(item)));
    index += chunk.length;

    if (onProgress) {
      onProgress(index, total);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(255, 255, 255, ${alpha})`;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

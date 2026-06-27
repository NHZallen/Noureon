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

export const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(255, 255, 255, ${alpha})`;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

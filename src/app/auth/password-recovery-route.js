export const PASSWORD_RECOVERY_ROUTE = '/forgot-password';
export const PASSWORD_RESET_ROUTE = '/reset-password';
export const RECOVERY_EMAIL_KEY = 'noureon_password_recovery_email';
export const RECOVERY_LANGUAGE_KEY = 'noureon_password_recovery_language';
export const RECOVERY_VERIFICATION_KEY = 'noureon_password_recovery_verified';

const SUPPORTED_LANGUAGES = new Set(['zh-TW', 'en', 'fr', 'ru', 'es']);

export function normalizeRecoveryLanguage(value) {
  if (SUPPORTED_LANGUAGES.has(value)) return value;
  if (value?.toLowerCase().startsWith('zh')) return 'zh-TW';
  if (value?.toLowerCase().startsWith('fr')) return 'fr';
  if (value?.toLowerCase().startsWith('ru')) return 'ru';
  if (value?.toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

export function isPasswordRecoveryRoute(pathname) {
  return pathname === PASSWORD_RECOVERY_ROUTE || pathname === PASSWORD_RESET_ROUTE;
}

export function openPasswordRecovery(window, { email = '', language } = {}) {
  const nextLanguage = normalizeRecoveryLanguage(
    language || window.document.documentElement.lang || window.navigator.language
  );
  window.sessionStorage.setItem(RECOVERY_LANGUAGE_KEY, nextLanguage);
  if (email) window.sessionStorage.setItem(RECOVERY_EMAIL_KEY, email.trim());
  window.location.assign(PASSWORD_RECOVERY_ROUTE);
}

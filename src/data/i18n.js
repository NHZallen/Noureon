import i18n from './i18n/index.js';

if (typeof window !== 'undefined') {
  window.i18n = i18n;
}
globalThis.i18n = i18n;

export { i18n };
export default i18n;

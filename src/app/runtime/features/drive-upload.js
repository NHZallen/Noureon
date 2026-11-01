// "Google Drive" in the menu of the message box: the files picked in Google's own picker (runtime/projects/drive-picker.js, the same sign-in as the sources of a project) are put in the box like files
// chosen from the device (`handleFileSelection`). A file that cannot be taken is told by name. Page only.

import { getDrivePicker } from '../projects/drive-picker.js';

/** Returns { available(), warm(), pick() }; `available()` is whether the page has the keys for the picker. */
export function createDriveUpload({ document, getConfig, i18n, showNotification, handleFileSelection, getPicker = () => getDrivePicker({ document, getLanguage: () => getConfig()?.uiLanguage || 'en' }) }) {
  const picker = getPicker;
  const text = (key, values = {}) => String((i18n[getConfig()?.uiLanguage] || i18n['zh-TW'] || {})[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values[name] ?? ''));
  return {
    available: () => Boolean(picker()),
    /** Loads Google's scripts ahead (a window that signs in can be opened only at a tap). */
    warm: () => picker()?.warm?.(),
    async pick() {
      const drive = picker();
      if (!drive) return;
      const picked = await drive.pick().catch(() => ({ ok: false, code: 'failed' }));
      if (!picked.ok) {
        if (picked.code !== 'cancelled') showNotification(text('pjDriveFailed'), 'error');
        return;
      }
      for (const failure of picked.failed || []) showNotification(text('pjDriveReadFailed', { name: failure.name }), 'error');
      if (picked.files.length) handleFileSelection({ target: { files: picked.files, value: '' } });
    }
  };
}

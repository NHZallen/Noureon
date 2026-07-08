import { compressImage } from '../utils/image-compression.js';
import {
  getUserProfileLabel,
  renderUserAvatar,
  renderUserProfileSummary
} from './user-profile-view.js';

const PROFILE_PANEL_ID = 'settings-user-profile-panel';

function getDataUrlParts(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

async function compressAvatarDataUrl(dataUrl, imageCompressor) {
  const parts = getDataUrlParts(dataUrl);
  if (!parts || typeof imageCompressor !== 'function') return dataUrl;

  const compressed = await imageCompressor(parts.data, parts.mimeType, 320, 0.82);
  return `data:${compressed.mimeType};base64,${compressed.data}`;
}

function readFileAsDataUrl(file, FileReaderCtor) {
  return new Promise((resolve, reject) => {
    if (!file || typeof FileReaderCtor !== 'function') {
      reject(new Error('FileReader is not available.'));
      return;
    }

    const reader = new FileReaderCtor();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });
}

export function createSettingsUserProfileControls({
  document,
  window,
  elements = {},
  state,
  getUserKey,
  setItem,
  getText = (_key, fallback) => fallback,
  showNotification = () => {},
  imageCompressor = compressImage,
  FileReader: FileReaderCtor = window?.FileReader || globalThis.FileReader
} = {}) {
  let pendingAvatarUrl;

  const getCurrentUser = () => state?.currentUser || null;
  const getElement = (id) => document?.getElementById?.(id) || null;
  const getProfileElements = () => ({
    panel: getElement(PROFILE_PANEL_ID),
    displayNameInput: getElement('settings-user-display-name-input'),
    avatarPreview: getElement('settings-user-avatar-preview'),
    avatarInput: getElement('settings-user-avatar-input'),
    uploadButton: getElement('settings-user-avatar-upload-btn'),
    removeButton: getElement('settings-user-avatar-remove-btn'),
    saveButton: getElement('settings-user-profile-save-btn')
  });

  const renderPreview = (avatarUrl = pendingAvatarUrl) => {
    const { avatarPreview } = getProfileElements();
    const user = { ...getCurrentUser(), avatarUrl };
    renderUserAvatar(avatarPreview, user);
  };

  const syncUserProfileControls = () => {
    const user = getCurrentUser();
    const profileElements = getProfileElements();
    if (!profileElements.panel) return;

    pendingAvatarUrl = user?.avatarUrl || '';
    if (profileElements.displayNameInput) {
      profileElements.displayNameInput.value = user?.displayName || '';
      profileElements.displayNameInput.placeholder = getUserProfileLabel(user);
      profileElements.displayNameInput.disabled = !user;
    }
    if (profileElements.saveButton) {
      profileElements.saveButton.disabled = !user;
    }
    if (profileElements.uploadButton) {
      profileElements.uploadButton.disabled = !user;
    }
    if (profileElements.removeButton) {
      profileElements.removeButton.disabled = !user;
    }
    renderPreview();
  };

  const renderCurrentUserProfileSummary = () => renderUserProfileSummary({
    usernameDisplay: elements.usernameDisplay,
    avatarElement: document?.querySelector?.('.user-avatar'),
    user: getCurrentUser()
  });

  const persistCurrentUserProfile = async () => {
    const user = getCurrentUser();
    if (!user?.username || typeof getUserKey !== 'function' || typeof setItem !== 'function') {
      showNotification(getText('settingsSaveFailed', '無法儲存使用者資料。'), 'error');
      return false;
    }

    const { displayNameInput } = getProfileElements();
    const displayName = displayNameInput?.value?.trim() || '';
    if (displayName) {
      user.displayName = displayName;
    } else {
      delete user.displayName;
    }

    if (pendingAvatarUrl) {
      user.avatarUrl = pendingAvatarUrl;
    } else {
      delete user.avatarUrl;
    }

    await setItem(getUserKey(user.username), JSON.stringify(user));
    renderCurrentUserProfileSummary();
    syncUserProfileControls();
    showNotification(getText('settingsSaved', '設定已儲存！'), 'success');
    return true;
  };

  const handleAvatarSelected = async () => {
    const { avatarInput } = getProfileElements();
    const file = avatarInput?.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file, FileReaderCtor);
      pendingAvatarUrl = await compressAvatarDataUrl(dataUrl, imageCompressor);
      renderPreview();
    } catch (error) {
      showNotification(getText('avatarUploadFailed', '頭像讀取失敗，請再試一次。'), 'error');
    } finally {
      if (avatarInput) avatarInput.value = '';
    }
  };

  const bindUserProfileControls = () => {
    const profileElements = getProfileElements();
    if (!profileElements.panel || profileElements.panel.dataset.userProfileEventsBound === 'true') return;
    profileElements.panel.dataset.userProfileEventsBound = 'true';

    profileElements.uploadButton?.addEventListener('click', () => profileElements.avatarInput?.click());
    profileElements.avatarInput?.addEventListener('change', () => {
      void handleAvatarSelected();
    });
    profileElements.removeButton?.addEventListener('click', () => {
      pendingAvatarUrl = '';
      renderPreview();
    });
    profileElements.saveButton?.addEventListener('click', () => {
      void persistCurrentUserProfile();
    });
  };

  return {
    bindUserProfileControls,
    syncUserProfileControls,
    persistCurrentUserProfile,
    renderCurrentUserProfileSummary
  };
}

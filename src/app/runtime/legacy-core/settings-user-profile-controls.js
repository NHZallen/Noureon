import { compressImage } from '../utils/image-compression.js';
import {
  getUserProfileLabel,
  renderUserAvatar,
  renderUserProfileSummary
} from './user-profile-view.js';

const PROFILE_PANEL_ID = 'settings-user-profile-panel';
const AVATAR_CROP_MODAL_ID = 'settings-user-avatar-crop-modal';

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

async function syncSupabaseUserProfile({ user, displayName, avatarUrl } = {}) {
  if (user?.authProvider !== 'supabase') return false;
  const { getSupabaseClient, isSupabaseConfigured } = await import('../../auth/supabase-client.js');
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const metadata = {
    profile_display_name: displayName || null,
    full_name: displayName || null,
    name: displayName || null,
    profile_avatar_url: avatarUrl || null,
    avatar_url: avatarUrl || null,
    picture: avatarUrl || null
  };
  const { error } = await supabase.auth.updateUser({ data: metadata });
  if (error) throw error;
  return true;
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
  syncCloudUserProfile = syncSupabaseUserProfile,
  FileReader: FileReaderCtor = window?.FileReader || globalThis.FileReader,
  Cropper: CropperCtor = window?.Cropper || globalThis.Cropper
} = {}) {
  let pendingAvatarUrl;
  let avatarCropper = null;
  let cropSourceUrl = '';

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

  const ensureAvatarCropModal = () => {
    let modal = getElement(AVATAR_CROP_MODAL_ID);
    if (modal || typeof document?.createElement !== 'function') return modal;

    modal = document.createElement('div');
    modal.id = AVATAR_CROP_MODAL_ID;
    modal.className = 'modal hidden fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70]';
    modal.innerHTML = `
      <div class="bg-[var(--modal-bg)] rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 class="text-2xl font-bold mb-4">編輯使用者頭像</h2>
        <p class="text-sm text-[var(--text-secondary)] mb-4">拖曳選框調整頭像範圍，或用縮放滑桿調整圖片尺寸。</p>
        <div class="w-full h-80 max-h-[55vh] mb-4 bg-gray-200 rounded-md overflow-hidden">
          <img id="settings-user-avatar-crop-image" src="" alt="Avatar for cropping">
        </div>
        <label for="settings-user-avatar-zoom-slider" class="block text-sm font-medium mb-2">縮放</label>
        <input id="settings-user-avatar-zoom-slider" type="range" min="0.5" max="3" step="0.01" value="1" class="w-full mb-4">
        <div class="flex justify-end gap-3 mt-4">
          <button id="settings-user-avatar-crop-cancel-btn" type="button" class="bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]">取消</button>
          <button id="settings-user-avatar-crop-confirm-btn" type="button" class="px-4 py-2 rounded-md btn-primary">確認並套用</button>
        </div>
      </div>
    `;
    document.body?.appendChild?.(modal);
    return modal;
  };

  const getCropElements = () => {
    const modal = ensureAvatarCropModal();
    return {
      modal,
      image: getElement('settings-user-avatar-crop-image'),
      zoomSlider: getElement('settings-user-avatar-zoom-slider'),
      cancelButton: getElement('settings-user-avatar-crop-cancel-btn'),
      confirmButton: getElement('settings-user-avatar-crop-confirm-btn')
    };
  };

  const showCropModal = (show) => {
    const { modal } = getCropElements();
    if (!modal) return;
    if (show) {
      modal.classList.remove('hidden');
      (window?.requestAnimationFrame || globalThis.requestAnimationFrame || ((callback) => callback()))(() => {
        modal.classList.add('visible');
      });
      return;
    }
    modal.classList.remove('visible');
    (window?.setTimeout || globalThis.setTimeout || ((callback) => callback()))(() => {
      modal.classList.add('hidden');
    }, 220);
  };

  const destroyAvatarCropper = () => {
    avatarCropper?.destroy?.();
    avatarCropper = null;
  };

  const openAvatarCropper = (imageUrl) => {
    const cropElements = getCropElements();
    if (!cropElements.modal || !cropElements.image) return false;
    cropSourceUrl = imageUrl;
    cropElements.image.src = imageUrl;
    if (cropElements.zoomSlider) cropElements.zoomSlider.value = '1';
    showCropModal(true);
    destroyAvatarCropper();

    if (typeof CropperCtor === 'function') {
      avatarCropper = new CropperCtor(cropElements.image, {
        aspectRatio: 1,
        viewMode: 1,
        background: false,
        autoCropArea: 1,
        dragMode: 'move',
        movable: true,
        zoomable: true,
        zoomOnWheel: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        responsive: true
      });
    }
    return true;
  };

  const confirmAvatarCrop = async () => {
    let nextAvatarUrl = cropSourceUrl;
    const canvas = avatarCropper?.getCroppedCanvas?.({
      width: 192,
      height: 192,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });
    if (canvas?.toDataURL) {
      nextAvatarUrl = canvas.toDataURL('image/jpeg', 0.86);
    }
    pendingAvatarUrl = await compressAvatarDataUrl(nextAvatarUrl, imageCompressor);
    renderPreview();
    destroyAvatarCropper();
    cropSourceUrl = '';
    showCropModal(false);
  };

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

    try {
      await syncCloudUserProfile({ user, displayName, avatarUrl: user.avatarUrl || '' });
    } catch (error) {
      showNotification(error?.message || getText('profileSyncFailed', '使用者資料雲端同步失敗。'), 'error');
      return false;
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
      if (!openAvatarCropper(dataUrl)) {
        pendingAvatarUrl = await compressAvatarDataUrl(dataUrl, imageCompressor);
        renderPreview();
      }
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
    const cropElements = getCropElements();

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
    cropElements.zoomSlider?.addEventListener('input', (event) => {
      avatarCropper?.zoomTo?.(Number(event.target.value) || 1);
    });
    cropElements.confirmButton?.addEventListener('click', () => {
      void confirmAvatarCrop();
    });
    cropElements.cancelButton?.addEventListener('click', () => {
      destroyAvatarCropper();
      cropSourceUrl = '';
      showCropModal(false);
    });
    cropElements.modal?.addEventListener('click', (event) => {
      if (event.target === cropElements.modal) {
        destroyAvatarCropper();
        cropSourceUrl = '';
        showCropModal(false);
      }
    });
  };

  return {
    bindUserProfileControls,
    syncUserProfileControls,
    persistCurrentUserProfile,
    renderCurrentUserProfileSummary
  };
}

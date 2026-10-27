// The picture of the account on the page (docs/superpowers/specs/2026-10-27-user-avatar-design.md): it draws the round picture where the page
// shows one (the left menu under the list, the User tab), and, in the User tab, lets the person change it. It owns both places: the page only
// says that the person is known (the event `noureon:user-ready`, with `detail.user`), and the User tab's markup holds the places
// (`#user-avatar` and, beside it, the edit button, the menu and the file box). A picture is the one the person chose, else the Google photo, else the
// first letter of the name. A local account has no edit button.

import { getSupabaseClient } from '../../auth/supabase-client.js';
import { USER_READY_EVENT } from '../../runtime/features/user-ready.js';
import { createAvatarStore, googlePhotoOf } from './avatar-store.js';
import { avatarText } from './avatar-texts.js';

export { USER_READY_EVENT };
const SIDEBAR_SELECTOR = '.user-avatar';
const SETTINGS_ID = 'user-avatar';
const OUTPUT_SIZE = 256;
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024;
const ACCEPTED = /^image\/(png|jpe?g|webp|gif)$/i;

/** The first letter of the name, for the round place with no picture. */
export const letterOf = (user) => Array.from(String(user?.displayName || user?.email || user?.username || '').trim())[0]?.toUpperCase() || '?';

// The browser's storage, or none when it cannot be used (a private window, blocked site data).
const browserStorage = (document) => {
  try { return document.defaultView?.localStorage || null; } catch { return null; }
};

export function startUserAvatar({
  document,
  storage = browserStorage(document),
  getSupabase = () => getSupabaseClient(),
  getLanguage = () => 'en',
  showNotification = () => {},
  loadCropper = async () => (await import('cropperjs')).default,
  store = createAvatarStore({ getSupabase, storage, warn: (...args) => globalThis.console?.warn?.(...args) })
}) {
  const win = document.defaultView;
  let user = null;
  let cropper = null;
  let dialog = null;
  let saving = false;
  const t = (key, values) => avatarText(getLanguage(), key, values);

  // ----- drawing
  const paint = (element, picture, letter) => {
    const key = `${picture.kind}|${picture.src}|${letter}`;
    if (element.dataset.avatarState === key) return;
    element.dataset.avatarState = key;
    if (!picture.src) {
      element.classList.remove('has-picture');
      element.replaceChildren(document.createTextNode(letter));
      return;
    }
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => store.dropBroken(picture.src), { once: true });
    image.src = picture.src;
    element.classList.add('has-picture');
    element.replaceChildren(image);
  };

  const places = () => [document.querySelector(SIDEBAR_SELECTOR), document.getElementById(SETTINGS_ID)].filter(Boolean);

  const renderControls = () => {
    const edit = document.getElementById('user-avatar-edit');
    if (!edit) return;
    const { canEdit, custom, google } = store.snapshot();
    edit.hidden = !canEdit;
    edit.title = t('edit');
    edit.setAttribute('aria-label', t('edit'));
    const change = document.querySelector('#user-avatar-menu [data-avatar-action="change"]');
    const reset = document.querySelector('#user-avatar-menu [data-avatar-action="reset"]');
    if (change) change.textContent = t('change');
    if (reset) {
      reset.textContent = google ? t('useGoogle') : t('remove');
      reset.hidden = !custom;
    }
  };

  const render = () => {
    const picture = store.get();
    const letter = letterOf(user);
    for (const element of places()) paint(element, picture, letter);
    renderControls();
  };

  // ----- the edit button, its menu, and the crop window
  const closeMenu = () => {
    const menu = document.getElementById('user-avatar-menu');
    if (menu) menu.hidden = true;
    document.getElementById('user-avatar-edit')?.setAttribute('aria-expanded', 'false');
  };

  const closeDialog = () => {
    cropper?.destroy?.();
    cropper = null;
    dialog?.remove();
    dialog = null;
    saving = false;
  };

  const openDialog = async (imageUrl) => {
    closeDialog();
    dialog = document.createElement('div');
    dialog.className = 'ua-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = '<div class="ua-dialog"><h2 class="ua-title"></h2><p class="ua-desc"></p><div class="ua-crop"><img alt=""></div><div class="ua-actions"><button type="button" class="ua-cancel"></button><button type="button" class="ua-save"></button></div></div>';
    dialog.querySelector('.ua-title').textContent = t('cropTitle');
    dialog.querySelector('.ua-desc').textContent = t('cropDesc');
    dialog.querySelector('.ua-cancel').textContent = t('cancel');
    dialog.querySelector('.ua-save').textContent = t('save');
    const image = dialog.querySelector('img');
    image.src = imageUrl;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (event) => { if (event.target === dialog && !saving) closeDialog(); });
    dialog.querySelector('.ua-cancel').addEventListener('click', () => { if (!saving) closeDialog(); });
    dialog.querySelector('.ua-save').addEventListener('click', () => { void save(); });
    try {
      const Cropper = await loadCropper();
      cropper = new Cropper(image, { aspectRatio: 1, viewMode: 1, background: false, autoCropArea: 1, dragMode: 'move' });
    } catch (error) {
      globalThis.console?.warn?.('The crop window could not start.', error);
      closeDialog();
      showNotification(t('unreadable'), 'error');
    }
  };

  const toBlob = (canvas) => new Promise((resolve) => {
    // Webp is small; a browser that cannot make it gives png, which the bucket takes as well.
    canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.9);
  });

  const save = async () => {
    if (!cropper || saving) return;
    const button = dialog?.querySelector('.ua-save');
    saving = true;
    if (button) { button.disabled = true; button.textContent = t('saving'); }
    try {
      const canvas = cropper.getCroppedCanvas({ width: OUTPUT_SIZE, height: OUTPUT_SIZE, imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
      const blob = canvas ? await toBlob(canvas) : null;
      if (!blob || blob.size > MAX_OUTPUT_BYTES) throw new Error('The picture could not be made.');
      await store.set(blob);
      closeDialog();
      showNotification(t('saved'), 'success');
    } catch (error) {
      globalThis.console?.warn?.('Saving the picture failed.', error);
      saving = false;
      if (button) { button.disabled = false; button.textContent = t('save'); }
      showNotification(t('failed'), 'error');
    }
  };

  const chooseFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED.test(file.type || '')) { showNotification(t('notImage'), 'warning'); return; }
    if (file.size > MAX_INPUT_BYTES) { showNotification(t('tooBig'), 'warning'); return; }
    const url = await new Promise((resolve) => {
      const reader = new win.FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    if (!url) { showNotification(t('unreadable'), 'warning'); return; }
    await openDialog(url);
  };

  const reset = async () => {
    try {
      await store.clear();
      showNotification(t('removed'), 'success');
    } catch (error) {
      globalThis.console?.warn?.('Removing the picture failed.', error);
      showNotification(t('removeFailed'), 'error');
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    const edit = target?.closest?.('#user-avatar-edit');
    if (edit) {
      // With no picture of their own there is only one thing to do: choose one.
      if (!store.snapshot().custom) { document.getElementById('user-avatar-input')?.click(); return; }
      const menu = document.getElementById('user-avatar-menu');
      if (menu) {
        menu.hidden = !menu.hidden;
        edit.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      }
      return;
    }
    const action = target?.closest?.('#user-avatar-menu [data-avatar-action]')?.dataset.avatarAction;
    if (action === 'change') { closeMenu(); document.getElementById('user-avatar-input')?.click(); return; }
    if (action === 'reset') { closeMenu(); void reset(); return; }
    closeMenu();
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.id !== 'user-avatar-input') return;
    const file = input.files?.[0];
    input.value = '';
    void chooseFile(file);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (dialog && !saving) closeDialog();
    else closeMenu();
  });

  // ----- when the person is known, and when the User tab is made
  // The User tab says it every time it is refreshed: the database is asked again only after a minute, or for another account.
  let askedFor = '';
  let askedAt = 0;
  const known = async (next) => {
    user = next || null;
    render();
    const who = String(user?.supabaseUserId || user?.username || '');
    if (who === askedFor && Date.now() - askedAt < 60_000) return;
    askedFor = who;
    askedAt = Date.now();
    await store.load(user);
  };
  document.addEventListener(USER_READY_EVENT, (event) => { void known(event.detail?.user); });
  store.subscribe(render);
  // The User tab is built when the settings are first opened: its places are painted as soon as they are there.
  if (typeof win?.MutationObserver === 'function') {
    const settings = document.getElementById('settings-modal');
    if (settings) new win.MutationObserver(() => { const place = document.getElementById(SETTINGS_ID); if (place && place.dataset.avatarState === undefined) render(); }).observe(settings, { childList: true, subtree: true });
  }
  render();

  return { render, known, store, googlePhotoOf };
}

// The UID of the account under the email at the top of the User tab, with a button that copies it. The UID is made by the database
// when the account is made (supabase/migrations/20261006010000_add_user_uids.sql) and never changes; the browser only reads its own.
// An account without one (a local account, or the table is not there yet) shows no line.

const COPY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
const DONE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const COPIED_MS = 1600;
// What is shown in front of the number. It is only for the eye: the UID in the database and what the button copies are the 8 digits.
export const UID_PREFIX = 'NR';

export const userUidMarkup = (copyLabel) => `
          <span id="user-uid-row" class="us-uid hidden">
            <span class="us-uid-label">UID</span>
            <span id="user-uid-value" class="us-uid-value"></span>
            <button id="user-uid-copy" type="button" class="us-copy" data-no-press title="${copyLabel}" aria-label="${copyLabel}">${COPY_ICON}</button>
          </span>`;

const copyText = async (document, value) => {
  const clipboard = document.defaultView?.navigator?.clipboard;
  if (typeof clipboard?.writeText === 'function') {
    await clipboard.writeText(value);
    return;
  }
  // A page without the clipboard API (not secure, or an old browser): put the number in a field and use the old way.
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(field);
  field.select();
  const done = document.execCommand('copy');
  field.remove();
  if (!done) throw new Error('copy failed');
};

export function createUserUidControls({
  document,
  getSupabase,
  isConfigured = () => true,
  getText = (_key, fallback) => fallback,
  scheduleTimeout = (callback, delay) => setTimeout(callback, delay)
} = {}) {
  const text = (key, fallback) => getText(key, fallback) || fallback;
  const known = new Map();
  let bound = false;

  const show = (uid) => {
    const row = document.getElementById('user-uid-row');
    if (!row) return;
    row.classList.toggle('hidden', !uid);
    if (!uid) return;
    const value = document.getElementById('user-uid-value');
    value.dataset.uid = uid;
    value.textContent = `${UID_PREFIX}-${uid}`;
  };

  /** Reads the UID of the signed-in account (once per account) and shows it, or no line at all. */
  const refresh = async (user) => {
    const userId = user?.authProvider === 'supabase' ? user.supabaseUserId : '';
    if (!userId || !isConfigured()) {
      show('');
      return;
    }
    if (known.has(userId)) {
      show(known.get(userId));
      return;
    }
    show('');
    try {
      const { data, error } = await getSupabase().from('user_uids').select('uid').eq('user_id', userId).maybeSingle();
      const uid = !error && /^\d{8}$/.test(data?.uid || '') ? data.uid : '';
      if (uid) known.set(userId, uid);
      show(uid);
    } catch {
      show('');
    }
  };

  const bind = () => {
    const button = document.getElementById('user-uid-copy');
    if (!button || bound) return;
    bound = true;
    button.addEventListener('click', async () => {
      const value = document.getElementById('user-uid-value')?.dataset.uid || '';
      if (!value) return;
      const label = text('userUidCopied', '已複製 UID');
      try {
        await copyText(document, value);
      } catch {
        return;
      }
      button.innerHTML = DONE_ICON;
      button.classList.add('is-copied');
      button.setAttribute('title', label);
      button.setAttribute('aria-label', label);
      scheduleTimeout(() => {
        button.innerHTML = COPY_ICON;
        button.classList.remove('is-copied');
        button.setAttribute('title', text('userUidCopy', '複製 UID'));
        button.setAttribute('aria-label', text('userUidCopy', '複製 UID'));
      }, COPIED_MS);
    });
  };

  return { refresh, bind };
}

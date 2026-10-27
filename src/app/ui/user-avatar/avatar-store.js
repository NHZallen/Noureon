// The picture of the signed-in account (docs/superpowers/specs/2026-10-27-user-avatar-design.md): what is shown, and the reading and writing of it.
//
//   custom: the picture the person chose (a small webp, kept in the private bucket `user-avatars` at `<person>/avatar.webp`; the row of
//           `user_profiles` says whether there is one and its version, so every device knows when to fetch it again);
//   google: the photo of their Google account (from the sign-in), the default when there is no custom picture;
//   neither: the first letter of the name (the view's job).
//
// A local account (not signed in to the cloud) has neither. The last picture fetched is kept in the browser's storage under the account's id, so
// the page shows it at once; the database says when it is old. No `window`, no `document`: shared by the page and its tests.

export const AVATAR_BUCKET = 'user-avatars';
export const avatarPathOf = (userId) => `${userId}/avatar.webp`;
const CACHE_PREFIX = 'noureon.userAvatar.v1.';
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readBlobAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('The picture could not be read.'));
  reader.readAsDataURL(blob);
});

/** The https address of the Google photo in the session's user data, or ''. */
export const googlePhotoOf = (user) => {
  const meta = user?.user_metadata || {};
  const url = String(meta.avatar_url || meta.picture || '');
  return /^https:\/\//i.test(url) ? url : '';
};

export function createAvatarStore({ getSupabase, storage = null, blobToDataUrl = readBlobAsDataUrl, warn = () => {} }) {
  let state = { userId: '', custom: '', version: 0, google: '' };
  const listeners = new Set();
  let loading = null;

  const emit = () => { for (const listener of [...listeners]) { try { listener(get()); } catch (error) { warn('An avatar listener failed.', error); } } };
  const cacheKey = (userId) => `${CACHE_PREFIX}${userId}`;
  const readCache = (userId) => {
    try {
      const saved = JSON.parse(storage?.getItem(cacheKey(userId)) || 'null');
      return saved && typeof saved.dataUrl === 'string' && saved.dataUrl.startsWith('data:image/') && Number.isInteger(saved.version) ? saved : null;
    } catch { return null; }
  };
  const writeCache = (userId, entry) => {
    try {
      if (entry) storage?.setItem(cacheKey(userId), JSON.stringify(entry));
      else storage?.removeItem(cacheKey(userId));
    } catch { /* A full or blocked storage only means the picture is fetched again next time. */ }
  };

  /** What to show: { src, kind } with kind `custom`, `google` or `none`. */
  const get = () => (state.custom ? { src: state.custom, kind: 'custom' } : state.google ? { src: state.google, kind: 'google' } : { src: '', kind: 'none' });
  const snapshot = () => ({ ...state, canEdit: Boolean(state.userId) });

  const cloudUserId = (user) => {
    const id = user?.authProvider === 'supabase' ? String(user.supabaseUserId || '') : '';
    return USER_ID.test(id) ? id : '';
  };

  const fetchPicture = async (client, userId, path) => {
    const { data, error } = await client.storage.from(AVATAR_BUCKET).download(path);
    if (error || !data) throw error || new Error('No picture came back.');
    return blobToDataUrl(data);
  };

  const run = async (user) => {
    const userId = cloudUserId(user);
    if (!userId) {
      state = { userId: '', custom: '', version: 0, google: '' };
      emit();
      return;
    }
    const sameUser = state.userId === userId;
    const cached = readCache(userId);
    // What is known at once: the picture kept in this browser (and nothing of another account).
    state = { userId, custom: sameUser ? state.custom : cached?.dataUrl || '', version: sameUser ? state.version : cached?.version || 0, google: sameUser ? state.google : '' };
    emit();
    const client = getSupabase();
    if (!client) return;
    try {
      const { data: session } = (await client.auth.getSession?.()) || {};
      const google = googlePhotoOf(session?.session?.user);
      if (google !== state.google) { state = { ...state, google }; emit(); }
    } catch (error) { warn('The Google photo could not be read.', error); }
    try {
      const { data: row, error } = await client.from('user_profiles').select('avatar_path, avatar_version').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!row?.avatar_path) {
        if (state.custom) { state = { ...state, custom: '', version: 0 }; writeCache(userId, null); emit(); }
        return;
      }
      if (row.avatar_path === avatarPathOf(userId) && state.custom && state.version === row.avatar_version) return;
      const dataUrl = await fetchPicture(client, userId, avatarPathOf(userId));
      if (state.userId !== userId) return;
      state = { ...state, custom: dataUrl, version: row.avatar_version };
      writeCache(userId, { version: row.avatar_version, dataUrl });
      emit();
    } catch (error) {
      // The table or the bucket is not there yet, or the network failed: what was shown stays.
      warn('The picture of the account could not be read.', error);
    }
  };

  /** Reads the picture of the account (the one in this browser first, then the database). Never throws. */
  const load = (user) => {
    loading = run(user).finally(() => { loading = null; });
    return loading;
  };

  /** Puts a new picture (a Blob: webp, or png when the browser cannot make webp). Throws when it could not be saved. */
  const set = async (blob) => {
    const { userId } = state;
    const client = getSupabase();
    if (!userId || !client) throw new Error('No cloud account.');
    const path = avatarPathOf(userId);
    const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp', cacheControl: '3600' });
    if (uploadError) throw uploadError;
    const { data, error } = await client.from('user_profiles').upsert({ user_id: userId, avatar_path: path }, { onConflict: 'user_id' }).select('avatar_version').single();
    if (error) throw error;
    const dataUrl = await blobToDataUrl(blob);
    state = { ...state, custom: dataUrl, version: Number(data?.avatar_version) || state.version + 1 };
    writeCache(userId, { version: state.version, dataUrl });
    emit();
  };

  /** Goes back to the default (the Google photo, or the letter). The row is changed first, so the picture is gone even when the file cannot be deleted at once. */
  const clear = async () => {
    const { userId } = state;
    const client = getSupabase();
    if (!userId || !client) throw new Error('No cloud account.');
    const { error } = await client.from('user_profiles').update({ avatar_path: null }).eq('user_id', userId);
    if (error) throw error;
    state = { ...state, custom: '', version: 0 };
    writeCache(userId, null);
    emit();
    try { await client.storage.from(AVATAR_BUCKET).remove([avatarPathOf(userId)]); } catch (removeError) { warn('The file of the picture was left (it is cleared later).', removeError); }
  };

  /** A picture address that failed to load (a Google photo that is gone): it is not shown again in this session. */
  const dropBroken = (src) => {
    if (src && src === state.google) { state = { ...state, google: '' }; emit(); }
  };

  return { load, set, clear, get, snapshot, dropBroken, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, whenLoaded: () => loading || Promise.resolve() };
}

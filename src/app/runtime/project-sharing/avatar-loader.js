// The picture of another person of a shared project: a file in the private bucket `user-avatars` that the project's people may read (supabase/migrations/20261106030000_add_project_member_avatars.sql).
// It is read once for each version of the picture and kept as a data URL; a person without a picture, or a file that cannot be read, gives '' and the avatar shows the first letter of the name.

const BUCKET = 'user-avatars';
const asDataUrl = (blob) => new Promise((resolve) => {
  try {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  } catch { resolve(''); }
});

export function createAvatarLoader({ getSupabase, blobToDataUrl = asDataUrl }) {
  const cache = new Map();
  return function avatarOf(userId, version) {
    if (!userId || !Number(version)) return Promise.resolve('');
    const key = `${userId}:${version}`;
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        try {
          const client = getSupabase();
          if (!client) return '';
          const { data, error } = await client.storage.from(BUCKET).download(`${userId}/avatar.webp`);
          return error || !data ? '' : await blobToDataUrl(data);
        } catch { return ''; }
      })());
    }
    return cache.get(key);
  };
}

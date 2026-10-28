// The pictures of the accounts (docs/superpowers/specs/2026-10-27-user-avatar-design.md): the private bucket `user-avatars`, one file for each person at
// `<person>/avatar.webp`. The page writes and reads them itself (the rules of the bucket let a person touch only their own file); the server only clears the files
// that nothing points to any more (an account deleted takes its row of `user_profiles`, not its file), through the asset sweeper.

export const AVATAR_BUCKET = 'user-avatars';
const AVATAR_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.webp$/i;

export function createAvatarFileStore({ url, serviceKey, fetchImpl = fetch, timeoutMs = 60_000 }) {
  return {
    /** Removes files of the bucket through the storage API: only names of the form `<person>/avatar.webp`. Resolves how many it was asked to remove. */
    async removeAll(paths) {
      const prefixes = (Array.isArray(paths) ? paths : []).map(String).filter((path) => AVATAR_NAME.test(path));
      if (!prefixes.length) return 0;
      const response = await fetchImpl(`${url}/storage/v1/object/${AVATAR_BUCKET}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw Object.assign(new Error(`The files could not be removed (${response.status}).`), { status: response.status });
      return prefixes.length;
    }
  };
}

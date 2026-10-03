// The server's settings, all from the environment (Zeabur's variables). Nothing here is read from a file, so a secret is never in the code.

const list = (value, fallback = []) => {
  const items = String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
};

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze(['https://noureon.com', 'https://www.noureon.com']);

/** Reads and checks the settings; throws a message naming what is missing, so a bad deployment fails at once and says why. */
export function loadConfig(env = process.env) {
  const problems = [];
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  // The same public key the site uses (VITE_SUPABASE_PUBLISHABLE_KEY on the web side).
  const supabaseAnonKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '');
  if (!/^https:\/\/[^\s/]+$/i.test(supabaseUrl)) problems.push('SUPABASE_URL must be the project address, https://…');
  if (!supabaseAnonKey) problems.push('SUPABASE_PUBLISHABLE_KEY is missing');
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT must be a port number');
  if (problems.length) throw new Error(`Server settings are not right: ${problems.join('; ')}`);
  return Object.freeze({
    port,
    supabaseUrl,
    supabaseAnonKey,
    allowedOrigins: Object.freeze(list(env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS)),
    // The version of the server (shown by /healthz): the Git commit when the deployment gives it.
    build: String(env.SOURCE_COMMIT || env.GIT_COMMIT || 'dev').slice(0, 12)
  });
}

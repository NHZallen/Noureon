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
  // Running replies needs the service key (to write the person's messages) and a master key (to seal the keys kept for a reply);
  // without both the server still answers /healthz and /v1/whoami, and says replies are unavailable.
  const serviceKey = String(env.SUPABASE_SERVICE_KEY || '');
  const encryptionVersion = Number(env.KEY_ENCRYPTION_KEY_VERSION || 1);
  const encryptionKeys = [];
  if (env.KEY_ENCRYPTION_KEY) encryptionKeys.push({ version: encryptionVersion, key: String(env.KEY_ENCRYPTION_KEY) });
  if (env.KEY_ENCRYPTION_KEY_PREVIOUS && encryptionVersion > 1) encryptionKeys.push({ version: encryptionVersion - 1, key: String(env.KEY_ENCRYPTION_KEY_PREVIOUS) });
  if (Boolean(serviceKey) !== (encryptionKeys.length > 0)) problems.push('SUPABASE_SERVICE_KEY and KEY_ENCRYPTION_KEY go together: set both or neither');
  if (!Number.isInteger(encryptionVersion) || encryptionVersion < 1) problems.push('KEY_ENCRYPTION_KEY_VERSION must be a whole number from 1');
  // The sandbox host (sandbox-host/README.md): where Python runs for replies in Advanced mode. Both or neither.
  const sandboxUrl = String(env.SANDBOX_RUNNER_URL || '').replace(/\/+$/, '');
  const sandboxToken = String(env.SANDBOX_RUNNER_TOKEN || '');
  if (Boolean(sandboxUrl) !== Boolean(sandboxToken)) problems.push('SANDBOX_RUNNER_URL and SANDBOX_RUNNER_TOKEN go together: set both or neither');
  if (sandboxUrl && !/^https?:\/\/[^\s/]+(?::\d+)?$/i.test(sandboxUrl)) problems.push('SANDBOX_RUNNER_URL must be an address like http://10.42.0.1:7788');
  if (sandboxToken && sandboxToken.length < 32) problems.push('SANDBOX_RUNNER_TOKEN is too short');
  // The connectors (連接器): where the services send the person back after a login, and the address of our client metadata document (docs/superpowers/specs/2026-10-10-mcp-connectors-design.md).
  const appUrl = String(env.APP_URL || 'https://noureon.com').replace(/\/+$/, '');
  const connectorRedirectUri = String(env.CONNECTOR_REDIRECT_URI || 'https://api.noureon.com/mcp/callback');
  const connectorClientId = String(env.CONNECTOR_CLIENT_ID || `${appUrl}/.well-known/oauth-client.json`);
  // Services that have no registration of their own (GitHub): the client made by hand in the service's portal, one id and one secret for every person; both or neither. The secret only ever lives here.
  const preregistered = {};
  for (const id of ['github']) {
    const key = `CONNECTOR_${id.toUpperCase()}_CLIENT`;
    const clientId = String(env[`${key}_ID`] || '');
    const clientSecret = String(env[`${key}_SECRET`] || '');
    if (Boolean(clientId) !== Boolean(clientSecret)) problems.push(`${key}_ID and ${key}_SECRET go together: set both or neither`);
    if (clientId && clientSecret) preregistered[id] = Object.freeze({ clientId, clientSecret });
  }
  for (const [name, value] of [['APP_URL', appUrl], ['CONNECTOR_REDIRECT_URI', connectorRedirectUri], ['CONNECTOR_CLIENT_ID', connectorClientId]]) if (!/^https:\/\/[^\s]+$/i.test(value)) problems.push(`${name} must be an https address`);
  if (problems.length) throw new Error(`Server settings are not right: ${problems.join('; ')}`);
  return Object.freeze({
    port,
    supabaseUrl,
    supabaseAnonKey,
    serviceKey,
    encryptionKeys: Object.freeze(encryptionKeys),
    runsConfigured: Boolean(serviceKey && encryptionKeys.length),
    sandboxUrl,
    sandboxToken,
    appUrl,
    connectorRedirectUri,
    connectorClientId,
    connectorPreregistered: Object.freeze(preregistered),
    allowedOrigins: Object.freeze(list(env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS)),
    // The version of the server (shown by /healthz): the Git commit when the deployment gives it.
    build: String(env.SOURCE_COMMIT || env.GIT_COMMIT || 'dev').slice(0, 12)
  });
}

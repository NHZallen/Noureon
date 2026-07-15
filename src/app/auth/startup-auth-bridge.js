const loadDefaultAuthBridgeModule = () => import('./supabase-auth-bridge.js');

export async function initializeStartupAuthBridge({
  window = globalThis.window,
  document = globalThis.document,
  startupIdentity,
  loadAuthBridgeModule = loadDefaultAuthBridgeModule
} = {}) {
  const { initializeSupabaseAuthBridge } = await loadAuthBridgeModule();
  return initializeSupabaseAuthBridge({ window, document, startupIdentity });
}

export function initializeLocalAuthBridgeInBackground({
  logger = console,
  ...options
} = {}) {
  return initializeStartupAuthBridge(options).catch((error) => {
    logger.warn?.(
      'Noureon cloud sign-in controls failed to initialize in the background:',
      error
    );
    return Object.freeze({
      enabled: false,
      session: null,
      reason: 'background-auth-failed'
    });
  });
}

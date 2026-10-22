// Where the answer to a picture question (ui/sandbox/image-ask-card.js) meets the settings: "always allow" is kept as the person's permission for pictures
// (config.permissions.imageGeneration). Nothing is registered (a test, a page without the composer): nothing is kept.

let bridge = null;

export const registerToolModelsBridge = (value) => { bridge = value; };

/** Keeps "always allow" for pictures in the settings and saves them; false when it could not be kept. */
export async function rememberImageAlways() {
  const config = bridge?.getConfig?.();
  if (!config) return false;
  config.permissions = { ...(config.permissions || {}), imageGeneration: 'always' };
  try {
    await bridge.saveConfig?.();
    return true;
  } catch (error) {
    bridge.logger?.warn?.('Saving the permission for pictures failed.', error);
    return false;
  }
}

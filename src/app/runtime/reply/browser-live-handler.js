// What the page does when the server says a browser of the reply can be looked at: joins its card to the live screen (src/app/ui/browser-live/live-connect.js, loaded only then).
// `getRun()` is the run of the server (its `api` is the signed-in request of the page); `getDocument()` the document of the page.
export function createBrowserLiveHandler({ getRun, getDocument }) {
  return (card, sessionId) => {
    const run = getRun();
    if (!run?.api || !sessionId) return null;
    // The connection comes back (a promise of { stop }): the card keeps one, so a screen told twice is not looked at twice.
    return import('../../ui/browser-live/live-connect.js').then(({ connectBrowserLive }) => connectBrowserLive({
      card,
      sessionId,
      document: getDocument(),
      api: (method, path, body) => getRun().api(method, path, body),
      readClipboard: () => (globalThis.navigator?.clipboard?.readText ? globalThis.navigator.clipboard.readText() : Promise.resolve(''))
    })).catch(() => null);
  };
}

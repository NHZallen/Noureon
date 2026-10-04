// The one place the pieces of the page that talk to Noureon's server for the CLI tools (the permissions tab of the settings, the card that
// asks about a site) meet the account's connection: it is registered when the page's server-reply is made (server-reply-runtime.js). Nothing
// registered (a test, a page with no account): every call says the server is not available.

let request = null;

export const registerServerRequest = (fn) => { request = typeof fn === 'function' ? fn : null; };

/** A call to the server with the account's token: resolves { ok, status, code, data } (see server-reply.js). */
export async function serverRequest(method, path, options = {}) {
  if (!request) return { ok: false, status: 0, code: 'unavailable' };
  return request(method, path, options);
}

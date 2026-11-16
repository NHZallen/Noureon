// The part of neko's REST interface that browser-host uses (neko 3.2.0, found on the real host: design doc 12.2). It is called from this machine, to the container's own address
// on the isolated network, with the api token of that browser (the token never leaves this machine). `fetchImpl` is replaceable, so the tests use a fake.

export class NekoError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const checkId = (id, what = 'id') => { if (typeof id !== 'string' || !ID.test(id)) throw new Error(`bad ${what}`); return id; };

export function createNekoApi({ baseUrl, apiToken, fetchImpl = fetch, timeoutMs = 8000 }) {
  if (!/^http:\/\/[0-9.]+:\d+$/.test(baseUrl)) throw new Error('bad neko address');
  async function call(method, path, { body, auth = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api${path}`, {
        method, signal: controller.signal,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(auth ? { authorization: `Bearer ${apiToken}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = null; } }
      if (!response.ok) throw new NekoError(response.status, String(data?.message || `neko answered ${response.status}`).slice(0, 160));
      return data;
    } catch (error) {
      if (error instanceof NekoError) throw error;
      throw new NekoError(0, error?.name === 'AbortError' ? 'neko did not answer in time' : 'neko could not be reached');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** A member who may watch and (when given control) point and type; `profile` is neko's. The password is only for the login that follows at once. */
    async createMember({ username, password, profile }) {
      checkId(username, 'username');
      if (typeof password !== 'string' || password.length < 16) throw new Error('bad password');
      return call('POST', '/members', { body: { username, password, profile: { name: username, is_admin: false, can_login: true, can_connect: true, can_watch: true, can_host: true, can_share_media: false, can_access_clipboard: true, sends_inactive_cursor: false, can_see_inactive_cursors: false, ...profile } } });
    },
    /** Removing the member ends their connection at once and makes their token worth nothing. */
    deleteMember: async (id) => call('DELETE', `/members/${checkId(id)}`),
    listSessions: async () => (await call('GET', '/sessions')) || [],
    /** The session token of a member (what the viewer's page opens the WebSocket with). */
    async login(username, password) {
      const data = await call('POST', '/login', { auth: false, body: { username: checkId(username, 'username'), password } });
      if (!data?.token) throw new NekoError(502, 'neko gave no token');
      return { id: data.id, token: data.token };
    },
    settings: (patch) => call('POST', '/room/settings', { body: patch }),
    /** The member who points and types now (neko sends their input to the browser); nobody else's input counts while the controls are locked. */
    give: async (id) => call('POST', `/room/control/give/${checkId(id)}`),
    reset: () => call('POST', '/room/control/reset'),
    setScreen: ({ width, height, rate = 20 }) => call('POST', '/room/screen', { body: { width, height, rate } }),
    getScreen: () => call('GET', '/room/screen')
  };
}

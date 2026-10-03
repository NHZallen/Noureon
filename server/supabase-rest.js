// The database as the server reaches it: the service key (kept in the environment), over the project's REST interface. Only what the
// server needs: calling a function, and reading or changing rows of one table by a filter. Errors carry the database's code and
// message but never the request.

export class DatabaseError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'DatabaseError';
    this.status = status;
    this.code = code;
  }
}

export function createServiceClient({ url, serviceKey, fetchImpl = fetch, timeoutMs = 20_000 }) {
  const headers = (extra = {}) => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...extra });

  async function call(path, { method = 'GET', body, extraHeaders } = {}) {
    let response;
    try {
      response = await fetchImpl(`${url}/rest/v1/${path}`, {
        method,
        headers: headers(extraHeaders),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new DatabaseError('The database could not be reached.', { code: 'unreachable' });
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) throw new DatabaseError(String(data?.message || `The database answered ${response.status}.`).slice(0, 300), { status: response.status, code: String(data?.code || '') });
    return data;
  }

  const filterQuery = (filters) => Object.entries(filters || {}).map(([column, condition]) => `${encodeURIComponent(column)}=${encodeURIComponent(condition)}`).join('&');

  return {
    /** Calls a database function with named arguments; returns what it returns. */
    rpc: (name, args = {}) => call(`rpc/${encodeURIComponent(name)}`, { method: 'POST', body: args }),
    /** Rows of a table. `filters`: { column: 'eq.value' } (PostgREST filter syntax), `select`: the columns. */
    select: (table, { filters, select = '*', limit } = {}) => call(`${encodeURIComponent(table)}?select=${encodeURIComponent(select)}${filters ? `&${filterQuery(filters)}` : ''}${limit ? `&limit=${Number(limit)}` : ''}`),
    /** Changes the rows that match; returns the changed rows (minimal columns). */
    update: (table, filters, values, { returning = 'id' } = {}) => call(`${encodeURIComponent(table)}?${filterQuery(filters)}&select=${encodeURIComponent(returning)}`, { method: 'PATCH', body: values, extraHeaders: { Prefer: 'return=representation' } })
  };
}

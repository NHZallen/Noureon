// A stand-in for the table workspace_memory_records as the page's Supabase client and the server's service client reach it: the version and the time are the table's
// (a row added is version 1, a row changed is the version before and one), a row that is there is not added again (23505), and an update that asks for a version that is
// not the current one changes nothing. Enough of the query builder for what the memory uses.

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createFakeTable({ now = () => new Date().toISOString() } = {}) {
  const rows = new Map();
  const listeners = [];
  const keyOf = (userId, recordKey) => `${userId}\u0000${recordKey}`;
  const publish = (event, row) => { for (const listener of listeners) if (listener.event === event && row.user_id === listener.userId) listener.handler({ new: clone(row) }); };

  const insert = (row) => {
    const key = keyOf(row.user_id, row.record_key);
    if (rows.has(key)) return { error: { code: '23505', message: 'duplicate key' } };
    const stored = { user_id: row.user_id, record_key: row.record_key, payload: clone(row.payload ?? {}), version: 1, updated_at: now(), deleted_at: row.deleted_at ?? null };
    rows.set(key, stored);
    publish('INSERT', stored);
    return { data: [clone(stored)] };
  };
  const update = (values, filters) => {
    const changed = [];
    for (const stored of rows.values()) {
      if (!Object.entries(filters).every(([column, value]) => String(stored[column]) === String(value))) continue;
      if ('payload' in values) stored.payload = clone(values.payload);
      if ('deleted_at' in values) stored.deleted_at = values.deleted_at;
      stored.version += 1;
      stored.updated_at = now();
      changed.push(clone(stored));
      publish('UPDATE', stored);
    }
    return { data: changed };
  };
  const select = (filters, { order, from, to, limit } = {}) => {
    let found = [...rows.values()].filter((stored) => Object.entries(filters).every(([column, value]) => (value === 'is.null' ? stored[column] === null : value.startsWith?.('like.') ? stored[column].startsWith(value.slice(5).replace('*', '')) : String(stored[column]) === String(value))));
    if (order) found = found.sort((left, right) => String(left[order]).localeCompare(String(right[order])));
    if (from !== undefined) found = found.slice(from, to + 1);
    if (limit) found = found.slice(0, limit);
    return { data: found.map(clone) };
  };

  // The client of the page (supabase-js).
  const supabase = {
    from() {
      const state = { filters: {}, op: 'select', values: null };
      const builder = {
        select() { return builder; },
        insert(row) { state.op = 'insert'; state.values = row; return builder; },
        update(values) { state.op = 'update'; state.values = values; return builder; },
        eq(column, value) { state.filters[column] = value; return builder; },
        order(column) { state.order = column; return builder; },
        range(from, to) { state.from = from; state.to = to; return builder; },
        limit(count) { state.limit = count; return builder; },
        then(resolve, reject) {
          const run = state.op === 'insert' ? insert(state.values) : state.op === 'update' ? update(state.values, state.filters) : select(state.filters, state);
          return Promise.resolve(run).then(resolve, reject);
        }
      };
      return builder;
    },
    channel() {
      const subscription = { handlers: [] };
      const channel = {
        on(_type, options, handler) { subscription.handlers.push({ event: options.event, userId: String(options.filter).replace('user_id=eq.', ''), handler }); return channel; },
        subscribe(callback) { listeners.push(...subscription.handlers); callback?.('SUBSCRIBED'); return channel; },
        subscription
      };
      return channel;
    },
    removeChannel(channel) { for (const handler of channel.subscription.handlers) listeners.splice(listeners.indexOf(handler), 1); return Promise.resolve(); }
  };

  // The service client of the server (server/supabase-rest.js).
  const filtersOf = (given) => Object.fromEntries(Object.entries(given || {}).map(([column, condition]) => [column, String(condition).replace(/^eq\./, '')]));
  const service = {
    select: async (_table, { filters, limit, order } = {}) => select(filtersOf(Object.fromEntries(Object.entries(filters || {}).map(([column, condition]) => [column, condition.startsWith('like.') || condition === 'is.null' ? condition : condition]))), { limit, order }).data,
    insert: async (_table, row) => {
      const result = insert(row);
      if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
      return result.data;
    },
    update: async (_table, filters, values) => update(values, filtersOf(filters)).data
  };

  return { supabase, service, rows, write: insert };
}

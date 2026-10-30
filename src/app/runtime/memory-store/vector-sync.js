// The vectors of the past conversations in the cloud account (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.9, table workspace_memory_vectors): only when the person
// turned on "sync the vectors" (a choice of its own, next to the search by meaning). It lets a second device take the vectors another device made instead of paying for them again, and
// lets the server search the past conversations while the page is closed. The page keeps its own copy (vector-store.js) and searches that; the cloud is only fetched from and written to,
// so when the cloud cannot be reached nothing is lost, the page goes on with what it has. A local account has no cloud account, so it has no sync (the vectors stay in the browser).
// Every call resolves; the page decides what a failure means. No `window`: the page gives the Supabase client.

const TABLE = 'workspace_memory_vectors';
const PAGE = 100;
const BATCH = 40;

const literal = (vector) => `[${Array.from(vector, (value) => Number(value.toFixed(6))).join(',')}]`;
const parse = (value) => {
  if (Array.isArray(value)) return Float32Array.from(value);
  if (typeof value !== 'string') return new Float32Array(0);
  try {
    return Float32Array.from(JSON.parse(value));
  } catch {
    return new Float32Array(0);
  }
};
const failIf = (error) => { if (error) throw Object.assign(new Error(error.message || 'The cloud refused the request'), { status: error.status || 0 }); };

/** The cloud copy of the vectors of one person made by `model` (the version string of embedding-client.js). */
export function createVectorSync({ supabase, userId, model }) {
  const mine = () => supabase.from(TABLE);

  /** Every { id, hash, failed } the cloud has for this model. */
  async function index() {
    const out = new Map();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await mine().select('piece_id,hash,failed').eq('user_id', userId).eq('model', model).order('piece_id').range(from, from + PAGE - 1);
      failIf(error);
      for (const row of data || []) out.set(row.piece_id, { hash: row.hash, failed: row.failed === true });
      if ((data || []).length < PAGE) return out;
    }
  }

  return {
    index,
    /** Takes into `store` the vectors the cloud has that this device lacks (or has for another text). Returns how many. */
    async pull(store, wanted) {
      const have = await index();
      const need = [...have.entries()].filter(([id, row]) => (!wanted || wanted.has(id)) && !store.has(id, row.hash)).map(([id]) => id);
      let taken = 0;
      for (let at = 0; at < need.length; at += PAGE) {
        const ids = need.slice(at, at + PAGE);
        const { data, error } = await mine().select('piece_id,hash,failed,embedding').eq('user_id', userId).eq('model', model).in('piece_id', ids);
        failIf(error);
        taken += await store.putMany((data || []).map((row) => ({ id: row.piece_id, hash: row.hash, ...(row.failed ? { failed: true } : {}), vector: row.failed ? new Float32Array(0) : parse(row.embedding) })).filter((record) => record.failed || record.vector.length));
      }
      return taken;
    },
    /** Writes the vectors of `store` the cloud lacks (or has for another text). Returns how many. */
    async push(store) {
      const have = await index();
      const entries = store.entries().filter((entry) => have.get(entry.id)?.hash !== entry.hash && (entry.failed || entry.vector.length));
      for (let at = 0; at < entries.length; at += BATCH) {
        const rows = entries.slice(at, at + BATCH).map((entry) => ({ user_id: userId, piece_id: entry.id, model, hash: entry.hash, failed: entry.failed === true, embedding: entry.failed ? null : literal(entry.vector) }));
        const { error } = await mine().upsert(rows, { onConflict: 'user_id,piece_id' });
        failIf(error);
      }
      return entries.length;
    },
    /** Removes the vectors of pieces that are gone (a deleted conversation) and those made by another model. */
    async prune(keepIds) {
      const keep = new Set(keepIds);
      const have = await index();
      const gone = [...have.keys()].filter((id) => !keep.has(id));
      for (let at = 0; at < gone.length; at += PAGE) {
        const { error } = await mine().delete().eq('user_id', userId).in('piece_id', gone.slice(at, at + PAGE));
        failIf(error);
      }
      const { error } = await mine().delete().eq('user_id', userId).neq('model', model);
      failIf(error);
      return gone.length;
    },
    /** Takes away everything the cloud holds of this person's vectors. */
    async clear() {
      const { error } = await mine().delete().eq('user_id', userId);
      failIf(error);
    }
  };
}

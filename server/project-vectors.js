// The search by meaning over the files of a project, made on the server for a reply that goes on after the page was closed (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md,
// R1). The page made the vectors of the passages (page-vectors.js) and kept them in the cloud when the person chose to sync them; here the question is turned into a vector with the key the page
// put in the request for this reply (it lives only for the run), and the database function `match_project_vectors` gives the nearest passages of the sources asked about. The result is
// [{ id, hash, cosine }] (`id` is the piece id, `hash` is checked by the caller against the text it holds). Nothing here may break a reply: any failure gives [] and the keywords are used alone.

import { createEmbeddingClient, versionOf } from '../src/app/runtime/memory-store/embedding-client.js';

export const PROJECT_VECTORS = Object.freeze({ minCosine: 0.5, embedMs: 8000, maxSources: 20, maxLimit: 100 });

const literal = (vector) => `[${Array.from(vector, (value) => Number(value.toFixed(6))).join(',')}]`;

export function createProjectVectorSearch({ db, fetchImpl = (...args) => globalThis.fetch(...args), logger = console, limits = PROJECT_VECTORS }) {
  return {
    /** `vector` is { provider, key }. Returns `search(query, { fileIds, limit })`, which never throws. */
    forReply({ userId, vector, signal }) {
      return async (query, { fileIds = [], limit = 20 } = {}) => {
        const sources = [...new Set((Array.isArray(fileIds) ? fileIds : []).map(String))].slice(0, limits.maxSources);
        if (!userId || !vector?.key || !sources.length || !String(query || '').trim()) return [];
        try {
          const client = createEmbeddingClient({ provider: vector.provider, getApiKey: () => vector.key, fetchImpl });
          // A provider that does not answer must not hold the reply: the search by meaning waits a few seconds at most.
          const waiting = AbortSignal.timeout(limits.embedMs);
          const [embedding] = await client.embed([String(query).slice(0, 2000)], { kind: 'query', signal: signal ? AbortSignal.any([signal, waiting]) : waiting });
          const hits = await db.rpc('match_project_vectors', {
            p_user_id: userId, p_model: versionOf(vector.provider), p_query: literal(embedding), p_source_ids: sources,
            p_limit: Math.min(limits.maxLimit, Math.max(1, Math.floor(Number(limit) || 20))), p_min_cosine: limits.minCosine
          });
          return (Array.isArray(hits) ? hits : []).map((hit) => ({ id: String(hit.piece_id), hash: String(hit.hash), cosine: Number(hit.cosine) }));
        } catch (error) {
          logger.warn?.('The search by meaning over the project files failed on the server; the keywords are used alone.', error?.message || error);
          return [];
        }
      };
    }
  };
}

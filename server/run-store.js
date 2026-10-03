// The record of the replies the server runs (the table server_runs and its functions). Everything here is by run id and, where a
// person asks, checked against their id: a person can only stop or look at their own.

import { DatabaseError } from './supabase-rest.js';
import { ERROR_CODES } from './protocol.js';

const MAX_CHECKPOINT_BYTES = 6 * 1024 * 1024;

/** Which of our error codes a database complaint is. */
export function runStartErrorCode(error) {
  const message = String(error?.message || '');
  if (message.includes('too_many_runs')) return ERROR_CODES.tooManyRuns;
  if (message.includes('conversation_not_found')) return ERROR_CODES.conversationNotFound;
  if (error instanceof DatabaseError && error.code === '23505') return ERROR_CODES.runExists;
  return ERROR_CODES.internal;
}

export function createRunStore({ db, limits, now = () => new Date() }) {
  return {
    /** Records a new run (checks the limit and the conversation in the database, under one lock); returns its id. */
    async start({ userId, conversationId, messageId, model, envelope, keyVersion, flags = null }) {
      const expires = new Date(now().getTime() + limits.keyTtlMs).toISOString();
      return db.rpc('server_start_run', {
        p_user_id: userId,
        p_conversation_id: conversationId,
        p_message_id: messageId,
        // Which model, and (for the page, which may read this column but not the request) what kind of run: { kind: 'vision' } for the visual
        // check, { vision: true } for a reply whose presentations the server checks.
        p_model: { provider: model.provider, id: model.id, ...(flags || {}) },
        p_key_envelope: envelope,
        p_key_version: keyVersion,
        p_key_expires_at: expires,
        p_max_live: limits.maxRunsPerUser
      });
    },
    async markRunning(id) {
      await db.update('server_runs', { id: `eq.${id}` }, { status: 'running', started_at: now().toISOString(), heartbeat_at: now().toISOString() });
    },
    /** Says the run's process is alive; returns whether the person has asked for a stop. */
    async heartbeat(id) {
      const rows = await db.update('server_runs', { id: `eq.${id}`, status: 'in.(queued,running)' }, { heartbeat_at: now().toISOString() }, { returning: 'stop_requested' });
      return Boolean(rows?.[0]?.stop_requested);
    },
    /** Where the run has got to, to take it up from after a restart. Too large a note is not kept (the run starts over then). */
    async saveCheckpoint(id, checkpoint) {
      if (JSON.stringify(checkpoint).length > MAX_CHECKPOINT_BYTES) return false;
      await db.update('server_runs', { id: `eq.${id}` }, { checkpoint, heartbeat_at: now().toISOString() });
      return true;
    },
    /** The run is over: the key goes at once. */
    async finish(id, { status, errorCode = null, usage = null }) {
      await db.update('server_runs', { id: `eq.${id}` }, {
        status,
        error_code: errorCode,
        usage,
        finished_at: now().toISOString(),
        key_envelope: null,
        key_expires_at: null,
        checkpoint: null
      });
    },
    /** A person's request to stop their own run. Returns whether there was a live run of theirs. */
    async requestStop({ userId, runId }) {
      const rows = await db.update('server_runs', { id: `eq.${runId}`, user_id: `eq.${userId}`, status: 'in.(queued,running)' }, { stop_requested: true });
      return Array.isArray(rows) && rows.length > 0;
    },
    /** The plain facts of a person's own run, or null. */
    async get({ userId, runId }) {
      const rows = await db.select('server_runs', {
        filters: { id: `eq.${runId}`, user_id: `eq.${userId}` },
        select: 'id,conversation_id,message_id,status,stop_requested,attempts,error_code,usage,created_at,started_at,finished_at',
        limit: 1
      });
      return rows?.[0] || null;
    },
    /** Runs that lost their process, taken up by this one (and runs taken up too often, failed). */
    async claimStale({ staleSeconds, maxAttempts, limit = 10 }) {
      return db.rpc('server_claim_stale_runs', { p_stale_seconds: staleSeconds, p_max_attempts: maxAttempts, p_limit: limit });
    },
    /** The process is ending: these runs are handed over at once (their heartbeat is made old), for the next one to take up. */
    async release(ids) {
      if (!ids.length) return;
      await db.update('server_runs', { id: `in.(${ids.join(',')})`, status: 'in.(queued,running)' }, { heartbeat_at: '1970-01-01T00:00:00Z' });
    },
    /** Keys past their time are deleted, whatever became of their run. */
    async purgeExpiredKeys() {
      const rows = await db.update('server_runs', { key_expires_at: `lt.${now().toISOString()}`, key_envelope: 'not.is.null' }, { key_envelope: null }, { returning: 'id' });
      return Array.isArray(rows) ? rows.length : 0;
    }
  };
}

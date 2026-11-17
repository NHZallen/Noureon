// The questions the browser agent puts to the person (design doc §5): a panel in the conversation, in the place of the card of the browser, and the reply waits for the answer (ten minutes,
// then it counts as a "no"). It is the way of the question about a connector's tool (server/mcp/ask.js): the page that watches the reply shows the panel and sends the answer back. Not the
// same module: the answers here can hold a secret (a password, a code), which is kept out of every event and log.
//   kind 'confirm'  { action: 'payment' | 'delete' | 'change' | 'irreversible', domain, summary }     answer { decision: 'confirm' | 'cancel' }
//   kind 'login'    { domain, methods: [...] }                                                           answer { method, username?, password?, save? }
//   kind 'code'     { domain, digits }                                                                   answer { code } | { method: 'other' } | { method: 'resend' }
//   kind 'payment'  { domain, methods: ['card', 'applepay', 'other'] }                                  answer { method }
//   kind 'card'     { domain, host, path, ticket }  the card goes from the page to the browser host, not here   answer { done: true, filled, missing } | { cancel: true }
//   kind 'takeover' { domain, reason }                                                                   answer { decision: 'done' | 'cancel' }  (the person works the browser themselves, then gives it back)

import { randomUUID } from 'node:crypto';

export const BROWSER_ASK_WAIT_MS = 10 * 60 * 1000;
const LOGIN_METHODS = new Set(['password', 'google', 'apple', 'passkey', 'sms', 'takeover']);
const CONFIRM_ACTIONS = new Set(['payment', 'delete', 'change', 'irreversible']);
const text = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

// What each kind says in the question and takes as an answer. `check(answer)` returns { result, shown } or null (not an answer to this question): `result` goes to the reply, `shown`
// goes into the event that tells the pages the question is over (never a secret).
const PAY_METHODS = new Set(['card', 'applepay', 'other']);
const CARD_FIELDS = new Set(['number', 'exp', 'expMonth', 'expYear', 'cvc', 'name', 'line1', 'line2', 'city', 'state', 'zip', 'country', 'phone', 'email']);
const fieldNames = (list) => (Array.isArray(list) ? list.filter((name) => CARD_FIELDS.has(name)) : []);
const KINDS = {
  payment: {
    info: (info) => ({ domain: text(info.domain, 100), methods: (Array.isArray(info.methods) ? info.methods : ['card', 'other']).filter((method) => PAY_METHODS.has(method)) }),
    check: (answer) => (PAY_METHODS.has(answer?.method) ? { result: { method: answer.method }, shown: answer.method } : null)
  },
  card: {
    // The ticket is for this one question (the page uses it once to hand the card to the browser host); the card itself never comes here: only the names of the fields that were filled.
    info: (info) => ({ domain: text(info.domain, 100), host: text(info.host, 100), path: text(info.path, 100), ticket: text(info.ticket, 100) }),
    check: (answer) => {
      if (answer?.cancel === true) return { result: { cancel: true }, shown: 'cancel' };
      return answer?.done === true ? { result: { done: true, filled: fieldNames(answer.filled), missing: fieldNames(answer.missing) }, shown: 'done' } : null;
    }
  },
  takeover: {
    info: (info) => ({ domain: text(info.domain, 100), reason: text(info.reason, 200) }),
    check: (answer) => (answer?.decision === 'done' || answer?.decision === 'cancel' ? { result: { decision: answer.decision }, shown: answer.decision } : null)
  },
  confirm: {
    info: (info) => ({ action: CONFIRM_ACTIONS.has(info.action) ? info.action : 'irreversible', domain: text(info.domain, 100), summary: text(info.summary, 400) }),
    check: (answer) => (answer?.decision === 'confirm' || answer?.decision === 'cancel' ? { result: { decision: answer.decision }, shown: answer.decision } : null)
  },
  login: {
    info: (info) => ({ domain: text(info.domain, 100), methods: (Array.isArray(info.methods) ? info.methods : []).filter((method) => LOGIN_METHODS.has(method)).slice(0, 6) }),
    check: (answer) => {
      if (!LOGIN_METHODS.has(answer?.method)) return null;
      if (answer.method !== 'password') return { result: { method: answer.method }, shown: answer.method };
      if (typeof answer.username !== 'string' || !answer.username || answer.username.length > 512 || typeof answer.password !== 'string' || !answer.password || answer.password.length > 1024) return null;
      return { result: { method: 'password', username: answer.username, password: answer.password, save: answer.save === true }, shown: 'password' };
    }
  },
  code: {
    info: (info) => ({ domain: text(info.domain, 100), digits: [4, 6, 8].includes(info.digits) ? info.digits : 6 }),
    check: (answer) => {
      if (answer?.method === 'other') return { result: { method: 'other' }, shown: 'other' };
      if (answer?.method === 'resend') return { result: { method: 'resend' }, shown: 'resend' };
      return typeof answer?.code === 'string' && /^[0-9]{4,8}$/.test(answer.code) ? { result: { method: 'code', code: answer.code }, shown: 'code' } : null;
    }
  }
};

/**
 * `emit(event)` tells the pages ({ type: 'browser', event: 'ask' | 'answer', … }); `signal` is the reply's stop; `onWaited(ms)` says how long the reply waited, so the reply's clock and
 * time limit do not count it. Returns { ask(kind, info), answer(askId, answer), cancelAll() }.
 */
export function createBrowserAsk({ emit, signal = null, waitMs = BROWSER_ASK_WAIT_MS, now = Date.now, onWaited = () => {}, makeId = randomUUID }) {
  const pending = new Map();
  return {
    /** Resolves what the person answered ({ decision } / { method, … }), or { timeout: true } (nobody answered in time) or { cancelled: true } (the reply was stopped). */
    async ask(kind, info = {}) {
      const spec = KINDS[kind];
      if (!spec) throw new Error('That is not a question the browser asks.');
      const id = makeId();
      const began = now();
      const shownInfo = spec.info(info);
      const outcome = await new Promise((resolve) => {
        let timer = null;
        const onAbort = () => finish({ result: { cancelled: true }, shown: 'cancel' });
        const finish = (value) => {
          clearTimeout(timer);
          pending.delete(id);
          signal?.removeEventListener?.('abort', onAbort);
          resolve(value);
        };
        timer = setTimeout(() => finish({ result: { timeout: true }, shown: 'timeout' }), waitMs);
        pending.set(id, { kind, finish });
        if (signal?.aborted) { onAbort(); return; }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        emit({ type: 'browser', event: 'ask', id, kind, waitMs, ...shownInfo });
      });
      onWaited(Math.max(0, now() - began));
      emit({ type: 'browser', event: 'answer', id, kind, decision: outcome.shown });
      return outcome.result;
    },
    /** Every question still open ends as cancelled (the person ended the browser: nobody is going to answer). */
    cancelAll() {
      for (const entry of [...pending.values()]) entry.finish({ result: { cancelled: true }, shown: 'cancel' });
    },
    answer(askId, answer) {
      const entry = pending.get(askId);
      if (!entry) return { answered: false };
      const checked = KINDS[entry.kind].check(answer);
      if (!checked) return { answered: false };
      entry.finish(checked);
      return { answered: true };
    }
  };
}

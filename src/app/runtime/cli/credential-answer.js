// What happens when the person answers the window that asks for the login a CLI tool needs (ui/cli/credential-modal.js): the values are saved
// straight to the person's secure credentials (always: there is no "save?" question), and only then is the reply told that they are there. The
// reply never receives a value (server/executor.js reads them from the safe itself).

import { saveCredential } from './credentials-client.js';

/**
 * `getRun()`: the reply the server is making (server-reply.js), whose answerCredential sends the answer. Returns the function the card and the
 * window call: ({ id, decision: 'saved' | 'cancel', values: { NAME: value } }) => { ok, reason? } ('reason': what the server said about a value).
 */
export const createCredentialAnswerHandler = ({ getRun, save = saveCredential }) => async ({ id, decision, values = {} }) => {
  const run = getRun();
  if (!run?.answerCredential) return { ok: false, reason: 'unavailable' };
  if (decision === 'saved') {
    for (const [name, value] of Object.entries(values)) {
      const saved = await save(name, value);
      if (!saved?.ok) return { ok: false, reason: saved?.reason || saved?.code || 'failed' };
    }
  }
  const result = await run.answerCredential(id, decision === 'saved' ? 'saved' : 'cancel');
  return result?.ok ? { ok: true } : { ok: false, reason: 'answer' };
};

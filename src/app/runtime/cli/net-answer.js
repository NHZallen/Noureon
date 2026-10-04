// What happens when the person answers the card that asks about a site (ui/sandbox/net-ask-card.js): the answer goes to the server, which hands it to
// the sandbox that asked, and what lasts of it ("always", a refusal) is kept as a rule in the settings (cli-mode.js, net-state.js).

import { getCliMode } from './cli-bridge.js';

/** `getRun()`: the reply the server is making (server-reply.js), whose answerNet sends the answer. Returns the function the card calls. */
export const createNetAnswerHandler = ({ getRun }) => async ({ id, decision, host }) => {
  const run = getRun();
  if (!run?.answerNet) return { ok: false };
  const result = await run.answerNet(id, decision);
  if (!result?.ok) return { ok: false };
  await getCliMode()?.rememberNet?.(host, decision);
  return { ok: true };
};

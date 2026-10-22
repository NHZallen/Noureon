// What happens when the person answers the card that asks whether the text model may draw a picture (ui/sandbox/image-ask-card.js): the answer goes to the
// server, which hands it to the reply that asked; "always" is kept as the person's permission in the settings.

import { rememberImageAlways } from '../tool-models/tool-models-bridge.js';

/** `getRun()`: the reply the server is making (server-reply.js), whose answerImage sends the answer. Returns the function the card calls. */
export const createImageAnswerHandler = ({ getRun }) => async ({ id, decision }) => {
  const run = getRun();
  if (!run?.answerImage) return { ok: false };
  const result = await run.answerImage(id, decision);
  if (!result?.ok) return { ok: false };
  if (decision === 'always') await rememberImageAlways();
  return { ok: true };
};

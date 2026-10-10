// What happens when the person answers the card that asks whether a tool of a connector may run (ui/sandbox/connector-ask-card.js): the answer goes to the
// server, which hands it to the reply that asked. What lasts of it ("always") is kept by the server as the person's setting for the tool.

/** `getRun()`: the reply the server is making (server-reply.js), whose answerConnector sends the answer. Returns the function the card calls. */
export const createConnectorAnswerHandler = ({ getRun }) => async ({ id, decision }) => {
  const run = getRun();
  if (!run?.answerConnector) return { ok: false };
  const result = await run.answerConnector(id, decision);
  return result?.ok ? { ok: true } : { ok: false };
};

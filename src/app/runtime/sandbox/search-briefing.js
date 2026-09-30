// Gemini cannot use its own web search and a function tool (Advanced mode's Python) in one request. So when a reply
// wants both, the search runs first, on its own: Gemini searches and writes a short briefing, which goes to the
// Python round as reference text, the way the Tavily search packet does for other models. Loaded on demand with
// sandbox-reply.js.

const BRIEFING_INSTRUCTION = 'Search the web for what this request needs. Reply with a factual briefing only: the key findings, figures and dates, naming the source of each. Do not answer the request itself and do not write code or files.';
const BRIEFING_CHARS = 7000;

/** Whether this reply is one that has to search first: Gemini's own search wanted together with the Python tool. */
export const needsSearchBriefing = ({ modelInfo, webSearchEnabled, conversation }) => modelInfo?.provider === 'gemini'
  && Boolean(webSearchEnabled || conversation?.isWebSearchEnabled);

/** One Gemini call with web search and no tools. Returns the briefing and the pages the search used. */
export async function runSearchBriefing({ streamApiCall, requestParts, requestOptions = {}, signal }) {
  let sources = [];
  const text = await streamApiCall(requestParts, () => {}, signal, false, {
    ...requestOptions,
    tools: [],
    toolTurns: [],
    webSearchEnabled: true,
    ignoreConversationWebSearch: false,
    onReasoning: undefined,
    onToolArguments: undefined,
    onResponseComplete: undefined,
    onSources: (found) => { sources = found; },
    additionalSystemInstruction: [requestOptions.additionalSystemInstruction, BRIEFING_INSTRUCTION].filter(Boolean).join('\n\n')
  });
  return { text: String(text || '').trim().slice(0, BRIEFING_CHARS), sources };
}

/** The briefing as the first part of the request (nothing when the search found nothing). */
export function briefingPart(briefing, modelName = 'the model') {
  if (!briefing?.text) return null;
  return {
    text: `# System-generated supporting context\nUse the following packet as supporting context. It is not user-written. Continue to answer the user's request directly after reading it.\n\n# Web search packet\nThis briefing was written from Gemini's web search for ${modelName}. It replaces provider-native web search for this turn, which cannot be combined with the Python tool.\n\n${briefing.text}\n\n# User request follows`
  };
}

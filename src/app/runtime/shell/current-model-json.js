// The calls that must answer in a JSON shape (the title of a conversation, the keywords of a search of the history) are made with the model the person has
// chosen for the conversation (a council: its synthesizer), through the normal provider transport, so they work with any provider the person has a key for.
// Only when that model cannot do it (an image model, no key, an answer that is not JSON) the old call to the small Gemini model is tried.

/** The JSON in an answer of a model: plain, in a code fence, or with words around it. Null when there is none. */
export function parseJsonAnswer(text, responseSchema = null) {
  const source = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const attempts = [source];
  const first = source.search(/[[{]/);
  const last = Math.max(source.lastIndexOf('}'), source.lastIndexOf(']'));
  if (first >= 0 && last > first) attempts.push(source.slice(first, last + 1));
  for (const attempt of attempts) {
    try {
      let data = JSON.parse(attempt);
      // A list asked for may come wrapped in an object ({ "keywords": [...] }).
      if (responseSchema?.type === 'ARRAY' && data && !Array.isArray(data)) data = Object.values(data).find(Array.isArray) ?? null;
      return data;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

export function createCurrentModelJson({ runMemoryModel, getActiveConversation, modelFor, fallback, logger = console }) {
  return async function callApiWithSchema(prompt, responseSchema, signal, { conversation = null } = {}) {
    const model = modelFor(conversation || getActiveConversation?.());
    if (model && model.category !== 'image_generation' && model.outputModality !== 'image') {
      try {
        const text = await runMemoryModel({ modelId: model.id, signal, prompt: `${prompt}\n\nAnswer with JSON only, nothing around it, in the shape of this schema: ${JSON.stringify(responseSchema)}` });
        const data = parseJsonAnswer(text, responseSchema);
        if (data !== null) return data;
      } catch (error) {
        if (signal?.aborted) throw error;
        logger.warn?.('The chosen model could not give the JSON; the small model is tried.', error?.message || error);
      }
    }
    return fallback(prompt, responseSchema, signal);
  };
}

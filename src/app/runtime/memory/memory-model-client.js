const asArray = value => Array.isArray(value) ? value : [];
const asText = value => String(value || '').trim();

const parseJson = value => {
  const text = asText(value)
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '');
  return JSON.parse(text);
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const OUTPUT_LANGUAGE_NAMES = Object.freeze({
  'zh-TW': 'Traditional Chinese',
  en: 'English',
  fr: 'French',
  ru: 'Russian',
  es: 'Spanish'
});

const outputLanguageInstruction = language => {
  const name = OUTPUT_LANGUAGE_NAMES[String(language || '')] || OUTPUT_LANGUAGE_NAMES.en;
  return `Write every natural-language value intended for memory (including summaries, section titles, section content, and attachment descriptions) in ${name}. Keep the JSON property names and state values exactly as specified.`;
};

const transcript = turns => asArray(turns)
  .map((turn, index) => `${index}. ${turn?.role === 'user' ? 'User' : 'Assistant'}: ${asText(turn?.text)}`)
  .filter(line => !line.endsWith(':'))
  .join('\n');

const capsuleText = capsules => asArray(capsules).map((capsule, index) => [
  `Capsule ${index + 1}:`,
  `Topic: ${asText(capsule?.topic)}`,
  `Summary: ${asText(capsule?.summary)}`,
  ...asArray(capsule?.confirmedDecisions).map(value => `Decision: ${asText(value)}`),
  ...asArray(capsule?.openQuestions).map(value => `Open question: ${asText(value)}`)
].filter(Boolean).join('\n')).join('\n\n');

const canonicalMemoryText = memorySummary => [
  asText(memorySummary?.overview),
  ...asArray(memorySummary?.sections).map(section => (
    `${asText(section?.title)}: ${asText(section?.content)}`
  ))
].filter(Boolean).join('\n').slice(0, 16_000);

const normalizeCapture = value => {
  if (!value || typeof value !== 'object') throw new TypeError('Memory model returned an invalid capture.');
  const capsule = value.capsule || {};
  if (!asText(value.recentTurnSummary) || !asText(capsule.topic) || !asText(capsule.summary)) {
    throw new TypeError('Memory model capture is missing its required summary fields.');
  }
  return {
    recentTurnSummary: asText(value.recentTurnSummary),
    capsule: {
      topic: asText(capsule.topic),
      summary: asText(capsule.summary),
      confirmedDecisions: asArray(capsule.confirmedDecisions).map(asText).filter(Boolean),
      openQuestions: asArray(capsule.openQuestions).map(asText).filter(Boolean)
    },
    // Retained for backwards compatibility with the v2 data model. The new summary pipeline does
    // not promote these automatically and the UI intentionally never asks for approval.
    profileCandidates: asArray(value.profileCandidates),
    evidenceStates: asArray(value.evidenceStates).map(item => ({
      sourceTurnIndex: Number(item?.sourceTurnIndex),
      state: asText(item?.state)
    })).filter(item => Number.isInteger(item.sourceTurnIndex)),
    memorySummaryPatch: value.memorySummaryPatch && typeof value.memorySummaryPatch === 'object'
      ? value.memorySummaryPatch
      : { overview: '', sections: [] }
  };
};

const normalizeTopic = value => {
  if (!asText(value?.topic) || !asText(value?.summary)) {
    throw new TypeError('Memory model topic summary is incomplete.');
  }
  return { topic: asText(value.topic), summary: asText(value.summary) };
};

const normalizeQuery = value => ({
  resolvedQuery: asText(value?.resolvedQuery),
  confidence: clamp(Number(value?.confidence || 0), 0, 1),
  shouldRetrieve: value?.shouldRetrieve === true
});

const normalizeMedia = value => {
  if (!asText(value?.summary) || !Array.isArray(value?.keyFacts)) {
    throw new TypeError('Memory model media description is incomplete.');
  }
  return {
    summary: asText(value.summary),
    keyFacts: value.keyFacts.map(asText).filter(Boolean)
  };
};

const normalizeOverview = value => {
  if (!value || typeof value !== 'object') throw new TypeError('Memory overview is incomplete.');
  return {
    overview: asText(value.overview),
    sections: asArray(value.sections).map(section => ({
      key: asText(section?.key),
      title: asText(section?.title),
      content: asText(section?.content)
    })).filter(section => section.title && section.content).slice(0, 6)
  };
};

/**
 * Provider-neutral structured-memory adapter. `runModel` owns authentication and provider
 * transport, so this layer can require the configured memory model without falling back to a
 * different provider when it fails.
 */
export function createMemoryModelClient({
  getModelId,
  getOutputLanguage = () => 'en',
  runModel,
  canInterpretAttachment = () => false
} = {}) {
  if (typeof getModelId !== 'function') throw new TypeError('Memory model client requires getModelId.');
  if (typeof runModel !== 'function') throw new TypeError('Memory model client requires runModel.');

  const invokeJson = async ({ prompt, signal, parts }) => {
    const modelId = asText(getModelId());
    if (!modelId) throw new Error('Choose a memory model before memory work can run.');
    const response = await runModel({ modelId, prompt, signal, parts });
    return { modelId, value: parseJson(response) };
  };

  return {
    async capture({ recentTurnSummary = '', turns = [], activeProfileEntries = [], memorySummary = {}, existingCapsule = null, signal } = {}) {
      const newTranscript = transcript(turns);
      if (!newTranscript) throw new TypeError('Memory capture requires at least one text turn.');
      const { modelId, value } = await invokeJson({
        signal,
        prompt: [
          'You maintain a private, continuously refreshed memory summary for one user.',
          'Use only explicit USER statements as evidence. Assistant text is never a user fact.',
          'Do not discard a user message because it seems casual, speculative, one-off, unclear, or a question. Every non-empty user turn must receive one evidenceStates item. Classify its state; do not judge importance.',
          'State values must be one of: current-state, preference-or-constraint, exploration, temporary-state, question.',
          'For a temporary-state, include expiresAt only if the user explicitly supplied a real deadline; otherwise omit it.',
          'A proposed, uncertain, temporary, or question statement must not replace a current state. A direct explicit correction may replace a current state in memorySummaryPatch.',
          'The complete memory summary is a detailed current-state memory, not a history log. Do not mention superseded historical states in it.',
          outputLanguageInstruction(getOutputLanguage()),
          'For every memorySummaryPatch section include key, title, content, state, and sourceTurnIndexes. Sources must point only to USER turns from this supplied transcript.',
          'Do not emit UUIDs, scores, hidden source IDs, or assistant claims.',
          'Return JSON only with this shape:',
          '{"recentTurnSummary":"...","capsule":{"topic":"...","summary":"...","confirmedDecisions":[],"openQuestions":[]},"profileCandidates":[],"evidenceStates":[{"sourceTurnIndex":0,"state":"current-state"}],"memorySummaryPatch":{"overview":"...","sections":[{"key":"...","title":"...","content":"...","state":"current-state","expiresAt":"optional ISO timestamp","sourceTurnIndexes":[0]}]}}',
          `Existing complete memory overview:\n${asText(memorySummary?.overview) || '(none)'}`,
          'Authoritative user-edited summary sections. Treat these as the newest user statements: never rewrite them from chat history. If they conflict with an automatic section, do not keep the old automatic state in a new patch:',
          asArray(memorySummary?.sections)
            .filter(section => section?.authority === 'manual')
            .map(section => `- ${section.title}: ${section.content}`)
            .join('\n') || '(none)',
          'Existing automatic complete-memory sections:',
          asArray(memorySummary?.sections)
            .filter(section => section?.authority !== 'manual')
            .map(section => `- ${section.title}: ${section.content}`)
            .join('\n') || '(none)',
          'Existing legacy profile entries (context only; do not update them):',
          asArray(activeProfileEntries).map(entry => `- ${entry.content}`).join('\n') || '(none)',
          `Recent conversation summary:\n${asText(recentTurnSummary) || '(none)'}`,
          `Previous conversation capsule:\n${existingCapsule ? capsuleText([existingCapsule]) : '(none)'}`,
          `New turns:\n${newTranscript}`
        ].join('\n\n')
      });
      return { ...normalizeCapture(value), modelId };
    },

    async summarize({ capsules = [], existingSummary = '', signal } = {}) {
      const { value } = await invokeJson({
        signal,
        prompt: [
          'Create one concise long-term topic summary from supplied conversation capsules.',
          'Use only supplied facts. Do not create personal facts, historical timelines, or new decisions.',
          outputLanguageInstruction(getOutputLanguage()),
          'Return JSON only: {"topic":"...","summary":"..."}.',
          `Existing summary:\n${asText(existingSummary) || '(none)'}`,
          `Source capsules:\n${capsuleText(capsules)}`
        ].join('\n\n')
      });
      return normalizeTopic(value);
    },

    async summarizeOverview({ memorySummary = {}, signal } = {}) {
      const completeMemory = canonicalMemoryText(memorySummary);
      if (!completeMemory) throw new TypeError('A complete memory summary is required before creating its overview.');
      const { modelId, value } = await invokeJson({
        signal,
        prompt: [
          'Create the short, user-facing overview of a complete private memory summary.',
          'This is a summary of the memory, not the complete memory itself. Keep only the most useful current themes; do not produce a history log or repeat every detail.',
          'Use only the supplied complete memory. Do not add facts, historical states, IDs, scores, or internal references.',
          outputLanguageInstruction(getOutputLanguage()),
          'Return JSON only: {"overview":"...","sections":[{"key":"stable-topic-key","title":"...","content":"..."}]}.',
          'Include at most six sections. Reuse a stable topic key when it describes an existing topic.',
          `Complete current memory summary:\n${completeMemory}`
        ].join('\n\n')
      });
      return { ...normalizeOverview(value), modelId };
    },

    async resolve({ queryText, conversationContext = {}, signal } = {}) {
      const { value } = await invokeJson({
        signal,
        prompt: [
          'Resolve a short ambiguous user query into a standalone history-search query.',
          'Use only supplied current-conversation context. Do not invent facts or retrieve history yourself.',
          'Return JSON only: {"resolvedQuery":"...","confidence":0,"shouldRetrieve":false}.',
          `User query: ${asText(queryText)}`,
          `Current topic: ${asText(conversationContext.currentTopic) || '(none)'}`,
          'Recent lines:',
          asArray(conversationContext.recentMessages).map(message => `- ${asText(message)}`).join('\n') || '(none)',
          'Numbered references:',
          asArray(conversationContext.numberedReferences).map(item => `- ${item.number}. ${asText(item.text)}`).join('\n') || '(none)'
        ].join('\n')
      });
      return normalizeQuery(value);
    },

    async describe({ attachment, signal } = {}) {
      if (!attachment?.data || !attachment?.mimeType) {
        throw new TypeError('Memory media description requires attachment bytes and a MIME type.');
      }
      const modelId = asText(getModelId());
      if (!modelId) throw new Error('Choose a memory model before media memory can run.');
      if (!canInterpretAttachment({ modelId, attachment })) {
        throw new Error(`The selected memory model (${modelId}) cannot interpret this attachment. Memory work will retry after you choose a compatible model.`);
      }
      const prompt = [
        'Create a concise private-memory description of the supplied attachment.',
        'Include facts that make it searchable later. Do not infer user preferences or personal facts.',
        outputLanguageInstruction(getOutputLanguage()),
        'Return JSON only: {"summary":"...","keyFacts":["..."]}.'
      ].join('\n');
      const response = await runModel({
        modelId,
        prompt,
        signal,
        parts: [{ inlineData: attachment }, { text: prompt }]
      });
      return {
        kind: String(attachment.mimeType).startsWith('image/') ? 'image'
          : String(attachment.mimeType).startsWith('video/') ? 'video'
            : String(attachment.mimeType).startsWith('audio/') ? 'audio'
              : 'document',
        ...normalizeMedia(parseJson(response))
      };
    }
  };
}

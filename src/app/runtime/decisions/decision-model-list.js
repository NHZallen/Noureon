// The decision models the settings offer, with what each needs (decision-models.js has the ids). Each is reached through OpenRouter's Decisions API with the person's OpenRouter key, so `provider`
// says which key it takes. `textKey`: the line under the name in server-reply-texts.js.

import { DEFAULT_DECISION_MODEL } from './decision-models.js';

export const DECISION_MODELS = Object.freeze([
  Object.freeze({ id: 'typesafe/jev-1.14', provider: 'openrouter', name: 'Jev 1.14', textKey: 'decideJevDesc' }),
  Object.freeze({ id: 'google/gemini-decision-1', provider: 'openrouter', name: 'Gemini Decision 1', textKey: 'decideGeminiDesc' })
]);

/** The model of this id, or the default one. */
export const decisionModelOf = (id) => DECISION_MODELS.find((model) => model.id === id) || DECISION_MODELS.find((model) => model.id === DEFAULT_DECISION_MODEL);

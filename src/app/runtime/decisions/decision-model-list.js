// The providers and the decision models the settings offer (decision-models.js has the ids; an id is the model's own id at its provider, and no two are the same, so the id alone says the provider).
// A provider says where the typed questions go, with which header the key travels and how the request looks there. `textKey`: the line under the name in server-reply-texts.js.
// OpenRouter's Decisions API takes the request as it is built (decision-client.js). Google's own (aistudio.google.com/docs/decisions-api, found by scripts/model-probe-all.mjs on 2026-11-13) is the same
// except that `state` is called `input` and each piece of it is an object { type: 'text', text }; a plain string is refused with a 400.

import { DEFAULT_DECISION_MODEL } from './decision-models.js';

export const DECISION_PROVIDERS = Object.freeze({
  openrouter: Object.freeze({ name: 'OpenRouter', url: 'https://openrouter.ai/api/alpha/decisions', headers: (key) => ({ Authorization: `Bearer ${key}` }), body: (request) => request }),
  gemini: Object.freeze({
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/decisions',
    headers: (key) => ({ 'x-goog-api-key': key }),
    body: ({ state, ...rest }) => ({ ...rest, input: state.map((text) => ({ type: 'text', text })) })
  })
});

export const DECISION_MODELS = Object.freeze([
  Object.freeze({ id: 'typesafe/jev-1.14', provider: 'openrouter', name: 'Jev 1.14', textKey: 'decideJevDesc' }),
  Object.freeze({ id: 'google/gemini-decision-1', provider: 'openrouter', name: 'Gemini Decision 1', textKey: 'decideGeminiDesc' }),
  Object.freeze({ id: 'gemini-decision-1', provider: 'gemini', name: 'Gemini Decision 1', textKey: 'decideGeminiDirectDesc' })
]);

/** The model of this id, or the default one. */
export const decisionModelOf = (id) => DECISION_MODELS.find((model) => model.id === id) || DECISION_MODELS.find((model) => model.id === DEFAULT_DECISION_MODEL);

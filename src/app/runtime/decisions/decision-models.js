// The decision models the person may choose in Settings → Privacy (docs/superpowers/specs/2026-10-08-decisions-design.md, §8): the small models that answer the typed questions put while a message
// is sent (does it need the web, a file, a chart, a command tool...). The choice is the setting `decisionModel`. Only the ids are here, because the normalization of the settings loads this (it is
// also read on the server): the names, the provider and the texts of each are in decision-model-list.js, loaded by the card of the settings and by the call. No imports, no browser globals.

export const DEFAULT_DECISION_MODEL = 'typesafe/jev-1.14';
export const DECISION_MODEL_IDS = Object.freeze([DEFAULT_DECISION_MODEL, 'google/gemini-decision-1']);

/** The id of the model of this choice, or the default one (a choice that is no longer offered, or none). */
export const normalizeDecisionModel = (value) => (DECISION_MODEL_IDS.includes(value) ? value : DEFAULT_DECISION_MODEL);

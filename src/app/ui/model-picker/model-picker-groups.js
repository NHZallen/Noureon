// Turns a flat list of models into the picker's groups: one group per company
// (Google, OpenAI, DeepSeek, …), the models used lately first, beta models last.

const COMPANY_LABELS = Object.freeze({
  google: 'Google',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  'deepseek-ai': 'DeepSeek',
  'meta-llama': 'Meta',
  meta: 'Meta',
  'x-ai': 'xAI',
  qwen: 'Qwen',
  moonshotai: 'Moonshot AI',
  'z-ai': 'Z.ai',
  nvidia: 'NVIDIA',
  mistralai: 'Mistral',
  minimax: 'MiniMax',
  minimaxai: 'MiniMax',
  microsoft: 'Microsoft',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  'black-forest-labs': 'Black Forest Labs',
  stepfun: 'StepFun'
});

const titleCase = (value) => String(value || '').replace(/(^|[-_ ])([a-z])/g, (match, lead, letter) => `${lead ? ' ' : ''}${letter.toUpperCase()}`).trim();

/** The company behind a model, from its provider and id (`google/…`, `deepseek-ai/…`). */
export function getModelCompany(model, apiId = model?.apiId || model?.id || '') {
  if (model?.company) return String(model.company);
  if (model?.provider === 'gemini') return 'google';
  const prefix = String(model?.provider === 'nvidia' ? apiId : (model?.id || apiId)).split('/')[0];
  return prefix || model?.provider || '';
}

export const getCompanyLabel = (company) => COMPANY_LABELS[String(company).toLowerCase()] || titleCase(company) || String(company);

/**
 * `models` are already in the order they should appear within a group.
 * `decorate(model)` returns the row's own fields. The models used lately (by id) are
 * shown first as their own group, and stay in their company group as well.
 */
export function buildModelGroups(models, { decorate, recentIds = [], recentLabel = '', betaLabel = '' }) {
  const groups = new Map();
  const rows = new Map();
  const beta = [];
  for (const model of models) {
    const row = decorate(model);
    rows.set(model.id, row);
    if (model.isBeta) {
      beta.push(row);
      continue;
    }
    const label = getCompanyLabel(row.company || getModelCompany(model));
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  const recent = recentIds.map((id) => rows.get(id)).filter(Boolean);
  const result = [];
  if (recent.length && recentLabel) result.push({ label: recentLabel, models: recent });
  [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
    .forEach(([label, list]) => result.push({ label, models: list }));
  if (beta.length) result.push({ label: betaLabel, models: beta });
  return result;
}

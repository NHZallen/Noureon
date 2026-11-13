// The card of the decision model in the Privacy tab of the settings: the small model that judges, while a message is sent, whether it needs the web, a file, a chart or a command tool
// (decisions/decision-models.js). The person picks the provider first, then one of its models. Loaded after the tab is drawn, and put after the card of the network; drawn again (the old one
// taken away) when the language changes.

import { serverReplyText } from '../server-reply/server-reply-texts.js';
import { normalizeDecisionModel } from '../decisions/decision-models.js';
import { DECISION_MODELS, DECISION_PROVIDERS, decisionModelOf } from '../decisions/decision-model-list.js';

const CARD_ID = 'decision-model-card';

const el = (document, tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function addDecisionCard({ document, section, language, decisionModel, onChange }) {
  const t = (key) => serverReplyText(language, key);
  section.querySelector(`#${CARD_ID}`)?.remove();
  const cards = section.querySelectorAll('.pz-card');
  if (!cards.length) return null;
  const card = el(document, 'section', 'pz-card');
  card.id = CARD_ID;
  card.appendChild(el(document, 'div', 'pz-head')).appendChild(el(document, 'h3', '', t('decideTitle')));
  card.appendChild(el(document, 'p', 'pz-note text-[var(--text-secondary)]', t('decideDesc')));
  let current = decisionModelOf(normalizeDecisionModel(decisionModel));

  const row = (id, label, sub) => {
    const node = el(document, 'div', 'pz-row');
    const text = el(document, 'span', 'pz-text');
    text.appendChild(el(document, 'span', 'pz-label', label));
    const note = el(document, 'span', 'pz-sub text-[var(--text-secondary)]', sub);
    text.appendChild(note);
    const select = el(document, 'select', 'pz-select');
    select.id = id;
    node.append(text, select);
    card.appendChild(node);
    return { select, note };
  };
  const provider = row('decision-provider', t('decideProvider'), t('decideProviderDesc'));
  const model = row('decision-model', t('decideModel'), '');

  for (const [id, entry] of Object.entries(DECISION_PROVIDERS)) provider.select.appendChild(el(document, 'option', '', entry.name)).value = id;
  const showModels = () => {
    model.select.replaceChildren();
    for (const entry of DECISION_MODELS.filter((item) => item.provider === current.provider)) model.select.appendChild(el(document, 'option', '', entry.name)).value = entry.id;
    provider.select.value = current.provider;
    model.select.value = current.id;
    model.note.textContent = t(current.textKey);
  };
  showModels();
  provider.select.addEventListener('change', () => {
    // A new provider starts with its first model (the models are listed in the order they are offered).
    current = DECISION_MODELS.find((entry) => entry.provider === provider.select.value) || current;
    showModels();
    onChange(current.id);
  });
  model.select.addEventListener('change', () => {
    current = decisionModelOf(model.select.value);
    showModels();
    onChange(current.id);
  });
  // After the second card (where replies run, then the network of the server).
  (cards[1] || cards[0]).after(card);
  return card;
}

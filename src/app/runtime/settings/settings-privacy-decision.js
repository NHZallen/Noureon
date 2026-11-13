// The card of the decision model in the Privacy tab of the settings: the small model that judges, while a message is sent, whether it needs the web, a file, a chart or a command tool
// (decisions/decision-models.js). Loaded after the tab is drawn, and put after the card of the network; drawn again (the old one taken away) when the language changes.

import { serverReplyText } from '../server-reply/server-reply-texts.js';
import { normalizeDecisionModel } from '../decisions/decision-models.js';
import { DECISION_MODELS } from '../decisions/decision-model-list.js';

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
  const now = normalizeDecisionModel(decisionModel);
  for (const model of DECISION_MODELS) {
    const row = el(document, 'label', 'pz-row pz-pick');
    row.htmlFor = `decision-model-${model.id}`;
    const input = el(document, 'input');
    input.type = 'radio';
    input.name = 'decision-model';
    input.id = `decision-model-${model.id}`;
    input.value = model.id;
    input.checked = now === model.id;
    input.addEventListener('change', () => { if (input.checked) onChange(model.id); });
    const text = el(document, 'span', 'pz-text');
    text.append(el(document, 'span', 'pz-label', model.name), el(document, 'span', 'pz-sub text-[var(--text-secondary)]', t(model.textKey)));
    row.append(input, text);
    card.appendChild(row);
  }
  // After the second card (where replies run, then the network of the server).
  (cards[1] || cards[0]).after(card);
  return card;
}

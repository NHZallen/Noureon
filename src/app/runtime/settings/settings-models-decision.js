// The card of the decision model in the Models tab of the settings (the page of the models, where the keys are): the small model that judges, while a message is sent, whether it needs the web,
// a file, a chart or a command tool (decisions/decision-models.js). The person picks the provider first, then one of its models. It goes before the card of speech to text (which is last), or
// at the end; drawn again (the old one taken away) when the language changes.

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

export function addDecisionCard({ document, host, language, decisionModel, onChange }) {
  const t = (key) => serverReplyText(language, key);
  if (!host) return null;
  host.querySelector(`#${CARD_ID}`)?.remove();
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
  const speech = host.querySelector('#speech-settings-card');
  if (speech) speech.before(card);
  else host.append(card);
  return card;
}

const languageBound = new WeakSet();

/**
 * The card in the section of the models, drawn each time the settings open (and again when the language changes, which the menu of the language says at once while the settings stay open).
 * The choice is saved as soon as it is made.
 */
export function createDecisionSettings({ document, elements, config, saveConfig }) {
  const draw = (language) => addDecisionCard({
    document,
    host: document.querySelector('#model-management-section .pz'),
    language,
    decisionModel: config.decisionModel,
    onChange: async (value) => {
      config.decisionModel = normalizeDecisionModel(value);
      try {
        await saveConfig();
      } catch (error) {
        console.warn('Saving the decision model failed.', error);
      }
    }
  });
  const mount = () => {
    draw(config.uiLanguage);
    const select = elements?.uiLanguageSelect;
    if (select?.addEventListener && !languageBound.has(select)) {
      languageBound.add(select);
      select.addEventListener('change', (event) => draw(event.target.value));
    }
  };
  return { mount };
}

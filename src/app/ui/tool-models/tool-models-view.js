// The "models a text model may call" tab of the settings (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md): one card for
// each kind of model a text model may call. Only pictures so far: the picture model it draws with, or none. The choice is saved at once (not
// with the Save button of the settings), like the Permissions tab, whose classes (permissions.css) it uses.

import { toolModelText } from '../../runtime/tool-models/tool-models-texts.js';

const make = (document, tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Draws the tab into `root`. `models` are the picture models to choose from ({ id, provider, name, providerLabel }); `getImageModel()` and
 * `setImageModel(model | null)` read and change the choice (setImageModel returns whether it changed; the view saves then); `hasKey(provider)`
 * whether a key for that provider is set.
 */
export function renderToolModelsView({ document, root, getLanguage, models, getImageModel, setImageModel, hasKey = () => true, save = async () => {} }) {
  const t = (key, values) => toolModelText(getLanguage(), key, values);
  const redraw = () => renderToolModelsView({ document, root, getLanguage, models, getImageModel, setImageModel, hasKey, save });
  root.replaceChildren();
  root.classList.add('pm');

  root.append(make(document, 'p', 'pm-desc', t('desc')));
  const card = make(document, 'div', 'pm-block pm-card');
  const head = make(document, 'div', 'pm-card-head');
  head.append(make(document, 'h4', 'pm-sub', t('imageTitle')), make(document, 'p', 'pm-desc', t('imageDesc')));
  card.append(head);

  const group = make(document, 'div', 'pm-options');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', t('imageTitle'));
  const chosen = getImageModel();
  const options = [{ value: '', label: t('imageNone'), description: t('imageNoneDesc'), checked: !chosen }];
  for (const model of models) {
    const missing = !hasKey(model.provider);
    options.push({
      value: `${model.provider}\n${model.id}`,
      label: model.name,
      description: missing ? t('needsKey', { provider: model.providerLabel }) : model.providerLabel,
      checked: chosen?.provider === model.provider && chosen?.id === model.id,
      model
    });
  }
  for (const option of options) {
    const label = make(document, 'label', 'pm-option');
    const input = make(document, 'input');
    input.type = 'radio';
    input.name = 'tool-model-image';
    input.value = option.value;
    input.checked = option.checked;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      const changed = setImageModel(option.model ? { provider: option.model.provider, id: option.model.id } : null);
      redraw();
      if (changed) void save();
    });
    const text = make(document, 'span', 'pm-option-text');
    text.append(make(document, 'span', 'pm-option-label', option.label), make(document, 'span', 'pm-option-desc', option.description));
    label.append(input, text);
    group.append(label);
  }
  card.append(group);
  root.append(card);
  root.append(make(document, 'p', 'pm-desc', t('note')));
  return {};
}

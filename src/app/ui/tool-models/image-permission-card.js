// The card of the Permissions tab for pictures a text model draws by itself: ask before each one (the default) or allow for good. It is drawn
// in the manner of the network card above it (ui/cli/permissions-view.js); `change(mutate)` is that tab's: it redraws and saves when `mutate()` is true.

import { IMAGE_PERMISSIONS } from '../../../data/tool-models.js';
import { getImagePermission, setImagePermission } from '../../runtime/tool-models/tool-models-state.js';

const make = (document, tag, className = '', text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const KEYS = { ask: ['imageAsk', 'imageAskDesc'], always: ['imageAlways', 'imageAlwaysDesc'] };

export function imagePermissionCard({ document, t, getConfig, change }) {
  const card = make(document, 'div', 'pm-block pm-card');
  const head = make(document, 'div', 'pm-card-head');
  head.append(make(document, 'h4', 'pm-sub', t('imageTitle')), make(document, 'p', 'pm-desc', t('imageDesc')));
  card.append(head);
  const group = make(document, 'div', 'pm-options');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', t('imageTitle'));
  for (const value of IMAGE_PERMISSIONS) {
    const option = make(document, 'label', 'pm-option');
    const input = make(document, 'input');
    input.type = 'radio';
    input.name = 'image-generation-permission';
    input.value = value;
    input.checked = getImagePermission(getConfig()) === value;
    input.addEventListener('change', () => { if (input.checked) change(() => setImagePermission(getConfig(), value)); });
    const text = make(document, 'span', 'pm-option-text');
    text.append(make(document, 'span', 'pm-option-label', t(KEYS[value][0])), make(document, 'span', 'pm-option-desc', t(KEYS[value][1])));
    option.append(input, text);
    group.append(option);
  }
  card.append(group);
  return card;
}

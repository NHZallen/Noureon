// The ⋯ button at the right of a row of Settings (a passkey, a device) and the small menu it opens: the same menu as the rows of the projects (docs/superpowers/specs/2026-10-31-ui-style-rules.md),
// not a pair of text links in the row. `items` are [{ label, icon, action, danger }].

import { ICONS, openMenu } from '../../ui/projects/project-parts.js';

/** A round ⋯ button for a row. Pressing it opens the menu below it; pressing it again closes it. */
export function createRowMoreButton({ document, label, getItems }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'us-more';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.innerHTML = ICONS.dots(20);
  let menu = null;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu) { menu.close(); return; }
    button.setAttribute('aria-expanded', 'true');
    menu = openMenu({
      document,
      root: document.body,
      anchor: button,
      items: getItems(),
      onClose: () => { menu = null; button.removeAttribute('aria-expanded'); }
    });
  });
  return button;
}

/** A round icon button for a row with one action (the sign-out of a device): the icon says it, the name is for a screen reader. */
export function createRowIconButton({ document, label, icon, action }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'us-more';
  button.dataset.action = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = icon;
  return button;
}

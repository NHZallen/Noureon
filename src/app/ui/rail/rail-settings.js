// The choice of the panel in the settings (Personalization, below the colour scheme): docked beside the rail, or only while the pointer is on the rail. The row is made here and put after the row of
// the colour scheme, in the same markup as the rows around it; it is hidden where there is no rail (a phone), and its words follow the language. The choice itself is kept by the rail (rail-mode.js).

import { PANEL_MODES } from './rail-mode.js';

/** deps: document, text(key), onChange(mode). Returns { sync(layout, mode), labels() } or null when the settings have no appearance card yet. */
export function mountPanelModeRow({ document, text, onChange }) {
  const scheme = document.getElementById('color-scheme-select');
  const after = scheme?.closest('.pz-row');
  if (!after?.parentNode) return null;
  const row = document.createElement('div');
  row.className = 'pz-row';
  row.id = 'rail-panel-row';
  row.hidden = true;
  const copy = document.createElement('div');
  copy.className = 'pz-text';
  const label = document.createElement('label');
  label.className = 'pz-label';
  label.htmlFor = 'rail-panel-select';
  const sub = document.createElement('p');
  sub.className = 'pz-sub text-[var(--text-secondary)]';
  copy.append(label, sub);
  const select = document.createElement('select');
  select.id = 'rail-panel-select';
  select.className = 'pz-select';
  for (const mode of PANEL_MODES) {
    const option = document.createElement('option');
    option.value = mode;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  row.append(copy, select);
  after.after(row);
  const labels = () => {
    label.textContent = text('railPanelMode');
    sub.textContent = text('railPanelModeSub');
    for (const option of select.options) option.textContent = text(option.value === 'hover' ? 'railPanelHover' : 'railPanelPinned');
  };
  labels();
  return {
    labels,
    sync(layout, mode) {
      row.hidden = layout === 'none';
      select.value = mode;
    }
  };
}

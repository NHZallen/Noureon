import { visionText } from '../../ui/files/vision/vision-texts.js';

export function ensureAutoWebSearchSettingsControl({ document, elements }) {
  if (document.getElementById('auto-web-search-toggle-switch')) {
    elements.autoWebSearchToggleSwitch = document.getElementById('auto-web-search-toggle-switch');
    return;
  }
  const section = document.getElementById('accessibility-section');
  if (!section) return;
  const row = document.createElement('div');
  row.className = 'flex items-center justify-between mt-4';
  row.innerHTML = `
    <label for="auto-web-search-toggle-switch" class="flex-1 text-sm font-medium" data-lang-key="enableSmartWebSearch">Enable Smart Search</label>
    <div class="relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in">
      <input type="checkbox" name="auto-web-search-toggle-switch" id="auto-web-search-toggle-switch" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
      <label for="auto-web-search-toggle-switch" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
    </div>`;
  const anchor = section.querySelector('#auto-naming-toggle-switch')?.closest('.flex.items-center.justify-between');
  if (anchor) anchor.after(row);
  else section.appendChild(row);
  elements.autoWebSearchToggleSwitch = row.querySelector('#auto-web-search-toggle-switch');
}

export function ensureVisionCheckSettingsControl({ document, elements, config }) {
  const section = document.getElementById('accessibility-section');
  if (!section) return;
  let row = document.getElementById('vision-check-setting-row');
  if (!row) {
    row = document.createElement('div');
    row.id = 'vision-check-setting-row';
    row.className = 'mt-4';
    const anchor = section.querySelector('#auto-web-search-toggle-switch')?.closest('.flex.items-center.justify-between');
    if (anchor) anchor.after(row);
    else section.appendChild(row);
    const line = document.createElement('div');
    line.className = 'flex items-center justify-between';
    const label = document.createElement('label');
    label.htmlFor = 'vision-check-toggle-switch';
    label.className = 'flex-1 text-sm font-medium';
    const control = document.createElement('div');
    control.className = 'relative inline-block w-12 h-6 mr-2 align-middle select-none transition duration-200 ease-in';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'vision-check-toggle-switch';
    input.className = 'toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer';
    const track = document.createElement('label');
    track.htmlFor = input.id;
    track.className = 'toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer';
    control.append(input, track);
    line.append(label, control);
    const hint = document.createElement('p');
    hint.className = 'text-xs text-[var(--text-secondary)] mt-1';
    row.append(line, hint);
  }
  if (typeof row.querySelector !== 'function') return;
  const label = row.querySelector('label[for="vision-check-toggle-switch"]');
  const hint = row.querySelector('p');
  if (label) label.textContent = visionText(config.uiLanguage, 'setting');
  if (hint) hint.textContent = visionText(config.uiLanguage, 'hint');
  elements.visionCheckToggleSwitch = row.querySelector('#vision-check-toggle-switch');
}

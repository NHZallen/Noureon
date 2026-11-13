import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { openPlusSheet, closePlusSheet } from '../src/app/ui/plus-sheet/plus-sheet.js';
import { PLUS_SHEET_TEXT_KEYS, PLUS_SHEET_TEXT_LANGUAGES, plusSheetText } from '../src/app/ui/plus-sheet/plus-sheet-texts.js';
import { decideSheetDrag } from '../src/app/ui/citations/sheet-drag.js';

// The page of the composer, as far as the sheet reads it: the buttons and controls of the old menu (hidden on a phone) are the truth.
const page = ({ image = false, hidden = [], active = [] } = {}) => {
  const window = new Window({ url: 'https://example.test/', width: 390, height: 800 });
  const { document } = window;
  const button = (id, label) => `<button id="${id}" style="display:${hidden.includes(id) ? 'none' : 'flex'}" class="${active.includes(id) ? 'is-active' : ''}"><span class="composer-menu-copy"><span>${label}</span></span></button>`;
  const select = (id, values, value) => `<select id="${id}">${values.map((v) => `<option value="${v}"${v === value ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  document.body.innerHTML = `
    <div id="message-input" contenteditable="true" tabindex="0"></div>
    <button id="add-file-btn" aria-expanded="false"></button>
    ${button('camera-btn', 'Camera')}${button('upload-image-btn', 'Photos')}${button('upload-file-btn', 'Files')}${button('upload-drive-btn', 'Google Drive')}
    ${button('web-search-popover-btn', 'Search')}${button('model-council-menu-btn', 'Council')}${button('research-mode-menu-btn', 'Research')}${button('learning-mode-btn', 'Learning')}
    <div id="deck-design-control" style="display:${image ? 'none' : 'inline-flex'}"><button id="deck-design-btn"></button></div>
    <label id="image-aspect-ratio-control" style="display:${image ? 'flex' : 'none'}"><span>Aspect ratio</span>${select('image-aspect-ratio-select', ['auto', '1:1', '16:9'], '1:1')}</label>
    <label id="image-resolution-control" style="display:none"><span>Resolution</span>${select('image-resolution-select', ['1K', '2K'], '1K')}</label>
    <details id="image-advanced-control" style="display:${image ? 'block' : 'none'}"><summary>Advanced settings</summary>
      <label style=""><span>Count</span>${select('image-n-select', ['1', '2', '3'], '1')}</label>
      <label style=""><span>Quality</span>${select('image-quality-select', ['auto', 'low', 'high'], 'auto')}</label>
      <label style=""><span>Format</span>${select('image-output-format-select', ['png', 'jpeg', 'gif'], 'png')}</label>
      <label style="display:none"><span>Background</span>${select('image-background-select', ['auto', 'opaque'], 'auto')}</label>
      <label style=""><span>Compression</span>${select('image-output-compression-select', ['70', '80', '90'], '90')}</label>
      <label style=""><span>Frames</span>${select('image-frame-count-select', ['4', '8'], '4')}</label>
      <label style=""><span>Frame time (ms)</span>${select('image-frame-duration-select', ['100', '200'], '100')}</label>
      <label><span>Seed</span><input id="image-seed-input"></label>
      <label><span>Provider options</span><textarea id="image-provider-options-input"></textarea></label>
    </details>`;
  const pressed = [];
  for (const id of ['camera-btn', 'upload-image-btn', 'upload-file-btn', 'upload-drive-btn', 'web-search-popover-btn', 'model-council-menu-btn', 'research-mode-menu-btn', 'learning-mode-btn']) {
    document.getElementById(id).addEventListener('click', () => pressed.push(id));
  }
  const changes = [];
  // Only the controls of the old menu (they have ids) count; the sheet's own inputs are not them.
  document.addEventListener('change', (event) => { if (event.target.id) changes.push([event.target.id, event.target.value]); });
  const conversation = { id: 'c1' };
  const ctx = { document, window, getActiveConversation: () => conversation, getConfig: () => ({ uiLanguage: 'en' }), saveAppData: async () => {}, refresh: () => {}, closeAllPopovers: () => {} };
  return { window, document, ctx, pressed, changes, conversation };
};

afterEach(() => closePlusSheet());

test('the texts of the sheet exist in all five languages', () => {
  assert.deepEqual(PLUS_SHEET_TEXT_LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  for (const language of PLUS_SHEET_TEXT_LANGUAGES) {
    for (const key of PLUS_SHEET_TEXT_KEYS) assert.ok(plusSheetText(language, key) && plusSheetText(language, key) !== key, `${language} ${key}`);
  }
});

test('the first page holds three tiles, Google Drive, the tools and Design, with the close button on the left', () => {
  const { document, ctx } = page({ active: ['learning-mode-btn'] });
  const sheet = openPlusSheet(ctx);
  assert.equal(document.querySelectorAll('.ps-tile').length, 3);
  assert.deepEqual([...document.querySelectorAll('.ps-row-name')].map((node) => node.textContent), ['Google Drive', 'Search', 'Council', 'Research', 'Learning', 'Design']);
  assert.equal(document.querySelector('.ps-row.is-on .ps-row-name').textContent, 'Learning', 'an active tool shows its tick');
  assert.equal(document.querySelector('.ps-title').textContent, 'Add');
  assert.equal(document.querySelector('.ps-lead').getAttribute('aria-label'), 'Close');
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), true);
  assert.equal(document.getElementById('add-file-btn').getAttribute('aria-expanded'), 'true');
  assert.equal(openPlusSheet(ctx), null, 'one sheet at a time');
  sheet.close();
  assert.equal(document.documentElement.classList.contains('source-sheet-open'), false);
});

test('what a model cannot use is grey in its place (the tiles) or left out (the tools)', () => {
  const { document, ctx } = page({ hidden: ['camera-btn', 'upload-image-btn', 'web-search-popover-btn', 'upload-drive-btn'] });
  openPlusSheet(ctx);
  assert.deepEqual([...document.querySelectorAll('.ps-tile')].map((node) => node.disabled), [true, true, false], 'camera and photos are grey, the files tile keeps its place');
  const rows = [...document.querySelectorAll('.ps-row')];
  assert.equal(rows[0].querySelector('.ps-row-name').textContent, 'Google Drive');
  assert.equal(rows[0].disabled, true, 'Google Drive is always there, grey when it cannot be used');
  assert.equal(rows.some((row) => row.textContent.includes('Search')), false, 'a tool the model does not have has no row');
  closePlusSheet();
});

test('pressing a row presses the button of the old menu inside the same click, and the sheet goes', () => {
  const { document, ctx, pressed } = page();
  openPlusSheet(ctx);
  document.querySelectorAll('.ps-tile')[2].click();
  assert.deepEqual(pressed, ['upload-file-btn']);
  assert.equal(document.querySelector('.ps-root.is-open'), null, 'the sheet is on its way out');
  const again = openPlusSheet(ctx);
  assert.ok(again);
  [...document.querySelectorAll('.ps-row')].find((row) => row.textContent.includes('Learning')).click();
  assert.deepEqual(pressed, ['upload-file-btn', 'learning-mode-btn']);
});

test('the keyboard yields to the sheet and comes back after it', async () => {
  const { document, ctx } = page();
  const editor = document.getElementById('message-input');
  editor.focus();
  assert.equal(document.activeElement, editor);
  const sheet = openPlusSheet(ctx);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.notEqual(document.activeElement, editor);
  sheet.close();
  assert.equal(document.activeElement, editor);
});

test('a picture model gets the shape and the advanced settings instead of the tools, and no design', () => {
  const { document, ctx, changes } = page({ image: true });
  const sheet = openPlusSheet(ctx);
  assert.deepEqual([...document.querySelectorAll('.ps-row-name')].map((node) => node.textContent), ['Google Drive', 'Aspect ratio', 'Advanced settings']);
  [...document.querySelectorAll('.ps-row')][1].click();
  assert.equal(document.querySelector('.ps-title').textContent, 'Aspect ratio');
  assert.equal(document.querySelector('.ps-lead').getAttribute('aria-label'), 'Back');
  assert.equal(document.querySelector('.ps-ratio[aria-pressed="true"]').dataset.value, '1:1');
  document.querySelector('.ps-ratio[data-value="16:9"]').click();
  assert.deepEqual(changes.at(-1), ['image-aspect-ratio-select', '16:9'], 'the select of the old menu is set and told, so its own code keeps the choice');
  assert.equal(document.querySelector('.ps-ratio[aria-pressed="true"]').dataset.value, '16:9');
  document.querySelector('.ps-lead').click();
  assert.equal(document.querySelector('.ps-title').textContent, 'Add', 'back to the first page');
  sheet.close();
});

test('the advanced page follows what the format allows', () => {
  const { document, ctx, changes } = page({ image: true });
  openPlusSheet(ctx);
  [...document.querySelectorAll('.ps-row')][2].click();
  const labels = () => [...document.querySelectorAll('.ps-field-label')].map((node) => node.textContent);
  assert.deepEqual(labels(), ['Count', 'Quality', 'Format', 'Seed', 'Provider options'], 'png: no compression, no frames, and the background the model lacks stays out');
  document.querySelector('.ps-segment[data-value="jpeg"]').click();
  assert.deepEqual(changes.at(-1), ['image-output-format-select', 'jpeg']);
  assert.deepEqual(labels(), ['Count', 'Quality', 'Format', 'Compression', 'Seed', 'Provider options']);
  document.querySelector('.ps-segment[data-value="gif"]').click();
  assert.deepEqual(labels(), ['Count', 'Quality', 'Format', 'Frames', 'Frame time (ms)', 'Seed', 'Provider options']);
  const more = [...document.querySelectorAll('.ps-step')][1];
  more.click();
  assert.deepEqual(changes.at(-1), ['image-n-select', '2']);
  const input = document.querySelector('.ps-input');
  input.value = '12a3';
  input.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.deepEqual(changes.at(-1), ['image-seed-input', '123'], 'a seed is digits');
  const json = document.querySelector('textarea.ps-input');
  json.value = '{oops';
  json.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
  assert.equal(document.querySelector('.ps-error').hidden, false, 'a JSON that cannot be read is not sent to the setting');
  assert.notEqual(changes.at(-1)[0], 'image-provider-options-input');
  closePlusSheet();
});

test('the sheet is pulled the way the sources sheet is', () => {
  assert.equal(decideSheetDrag({ state: 'medium', dy: 200, expandable: true }), 'close');
  assert.equal(decideSheetDrag({ state: 'large', dy: 200, expandable: true }), 'medium');
  assert.equal(decideSheetDrag({ state: 'medium', dy: -80, expandable: true }), 'large');
  assert.equal(decideSheetDrag({ state: 'medium', dy: 10, expandable: true }), 'medium');
});

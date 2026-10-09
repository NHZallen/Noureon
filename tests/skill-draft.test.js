import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach } from 'node:test';

import { marked } from 'marked';
import { Window } from 'happy-dom';

import { createLazySkillMode } from '../src/app/runtime/skill/lazy-skill-mode.js';
import { clearSkillSelection } from '../src/app/runtime/skill/skill-bridge.js';
import { createSkillStore } from '../src/app/runtime/skill/skill-store.js';
import { createMarkdownRenderingHelpers } from '../src/app/runtime/legacy-core/markdown-rendering-helpers.js';
import { draftOf, hydrateSkillDrafts } from '../src/app/ui/skill/skill-draft-card.js';
import { draftHasFiles, readDraftBundle, splitDraft } from '../src/data/skill-draft.js';
import { OFFICIAL_SKILL_CATALOG } from '../src/data/skill-catalog.js';

// These tests use names of their own (some are the names of official skills, which a person cannot take): the official skills are looked at in official-skills.test.js.
OFFICIAL_SKILL_CATALOG.length = 0;

afterEach(() => clearSkillSelection());

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const DRAFT = '---\nname: meeting-notes\ndescription: Turns messy notes into minutes.\n---\n\nList the decisions first.\n';

function renderer() {
  const window = new Window({ url: 'https://example.test/' });
  class BrowserLikeDOMParser {
    parseFromString(html) {
      const parsedDocument = window.document.implementation.createHTMLDocument('');
      const bodyMatch = /^<body>([\s\S]*)<\/body>$/.exec(html);
      parsedDocument.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
      return parsedDocument;
    }
  }
  return createMarkdownRenderingHelpers({ marked, sanitizer: { sanitize: (html) => html }, DOMParser: BrowserLikeDOMParser, katex: { renderToString: () => '' }, getUiLanguage: () => 'en', getText: (key, fallback) => fallback, logger: console });
}

test('a ```skill-draft block in an answer becomes a placeholder that carries the draft; other code blocks stay', () => {
  const html = renderer().renderMarkdown(`Here is the skill:\n\n\`\`\`skill-draft\n${DRAFT}\`\`\`\n\nAnd some code:\n\n\`\`\`python\nprint(1)\n\`\`\`\n`);
  const window = new Window();
  window.document.body.innerHTML = html;
  const cards = window.document.querySelectorAll('.skill-draft-card');
  assert.equal(cards.length, 1);
  assert.equal(draftOf(cards[0]), DRAFT);
  assert.equal(window.document.querySelectorAll('pre > code.language-skill-draft').length, 0, 'the block itself is gone');
  assert.equal(window.document.querySelectorAll('pre > code.language-python').length, 1);
  assert.equal(draftOf({ dataset: { draft: '%E0%A4%A' } }), '', 'a text that cannot be read is empty, never a crash');
});

test('a good draft is a card: the name, what it is for, the text to read, and a button that hands the draft on; a bad one is the code with the reason', () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `<div class="skill-draft-card" data-draft="${encodeURIComponent(DRAFT)}"></div><div class="skill-draft-card" data-draft="${encodeURIComponent('no header here')}"></div>`;
  const added = [];
  assert.equal(hydrateSkillDrafts({ root: document, language: 'en', onAdd: (text) => added.push(text) }), 2);
  const [good, bad] = [...document.querySelectorAll('.skill-draft-card')];
  assert.equal(good.querySelector('.skill-draft-kind').textContent, 'Skill draft');
  assert.equal(good.querySelector('.skill-draft-name').textContent, 'meeting-notes');
  assert.equal(good.querySelector('.skill-draft-description').textContent, 'Turns messy notes into minutes.');
  assert.equal(good.querySelector('.skill-draft-text').textContent, 'List the decisions first.');
  assert.match(good.querySelector('summary').textContent, /Read the text \(25 characters\)/);
  good.querySelector('.skill-draft-add').click();
  assert.deepEqual(added, [DRAFT], 'the whole draft goes on, to the window that shows it');
  assert.equal(bad.classList.contains('is-invalid'), true);
  assert.equal(bad.querySelector('.skill-draft-add'), null, 'no button for a draft that is not a skill');
  assert.equal(bad.querySelector('.skill-draft-code').textContent, 'no header here');
  assert.match(bad.querySelector('.skill-draft-note').textContent, /This draft cannot be added yet: .*header.* Ask the model to fix it\./);
  // Made once.
  assert.equal(hydrateSkillDrafts({ root: document, language: 'en', onAdd: () => {} }), 0);
  assert.equal(hydrateSkillDrafts({ root: {}, language: 'en', onAdd: () => {} }), 0, 'a root that cannot be searched');
});

test('the card speaks the language of the page', () => {
  const window = new Window();
  window.document.body.innerHTML = `<div class="skill-draft-card" data-draft="${encodeURIComponent(DRAFT)}"></div>`;
  hydrateSkillDrafts({ root: window.document, language: 'zh-TW', onAdd: () => {} });
  assert.equal(window.document.querySelector('.skill-draft-kind').textContent, '技能草稿');
  assert.equal(window.document.querySelector('.skill-draft-add').textContent, '檢視並加入');
});

// ----- the page: placeholders turn into cards by themselves, and the button opens the window with the draft in it
function memoryClient() {
  const rows = [];
  const stored = new Map();
  const client = {
    rows,
    stored,
    storage: { from: () => ({ upload: async (path, body) => { stored.set(path, body); return { data: {}, error: null }; }, remove: async () => ({ error: null }), download: async () => ({ data: null, error: { message: 'x' } }) }) },
    from: () => {
      const state = { op: 'select', payload: null, filters: {} };
      const chain = {
        select: () => chain,
        insert: (payload) => { state.op = 'insert'; state.payload = payload; return chain; },
        update: (payload) => { state.op = 'update'; state.payload = payload; return chain; },
        eq: (key, value) => { state.filters[key] = value; return chain; },
        order: () => chain,
        limit: () => chain,
        then: (resolve) => {
          if (state.op === 'insert') rows.push({ ...state.payload });
          if (state.op === 'update') rows.splice(0, rows.length, ...rows.map((row) => (row.name === state.filters.name ? { ...row, ...state.payload } : row)));
          return Promise.resolve({ data: state.op === 'select' ? rows : null, error: null }).then(resolve);
        }
      };
      return chain;
    }
  };
  return client;
}

function page({ accountReady = true, rows = [] } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<main id="chat"></main><div class="composer-host"><div class="input-wrapper"><div id="editor" contenteditable="true"></div></div></div>';
  const cloud = memoryClient();
  cloud.rows.push(...rows);
  const skillStore = createSkillStore({ getClient: () => cloud, getUserId: () => 'u1' });
  const settings = { skillEnabledIds: [], skillModelUseIds: [], skillStamps: {}, skillUseStamps: {} };
  const log = { saved: 0, notices: [], refreshed: 0 };
  const mode = createLazySkillMode({
    document,
    messageInput: document.getElementById('editor'),
    getConfig: () => settings,
    getUiLanguage: () => 'en',
    refresh: () => { log.refreshed += 1; },
    skillStore,
    saveConfig: async () => { log.saved += 1; },
    showNotification: (text, kind) => log.notices.push([text, kind]),
    getAccountReady: () => accountReady
  });
  const chat = document.getElementById('chat');
  const show = (draft) => { chat.insertAdjacentHTML('beforeend', `<div class="skill-draft-card" data-draft="${encodeURIComponent(draft)}"></div>`); };
  return { window, document, chat, cloud, settings, log, mode, skillStore, show };
}

test('a placeholder that appears in the chat becomes a card by itself, and the button opens the window of a pasted skill with the draft in it', async () => {
  const t = page();
  t.show(DRAFT);
  await tick(150);
  assert.ok(t.chat.querySelector('.skill-draft-add'), 'the card was made');
  t.chat.querySelector('.skill-draft-add').click();
  await tick(150);
  const modal = t.document.querySelector('.skill-paste');
  assert.ok(modal, 'the window is open');
  assert.equal(modal.querySelector('.skill-paste-text').value, DRAFT, 'the draft is in it, to be read');
  assert.match(modal.querySelector('.skill-paste-found').textContent, /meeting-notes/, 'and checked');
  assert.equal(t.cloud.rows.length, 0, 'nothing is saved before the person presses "Add"');
  modal.querySelector('button[type="submit"]').click();
  await tick(150);
  assert.equal(t.document.querySelector('.skill-paste') === null, true);
  assert.deepEqual(t.cloud.rows.map((row) => row.name), ['meeting-notes']);
  assert.deepEqual(t.settings.skillEnabledIds, ['meeting-notes'], 'it is among the person\'s skills, and the model may use it');
  assert.deepEqual(t.settings.skillModelUseIds, ['meeting-notes']);
  assert.equal(t.log.saved, 1);
  assert.ok(t.log.refreshed >= 1);
  assert.deepEqual(t.log.notices.at(-1), ['Skill “meeting-notes” added.', 'success']);
});

test('without a cloud account the button says so and opens nothing; a name the person has offers "Replace"', async () => {
  const none = page({ accountReady: false });
  none.show(DRAFT);
  await tick(150);
  none.chat.querySelector('.skill-draft-add').click();
  await tick(60);
  assert.equal(none.document.querySelector('.skill-paste') === null, true);
  assert.match(none.log.notices[0][0], /needs a cloud account/);

  const have = page({ rows: [{ user_id: 'u1', name: 'meeting-notes', description: 'Old.', body: 'Old text.' }] });
  have.show(DRAFT);
  await tick(150);
  have.chat.querySelector('.skill-draft-add').click();
  await tick(150);
  assert.equal(have.document.querySelector('.skill-paste button[type="submit"]').textContent, 'Replace');
});

test('the draft card styles use the tokens only, and live in their own file, not in the main style sheet', () => {
  const css = readFileSync(new URL('../src/app/ui/skill/skill-draft-card.css', import.meta.url), 'utf8');
  assert.equal(/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css), false);
  assert.match(css, /\.skill-draft-add \{[^}]*var\(--button-primary-bg\)/);
  assert.equal(readFileSync(new URL('../src/styles/permissions.css', import.meta.url), 'utf8').includes('skill-draft'), false);
});

// ----- a draft with files
const SCRIPT_DRAFT = [
  '=== SKILL.md ===',
  '---',
  'name: sales-report',
  'description: Builds the monthly sales report from a spreadsheet.',
  '---',
  '',
  'Run scripts/summary.py on the spreadsheet, then read references/format.md.',
  '=== scripts/summary.py ===',
  'import sys',
  'print("summary", sys.argv[1])',
  '=== references/format.md ===',
  '# Format',
  'Use bullets.',
  ''
].join('\n');

test('a draft names its files after lines of the form "=== path ==="; text before the first one is the SKILL.md too; without such a line it is the SKILL.md alone', () => {
  assert.equal(draftHasFiles(SCRIPT_DRAFT), true);
  assert.equal(draftHasFiles(DRAFT), false);
  assert.deepEqual(splitDraft(DRAFT), [{ path: 'SKILL.md', text: DRAFT }], 'a draft without files is one file');
  const parts = splitDraft(SCRIPT_DRAFT);
  assert.deepEqual(parts.map((part) => part.path), ['SKILL.md', 'scripts/summary.py', 'references/format.md']);
  assert.equal(parts[1].text, 'import sys\nprint("summary", sys.argv[1])\n');
  assert.equal(parts[2].text, '# Format\nUse bullets.\n');
  // Without the first line the text before the second is the SKILL.md.
  const implicit = splitDraft(`${DRAFT}=== scripts/a.py ===\nprint(1)\n`);
  assert.deepEqual(implicit.map((part) => part.path), ['SKILL.md', 'scripts/a.py']);
  assert.equal(implicit[0].text, DRAFT);
  assert.equal(draftHasFiles('=== not a marker\n=== also not ==x'), false);
  assert.deepEqual(splitDraft('=== a.md ===\r\ntext\r\n').map((part) => part.text), ['text\n']);
});

test('a draft with files is checked as an uploaded pack: its skill, its files and their kinds; what a pack refuses is refused with the same reason', async () => {
  const read = await readDraftBundle(SCRIPT_DRAFT);
  assert.equal(read.ok, true);
  assert.equal(read.skill.name, 'sales-report');
  assert.deepEqual(read.files.map((file) => [file.path, file.kind]), [['references/format.md', 'text'], ['scripts/summary.py', 'script']]);
  assert.ok(read.bundle instanceof Uint8Array, 'and the clean zip to keep');
  assert.equal((await readDraftBundle(SCRIPT_DRAFT.replace('=== SKILL.md ===\n', ''))).ok, true, 'the first line is not needed');
  const without = await readDraftBundle('=== scripts/a.py ===\nprint(1)\n');
  assert.deepEqual([without.error, without.detail], ['skill_md_missing', 'SKILL.md']);
  const twice = await readDraftBundle(`${SCRIPT_DRAFT}=== SKILL.md ===\n${DRAFT}`);
  assert.deepEqual([twice.error, twice.detail], ['duplicate_path', 'SKILL.md']);
  const exe = await readDraftBundle(`${SCRIPT_DRAFT}=== tool.exe ===\nx\n`);
  assert.deepEqual([exe.error, exe.detail], ['blocked_file', 'tool.exe']);
  const escape = await readDraftBundle(`${SCRIPT_DRAFT}=== /etc/evil.py ===\nx\n`);
  assert.equal(escape.error, 'bad_path');
  const header = await readDraftBundle('=== SKILL.md ===\nno header\n=== a.md ===\nx\n');
  assert.equal(header.error, 'no_header', 'the SKILL.md follows the rules of a skill');
  const same = await readDraftBundle(`${SCRIPT_DRAFT}=== references/FORMAT.md ===\nx\n`);
  assert.equal(same.error, 'duplicate_path', 'the same path with other capitals');
});

test('four backticks hold a draft whose files have three in them: it is one block, and one card', () => {
  const draft = `=== SKILL.md ===\n${DRAFT}=== references/code.md ===\nExample:\n\n\`\`\`python\nprint(1)\n\`\`\`\n`;
  const html = renderer().renderMarkdown(`Done:\n\n\`\`\`\`skill-draft\n${draft}\`\`\`\`\n\nTry it.`);
  const window = new Window();
  window.document.body.innerHTML = html;
  const cards = window.document.querySelectorAll('.skill-draft-card');
  assert.equal(cards.length, 1);
  assert.equal(draftOf(cards[0]), draft);
});

test('the card of a draft with files lists them, marks the scripts, and gives the whole draft to the button; a draft the pack would refuse shows why', async () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `<div class="skill-draft-card" data-draft="${encodeURIComponent(SCRIPT_DRAFT)}"></div><div class="skill-draft-card" data-draft="${encodeURIComponent(`${SCRIPT_DRAFT}=== tool.exe ===\nx\n`)}"></div>`;
  const added = [];
  assert.equal(hydrateSkillDrafts({ root: document, language: 'en', onAdd: (text) => added.push(text) }), 2);
  await tick(150);
  const [good, bad] = [...document.querySelectorAll('.skill-draft-card')];
  assert.equal(good.querySelector('.skill-draft-name').textContent, 'sales-report');
  assert.deepEqual([...good.querySelectorAll('.skill-draft-file-path')].map((node) => node.textContent), ['references/format.md', 'scripts/summary.py']);
  assert.equal(good.querySelectorAll('.skill-draft-script').length, 1, 'only the script is marked');
  assert.match(good.querySelector('.skill-draft-files-title').textContent, /Files \(2\)/);
  good.querySelector('.skill-draft-add').click();
  assert.deepEqual(added, [SCRIPT_DRAFT]);
  assert.equal(bad.classList.contains('is-invalid'), true);
  assert.match(bad.querySelector('.skill-draft-note').textContent, /cannot hold programs or installers\. \(tool\.exe\) Ask the model to fix it/);
  assert.equal(bad.querySelector('.skill-draft-add'), null);
});

test('the button of a draft with files opens the window of a skill pack with every file to read, and "Add" keeps the zip and the row', async () => {
  const t = page();
  t.show(SCRIPT_DRAFT);
  await tick(250);
  t.chat.querySelector('.skill-draft-add').click();
  await tick(300);
  const modal = t.document.querySelector('.skill-bundle');
  assert.ok(modal, 'the window of a pack');
  assert.deepEqual([...modal.querySelectorAll('.skill-bundle-file-path')].map((node) => node.textContent), ['SKILL.md', 'references/format.md', 'scripts/summary.py']);
  assert.equal(modal.querySelectorAll('.skill-bundle-script').length, 1);
  assert.match(modal.querySelector('.skill-bundle-scripts-warning').textContent, /may run them in the sandbox/);
  assert.equal(t.cloud.stored.size, 0, 'nothing is kept before "Add"');
  modal.querySelector('button[type="submit"]').click();
  await tick(250);
  assert.equal(t.document.querySelector('.skill-bundle') === null, true);
  assert.equal(t.cloud.stored.size, 1);
  assert.deepEqual(t.cloud.rows[0].files.map((file) => file.path), ['references/format.md', 'scripts/summary.py']);
  assert.deepEqual(t.settings.skillEnabledIds, ['sales-report']);
  assert.deepEqual(t.log.notices.at(-1), ['Skill “sales-report” added.', 'success']);
  assert.equal(t.log.saved, 1);
});

test('a draft with files that the pack would refuse opens no window and says why', async () => {
  const t = page();
  const { createSkillDrafts } = await import('../src/app/runtime/skill/skill-drafts.js');
  const drafts = createSkillDrafts({ document: t.document, language: () => 'en', getConfig: () => t.settings, showNotification: (text, kind) => t.log.notices.push([text, kind]), getAccountReady: () => true, skillStore: t.skillStore, own: () => [] });
  await drafts.addDraft(`${SCRIPT_DRAFT}=== tool.exe ===\nx\n`);
  assert.equal(t.document.querySelector('.skill-bundle') === null, true);
  assert.match(t.log.notices.at(-1)[0], /programs or installers\. \(tool\.exe\)/);
  assert.equal(t.log.notices.at(-1)[1], 'error');
});

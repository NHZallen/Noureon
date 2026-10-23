import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { getRuntimeText } from '../src/app/runtime/i18n/runtime-texts.js';
import { createModelMemoryDashboardLifecycle } from '../src/app/runtime/shell/model-memory-dashboard-lifecycle.js';

// The memory page of the settings as a person uses it: the list is drawn from the memory state, and each button does what it says and saves.
// (The page is happy-dom; the memory modules are the real ones.)

const NOW = '2026-10-01T00:00:00.000Z';

const entry = (id, content, extra = {}) => ({
  id, kind: 'preference', content, usePolicy: 'response-style', mentionPolicy: 'when-helpful', status: 'active', extractionConfidence: null,
  confirmedByUser: true, effectiveFrom: NOW, createdAt: NOW, updatedAt: NOW, supersedes: [], sourceRefs: [], ...extra
});

const buildState = (extra = {}) => ({
  version: 2, resolvedProfileCandidateIds: [], resolvedTopicSummaryIds: [], recentConversationStates: [], mediaMemories: [], conversationCapsules: [],
  profileEntries: [entry('e1', 'Likes tea'), entry('e2', 'Lives in Taipei'), entry('e3', 'Old address', { status: 'superseded' })],
  profileCandidates: [
    { id: 'c1', content: 'Moved to Osaka', suggestedSupersedes: ['e2'], status: 'pending', createdAt: NOW },
    { id: 'c2', content: 'Plays go', suggestedSupersedes: [], status: 'pending', createdAt: NOW }
  ],
  legacyInbox: [{ id: 'l1', content: 'An old note' }],
  longTermTopicSummaries: [{ id: 't1', topic: 'Cooking', summary: 'Likes soup.' }, { id: 't2', topic: '', summary: 'No name' }],
  suppressionRules: [
    { id: 'r1', type: 'custom', instruction: 'Do not bring up my job', status: 'active', createdAt: NOW, updatedAt: NOW },
    { id: 'r2', type: 'do-not-mention', target: 'profile-name', status: 'active', createdAt: NOW, updatedAt: NOW }
  ],
  ...extra
});

const TEXTS = {
  confirmDeleteMemory: 'Delete this memory?', memoryReplaceAction: 'Replace', delete: 'Delete', edit: 'Edit', memoryCandidateLabel: 'Candidate',
  memoryCandidateDismiss: 'Dismiss', memoryCandidateKeep: 'Keep', memoryCandidateReplaceKeep: 'Keep and replace', memoryLegacyLabel: 'Legacy',
  memoryAddSuppressionRule: 'Add rule', memoryNoMentionName: 'Never mention my name', memorySupersededPrefix: 'Replaced: {content}',
  memoryReplacePrompt: 'Replace "{content}" with:', memoryReplaceTitle: 'Replace', memoryRuleEditPrompt: 'Edit "{rule}"', memoryRuleEditTitle: 'Edit rule'
};

const harness = (options = {}) => {
  const window = new Window({ url: 'https://noureon.test/', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
  const { document } = window;
  document.body.innerHTML = '<div id="settings-modal" class="modal"><button id="add-personal-memory-btn" class="mt-4">Add</button><p id="spacer"></p><div id="personal-memory-list"></div></div>';
  const container = document.getElementById('personal-memory-list');
  const calls = [];
  const state = { memory: 'memory' in options ? options.memory : buildState(), personal: options.personal ?? [], uuid: 0, answers: { confirm: true, prompt: 'new text' } };
  const conversation = options.conversation ?? { id: 'conv', messages: [] };
  const config = { uiLanguage: 'en', memorySystemVersion: options.version ?? 2 };
  const elements = {
      personalMemoryList: container,
      settingsModal: document.getElementById('settings-modal'),
      dataDashboardModal: document.createElement('div'),
      totalConvStat: document.createElement('span'), totalFolderStat: document.createElement('span'), mostUsedModelStat: document.createElement('span')
  };
  const lifecycle = createModelMemoryDashboardLifecycle({
    Chart: class { destroy() {} },
    document,
    crypto: { randomUUID: () => `uuid-${state.uuid += 1}` },
    elements,
    getConfig: () => config,
    getConversations: () => options.conversations ?? [conversation],
    getFolders: () => options.folders ?? [],
    getPersonalMemories: () => state.personal,
    replacePersonalMemories: (next) => { calls.push(['replacePersonalMemories', next.map((memory) => memory.id)]); state.personal = next; return next; },
    getMemoryState: () => state.memory,
    replaceMemoryState: (next) => { calls.push(['replaceMemoryState']); state.memory = next; },
    captureCompletedTurn: options.captureCompletedTurn ?? null,
    enqueueMemoryCapture: options.enqueueMemoryCapture ?? null,
    hashString: options.hashString ?? null,
    models: [{ id: 'm-a', name: 'Model A' }, { id: 'm-b', name: 'Model B' }],
    i18n: { en: TEXTS },
    saveAppData: async () => { calls.push(['saveAppData']); },
    runtimeDialogCoordinator: { showNotification: (...args) => calls.push(['notify', ...args]) },
    showNotification: (...args) => calls.push(['notify', ...args]),
    showCustomConfirm: async () => state.answers.confirm,
    showCustomPrompt: async () => state.answers.prompt,
    toggleModal: (...args) => calls.push(['toggleModal', args[1]]),
    callApiWithSchema: options.callApiWithSchema ?? (async () => []),
    getActiveConversation: () => conversation,
    setupTimeAnalysis: () => calls.push(['setupTimeAnalysis']),
    console: { error: (...args) => calls.push(['console.error', args[0]]), log() {}, warn() {} }
  });
  const click = async (selector, index = 0) => {
    const buttons = container.querySelectorAll(selector);
    assert.ok(buttons[index], `no ${selector} #${index}`);
    buttons[index].dispatchEvent(new window.Event('click', { bubbles: true }));
    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  return { window, document, container, elements, calls, state, lifecycle, config, click, texts: () => [...container.querySelectorAll('span, p')].map((node) => node.textContent) };
};

const saved = (calls) => calls.filter((call) => call[0] === 'saveAppData').length;

test('the list shows entries, candidates, old notes, topics and rules; what is stored is text and never markup', () => {
  const page = harness({ memory: buildState({
    profileEntries: [entry('e"><img src=x onerror=alert(1)>', '<b>bold</b> <img src=x onerror=alert(1)>')],
    profileCandidates: [{ id: 'c"><svg onload=alert(1)>', content: '<script>alert(1)</script>', suggestedSupersedes: [], status: 'pending', createdAt: NOW }],
    legacyInbox: [{ id: 'l"><img src=x onerror=alert(1)>', content: '<img src=x onerror=alert(1)>' }],
    longTermTopicSummaries: [{ id: 't"><img src=x onerror=alert(1)>', topic: '<img src=x onerror=alert(1)>', summary: '<script>alert(1)</script>' }],
    suppressionRules: [{ id: 'r"><img src=x onerror=alert(1)>', type: 'custom', instruction: '<img src=x onerror=alert(1)>', status: 'active', createdAt: NOW, updatedAt: NOW }]
  }) });
  try {
    page.lifecycle.renderPersonalMemoryList();
    assert.equal(page.container.querySelectorAll('img, script, iframe, [onerror], [onload]').length, 0, 'nothing in the list is an element a stored text or id could make');
    for (const node of page.container.querySelectorAll('*')) {
      assert.deepEqual([...node.attributes].filter((attribute) => attribute.name.startsWith('on')), [], 'no handler attribute');
    }
    assert.ok(page.texts().some((text) => text.includes('<img src=x onerror=alert(1)>')), 'the text is shown as it is');
  } finally {
    page.window.close();
  }
});

test('the list shows every kind of line with its buttons, and the add button sits just above it', () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    const texts = page.texts();
    for (const expected of ['Likes tea', 'Lives in Taipei', 'Replaced: Old address', 'Moved to Osaka', 'An old note', 'Cooking', 'Likes soup.', 'Do not bring up my job', 'Never mention my name']) {
      assert.ok(texts.includes(expected), `shows "${expected}"`);
    }
    assert.equal(page.container.querySelectorAll('.memory-enabled-checkbox').length, 3);
    assert.equal(page.container.querySelectorAll('.memory-enabled-checkbox[disabled]').length, 1, 'a replaced entry cannot be switched');
    assert.equal(page.container.querySelectorAll('.replace-memory-btn').length, 2, 'only active entries can be replaced');
    assert.equal(page.container.querySelectorAll('.approve-superseding-candidate-btn').length, 1, 'only a candidate that suggests a replacement offers it');
    assert.ok(page.texts().some((text) => /Lives in Taipei/.test(text)), 'the suggestion names the entry that would be replaced');
    assert.equal(page.container.querySelectorAll('.edit-suppression-rule-btn').length, 2);
    assert.equal(page.container.previousElementSibling.id, 'add-personal-memory-btn');
    assert.equal(page.document.getElementById('add-personal-memory-btn').classList.contains('mb-3'), true);
    assert.ok(texts.includes(getRuntimeText('en', 'unnamedTopic')), 'a topic without a name is shown with the standard name');
  } finally {
    page.window.close();
  }
});

test('an unconnected list is left alone', () => {
  const page = harness();
  try {
    page.container.remove();
    assert.doesNotThrow(() => page.lifecycle.renderPersonalMemoryList());
  } finally {
    page.window.close();
  }
});

test('the checkbox of an entry switches it off and on, and saves each time', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    const box = page.container.querySelector('.memory-enabled-checkbox[data-id="e1"]');
    box.checked = false;
    box.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.state.memory.profileEntries.find((item) => item.id === 'e1').status, 'inactive');
    page.lifecycle.renderPersonalMemoryList();
    const again = page.container.querySelector('.memory-enabled-checkbox[data-id="e1"]');
    again.checked = true;
    again.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.state.memory.profileEntries.find((item) => item.id === 'e1').status, 'active');
    assert.equal(saved(page.calls), 2);
  } finally {
    page.window.close();
  }
});

test('deleting an entry asks first; no keeps it, yes removes it, saves and redraws', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    page.state.answers.confirm = false;
    await page.click('.delete-memory-btn');
    assert.equal(saved(page.calls), 0);
    assert.equal(page.state.memory.profileEntries.find((item) => item.id === 'e1').status, 'active');
    page.state.answers.confirm = true;
    await page.click('.delete-memory-btn');
    assert.equal(saved(page.calls), 1);
    assert.notEqual(page.state.memory.profileEntries.find((item) => item.id === 'e1')?.status, 'active');
  } finally {
    page.window.close();
  }
});

test('replacing an entry writes the new text over the old one; an empty answer changes nothing', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    page.state.answers.prompt = '';
    await page.click('.replace-memory-btn');
    assert.equal(saved(page.calls), 0);
    page.state.answers.prompt = 'Likes coffee';
    await page.click('.replace-memory-btn');
    assert.equal(saved(page.calls), 1);
    const entries = page.state.memory.profileEntries;
    assert.equal(entries.find((item) => item.id === 'uuid-1').content, 'Likes coffee');
    assert.equal(entries.some((item) => item.id === 'e1' && item.status === 'active'), false, 'the old entry is no longer active');
  } finally {
    page.window.close();
  }
});

test('an old note is kept as an entry or deleted after asking', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    page.state.answers.confirm = false;
    await page.click('.delete-legacy-memory-btn');
    assert.equal(page.state.memory.legacyInbox.length, 1);
    page.state.answers.confirm = true;
    await page.click('.delete-legacy-memory-btn');
    assert.equal(page.state.memory.legacyInbox.length, 0);
    const second = harness();
    try {
      second.lifecycle.renderPersonalMemoryList();
      await second.click('.review-memory-btn');
      assert.equal(second.state.memory.legacyInbox.length, 0);
      assert.ok(second.state.memory.profileEntries.some((item) => item.content === 'An old note' && item.status === 'active'));
    } finally {
      second.window.close();
    }
  } finally {
    page.window.close();
  }
});

test('a candidate is kept, kept in place of the entry it replaces, or dismissed for good', async () => {
  const keep = harness();
  try {
    keep.lifecycle.renderPersonalMemoryList();
    await keep.click('.approve-memory-candidate-btn', 1);
    assert.ok(keep.state.memory.profileEntries.some((item) => item.content === 'Plays go'));
    assert.equal(keep.state.memory.profileCandidates.some((item) => item.id === 'c2'), false);
  } finally {
    keep.window.close();
  }
  const replace = harness();
  try {
    replace.lifecycle.renderPersonalMemoryList();
    await replace.click('.approve-superseding-candidate-btn');
    assert.ok(replace.state.memory.profileEntries.some((item) => item.content === 'Moved to Osaka' && item.status === 'active'));
    assert.equal(replace.state.memory.profileEntries.some((item) => item.id === 'e2' && item.status === 'active'), false, 'the old entry is no longer active');
  } finally {
    replace.window.close();
  }
  const dismiss = harness();
  try {
    dismiss.lifecycle.renderPersonalMemoryList();
    await dismiss.click('.dismiss-memory-candidate-btn');
    assert.equal(dismiss.state.memory.profileCandidates.some((item) => item.id === 'c1'), false);
    assert.ok(dismiss.state.memory.resolvedProfileCandidateIds.includes('c1'), 'it is not suggested again');
    assert.equal(saved(dismiss.calls), 1);
  } finally {
    dismiss.window.close();
  }
});

test('a replacement suggested for an entry that is no longer active does nothing', async () => {
  const page = harness({ memory: buildState({ profileEntries: [entry('e1', 'Likes tea', { status: 'inactive' })], profileCandidates: [{ id: 'c1', content: 'Likes coffee', suggestedSupersedes: ['e1'], status: 'pending', createdAt: NOW }] }) });
  try {
    page.lifecycle.renderPersonalMemoryList();
    assert.equal(page.container.querySelectorAll('.approve-superseding-candidate-btn').length, 1);
    await page.click('.approve-superseding-candidate-btn');
    assert.equal(saved(page.calls), 0);
    assert.equal(page.state.memory.profileCandidates.length, 1);
  } finally {
    page.window.close();
  }
});

test('a topic summary is deleted and not made again', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    assert.equal(page.container.querySelectorAll('.delete-topic-summary-btn').length, 2);
    await page.click('.delete-topic-summary-btn');
    assert.equal(page.state.memory.longTermTopicSummaries.some((topic) => topic.id === 't1'), false);
    assert.ok(page.state.memory.resolvedTopicSummaryIds.includes('t1'));
    assert.equal(saved(page.calls), 1);
  } finally {
    page.window.close();
  }
});

test('rules: one is added with the text given, edited, deleted; an empty answer changes nothing', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    page.state.answers.prompt = null;
    await page.click('.add-suppression-rule-btn');
    assert.equal(saved(page.calls), 0);
    page.state.answers.prompt = 'Do not mention my pet';
    await page.click('.add-suppression-rule-btn');
    assert.ok(page.state.memory.suppressionRules.some((rule) => rule.instruction === 'Do not mention my pet'));

    page.state.answers.prompt = '';
    await page.click('.edit-suppression-rule-btn');
    const before = saved(page.calls);
    page.state.answers.prompt = 'Do not bring up work at all';
    await page.click('.edit-suppression-rule-btn');
    assert.equal(page.state.memory.suppressionRules.find((rule) => rule.id === 'r1').instruction, 'Do not bring up work at all');
    assert.equal(saved(page.calls), before + 1);

    await page.click('.delete-suppression-rule-btn');
    assert.equal(page.state.memory.suppressionRules.some((rule) => rule.id === 'r1'), false);
  } finally {
    page.window.close();
  }
});

test('a rule without an id is deleted by its place in the list', async () => {
  const page = harness();
  try {
    page.lifecycle.renderPersonalMemoryList();
    page.state.memory = { ...page.state.memory, suppressionRules: [{ type: 'custom', instruction: 'No id', status: 'active' }, { id: 'r2', type: 'custom', instruction: 'Keep me', status: 'active' }] };
    page.lifecycle.renderPersonalMemoryList();
    await page.click('.delete-suppression-rule-btn');
    assert.deepEqual(page.state.memory.suppressionRules.map((rule) => rule.id), ['r2']);
  } finally {
    page.window.close();
  }
});

test('without the new memory system the list is the personal memories: switch, delete after asking, and nothing else', async () => {
  const page = harness({ memory: null, personal: [{ id: 'p1', content: 'Likes tea', enabled: true }, { id: 'p2', content: 'Likes soup', enabled: false }] });
  try {
    page.lifecycle.renderPersonalMemoryList();
    assert.equal(page.container.querySelectorAll('.memory-enabled-checkbox').length, 2);
    assert.equal(page.container.querySelectorAll('.memory-enabled-checkbox[checked]').length, 1);
    assert.equal(page.container.querySelectorAll('.replace-memory-btn').length, 0);
    assert.equal(page.container.querySelectorAll('.add-suppression-rule-btn').length, 0);
    const box = page.container.querySelector('.memory-enabled-checkbox[data-id="p2"]');
    box.checked = true;
    box.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.state.personal.find((memory) => memory.id === 'p2').enabled, true);
    await page.click('.delete-memory-btn');
    assert.deepEqual(page.state.personal.map((memory) => memory.id), ['p2']);
  } finally {
    page.window.close();
  }
});

test('refining: the first memories are added as they are; later ones are merged by what the model says', async () => {
  const page = harness({ memory: null, personal: [], callApiWithSchema: async () => [
    { action: 'ADD', content: 'Plays go' }, { action: 'ADD', content: 'Likes tea' }, { action: 'UPDATE', id: 'p1', content: 'Likes green tea' },
    { action: 'UPDATE', id: 'missing', content: 'x' }, { action: 'IGNORE', content: 'dup' }
  ] });
  try {
    await page.lifecycle.refineAndStoreMemories([]);
    assert.deepEqual(page.calls, []);
    await page.lifecycle.refineAndStoreMemories(['Likes tea']);
    assert.deepEqual(page.state.personal.map((memory) => [memory.id, memory.content]), [['uuid-1', 'Likes tea']]);
    assert.ok(page.calls.some((call) => call[0] === 'notify' && call[2] === 'success'));
    page.state.personal[0].id = 'p1';
    page.document.getElementById('settings-modal').classList.add('hidden');
    page.container.innerHTML = '';
    await page.lifecycle.refineAndStoreMemories(['Plays go', 'tea']);
    assert.deepEqual(page.state.personal.map((memory) => memory.content), ['Likes green tea', 'Plays go']);
    assert.equal(saved(page.calls), 2);
    assert.equal(page.container.children.length, 0, 'the list is not drawn while the settings are closed');
  } finally {
    page.window.close();
  }
});

test('refining: nothing new means nothing saved; a model that fails or answers oddly is logged and leaves the memories alone', async () => {
  for (const answer of [() => [{ action: 'IGNORE', content: 'x' }], () => ({ not: 'a list' }), () => null, () => { throw new Error('model down'); }]) {
    const page = harness({ memory: null, personal: [{ id: 'p1', content: 'Likes tea', enabled: true }], callApiWithSchema: async () => answer() });
    try {
      await page.lifecycle.refineAndStoreMemories(['something']);
      assert.equal(saved(page.calls), 0);
      assert.deepEqual(page.state.personal.map((memory) => memory.content), ['Likes tea']);
    } finally {
      page.window.close();
    }
  }
  const failing = harness({ memory: null, personal: [{ id: 'p1', content: 'a', enabled: true }], callApiWithSchema: async () => { throw new Error('model down'); } });
  try {
    await failing.lifecycle.refineAndStoreMemories(['b']);
    assert.ok(failing.calls.some((call) => call[0] === 'console.error'));
  } finally {
    failing.window.close();
  }
});

test('extracting from a reply: a temporary chat is never remembered; the old system asks the model what to keep and merges it', async () => {
  const ephemeral = harness({ memory: null, conversation: { id: 'x', retentionMode: 'ephemeral', messages: [] }, callApiWithSchema: async () => { throw new Error('must not be asked'); } });
  try {
    await ephemeral.lifecycle.extractPersonalMemory('I like tea', 'ok');
  } finally {
    ephemeral.window.close();
  }
  const prompts = [];
  const page = harness({ memory: null, version: 1, callApiWithSchema: async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? ['Likes tea'] : []; } });
  try {
    await page.lifecycle.extractPersonalMemory('I like tea', 'ok');
    assert.match(prompts[0], /I like tea/);
    assert.deepEqual(page.state.personal.map((memory) => memory.content), ['Likes tea']);
    const none = harness({ memory: null, version: 1, callApiWithSchema: async () => [] });
    try {
      await none.lifecycle.extractPersonalMemory('hello', 'hi');
      assert.equal(saved(none.calls), 0);
    } finally {
      none.window.close();
    }
  } finally {
    page.window.close();
  }
});

test('extracting with the new memory system hands the new turns to the capture, and only the changed ones when a message was edited', async () => {
  const captured = [];
  const messages = (...texts) => texts.map((text, index) => ({ id: `m${index}`, role: index % 2 ? 'model' : 'user', parts: [{ text }] }));
  const hash = async (value) => `h:${value.length}`;
  const conversation = { id: 'conv', messages: messages('one', 'two') };
  const page = harness({ conversation, hashString: hash, captureCompletedTurn: async (options) => { captured.push(options); } });
  try {
    await page.lifecycle.extractPersonalMemory('one', 'two');
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].captureTurns.map((turn) => turn.text), ['one', 'two']);
    assert.equal(captured[0].conversationId, 'conv');

    // Everything up to the second message was captured: only the new message is handed on.
    page.state.memory = { ...page.state.memory, recentConversationStates: [{ conversationId: 'conv', coveredThroughMessageId: 'm1', sourceHash: captured[0].sourceHash }] };
    conversation.messages.push(...messages('x', 'x', 'three').slice(2).map((message) => ({ ...message, id: 'm2' })));
    await page.lifecycle.extractPersonalMemory('three', 'ok');
    assert.deepEqual(captured[1].captureTurns.map((turn) => turn.text), ['three']);

    // Nothing new and nothing edited: nothing is handed on.
    page.state.memory = { ...page.state.memory, recentConversationStates: [{ conversationId: 'conv', coveredThroughMessageId: 'm2', sourceHash: await hash(JSON.stringify([])) }] };
    const count = captured.length;
    page.state.memory = { ...page.state.memory, recentConversationStates: [{ conversationId: 'conv', coveredThroughMessageId: 'm2' }] };
    await page.lifecycle.extractPersonalMemory('three', 'ok');
    assert.equal(captured.length, count);

    // A message that was captured has been edited: the whole conversation goes again so the summary can be corrected.
    page.state.memory = { ...page.state.memory, recentConversationStates: [{ conversationId: 'conv', coveredThroughMessageId: 'm2', sourceHash: 'an older hash' }] };
    await page.lifecycle.extractPersonalMemory('three', 'ok');
    assert.equal(captured.at(-1).captureTurns.length, 3);
  } finally {
    page.window.close();
  }
});

test('extracting with the new memory system queues the capture when there is a queue', async () => {
  const queued = [];
  const page = harness({
    conversation: { id: 'conv', messages: [{ id: 'm0', role: 'user', parts: [{ text: 'hello' }] }] },
    hashString: async () => 'h', captureCompletedTurn: async () => { throw new Error('queue first'); }, enqueueMemoryCapture: (options) => queued.push(options)
  });
  try {
    await page.lifecycle.extractPersonalMemory('hello', 'hi');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].captureTurns[0].text, 'hello');
  } finally {
    page.window.close();
  }
});

test('the dashboard counts conversations that are not deleted and folders, names the most used model, and opens its dialog', () => {
  const conversations = [{ id: 'a', model: 'm-a' }, { id: 'b', model: 'm-b' }, { id: 'c', model: 'm-b' }, { id: 'd', model: 'm-b', deletedAt: 5 }, { id: 'e', model: 'gone' }];
  const page = harness({ conversations, folders: [{ id: 'f1' }, { id: 'f2' }] });
  try {
    page.lifecycle.openDashboard();
    assert.ok(page.calls.some((call) => call[0] === 'setupTimeAnalysis'));
    assert.ok(page.calls.some((call) => call[0] === 'toggleModal' && call[1] === true));
    assert.equal(page.elements.totalConvStat.textContent, '4');
    assert.equal(page.elements.totalFolderStat.textContent, '2');
    assert.equal(page.elements.mostUsedModelStat.textContent, 'Model B');
  } finally {
    page.window.close();
  }
});

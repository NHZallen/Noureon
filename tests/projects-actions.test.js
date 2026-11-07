import assert from 'node:assert/strict';
import test from 'node:test';

import { PROJECT_NAME_MAX, createProjectActions, setSharedProjectHook } from '../src/app/runtime/projects/project-actions.js';
import { PROJECT_INSTRUCTIONS_MAX } from '../src/app/runtime/projects/project-instructions.js';
import { setShares } from '../src/app/runtime/share/share-ref.js';
import { setProjectFileDeps } from '../src/app/runtime/projects/project-source-files.js';
import { announceUser } from '../src/app/runtime/features/user-ready.js';

// What the page of the projects does to the workspace: make, change and delete a project (the choice of what happens to its chats), take a chat out of it, start a chat in it.

const setup = ({ folders = [], conversations = [], deleteFolderFromCloud = async () => {}, openId = null } = {}) => {
  const state = { folders, conversations, saved: [], rendered: 0, synced: [], newChats: 0, sent: [], cloud: [], droppedNotes: [] };
  let current = openId;
  const actions = createProjectActions({
    dataStore: {
      getFolders: () => state.folders,
      replaceFolders: (next) => { state.folders = next; return next; },
      getConversations: () => state.conversations
    },
    saveAppData: async (options) => { state.saved.push(options ?? null); },
    renderSidebar: () => { state.rendered += 1; },
    deleteFolderFromCloud: async (id, extra) => { state.cloud.push([id, extra.folder.name]); await deleteFolderFromCloud(id, extra); },
    deferConversationFolderSync: (id) => state.synced.push(id),
    startNewChat: async () => { state.newChats += 1; const conversation = { id: `new-${state.newChats}`, title: 'New chat', messages: [], folderId: null }; state.conversations.unshift(conversation); current = conversation.id; },
    getCurrentConversationId: () => current,
    sendText: (text) => state.sent.push(text),
    dropNotes: async (id) => { state.droppedNotes.push(id); },
    randomUUID: (() => { let n = 0; return () => `project-${++n}`; })()
  });
  return { actions, state };
};

const chat = (id, folderId, extra = {}) => ({ id, title: `Chat ${id}`, folderId, messages: [], createdAt: '2026-10-01T00:00:00.000Z', ...extra });

test('a project is made with a name, an icon and a colour, and a name is needed', async () => {
  const { actions, state } = setup();
  assert.deepEqual(await actions.create({ name: '   ' }), { ok: false, code: 'no_name' });
  assert.equal(state.folders.length, 0);
  const made = await actions.create({ name: `  Research  ${'x'.repeat(200)}`, icon: 'globe', color: 'blue' });
  assert.equal(made.ok, true);
  const folder = state.folders[0];
  assert.equal(folder.id, 'project-1');
  assert.ok(folder.name.length <= PROJECT_NAME_MAX);
  assert.match(folder.name, /^Research x+/);
  assert.equal(folder.icon, 'globe');
  assert.equal(folder.color, 'blue');
  assert.equal(folder.instructions, '');
  assert.deepEqual(folder.conversationIds, []);
  assert.equal(state.saved.length, 1);
  assert.equal(state.rendered, 1);
  const plain = await actions.create({ name: 'Plain', icon: 'not-an-icon', color: 'not-a-colour' });
  assert.equal(plain.ok, true);
  assert.equal(state.folders[1].icon, 'default', 'an icon that does not exist is the default');
  assert.equal(state.folders[1].color, 'gray');
});

test('a project is changed by name, icon, colour and instructions; the instructions are cut to what is kept', async () => {
  const { actions, state } = setup({ folders: [{ id: 'f1', name: 'Old', icon: 'default', color: 'gray', conversationIds: [], instructions: '' }] });
  assert.equal((await actions.update('f1', { name: 'New', icon: 'book', color: 'green' })).ok, true);
  assert.deepEqual([state.folders[0].name, state.folders[0].icon, state.folders[0].color], ['New', 'book', 'green']);
  assert.equal((await actions.update('f1', { instructions: 'x'.repeat(PROJECT_INSTRUCTIONS_MAX + 50) })).ok, true);
  assert.equal(state.folders[0].instructions.length, PROJECT_INSTRUCTIONS_MAX);
  assert.deepEqual(await actions.update('f1', { name: '  ' }), { ok: false, code: 'no_name' });
  assert.equal(state.folders[0].name, 'New', 'a name that is empty changes nothing');
  assert.deepEqual(await actions.update('nope', { name: 'x' }), { ok: false, code: 'gone' });
});

test('the projects come with the newest chat first, a chat list with the pinned first, and a chat in the trash, archived or temporary is not listed', () => {
  const { actions } = setup({
    folders: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    conversations: [
      chat('1', 'a', { lastUpdatedAt: '2026-10-01T00:00:00.000Z' }),
      chat('2', 'b', { lastUpdatedAt: '2026-10-20T00:00:00.000Z' }),
      chat('3', 'b', { lastUpdatedAt: '2026-10-05T00:00:00.000Z', pinned: true }),
      chat('4', 'b', { lastUpdatedAt: '2026-10-25T00:00:00.000Z', deletedAt: '2026-10-26T00:00:00.000Z' }),
      chat('5', 'b', { archived: true }),
      chat('6', 'b', { retentionMode: 'ephemeral' })
    ]
  });
  assert.deepEqual(actions.list().map((folder) => folder.id), ['b', 'a', 'c']);
  assert.deepEqual(actions.chatsOf('b').map((entry) => entry.id), ['3', '2'], 'the pinned one first');
  assert.equal(actions.countOf('b'), 3, 'archived counts, the trash and temporary chats do not');
});

test('deleting a project and keeping the chats takes the chats out of it; the cloud is told first, and a cloud that fails keeps the project', async () => {
  const { actions, state } = setup({
    folders: [{ id: 'f1', name: 'Trip', conversationIds: ['1', '2'] }, { id: 'f2', name: 'Other', conversationIds: [] }],
    conversations: [chat('1', 'f1'), chat('2', 'f1'), chat('3', 'f2')]
  });
  const result = await actions.remove('f1', { withChats: false });
  assert.deepEqual(result, { ok: true, chats: 2, withChats: false });
  assert.deepEqual(state.folders.map((folder) => folder.id), ['f2']);
  assert.deepEqual(state.conversations.map((entry) => [entry.id, entry.folderId, entry.deletedAt || null]), [['1', null, null], ['2', null, null], ['3', 'f2', null]]);
  assert.deepEqual(state.cloud, [['f1', 'Trip']]);

  const failing = setup({ folders: [{ id: 'f1', name: 'Trip', conversationIds: ['1'] }], conversations: [chat('1', 'f1')], deleteFolderFromCloud: async () => { throw new Error('offline'); } });
  assert.deepEqual(await failing.actions.remove('f1'), { ok: false, code: 'cloud' });
  assert.equal(failing.state.folders.length, 1);
  assert.equal(failing.state.conversations[0].folderId, 'f1');
  assert.deepEqual(await failing.actions.remove('nope'), { ok: false, code: 'gone' });
});

test('deleting a project with its chats puts the chats in the trash, leaves the chat that is open for a new one, and asks when a chat is shared', async () => {
  const { actions, state } = setup({
    folders: [{ id: 'f1', name: 'Trip', conversationIds: ['1', '2'] }],
    conversations: [chat('1', 'f1', { pinned: true }), chat('2', 'f1', { archived: true }), chat('3', null)],
    openId: '1'
  });
  const result = await actions.remove('f1', { withChats: true });
  assert.deepEqual(result, { ok: true, chats: 2, withChats: true });
  const byId = Object.fromEntries(state.conversations.map((entry) => [entry.id, entry]));
  for (const id of ['1', '2']) {
    assert.ok(byId[id].deletedAt, `${id} is in the trash`);
    assert.equal(byId[id].folderId, null);
    assert.equal(byId[id].archived, false);
    assert.equal(byId[id].trashStateUpdatedAt, byId[id].deletedAt);
  }
  assert.equal(byId['3'].deletedAt, undefined, 'a chat outside the project is not touched');
  assert.equal(state.newChats, 1, 'the open chat was in the trash: a new chat is started');
  assert.deepEqual(state.saved.at(-1), { immediateCloudSync: true });

  const asked = [];
  setShares({ confirmDelete: async (ids) => { asked.push(ids); return false; } });
  try {
    const refused = setup({ folders: [{ id: 'f1', name: 'Trip', conversationIds: ['1'] }], conversations: [chat('1', 'f1')] });
    assert.deepEqual(await refused.actions.remove('f1', { withChats: true }), { ok: false, code: 'cancelled' });
    assert.deepEqual(asked, [['1']]);
    assert.equal(refused.state.folders.length, 1, 'nothing is deleted when the person says no');
    assert.equal((await refused.actions.remove('f1', { withChats: false })).ok, true, 'keeping the chats asks nothing');
  } finally { setShares(null); }
});

test('a chat is taken out of a project, renamed and pinned', async () => {
  const { actions, state } = setup({ folders: [{ id: 'f1', name: 'Trip', conversationIds: ['1'] }], conversations: [chat('1', 'f1'), chat('2', null)] });
  assert.deepEqual(await actions.removeChat('2'), { ok: false, code: 'gone' });
  assert.equal((await actions.removeChat('1')).ok, true);
  assert.equal(state.conversations[0].folderId, null);
  assert.deepEqual(state.folders[0].conversationIds, []);
  assert.deepEqual(state.synced, ['1']);
  assert.equal((await actions.renameChat('2', '  Renamed  ')).ok, true);
  assert.equal(state.conversations[1].title, 'Renamed');
  assert.equal(state.conversations[1].isRenamed, true);
  assert.deepEqual(await actions.renameChat('2', '  '), { ok: false, code: 'no_name' });
  assert.deepEqual(await actions.togglePin('2'), { ok: true, pinned: true });
  assert.deepEqual(await actions.togglePin('2'), { ok: true, pinned: false });
});

test('a message written to a project starts a chat in it and sends the text', async () => {
  const { actions, state } = setup({ folders: [{ id: 'f1', name: 'Trip', conversationIds: [] }] });
  assert.deepEqual(await actions.startChat('nope', 'hi'), { ok: false, code: 'gone' });
  const empty = await actions.startChat('f1', '   ');
  assert.equal(empty.ok, true, 'without a text it is an empty chat in the project');
  assert.deepEqual(state.sent, [], 'nothing is sent');
  assert.equal(state.conversations.find((entry) => entry.id === empty.conversationId).folderId, 'f1');
  state.sent.length = 0;
  state.synced.length = 0;
  state.folders[0].conversationIds = [];
  const result = await actions.startChat('f1', '  Plan day one  ');
  assert.equal(result.ok, true);
  assert.equal(state.newChats, 2);
  const conversation = state.conversations.find((entry) => entry.id === result.conversationId);
  assert.equal(conversation.folderId, 'f1');
  assert.deepEqual(state.folders[0].conversationIds, [conversation.id]);
  assert.deepEqual(state.synced, [conversation.id]);
  assert.deepEqual(state.sent, ['Plan day one']);
});

test('a project is pinned and unpinned, and the pinned ones come first in the list', async () => {
  const { actions, state } = setup({ folders: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] });
  assert.deepEqual(await actions.togglePinProject('nope'), { ok: false, code: 'gone' });
  assert.deepEqual(await actions.togglePinProject('a'), { ok: true, pinned: true });
  assert.equal(state.folders[0].pinned, true);
  assert.deepEqual(actions.list().map((folder) => folder.id), ['a', 'c', 'b'], 'the pinned one first, then the newest made');
  assert.deepEqual(await actions.togglePinProject('a'), { ok: true, pinned: false });
  assert.deepEqual(actions.list().map((folder) => folder.id), ['c', 'b', 'a']);
});

test('where the notes are kept is chosen when the project is made, and a project that keeps its own takes them with it when it is deleted', async () => {
  const { actions, state } = setup();
  await actions.create({ name: 'Plain' });
  await actions.create({ name: 'Private', memoryScope: 'project' });
  await actions.create({ name: 'Odd', memoryScope: 'everything' });
  assert.deepEqual(state.folders.map((folder) => folder.memoryScope), ['default', 'project', 'default']);
  await actions.update('project-2', { name: 'Private renamed', memoryScope: 'default' });
  assert.equal(state.folders[1].memoryScope, 'project', 'it cannot be changed afterwards');
  await actions.remove('project-1');
  assert.deepEqual(state.droppedNotes, [], 'a project with the memory of the account has no notes of its own to take away');
  await actions.remove('project-2');
  assert.deepEqual(state.droppedNotes, ['project-2']);
});

test('an empty chat made for the box of the project page is the project\'s, is told to the cloud only once something is sent, and goes back to being plain when it is not used', async () => {
  const { actions, state } = setup({ folders: [{ id: 'f1', name: 'Trip', conversationIds: [] }] });
  assert.deepEqual(await actions.prepareChat('nope'), { ok: false, code: 'gone' });
  const made = await actions.prepareChat('f1');
  assert.equal(made.ok, true);
  const conversation = state.conversations.find((entry) => entry.id === made.conversationId);
  assert.equal(conversation.folderId, 'f1');
  assert.deepEqual(state.folders[0].conversationIds, [conversation.id]);
  assert.deepEqual(state.synced, [], 'nothing is told to the cloud for an empty chat');
  actions.sentChat(conversation.id);
  assert.deepEqual(state.synced, [conversation.id]);
  // Not used: it leaves the project.
  assert.equal(actions.abandonChat(conversation.id), true);
  assert.equal(conversation.folderId, null);
  assert.deepEqual(state.folders[0].conversationIds, []);
  // A chat with something in it is never given up.
  const used = await actions.prepareChat('f1');
  state.conversations.find((entry) => entry.id === used.conversationId).messages.push({ role: 'user', parts: [{ text: 'hi' }] });
  assert.equal(actions.abandonChat(used.conversationId), false);
  assert.equal(state.conversations.find((entry) => entry.id === used.conversationId).folderId, 'f1');
});

test('the empty chat made for the box of the page is not in the list or the count of the project until something is sent in it', async () => {
  const { actions, state } = setup({ folders: [{ id: 'f1', name: 'Trip', conversationIds: [] }] });
  const made = await actions.prepareChat('f1');
  assert.deepEqual(actions.chatsOf('f1'), []);
  assert.equal(actions.countOf('f1'), 0);
  state.conversations.find((entry) => entry.id === made.conversationId).messages.push({ role: 'user', parts: [{ text: 'hi' }] });
  actions.sentChat(made.conversationId);
  assert.deepEqual(actions.chatsOf('f1').map((entry) => entry.id), [made.conversationId]);
  assert.equal(actions.countOf('f1'), 1);
  // A chat started on purpose (a new chat of the project) is in the list at once.
  const started = await actions.startChat('f1', '');
  assert.equal(actions.chatsOf('f1').some((entry) => entry.id === started.conversationId), true);
});

test('the bytes of the file of a source come from the person’s own files, or, in a project of someone else, through the hook that the sharing gives; a source with no file has none', async () => {
  const { actions } = setup({ folders: [{ id: 'f1', name: 'Own', conversationIds: [], sources: [] }] });
  const file = { name: 'plan.pdf', mimeType: 'application/pdf', hash: 'a'.repeat(64) };
  setProjectFileDeps({ store: { load: async (description) => (description.hash === file.hash ? { mimeType: 'application/pdf', data: 'QUJD' } : null) } });
  assert.deepEqual(await actions.sourceFile('f1', { id: 's', file }), { mimeType: 'application/pdf', data: 'QUJD' });
  assert.equal(await actions.sourceFile('f1', { id: 's', file: { ...file, hash: 'b'.repeat(64) } }), null, 'a file that is not there');
  assert.equal(await actions.sourceFile('f1', { id: 's', kind: 'text', text: 'words' }), null);
  const asked = [];
  setSharedProjectHook({ has: (id) => id === 'shared', folderOf: () => null, fileOf: async (id, source) => { asked.push([id, source.id]); return { mimeType: 'text/plain', data: 'eA==' }; } });
  assert.deepEqual(await actions.sourceFile('shared', { id: 'x', file }), { mimeType: 'text/plain', data: 'eA==' });
  assert.deepEqual(asked, [['shared', 'x']]);
  setSharedProjectHook(null);
  setProjectFileDeps({ store: null });
});

test('the files of the own projects that are only on this device are sent to the cloud and the source keeps where they are; opening one that is only here does the same', async () => {
  const sources = [
    { id: 'a', kind: 'file', title: 'a.pdf', text: '', file: { name: 'a.pdf', mimeType: 'application/pdf', hash: 'a'.repeat(64) } },
    { id: 'b', kind: 'file', title: 'b.pdf', text: '', file: { name: 'b.pdf', mimeType: 'application/pdf', hash: 'b'.repeat(64), asset: { __cloud: 'old' } } },
    { id: 'c', kind: 'file', title: 'c.pdf', text: '', file: { name: 'c.pdf', mimeType: 'application/pdf', hash: 'c'.repeat(64) } }
  ];
  const { actions, state } = setup({ folders: [{ id: 'f1', name: 'Own', conversationIds: [], sources }] });
  const kept = [];
  setProjectFileDeps({ store: { load: async () => ({ mimeType: 'application/pdf', data: 'QUJD' }), keep: async (description) => { kept.push(description.hash[0]); return description.hash[0] === 'a' ? { __cloud: 'new-a' } : null; } } });
  assert.equal(await actions.keepFilesInCloud(), 1);
  assert.deepEqual(kept, ['a', 'c'], 'the one that has its place is left, the others are tried');
  assert.deepEqual(state.folders[0].sources.map((source) => source.file.asset?.__cloud || null), ['new-a', 'old', null]);
  kept.length = 0;
  assert.deepEqual(await actions.sourceFile('f1', { id: 'c', file: sources[2].file }), { mimeType: 'application/pdf', data: 'QUJD' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(kept, ['c'], 'a file read from this device without a place in the cloud is sent');
  setProjectFileDeps({ store: null });
  assert.equal(await actions.keepFilesInCloud(), 0, 'no store: nothing to do');
});

test('a file that is not on this device and has no path kept with its source is had from where the files of the person are kept, `<person>/<hash>`', async () => {
  const { actions } = setup({ folders: [{ id: 'f1', name: 'Own', conversationIds: [], sources: [] }] });
  const file = { name: 'plan.pdf', mimeType: 'application/pdf', hash: 'c'.repeat(64) };
  const loads = [];
  setProjectFileDeps({ store: { load: async (description) => { loads.push(description.asset?.__astraCloudAsset?.path || null); return description.asset ? { mimeType: 'application/pdf', data: 'QUJD' } : null; } } });
  announceUser(null, { supabaseUserId: 'person-1' });
  assert.deepEqual(await actions.sourceFile('f1', { id: 's', file }), { mimeType: 'application/pdf', data: 'QUJD' });
  assert.deepEqual(loads, [null, `person-1/${'c'.repeat(64)}`], 'first here, then where the files are kept');
  announceUser(null, null);
  assert.equal(await actions.sourceFile('f1', { id: 's', file }), null, 'nobody is signed in: nowhere to look');
  // a file a member added to the person's own shared project: not here, not found directly, the server gives it (the hook of the sharing)
  setSharedProjectHook({ has: () => false, folderOf: () => null, ownFileOf: async (id, source) => (source.file.hash === file.hash ? { mimeType: 'application/pdf', data: 'ZZZ=' } : null) });
  assert.deepEqual(await actions.sourceFile('f1', { id: 's', file }), { mimeType: 'application/pdf', data: 'ZZZ=' }, 'with nobody signed in here it still asks the server');
  announceUser(null, { supabaseUserId: 'person-1' });
  assert.deepEqual(await actions.sourceFile('f1', { id: 's', file }), { mimeType: 'application/pdf', data: 'QUJD' }, 'found directly first');
  setSharedProjectHook(null);
  announceUser(null, null);
  setProjectFileDeps({ store: null });
});

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

// A tripwire for on-demand loading (docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §4): a conversation kept only as a stub has no messages in memory, so code that takes
// the list of the app's conversations and also reads `.messages` has to be checked for it (use `messageCountOf`, `__flags`, `ensureConversationsLoaded` or `forEachConversationMessages`).
// Every file here was looked at; a new file that does both fails this test until it is looked at and added, with what it does about stubs.

const audited = {
  'src/app/runtime/features/import-export-lifecycle.js': 'a backup reads every conversation whole first (ensureConversationsLoaded)',
  'src/app/runtime/kernel/conversation-loader.js': 'the loader itself',
  'src/app/runtime/kernel/on-demand-loading.js': 'the loader\'s facade',
  'src/app/runtime/project-sharing/start-project-sharing.js': 'counts with messageCountOf; the other members\' chats come from the cloud, not from stubs',
  'src/app/runtime/projects/project-pieces.js': 'conversations with a video (flag) are brought in before the cuts',
  'src/app/runtime/share/start-shares.js': 'the conversation is read whole before the dialog opens',
  'src/app/runtime/shell/history-sidebar-helpers.js': 'the timeline reads the shown conversation only; the list reads no messages',
  'src/app/runtime/shell/sidebar-chat-astra-render-lifecycle.js': 'council marks use the stub flag; the pictures of a reply are of the conversation being written'
};

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.js') ? [path] : [];
  });
}

test('a file that takes the app\'s conversation list and reads messages has been audited for stubs', () => {
  const root = new URL('..', import.meta.url).pathname;
  const found = sources(join(root, 'src/app'))
    .map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }))
    .filter(({ text }) => /getConversations/.test(text) && /\.messages\b/.test(text))
    .map(({ path }) => path)
    .sort();
  const unaudited = found.filter((path) => !audited[path]);
  assert.deepEqual(unaudited, [], `Not audited for conversations kept as stubs (add the file to this test with what it does about them): ${unaudited.join(', ')}`);
  const gone = Object.keys(audited).filter((path) => !found.includes(path));
  assert.deepEqual(gone, [], `No longer reads the list and messages together (take it out of this test): ${gone.join(', ')}`);
});

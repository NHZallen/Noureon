import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync(new URL('../../src/styles/chat-reply-layout.css', import.meta.url), 'utf8');
const sandboxRun = readFileSync(new URL('../../src/styles/sandbox-run.css', import.meta.url), 'utf8');

// The code of a run, opened on a phone, must not widen the chat past the screen (the chat is a flex item, whose minimum width is its content).
test('the chat column may shrink below its content, so a line that does not wrap scrolls inside its card', () => {
  assert.match(layout, /#chat-workspace \{ min-width: 0; \}/);
});

test('the file names a run produced break at the edge of the screen', () => {
  assert.match(sandboxRun, /\.sandbox-run-note \{[^}]*overflow-wrap: anywhere;/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { removeLastComposerIndicatorOnDelete } from '../src/app/runtime/features/composer-indicator-keyboard.js';
import { readSource } from './helpers/source-guards.js';

function createFixture(value = '') {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    <textarea id="message-input"></textarea>
    <div id="input-indicator-container">
      <div class="input-indicator-item"><button id="close-first" type="button">first</button></div>
      <div class="input-indicator-item"><button id="close-last" type="button">last</button></div>
    </div>
  `;
  const messageInput = document.getElementById('message-input');
  messageInput.value = value;
  return {
    window,
    messageInput,
    inputIndicatorContainer: document.getElementById('input-indicator-container')
  };
}

test('Backspace removes the last active function when the composer is empty', () => {
  const fixture = createFixture();
  let firstClicks = 0;
  let lastClicks = 0;
  fixture.window.document.getElementById('close-first').addEventListener('click', () => { firstClicks += 1; });
  fixture.window.document.getElementById('close-last').addEventListener('click', () => { lastClicks += 1; });
  const event = new fixture.window.KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });

  const removed = removeLastComposerIndicatorOnDelete({
    event,
    messageInput: fixture.messageInput,
    inputIndicatorContainer: fixture.inputIndicatorContainer
  });

  assert.equal(removed, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(firstClicks, 0);
  assert.equal(lastClicks, 1);
  fixture.window.close();
});

test('Delete also removes a function, while typing and modified shortcuts remain untouched', () => {
  const fixture = createFixture();
  let clicks = 0;
  fixture.window.document.getElementById('close-last').addEventListener('click', () => { clicks += 1; });

  const deleteEvent = new fixture.window.KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
  assert.equal(removeLastComposerIndicatorOnDelete({
    event: deleteEvent,
    messageInput: fixture.messageInput,
    inputIndicatorContainer: fixture.inputIndicatorContainer
  }), true);

  fixture.messageInput.value = 'draft';
  const backspaceEvent = new fixture.window.KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
  assert.equal(removeLastComposerIndicatorOnDelete({
    event: backspaceEvent,
    messageInput: fixture.messageInput,
    inputIndicatorContainer: fixture.inputIndicatorContainer
  }), false);

  fixture.messageInput.value = '';
  const modifiedEvent = new fixture.window.KeyboardEvent('keydown', { key: 'Backspace', ctrlKey: true, cancelable: true });
  assert.equal(removeLastComposerIndicatorOnDelete({
    event: modifiedEvent,
    messageInput: fixture.messageInput,
    inputIndicatorContainer: fixture.inputIndicatorContainer
  }), false);

  assert.equal(clicks, 1);
  assert.equal(backspaceEvent.defaultPrevented, false);
  assert.equal(modifiedEvent.defaultPrevented, false);
  fixture.window.close();
});

test('the composer keydown binding removes an indicator before handling Enter submission', () => {
  const source = readSource('src/app/runtime/features/app-bootstrap-lifecycle.js');
  const keydownStart = source.indexOf("ALL_ELEMENTS.messageInput.addEventListener('keydown'");
  const keydownBody = source.slice(keydownStart, source.indexOf("ALL_ELEMENTS.messageInput.addEventListener('focus'", keydownStart));

  assert.notEqual(keydownStart, -1);
  assert.match(source, /import\s*\{\s*removeLastComposerIndicatorOnDelete\s*\}\s*from\s*['"]\.\/composer-indicator-keyboard\.js['"]/);
  assert.match(keydownBody, /removeLastComposerIndicatorOnDelete\(\{[\s\S]*inputIndicatorContainer:\s*ALL_ELEMENTS\.inputIndicatorContainer[\s\S]*if\s*\(removedIndicator\)\s*return;[\s\S]*e\.key\s*===\s*'Enter'/);
});

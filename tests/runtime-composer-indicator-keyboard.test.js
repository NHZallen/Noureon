import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { removeLastComposerIndicatorOnDelete } from '../src/app/runtime/features/composer-indicator-keyboard.js';
import {
  initializeComposerRichEditor,
  syncComposerInlineModeTokens
} from '../src/app/runtime/features/composer-rich-editor.js';
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

function createRichEditorFixture(text = '前文 後文') {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    <div id="message-input" data-composer-editor contenteditable="true">${text}</div>
    <div id="input-indicator-container">
      <div id="search-indicator" class="input-indicator-item">
        <span class="input-indicator-content"><svg></svg><span>網頁搜尋</span></span>
        <button id="close-search-btn-input" type="button">close</button>
      </div>
    </div>`;
  const editor = document.getElementById('message-input');
  const inputIndicatorContainer = document.getElementById('input-indicator-container');
  initializeComposerRichEditor({ editor, document });
  return { window, document, editor, inputIndicatorContainer };
}

test('desktop function tokens insert at the current caret and remain copyable display text', () => {
  const fixture = createRichEditorFixture();
  const range = fixture.document.createRange();
  range.setStart(fixture.editor.firstChild, 2);
  range.collapse(true);
  const selection = fixture.document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  syncComposerInlineModeTokens({
    editor: fixture.editor,
    inputIndicatorContainer: fixture.inputIndicatorContainer,
    activeIndicatorIds: ['search-indicator'],
    desktop: true,
    document: fixture.document
  });

  const token = fixture.editor.querySelector('.composer-inline-mode-token');
  assert.equal(token?.dataset.indicatorId, 'search-indicator');
  assert.equal(token?.textContent.trim(), '網頁搜尋');
  assert.equal(fixture.editor.value, '前文 後文');
  assert.equal(fixture.editor.displayValue, '前文🌐 網頁搜尋 後文');
  assert.equal(fixture.editor.textContent, '前文網頁搜尋 後文');
  fixture.window.close();
});

test('Backspace removes the managed space before removing its inline function token', () => {
  const fixture = createRichEditorFixture('內容');
  syncComposerInlineModeTokens({
    editor: fixture.editor,
    inputIndicatorContainer: fixture.inputIndicatorContainer,
    activeIndicatorIds: ['search-indicator'],
    desktop: true,
    document: fixture.document
  });
  let closeClicks = 0;
  fixture.document.getElementById('close-search-btn-input').addEventListener('click', () => { closeClicks += 1; });

  const separator = fixture.editor.querySelector('.composer-inline-mode-separator');
  const range = fixture.document.createRange();
  range.setStartAfter(separator);
  range.collapse(true);
  const selection = fixture.document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const firstBackspace = new fixture.window.KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
  assert.equal(removeLastComposerIndicatorOnDelete({
    event: firstBackspace,
    messageInput: fixture.editor,
    inputIndicatorContainer: fixture.inputIndicatorContainer
  }), true);
  assert.equal(fixture.editor.querySelector('.composer-inline-mode-separator'), null);
  assert.ok(fixture.editor.querySelector('.composer-inline-mode-token'));
  assert.equal(closeClicks, 0);

  const secondBackspace = new fixture.window.KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
  assert.equal(removeLastComposerIndicatorOnDelete({
    event: secondBackspace,
    messageInput: fixture.editor,
    inputIndicatorContainer: fixture.inputIndicatorContainer
  }), true);
  assert.equal(fixture.editor.querySelector('.composer-inline-mode-token'), null);
  assert.equal(closeClicks, 1);
  fixture.window.close();
});

test('display value includes search and learning modes but omits model council', () => {
  const fixture = createRichEditorFixture('內容');
  fixture.inputIndicatorContainer.insertAdjacentHTML('beforeend', `
    <div id="learning-mode-indicator" class="input-indicator-item"><span class="input-indicator-content">學習</span></div>
    <div id="model-council-indicator" class="input-indicator-item"><span class="input-indicator-content">理事會</span></div>`);
  syncComposerInlineModeTokens({
    editor: fixture.editor,
    inputIndicatorContainer: fixture.inputIndicatorContainer,
    activeIndicatorIds: ['search-indicator', 'learning-mode-indicator', 'model-council-indicator'],
    desktop: true,
    document: fixture.document
  });

  assert.match(fixture.editor.displayValue, /🌐 網頁搜尋/);
  assert.match(fixture.editor.displayValue, /📖 學習/);
  assert.doesNotMatch(fixture.editor.displayValue, /理事會/);
  fixture.window.close();
});

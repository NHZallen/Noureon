import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { findAddresses } from '../src/app/legacy-runtime/features/linked-pages.js';
import { linkLabel, renderLinkChipHTML, splitAtAddresses } from '../src/app/ui/links/link-chip.js';
import { buildMessageRenderView } from '../src/app/legacy-runtime/features/message-markup-renderer.js';
import {
  initializeComposerRichEditor,
  removeInlineComposerTokenOnDelete
} from '../src/app/runtime/features/composer-rich-editor.js';

test('a link is named by its short form: GitHub owner/repo, otherwise the site and the start of the path', () => {
  assert.equal(linkLabel('https://github.com/NHZallen/Noureon'), 'NHZallen/Noureon');
  assert.equal(linkLabel('https://github.com/NHZallen/Noureon/releases/tag/v1'), 'NHZallen/Noureon');
  assert.equal(linkLabel('https://www.example.com/'), 'example.com');
  assert.equal(linkLabel('https://example.com/a/b?x=1'), 'example.com/a/b');
  assert.ok(linkLabel(`https://example.com/${'a'.repeat(200)}`).length <= 48);
});

test('addresses are found with their place, and the text between them is kept', () => {
  assert.deepEqual(findAddresses('看 https://a.test/x, 和 https://b.test。').map((entry) => entry.url), ['https://a.test/x', 'https://b.test']);
  assert.deepEqual(splitAtAddresses('see https://a.test/x now'), [{ text: 'see ' }, { url: 'https://a.test/x' }, { text: ' now' }]);
  assert.deepEqual(splitAtAddresses('no link'), [{ text: 'no link' }]);
});

test('the chip is a link with the site icon, and the address cannot break out of its markup', () => {
  const html = renderLinkChipHTML('https://example.com/a"><script>x</script>');
  assert.match(html, /^<a class="link-chip" href="https:\/\/example\.com\//);
  assert.match(html, /src="https:\/\/example\.com\/favicon\.ico"/);
  assert.doesNotMatch(html, /<script>/);
});

const dependencies = {
  renderUserText: (text) => `USER:${text}`,
  renderMarkdownWithFormulas: (text) => text,
  buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }),
  formatTimestamp: () => '',
  copyTitle: 'Copy'
};

test('a sent message shows its web addresses as chips, with or without composer functions', () => {
  const plain = buildMessageRenderView({ message: { role: 'user', parts: [{ text: 'see https://github.com/a/b ok' }] }, ...dependencies });
  assert.match(plain.messageHTML, /USER:see /);
  assert.match(plain.messageHTML, /class="link-chip"[^>]*>.*a\/b<\/span><\/a>/);
  assert.match(plain.messageHTML, /USER: ok/);

  const segmented = buildMessageRenderView({
    message: { role: 'user', parts: [{ text: 'https://github.com/a/b', displaySegments: [{ type: 'link', url: 'https://github.com/a/b' }] }] },
    ...dependencies
  });
  assert.match(segmented.messageHTML, /class="link-chip"/);
});

function createEditor() {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="message-input" data-composer-editor contenteditable="plaintext-only"></div>';
  const editor = document.getElementById('message-input');
  initializeComposerRichEditor({ editor, document });
  return { window, document, editor };
}

const paste = (window, editor, text) => {
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = { getData: () => text };
  editor.dispatchEvent(event);
};

test('a pasted address becomes a chip, and the message is still the address', () => {
  const { window, editor } = createEditor();
  paste(window, editor, 'look https://github.com/a/b please');
  const chips = editor.querySelectorAll('.composer-link-token');
  assert.equal(chips.length, 1);
  assert.equal(chips[0].dataset.url, 'https://github.com/a/b');
  assert.equal(chips[0].textContent, 'a/b');
  assert.equal(editor.value, 'look https://github.com/a/b please');
  assert.equal(editor.displayValue, 'look https://github.com/a/b please');
  assert.deepEqual(editor.displaySegments, [
    { type: 'text', text: 'look ' },
    { type: 'link', url: 'https://github.com/a/b' },
    { type: 'text', text: ' please' }
  ]);
  window.close();
});

test('an address at the end of a paste is followed by a space to type after', () => {
  const { window, editor } = createEditor();
  paste(window, editor, 'https://example.com/x');
  assert.equal(editor.querySelectorAll('.composer-link-token').length, 1);
  assert.equal(editor.value, 'https://example.com/x ');
  window.close();
});

test('Backspace after a chip deletes the whole chip', () => {
  const { window, document, editor } = createEditor();
  paste(window, editor, 'https://example.com/x');
  const chip = editor.querySelector('.composer-link-token');
  const range = document.createRange();
  range.setStart(chip.nextSibling, 0);
  range.collapse(true);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  const event = new window.KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
  assert.equal(removeInlineComposerTokenOnDelete({ event, editor }), true);
  assert.equal(editor.querySelectorAll('.composer-link-token').length, 0);
  window.close();
});

test('setting the value shows its addresses as chips, and emptying it leaves none', () => {
  const { window, editor } = createEditor();
  editor.value = 'a https://example.com/x b';
  assert.equal(editor.querySelectorAll('.composer-link-token').length, 1);
  assert.equal(editor.value, 'a https://example.com/x b');
  editor.value = '';
  assert.equal(editor.querySelectorAll('.composer-link-token').length, 0);
  assert.equal(editor.value, '');
  window.close();
});

test('an address typed and followed by a space becomes a chip', () => {
  const { window, document, editor } = createEditor();
  const text = document.createTextNode('go https://example.com/x ');
  editor.append(text);
  const range = document.createRange();
  range.setStart(text, text.data.length);
  range.collapse(true);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  const event = new window.Event('input', { bubbles: true });
  event.inputType = 'insertText';
  event.data = ' ';
  editor.dispatchEvent(event);
  assert.equal(editor.querySelectorAll('.composer-link-token').length, 1);
  assert.equal(editor.value, 'go https://example.com/x ');
  window.close();
});

test('changing the placeholder (a notice that wraps) asks for the box to be sized again, once, and only when it changes', () => {
  const { window, editor } = createEditor();
  let asked = 0;
  editor.addEventListener('composerplaceholderchange', () => { asked += 1; });
  editor.placeholder = 'The visual check is running. You can send again when it finishes or after you press Stop';
  editor.placeholder = 'The visual check is running. You can send again when it finishes or after you press Stop';
  assert.equal(asked, 1);
  assert.equal(editor.dataset.placeholder.startsWith('The visual check'), true);
  editor.placeholder = '';
  assert.equal(asked, 2);
  window.close();
});

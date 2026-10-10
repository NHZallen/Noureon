import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/runtime/features/app-bootstrap-lifecycle.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('const handleInputFocus'), source.indexOf("ALL_ELEMENTS.messageInput.addEventListener('focus', handleInputFocus)"));

test('when the keyboard opens, the page is moved only as far as the box is hidden, measured from the seen area (not from 0), and at once', () => {
  assert.match(handler, /visualViewport\.offsetTop/, 'the seen area starts at the visual viewport\'s top');
  assert.match(handler, /seenBottom/);
  assert.match(handler, /behavior: 'auto'/, 'a smooth move fights the phone\'s own and the box jumps');
  assert.doesNotMatch(handler.slice(0, handler.indexOf('} else {')), /behavior: 'smooth'/);
});

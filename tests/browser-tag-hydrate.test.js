import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

// A message is drawn in a document of its own that is turned into text and put into the page: the tag of the browser work must still come (it was lost: an empty place holder).
test('the tag drawn in a document that is turned into text comes back in the page: the place holder is filled when it gets there', async () => {
  const page = new Window();
  globalThis.document = page.document;
  globalThis.MutationObserver = page.MutationObserver;
  try {
    const { browserTagElement } = await import('../src/app/ui/sandbox/browser-tag.js');
    const drawing = new Window().document; // where markdown-rendering-helpers.js draws a message
    const holder = drawing.createElement('div');
    holder.append(browserTagElement(drawing, { end: 'cancelled', steps: [{ action: 'open', domain: 'acme.com', label: 'Browsing: acme.com' }] }, { language: 'en' }));
    const html = holder.innerHTML; // what the renderer gives the page: text
    assert.match(html, /bcard-saved/);
    assert.ok(!html.includes('bcard-pill'), 'nothing of the card is in the text');
    const message = page.document.createElement('div');
    page.document.body.append(message);
    message.innerHTML = html;
    await new Promise((resolve) => setTimeout(resolve, 60));
    const pill = message.querySelector('.bcard-pill');
    assert.ok(pill, 'the tag is built in the page');
    assert.equal(pill.hidden, false);
    assert.equal(pill.querySelector('.bcard-text').textContent, 'Stopped');
    // The same message drawn again gets its own tag, and a place holder is filled once.
    const again = page.document.createElement('div');
    page.document.body.append(again);
    again.innerHTML = html;
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(again.querySelectorAll('.bcard-pill').length, 1);
  } finally {
    delete globalThis.document;
    delete globalThis.MutationObserver;
    page.happyDOM.abort();
  }
});

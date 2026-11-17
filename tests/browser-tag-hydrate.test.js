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

// A page that comes back to a reply still running must not draw "Done": the record says "running", so the card stays in its run phase.
test('a record of a reply still running keeps the card running, not "Done"', async () => {
  const page = new Window();
  globalThis.document = page.document;
  globalThis.MutationObserver = page.MutationObserver;
  try {
    const { browserTagElement } = await import('../src/app/ui/sandbox/browser-tag.js');
    const { normalizeBrowserRecord } = await import('../src/app/ui/sandbox/sandbox-run-block.js');
    const record = normalizeBrowserRecord({ end: 'running', steps: [{ action: 'open', domain: 'acme.com', label: 'Browsing: acme.com' }] });
    assert.equal(record.end, 'running');
    const drawing = new Window().document;
    const holder = drawing.createElement('div');
    holder.append(browserTagElement(drawing, record, { language: 'en' }));
    const message = page.document.createElement('div');
    page.document.body.append(message);
    message.innerHTML = holder.innerHTML;
    await new Promise((resolve) => setTimeout(resolve, 60));
    const text = message.textContent;
    assert.ok(!/Done/.test(text), `no "Done" while running: ${text}`);
  } finally {
    delete globalThis.document;
    delete globalThis.MutationObserver;
    page.happyDOM.abort();
  }
});

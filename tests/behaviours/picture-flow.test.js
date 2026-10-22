import assert from 'node:assert/strict';
import test from 'node:test';

import { createPictureFlow } from '../../src/app/runtime/reply/picture-flow.js';
import { applyModelMessagePostResponseActions } from '../../src/app/runtime/reply/model-message-post-response-actions.js';
import { createDom } from './helpers/create-dom.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// A renderer of words that writes into its element as they come, and says what it wrote (the real one is streaming-markdown-renderer.js).
const fakeStream = async (element, feed) => {
  let text = '';
  await feed((chunk) => {
    text += chunk;
    element.textContent = text;
  });
  return text;
};

const setup = (options = {}) => {
  const dom = createDom('<div id="list"><div class="message-item model-message"><div class="message-stack"><div class="p-3 message-bubble relative"><div class="prose message-content"><div id="target" class="is-streaming-response"></div></div></div></div></div></div>');
  const target = dom.document.getElementById('target');
  const stage = dom.document.createElement('div');
  stage.className = 'reply-draw-stage';
  stage.textContent = 'dots';
  dom.document.querySelector('.message-bubble').after(stage);
  const mounted = [];
  const flow = createPictureFlow({
    document: dom.document,
    targetElement: target,
    streamMarkdownResponse: fakeStream,
    hydrateParts: async (parts) => parts,
    mountPictures: options.mountPictures || (async ({ parts, firstNumber, slot }) => {
      mounted.push({ ids: parts.map((part) => part.generatedImage.id), firstNumber });
      slot.replaceChildren(...parts.map((part) => Object.assign(dom.document.createElement('figure'), { className: 'generated-image-card', textContent: part.generatedImage.id })));
      return true;
    }),
    getStage: () => stage
  });
  return { dom, target, stage, flow, mounted };
};
const pic = (id) => ({ generatedImage: { id } });
const bubbles = (dom) => [...dom.document.querySelectorAll('.message-stack > *')].map((node) => (node.classList.contains('message-bubble') ? `bubble:${node.textContent}` : node.classList.contains('reply-picture-slot') ? `slot:${node.textContent}` : node.className));

test('words, the picture where it was drawn, words: they stream in that order and nothing is drawn again', async () => {
  const { dom, target, flow, mounted } = setup();
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    // The first bubble takes the words through the renderer of its own (here: a stream the test drives).
    let head = '';
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; })).then((text) => { head = text; });
    await tick();
    feed('I will draw ');
    feed('a poster.');
    await tick();
    assert.equal(target.textContent, 'I will draw a poster.');
    flow.handle({ type: 'image', event: 'start', label: 'Drawing…' });
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('a')] });
    // The words after it go to a bubble under the picture, at once.
    feed('Here it is.');
    feed(' Anything to change?');
    await tick();
    assert.equal(target.textContent, 'I will draw a poster.', 'the first bubble is not written to again');
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.deepEqual(bubbles(dom), ['bubble:I will draw a poster.', 'slot:a', 'bubble:Here it is. Anything to change?']);
    // The wait for a second picture goes under the words that follow the first one, not above it.
    assert.equal(flow.lastElement().textContent, 'Here it is. Anything to change?');
    assert.equal(flow.lastElement().previousElementSibling.className, 'reply-picture-slot');
    assert.equal(head, 'I will draw a poster.');
    assert.deepEqual(result.offsets, [21]);
    assert.equal(result.text, 'I will draw a poster.Here it is. Anything to change?');
    assert.equal(result.headText, 'I will draw a poster.');
    assert.equal(result.shownAll, true);
    assert.deepEqual(mounted, [{ ids: ['a'], firstNumber: 1 }]);
    assert.equal(dom.document.querySelector('.reply-draw-stage'), null, 'the wait for the picture was replaced by the picture');
  } finally {
    dom.cleanup();
  }
});

test('two drawings in one reply: each picture has its place and its number, the words between are bubbles of their own', async () => {
  const { dom, target, flow, mounted } = setup();
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; }));
    await tick();
    feed('One.');
    flow.handle({ type: 'image', event: 'done', count: 2, pictures: [pic('a'), pic('b')] });
    feed('Two.');
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('c')] });
    feed('Three.');
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.deepEqual(bubbles(dom), ['bubble:One.', 'slot:ab', 'bubble:Two.', 'slot:c', 'bubble:Three.']);
    assert.deepEqual(result.offsets, [4, 4, 8]);
    assert.deepEqual(mounted.map((entry) => entry.firstNumber), [1, 3]);
  } finally {
    dom.cleanup();
  }
});

test('nothing after the picture: the empty bubble is not left; a picture that cannot be shown is said (the message is drawn whole at the end)', async () => {
  const { dom, target, flow } = setup({ mountPictures: async () => false });
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; }));
    await tick();
    feed('Drawing.');
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('a')] });
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.equal(result.shownAll, false);
    assert.equal(dom.document.querySelector('.reply-picture-slot'), null);
    assert.deepEqual([...dom.document.querySelectorAll('.message-bubble')].map((node) => node.hidden), [false, true]);
  } finally {
    dom.cleanup();
  }
});

test('looking at pictures, or events with no picture, change nothing', async () => {
  const { dom, target, flow } = setup();
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; }));
    await tick();
    feed('Hello.');
    flow.handle({ type: 'image', event: 'done', kind: 'view', count: 2, shown: [pic('a')] });
    flow.handle({ type: 'image', event: 'done', count: 0, pictures: [] });
    flow.handle({ type: 'step', event: 'done' });
    feed(' More.');
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.equal(result.pictures.length, 0);
    assert.equal(target.textContent, 'Hello. More.');
    assert.equal(dom.document.querySelectorAll('.message-bubble').length, 1);
  } finally {
    dom.cleanup();
  }
});

test('the footer (copy, time) is on the last bubble that shows', () => {
  const dom = createDom('<div class="message-item model-message"><div class="message-stack"><div class="message-bubble"><div class="message-content">a</div></div><div class="reply-picture-slot"></div><div class="message-bubble"><div class="message-content">b</div></div><div class="message-bubble" hidden><div class="message-content"></div></div></div></div>');
  try {
    const element = dom.document.querySelector('.model-message');
    const done = applyModelMessagePostResponseActions({ lastMessageElement: element, conversation: { messages: [{ createdAt: '2026-10-22T10:00:00Z' }] }, i18n: {}, uiLanguage: 'en', formatTimestamp: () => '10:00' });
    assert.equal(done, true);
    const bubbles = [...dom.document.querySelectorAll('.message-bubble')];
    assert.deepEqual(bubbles.map((bubble) => Boolean(bubble.querySelector('.copy-content-btn'))), [false, true, false]);
  } finally {
    dom.cleanup();
  }
});

import { createMountPictures } from '../../src/app/runtime/reply/mount-pictures.js';

test('the cards of the pictures are made as a message\'s are, put in the slot with the numbers of the message, and bound', async () => {
  const dom = createDom('<div id="slot"></div>');
  try {
    const bound = [];
    const mount = createMountPictures({
      getActiveConversation: () => ({ messages: [{}, {}] }),
      addMessageToUI: (message) => {
        const holder = dom.document.createElement('div');
        holder.innerHTML = `<div class="message-stack">${message.parts.map((part) => `<figure class="generated-image-card"><span class="picture-number">1</span>${part.generatedImage.id}</figure>`).join('')}</div>`;
        dom.document.body.append(holder);
        return holder;
      },
      bindGeneratedImageAssets: async (root, assets) => { bound.push([root.id, assets.map((asset) => asset.id)]); }
    });
    const slot = dom.document.getElementById('slot');
    assert.equal(await mount({ parts: [pic('a'), pic('b')], firstNumber: 3, slot }), true);
    assert.deepEqual([...slot.querySelectorAll('.picture-number')].map((chip) => chip.textContent), ['3', '4']);
    assert.deepEqual(bound, [['slot', ['a', 'b']]]);
    assert.equal(dom.document.querySelectorAll('.message-stack').length, 0, 'the message it was made in is gone');
    const empty = createMountPictures({ getActiveConversation: () => null, addMessageToUI: () => dom.document.createElement('div'), bindGeneratedImageAssets: async () => {} });
    assert.equal(await empty({ parts: [pic('x')], firstNumber: 1, slot }), false);
  } finally {
    dom.cleanup();
  }
});

test('a page that joins the reply late is told where the picture stands, then given the words in one piece: the same order', async () => {
  const { dom, target, flow, mounted } = setup();
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; }));
    await tick();
    flow.handle({ type: 'image', event: 'start', label: 'Drawing…' });
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('a')], textAt: 8 });
    // The picture waits for the words to get to its place.
    assert.equal(dom.document.querySelector('.reply-picture-slot'), null);
    feed('I draw. Here it is.');
    await tick();
    assert.equal(target.textContent, 'I draw. ');
    // The same events told again (the channel was joined again): the picture is not placed twice.
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('a')], textAt: 8 });
    feed(' More.');
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.deepEqual(bubbles(dom), ['bubble:I draw. ', 'slot:a', 'bubble:Here it is. More.']);
    assert.deepEqual(result.offsets, [8]);
    assert.equal(result.text, 'I draw. Here it is. More.');
    assert.equal(mounted.length, 1);
  } finally {
    dom.cleanup();
  }
});

test('a picture told to stand further on than the words ever got stands at the end; one told to stand where the words already are stands there', async () => {
  const { dom, target, flow } = setup();
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; }));
    await tick();
    feed('Short.');
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('late')], textAt: 500 });
    flow.handle({ type: 'image', event: 'done', count: 1, pictures: [pic('past')], textAt: 2 });
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.deepEqual(result.pictures.map((part) => part.generatedImage.id), ['past', 'late']);
    assert.deepEqual(result.offsets, [6, 6]);
  } finally {
    dom.cleanup();
  }
});

test('the time the page stamps on an event is not mistaken for where the picture stands: only the place in the answer counts', async () => {
  const { dom, target, flow } = setup();
  try {
    const feed = flow.wrap((chunk) => feed.head(chunk));
    const sink = fakeStream(target, (onChunk) => new Promise((resolve) => { feed.head = onChunk; feed.end = resolve; }));
    await tick();
    feed('Intro.');
    // followServerReply puts the server's clock in `at` of every event; the place in the answer is `textAt`.
    flow.handle({ type: 'image', event: 'done', pictures: [pic('a')], at: 1_790_000_000_000, textAt: 6 });
    feed('Closing.');
    const result = await flow.finish();
    feed.end();
    await sink;
    assert.deepEqual(bubbles(dom), ['bubble:Intro.', 'slot:a', 'bubble:Closing.']);
    assert.deepEqual(result.offsets, [6]);
  } finally {
    dom.cleanup();
  }
});

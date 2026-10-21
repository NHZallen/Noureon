import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createGeneratedImageInteractions } from '../../src/app/runtime/images/generated-image-interactions.js';
import { revealGeneratedImage } from '../../src/app/runtime/shell/submit-input-image-reveal.js';
import { readUiSource } from '../helpers/source-guards.js';

const chatCss = readUiSource('src/styles/chat.css');
const editorCss = readUiSource('src/styles/generated-image-editor.css');
const pageCss = [readUiSource('src/styles/tokens.css'), chatCss, editorCss].join('\n');
const png = 'data:image/png;base64,aGVsbG8=';

// A page of the given width with the real stylesheets, read back through the computed styles.
function styledPage(width, html) {
  const window = new Window({ width, height: 800 });
  const { document } = window;
  const style = document.createElement('style');
  style.textContent = pageCss;
  document.head.appendChild(style);
  document.body.innerHTML = html;
  const computed = (selector) => window.getComputedStyle(document.querySelector(selector));
  return { window, document, computed };
}

const imageMessageHtml = `
  <div class="message-stack image-message-stack">
    <figure class="generated-image-card has-natural-aspect" style="aspect-ratio: 16 / 9">
      <button class="generated-image-preview-btn"><img></button>
      <a class="generated-image-action-btn"><svg></svg></a>
    </figure>
  </div>
  <div class="generated-image-skeleton generated-image-skeleton-finalizing">
    <noureon-image-wait></noureon-image-wait><span class="generated-image-wait-label"></span>
  </div>
  <div class="generated-image-result-enter" id="entering"><figure class="generated-image-card"></figure></div>
  <div class="generated-image-result-enter generated-image-result-visible" id="visible"><figure class="generated-image-card"></figure></div>`;

test('generated image cards sit bare on the page with white controls, a calm wait, and a reveal that fades the picture in', () => {
  for (const width of [1200, 400]) {
    const page = styledPage(width, imageMessageHtml);
    try {
      const card = page.computed('.image-message-stack .generated-image-card');
      assert.equal(card.width, 'fit-content', `${width}px`);
      assert.equal(card.backgroundColor, 'transparent');
      assert.equal(card.borderTopWidth, '0px');
      assert.equal(card.aspectRatio, 'auto', 'a picture of known natural size keeps its own shape');
      const preview = page.computed('.generated-image-preview-btn');
      assert.deepEqual([preview.display, preview.width], ['inline-block', 'auto']);
      const onColor = page.window.getComputedStyle(page.document.documentElement).getPropertyValue('--on-color').trim();
      assert.equal(page.computed('.generated-image-action-btn svg').stroke, onColor, 'the controls are drawn in the colour on an accent');

      // The wait has no card: the dots are drawn on the page and fill the place below the words, and both fade as the picture comes.
      const skeleton = page.computed('.generated-image-skeleton');
      assert.equal(skeleton.backgroundColor, '');
      assert.equal(skeleton.boxShadow, '');
      assert.equal(skeleton.borderTopWidth, '');
      assert.match(skeleton.transition, /width \.46s[\s\S]*height \.46s[\s\S]*aspect-ratio \.46s/);
      const wait = page.computed('noureon-image-wait');
      assert.deepEqual([wait.position, wait.getPropertyValue('inset')], ['absolute', '2rem 0 0']);
      assert.equal(wait.opacity, '0');
      assert.equal(page.computed('.generated-image-wait-label').opacity, '0');

      assert.equal(page.computed('#entering .generated-image-card').opacity, '0');
      assert.equal(page.computed('#visible .generated-image-card').opacity, '1');
    } finally {
      page.window.close();
    }
  }

  // On a phone the picture takes the width of the screen, with room on the right.
  const phone = styledPage(400, imageMessageHtml);
  try {
    const stack = phone.computed('.image-message-stack');
    assert.equal(stack.width, 'calc(400px - 56px)');
    assert.equal(stack.marginRight, '17.6px');
    assert.equal(phone.computed('.image-message-stack .generated-image-card').maxWidth, '100%');
  } finally {
    phone.window.close();
  }
});

test('the old sweeping light and particle wait do not come back', () => {
  assert.doesNotMatch(chatCss, /generated-image-soft-sheen|generated-image-shimmer/);
  assert.doesNotMatch(chatCss, /@keyframes\s+generated-image-particles/);
});

function createRevealFixture({ aspectRatio = '16 / 9', connected = true } = {}) {
  const window = new Window();
  const { document } = window;
  const chat = document.createElement('div');
  document.body.appendChild(chat);
  const loadingMessageDiv = document.createElement('div');
  loadingMessageDiv.innerHTML = '<div class="generated-image-skeleton"></div>';
  if (connected) chat.appendChild(loadingMessageDiv);
  const skeleton = loadingMessageDiv.querySelector('.generated-image-skeleton');
  skeleton.getBoundingClientRect = () => ({ width: 320, height: 320 });
  const finalMessage = document.createElement('div');
  finalMessage.innerHTML = `<figure class="generated-image-card" style="aspect-ratio: ${aspectRatio}"></figure>`;
  const added = [];
  const conversation = { messages: [{}, {}] };
  revealGeneratedImage({
    finalAiMessage: { role: 'model' },
    conversation,
    loadingMessageDiv,
    addMessageToUI: (...args) => {
      added.push(args);
      return finalMessage;
    },
    requestAnimationFrame: (callback) => callback()
  });
  return { window, chat, loadingMessageDiv, skeleton, finalMessage, added };
}

test('the waiting frame grows to the picture\'s shape, then the picture replaces it and fades in', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = createRevealFixture();
  try {
    assert.equal(fixture.added[0][1], 1, 'the message is drawn at its place in the conversation');
    assert.equal(fixture.finalMessage.hidden, true);
    assert.equal(fixture.finalMessage.classList.contains('generated-image-result-enter'), true);
    assert.equal(fixture.loadingMessageDiv.classList.contains('generated-image-stage-morphing'), true);
    assert.equal(fixture.skeleton.classList.contains('generated-image-skeleton-finalizing'), true);
    assert.deepEqual([fixture.skeleton.style.width, fixture.skeleton.style.height], ['320px', '320px'], 'it starts from the size it has');

    t.mock.timers.tick(0);
    assert.deepEqual([fixture.skeleton.style.width, fixture.skeleton.style.height], ['320px', '180px'], 'then moves to the shape of the picture');
    assert.equal(fixture.chat.contains(fixture.loadingMessageDiv), true);

    t.mock.timers.tick(560);
    assert.equal(fixture.chat.contains(fixture.loadingMessageDiv), false);
    assert.equal(fixture.chat.firstElementChild, fixture.finalMessage);
    assert.equal(fixture.finalMessage.hidden, false);
    assert.equal(fixture.finalMessage.classList.contains('generated-image-result-visible'), true);
  } finally {
    fixture.window.close();
  }
});

test('without a waiting frame on the page the picture is shown at once', () => {
  const fixture = createRevealFixture({ connected: false });
  try {
    assert.equal(fixture.finalMessage.hidden, false);
    assert.equal(fixture.finalMessage.classList.contains('generated-image-result-visible'), true);
    assert.equal(fixture.loadingMessageDiv.classList.contains('generated-image-stage-morphing'), false);
  } finally {
    fixture.window.close();
  }
});

// The targeted editor on a fake canvas: a stroke leaves a mark, clearing the canvas removes it.
async function openEditorFixture() {
  const window = new Window({ width: 1200, height: 800 });
  const { document } = window;
  let marked = false;
  const context = {
    lineWidth: 0,
    globalCompositeOperation: 'source-over',
    clearRect() { marked = false; },
    drawImage() { marked = true; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { marked = this.globalCompositeOperation === 'source-over'; },
    getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, marked ? 255 : 0]) })
  };
  window.HTMLCanvasElement.prototype.getContext = () => context;
  window.HTMLCanvasElement.prototype.toDataURL = () => png;
  // happy-dom loads the picture by itself, as soon as it is given; it then reports this size.
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 100 });
  const interactions = createGeneratedImageInteractions({
    document,
    getImageDataUrl: async () => png,
    openPreview: () => {},
    attachAnnotatedImage: async () => {},
    loadStyles: async () => {}
  });
  await interactions.openEditor({ id: 'asset-1' });
  const editor = document.querySelector('.generated-image-editor');
  const photo = editor.querySelector('.generated-image-editor-photo');
  const canvas = editor.querySelector('.generated-image-editor-canvas');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual([canvas.width, canvas.height], [200, 100], 'the drawing layer has the size of the picture');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 });
  editor.querySelector('.generated-image-editor-canvas-wrap').getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 50 });
  const pointer = (type, clientX = 20, clientY = 20) => canvas.dispatchEvent(new window.MouseEvent(type, { clientX, clientY }));
  const button = (selector) => editor.querySelector(selector);
  const states = () => ['undo', 'redo', 'clear'].map((name) => button(`[data-editor-history="${name}"]`).disabled)
    .concat(button('.generated-image-editor-confirm').disabled);
  return { window, document, editor, photo, canvas, context, pointer, button, states };
}

test('the editor offers four brush colours without green, and a brush size from 4 to 48 that the preview and cursor follow', async () => {
  const fixture = await openEditorFixture();
  try {
    const colours = [...fixture.editor.querySelectorAll('[data-editor-color]')];
    assert.deepEqual(colours.map((colour) => colour.dataset.editorColor), ['#ef4444', '#3b82f6', '#facc15', '#ffffff']);
    assert.equal(colours[0].classList.contains('active'), true);

    const size = fixture.button('.generated-image-editor-size input');
    assert.deepEqual([size.type, size.min, size.max, size.value], ['range', '4', '48', '14']);
    size.value = '30';
    size.dispatchEvent(new fixture.window.Event('input'));
    const sizePreview = fixture.button('.generated-image-editor-size-preview');
    const cursor = fixture.button('.generated-image-editor-brush-cursor');
    assert.equal(sizePreview.style.getPropertyValue('--brush-size'), '30px');
    assert.equal(cursor.style.getPropertyValue('--brush-size'), '30px');

    colours[1].click();
    assert.equal(colours[1].classList.contains('active'), true);
    assert.equal(colours[0].classList.contains('active'), false);
    assert.equal(cursor.style.getPropertyValue('--brush-color'), '#3b82f6');

    // The cursor follows the pointer over the picture and goes when it leaves.
    fixture.pointer('pointermove', 60, 70);
    assert.deepEqual([cursor.style.left, cursor.style.top], ['50px', '50px']);
    assert.equal(cursor.classList.contains('is-visible'), true);
    fixture.pointer('pointerleave');
    assert.equal(cursor.classList.contains('is-visible'), false);
  } finally {
    fixture.window.close();
  }
});

test('a stroke is as wide on the picture as the brush on the screen, and undo, redo, clear and confirm follow the marks', async () => {
  const fixture = await openEditorFixture();
  try {
    // [undo, redo, clear, confirm] disabled
    assert.deepEqual(fixture.states(), [true, true, true, true]);

    fixture.pointer('pointerdown');
    assert.equal(fixture.context.lineWidth, 28, 'a 14px brush on a picture shown at half its size');
    fixture.pointer('pointerup');
    assert.deepEqual(fixture.states(), [false, true, false, false]);

    fixture.button('[data-editor-history="undo"]').click();
    assert.deepEqual(fixture.states(), [true, false, true, true]);

    fixture.pointer('pointerdown');
    fixture.pointer('pointerup');
    assert.deepEqual(fixture.states(), [false, true, false, false], 'a new stroke drops what could be redone');

    fixture.button('[data-editor-history="clear"]').click();
    assert.deepEqual(fixture.states(), [false, true, true, true]);
  } finally {
    fixture.window.close();
  }
});

test('the editor cannot be copied or dragged from, has no title words, and closes by its button or Escape', async () => {
  const fixture = await openEditorFixture();
  try {
    assert.equal(fixture.photo.getAttribute('draggable'), 'false');
    const blocked = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];
    for (const type of blocked) {
      const event = new fixture.window.Event(type, { bubbles: true, cancelable: true });
      fixture.photo.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, type);
    }
    const header = fixture.button('.generated-image-editor-header');
    assert.equal(header.textContent.trim(), '');
    assert.equal(fixture.editor.querySelector('[data-drawing-area-label]'), null);
    assert.ok(fixture.button('.generated-image-editor-close svg path[d="M18 6 6 18"]'));

    fixture.button('.generated-image-editor-close').click();
    assert.equal(fixture.document.querySelector('.generated-image-editor'), null);
    const copy = new fixture.window.Event('copy', { bubbles: true, cancelable: true });
    fixture.photo.dispatchEvent(copy);
    assert.equal(copy.defaultPrevented, false, 'the blocks go with the editor');
  } finally {
    fixture.window.close();
  }

  const again = await openEditorFixture();
  try {
    again.document.dispatchEvent(new again.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(again.document.querySelector('.generated-image-editor'), null);
  } finally {
    again.window.close();
  }
});

const editorHtml = `
  <div class="generated-image-editor">
    <header class="generated-image-editor-header">
      <button class="generated-image-editor-close"><svg></svg></button>
      <div class="generated-image-editor-history"><button class="generated-image-editor-history-btn"><svg></svg></button></div>
      <button class="generated-image-editor-confirm"><svg></svg></button>
    </header>
    <div class="generated-image-editor-stage">
      <div class="generated-image-editor-canvas-wrap">
        <img class="generated-image-editor-photo">
        <div class="generated-image-editor-brush-cursor" style="--brush-size: 30px"></div>
      </div>
    </div>
    <footer class="generated-image-editor-toolbar">
      <label class="generated-image-editor-size"><span class="generated-image-editor-size-preview"></span><input type="range"></label>
      <button class="generated-image-editor-eraser"><svg></svg></button>
    </footer>
  </div>
  <div class="generated-image-lightbox"><div class="media-lightbox-stage"><img></div></div>`;

test('the editor is a black full screen with white controls, the picture square-cornered and the brush cursor sized by the brush', () => {
  for (const width of [1200, 400]) {
    const page = styledPage(width, editorHtml);
    try {
      const editor = page.computed('.generated-image-editor');
      assert.equal(editor.gridTemplateRows, 'auto minmax(0, 1fr) auto', `${width}px`);
      assert.equal(editor.backgroundColor, '#000');
      assert.equal(editor.backdropFilter, 'none');
      assert.equal(editor.userSelect, 'none');
      assert.equal(editor.getPropertyValue('-webkit-touch-callout'), 'none');
      assert.equal(page.computed('.generated-image-editor-header').justifyContent, 'space-between');
      const close = page.computed('.generated-image-editor-close');
      assert.deepEqual([close.alignItems, close.justifyContent], ['center', 'center']);
      assert.equal(page.computed('.generated-image-editor-close svg').stroke, 'currentColor');
      for (const selector of ['.generated-image-editor-eraser svg', '.generated-image-editor-history-btn svg', '.generated-image-editor-confirm svg']) {
        assert.equal(page.computed(selector).stroke, '#fff', selector);
      }
      assert.equal(page.computed('.generated-image-editor-stage').overflow, 'hidden');
      assert.equal(page.computed('.generated-image-editor-photo').borderTopLeftRadius, '0px');
      assert.equal(page.computed('.generated-image-lightbox .media-lightbox-stage img').borderTopLeftRadius, '0px');
      assert.equal(page.computed('.generated-image-editor-brush-cursor').width, '30px');
    } finally {
      page.window.close();
    }
  }

  // Wide: the size is a vertical slider on the left edge of the picture; the confirm button is 2.8rem.
  const wide = styledPage(1200, editorHtml);
  try {
    assert.equal(wide.computed('.generated-image-editor-size').position, 'absolute');
    assert.match(wide.computed('.generated-image-editor-size input').transform, /rotate\(-90deg\)/);
    const confirm = wide.computed('.generated-image-editor-confirm');
    assert.deepEqual([confirm.width, confirm.height], ['44.8px', '44.8px']);
  } finally {
    wide.window.close();
  }

  // Phone: the picture is centred and fits the screen, the buttons are 2.7rem.
  const phone = styledPage(400, editorHtml);
  try {
    assert.equal(phone.computed('.generated-image-editor-stage').placeItems, 'center');
    assert.match(phone.computed('.generated-image-editor-photo').maxHeight, /^min\(608px, calc\(100dvh - [\d.]+px\)\)$/);
    for (const selector of ['.generated-image-editor-close', '.generated-image-editor-confirm']) {
      const button = phone.computed(selector);
      assert.deepEqual([button.width, button.height], ['43.2px', '43.2px'], selector);
    }
  } finally {
    phone.window.close();
  }
});

test('the editor\'s old frame around the drawing area does not come back', () => {
  assert.doesNotMatch(editorCss, /\.generated-image-editor-canvas-wrap::before/);
});

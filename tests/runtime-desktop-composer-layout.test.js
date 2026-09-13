import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import {
  createDesktopComposerLayout,
  deriveDesktopComposerLayout
} from '../src/app/runtime/features/desktop-composer-layout.js';

const setMetric = (element, property, value) => {
  Object.defineProperty(element, property, { configurable: true, value });
};

const createHarness = ({ desktop = true, reducedMotion = false, conversation } = {}) => {
  const { window, document, cleanup } = createDom(`
    <main id="chat-workspace" data-composer-layout="docked">
      <div id="chat-container"></div>
      <div id="input-bar-container"><div class="input-inner"></div></div>
    </main>
  `);
  const workspace = document.getElementById('chat-workspace');
  const chatContainer = document.getElementById('chat-container');
  const inputBarContainer = document.getElementById('input-bar-container');
  const inputInner = inputBarContainer.firstElementChild;
  const media = {
    desktop: { matches: desktop, addEventListener() {}, removeEventListener() {} },
    reduced: { matches: reducedMotion, addEventListener() {}, removeEventListener() {} }
  };
  window.matchMedia = (query) => query.includes('prefers-reduced-motion') ? media.reduced : media.desktop;
  setMetric(chatContainer, 'offsetTop', 60);
  setMetric(chatContainer, 'clientHeight', 600);
  setMetric(inputBarContainer, 'offsetTop', 660);
  setMetric(inputBarContainer, 'offsetHeight', 80);
  setMetric(inputInner, 'offsetWidth', 880);
  const frames = [];
  const timers = [];
  let activeConversation = conversation || { archived: false, messages: [] };
  const resizeObservers = [];
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      resizeObservers.push(this);
    }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  const controller = createDesktopComposerLayout({
    window,
    elements: { chatWorkspace: workspace, chatContainer, inputBarContainer },
    getActiveConversation: () => activeConversation,
    ResizeObserver,
    requestFrame: (callback) => { frames.push(callback); return frames.length; },
    cancelFrame: () => {},
    scheduleTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearScheduledTimeout: () => {}
  });
  return {
    controller,
    workspace,
    inputBarContainer,
    media,
    frames,
    timers,
    resizeObservers,
    setConversation(next) { activeConversation = next; },
    flushFrame() { frames.shift()?.(); },
    cleanup
  };
};

test('derives empty layout only for an editable empty desktop conversation', () => {
  assert.equal(deriveDesktopComposerLayout({ conversation: { archived: false, messages: [] }, isDesktop: true }), 'empty');
  assert.equal(deriveDesktopComposerLayout({ conversation: { archived: false, messages: [{}] }, isDesktop: true }), 'docked');
  assert.equal(deriveDesktopComposerLayout({ conversation: { archived: true, messages: [] }, isDesktop: true }), 'docked');
  assert.equal(deriveDesktopComposerLayout({ conversation: { archived: false, messages: [] }, isDesktop: false }), 'mobile');
});

test('measures the empty composer position and matching desktop menu width', () => {
  const harness = createHarness();
  try {
    assert.equal(harness.controller.sync(), 'empty');
    harness.flushFrame();
    assert.equal(harness.workspace.dataset.composerLayout, 'empty');
    assert.equal(harness.workspace.style.getPropertyValue('--desktop-composer-empty-offset'), '-316px');
    assert.equal(harness.workspace.style.getPropertyValue('--desktop-composer-menu-width'), '880px');
  } finally {
    harness.controller.destroy();
    harness.cleanup();
  }
});

test('growing an empty composer keeps its top edge anchored below the greeting', () => {
  const harness = createHarness();
  try {
    harness.controller.sync();
    harness.flushFrame();
    assert.equal(harness.workspace.style.getPropertyValue('--desktop-composer-empty-offset'), '-316px');

    setMetric(harness.inputBarContainer, 'offsetHeight', 320);
    harness.controller.measureEmptyOffset();

    assert.equal(harness.workspace.style.getPropertyValue('--desktop-composer-empty-offset'), '-316px');
  } finally {
    harness.controller.destroy();
    harness.cleanup();
  }
});

test('first submit docks the same composer and settles after its transform transition', () => {
  const harness = createHarness();
  try {
    harness.controller.sync();
    harness.flushFrame();
    assert.equal(harness.controller.beginFirstSubmit(), true);
    assert.equal(harness.workspace.dataset.composerLayout, 'docking');
    assert.equal(harness.workspace.classList.contains('composer-layout-animate'), true);

    const event = new harness.inputBarContainer.ownerDocument.defaultView.Event('transitionend');
    Object.defineProperty(event, 'propertyName', { value: 'transform' });
    harness.inputBarContainer.dispatchEvent(event);

    assert.equal(harness.workspace.dataset.composerLayout, 'docked');
    assert.equal(harness.workspace.classList.contains('composer-layout-animate'), false);
  } finally {
    harness.controller.destroy();
    harness.cleanup();
  }
});

test('existing conversations do not replay first-submit motion and mobile clears desktop metrics', () => {
  const harness = createHarness({ conversation: { archived: false, messages: [{ role: 'user' }] } });
  try {
    assert.equal(harness.controller.sync(), 'docked');
    harness.flushFrame();
    assert.equal(harness.controller.beginFirstSubmit(), false);
    harness.media.desktop.matches = false;
    assert.equal(harness.controller.sync(), 'mobile');
    assert.equal(harness.workspace.style.getPropertyValue('--desktop-composer-empty-offset'), '');
    assert.equal(harness.workspace.style.getPropertyValue('--desktop-composer-menu-width'), '');
  } finally {
    harness.controller.destroy();
    assert.equal(harness.resizeObservers[0].disconnected, true);
    harness.cleanup();
  }
});

test('reduced motion skips docking animation', () => {
  const harness = createHarness({ reducedMotion: true });
  try {
    harness.controller.sync();
    harness.flushFrame();
    assert.equal(harness.controller.beginFirstSubmit(), true);
    assert.equal(harness.workspace.dataset.composerLayout, 'docked');
    assert.equal(harness.workspace.classList.contains('composer-layout-animate'), false);
  } finally {
    harness.controller.destroy();
    harness.cleanup();
  }
});

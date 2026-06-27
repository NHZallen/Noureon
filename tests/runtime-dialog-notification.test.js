import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { projectFile, readSource } from './helpers/source-guards.js';

const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
const dialogNotificationModulePath = 'src/app/runtime/features/dialog-notification-lifecycle.js';
const dialogNotificationModuleUrl = new URL(`../${dialogNotificationModulePath}`, import.meta.url);
const dialogNotificationModuleExists = existsSync(dialogNotificationModuleUrl);
const dialogNotificationModule = dialogNotificationModuleExists
  ? await import(dialogNotificationModuleUrl.href)
  : {};
const { createDialogNotificationLifecycle } = dialogNotificationModule;
const dialogNotificationModuleSource = dialogNotificationModuleExists
  ? readSource(dialogNotificationModulePath)
  : '';

function createHarness({ includeNotificationContainer = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    <div id="notification-container"></div>
    <div id="custom-dialog-modal" class="modal hidden">
      <div class="bg-[var(--modal-bg)]"></div>
    </div>
    <h2 id="custom-dialog-title"></h2>
    <p id="custom-dialog-message"></p>
    <div id="custom-dialog-input-container" class="hidden">
      <input id="custom-dialog-input">
    </div>
    <div id="custom-dialog-buttons"></div>
  `;

  const timers = [];
  let nextTimerId = 1;
  const setTimeout = (callback, delay) => {
    const timer = { callback, cancelled: false, delay, id: nextTimerId };
    nextTimerId += 1;
    timers.push(timer);
    return timer.id;
  };
  const clearTimeout = (id) => {
    const timer = timers.find((candidate) => candidate.id === id);
    if (timer) timer.cancelled = true;
  };
  const requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };

  const elements = {
    notificationContainer: includeNotificationContainer
      ? document.getElementById('notification-container')
      : null,
    customDialogModal: document.getElementById('custom-dialog-modal'),
    customDialogTitle: document.getElementById('custom-dialog-title'),
    customDialogMessage: document.getElementById('custom-dialog-message'),
    customDialogInputContainer: document.getElementById('custom-dialog-input-container'),
    customDialogInput: document.getElementById('custom-dialog-input'),
    customDialogButtons: document.getElementById('custom-dialog-buttons')
  };

  assert.equal(
    typeof createDialogNotificationLifecycle,
    'function',
    'dialog notification lifecycle factory should be exported'
  );

  return {
    document,
    elements,
    functions: createDialogNotificationLifecycle({
      document,
      elements,
      setTimeout,
      clearTimeout,
      requestAnimationFrame
    }),
    timers,
    window
  };
}

test('showNotification renders the current text/type contract and removes notifications after 3000ms', () => {
  const harness = createHarness();
  try {
    harness.functions.showNotification('Saved');
    harness.functions.showNotification('Could not save', 'error');

    const notifications = [...harness.elements.notificationContainer.children];
    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].textContent, 'Saved');
    assert.equal(notifications[0].className, 'notification success');
    assert.equal(notifications[1].textContent, 'Could not save');
    assert.equal(notifications[1].className, 'notification error');
    assert.deepEqual(harness.timers.map((timer) => timer.delay), [3000, 3000]);

    harness.timers[0].callback();
    assert.equal(harness.elements.notificationContainer.contains(notifications[0]), false);
    assert.equal(harness.elements.notificationContainer.contains(notifications[1]), true);
  } finally {
    harness.window.close();
  }
});

test('toggleModal preserves open, transition close, fallback, and missing-element behavior', () => {
  const harness = createHarness();
  try {
    const modal = harness.elements.customDialogModal;

    assert.doesNotThrow(() => harness.functions.toggleModal(null, true));
    harness.functions.toggleModal(modal, true);
    assert.equal(harness.document.body.classList.contains('modal-open'), true);
    assert.equal(modal.classList.contains('hidden'), false);
    assert.equal(modal.classList.contains('visible'), true);

    harness.functions.toggleModal(modal, false);
    assert.equal(harness.document.body.classList.contains('modal-open'), false);
    assert.equal(modal.classList.contains('visible'), false);
    assert.equal(harness.timers.at(-1).delay, 350);

    modal.dispatchEvent(new harness.window.Event('transitionend'));
    assert.equal(modal.classList.contains('hidden'), true);
    assert.equal(harness.timers.at(-1).cancelled, true);
  } finally {
    harness.window.close();
  }
});

test('custom confirm resolves accepted and rejected choices while cleaning dialog state', async () => {
  for (const { buttonIndex, expected } of [
    { buttonIndex: 1, expected: true },
    { buttonIndex: 0, expected: false }
  ]) {
    const harness = createHarness();
    try {
      const resultPromise = harness.functions.showCustomConfirm('Continue?', 'Confirm');
      assert.equal(harness.elements.customDialogTitle.textContent, 'Confirm');
      assert.equal(harness.elements.customDialogMessage.textContent, 'Continue?');
      assert.equal(harness.elements.customDialogButtons.children.length, 2);
      assert.equal(harness.elements.customDialogModal.classList.contains('visible'), true);

      harness.elements.customDialogButtons.children[buttonIndex].click();

      assert.equal(await resultPromise, expected);
      assert.equal(harness.elements.customDialogModal.classList.contains('visible'), false);
    } finally {
      harness.window.close();
    }
  }
});

test('custom prompt preserves entered values, input type, focus, and cancel behavior', async () => {
  const acceptedHarness = createHarness();
  const cancelledHarness = createHarness();
  try {
    const acceptedPromise = acceptedHarness.functions.showCustomPrompt(
      'Enter value',
      'Prompt',
      'password'
    );
    assert.equal(acceptedHarness.elements.customDialogInput.type, 'password');
    assert.equal(acceptedHarness.elements.customDialogInputContainer.classList.contains('hidden'), false);
    assert.equal(acceptedHarness.document.activeElement, acceptedHarness.elements.customDialogInput);
    acceptedHarness.elements.customDialogInput.value = 'typed value';
    acceptedHarness.elements.customDialogButtons.children[1].click();
    assert.equal(await acceptedPromise, 'typed value');

    const cancelledPromise = cancelledHarness.functions.showCustomPrompt('Enter value', 'Prompt');
    cancelledHarness.elements.customDialogInput.value = 'discarded value';
    cancelledHarness.elements.customDialogButtons.children[0].click();
    assert.equal(await cancelledPromise, null);
  } finally {
    acceptedHarness.window.close();
    cancelledHarness.window.close();
  }
});

test('missing notification container preserves the current explicit failure behavior', () => {
  const harness = createHarness({ includeNotificationContainer: false });
  try {
    assert.throws(
      () => harness.functions.showNotification('Unavailable'),
      TypeError
    );
  } finally {
    harness.window.close();
  }
});

test('legacy core composes the extracted lifecycle without moving runtime contracts', () => {
  assert.equal(existsSync(projectFile(dialogNotificationModulePath)), true);
  assert.equal(typeof createDialogNotificationLifecycle, 'function');
  assert.match(
    legacyCoreSource,
    /import\s+\{\s*createDialogNotificationLifecycle\s*\}\s+from\s+['"]\/src\/app\/runtime\/features\/dialog-notification-lifecycle\.js['"]/
  );
  assert.match(legacyCoreSource, /createDialogNotificationLifecycle\(\{[\s\S]*?document,[\s\S]*?elements:\s*ALL_ELEMENTS/);
  assert.match(
    legacyCoreSource,
    /createRuntimeDialogCoordinator\(\{\s*showNotification:\s*\(\.\.\.args\)\s*=>\s*showNotification\(\.\.\.args\)/
  );
  assert.match(legacyCoreSource, /document\.addEventListener\('DOMContentLoaded',[\s\S]*?querySelectorAll\('\.modal'\)/);
  assert.doesNotMatch(legacyCoreSource, /const\s+showNotification\s*=\s*\(message,/);
  assert.doesNotMatch(legacyCoreSource, /const\s+toggleModal\s*=\s*\(modalElement,/);
  assert.doesNotMatch(legacyCoreSource, /const\s+showCustomDialog\s*=\s*\(options\)/);

  assert.match(dialogNotificationModuleSource, /export\s+function\s+createDialogNotificationLifecycle\s*\(/);
  assert.doesNotMatch(
    dialogNotificationModuleSource,
    /legacyRuntimeContext|registerLazyBinding|resolveBinding|resolveOptionalBinding/
  );
  assert.doesNotMatch(
    dialogNotificationModuleSource,
    /^import\s+[\s\S]*?from\s+['"][^'"]*(?:runtime-entry|app-bootstrap|startup-lifecycle|sidebar|settings|submit|input)[^'"]*['"]/m
  );
});

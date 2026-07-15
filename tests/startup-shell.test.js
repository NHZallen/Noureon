import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import {
  dismissStartupSkeleton,
  mountAppShell,
  showStartupFailure
} from '../src/app/bootstrap/mount-shell.js';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index provides an accessible static startup status before JavaScript runs', () => {
  const window = new Window({ url: 'https://noureon.com/' });
  window.document.write(indexSource);

  const skeleton = window.document.querySelector('#app > [data-startup-skeleton]');
  const status = skeleton?.querySelector('[role="status"]');

  assert.ok(skeleton);
  assert.equal(skeleton.getAttribute('aria-labelledby'), 'startup-skeleton-title');
  assert.ok(status);
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('aria-atomic'), 'true');
  assert.equal(status.getAttribute('aria-busy'), 'true');
  assert.match(status.textContent, /Noureon/);
  assert.match(status.textContent, /正在載入本機工作區/);
});

test('mountAppShell keeps the startup overlay until the runtime is interactive', () => {
  const window = new Window({ url: 'https://noureon.com/' });
  window.document.body.innerHTML = `
    <div id="app">
      <main data-startup-skeleton>Loading</main>
    </div>
  `;
  const previousDocument = globalThis.document;

  try {
    globalThis.document = window.document;
    mountAppShell('<section data-mounted-app-shell>Ready</section>');

    assert.ok(window.document.querySelector('[data-startup-skeleton]'));
    assert.equal(window.document.querySelector('[data-mounted-app-shell]')?.textContent, 'Ready');
    assert.equal(dismissStartupSkeleton(window.document), true);
    assert.equal(window.document.querySelector('[data-startup-skeleton]'), null);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test('startup failures remain visible and accessible instead of leaving a blank shell', () => {
  const window = new Window({ url: 'https://noureon.com/' });
  window.document.body.innerHTML = `
    <main data-startup-skeleton>
      <div role="status" aria-busy="true">
        <p class="startup-skeleton__message">Loading</p>
        <span class="startup-skeleton__spinner"></span>
      </div>
    </main>
  `;

  assert.equal(showStartupFailure(new Error('workspace unavailable'), window.document), true);
  assert.equal(window.document.querySelector('[role="alert"]')?.getAttribute('aria-busy'), 'false');
  assert.match(window.document.querySelector('.startup-skeleton__message')?.textContent, /workspace unavailable/);
  assert.equal(window.document.querySelector('.startup-skeleton__spinner'), null);
});

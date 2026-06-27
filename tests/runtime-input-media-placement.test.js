import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { projectFile, readSource } from './helpers/source-guards.js';

const helperPath = 'src/app/runtime/features/input-media-placement.js';
const helperUrl = new URL(`../${helperPath}`, import.meta.url);
const helperExists = existsSync(helperUrl);
const helperModule = helperExists ? await import(helperUrl.href) : {};
const { arrangeInputMediaPreview } = helperModule;
const helperSource = helperExists ? readSource(helperPath) : '';
const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

function createFixture({
  includePreview = true,
  includeSettingsButton = true,
  includeSettingsIcon = true,
  includeWrapper = true,
  previewInsideWrapper = false
} = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    ${includeWrapper ? '<div class="input-wrapper"><span id="existing-control"></span></div>' : ''}
    ${includePreview && !previewInsideWrapper ? '<div id="file-preview-container" class="original-preview"></div>' : ''}
    ${includeSettingsButton ? `<button id="settings-btn">${includeSettingsIcon ? '<svg viewBox="0 0 16 16"><rect width="4" height="4"></rect></svg>' : ''}</button>` : ''}
  `;

  const wrapper = document.querySelector('.input-wrapper');
  let preview = document.getElementById('file-preview-container');
  if (includePreview && previewInsideWrapper) {
    preview = document.createElement('div');
    preview.id = 'file-preview-container';
    preview.className = 'already-placed';
    wrapper.appendChild(preview);
  }

  return {
    document,
    preview,
    settingsButton: document.getElementById('settings-btn'),
    window,
    wrapper
  };
}

function arrangeFixture(fixture) {
  assert.equal(typeof arrangeInputMediaPreview, 'function', 'input media placement helper should be exported');
  return arrangeInputMediaPreview({
    document: fixture.document,
    inputMediaPreview: fixture.preview,
    settingsButton: fixture.settingsButton
  });
}

test('places the media preview first in the input wrapper with the legacy class', () => {
  const fixture = createFixture();
  try {
    arrangeFixture(fixture);

    assert.equal(fixture.wrapper.firstElementChild, fixture.preview);
    assert.equal(fixture.preview.parentElement, fixture.wrapper);
    assert.equal(fixture.preview.className, 'input-media-preview empty:hidden');
    assert.equal(fixture.wrapper.children[1].id, 'existing-control');
  } finally {
    fixture.window.close();
  }
});

test('updates the settings icon with the current viewBox and path geometry', () => {
  const fixture = createFixture();
  try {
    arrangeFixture(fixture);

    const icon = fixture.settingsButton.querySelector('svg');
    assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(
      icon.querySelector('path').getAttribute('d'),
      'M9.671 4.136a2.34 2.34 0 0 1 4.658 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.329 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.329 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.658 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.329-4.033 2.34 2.34 0 0 0 0-3.831 2.34 2.34 0 0 1 2.329-4.033 2.34 2.34 0 0 0 3.32-1.915'
    );
    assert.equal(icon.querySelector('circle').getAttribute('cx'), '12');
    assert.equal(icon.querySelector('circle').getAttribute('cy'), '12');
    assert.equal(icon.querySelector('circle').getAttribute('r'), '3');
  } finally {
    fixture.window.close();
  }
});

test('an already placed preview stays untouched while the settings icon still updates', () => {
  const fixture = createFixture({ previewInsideWrapper: true });
  try {
    arrangeFixture(fixture);

    assert.equal(fixture.wrapper.children[1], fixture.preview);
    assert.equal(fixture.preview.className, 'already-placed');
    assert.equal(
      fixture.settingsButton.querySelector('svg').getAttribute('viewBox'),
      '0 0 24 24'
    );
  } finally {
    fixture.window.close();
  }
});

test('missing wrapper, preview, settings button, or settings icon remains graceful', () => {
  const fixtures = [
    createFixture({ includeWrapper: false }),
    createFixture({ includePreview: false }),
    createFixture({ includeSettingsButton: false }),
    createFixture({ includeSettingsIcon: false })
  ];

  try {
    for (const fixture of fixtures) {
      assert.doesNotThrow(() => arrangeFixture(fixture));
    }
    assert.equal(
      fixtures[0].settingsButton.querySelector('svg').getAttribute('viewBox'),
      '0 0 24 24'
    );
    assert.equal(fixtures[2].wrapper.firstElementChild, fixtures[2].preview);
  } finally {
    for (const fixture of fixtures) fixture.window.close();
  }
});

test('legacy core delegates placement without adding runtime contracts', () => {
  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.equal(typeof arrangeInputMediaPreview, 'function');
  assert.match(
    legacyCoreSource,
    /import\s+\{\s*arrangeInputMediaPreview\s*\}\s+from\s+['"]\/src\/app\/runtime\/features\/input-media-placement\.js['"]/
  );
  assert.match(
    legacyCoreSource,
    /arrangeInputMediaPreview\(\{[\s\S]*?document,[\s\S]*?inputMediaPreview:\s*runtimeDomAccess\.getOptionalElement\('filePreviewContainer'\),[\s\S]*?settingsButton:\s*runtimeDomAccess\.getOptionalElement\('settingsBtn'\)/
  );
  assert.doesNotMatch(legacyCoreSource, /const\s+arrangeInputMediaPreview\s*=\s*\(\)\s*=>/);
  assert.doesNotMatch(helperSource, /registerLazyBinding|resolveBinding|resolveOptionalBinding|legacyRuntimeContext/);
  assert.doesNotMatch(
    helperSource,
    /^import\s+[\s\S]*?from\s+['"][^'"]*(?:runtime-entry|app-bootstrap|startup-lifecycle|sidebar|settings|submit|provider)[^'"]*['"]/m
  );
});

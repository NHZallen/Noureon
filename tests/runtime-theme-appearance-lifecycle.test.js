import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createThemeAppearanceLifecycle } from '../src/app/runtime/features/theme-appearance-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function createAutoLoadImage() {
  return class FakeImage {
    constructor() {
      this.width = 1;
      this.height = 1;
      this._src = '';
      this._onload = null;
    }

    set src(value) {
      this._src = value;
      if (this._onload) queueMicrotask(this._onload);
    }

    get src() {
      return this._src;
    }

    set onload(callback) {
      this._onload = callback;
      if (this._src && callback) queueMicrotask(callback);
    }

    get onload() {
      return this._onload;
    }
  };
}

function installCanvasFixture(document, pixelData) {
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = (tagName) => {
    if (tagName.toLowerCase() !== 'canvas') return originalCreateElement(tagName);
    return {
      width: 1,
      height: 1,
      getContext() {
        return {
          drawImage() {},
          getImageData() {
            return { data: pixelData };
          }
        };
      }
    };
  };
}

function createHarness(overrides = {}) {
  const window = new Window({ url: 'https://example.test/' });
  window.innerWidth = 1280;
  window.innerHeight = 720;
  const { document } = window;
  const calls = [];
  const state = {
    config: {
      theme: 'light',
      uiLanguage: 'zh-TW',
      customWallpaper: null,
      wallpaperBrightness: 'light',
      uiTheme: {
        mode: 'default',
        style: 'solid',
        customColor: '#111111',
        adaptiveColor: '#2277dd',
        adaptivePalette: [],
        adaptiveGradient: ''
      }
    },
    cropperInstance: null
  };

  const elements = {
    wallpaperContainer: document.createElement('div'),
    wallpaperCropImage: document.createElement('img'),
    wallpaperCropModal: document.createElement('section')
  };

  const dependencies = {
    window,
    document,
    Image: createAutoLoadImage(),
    FileReader: class FakeFileReader {
      readAsDataURL(file) {
        calls.push(['readAsDataURL', file.name]);
        this.onload({ target: { result: file.result } });
      }
    },
    Cropper: class FakeCropper {
      constructor(image, options) {
        calls.push(['Cropper', image.src, options.aspectRatio, options.viewMode, options.background, options.autoCropArea]);
        this.image = image;
        this.options = options;
      }
    },
    elements,
    state,
    i18n: {
      'zh-TW': {
        notEnoughColors: 'not enough colors',
        wallpaperUpdated: 'wallpaper updated',
        wallpaperError: 'wallpaper error',
        defaultAppearanceRestored: 'default restored'
      }
    },
    UI_THEME_COLORS: {
      blue: '#111111',
      red: '#ff0000'
    },
    setTheme: (theme) => calls.push(['setTheme', theme]),
    updateThemeButtons: () => calls.push(['updateThemeButtons']),
    setAiBubbleColor: () => calls.push(['setAiBubbleColor']),
    setUserBubbleColor: () => calls.push(['setUserBubbleColor']),
    saveConfig: async () => calls.push(['saveConfig']),
    showNotification: (message, type) => calls.push(['showNotification', message, type]),
    toggleModal: (modal, visible) => calls.push(['toggleModal', modal === elements.wallpaperCropModal, visible]),
    logger: { error: (...args) => calls.push(['error', ...args]) },
    ...overrides
  };

  return {
    window,
    document,
    calls,
    state,
    elements,
    lifecycle: createThemeAppearanceLifecycle(dependencies)
  };
}

function installColorOptionDom(document, elements) {
  elements.uiColorOptions = document.createElement('div');
  elements.uiColorOptions.innerHTML = `
    <input type="radio" name="color-theme" value="default">
    <input type="radio" name="color-theme" value="adaptive">
    <input type="radio" name="color-theme" value="custom">
  `;
  elements.buttonStyleContainer = document.createElement('div');
  elements.buttonStyleContainer.innerHTML = `
    <input type="radio" name="color-style" value="solid">
    <input type="radio" name="color-style" value="gradient">
  `;
  elements.customColorPickerContainer = document.createElement('div');
  elements.customColorSwatches = document.createElement('div');
  elements.gradientPickerContainer = document.createElement('div');
  elements.gradientSwatches = document.createElement('div');

  document.body.append(
    elements.uiColorOptions,
    elements.buttonStyleContainer,
    elements.customColorPickerContainer,
    elements.customColorSwatches,
    elements.gradientPickerContainer,
    elements.gradientSwatches
  );
}

test('applyUiTheme preserves default, custom, and adaptive gradient CSS variable behavior', () => {
  const { document, calls, state, lifecycle } = createHarness();

  lifecycle.applyUiTheme();
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg'), '#3b82f6');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-text'), '#ffffff');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg-override'), '');
  assert.deepEqual(calls, [['updateThemeButtons']]);

  state.config.uiTheme.mode = 'custom';
  state.config.uiTheme.customColor = '#ffffff';
  lifecycle.applyUiTheme();
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg'), '#ffffff');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-text'), '#000000');

  state.config.uiTheme.mode = 'adaptive';
  state.config.uiTheme.style = 'gradient';
  state.config.uiTheme.adaptiveColor = '#123456';
  state.config.uiTheme.adaptivePalette = ['#abcdef'];
  lifecycle.applyUiTheme();
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-bg'), '#abcdef');
  assert.equal(document.documentElement.style.getPropertyValue('--button-primary-text'), '#ffffff');
  assert.equal(
    document.documentElement.style.getPropertyValue('--button-primary-bg-override'),
    'linear-gradient(to right, #123456, #3b82f6)'
  );
});

test('renderUiColorOptions preserves swatches, selected state, gradient choices, and visibility toggles', () => {
  const { document, elements, state, lifecycle } = createHarness();
  installColorOptionDom(document, elements);
  state.config.uiTheme.mode = 'adaptive';
  state.config.uiTheme.style = 'gradient';
  state.config.uiTheme.customColor = '#111111';
  state.config.uiTheme.adaptivePalette = ['#111111', '#222222', '#333333'];
  state.config.uiTheme.adaptiveGradient = 'linear-gradient(to right, #111111, #222222)';

  lifecycle.renderUiColorOptions();

  assert.equal(elements.uiColorOptions.querySelector('input[value="adaptive"]').checked, true);
  assert.equal(elements.buttonStyleContainer.querySelector('input[value="gradient"]').checked, true);
  assert.equal(elements.customColorSwatches.children.length, 2);
  assert.equal(elements.customColorSwatches.querySelector('.selected').dataset.color, '#111111');
  assert.equal(elements.gradientSwatches.children.length, 4);
  assert.equal(
    elements.gradientSwatches.querySelector('.selected-gradient').dataset.gradient,
    'linear-gradient(to right, #111111, #222222)'
  );
  assert.equal(elements.buttonStyleContainer.classList.contains('hidden'), false);
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), true);
  assert.equal(elements.gradientPickerContainer.classList.contains('hidden'), false);

  elements.uiColorOptions.querySelector('input[value="adaptive"]').checked = false;
  elements.uiColorOptions.querySelector('input[value="custom"]').checked = true;
  elements.uiColorOptions.querySelector('input[value="custom"]').dispatchEvent(new document.defaultView.Event('change'));
  assert.equal(elements.customColorPickerContainer.classList.contains('hidden'), false);
  assert.equal(elements.gradientPickerContainer.classList.contains('hidden'), true);
});

test('image palette and brightness helpers preserve current canvas sampling behavior and fallback', async () => {
  const { document, lifecycle } = createHarness();
  installCanvasFixture(document, new Uint8ClampedArray([18, 105, 205, 255]));

  assert.deepEqual(await lifecycle.getDominantColorPalette('data:image/png;base64,color'), ['#146ed2']);
  assert.equal(await lifecycle.analyzeImageBrightness('data:image/png;base64,dark'), 'dark');

  const lightHarness = createHarness();
  installCanvasFixture(lightHarness.document, new Uint8ClampedArray([240, 240, 240, 255]));
  assert.deepEqual(await lightHarness.lifecycle.getDominantColorPalette('data:image/png;base64/plain'), ['#3b82f6']);
  assert.equal(await lightHarness.lifecycle.analyzeImageBrightness('data:image/png;base64,light'), 'light');
});

test('applyCustomWallpaper preserves wallpaper classes and bubble color handoffs', () => {
  const { document, elements, calls, state, lifecycle } = createHarness();

  lifecycle.applyCustomWallpaper();
  assert.equal(elements.wallpaperContainer.style.backgroundImage, 'none');
  assert.deepEqual(calls, [
    ['setTheme', 'light'],
    ['setAiBubbleColor'],
    ['setUserBubbleColor']
  ]);

  calls.length = 0;
  document.documentElement.classList.add('dark');
  state.config.customWallpaper = 'data:image/png;base64,wallpaper';
  state.config.wallpaperBrightness = 'dark';
  lifecycle.applyCustomWallpaper();

  assert.equal(elements.wallpaperContainer.style.backgroundImage, 'url("data:image/png;base64,wallpaper")');
  assert.equal(document.body.classList.contains('custom-wallpaper-active'), true);
  assert.equal(document.body.classList.contains('wallpaper-is-dark'), true);
  assert.equal(document.documentElement.classList.contains('dark'), false);
  assert.deepEqual(calls, [
    ['setAiBubbleColor'],
    ['setUserBubbleColor']
  ]);
});

test('wallpaper upload and crop confirm preserve cropper, config, save, modal, and notification behavior', async () => {
  const { document, elements, calls, state, lifecycle } = createHarness();
  installCanvasFixture(document, new Uint8ClampedArray([20, 100, 200, 255]));
  let destroyed = false;
  state.cropperInstance = { destroy: () => { destroyed = true; } };

  const target = {
    files: [{ name: 'wallpaper.png', result: 'data:image/png;base64,next' }],
    value: 'wallpaper.png'
  };
  lifecycle.handleWallpaperUpload({ target });

  assert.equal(target.value, '');
  assert.equal(elements.wallpaperCropImage.src, 'data:image/png;base64,next');
  assert.equal(destroyed, true);
  assert.deepEqual(calls.slice(0, 3), [
    ['readAsDataURL', 'wallpaper.png'],
    ['toggleModal', true, true],
    ['Cropper', 'data:image/png;base64,next', 1280 / 720, 1, false, 1]
  ]);

  state.cropperInstance = {
    getCroppedCanvas(options) {
      calls.push(['getCroppedCanvas', options.maxWidth, options.imageSmoothingEnabled, options.imageSmoothingQuality]);
      return {
        toDataURL(type, quality) {
          calls.push(['toDataURL', type, quality]);
          return 'data:image/jpeg;base64,cropped';
        }
      };
    }
  };

  await lifecycle.handleConfirmCrop();

  assert.equal(state.config.customWallpaper, 'data:image/jpeg;base64,cropped');
  assert.equal(state.config.wallpaperBrightness, 'dark');
  assert.deepEqual(state.config.uiTheme.adaptivePalette, ['#1464c8']);
  assert.equal(state.config.uiTheme.adaptiveColor, '#1464c8');
  assert.ok(calls.findIndex((call) => call[0] === 'saveConfig') < calls.findIndex((call) => call[0] === 'toggleModal' && call[2] === false));
  assert.deepEqual(calls.at(-1), ['showNotification', 'wallpaper updated', 'success']);
});

test('restoreDefaultWallpaper preserves reset/save/apply/notification behavior', async () => {
  const { calls, state, lifecycle } = createHarness();
  state.config.customWallpaper = 'data:image/png;base64,old';
  state.config.wallpaperBrightness = 'dark';
  state.config.uiTheme.adaptiveColor = '#999999';
  state.config.uiTheme.adaptivePalette = ['#999999'];
  state.config.uiTheme.adaptiveGradient = 'linear-gradient(red, blue)';

  await lifecycle.restoreDefaultWallpaper();

  assert.equal(state.config.customWallpaper, null);
  assert.equal(state.config.wallpaperBrightness, 'light');
  assert.equal(state.config.uiTheme.adaptiveColor, '#3b82f6');
  assert.deepEqual(state.config.uiTheme.adaptivePalette, []);
  assert.equal(state.config.uiTheme.adaptiveGradient, '');
  assert.equal(calls[0][0], 'saveConfig');
  assert.deepEqual(calls.at(-1), ['showNotification', 'default restored', 'success']);
});

test('theme appearance helper is isolated while core-tail keeps the documented binding surface', () => {
  const helperPath = 'src/app/runtime/features/theme-appearance-lifecycle.js';
  const helperSource = readSource(helperPath);
  const coreTailSource = readSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');

  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.match(helperSource, /export\s+function\s+createThemeAppearanceLifecycle/);
  assert.match(coreTailSource, /import\s+\{\s*createThemeAppearanceLifecycle\s*\}/);
  assert.match(coreTailSource, /const\s+themeAppearanceLifecycle\s*=\s*createThemeAppearanceLifecycle\(\{/);

  for (const name of [
    'getDominantColorPalette',
    'applyUiTheme',
    'renderUiColorOptions',
    'analyzeImageBrightness',
    'applyCustomWallpaper',
    'handleWallpaperUpload',
    'handleConfirmCrop',
    'restoreDefaultWallpaper'
  ]) {
    assert.match(coreTailSource, new RegExp(`const\\s+${name}\\s*=\\s*\\(\\.\\.\\.args\\)\\s*=>\\s*themeAppearanceLifecycle\\.${name}\\(\\.\\.\\.args\\);`));
  }

  assert.doesNotMatch(coreTailSource, /const\s+img\s*=\s*new\s+Image\(\)/);
  assert.doesNotMatch(coreTailSource, /root\.style\.setProperty\('--button-primary-bg'/);
  assert.doesNotMatch(helperSource, /registerLazyBinding|resolveBinding|resolveOptionalBinding/);
  assert.doesNotMatch(helperSource, /runtime-entry|app-bootstrap|submit-input|provider|security|api-key|legacy-runtime\/fragments|virtual:legacy-app-runtime/);
});

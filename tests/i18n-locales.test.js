import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import en from '../src/data/i18n/en.js';

const projectSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const leafTypes = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return child && typeof child === 'object'
    ? leafTypes(child, path)
    : [[path, typeof child]];
});

test('i18n registers all six UI locales in the required order', async () => {
  const { i18n } = await import('../src/data/i18n/index.js');

  assert.deepEqual(Object.keys(i18n), ['zh-TW', 'en', 'fr', 'ru', 'es', 'ar']);
});

test('Russian Spanish and Arabic locales match the complete English key surface', async () => {
  const englishLeaves = leafTypes(en);
  const locales = await Promise.all([
    import('../src/data/i18n/ru.js'),
    import('../src/data/i18n/es.js'),
    import('../src/data/i18n/ar.js')
  ]);

  for (const { default: locale } of locales) {
    assert.deepEqual(leafTypes(locale), englishLeaves);
    for (const [path] of englishLeaves) {
      const value = path.split('.').reduce((current, key) => current[key], locale);
      assert.equal(typeof value, 'string', `${path} must remain a string`);
      const englishValue = path.split('.').reduce((current, key) => current[key], en);
      if (englishValue.trim()) assert.ok(value.trim(), `${path} must not be empty`);
    }
  }
});

test('new locales use native product language for representative UI copy', async () => {
  const [{ default: ru }, { default: es }, { default: ar }] = await Promise.all([
    import('../src/data/i18n/ru.js'),
    import('../src/data/i18n/es.js'),
    import('../src/data/i18n/ar.js')
  ]);

  assert.equal(ru.settings, 'Настройки');
  assert.equal(ru.save, 'Сохранить');
  assert.equal(es.settings, 'Configuración');
  assert.equal(es.save, 'Guardar');
  assert.equal(ar.settings, 'الإعدادات');
  assert.equal(ar.save, 'حفظ');
  for (const locale of [ru, es, ar]) {
    for (const key of ['uiLanguage', 'aiReplyLanguage', 'cancel', 'errorPrefix', 'welcome']) {
      assert.notEqual(locale[key], en[key], `${key} must be localized`);
    }
  }
});

test('localized strings preserve every runtime interpolation token', async () => {
  const locales = await Promise.all([
    import('../src/data/i18n/ru.js'),
    import('../src/data/i18n/es.js'),
    import('../src/data/i18n/ar.js')
  ]);
  const tokens = value => [...String(value).matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort();

  for (const { default: locale } of locales) {
    for (const [key, englishValue] of Object.entries(en)) {
      if (typeof englishValue !== 'string') continue;
      assert.deepEqual(tokens(locale[key]), tokens(englishValue), `${key} must preserve interpolation tokens`);
    }
  }
});

test('login UI and settings selectors expose the required locale order', () => {
  const loginShell = projectSource('src/templates/fragments/00-shell.fragment.js');
  const settingsShell = projectSource('src/templates/fragments/02-shell.fragment.js');
  const expectedOrder = ['zh-TW', 'en', 'fr', 'ru', 'es', 'ar'];
  const assertOrdered = (source, attribute) => {
    const positions = expectedOrder.map(code => source.indexOf(`${attribute}=\\"${code}\\"`));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  };

  assertOrdered(loginShell, 'data-lang');
  assertOrdered(settingsShell, 'value');
  assert.ok((settingsShell.match(/value=\\"ru\\"/g) || []).length >= 2);
  assert.ok((settingsShell.match(/value=\\"es\\"/g) || []).length >= 2);
  assert.ok((settingsShell.match(/value=\\"ar\\"/g) || []).length >= 2);
});

test('language application sets Arabic RTL and restores LTR for other locales', () => {
  const lifecycle = projectSource('src/app/runtime/legacy-core/core-tail-lifecycle.js');

  assert.match(lifecycle, /document\.documentElement\.lang\s*=\s*resolvedLanguage/);
  assert.match(lifecycle, /document\.documentElement\.dir\s*=\s*resolvedLanguage\s*===\s*'ar'\s*\?\s*'rtl'\s*:\s*'ltr'/);
});

test('RTL CSS mirrors application chrome while keeping technical content LTR', () => {
  const css = projectSource('src/styles/regression-overrides.css');

  assert.match(css, /html\[dir="rtl"\][\s\S]*?#sidebar/);
  assert.match(css, /html\[dir="rtl"\][\s\S]*?#settings-modal/);
  assert.match(css, /html\[dir="rtl"\][\s\S]*?\.popover/);
  assert.match(css, /html\[dir="rtl"\][\s\S]*?(?:pre|code)[\s\S]*?direction:\s*ltr/);
  assert.match(css, /html\[dir="rtl"\][\s\S]*?input\[type="email"\][\s\S]*?direction:\s*ltr/);
  assert.match(css, /html\[dir="rtl"\][\s\S]*?\.ac-chart[\s\S]*?direction:\s*ltr/);
});

test('AI reply language instructions support Russian Spanish and Arabic', () => {
  const streamApiCall = projectSource('src/app/legacy-runtime/features/stream-api-call.js');

  assert.match(streamApiCall, /ru:\s*'[^']*русском[^']*'/i);
  assert.match(streamApiCall, /es:\s*'[^']*español[^']*'/i);
  assert.match(streamApiCall, /ar:\s*'[^']*العربية[^']*'/);
  assert.match(streamApiCall, /LANGUAGE_INSTRUCTIONS\[config\.aiDefaultLanguage\]/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SETTINGS_MOBILE_ICON_MAP,
  getSettingsMobileGroups
} from '../src/app/legacy-runtime/features/settings-mobile-metadata.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const expectedSections = [
  'user',
  'personalization',
  'memory',
  'model-management',
  'data-management',
  'accessibility',
  'trash',
  'about'
];

test('settings mobile metadata preserves section order', () => {
  const groups = getSettingsMobileGroups((key, fallback) => fallback);
  const sections = groups.flatMap((group) => group.items.map((item) => item.section));

  assert.deepEqual(sections, expectedSections);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.section)), [
    ['user', 'personalization', 'memory', 'model-management'],
    ['data-management', 'accessibility', 'trash'],
    ['about']
  ]);
});

test('settings mobile icon map preserves the expected keys', () => {
  assert.deepEqual(Object.keys(SETTINGS_MOBILE_ICON_MAP), expectedSections);

  for (const section of expectedSections) {
    assert.equal(typeof SETTINGS_MOBILE_ICON_MAP[section], 'string');
    assert.match(SETTINGS_MOBILE_ICON_MAP[section], /^<svg\b/);
  }
});

test('settings mobile labels use injected text resolution without DOM access', () => {
  const calls = [];
  const translations = {
    userSettings: 'User',
    personalization: 'Personalization',
    appSettings: 'Application settings',
    about: 'About'
  };
  const groups = getSettingsMobileGroups((key, fallback) => {
    calls.push([key, fallback]);
    return translations[key] || fallback;
  });
  const labelsBySection = Object.fromEntries(
    groups.flatMap((group) => group.items.map((item) => [item.section, item.label]))
  );

  assert.equal(labelsBySection.personalization, 'Personalization');
  assert.equal(labelsBySection.user, 'User');
  assert.equal(labelsBySection.about, 'About');
  assert.equal(groups[1].title, 'Application settings');
  assert.equal(labelsBySection.memory, '記憶管理');
  assert.deepEqual(calls.map(([key]) => key), [
    'userSettings',
    'personalization',
    'memoryManagement',
    'modelManagement',
    'appSettings',
    'dataManagement',
    'accessibility',
    'trash',
    'about'
  ]);

  for (const [, fallback] of calls) {
    assert.equal(typeof fallback, 'string');
    assert.ok(fallback.length > 0);
  }
});

test('settings mobile metadata helper remains side-effect free', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/settings-mobile-metadata.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'addEventListener',
    'localStorage',
    'fetch'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});

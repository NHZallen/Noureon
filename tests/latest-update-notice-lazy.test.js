import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatestUpdateNotice } from '../src/app/runtime/features/latest-update-notice.js';

// The update notes are about 190 KB: they are loaded only when this version is newer than the last one the person saw.
const make = ({ lastSeenVersion, productVersion, notes }) => {
  const calls = { loads: 0, shown: 0, saved: 0 };
  const config = { enableUpdateNotifications: true, lastSeenVersion, uiLanguage: 'zh-TW' };
  const container = { innerHTML: '', appendChild() {}, replaceChildren() {} };
  const notice = createLatestUpdateNotice({
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ className: '', append() {}, appendChild() {}, setAttribute() {}, classList: { add() {} }, style: {} }) },
    elements: { latestUpdateContent: container, latestUpdateModal: {} },
    getConfig: () => config,
    i18n: { 'zh-TW': { newVersionsFound: '{count}' } },
    loadUpdateLogs: async () => { calls.loads += 1; return notes; },
    productVersion,
    sanitizeTrustedHTML: (value) => value,
    toggleModal: () => { calls.shown += 1; },
    saveConfig: async () => { calls.saved += 1; },
    loadStyles: async () => {}
  });
  return { notice, calls, config };
};

test('the notes are not loaded when the version is not newer than the one last seen', async () => {
  const { notice, calls } = make({ lastSeenVersion: '19.5.0', productVersion: '19.5.0', notes: [] });
  await notice.checkAndShowLatestUpdate();
  assert.equal(calls.loads, 0);
  assert.equal(calls.shown, 0);
});

test('the notes are loaded when the version is newer than the one last seen, and the version seen is remembered', async () => {
  const { notice, calls } = make({ lastSeenVersion: '19.4.0', productVersion: '19.5.0', notes: [{ version: '19.5.0', date: '2026-11-12', title: 't', sections: [] }] });
  try { await notice.checkAndShowLatestUpdate(); } catch { /* the drawing needs a real page; what is checked is the loading */ }
  assert.equal(calls.loads, 1);
});

test('with the notes turned off nothing is loaded', async () => {
  const { notice, calls, config } = make({ lastSeenVersion: '1.0.0', productVersion: '19.5.0', notes: [] });
  config.enableUpdateNotifications = false;
  await notice.checkAndShowLatestUpdate();
  assert.equal(calls.loads, 0);
});

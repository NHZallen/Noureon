import assert from 'node:assert/strict';
import test from 'node:test';

import updateLogEntries from '../src/data/update-logs/entries.js';
import { UPDATE_LOG_LANGUAGES, loadUpdateTranslation, loadUpdateTranslations, localizeUpdateLogs } from '../src/data/update-logs/translations.js';

const withNotes = updateLogEntries.filter((entry) => entry.content.length);
// The tags of a string, in order (a tag with its attributes), so that a translation keeps the shape of the original.
const tagsOf = (text) => (String(text).match(/<\/?[a-z][^>]*>/gi) || []).map((tag) => tag.toLowerCase().replace(/\s+/g, ' '));
// The name of the language of the pages is written in its own script in every language.
const cjk = /[㐀-鿿豈-﫿]/u;

test('every version that has notes is translated into every language, with the same strings and the same tags', async () => {
  const all = await loadUpdateTranslations();
  for (const language of UPDATE_LOG_LANGUAGES) {
    const translation = all[language];
    assert.deepEqual(Object.keys(translation).sort(), withNotes.map((entry) => entry.version).sort(), `${language} has exactly the versions that have notes`);
    for (const entry of withNotes) {
      const strings = translation[entry.version];
      assert.equal(strings.length, entry.content.length, `${language} ${entry.version}: the same number of strings`);
      entry.content.forEach((original, index) => {
        assert.equal(typeof strings[index], 'string', `${language} ${entry.version}[${index}] is a string`);
        assert.ok(strings[index].trim().length > 0, `${language} ${entry.version}[${index}] is not empty`);
        assert.deepEqual(tagsOf(strings[index]), tagsOf(original), `${language} ${entry.version}[${index}]: the same tags in the same order`);
      });
    }
  }
});

test('a translation holds no Chinese left over, except the name of the language the pages offer', async () => {
  const all = await loadUpdateTranslations();
  for (const language of UPDATE_LOG_LANGUAGES) {
    for (const [version, strings] of Object.entries(all[language])) {
      strings.forEach((text, index) => {
        assert.equal(cjk.test(text.replaceAll('繁體中文', '')), false, `${language} ${version}[${index}] still has Chinese: ${text.slice(0, 80)}`);
      });
    }
  }
});

test('the latest note says what the public pages are in every language', async () => {
  const all = await loadUpdateTranslations();
  for (const language of UPDATE_LOG_LANGUAGES) {
    const text = all[language]['17.13.0'].join(' ');
    for (const address of ['noureon.com/terms', 'noureon.com/privacy', 'noureon.com/updates']) assert.ok(text.includes(address), `${language} names ${address}`);
  }
});

test('localizeUpdateLogs puts the language in the notes, and leaves Traditional Chinese and unknown languages as they are', async () => {
  const logs = updateLogEntries.slice(0, 3);
  const english = await localizeUpdateLogs(logs, 'en');
  assert.equal(english.length, 3);
  assert.deepEqual(english.map((log) => log.version), logs.map((log) => log.version));
  assert.deepEqual(english.map((log) => log.date), logs.map((log) => log.date));
  assert.notDeepEqual(english[0].content, logs[0].content);
  assert.match(english[0].content[0], /Release Notes/);
  assert.deepEqual(await localizeUpdateLogs(logs, 'zh-TW'), logs);
  assert.deepEqual(await localizeUpdateLogs(logs, 'de'), logs);
  const unknown = [{ version: '99.0.0', date: '2030-01-01', content: ['<strong>x</strong>'] }];
  assert.deepEqual(await localizeUpdateLogs(unknown, 'fr'), unknown, 'a version without a translation stays in Traditional Chinese');
  assert.deepEqual(await loadUpdateTranslation('zh-TW'), {});
});

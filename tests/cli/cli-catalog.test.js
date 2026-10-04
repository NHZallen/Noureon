import assert from 'node:assert/strict';
import test from 'node:test';

import { CLI_DOWNLOAD_HOSTS, OFFICIAL_CLI_CATALOG, cliDescription, getCliTool, isCliReady, normalizeCliIds, normalizeCliVersions, validateCliManifest } from '../../src/data/cli-catalog.js';
import { CLI_TEXTS, cliText } from '../../src/app/runtime/cli/cli-texts.js';

test('the store has the official tools, each a well formed manifest, and the ones still waiting for something are not usable yet', () => {
  assert.deepEqual(OFFICIAL_CLI_CATALOG.map((tool) => tool.id), ['officecli', 'ffmpeg', 'yt-dlp', 'twitter-cli', 'rdt-cli', 'csvkit', 'pandoc', 'sox']);
  for (const tool of OFFICIAL_CLI_CATALOG) assert.deepEqual(validateCliManifest(tool), [], tool.id);
  assert.deepEqual(OFFICIAL_CLI_CATALOG.filter(isCliReady).map((tool) => tool.id), ['officecli', 'ffmpeg', 'yt-dlp', 'twitter-cli', 'rdt-cli', 'csvkit'], 'what works now, with the network and the credentials of the second stage');
  for (const tool of OFFICIAL_CLI_CATALOG.filter((entry) => !isCliReady(entry))) assert.ok(tool.needs.length > 0, `${tool.id} says what it waits for`);
  assert.equal(getCliTool('twitter-cli').kind, 'pip');
  assert.equal(getCliTool('nothing'), null);
});

test('every program is pinned to a version and a hash, and fetched from an allowed host', () => {
  for (const tool of OFFICIAL_CLI_CATALOG.filter((entry) => entry.kind === 'binary' && isCliReady(entry))) {
    const artifact = tool.artifacts['linux-x64'];
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.ok(CLI_DOWNLOAD_HOSTS.includes(new URL(artifact.url).hostname));
    assert.doesNotMatch(artifact.url, /\/latest\//, 'a rolling release would change under its hash');
  }
  for (const tool of OFFICIAL_CLI_CATALOG.filter((entry) => entry.kind === 'pip')) assert.match(tool.pip.version, /^\d+(\.\d+)+$/, 'a package is pinned to a version');
});

test('a tool that is only listed needs no program yet, but a tool that is ready does', () => {
  const pandoc = getCliTool('pandoc');
  assert.equal(pandoc.status, 'soon');
  assert.equal(pandoc.artifacts, undefined);
  assert.deepEqual(validateCliManifest(pandoc), []);
  assert.ok(validateCliManifest({ ...pandoc, status: 'ready' }).some((problem) => /artifact/.test(problem)), 'ready without a program is refused');
  assert.ok(validateCliManifest({ ...pandoc, status: 'ready', version: '3.1', artifacts: undefined }).length > 0);
});

test('a manifest is refused for what is wrong with it', () => {
  const base = OFFICIAL_CLI_CATALOG[0];
  const problems = (change) => validateCliManifest({ ...base, ...change });
  assert.ok(problems({ id: 'Bad Id' }).includes('id'));
  assert.ok(problems({ kind: 'script' }).includes('kind'));
  assert.ok(problems({ status: 'maybe' }).includes('status'));
  assert.ok(problems({ description: { en: 'only English' } }).some((problem) => /five languages/.test(problem)));
  assert.ok(problems({ usage: '' }).some((problem) => /usage/.test(problem)));
  assert.ok(problems({ env: { lower: 'x' } }).some((problem) => /env/.test(problem)));
  assert.ok(validateCliManifest({ ...OFFICIAL_CLI_CATALOG[3], pip: { package: '', version: '1', command: 'x' } }).some((problem) => /pip/.test(problem)));
  assert.deepEqual(validateCliManifest(null), ['not an object']);
});

test('the settings keep ids and versions that look like them, once each', () => {
  assert.deepEqual(normalizeCliIds(['officecli', 'officecli', 'Bad Id', 7, 'ffmpeg']), ['officecli', 'ffmpeg']);
  assert.deepEqual(normalizeCliIds('officecli'), []);
  assert.deepEqual(normalizeCliVersions({ officecli: '1.0.153', 'Bad Id': '1', ffmpeg: 3, x: '' }), { officecli: '1.0.153' });
  assert.deepEqual(normalizeCliVersions([1]), {});
});

test('the words of the CLI tools are in all five languages with the same keys; Chinese says 命令工具 and the others CLI', () => {
  const languages = Object.keys(CLI_TEXTS);
  assert.deepEqual(languages, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  const keys = Object.keys(CLI_TEXTS.en).sort();
  for (const language of languages) {
    assert.deepEqual(Object.keys(CLI_TEXTS[language]).sort(), keys, language);
    for (const key of keys) assert.ok(String(CLI_TEXTS[language][key]).trim(), `${language} ${key}`);
  }
  assert.equal(cliText('zh-TW', 'entry'), '命令工具');
  for (const language of ['en', 'fr', 'ru', 'es']) assert.equal(cliText(language, 'entry'), 'CLI');
  assert.equal(cliText('en', 'added_notice', { name: 'FFmpeg' }), '“FFmpeg” added. Type @ in the message box to use it.');
  assert.equal(cliText('xx', 'back'), 'Back', 'English for a language it does not have');
  for (const tool of OFFICIAL_CLI_CATALOG) assert.ok(cliDescription(tool, 'ru').length > 10);
});

test('a tool may carry its project logo: from an allowed host over https, or none (the terminal glyph is used)', () => {
  const base = getCliTool('ffmpeg');
  assert.ok(base.icon.startsWith('https://github.com/'));
  assert.equal(getCliTool('pandoc').icon, undefined, 'a project owned by a person has no picture of its own');
  assert.deepEqual(validateCliManifest({ ...base, icon: undefined }), []);
  for (const bad of ['http://github.com/a.png', 'https://example.com/a.png', 'javascript:alert(1)', 'not a url', '']) {
    assert.ok(validateCliManifest({ ...base, icon: bad }).some((problem) => /icon/.test(problem)), bad);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { VOICE_DEBUG_KEY, createVoiceDebug, voiceDebugEnabled } from '../src/app/ui/voice/voice-debug.js';
import { openMicLevel } from '../src/app/ui/voice/mic-level.js';

const makeWindow = (url) => new Window({ url });

test('the voice trace is off unless the address asks for it, and the choice is remembered', () => {
  const window = makeWindow('https://example.test/');
  assert.equal(voiceDebugEnabled(window), false);
  const asked = makeWindow('https://example.test/?voicedebug=1');
  assert.equal(voiceDebugEnabled(asked), true);
  assert.equal(asked.localStorage.getItem(VOICE_DEBUG_KEY), '1');
  asked.happyDOM.setURL('https://example.test/');
  assert.equal(voiceDebugEnabled(asked), true, 'remembered without the address');
  asked.happyDOM.setURL('https://example.test/?voicedebug=0');
  assert.equal(voiceDebugEnabled(asked), false, 'turned off by the address');
  assert.equal(asked.localStorage.getItem(VOICE_DEBUG_KEY), null);
});

test('the trace lists what happened with the time of each thing, keeps the newest lines, and can be closed', () => {
  const window = makeWindow('https://example.test/');
  let clock = 0;
  const debug = createVoiceDebug({ document: window.document, window, now: () => clock });
  debug.begin('dictation');
  clock = 1500;
  debug.log('recognition start');
  clock = 2250;
  debug.log('recognition audiostart');
  const panel = window.document.querySelector('[data-voice-debug]');
  assert.ok(panel, 'the panel is on the page');
  assert.match(panel.textContent, /1\.50s recognition start/);
  assert.match(panel.textContent, /2\.25s recognition audiostart/);
  for (let index = 0; index < 100; index += 1) debug.log(`line ${index}`);
  assert.ok(debug.lines.length <= 60, 'only the newest lines are kept');
  assert.equal(debug.lines[0], '--- dictation', 'the title stays first');
  debug.close();
  assert.equal(window.document.querySelector('[data-voice-debug]'), null);
});

test('the microphone level says in the trace why it was or was not opened', async () => {
  const lines = [];
  await openMicLevel({
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) }, permissions: { query: async () => ({ state: 'prompt' }) } },
    window: { AudioContext: class {} },
    onlyIfAllowed: true,
    trace: (text) => lines.push(text)
  });
  assert.deepEqual(lines, ['permission query: prompt']);
  const failing = [];
  await openMicLevel({
    navigator: { mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } } },
    window: { AudioContext: class {} },
    trace: (text) => failing.push(text)
  });
  assert.deepEqual(failing, ['not opened: NotAllowedError']);
});

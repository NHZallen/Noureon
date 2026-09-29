import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { DICTATION_LANGUAGES, DICTATION_TEXT_KEYS, dictationText, dictationTip } from '../src/app/ui/voice/dictation-texts.js';
import { createWaveformHistory, openDictation } from '../src/app/ui/voice/dictation.js';
import { openMicLevel } from '../src/app/ui/voice/mic-level.js';

const setup = () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="input-wrapper"><div id="row">the composer</div></div>';
  const host = document.querySelector('.input-wrapper');
  const calls = [];
  const bar = openDictation({
    document,
    window,
    navigator: {},
    host,
    language: 'en',
    onConfirm: () => calls.push('confirm'),
    onCancel: () => calls.push('cancel')
  });
  return { window, document, host, bar, calls };
};

test('dictating covers the composer with a bar: a dimmed plus, the waveform, a cross and a tick', () => {
  const { window, host, bar } = setup();
  try {
    assert.equal(host.classList.contains('is-dictating'), true);
    const root = host.querySelector('.dictation-bar');
    assert.equal(root, bar.element);
    assert.equal(root.getAttribute('role'), 'group');
    assert.equal(root.getAttribute('aria-label'), 'Listening');
    assert.deepEqual([...root.children].map((node) => node.className), ['dictation-plus', 'dictation-wave', 'dictation-cancel', 'dictation-confirm']);
    assert.equal(root.querySelector('.dictation-cancel').getAttribute('aria-label'), 'Cancel voice input');
    assert.equal(root.querySelector('.dictation-confirm').getAttribute('aria-label'), 'Finish and insert the text');
    bar.close();
  } finally {
    window.happyDOM.abort();
  }
});

test('the cross throws it away, the tick finishes it, and the tick becomes a ring while the text is made', () => {
  const { window, document, host, bar, calls } = setup();
  try {
    host.querySelector('.dictation-confirm').click();
    host.querySelector('.dictation-cancel').click();
    assert.deepEqual(calls, ['confirm', 'cancel']);
    bar.setBusy(true);
    const confirm = host.querySelector('.dictation-confirm');
    assert.equal(confirm.classList.contains('is-busy'), true);
    assert.equal(confirm.getAttribute('aria-busy'), 'true');
    assert.equal(confirm.disabled, true, 'nothing more to press while it works');
    assert.equal(host.querySelector('.dictation-cancel').disabled, true);
    assert.equal(host.querySelector('.dictation-bar').getAttribute('aria-label'), 'Turning it into text');
    confirm.click();
    assert.deepEqual(calls, ['confirm', 'cancel'], 'a busy tick does nothing');
    bar.close();
    assert.equal(document.querySelectorAll('.dictation-bar').length, 1, 'still there while it fades');
  } finally {
    window.happyDOM.abort();
  }
});

test('Enter finishes and Escape cancels, ahead of the composer\'s own keys', () => {
  const { window, document, calls, bar } = setup();
  try {
    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.body.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true, 'the message is not sent');
    const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    const shifted = new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(shifted);
    assert.deepEqual(calls, ['confirm', 'cancel']);
    bar.close();
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.deepEqual(calls, ['confirm', 'cancel'], 'after it is closed the keys are the composer\'s again');
  } finally {
    window.happyDOM.abort();
  }
});

test('closing takes the bar away after a short fade, and the composer goes back to itself', async () => {
  const { window, document, host, bar } = setup();
  try {
    bar.close();
    bar.close();
    assert.equal(host.querySelector('.dictation-bar').classList.contains('is-leaving'), true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(document.querySelector('.dictation-bar'), null);
    assert.equal(host.classList.contains('is-dictating'), false);
    assert.equal(openDictation({ document, window, navigator: {}, host: null }), null, 'nothing to cover, nothing done');
  } finally {
    window.happyDOM.abort();
  }
});

test('the waveform keeps the newest bars at the right edge and only as many as fit', () => {
  const history = createWaveformHistory(50);
  assert.deepEqual(history.bars(200), []);
  [0.2, 0.8, 0.4].forEach((level) => history.push(level));
  const bars = history.bars(200);
  assert.equal(bars.length, 3);
  assert.ok(bars[2].x > bars[1].x && bars[1].x > bars[0].x, 'older bars are further left');
  assert.ok(bars[2].x <= 200 - 2, 'the newest touches the right edge');
  for (let index = 0; index < 100; index += 1) history.push(1);
  assert.equal(history.levels.length, 50, 'only what can be drawn is kept');
  assert.equal(history.bars(20).length, 4, 'as many as fit the width, 5px each');
  history.push(Number.NaN);
  history.push(7);
  assert.ok(history.levels.every((level) => level >= 0 && level <= 1), 'readings are kept within 0 and 1');
});

test('the microphone reading is 0 to 1, stops the microphone, and is null where it cannot be had', async () => {
  assert.equal(await openMicLevel({ navigator: {}, window: {} }), null, 'no audio support');
  assert.equal(await openMicLevel({ navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('denied'); } } }, window: { AudioContext: class {} } }), null, 'refused');

  let stopped = 0;
  let closed = 0;
  const track = { stop: () => { stopped += 1; } };
  class FakeAudioContext {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      return { fftSize: 0, getByteTimeDomainData(samples) { samples.fill(160); } };
    }
    close() { closed += 1; return Promise.resolve(); }
  }
  const meter = await openMicLevel({
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } },
    window: { AudioContext: FakeAudioContext }
  });
  const level = meter.read();
  assert.ok(level > 0 && level <= 1, `a steady tone reads ${level}`);
  meter.stop();
  assert.equal(stopped, 1);
  assert.equal(closed, 1);
});

test('voice input has its words in all five languages, and the tip names the key', () => {
  assert.deepEqual([...DICTATION_LANGUAGES], ['zh-TW', 'en', 'fr', 'ru', 'es']);
  for (const language of DICTATION_LANGUAGES) {
    for (const key of DICTATION_TEXT_KEYS) assert.ok(dictationText(language, key).length > 0, `${language} ${key}`);
    assert.match(dictationTip(language), /Ctrl\+Shift\+D$/);
  }
  assert.equal(dictationTip('zh-TW'), '語音輸入  Ctrl+Shift+D');
  assert.notEqual(dictationText('zh-TW', 'cancel'), dictationText('en', 'cancel'));
});

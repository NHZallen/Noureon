import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { DICTATION_LANGUAGES, DICTATION_TEXT_KEYS, dictationText, dictationTip } from '../src/app/ui/voice/dictation-texts.js';
import { createWaveformHistory, isAppleTouchDevice, openDictation } from '../src/app/ui/voice/dictation.js';
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
  assert.ok(bars[2].x <= 200 - 3, 'the newest touches the right edge');
  for (let index = 0; index < 100; index += 1) history.push(1);
  assert.equal(history.levels.length, 50, 'only what can be drawn is kept');
  assert.equal(history.bars(20).length, 3, 'as many as fit the width, 6px each (a bar and its gap)');
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

test('the microphone is opened only where the page is already allowed to, when that is asked for', async () => {
  let asked = 0;
  const fake = (state) => ({
    navigator: { mediaDevices: { getUserMedia: async () => { asked += 1; return { getTracks: () => [] }; } }, permissions: state === 'unsupported' ? undefined : { query: async () => ({ state }) } },
    window: { AudioContext: class { createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 0, getByteTimeDomainData(samples) { samples.fill(128); } }; } close() { return Promise.resolve(); } } }
  });
  for (const state of ['prompt', 'denied', 'unsupported']) {
    assert.equal(await openMicLevel({ ...fake(state), onlyIfAllowed: true }), null, `${state}: not opened`);
  }
  assert.equal(asked, 0, 'the browser was never made to ask');
  const meter = await openMicLevel({ ...fake('granted'), onlyIfAllowed: true });
  assert.ok(meter, 'granted: opened');
  meter.stop();
  assert.equal(asked, 1);
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

// What is drawn: a fake canvas records each bar, frames are run by hand.
const drawnWave = async ({ samples, frames = 60, frameMs = 70, mic = true, start = true, userAgent = '', during = () => {} }) => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="input-wrapper"></div>';
  const rects = [];
  const context = {
    setTransform() {}, clearRect() { rects.length = 0; },
    fillRect(x, y, width, height) { rects.push({ x, y, width, height }); },
    fillStyle: '', globalAlpha: 1
  };
  const original = window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext = () => context;
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 40 });
  const queue = [];
  window.requestAnimationFrame = (callback) => queue.push(callback);
  window.cancelAnimationFrame = () => {};
  class FakeAudioContext {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 0, getByteTimeDomainData(target) { samples(target); } }; }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = FakeAudioContext;
  // mic: true the page may use the microphone ('granted'), 'prompt' the browser would still have to ask the person, false there is no microphone to share.
  let asked = 0;
  const navigator = mic ? {
    userAgent,
    mediaDevices: { getUserMedia: async () => { asked += 1; return { getTracks: () => [] }; } },
    permissions: { query: async () => ({ state: mic === 'prompt' ? 'prompt' : 'granted' }) }
  } : {};
  const bar = openDictation({ document, window, navigator, host: document.querySelector('.input-wrapper'), language: 'en' });
  if (start) bar.started();
  await new Promise((resolve) => setTimeout(resolve, 10));
  let now = 1000;
  for (let index = 0; index < frames; index += 1) {
    now += frameMs;
    during(bar, index);
    const next = queue.splice(0);
    next.forEach((callback) => callback(now));
  }
  const heights = rects.filter((rect) => rect.width === 2).map((rect) => rect.height);
  bar.close();
  window.HTMLCanvasElement.prototype.getContext = original;
  window.happyDOM.abort();
  return { heights, count: heights.length, asked };
};

const wave = (amplitude) => (target) => {
  for (let index = 0; index < target.length; index += 1) target[index] = 128 + Math.round(amplitude * Math.sin(index / 3) * 127);
};

test('ordinary speech fills most of the bar height, and a quiet voice makes smaller bars than a loud one', async () => {
  const loud = await drawnWave({ samples: wave(0.5) });
  assert.ok(loud.count >= 35, `bars keep coming: ${loud.count}`);
  assert.ok(Math.max(...loud.heights) >= 28, `a moderate voice reaches ${Math.max(...loud.heights)}px of the 40px`);
  const quiet = await drawnWave({ samples: wave(0.08) });
  assert.ok(Math.max(...quiet.heights) >= 8, `a quiet voice still shows: ${Math.max(...quiet.heights)}px`);
  assert.ok(Math.max(...quiet.heights) < Math.max(...loud.heights) * 0.7, 'the microphone is not lifted until a quiet voice looks like a loud one');
});

test('the room is a flat line, not bars', async () => {
  const room = await drawnWave({ samples: wave(0.02) });
  assert.equal(room.count, 0, 'ordinary room noise draws no bar');
  const silent = await drawnWave({ samples: wave(0.004) });
  assert.equal(silent.count, 0, 'silence draws no bar');
});

test('nothing is drawn before the recognition has started listening, and nothing asks the person for the microphone', async () => {
  const waiting = await drawnWave({ samples: wave(0.5), start: false, frames: 120 });
  assert.equal(waiting.count, 0, 'no bars while the browser is still asking');
  assert.equal(waiting.asked, 0, 'the page has not asked for the microphone');
});

test('the page does not ask for the microphone a second time: it measures only where it is already allowed', async () => {
  const unsure = await drawnWave({ samples: wave(0.5), mic: 'prompt', frames: 60 });
  assert.equal(unsure.asked, 0, 'no second question beside the one of the recognition');
  const allowed = await drawnWave({ samples: wave(0.5), mic: true, frames: 60 });
  assert.equal(allowed.asked, 1, 'where it is allowed it measures');
});

test('where the sound cannot be measured the bars follow the voice the recognition hears, and a quiet moment is a flat line', async () => {
  const quiet = await drawnWave({ samples: wave(0.5), mic: 'prompt', frames: 60 });
  assert.equal(quiet.count, 0, 'listening, nobody speaks: a flat line');
  const speaking = await drawnWave({ samples: wave(0.5), mic: 'prompt', frames: 60, during: (bar, index) => { if (index === 5) bar.speaking(true); if (index === 40) bar.speaking(false); } });
  assert.ok(speaking.count > 10 && speaking.count < 55, `bars only while a voice is heard: ${speaking.count}`);
  assert.ok(Math.max(...speaking.heights) >= 8, 'they have a body');
  const words = await drawnWave({ samples: wave(0.5), mic: false, frames: 60, during: (bar, index) => { if (index === 5) bar.heard(); } });
  assert.ok(words.count > 5 && words.count < 30, `words coming in make bars for a moment: ${words.count}`);
});

test('the microphone is opened once even though the recognition says start and audiostart together', async () => {
  const once = await drawnWave({ samples: wave(0.5), mic: true, frames: 20, during: (bar, index) => { if (index === 0) { bar.started(); bar.started(); } } });
  assert.equal(once.asked, 1, 'one microphone, not two');
});

test('on an iPhone or an iPad the page does not open the microphone at all, and the bars follow the voice the recognition hears', async () => {
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), true, 'an iPad that says it is a Mac');
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isAppleTouchDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), false);
  const phone = await drawnWave({ samples: wave(0.5), mic: true, frames: 60, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', during: (bar, index) => { if (index === 5) bar.speaking(true); if (index === 40) bar.speaking(false); } });
  assert.equal(phone.asked, 0, 'no getUserMedia on an iPhone');
  assert.ok(phone.count > 10, `the bars come from the voice that is heard: ${phone.count}`);
});

test('a microphone that only reads silence while a voice is heard is let go of, and the voice that is heard is followed (a phone\'s second dictation)', async () => {
  const deaf = await drawnWave({ samples: wave(0), mic: true, frames: 80, during: (bar, index) => { if (index === 3) bar.speaking(true); } });
  assert.equal(deaf.asked, 1, 'it was opened');
  assert.ok(deaf.count > 20, `the bars come anyway: ${deaf.count}`);
  const room = await drawnWave({ samples: wave(0.004), mic: true, frames: 80 });
  assert.equal(room.count, 0, 'a quiet room with no voice heard stays a flat line');
});

test('an audio context that is not running gives no reading', async () => {
  class Suspended {
    constructor() { this.state = 'suspended'; }
    resume() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 0, getByteTimeDomainData() {} }; }
    close() { return Promise.resolve(); }
  }
  let stopped = 0;
  const meter = await openMicLevel({
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) } },
    window: { AudioContext: Suspended }
  });
  assert.equal(meter, null);
  assert.equal(stopped, 1, 'the microphone is released');
});

test('a slow page still gets one bar for every 70 ms that passed', async () => {
  const slow = await drawnWave({ samples: wave(0.5), frames: 12, frameMs: 330 });
  assert.ok(slow.count >= 24, `12 frames of 330 ms made ${slow.count} bars`);
});

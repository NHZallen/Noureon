import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createSpeechSettings } from '../src/app/runtime/settings/settings-speech-section.js';
import { createPageTranscription } from '../src/app/runtime/transcription/page-transcription.js';
import { normalizeSpeech } from '../src/data/speech-settings.js';

// Speech to text in the Models settings, below the API keys: not in the memory, and it does not need the memory to be on.

const TEXTS = { mnSttTitle: 'Speech to text', mnSttOn: 'Turn on', mnSttOff: 'Turn off', mnSttIsBrowser: 'On: Whisper', mnSttIs: 'On: {provider} ({model})', mnSttSizeTitle: 'Size', mnSttSizeDesc: 'd', mnSttSizeSmall: 'small', mnSttSizeBase: 'base', mnSttConsentBrowser: 'consent {model}', mnSttConsentApi: 'consent api', mnSttConsentTitle: 'Turn on?', mnSttConsentOk: 'Agree', mnSttNotReady: 'no', mnSttOffDone: 'off', mnSttProviderTitle: 'How', mnSttProviderDesc: 'x', mnSttDesc: 'desc', mnCancel: 'Cancel', mnConfirm: 'OK' };

test('the card is drawn below the API keys of the Models settings; turning it on asks first, keeps the choice in the config and saves it; the size of Whisper can be chosen', async () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="model-management-section"><div class="pz"><section id="keys">keys</section></div></div>';
  const config = { speechToText: normalizeSpeech() };
  let saved = 0;
  const transcription = createPageTranscription({ getSettings: () => config.speechToText, setSettings: (next) => { config.speechToText = next; }, getApiKeyForProvider: () => '', now: () => '2026-11-02T00:00:00.000Z', logger: { warn() {} } });
  const asked = [];
  const settings = createSpeechSettings({ document, getTranscription: () => transcription, saveConfig: async () => { saved += 1; }, getText: (key) => TEXTS[key], showNotification() {}, showCustomDialog: async (options) => { asked.push(options.message); return true; } });
  settings.mount();
  const host = document.querySelector('#model-management-section .pz');
  assert.deepEqual([...host.children].map((node) => node.id), ['keys', 'speech-settings-card'], 'below the keys');
  const click = (label) => [...document.querySelectorAll('#speech-settings-card button')].find((node) => node.textContent === label).click();
  click('Turn on');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(asked[0], /^consent onnx-community\/whisper-small/, 'no key at all: Whisper, said before it is turned on');
  assert.equal(config.speechToText.enabled, true);
  assert.equal(config.speechToText.provider, 'browser');
  assert.equal(saved, 1, 'the config is saved');
  assert.ok(document.querySelector('#speech-settings-card').textContent.includes('On: Whisper'));
  click('base');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(config.speechToText.whisperSize, 'base');
  assert.equal(saved, 2);
  click('Turn off');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(config.speechToText.enabled, false);
  assert.equal(document.querySelectorAll('#speech-settings-card').length, 1, 'drawn again in place, not twice');
});

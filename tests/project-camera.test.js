import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { cameraAvailable, openCameraDialog } from '../src/app/ui/projects/project-camera.js';

// The camera of a computer for a photo as a source of a project: offered only where the page can open a camera and the screen has a pointer; a camera that cannot be used closes the dialog and says so.

const page = ({ camera, pointer }) => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.matchMedia = (query) => ({ matches: pointer && /pointer: fine/.test(query), media: query });
  if (camera) Object.defineProperty(window.navigator, 'mediaDevices', { value: camera, configurable: true });
  window.document.body.innerHTML = '<div id="root"></div>';
  return window;
};
const text = (key) => key;

test('the camera is offered on a computer with a camera, not on a phone (its own camera opens from the file choice) or without one', () => {
  assert.equal(cameraAvailable(page({ camera: { getUserMedia: async () => ({}) }, pointer: true }).document), true);
  assert.equal(cameraAvailable(page({ camera: { getUserMedia: async () => ({}) }, pointer: false }).document), false);
  assert.equal(cameraAvailable(page({ camera: null, pointer: true }).document), false);
});

test('a camera that cannot be used closes the dialog and says so; one that works is stopped when the dialog is closed', async () => {
  const refused = page({ camera: { getUserMedia: async () => { throw new Error('denied'); } }, pointer: true });
  let failed = 0;
  openCameraDialog({ document: refused.document, root: refused.document.getElementById('root'), text, onCapture() {}, onError: () => { failed += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(failed, 1);
  assert.equal(refused.document.querySelector('.pj-backdrop'), null, 'the dialog is gone');

  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped += 1; } }] };
  const ok = page({ camera: { getUserMedia: async () => stream }, pointer: true });
  // The test page checks that a stream is a real MediaStream; a plain property stands in for it.
  Object.defineProperty(ok.HTMLVideoElement.prototype, 'srcObject', { value: null, writable: true, configurable: true });
  const dialog = openCameraDialog({ document: ok.document, root: ok.document.getElementById('root'), text, onCapture() {} });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ok.document.querySelector('.pj-sheet-foot .pj-primary').disabled, false, 'the button is ready once the camera answers');
  dialog.close();
  assert.equal(stopped, 1, 'the camera is let go');
});

test('a video is recorded with the sound when the microphone is allowed, kept as a file when stopped, and ended before it passes what a source may be', async () => {
  const stops = { video: 0, audio: 0 };
  const videoStream = { getTracks: () => [{ stop: () => { stops.video += 1; } }], getVideoTracks: () => [{ kind: 'video' }] };
  const audioStream = { getTracks: () => [{ stop: () => { stops.audio += 1; } }], getAudioTracks: () => [{ kind: 'audio' }] };
  const asked = [];
  const win = page({ camera: { getUserMedia: async (options) => { asked.push(options); return options.audio ? audioStream : videoStream; } }, pointer: true });
  Object.defineProperty(win.HTMLVideoElement.prototype, 'srcObject', { value: null, writable: true, configurable: true });
  const made = [];
  win.MediaStream = class { constructor(tracks) { this.tracks = tracks; } };
  win.MediaRecorder = class {
    static isTypeSupported(type) { return type === 'video/webm'; }
    constructor(source, options) { this.source = source; this.options = options; this.state = 'inactive'; made.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
    push(size) { this.ondataavailable?.({ data: new win.Blob([new Uint8Array(size)]) }); }
  };
  const captured = [];
  openCameraDialog({ document: win.document, root: win.document.getElementById('root'), text, onCapture: (file) => captured.push(file) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const [shoot, record] = win.document.querySelectorAll('.pj-sheet-foot .pj-button');
  assert.equal(record.textContent, 'pjCameraRecord');
  assert.equal(record.disabled, false);
  assert.deepEqual(asked, [{ video: { facingMode: 'user' }, audio: false }], 'no microphone before a recording is asked for');
  record.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(asked.at(-1), { audio: true });
  assert.equal(made[0].options.mimeType, 'video/webm');
  assert.deepEqual(made[0].source.tracks.map((track) => track.kind), ['video', 'audio']);
  assert.equal(shoot.disabled, true, 'no photo while recording');
  assert.match(record.textContent, /^pjCameraStop 0:00$/);
  made[0].push(1000);
  record.click();
  assert.equal(captured.length, 1);
  assert.match(captured[0].name, /^video-\d{14}\.webm$/);
  assert.equal(captured[0].type, 'video/webm');
  assert.equal(stops.audio, 1, 'the microphone is let go');
  assert.equal(win.document.querySelector('.pj-backdrop'), null, 'the dialog closes');
  // Without the microphone the video is silent; a recording that reaches the size of a source ends by itself.
  const quiet = page({ camera: { getUserMedia: async (options) => { if (options.audio) throw new Error('denied'); return videoStream; } }, pointer: true });
  Object.defineProperty(quiet.HTMLVideoElement.prototype, 'srcObject', { value: null, writable: true, configurable: true });
  const recorders = [];
  quiet.MediaStream = win.MediaStream;
  quiet.MediaRecorder = class extends win.MediaRecorder { constructor(...args) { super(...args); recorders.push(this); } };
  const files = [];
  openCameraDialog({ document: quiet.document, root: quiet.document.getElementById('root'), text, onCapture: (file) => files.push(file) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  quiet.document.querySelectorAll('.pj-sheet-foot .pj-button')[1].click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(recorders[0].source.tracks.map((track) => track.kind), ['video']);
  recorders[0].push(31 * 1024 * 1024);
  assert.equal(files.length, 1, 'ended by itself at the size a source may be');
});

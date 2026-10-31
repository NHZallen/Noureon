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

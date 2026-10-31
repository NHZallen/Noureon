// Taking a photo with the camera of a computer (docs/superpowers/specs/2026-10-31-projects-design.md): a small dialog with what the camera sees and a button that keeps one picture as a file.
// A phone does not need it (its own camera opens from the file choice). Page only: it uses the camera and a canvas.

import { make, openSheet } from './project-parts.js';

/** Whether this page can open the camera of a computer by itself (a screen with a pointer and a browser that gives the camera). */
export const cameraAvailable = (document) => {
  const win = document.defaultView;
  return Boolean(win?.navigator?.mediaDevices?.getUserMedia) && win.matchMedia?.('(pointer: fine)')?.matches === true;
};

/** Opens the dialog. `onCapture(file)` is given the picture as a JPEG file; `onError()` when the camera cannot be used. Returns { close }. */
export function openCameraDialog({ document, root, text, onCapture, onError = () => {} }) {
  const win = document.defaultView;
  let stream = null;
  let closed = false;
  const video = make(document, 'video', 'pj-camera-video');
  video.autoplay = true;
  video.muted = true;
  video.setAttribute('playsinline', '');
  const foot = make(document, 'div', 'pj-sheet-foot');
  const shoot = make(document, 'button', 'pj-button pj-primary', text('pjCameraCapture'));
  shoot.type = 'button';
  shoot.disabled = true;
  foot.appendChild(shoot);
  const sheet = openSheet({ document, root, title: text('pjCameraTitle'), close: text('pjCancel'), footer: foot, body: (body) => body.appendChild(video), onClose: () => stop() });
  function stop() {
    closed = true;
    for (const track of stream?.getTracks?.() || []) track.stop();
    stream = null;
  }
  win.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((opened) => {
    if (closed) { for (const track of opened.getTracks()) track.stop(); return; }
    stream = opened;
    video.srcObject = opened;
    shoot.disabled = false;
  }).catch(() => { sheet.close(); onError(); });
  shoot.addEventListener('click', () => {
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      sheet.close();
      onCapture(new win.File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
  return { close: sheet.close };
}

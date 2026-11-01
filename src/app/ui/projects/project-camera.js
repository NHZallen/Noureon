// Taking a photo or recording a video with the camera of a computer (docs/superpowers/specs/2026-10-31-projects-design.md): a small dialog with what the camera sees, a button that keeps one picture
// as a file and one that records a video (with the sound when the microphone is allowed). A phone does not need it (its own camera opens from the file choice). Page only: it uses the camera,
// the microphone, a canvas and MediaRecorder.

import { PROJECT_SOURCE_FILE_BYTES_MAX } from '../../runtime/projects/project-source-model.js';
import { make, openSheet } from './project-parts.js';

// The kinds of video this browser can record, best first (Chrome and Firefox make WebM, Safari MP4).
const RECORD_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const recordTypeOf = (win) => (typeof win.MediaRecorder === 'function' ? RECORD_TYPES.find((type) => win.MediaRecorder.isTypeSupported?.(type)) || '' : '');
const pad = (number) => String(number).padStart(2, '0');

/** Whether this page can open the camera of a computer by itself (a screen with a pointer and a browser that gives the camera). */
export const cameraAvailable = (document) => {
  const win = document.defaultView;
  return Boolean(win?.navigator?.mediaDevices?.getUserMedia) && win.matchMedia?.('(pointer: fine)')?.matches === true;
};

/** Opens the dialog. `onCapture(file)` is given the picture as a JPEG file, or the video as a WebM or MP4 file (never more than a source may be); `onError()` when the camera cannot be used. Returns { close }. */
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
  const recordType = recordTypeOf(win);
  const record = recordType ? make(document, 'button', 'pj-button', text('pjCameraRecord')) : null;
  if (record) {
    record.type = 'button';
    record.disabled = true;
    foot.appendChild(record);
  }
  let recorder = null;
  const sheet = openSheet({ document, root, title: text('pjCameraTitle'), close: text('pjCancel'), footer: foot, body: (body) => body.appendChild(video), onClose: () => stop() });
  function stop() {
    closed = true;
    if (recorder?.state === 'recording') { recorder.onstop = null; try { recorder.stop(); } catch { /* Already stopped. */ } }
    recorder = null;
    for (const track of stream?.getTracks?.() || []) track.stop();
    stream = null;
  }
  win.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then((opened) => {
    if (closed) { for (const track of opened.getTracks()) track.stop(); return; }
    stream = opened;
    video.srcObject = opened;
    shoot.disabled = false;
    if (record) record.disabled = false;
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
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      sheet.close();
      onCapture(new win.File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
  record?.addEventListener('click', async () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (!stream) return;
    // The sound is asked for only now: taking a photo needs no microphone. Without it the video is recorded silent.
    let sound = null;
    try { sound = await win.navigator.mediaDevices.getUserMedia({ audio: true }); } catch { sound = null; }
    if (closed) { for (const track of sound?.getTracks?.() || []) track.stop(); return; }
    const chunks = [];
    let bytes = 0;
    const source = new win.MediaStream([...stream.getVideoTracks(), ...(sound ? sound.getAudioTracks() : [])]);
    const made = new win.MediaRecorder(source, { mimeType: recordType });
    recorder = made;
    made.ondataavailable = (event) => {
      if (!event.data?.size) return;
      chunks.push(event.data);
      bytes += event.data.size;
      // A file a project keeps is at most so big: the recording ends before it passes that.
      if (bytes >= PROJECT_SOURCE_FILE_BYTES_MAX * 0.95 && made.state === 'recording') made.stop();
    };
    const began = Date.now();
    const tick = win.setInterval(() => { const seconds = Math.floor((Date.now() - began) / 1000); record.textContent = `${text('pjCameraStop')} ${Math.floor(seconds / 60)}:${pad(seconds % 60)}`; }, 500);
    made.onstop = () => {
      win.clearInterval(tick);
      for (const track of sound?.getTracks?.() || []) track.stop();
      recorder = null;
      if (closed || !chunks.length) return;
      const type = recordType.split(';')[0];
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      sheet.close();
      onCapture(new win.File(chunks, `video-${stamp}.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }));
    };
    shoot.disabled = true;
    record.textContent = `${text('pjCameraStop')} 0:00`;
    made.start(1000);
  });
  return { close: sheet.close };
}


import assert from 'node:assert/strict';
import test from 'node:test';

import { createQrScannerClass } from '../src/app/vendors/qr-scanner.js';

function harness({ detector = null, decoder = null, cameraError = null, loadDecoder = null } = {}) {
  const log = [];
  const timers = [];
  const node = (tag) => {
    const classes = new Set();
    return {
      tag, style: {}, attributes: {}, children: [], className: '', parent: null,
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
    };
  };
  const reader = node('div');
  const document = {
    getElementById: (id) => (id === 'p2p-reader' ? reader : null),
    createElement: (tag) => {
      const element = node(tag);
      if (tag === 'video') {
        element.videoWidth = 1280;
        element.videoHeight = 720;
        element.play = async () => log.push('play');
      }
      if (tag === 'canvas') {
        element.getContext = () => ({
          drawImage: (_video, x, y, width, height) => log.push(['draw', width, height]),
          getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) })
        });
      }
      return element;
    }
  };
  const track = { stop: () => log.push('track-stop') };
  const navigator = {
    mediaDevices: {
      getUserMedia: async (constraints) => {
        log.push(['camera', constraints]);
        if (cameraError) throw cameraError;
        return { getTracks: () => [track] };
      }
    }
  };
  const Scanner = createQrScannerClass({
    getDocument: () => document,
    getNavigator: () => navigator,
    getBarcodeDetector: () => detector,
    loadDecoder: loadDecoder || (async () => { log.push('load-decoder'); return decoder; }),
    schedule: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    cancel: (timer) => log.push(['cancel', timer])
  });
  const runNext = async () => { const timer = timers.shift(); await timer.callback(); return timer; };
  return { Scanner, reader, log, timers, runNext };
}

test('the browser reads the code where it can, and the found text is handed on until the scanner stops', async () => {
  class FakeDetector {
    static getSupportedFormats = async () => ['qr_code', 'ean_13'];
    constructor(options) { this.options = options; FakeDetector.made = options; }
    async detect() { return [{ rawValue: 'p2p-ABCD1234' }]; }
  }
  const h = harness({ detector: FakeDetector });
  const scanner = new h.Scanner('p2p-reader');
  const found = [];
  await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, (text) => found.push(text));

  assert.deepEqual(h.log[0], ['camera', { video: { facingMode: 'environment' }, audio: false }]);
  assert.deepEqual(FakeDetector.made, { formats: ['qr_code'] });
  assert.ok(!h.log.includes('load-decoder'), 'jsQR is not loaded when the browser reads QR codes');
  assert.equal(h.reader.classList.contains('qr-scan'), true);
  const [video, box] = h.reader.children;
  assert.equal(video.className, 'qr-scan-video');
  assert.equal(video.attributes.playsinline, '');
  assert.equal(box.className, 'qr-scan-box');
  assert.equal(box.style.width, '250px');
  assert.equal(h.timers[0].ms, 100);

  await h.runNext();
  assert.deepEqual(found, ['p2p-ABCD1234']);
  assert.equal(h.timers.length, 1, 'it keeps reading until it is stopped');

  await scanner.stop();
  assert.ok(h.log.includes('track-stop'));
  assert.equal(h.reader.children.length, 0);
  assert.equal(h.reader.classList.contains('qr-scan'), false);
  await h.runNext();
  assert.deepEqual(found, ['p2p-ABCD1234'], 'a frame read after stop hands nothing on');
});

test('without the browser reader, jsQR reads a smaller copy of the frame', async () => {
  const calls = [];
  const decoder = (data, width, height, options) => { calls.push([data.length, width, height, options]); return calls.length > 1 ? { data: 'CODE5678' } : null; };
  const h = harness({ decoder });
  const scanner = new h.Scanner('p2p-reader');
  const found = [];
  await scanner.start({ facingMode: 'environment' }, { fps: 5 }, (text) => found.push(text));

  assert.ok(h.log.includes('load-decoder'));
  assert.equal(h.timers[0].ms, 200);
  await h.runNext();
  assert.deepEqual(found, []);
  await h.runNext();
  assert.deepEqual(found, ['CODE5678']);
  assert.deepEqual(calls[0].slice(1), [720, 405, { inversionAttempts: 'dontInvert' }]);
  assert.deepEqual(h.log.find((entry) => entry[0] === 'draw'), ['draw', 720, 405]);
  await scanner.stop();
});

test('a browser reader without QR codes falls back to jsQR', async () => {
  class NoQrDetector {
    static getSupportedFormats = async () => ['ean_13'];
    constructor() { throw new Error('should not be made'); }
  }
  const h = harness({ detector: NoQrDetector, decoder: () => null });
  const scanner = new h.Scanner('p2p-reader');
  await scanner.start({ facingMode: 'environment' }, {}, () => {});
  assert.ok(h.log.includes('load-decoder'));
  await scanner.stop();
});

test('a refused camera rejects start and leaves nothing behind', async () => {
  const h = harness({ cameraError: new Error('NotAllowedError') });
  const scanner = new h.Scanner('p2p-reader');
  await assert.rejects(scanner.start({ facingMode: 'environment' }, {}, () => {}), /NotAllowedError/);
  assert.equal(h.reader.children.length, 0);
  assert.equal(h.reader.classList.contains('qr-scan'), false);
  assert.equal(h.timers.length, 0);
  await scanner.stop();
});

test('stopping while the camera starts rejects start and lets the camera go', async () => {
  const h = harness({ decoder: () => null });
  const scanner = new h.Scanner('p2p-reader');
  const starting = scanner.start({ facingMode: 'environment' }, {}, () => {});
  await scanner.stop();
  await assert.rejects(starting, /stopped/);
  assert.ok(h.log.includes('track-stop'));
  assert.equal(h.reader.children.length, 0);
});

test('stopping while the reader loads schedules no reading', async () => {
  let release;
  const h = harness({ loadDecoder: () => new Promise((resolve) => { release = resolve; }) });
  const scanner = new h.Scanner('p2p-reader');
  const starting = scanner.start({ facingMode: 'environment' }, {}, () => {});
  await new Promise((resolve) => setImmediate(resolve));
  await scanner.stop();
  release(() => null);
  await assert.rejects(starting, /stopped/);
  assert.equal(h.timers.length, 0);
  assert.equal(h.reader.children.length, 0);
});

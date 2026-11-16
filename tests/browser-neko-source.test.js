// The real live source (src/app/ui/browser-live/neko-source.js) against a fake WebSocket and a fake peer connection, with the messages measured on the real host.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createNekoSource } from '../src/app/ui/browser-live/neko-source.js';

const TOKEN_PATH = `/s/${'a'.repeat(32)}/api/ws`;
const viewer = { token: 'tok en', host: 'live.example.com', wsPath: TOKEN_PATH };

function world(options = {}) {
  const window = new Window();
  // happy-dom only takes a real MediaStream as srcObject; the fake stream is kept as a plain property.
  const create = window.document.createElement.bind(window.document);
  window.document.createElement = (name) => { const el = create(name); if (name === 'video') Object.defineProperty(el, 'srcObject', { value: null, writable: true }); return el; };
  const sockets = [];
  const peers = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; this.closed = true; }
    emit(event, payload) { this.onmessage({ data: JSON.stringify({ event, payload }) }); }
  }
  class FakePeer {
    constructor(config) { this.config = config; this.added = []; peers.push(this); }
    async setRemoteDescription(description) { this.remoteDescription = description; }
    async addIceCandidate(candidate) { this.added.push(candidate); }
    async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' }; }
    async setLocalDescription(description) { this.local = description; }
    close() { this.closedPeer = true; }
  }
  class FakeStream { constructor(tracks) { this.tracks = tracks; } }
  const states = [];
  const source = createNekoSource({ viewer, document: window.document, WebSocketImpl: FakeSocket, RTCImpl: FakePeer, MediaStreamImpl: FakeStream, onState: (s) => states.push(s), ...options });
  const socket = sockets[0];
  const sent = () => socket.sent.map((m) => m.event);
  return { window, source, socket, peers, states, sent, FakeStream };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('only the address the host hands out is accepted, and the token is carried as a query', () => {
  const w = world();
  assert.equal(w.socket.url, `wss://live.example.com${TOKEN_PATH}?token=tok%20en`);
  assert.throws(() => createNekoSource({ viewer: { token: 't', host: 'evil.com/x', wsPath: TOKEN_PATH }, document: w.window.document, WebSocketImpl: class {} }), /not valid/);
  assert.throws(() => createNekoSource({ viewer: { token: 't', host: 'live.example.com', wsPath: '/api/ws' }, document: w.window.document, WebSocketImpl: class {} }), /not valid/);
});

test('signalling: init -> request the chosen quality; provide -> answer; candidates both ways; the stream goes to every video', async () => {
  const w = world({ quality: 'lq' });
  w.socket.emit('system/init', { screen_size: { width: 1280, height: 720 } });
  assert.deepEqual(w.socket.sent[0], { event: 'signal/request', payload: { video: { selector: { id: 'lq', type: 'exact' } }, audio: { disabled: true } } });
  assert.deepEqual(w.source.screen, { w: 1280, h: 720 });
  w.socket.emit('signal/candidate', { candidate: 'early' }); // before the offer
  w.socket.emit('signal/provide', { sdp: 'offer-sdp', iceservers: [{ urls: 'stun:x' }] });
  await settle();
  const peer = w.peers[0];
  assert.equal(peer.remoteDescription.sdp, 'offer-sdp'); assert.deepEqual(peer.config.iceServers, [{ urls: 'stun:x' }]);
  assert.deepEqual(peer.added, [{ candidate: 'early' }]);
  assert.deepEqual(w.socket.sent.at(-1), { event: 'signal/answer', payload: { sdp: 'answer-sdp' } });
  peer.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'mine' }) } });
  assert.deepEqual(w.socket.sent.at(-1), { event: 'signal/candidate', payload: { candidate: 'mine' } });
  const card = w.window.document.createElement('div'); const lens = w.window.document.createElement('div');
  w.source.mount(card); w.source.mountLens(lens);
  const stream = new w.FakeStream([]);
  peer.ontrack({ streams: [stream], track: {} });
  assert.equal(w.states.at(-1), 'live');
  assert.equal(card.querySelector('video').srcObject, stream); assert.equal(lens.querySelector('video').srcObject, stream);
  const late = w.window.document.createElement('div'); w.source.mount(late);
  assert.equal(late.querySelector('video').srcObject, stream);
  w.source.setQuality('hq');
  assert.deepEqual(w.socket.sent.at(-1), { event: 'signal/video', payload: { selector: { id: 'hq', type: 'exact' } } });
  w.socket.emit('screen/updated', { width: 768, height: 1024 });
  assert.deepEqual(w.source.screen, { w: 768, h: 1024 });
});

test('pointer: pixels of the virtual screen, clamped; down and up are the left button', () => {
  const w = world({ size: { w: 1024, h: 768 } });
  w.source.input.pointer(0.5, 0.5, 'move');
  w.source.input.pointer(1, 1, 'down');
  w.source.input.pointer(-3, 2, 'up');
  assert.deepEqual(w.socket.sent, [
    { event: 'control/move', payload: { x: 512, y: 384 } },
    { event: 'control/move', payload: { x: 1023, y: 767 } }, { event: 'control/buttondown', payload: { code: 1, x: 1023, y: 767 } },
    { event: 'control/move', payload: { x: 0, y: 767 } }, { event: 'control/buttonup', payload: { code: 1, x: 0, y: 767 } }
  ]);
});

test('wheel: down is negative for neko, one notch is 120, small amounts add up', () => {
  const w = world();
  w.source.input.wheel(0, 50, 0.5, 0.5);
  assert.equal(w.socket.sent.filter((m) => m.event === 'control/scroll').length, 0);
  w.source.input.wheel(0, 80, 0.5, 0.5); // 130 in all: one notch, 10 left
  assert.deepEqual(w.socket.sent.filter((m) => m.event === 'control/scroll').map((m) => m.payload), [{ delta_x: 0, delta_y: -1, control_key: false }]);
  w.source.input.wheel(0, -250, 0.5, 0.5); // the 10 left over and -250 make two notches up
  assert.equal(w.socket.sent.filter((m) => m.event === 'control/scroll').at(-1).payload.delta_y, 2);
});

test('keys: characters are pasted, named keys and shortcuts are keysyms, text is pasted whole', () => {
  const w = world();
  const { input } = w.source;
  input.key('A', true); input.key('A', false); input.key('中', true);
  input.key('Enter', true); input.key('Enter', false); input.key('ArrowLeft', true);
  input.key('Control', true); input.key('a', true); input.key('a', false); input.key('Control', false); input.key('b', true);
  input.key('Unidentified', true);
  input.text('你好 world'); input.text('');
  assert.deepEqual(w.socket.sent.map((m) => [m.event, m.payload.text ?? m.payload.keysym]), [
    ['control/paste', 'A'], ['control/paste', '中'],
    ['control/keydown', 0xff0d], ['control/keyup', 0xff0d], ['control/keydown', 0xff51],
    ['control/keydown', 0xffe3], ['control/keydown', 97], ['control/keyup', 97], ['control/keyup', 0xffe3],
    ['control/paste', 'b'],
    ['control/paste', '你好 world']
  ]);
});

test('closing: the connection ending is told once, and destroy lets everything go', () => {
  const w = world();
  const holder = w.window.document.createElement('div');
  w.source.mount(holder);
  w.socket.emit('system/disconnect', {});
  w.socket.onclose();
  assert.deepEqual(w.states, ['closed']);
  w.source.destroy();
  assert.equal(w.socket.closed, true); assert.equal(holder.querySelector('video'), null);
});

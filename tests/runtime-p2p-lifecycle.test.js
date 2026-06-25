import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyP2PLifecycle } from '../src/app/runtime/features/p2p-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

function createClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
    toArray: () => Array.from(classes)
  };
}

function createElement(id = '') {
  let html = '';
  const element = {
    id,
    className: '',
    classList: createClassList(),
    children: [],
    dataset: {},
    disabled: false,
    style: {},
    textContent: '',
    value: '',
    appendChild(child) {
      this.children.push(child);
    },
    focus() {
      this.focused = true;
    }
  };
  Object.defineProperty(element, 'innerHTML', {
    get() {
      return html;
    },
    set(value) {
      html = value;
      this.children = [];
    }
  });
  return element;
}

function createConnection(calls) {
  return {
    handlers: {},
    sent: [],
    on(event, handler) {
      this.handlers[event] = handler;
    },
    send(payload) {
      this.sent.push(payload);
      calls.push(['send', payload.type]);
    },
    emit(event, payload) {
      return this.handlers[event]?.(payload);
    },
    close() {
      calls.push(['connectionClose']);
    }
  };
}

function createHarness({
  astras = [],
  folders = [],
  conversations = [],
  selectedCheckboxes = []
} = {}) {
  const calls = [];
  const elementIds = [
    'p2p-modal-title',
    'p2p-share-modal',
    'p2p-step-role',
    'p2p-step-select',
    'p2p-step-wait',
    'p2p-step-connect',
    'p2p-step-progress',
    'p2p-reader',
    'p2p-item-list',
    'p2p-confirm-selection-btn',
    'p2p-share-code',
    'p2p-qrcode-container',
    'p2p-code-input',
    'p2p-progress-bar',
    'p2p-progress-text'
  ];
  const elements = new Map(elementIds.map((id) => [id, createElement(id)]));
  const document = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    createElement: (tagName) => createElement(tagName),
    querySelectorAll: (selector) => {
      if (selector === '.p2p-item-checkbox:checked') return selectedCheckboxes;
      return [];
    }
  };

  class FakePeer {
    constructor(id) {
      this.id = id;
      this.handlers = {};
      this.destroyed = false;
      calls.push(['peer', id]);
      FakePeer.instances.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    emit(event, payload) {
      return this.handlers[event]?.(payload);
    }

    connect(peerId) {
      calls.push(['connect', peerId]);
      this.connectedPeerId = peerId;
      this.connection = createConnection(calls);
      return this.connection;
    }

    destroy() {
      this.destroyed = true;
      calls.push(['destroyPeer', this.id]);
    }
  }
  FakePeer.instances = [];

  function FakeQRCode(container, options) {
    calls.push(['qr', container.id, options.text, options.width, options.height]);
  }

  class FakeHtml5Qrcode {
    constructor(elementId) {
      this.elementId = elementId;
      FakeHtml5Qrcode.instances.push(this);
    }

    start() {
      calls.push(['scannerStart', this.elementId]);
      return Promise.resolve();
    }

    stop() {
      calls.push(['scannerStop', this.elementId]);
      return Promise.resolve();
    }
  }
  FakeHtml5Qrcode.instances = [];

  class FakeBlob {
    constructor(parts) {
      this.parts = parts;
      calls.push(['blob', parts.length]);
    }
  }

  class FakeJSZip {
    constructor() {
      this.files = [];
      FakeJSZip.instances.push(this);
    }

    file(name, content) {
      this.files.push([name, content]);
      calls.push(['zipFile', name]);
      return this;
    }

    async generateAsync(options) {
      calls.push(['zipGenerate', options.type]);
      return {
        async arrayBuffer() {
          return Uint8Array.from([1, 2, 3, 4]).buffer;
        }
      };
    }

    static async loadAsync(blob) {
      calls.push(['zipLoad', blob.parts.length]);
      return {
        files: {
          'astra_incoming.json': {}
        },
        file: () => ({
          async async() {
            return JSON.stringify({ id: 'incoming', name: 'Incoming Astra' });
          }
        })
      };
    }
  }
  FakeJSZip.instances = [];

  const lifecycle = createLegacyP2PLifecycle({
    document,
    getElementById: (id) => document.getElementById(id),
    Peer: FakePeer,
    QRCode: FakeQRCode,
    Html5Qrcode: FakeHtml5Qrcode,
    JSZip: FakeJSZip,
    BlobCtor: FakeBlob,
    getAstras: () => astras,
    getFolders: () => folders,
    getConversations: () => conversations,
    getDefaultFolder: () => ({ id: 'default', name: 'Default' }),
    saveAppData: async () => calls.push(['saveAppData']),
    renderAll: () => calls.push(['renderAll']),
    showNotification: (message, type) => calls.push(['notification', type, message]),
    toggleModal: (element, open) => calls.push(['toggleModal', element.id, open]),
    escapeHTML: (value) => `escaped:${value}`,
    randomUUID: () => 'uuid-1',
    random: () => 0,
    scheduleTimeout: (callback) => {
      callback();
      return 1;
    },
    logger: {
      log: (...args) => calls.push(['log', ...args]),
      error: (...args) => calls.push(['error', ...args]),
      warn: (...args) => calls.push(['warn', ...args])
    }
  });

  return {
    astras,
    calls,
    document,
    elements,
    FakeHtml5Qrcode,
    FakeJSZip,
    FakePeer,
    lifecycle
  };
}

test('createLegacyP2PLifecycle exposes the legacy P2P handler surface', () => {
  const { lifecycle } = createHarness();

  for (const handlerName of [
    'initP2P',
    'resetP2PUI',
    'setP2PMode',
    'showP2PSelection',
    'startP2PReceiverUI',
    'startP2PSender',
    'connectToSender',
    'startQRScanner',
    'processReceivedData',
    'updateP2PProgress'
  ]) {
    assert.equal(typeof lifecycle[handlerName], 'function');
  }
});

test('selection rendering uses live data getters and filters official Astras', () => {
  const { elements, lifecycle } = createHarness({
    astras: [
      { id: 'custom-astra', name: 'Custom Astra' },
      { id: 'official-astra', name: 'Official Astra', officialId: 'official' }
    ],
    folders: [{ id: 'folder-1', name: 'Folder One' }]
  });

  lifecycle.initP2P('astras');
  lifecycle.showP2PSelection();

  const list = elements.get('p2p-item-list');
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /escaped:custom-astra/);
  assert.match(list.children[0].innerHTML, /escaped:Custom Astra/);
  assert.doesNotMatch(list.children[0].innerHTML, /official-astra/);
  assert.equal(elements.get('p2p-confirm-selection-btn').disabled, false);

  lifecycle.initP2P('folders');
  lifecycle.showP2PSelection();

  assert.equal(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /escaped:folder-1/);
  assert.match(list.children[0].innerHTML, /escaped:Folder One/);
});

test('sender creates code, QR, Peer, payload metadata, chunks, and end marker in order', async () => {
  const { calls, FakeJSZip, FakePeer, lifecycle, elements } = createHarness({
    astras: [{ id: 'astra-1', name: 'Astra One' }],
    selectedCheckboxes: [{ value: 'astra-1' }]
  });

  lifecycle.initP2P('astras');
  await lifecycle.startP2PSender();

  assert.equal(elements.get('p2p-share-code').textContent, 'AAAAA');
  assert.deepEqual(calls.find((call) => call[0] === 'qr'), ['qr', 'p2p-qrcode-container', 'AAAAA', 180, 180]);
  assert.equal(FakePeer.instances[0].id, 'astra-p2p-AAAAA');

  const connection = createConnection(calls);
  FakePeer.instances[0].emit('connection', connection);
  await new Promise((resolve) => setTimeout(resolve, 0));

  connection.emit('open');

  assert.deepEqual(FakeJSZip.instances[0].files.map(([name]) => name), ['astra_astra-1.json']);
  assert.deepEqual(connection.sent.map((payload) => payload.type), ['meta', 'chunk', 'end']);
  assert.equal(connection.sent[0].dataType, 'astras');
});

test('receiver connects through Peer, processes received chunks, and warns on partial close', async () => {
  const harness = createHarness();
  const { astras, calls, FakePeer, lifecycle } = harness;

  lifecycle.connectToSender('abcde');
  FakePeer.instances[0].emit('open');

  const connection = FakePeer.instances[0].connection;
  assert.equal(FakePeer.instances[0].connectedPeerId, 'astra-p2p-ABCDE');

  connection.emit('open');
  await connection.emit('data', { type: 'meta', size: 4, dataType: 'astras' });
  await connection.emit('data', { type: 'chunk', data: Uint8Array.from([1, 2]).buffer });
  connection.emit('close');

  assert.equal(calls.some((call) => call[0] === 'notification' && call[1] === 'error'), true);

  await connection.emit('data', { type: 'chunk', data: Uint8Array.from([3, 4]).buffer });
  await connection.emit('data', { type: 'end' });

  assert.equal(calls.some((call) => call[0] === 'zipLoad'), true);
  assert.equal(calls.some((call) => call[0] === 'saveAppData'), true);
  assert.equal(calls.some((call) => call[0] === 'renderAll'), true);
  assert.equal(astras[0].id, 'incoming');
});

test('reset tears down peer and delegates scanner stop to the composed scanner lifecycle', async () => {
  const { calls, FakePeer, lifecycle } = createHarness({
    selectedCheckboxes: [{ value: 'folder-1' }],
    folders: [{ id: 'folder-1', name: 'Folder One' }]
  });

  lifecycle.initP2P('folders');
  await lifecycle.startQRScanner();
  await lifecycle.startP2PSender();

  assert.equal(FakePeer.instances.length, 1);
  lifecycle.resetP2PUI();

  assert.equal(FakePeer.instances[0].destroyed, true);
  assert.equal(calls.some((call) => call[0] === 'scannerStop'), true);
});

test('p2p lifecycle module stays out of storage, auth, startup, runtime-app, and fragment ownership', () => {
  const source = readSource('src/app/runtime/features/p2p-lifecycle.js');

  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/);
  assert.doesNotMatch(source, /storage-adapter|indexedDB|localStorage|sessionStorage|getItem|setItem|removeItem/);
  assert.doesNotMatch(source, /currentUser|initializeApp|initChatApp/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAppBootstrapComposition } from '../src/app/legacy-runtime/features/app-bootstrap-composition.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createButton = (id, events) => ({
  id,
  addEventListener(type, handler) {
    events.push(`${id}:${type}`);
    this.handler = handler;
  }
});

test('runs late bootstrap callbacks and binds P2P controls in legacy order', () => {
  const calls = [];
  const events = [];
  const buttons = new Map([
    ['share-astras-btn', createButton('share-astras-btn', events)],
    ['share-folders-btn', createButton('share-folders-btn', events)],
    ['close-p2p-modal-btn', createButton('close-p2p-modal-btn', events)],
    ['p2p-role-sender', createButton('p2p-role-sender', events)],
    ['p2p-role-receiver', createButton('p2p-role-receiver', events)],
    ['p2p-confirm-selection-btn', createButton('p2p-confirm-selection-btn', events)],
    ['p2p-connect-btn', createButton('p2p-connect-btn', events)],
    ['p2p-start-scan-btn', createButton('p2p-start-scan-btn', events)]
  ]);
  const allElements = {};

  const composition = createAppBootstrapComposition({
    allElements,
    getElementById: (id) => buttons.get(id),
    setupHistorySidebarInteractions: () => calls.push('history-interactions'),
    setupHistorySidebarTriggers: () => calls.push('history-triggers'),
    initP2P: (type) => calls.push(`initP2P:${type}`),
    toggleP2PModal: () => calls.push('close-modal'),
    resetP2PUI: () => calls.push('reset-ui'),
    setP2PMode: (mode) => calls.push(`mode:${mode}`),
    showP2PSelection: () => calls.push('show-selection'),
    startP2PReceiverUI: () => calls.push('receiver-ui'),
    startP2PSender: () => calls.push('sender'),
    getP2PCodeInputValue: () => 'ABCDE',
    showNotification: (...args) => calls.push(`notify:${args.join(':')}`),
    connectToSender: (code) => calls.push(`connect:${code}`),
    startQRScanner: () => calls.push('scan')
  });

  composition.runLateBootstrapBindings();

  assert.deepEqual(calls, ['history-interactions', 'history-triggers']);
  assert.deepEqual(events, [
    'share-astras-btn:click',
    'share-folders-btn:click',
    'close-p2p-modal-btn:click',
    'p2p-role-sender:click',
    'p2p-role-receiver:click',
    'p2p-confirm-selection-btn:click',
    'p2p-connect-btn:click',
    'p2p-start-scan-btn:click'
  ]);
  assert.equal(allElements.shareAstrasBtn, buttons.get('share-astras-btn'));
  assert.equal(allElements.shareFoldersBtn, buttons.get('share-folders-btn'));
});

test('P2P click handlers preserve injected handoffs without scanner implementation ownership', () => {
  const calls = [];
  const events = [];
  const buttons = new Map([
    ['share-astras-btn', createButton('share-astras-btn', events)],
    ['share-folders-btn', createButton('share-folders-btn', events)],
    ['close-p2p-modal-btn', createButton('close-p2p-modal-btn', events)],
    ['p2p-role-sender', createButton('p2p-role-sender', events)],
    ['p2p-role-receiver', createButton('p2p-role-receiver', events)],
    ['p2p-confirm-selection-btn', createButton('p2p-confirm-selection-btn', events)],
    ['p2p-connect-btn', createButton('p2p-connect-btn', events)],
    ['p2p-start-scan-btn', createButton('p2p-start-scan-btn', events)]
  ]);

  createAppBootstrapComposition({
    allElements: {},
    getElementById: (id) => buttons.get(id),
    setupHistorySidebarInteractions: () => {},
    setupHistorySidebarTriggers: () => {},
    initP2P: (type) => calls.push(`init:${type}`),
    toggleP2PModal: () => calls.push('toggle'),
    resetP2PUI: () => calls.push('reset'),
    setP2PMode: (mode) => calls.push(`mode:${mode}`),
    showP2PSelection: () => calls.push('selection'),
    startP2PReceiverUI: () => calls.push('receiver'),
    startP2PSender: () => calls.push('sender'),
    getP2PCodeInputValue: () => 'abcde',
    showNotification: (...args) => calls.push(`notify:${args.join(':')}`),
    connectToSender: (code) => calls.push(`connect:${code}`),
    startQRScanner: () => calls.push('scan')
  }).runLateBootstrapBindings();

  buttons.get('share-astras-btn').handler({ stopPropagation: () => calls.push('stop') });
  buttons.get('share-folders-btn').handler({ stopPropagation: () => calls.push('stop') });
  buttons.get('p2p-role-sender').handler();
  buttons.get('p2p-role-receiver').handler();
  buttons.get('p2p-confirm-selection-btn').handler();
  buttons.get('p2p-connect-btn').handler();
  buttons.get('p2p-start-scan-btn').handler();

  assert.deepEqual(calls, [
    'stop',
    'init:astras',
    'stop',
    'init:folders',
    'mode:sender',
    'selection',
    'mode:receiver',
    'receiver',
    'sender',
    'connect:abcde',
    'scan'
  ]);
});

test('P2P scan handoff resolves the scanner callback only when the button is clicked', () => {
  const events = [];
  const buttons = new Map([
    ['share-astras-btn', createButton('share-astras-btn', events)],
    ['share-folders-btn', createButton('share-folders-btn', events)],
    ['close-p2p-modal-btn', createButton('close-p2p-modal-btn', events)],
    ['p2p-role-sender', createButton('p2p-role-sender', events)],
    ['p2p-role-receiver', createButton('p2p-role-receiver', events)],
    ['p2p-confirm-selection-btn', createButton('p2p-confirm-selection-btn', events)],
    ['p2p-connect-btn', createButton('p2p-connect-btn', events)],
    ['p2p-start-scan-btn', createButton('p2p-start-scan-btn', events)]
  ]);
  let scannerCalls = 0;
  let scannerCallback;

  createAppBootstrapComposition({
    allElements: {},
    getElementById: (id) => buttons.get(id),
    setupHistorySidebarInteractions: () => {},
    setupHistorySidebarTriggers: () => {},
    initP2P: () => {},
    toggleP2PModal: () => {},
    resetP2PUI: () => {},
    setP2PMode: () => {},
    showP2PSelection: () => {},
    startP2PReceiverUI: () => {},
    startP2PSender: () => {},
    getP2PCodeInputValue: () => 'abcde',
    showNotification: () => {},
    connectToSender: () => {},
    startQRScanner: () => scannerCallback()
  }).runLateBootstrapBindings();

  assert.equal(scannerCalls, 0);
  scannerCallback = () => {
    scannerCalls += 1;
  };

  buttons.get('p2p-start-scan-btn').handler();

  assert.equal(scannerCalls, 1);
});

test('invalid P2P connect code preserves the legacy warning handoff', () => {
  const calls = [];
  const events = [];
  const buttons = new Map([
    ['share-astras-btn', createButton('share-astras-btn', events)],
    ['share-folders-btn', createButton('share-folders-btn', events)],
    ['close-p2p-modal-btn', createButton('close-p2p-modal-btn', events)],
    ['p2p-role-sender', createButton('p2p-role-sender', events)],
    ['p2p-role-receiver', createButton('p2p-role-receiver', events)],
    ['p2p-confirm-selection-btn', createButton('p2p-confirm-selection-btn', events)],
    ['p2p-connect-btn', createButton('p2p-connect-btn', events)],
    ['p2p-start-scan-btn', createButton('p2p-start-scan-btn', events)]
  ]);

  createAppBootstrapComposition({
    allElements: {},
    getElementById: (id) => buttons.get(id),
    setupHistorySidebarInteractions: () => {},
    setupHistorySidebarTriggers: () => {},
    initP2P: () => {},
    toggleP2PModal: () => {},
    resetP2PUI: () => {},
    setP2PMode: () => {},
    showP2PSelection: () => {},
    startP2PReceiverUI: () => {},
    startP2PSender: () => {},
    getP2PCodeInputValue: () => 'bad',
    showNotification: (...args) => calls.push(args),
    connectToSender: (code) => calls.push(['connect', code]),
    startQRScanner: () => {}
  }).runLateBootstrapBindings();

  buttons.get('p2p-connect-btn').handler();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'warning');
});

test('app bootstrap composition source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/features/app-bootstrap-composition.js');

  for (const forbidden of [
    'streamApiCall',
    'indexedDB',
    'vite',
    'package.json',
    'DOMPurify',
    'marked',
    'katex'
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
  }
});

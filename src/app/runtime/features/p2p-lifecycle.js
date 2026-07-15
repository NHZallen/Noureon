import { createP2PScannerLifecycle } from '../../legacy-runtime/features/p2p-scanner-lifecycle.js';
import { createReceivedDataLifecycle } from '../../legacy-runtime/features/received-data-lifecycle.js';

const DEFAULT_CHUNK_SIZE = 16 * 1024;

export function createLegacyP2PLifecycle({
  document,
  getElementById,
  loadSharingVendor,
  loadArchiveVendor,
  Peer,
  QRCode,
  Html5Qrcode,
  JSZip,
  BlobCtor,
  getAstras,
  getFolders,
  getConversations,
  getDefaultFolder,
  saveAppData,
  renderAll,
  showNotification,
  toggleModal,
  escapeHTML,
  getText = (_key, fallback) => fallback,
  randomUUID,
  random,
  scheduleTimeout,
  logger
} = {}) {
  let p2pPeer = null;
  let p2pConn = null;
  let p2pType = null;
  let operationGeneration = 0;
  let activeOperation = null;
  let sharingVendors = (
    typeof Peer === 'function'
    && typeof QRCode === 'function'
    && typeof Html5Qrcode === 'function'
  ) ? Object.freeze({ Peer, QRCode, Html5Qrcode }) : null;
  let sharingVendorPromise;
  let archiveVendor = typeof JSZip === 'function' ? JSZip : null;
  let archiveVendorPromise;

  const getElement = (id) => getElementById(id);
  const log = logger ?? console;
  const schedule = scheduleTimeout ?? setTimeout;
  const randomValue = random ?? Math.random;
  const generateUuid = randomUUID;

  const createCancellationGate = () => {
    let resolveCancellation;
    const gate = {
      cancelled: false,
      promise: new Promise((resolve) => {
        resolveCancellation = resolve;
      }),
      cancel() {
        if (gate.cancelled) return;
        gate.cancelled = true;
        resolveCancellation(false);
      }
    };
    return gate;
  };

  const destroyPeer = (peer) => {
    if (!peer) return;
    try {
      peer.destroy();
    } catch (error) {
      log.warn('Failed to destroy P2P peer:', error);
    }
  };

  const invalidateActiveOperation = () => {
    const previousOperation = activeOperation;
    activeOperation = null;
    operationGeneration += 1;
    previousOperation?.connectionAttempt?.cancellation.cancel();
    previousOperation?.cancellation.cancel();
    p2pConn = null;

    const previousPeer = p2pPeer;
    p2pPeer = null;
    destroyPeer(previousPeer);
  };

  const beginOperation = (kind, details = {}) => {
    invalidateActiveOperation();
    const operation = {
      ...details,
      kind,
      generation: operationGeneration,
      cancellation: createCancellationGate(),
      connectionAttempt: null
    };
    activeOperation = operation;
    return operation;
  };

  const isCurrentOperation = (operation) => (
    activeOperation === operation
    && operation?.generation === operationGeneration
    && !operation?.cancellation.cancelled
  );

  const closeConnection = (connection) => {
    if (typeof connection?.close !== 'function') return;
    try {
      connection.close();
    } catch (error) {
      log.warn('Failed to close stale P2P connection:', error);
    }
  };

  const bindOperationConnection = (operation, connection) => {
    if (!isCurrentOperation(operation)) return null;

    const previousAttempt = operation.connectionAttempt;
    const attempt = {
      connection,
      cancellation: createCancellationGate()
    };
    operation.connectionAttempt = attempt;
    p2pConn = connection;

    if (previousAttempt && previousAttempt.connection !== connection) {
      previousAttempt.cancellation.cancel();
      closeConnection(previousAttempt.connection);
    }
    return attempt;
  };

  const isCurrentConnection = (operation, attempt) => (
    isCurrentOperation(operation)
    && operation.connectionAttempt === attempt
    && !attempt?.cancellation.cancelled
  );

  const releaseOperationConnection = (operation, attempt) => {
    attempt?.cancellation.cancel();
    if (operation?.connectionAttempt !== attempt) return;
    operation.connectionAttempt = null;
    if (p2pConn === attempt.connection) p2pConn = null;
  };

  const requireSharingVendors = () => {
    if (sharingVendors) return sharingVendors;
    if (sharingVendorPromise) return sharingVendorPromise;

    if (typeof loadSharingVendor !== 'function') {
      return Promise.reject(new TypeError('A P2P sharing vendor loader is required.'));
    }

    sharingVendorPromise = Promise.resolve()
      .then(loadSharingVendor)
      .then((loadedVendors) => {
        const resolvedVendors = {
          Peer: loadedVendors?.Peer,
          QRCode: loadedVendors?.QRCode,
          Html5Qrcode: loadedVendors?.Html5Qrcode
        };
        if (
          typeof resolvedVendors.Peer !== 'function'
          || typeof resolvedVendors.QRCode !== 'function'
          || typeof resolvedVendors.Html5Qrcode !== 'function'
        ) {
          throw new TypeError('P2P sharing vendors did not expose the expected APIs.');
        }
        sharingVendors = Object.freeze(resolvedVendors);
        return sharingVendors;
      })
      .catch((error) => {
        sharingVendorPromise = undefined;
        throw error;
      });
    return sharingVendorPromise;
  };

  const requireArchiveVendor = () => {
    if (archiveVendor) return archiveVendor;
    if (archiveVendorPromise) return archiveVendorPromise;

    if (typeof loadArchiveVendor !== 'function') {
      return Promise.reject(new TypeError('An archive vendor loader is required.'));
    }

    archiveVendorPromise = Promise.resolve()
      .then(loadArchiveVendor)
      .then((loadedVendor) => {
        const JSZipCtor = loadedVendor?.JSZip || loadedVendor?.default || loadedVendor;
        if (typeof JSZipCtor !== 'function') {
          throw new TypeError('JSZip did not expose a usable constructor.');
        }
        archiveVendor = JSZipCtor;
        return archiveVendor;
      })
      .catch((error) => {
        archiveVendorPromise = undefined;
        throw error;
      });
    return archiveVendorPromise;
  };

  const reportVendorLoadFailure = (error) => {
    log.error('Failed to load P2P support:', error);
    showNotification(
      `${getText('p2pError', 'P2P error')}: ${error?.message || String(error)}`,
      'error'
    );
  };

  function initP2P(type) {
    resetP2PUI();
    p2pType = type;
    const sharingLoad = requireSharingVendors();
    if (typeof sharingLoad?.then === 'function') {
      void sharingLoad.catch((error) => {
        log.warn('P2P sharing support could not be prefetched:', error);
      });
    }
    getElement('p2p-modal-title').textContent = getText('p2pShareTitle', 'P2P Share {type}')
      .replace('{type}', type === 'astras' ? 'Nouras' : getText('folders', 'Folders'));
    const rolePrompt = document.querySelector?.('#p2p-step-role > p');
    if (rolePrompt) rolePrompt.textContent = getText('p2pChooseRole', 'Please choose your role:');
    toggleModal(getElement('p2p-share-modal'), true);
  }

  function resetP2PUI() {
    invalidateActiveOperation();
    getElement('p2p-step-role').classList.remove('hidden');
    getElement('p2p-step-select').classList.add('hidden');
    getElement('p2p-step-wait').classList.add('hidden');
    getElement('p2p-step-connect').classList.add('hidden');
    getElement('p2p-step-progress').classList.add('hidden');
    getElement('p2p-reader').classList.add('hidden');

    p2pScannerLifecycle.stopScannerIfActive();
  }

  function generateP2PCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 5; i += 1) {
      result += chars.charAt(Math.floor(randomValue() * chars.length));
    }
    return result;
  }

  function setP2PMode(_mode) {}

  function showP2PSelection() {
    getElement('p2p-step-role').classList.add('hidden');
    getElement('p2p-step-select').classList.remove('hidden');
    const list = getElement('p2p-item-list');
    list.innerHTML = '';

    const items = p2pType === 'astras'
      ? getAstras().filter((astra) => !astra.officialId)
      : getFolders();

    if (items.length === 0) {
      list.innerHTML = `<p class="text-center text-[var(--text-secondary)] p-4">${escapeHTML(getText('p2pNoShareItems', 'No shareable items.'))}</p>`;
      getElement('p2p-confirm-selection-btn').disabled = true;
      return;
    }

    getElement('p2p-confirm-selection-btn').disabled = false;
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'p2p-select-item';
      div.innerHTML = `
                <input type="checkbox" class="p2p-item-checkbox w-4 h-4" value="${escapeHTML(item.id)}">
                <span class="truncate flex-1">${escapeHTML(item.name)}</span>
            `;
      list.appendChild(div);
    });
  }

  async function startP2PSender() {
    const checkboxes = document.querySelectorAll('.p2p-item-checkbox:checked');
    if (checkboxes.length === 0) {
      showNotification(getText('p2pSelectItemsWarning', 'Select at least one item to share.'), 'warning');
      return;
    }

    const operation = beginOperation('sender', {
      type: p2pType,
      selectedIds: Object.freeze(Array.from(checkboxes).map((checkbox) => checkbox.value))
    });
    let loadedVendors;
    try {
      loadedVendors = await requireSharingVendors();
    } catch (error) {
      if (isCurrentOperation(operation)) reportVendorLoadFailure(error);
      return;
    }
    if (!isCurrentOperation(operation)) return;

    getElement('p2p-step-select').classList.add('hidden');
    getElement('p2p-step-wait').classList.remove('hidden');

    createSenderPeer(operation, loadedVendors);
  }

  function createSenderPeer(operation, loadedVendors) {
    if (!isCurrentOperation(operation)) return;

    const code = generateP2PCode();
    const peerId = `astra-p2p-${code}`;

    getElement('p2p-share-code').textContent = code;

    const qrContainer = getElement('p2p-qrcode-container');
    qrContainer.innerHTML = '';
    new loadedVendors.QRCode(qrContainer, {
      text: code,
      width: 180,
      height: 180
    });

    let peer;
    try {
      peer = new loadedVendors.Peer(peerId);
    } catch (error) {
      if (isCurrentOperation(operation)) reportVendorLoadFailure(error);
      return;
    }
    if (!isCurrentOperation(operation)) {
      destroyPeer(peer);
      return;
    }
    p2pPeer = peer;

    peer.on('open', (id) => {
      if (!isCurrentOperation(operation) || p2pPeer !== peer) return;
      log.log('My peer ID is: ' + id);
    });

    peer.on('connection', (connection) => {
      if (!isCurrentOperation(operation) || p2pPeer !== peer) {
        closeConnection(connection);
        return;
      }
      const attempt = bindOperationConnection(operation, connection);
      if (!attempt) {
        closeConnection(connection);
        return;
      }
      void setupSenderConnection(operation, attempt);
    });

    peer.on('error', (err) => {
      if (!isCurrentOperation(operation) || p2pPeer !== peer) return;
      log.error(err);
      if (err.type === 'unavailable-id') {
        operation.connectionAttempt?.cancellation.cancel();
        operation.connectionAttempt = null;
        p2pConn = null;
        p2pPeer = null;
        destroyPeer(peer);
        createSenderPeer(operation, loadedVendors);
      } else {
        showNotification(`${getText('p2pError', 'P2P error')}: ${err.type}`, 'error');
      }
    });
  }

  async function setupSenderConnection(operation, attempt) {
    if (!isCurrentConnection(operation, attempt)) return;
    const { connection } = attempt;
    let settleOpen;
    const opened = connection.open === true
      ? Promise.resolve(true)
      : new Promise((resolve) => {
          let settled = false;
          settleOpen = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          connection.on('open', () => settleOpen(true));
        });
    connection.on('close', () => {
      settleOpen?.(false);
      releaseOperationConnection(operation, attempt);
    });

    getElement('p2p-step-wait').classList.add('hidden');
    getElement('p2p-step-progress').classList.remove('hidden');
    updateP2PProgress(0, getText('p2pPreparingData', 'Preparing data...'));

    let JSZipCtor;
    try {
      JSZipCtor = await requireArchiveVendor();
    } catch (error) {
      if (isCurrentConnection(operation, attempt)) {
        reportVendorLoadFailure(error);
        releaseOperationConnection(operation, attempt);
        closeConnection(connection);
        resetP2PUI();
      }
      return;
    }
    if (!isCurrentConnection(operation, attempt)) return;
    const zip = new JSZipCtor();

    if (operation.type === 'astras') {
      const selectedAstras = getAstras().filter((astra) => operation.selectedIds.includes(astra.id));
      for (const astra of selectedAstras) {
        const astraCopy = JSON.parse(JSON.stringify(astra));
        zip.file(`astra_${astra.id}.json`, JSON.stringify(astraCopy));
      }
    } else {
      const selectedFolders = getFolders().filter((folder) => operation.selectedIds.includes(folder.id));
      const folderConvs = [];

      selectedFolders.forEach((folder) => {
        if (folder.conversationIds) {
          folder.conversationIds.forEach((conversationId) => {
            const conversation = getConversations().find((item) => item.id === conversationId);
            if (conversation && !conversation.deletedAt) folderConvs.push(conversation);
          });
        }
      });

      zip.file('folders.json', JSON.stringify(selectedFolders));
      zip.file('conversations.json', JSON.stringify(folderConvs));
    }

    let arrayBuffer;
    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      if (!isCurrentConnection(operation, attempt)) return;
      arrayBuffer = await blob.arrayBuffer();
    } catch (error) {
      if (isCurrentConnection(operation, attempt)) {
        reportVendorLoadFailure(error);
        releaseOperationConnection(operation, attempt);
        closeConnection(connection);
        resetP2PUI();
      }
      return;
    }
    if (!isCurrentConnection(operation, attempt)) return;

    const connectionOpened = await Promise.race([
      opened,
      operation.cancellation.promise,
      attempt.cancellation.promise
    ]);
    if (!connectionOpened || !isCurrentConnection(operation, attempt)) return;

    try {
      connection.send({
        type: 'meta',
        size: arrayBuffer.byteLength,
        dataType: operation.type
      });

      const totalSize = arrayBuffer.byteLength;
      let offset = 0;

      function sendNextChunk() {
        if (!isCurrentConnection(operation, attempt)) return;
        try {
          if (offset >= totalSize) {
            connection.send({ type: 'end' });
            updateP2PProgress(100, getText('p2pSentSuccess', 'Sent successfully!'));
            return;
          }

          const chunk = arrayBuffer.slice(offset, offset + DEFAULT_CHUNK_SIZE);
          connection.send({
            type: 'chunk',
            data: chunk,
            offset
          });

          offset += chunk.byteLength;
          const percent = (offset / totalSize) * 100;
          updateP2PProgress(percent, `${getText('p2pSending', 'Sending...')} ${Math.round(percent)}%`);

          schedule(sendNextChunk, 5);
        } catch (error) {
          if (!isCurrentConnection(operation, attempt)) return;
          releaseOperationConnection(operation, attempt);
          reportVendorLoadFailure(error);
        }
      }

      sendNextChunk();
    } catch (error) {
      if (isCurrentConnection(operation, attempt)) reportVendorLoadFailure(error);
    }
  }

  function startP2PReceiverUI() {
    getElement('p2p-step-role').classList.add('hidden');
    getElement('p2p-step-connect').classList.remove('hidden');
    getElement('p2p-code-input').value = '';
    getElement('p2p-code-input').focus();
  }

  function connectWithPeer(PeerCtor, operation) {
    if (!isCurrentOperation(operation)) return undefined;
    const peerId = `astra-p2p-${operation.code}`;

    const peer = new PeerCtor();
    if (!isCurrentOperation(operation)) {
      destroyPeer(peer);
      return undefined;
    }
    p2pPeer = peer;

    getElement('p2p-step-connect').classList.add('hidden');
    getElement('p2p-step-progress').classList.remove('hidden');
    updateP2PProgress(5, getText('p2pConnecting', 'Connecting...'));

    peer.on('open', () => {
      if (!isCurrentOperation(operation) || p2pPeer !== peer) return;
      const connection = peer.connect(peerId);
      const attempt = bindOperationConnection(operation, connection);
      if (!attempt) {
        closeConnection(connection);
        return;
      }
      setupReceiverConnection(operation, attempt);
    });

    peer.on('error', (err) => {
      if (!isCurrentOperation(operation) || p2pPeer !== peer) return;
      log.error(err);
      showNotification(getText('p2pConnectionFailed', 'Connection failed. Check the code.'), 'error');
      resetP2PUI();
      startP2PReceiverUI();
    });
  }

  function connectToSender(code) {
    const operation = beginOperation('receiver', { code: code.toUpperCase() });
    const loadedVendors = requireSharingVendors();
    if (typeof loadedVendors?.then === 'function') {
      return loadedVendors
        .then((vendors) => (
          isCurrentOperation(operation)
            ? connectWithPeer(vendors.Peer, operation)
            : undefined
        ))
        .catch((error) => {
          if (isCurrentOperation(operation)) reportVendorLoadFailure(error);
        });
    }
    return connectWithPeer(loadedVendors.Peer, operation);
  }

  function setupReceiverConnection(operation, attempt) {
    const { connection } = attempt;
    let receivedBuffer = [];
    let receivedSize = 0;
    let totalSize = 0;
    let dataType = '';

    connection.on('open', () => {
      if (!isCurrentConnection(operation, attempt)) return;
      updateP2PProgress(10, getText('p2pConnectedReceiving', 'Connected, receiving data...'));
    });

    connection.on('data', async (data) => {
      if (!isCurrentConnection(operation, attempt)) return;
      if (data.type === 'meta') {
        totalSize = data.size;
        dataType = data.dataType;
        receivedBuffer = [];
        receivedSize = 0;
        updateP2PProgress(10, getText('p2pReceiving', 'Receiving...'));
      } else if (data.type === 'chunk') {
        receivedBuffer.push(data.data);
        receivedSize += data.data.byteLength;
        const percent = (receivedSize / totalSize) * 100;
        updateP2PProgress(percent, `${getText('p2pReceiving', 'Receiving...')} ${Math.round(percent)}%`);
      } else if (data.type === 'end') {
        updateP2PProgress(100, getText('p2pProcessingReceived', 'Received. Processing...'));
        await processReceivedData(receivedBuffer, dataType);
      }
    });

    connection.on('close', () => {
      const wasCurrent = isCurrentConnection(operation, attempt);
      releaseOperationConnection(operation, attempt);
      if (!wasCurrent) return;
      if (receivedSize < totalSize && totalSize > 0) {
        showNotification(getText('p2pConnectionInterrupted', 'Connection interrupted.'), 'error');
      }
    });
  }

  const receivedDataLifecycle = createReceivedDataLifecycle({
    BlobCtor,
    loadArchiveVendor: requireArchiveVendor,
    JSZip,
    getAstras,
    getConversations,
    getFolders,
    getDefaultFolder,
    randomUUID: generateUuid,
    saveAppData,
    renderAll,
    showNotification,
    toggleModal,
    getText,
    getP2pShareModal: () => getElement('p2p-share-modal'),
    scheduleTimeout: schedule,
    logger: log
  });
  const processReceivedData = (...args) => receivedDataLifecycle.processReceivedData(...args);

  const p2pScannerLifecycle = createP2PScannerLifecycle({
    getElementById: getElement,
    createScanner: (elementId) => {
      const loadedVendors = requireSharingVendors();
      if (typeof loadedVendors?.then === 'function') {
        return loadedVendors.then((vendors) => new vendors.Html5Qrcode(elementId));
      }
      return new loadedVendors.Html5Qrcode(elementId);
    },
    connectToSender,
    showNotification,
    getText,
    logger: log
  });
  const updateP2PProgress = (...args) => p2pScannerLifecycle.updateP2PProgress(...args);
  const startQRScanner = (...args) => p2pScannerLifecycle.startQRScanner(...args);

  return {
    initP2P,
    resetP2PUI,
    setP2PMode,
    showP2PSelection,
    startP2PReceiverUI,
    startP2PSender,
    connectToSender,
    startQRScanner,
    processReceivedData,
    updateP2PProgress
  };
}

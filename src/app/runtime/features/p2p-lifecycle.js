import { createP2PScannerLifecycle } from '../../legacy-runtime/features/p2p-scanner-lifecycle.js';
import { createReceivedDataLifecycle } from '../../legacy-runtime/features/received-data-lifecycle.js';

const DEFAULT_CHUNK_SIZE = 16 * 1024;

export function createLegacyP2PLifecycle({
  document,
  getElementById,
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

  const getElement = (id) => getElementById(id);
  const log = logger ?? console;
  const schedule = scheduleTimeout ?? setTimeout;
  const randomValue = random ?? Math.random;
  const generateUuid = randomUUID;

  function initP2P(type) {
    p2pType = type;
    resetP2PUI();
    getElement('p2p-modal-title').textContent = getText('p2pShareTitle', 'P2P Share {type}')
      .replace('{type}', type === 'astras' ? 'Nouras' : getText('folders', 'Folders'));
    const rolePrompt = document.querySelector?.('#p2p-step-role > p');
    if (rolePrompt) rolePrompt.textContent = getText('p2pChooseRole', 'Please choose your role:');
    toggleModal(getElement('p2p-share-modal'), true);
  }

  function resetP2PUI() {
    getElement('p2p-step-role').classList.remove('hidden');
    getElement('p2p-step-select').classList.add('hidden');
    getElement('p2p-step-wait').classList.add('hidden');
    getElement('p2p-step-connect').classList.add('hidden');
    getElement('p2p-step-progress').classList.add('hidden');
    getElement('p2p-reader').classList.add('hidden');

    p2pScannerLifecycle.stopScannerIfActive();
    if (p2pPeer) {
      p2pPeer.destroy();
      p2pPeer = null;
    }
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

    const selectedIds = Array.from(checkboxes).map((checkbox) => checkbox.value);

    getElement('p2p-step-select').classList.add('hidden');
    getElement('p2p-step-wait').classList.remove('hidden');

    const code = generateP2PCode();
    const peerId = `astra-p2p-${code}`;

    getElement('p2p-share-code').textContent = code;

    const qrContainer = getElement('p2p-qrcode-container');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: code,
      width: 180,
      height: 180
    });

    p2pPeer = new Peer(peerId);

    p2pPeer.on('open', (id) => {
      log.log('My peer ID is: ' + id);
    });

    p2pPeer.on('connection', (conn) => {
      p2pConn = conn;
      setupSenderConnection(selectedIds);
    });

    p2pPeer.on('error', (err) => {
      log.error(err);
      if (err.type === 'unavailable-id') {
        p2pPeer.destroy();
        startP2PSender();
      } else {
        showNotification(`${getText('p2pError', 'P2P error')}: ${err.type}`, 'error');
      }
    });
  }

  async function setupSenderConnection(selectedIds) {
    getElement('p2p-step-wait').classList.add('hidden');
    getElement('p2p-step-progress').classList.remove('hidden');
    updateP2PProgress(0, getText('p2pPreparingData', 'Preparing data...'));

    const zip = new JSZip();

    if (p2pType === 'astras') {
      const selectedAstras = getAstras().filter((astra) => selectedIds.includes(astra.id));
      for (const astra of selectedAstras) {
        const astraCopy = JSON.parse(JSON.stringify(astra));
        zip.file(`astra_${astra.id}.json`, JSON.stringify(astraCopy));
      }
    } else {
      const selectedFolders = getFolders().filter((folder) => selectedIds.includes(folder.id));
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

    const blob = await zip.generateAsync({ type: 'blob' });
    const arrayBuffer = await blob.arrayBuffer();

    p2pConn.on('open', () => {
      p2pConn.send({
        type: 'meta',
        size: arrayBuffer.byteLength,
        dataType: p2pType
      });

      const totalSize = arrayBuffer.byteLength;
      let offset = 0;

      function sendNextChunk() {
        if (offset >= totalSize) {
          p2pConn.send({ type: 'end' });
          updateP2PProgress(100, getText('p2pSentSuccess', 'Sent successfully!'));
          return;
        }

        const chunk = arrayBuffer.slice(offset, offset + DEFAULT_CHUNK_SIZE);
        p2pConn.send({
          type: 'chunk',
          data: chunk,
          offset
        });

        offset += chunk.byteLength;
        const percent = (offset / totalSize) * 100;
        updateP2PProgress(percent, `${getText('p2pSending', 'Sending...')} ${Math.round(percent)}%`);

        schedule(sendNextChunk, 5);
      }

      sendNextChunk();
    });
  }

  function startP2PReceiverUI() {
    getElement('p2p-step-role').classList.add('hidden');
    getElement('p2p-step-connect').classList.remove('hidden');
    getElement('p2p-code-input').value = '';
    getElement('p2p-code-input').focus();
  }

  function connectToSender(code) {
    const peerId = `astra-p2p-${code.toUpperCase()}`;

    p2pPeer = new Peer();

    getElement('p2p-step-connect').classList.add('hidden');
    getElement('p2p-step-progress').classList.remove('hidden');
    updateP2PProgress(5, getText('p2pConnecting', 'Connecting...'));

    p2pPeer.on('open', () => {
      p2pConn = p2pPeer.connect(peerId);
      setupReceiverConnection();
    });

    p2pPeer.on('error', (err) => {
      log.error(err);
      showNotification(getText('p2pConnectionFailed', 'Connection failed. Check the code.'), 'error');
      resetP2PUI();
      startP2PReceiverUI();
    });
  }

  function setupReceiverConnection() {
    let receivedBuffer = [];
    let receivedSize = 0;
    let totalSize = 0;
    let dataType = '';

    p2pConn.on('open', () => {
      updateP2PProgress(10, getText('p2pConnectedReceiving', 'Connected, receiving data...'));
    });

    p2pConn.on('data', async (data) => {
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

    p2pConn.on('close', () => {
      if (receivedSize < totalSize && totalSize > 0) {
        showNotification(getText('p2pConnectionInterrupted', 'Connection interrupted.'), 'error');
      }
    });
  }

  const receivedDataLifecycle = createReceivedDataLifecycle({
    BlobCtor,
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
    createScanner: (elementId) => new Html5Qrcode(elementId),
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

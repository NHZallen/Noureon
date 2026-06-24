export function createAppBootstrapComposition({
  allElements,
  getElementById,
  setupHistorySidebarInteractions,
  setupHistorySidebarTriggers,
  initP2P,
  toggleP2PModal,
  resetP2PUI,
  setP2PMode,
  showP2PSelection,
  startP2PReceiverUI,
  startP2PSender,
  getP2PCodeInputValue,
  showNotification,
  connectToSender,
  startQRScanner
}) {
  return {
    runLateBootstrapBindings() {
      setupHistorySidebarInteractions();
      setupHistorySidebarTriggers();

      allElements.shareAstrasBtn = getElementById('share-astras-btn');
      allElements.shareFoldersBtn = getElementById('share-folders-btn');

      allElements.shareAstrasBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        initP2P('astras');
      });

      allElements.shareFoldersBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        initP2P('folders');
      });

      getElementById('close-p2p-modal-btn').addEventListener('click', () => {
        toggleP2PModal(false);
        resetP2PUI();
      });

      getElementById('p2p-role-sender').addEventListener('click', () => {
        setP2PMode('sender');
        showP2PSelection();
      });

      getElementById('p2p-role-receiver').addEventListener('click', () => {
        setP2PMode('receiver');
        startP2PReceiverUI();
      });

      getElementById('p2p-confirm-selection-btn').addEventListener('click', () => {
        startP2PSender();
      });

      getElementById('p2p-connect-btn').addEventListener('click', () => {
        const code = getP2PCodeInputValue().trim();
        if (code.length !== 5) {
          showNotification("請輸入正確的 5 碼代碼", "warning");
          return;
        }
        connectToSender(code);
      });

      getElementById('p2p-start-scan-btn').addEventListener('click', () => {
        startQRScanner();
      });
    }
  };
}

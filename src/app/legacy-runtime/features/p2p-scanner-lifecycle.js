export function createP2PScannerLifecycle({
  getElementById,
  createScanner,
  connectToSender,
  showNotification,
  logger = console
}) {
  let scanner = null;

  const updateP2PProgress = (percent, text) => {
    const progressBar = getElementById('p2p-progress-bar');
    const percentage = getElementById('p2p-percentage');
    const statusText = getElementById('p2p-status-text');

    progressBar.style.width = `${percent}%`;
    percentage.textContent = `${Math.round(percent)}%`;
    if (text) statusText.textContent = text;
  };

  const stopScannerIfActive = () => {
    if (!scanner) return;

    const activeScanner = scanner;
    scanner = null;
    activeScanner.stop().catch((error) => logger.error('Failed to stop scanner', error));
  };

  const startQRScanner = () => {
    const readerElement = getElementById('p2p-reader');

    readerElement.classList.remove('hidden');
    scanner = createScanner('p2p-reader');
    const activeScanner = scanner;
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    activeScanner.start({ facingMode: 'environment' }, config, (decodedText) => {
      let code = decodedText.trim();
      if (code.length > 5) code = code.slice(-5);

      getElementById('p2p-code-input').value = code;
      activeScanner.stop().then(() => {
        readerElement.classList.add('hidden');
        connectToSender(code);
      });
    }).catch((error) => {
      logger.error(error);
      showNotification('無法啟動相機', 'error');
    });
  };

  return {
    updateP2PProgress,
    startQRScanner,
    stopScannerIfActive
  };
}

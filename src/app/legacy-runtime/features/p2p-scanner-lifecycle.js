export function createP2PScannerLifecycle({
  getElementById,
  createScanner,
  connectToSender,
  showNotification,
  getText = (_key, fallback) => fallback,
  logger = console
}) {
  let scanner = null;
  let scannerStartState = null;
  let scannerRequestId = 0;

  const updateP2PProgress = (percent, text) => {
    const progressBar = getElementById('p2p-progress-bar');
    const percentage = getElementById('p2p-percentage');
    const statusText = getElementById('p2p-status-text');

    progressBar.style.width = `${percent}%`;
    percentage.textContent = `${Math.round(percent)}%`;
    if (text) statusText.textContent = text;
  };

  const stopScannerIfActive = () => {
    scannerRequestId += 1;
    if (!scanner) return;

    const activeScanner = scanner;
    if (scannerStartState?.scanner === activeScanner) {
      scannerStartState.cleanupStarted = true;
      if (!scannerStartState.settled) scannerStartState.retryStopAfterStart = true;
    }
    scanner = null;
    activeScanner.stop().catch((error) => logger.error('Failed to stop scanner', error));
  };

  const startQRScanner = () => {
    const readerElement = getElementById('p2p-reader');

    readerElement.classList.remove('hidden');
    const requestId = ++scannerRequestId;
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const reportScannerFailure = (error) => {
      logger.error(error);
      showNotification(getText('cameraPermissionError', 'Cannot start camera, please check permissions.'), 'error');
    };
    const startScanner = (nextScanner) => {
      if (requestId !== scannerRequestId) return undefined;

      scanner = nextScanner;
      const activeScanner = scanner;
      const startState = {
        scanner: activeScanner,
        settled: false,
        cleanupStarted: false,
        retryStopAfterStart: false
      };
      scannerStartState = startState;
      const stopStaleScanner = () => Promise.resolve()
        .then(() => activeScanner.stop())
        .catch((error) => logger.error('Failed to stop scanner', error));
      try {
        return Promise.resolve(activeScanner.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (requestId !== scannerRequestId || scanner !== activeScanner) return;
            startState.cleanupStarted = true;
            scanner = null;
            let code = decodedText.trim();
            if (code.length > 5) code = code.slice(-5);

            getElementById('p2p-code-input').value = code;
            Promise.resolve()
              .then(() => activeScanner.stop())
              .then(() => {
                if (requestId !== scannerRequestId) return;
                scannerRequestId += 1;
                readerElement.classList.add('hidden');
                connectToSender(code);
              })
              .catch((error) => logger.error('Failed to stop scanner', error));
          }
        )).then(() => {
          startState.settled = true;
          if (
            startState.retryStopAfterStart
            || ((requestId !== scannerRequestId || scanner !== activeScanner) && !startState.cleanupStarted)
          ) {
            return stopStaleScanner();
          }
          return true;
        }).catch((error) => {
          startState.settled = true;
          if (requestId !== scannerRequestId || scanner !== activeScanner) {
            return startState.retryStopAfterStart || !startState.cleanupStarted
              ? stopStaleScanner()
              : false;
          }
          scanner = null;
          reportScannerFailure(error);
          return false;
        });
      } catch (error) {
        reportScannerFailure(error);
        return undefined;
      }
    };

    try {
      const scannerOrPromise = createScanner('p2p-reader');
      if (typeof scannerOrPromise?.then === 'function') {
        return scannerOrPromise.then(startScanner).catch(reportScannerFailure);
      }
      return startScanner(scannerOrPromise);
    } catch (error) {
      reportScannerFailure(error);
      return undefined;
    }
  };

  return {
    updateP2PProgress,
    startQRScanner,
    stopScannerIfActive
  };
}

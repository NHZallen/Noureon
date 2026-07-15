class QRCodeCompat {
  constructor(container, options = {}) {
    const canvas = document.createElement('canvas');
    const width = options.width || 256;
    canvas.width = width;
    canvas.height = options.height || width;
    container.appendChild(canvas);

    QRCodeCompat.generator.toCanvas(canvas, options.text || '', {
      width,
      margin: 1,
      color: {
        dark: options.colorDark || '#000000',
        light: options.colorLight || '#ffffff'
      }
    }).catch((error) => {
      console.error('Failed to render QR code:', error);
    });
  }
}

export function installVendorBridge({
  marked,
  DOMPurify,
  Chart,
  Cropper,
  katex,
  loadArchiveVendor,
  loadSharingVendor,
  JSZip,
  Peer,
  QRCodeGenerator,
  Html5Qrcode
}) {
  const resolveArchiveVendor = typeof loadArchiveVendor === 'function'
    ? loadArchiveVendor
    : () => Promise.resolve(JSZip);
  const resolveSharingVendor = typeof loadSharingVendor === 'function'
    ? loadSharingVendor
    : () => Promise.resolve({ Peer, QRCodeGenerator, Html5Qrcode });
  let archiveBridgePromise;
  let sharingBridgePromise;

  const loadArchiveVendorBridge = () => {
    if (archiveBridgePromise) return archiveBridgePromise;
    archiveBridgePromise = Promise.resolve()
      .then(resolveArchiveVendor)
      .then((JSZipCtor) => {
        if (typeof JSZipCtor !== 'function') {
          throw new TypeError('JSZip did not expose a usable constructor.');
        }
        globalThis.JSZip = JSZipCtor;
        return JSZipCtor;
      })
      .catch((error) => {
        archiveBridgePromise = undefined;
        throw error;
      });
    return archiveBridgePromise;
  };

  const loadSharingVendorBridge = () => {
    if (sharingBridgePromise) return sharingBridgePromise;
    sharingBridgePromise = Promise.resolve()
      .then(resolveSharingVendor)
      .then((vendors) => {
        if (
          typeof vendors?.Peer !== 'function'
          || typeof vendors?.QRCodeGenerator?.toCanvas !== 'function'
          || typeof vendors?.Html5Qrcode !== 'function'
        ) {
          throw new TypeError('P2P sharing vendors did not expose the expected APIs.');
        }

        QRCodeCompat.generator = vendors.QRCodeGenerator;
        globalThis.Peer = vendors.Peer;
        globalThis.QRCode = QRCodeCompat;
        globalThis.Html5Qrcode = vendors.Html5Qrcode;
        return Object.freeze({
          Peer: vendors.Peer,
          QRCode: QRCodeCompat,
          Html5Qrcode: vendors.Html5Qrcode
        });
      })
      .catch((error) => {
        sharingBridgePromise = undefined;
        throw error;
      });
    return sharingBridgePromise;
  };

  globalThis.marked = marked;
  globalThis.DOMPurify = DOMPurify;
  globalThis.Chart = Chart;
  globalThis.Cropper = Cropper;
  globalThis.katex = katex;
  globalThis.loadArchiveVendor = loadArchiveVendorBridge;
  globalThis.loadSharingVendor = loadSharingVendorBridge;
}

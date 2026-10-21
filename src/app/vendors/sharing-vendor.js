import { createMemoizedVendorLoader } from './memoized-vendor-loader.js';

// The QR code of a share, drawn on a canvas in the container it is given (the shape the P2P code was written for).
export const createQrCodeClass = (generator) => class QRCode {
  constructor(container, options = {}) {
    const canvas = document.createElement('canvas');
    const width = options.width || 256;
    canvas.width = width;
    canvas.height = options.height || width;
    container.appendChild(canvas);

    generator.toCanvas(canvas, options.text || '', {
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
};

// Html5Qrcode is the name the P2P code knows the camera scanner by (the library it used to be); it is now ./qr-scanner.js.
export const loadSharingVendor = createMemoizedVendorLoader(async () => {
  const [peerModule, qrCodeModule, scannerModule] = await Promise.all([
    import('peerjs'),
    import('qrcode'),
    import('./qr-scanner.js')
  ]);
  const Peer = peerModule.default;
  const QRCodeGenerator = qrCodeModule.default;
  const Html5Qrcode = scannerModule.QrScanner;

  if (
    typeof Peer !== 'function'
    || typeof QRCodeGenerator?.toCanvas !== 'function'
    || typeof Html5Qrcode !== 'function'
  ) {
    throw new TypeError('P2P sharing vendors did not expose the expected APIs.');
  }

  return Object.freeze({ Peer, QRCode: createQrCodeClass(QRCodeGenerator), Html5Qrcode });
});

import { createMemoizedVendorLoader } from './memoized-vendor-loader.js';

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

  return Object.freeze({ Peer, QRCodeGenerator, Html5Qrcode });
});

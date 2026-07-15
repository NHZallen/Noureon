import { createMemoizedVendorLoader } from './memoized-vendor-loader.js';

export const loadSharingVendor = createMemoizedVendorLoader(async () => {
  const [peerModule, qrCodeModule, scannerModule] = await Promise.all([
    import('peerjs'),
    import('qrcode'),
    import('html5-qrcode')
  ]);
  const Peer = peerModule.default;
  const QRCodeGenerator = qrCodeModule.default;
  const { Html5Qrcode } = scannerModule;

  if (
    typeof Peer !== 'function'
    || typeof QRCodeGenerator?.toCanvas !== 'function'
    || typeof Html5Qrcode !== 'function'
  ) {
    throw new TypeError('P2P sharing vendors did not expose the expected APIs.');
  }

  return Object.freeze({ Peer, QRCodeGenerator, Html5Qrcode });
});

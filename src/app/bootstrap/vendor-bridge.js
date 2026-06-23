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
  JSZip,
  Cropper,
  katex,
  Peer,
  QRCodeGenerator,
  Html5Qrcode
}) {
  QRCodeCompat.generator = QRCodeGenerator;

  globalThis.marked = marked;
  globalThis.DOMPurify = DOMPurify;
  globalThis.Chart = Chart;
  globalThis.JSZip = JSZip;
  globalThis.Cropper = Cropper;
  globalThis.katex = katex;
  globalThis.Peer = Peer;
  globalThis.QRCode = QRCodeCompat;
  globalThis.Html5Qrcode = Html5Qrcode;
}

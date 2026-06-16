import 'cropperjs/dist/cropper.css';
import 'katex/dist/katex.min.css';
import './styles/main.css';

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';
import JSZip from 'jszip';
import Cropper from 'cropperjs';
import katex from 'katex/dist/katex.min.js';
import Peer from 'peerjs';
import QRCodeGenerator from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import appShell from './templates/app-shell.html?raw';

class QRCodeCompat {
  constructor(container, options = {}) {
    const canvas = document.createElement('canvas');
    const width = options.width || 256;
    canvas.width = width;
    canvas.height = options.height || width;
    container.appendChild(canvas);

    QRCodeGenerator.toCanvas(canvas, options.text || '', {
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

globalThis.marked = marked;
globalThis.DOMPurify = DOMPurify;
globalThis.Chart = Chart;
globalThis.JSZip = JSZip;
globalThis.Cropper = Cropper;
globalThis.katex = katex;
globalThis.Peer = Peer;
globalThis.QRCode = QRCodeCompat;
globalThis.Html5Qrcode = Html5Qrcode;

function loadVendorScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function bootstrap() {
  const app = document.querySelector('#app');
  if (!app) {
    throw new Error('Missing #app mount node.');
  }

  app.innerHTML = appShell;

  await import('./data/i18n.js');
  await import('./data/demo-conversations.js');
  await import('./data/astras-data.js');
  await import('./data/update-logs.js');
  await loadVendorScript('/vendor/mhchem.min.js');
  await import('./app/legacy-app.js');

  if (import.meta.env.PROD) {
    const analyticsScript = document.createElement('script');
    analyticsScript.defer = true;
    analyticsScript.src = '/_vercel/insights/script.js';
    document.head.appendChild(analyticsScript);
  }
}

bootstrap().catch((error) => {
  console.error('AstraChat failed to bootstrap:', error);
  document.body.innerHTML = '<main style="padding:2rem;font-family:system-ui,sans-serif"><h1>AstraChat ????</h1><pre></pre></main>';
  document.querySelector('pre').textContent = error?.stack || String(error);
});

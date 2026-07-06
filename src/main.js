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
import { installVendorBridge } from './app/bootstrap/vendor-bridge.js';
import { loadVendorScript } from './app/bootstrap/load-vendor-script.js';
import { mountAppShell } from './app/bootstrap/mount-shell.js';
import appShell from './templates/app-shell.js';
import { initializeSupabaseAuthBridge } from './app/auth/supabase-auth-bridge.js';
import { initializeCloudWorkspaceSync } from './app/sync/cloud-workspace-sync.js';

async function bootstrap() {
  installVendorBridge({
    marked,
    DOMPurify,
    Chart,
    JSZip,
    Cropper,
    katex,
    Peer,
    QRCodeGenerator,
    Html5Qrcode
  });
  mountAppShell(appShell);
  const auth = await initializeSupabaseAuthBridge({ window, document });
  await initializeCloudWorkspaceSync({ window, session: auth.session });

  await import('./data/i18n.js');
  await import('./data/demo-conversations.js');
  await import('./data/astras-data.js');
  await import('./data/update-logs.js');
  await loadVendorScript('/vendor/mhchem.min.js');
  await import('./app/legacy-app.js');
}

bootstrap().catch((error) => {
  console.error('Noureon failed to bootstrap:', error);
  document.body.innerHTML = '<main style="padding:2rem;font-family:system-ui,sans-serif"><h1>Noureon failed to start</h1><pre></pre></main>';
  document.querySelector('pre').textContent = error?.stack || String(error);
});

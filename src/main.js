import 'cropperjs/dist/cropper.css';
import 'katex/dist/katex.min.css';
import './styles/main.css';

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';
import Cropper from 'cropperjs';
import katex from 'katex/dist/katex.min.js';
import { installVendorBridge } from './app/bootstrap/vendor-bridge.js';
import { loadVendorScript } from './app/bootstrap/load-vendor-script.js';
import {
  dismissStartupSkeleton,
  mountAppShell,
  showStartupFailure
} from './app/bootstrap/mount-shell.js';
import { retryAsync } from './app/bootstrap/retry-async.js';
import {
  STARTUP_MARKS,
  STARTUP_MEASURES,
  markStartup,
  measureStartup
} from './app/bootstrap/startup-performance.js';
import appShell from './templates/app-shell.js';
import {
  initializeLocalAuthBridgeInBackground,
  initializeStartupAuthBridge
} from './app/auth/startup-auth-bridge.js';
import { resolveStartupIdentity } from './app/auth/startup-identity.js';
import { isPasswordRecoveryRoute } from './app/auth/password-recovery-route.js';
import { loadArchiveVendor } from './app/vendors/archive-vendor.js';
import { scheduleArchiveVendorPrewarm } from './app/vendors/archive-vendor-prewarm.js';
import { loadSharingVendor } from './app/vendors/sharing-vendor.js';
import { installCloudSyncBootstrapQueue } from './app/sync/cloud-sync-bootstrap-queue.js';

const recordBootstrapMilestone = (markName, measureName) => {
  markStartup(markName);
  measureStartup(
    measureName,
    STARTUP_MARKS.BOOTSTRAP_START,
    markName
  );
};

async function bootstrap() {
  markStartup(STARTUP_MARKS.BOOTSTRAP_START);
  installVendorBridge({
    marked,
    DOMPurify,
    Chart,
    Cropper,
    katex,
    loadArchiveVendor,
    loadSharingVendor
  });
  if (isPasswordRecoveryRoute(window.location.pathname)) {
    const { initializePasswordRecoveryPage } = await import(
      './app/auth/password-recovery-page.js'
    );
    await initializePasswordRecoveryPage({ window, document });
    recordBootstrapMilestone(
      STARTUP_MARKS.PASSWORD_RECOVERY_INTERACTIVE,
      STARTUP_MEASURES.TO_PASSWORD_RECOVERY_INTERACTIVE
    );
    return;
  }

  mountAppShell(appShell);
  recordBootstrapMilestone(
    STARTUP_MARKS.SHELL_MOUNTED,
    STARTUP_MEASURES.TO_SHELL
  );
  const startupDataReady = Promise.all([
    import('./data/i18n.js'),
    import('./data/demo-conversations.js'),
    import('./data/astras-data.js'),
    import('./data/update-logs.js'),
    loadVendorScript('/vendor/mhchem.min.js')
  ]).then(() => {
    recordBootstrapMilestone(
      STARTUP_MARKS.STARTUP_DATA_READY,
      STARTUP_MEASURES.TO_STARTUP_DATA
    );
  });
  const identityAndRequiredAuthReady = resolveStartupIdentity().then(async (resolvedIdentity) => {
    let startupIdentity = resolvedIdentity;
    recordBootstrapMilestone(
      STARTUP_MARKS.IDENTITY_RESOLVED,
      STARTUP_MEASURES.TO_IDENTITY
    );
    const auth = startupIdentity.mode === 'local'
      ? null
      : await initializeStartupAuthBridge({ window, document, startupIdentity });
    if (!startupIdentity.safeToReadWorkspace) {
      startupIdentity = await resolveStartupIdentity();
    }
    if (!startupIdentity.safeToReadWorkspace) {
      throw new Error('Noureon cannot verify the cached cloud workspace owner. Sign in again before loading this workspace.');
    }
    return { auth, startupIdentity };
  });
  const [{ auth, startupIdentity }] = await Promise.all([
    identityAndRequiredAuthReady,
    startupDataReady
  ]);

  const cloudSyncBootstrapQueue = startupIdentity.mode !== 'local' && auth?.session?.user
    ? installCloudSyncBootstrapQueue({
        window,
        username: `supabase:${auth.session.user.id}`
      })
    : null;
  const legacyApp = await import('./app/legacy-app.js');
  await legacyApp.legacyAppReady;
  dismissStartupSkeleton(document);
  recordBootstrapMilestone(
    STARTUP_MARKS.RUNTIME_INTERACTIVE,
    STARTUP_MEASURES.TO_RUNTIME_INTERACTIVE
  );
  measureStartup(
    STARTUP_MEASURES.NAVIGATION_TO_RUNTIME_INTERACTIVE,
    STARTUP_MARKS.NAVIGATION_START,
    STARTUP_MARKS.RUNTIME_INTERACTIVE
  );
  void scheduleArchiveVendorPrewarm({
    windowTarget: window,
    navigatorTarget: navigator,
    loadArchiveVendor
  });

  if (startupIdentity.mode === 'local') {
    void initializeLocalAuthBridgeInBackground({ window, document, startupIdentity });
  }

  markStartup(STARTUP_MARKS.CLOUD_SYNC_START);
  const cloudSyncReady = startupIdentity.mode !== 'local' && auth?.session?.user
    ? retryAsync(async () => {
        const { initializeCloudWorkspaceSync } = await import('./app/sync/cloud-workspace-sync.js');
        return initializeCloudWorkspaceSync({
          window,
          session: auth.session,
          bootstrapQueue: cloudSyncBootstrapQueue
        });
      }, {
        maxAttempts: 4,
        delays: [300, 1200, 4000],
        shouldRetry: () => window.__astraCloudWorkspaceSync === cloudSyncBootstrapQueue?.stub,
        onRetry: (error, attempt) => {
          console.warn(`Noureon cloud sync initialization attempt ${attempt} failed; retrying:`, error);
        }
      })
    : Promise.resolve({
        enabled: false,
        reason: startupIdentity.mode === 'local' ? 'local-identity' : 'no-session'
      });
  window.__astraCloudWorkspaceSyncReady = cloudSyncReady;
  void cloudSyncReady.then(() => {
    markStartup(STARTUP_MARKS.CLOUD_SYNC_READY);
    measureStartup(
      STARTUP_MEASURES.CLOUD_SYNC,
      STARTUP_MARKS.CLOUD_SYNC_START,
      STARTUP_MARKS.CLOUD_SYNC_READY
    );
    measureStartup(
      STARTUP_MEASURES.TO_CLOUD_SYNC_READY,
      STARTUP_MARKS.BOOTSTRAP_START,
      STARTUP_MARKS.CLOUD_SYNC_READY
    );
  }).catch((error) => {
    console.warn('Noureon cloud sync could not initialize after retrying; local changes remain queued for the next reload:', error);
  });
}

bootstrap().catch((error) => {
  recordBootstrapMilestone(
    STARTUP_MARKS.BOOTSTRAP_FAILED,
    STARTUP_MEASURES.TO_FAILURE
  );
  console.error('Noureon failed to bootstrap:', error);
  if (!showStartupFailure(error, document)) {
    document.body.innerHTML = '<main style="padding:2rem;font-family:system-ui,sans-serif"><h1>Noureon failed to start</h1></main>';
  }
});

const isPerformanceEntryName = (value) => (
  typeof value === 'string' && value.trim().length > 0
);

export const STARTUP_MARKS = Object.freeze({
  NAVIGATION_START: 'noureon:navigation-start',
  BOOTSTRAP_START: 'noureon:bootstrap-start',
  SHELL_MOUNTED: 'noureon:shell-mounted',
  IDENTITY_RESOLVED: 'noureon:identity-resolved',
  CLOUD_SYNC_START: 'noureon:cloud-sync-start',
  CLOUD_SYNC_READY: 'noureon:cloud-sync-ready',
  STARTUP_DATA_READY: 'noureon:startup-data-ready',
  RUNTIME_INTERACTIVE: 'noureon:runtime-interactive',
  PASSWORD_RECOVERY_INTERACTIVE: 'noureon:password-recovery-interactive',
  BOOTSTRAP_FAILED: 'noureon:bootstrap-failed'
});

export const STARTUP_MEASURES = Object.freeze({
  NAVIGATION_TO_RUNTIME_INTERACTIVE: 'noureon:navigation-to-runtime-interactive',
  TO_SHELL: 'noureon:bootstrap-to-shell',
  TO_IDENTITY: 'noureon:bootstrap-to-identity',
  CLOUD_SYNC: 'noureon:cloud-sync-duration',
  TO_CLOUD_SYNC_READY: 'noureon:bootstrap-to-cloud-sync-ready',
  TO_STARTUP_DATA: 'noureon:bootstrap-to-startup-data',
  TO_RUNTIME_INTERACTIVE: 'noureon:bootstrap-to-runtime-interactive',
  TO_PASSWORD_RECOVERY_INTERACTIVE: 'noureon:bootstrap-to-password-recovery-interactive',
  TO_FAILURE: 'noureon:bootstrap-to-failure'
});

export function markStartup(name, performanceTarget = globalThis.performance) {
  if (!isPerformanceEntryName(name) || typeof performanceTarget?.mark !== 'function') {
    return false;
  }

  try {
    performanceTarget.mark(name);
    return true;
  } catch {
    return false;
  }
}

export function measureStartup(
  name,
  startMark,
  endMark,
  performanceTarget = globalThis.performance
) {
  if (
    !isPerformanceEntryName(name)
    || !isPerformanceEntryName(startMark)
    || !isPerformanceEntryName(endMark)
    || typeof performanceTarget?.measure !== 'function'
  ) {
    return false;
  }

  try {
    performanceTarget.measure(name, startMark, endMark);
    return true;
  } catch {
    return false;
  }
}

export function mountAppShell(appShell) {
  const app = document.querySelector('#app');
  if (!app) {
    throw new Error('Missing #app mount node.');
  }

  const startupSkeleton = app.querySelector('[data-startup-skeleton]');
  app.innerHTML = appShell;
  if (startupSkeleton) app.append(startupSkeleton);
}

export function dismissStartupSkeleton(documentTarget = globalThis.document) {
  const skeleton = documentTarget?.querySelector?.('[data-startup-skeleton]');
  if (!skeleton) return false;
  skeleton.remove();
  return true;
}

export function showStartupFailure(error, documentTarget = globalThis.document) {
  const skeleton = documentTarget?.querySelector?.('[data-startup-skeleton]');
  if (!skeleton) return false;
  const status = skeleton.querySelector('[role="status"]');
  const message = skeleton.querySelector('.startup-skeleton__message');
  skeleton.querySelector('.startup-skeleton__spinner')?.remove();
  status?.setAttribute('role', 'alert');
  status?.setAttribute('aria-busy', 'false');
  if (message) {
    message.textContent = error?.message
      ? `載入失敗：${error.message}`
      : '載入失敗，請重新整理後再試。';
  }
  return true;
}

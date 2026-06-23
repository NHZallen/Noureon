export function mountAppShell(appShell) {
  const app = document.querySelector('#app');
  if (!app) {
    throw new Error('Missing #app mount node.');
  }

  app.innerHTML = appShell;
}

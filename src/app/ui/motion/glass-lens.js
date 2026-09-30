// Real refraction for the glass header buttons where the browser can draw it. Only Chromium can bend the
// live page behind an element (`backdrop-filter: url()`); Safari and every iOS browser cannot, so they
// keep the frosted CSS glass and never download the engine (src/vendor/liquid-glass).

import { GLASS_BUTTON_SELECTOR } from './glass-button-feel.js';

const RESTING = Object.freeze({ refraction: 9, bezel: 0.55, curvature: 4, chroma: 0.08, blur: 1.5, specular: 0.5, specularWidth: 1.5, lightAngle: -120 });
const PRESSED = Object.freeze({ refraction: 15, specular: 0.85 });

export const canRefractBackdrop = (nav = globalThis.navigator) => Boolean(nav?.userAgentData?.brands?.some((brand) => /Chromium/.test(brand.brand)));

export async function installGlassLens(doc = document) {
  const view = doc.defaultView;
  if (!view || !canRefractBackdrop(view.navigator) || doc.documentElement.dataset.glassLens) return () => {};
  doc.documentElement.dataset.glassLens = 'true';
  const { createGlass } = await import('../../../vendor/liquid-glass/liquid-glass.js');
  const lenses = new Map();

  const attach = (button) => {
    if (lenses.has(button)) return;
    const glass = createGlass(button, { ...RESTING, mode: 'backdrop', fit: true, fallback: '' });
    const classWatch = new view.MutationObserver(() => {
      glass.update(button.classList.contains('is-glass-pressed') ? PRESSED : { refraction: RESTING.refraction, specular: RESTING.specular });
    });
    classWatch.observe(button, { attributes: true, attributeFilter: ['class'] });
    lenses.set(button, { glass, watch: classWatch });
  };
  const sweep = () => {
    doc.querySelectorAll(GLASS_BUTTON_SELECTOR).forEach(attach);
    lenses.forEach(({ glass, watch }, button) => {
      if (button.isConnected) return;
      watch.disconnect();
      glass.destroy();
      lenses.delete(button);
    });
  };

  sweep();
  // The temporary chat controls move between the header and the workspace, so watch both, but only
  // the header's whole subtree: the workspace's own children change rarely, its messages often.
  const workspace = doc.getElementById('chat-workspace');
  const header = workspace?.querySelector(':scope > header');
  const structureWatch = new view.MutationObserver(sweep);
  if (workspace) structureWatch.observe(workspace, { childList: true });
  if (header) structureWatch.observe(header, { childList: true, subtree: true });
  return () => {
    structureWatch.disconnect();
    lenses.forEach(({ glass, watch }) => { watch.disconnect(); glass.destroy(); });
    lenses.clear();
    delete doc.documentElement.dataset.glassLens;
  };
}

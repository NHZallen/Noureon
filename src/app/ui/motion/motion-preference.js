// "Reduce motion" in the Accessibility settings (the person's own choice beside the one of the device): 'system' follows what the device says, 'on' cuts every transition and animation.
// The choice is the setting `reduceMotion` (it goes to the cloud with the others) and is mirrored in localStorage, so the page can mark itself before the first paint (public/theme-init.js
// reads the mirror, styles/layout.css cuts the motion of `html[data-motion="reduced"]`, and the scripts that ask "prefers-reduced-motion" are answered yes while it is on).

const MIRROR = 'noureon-reduce-motion';

export const normalizeReduceMotion = (value) => (value === 'on' ? 'on' : 'system');

/** Marks the page (and the mirror) for the choice. */
export function applyMotionPreference({ document, storage = null, value }) {
  const on = normalizeReduceMotion(value) === 'on';
  const root = document.documentElement;
  if (on) root.setAttribute('data-motion', 'reduced'); else root.removeAttribute('data-motion');
  try {
    if (on) storage?.setItem(MIRROR, 'on'); else storage?.removeItem(MIRROR);
  } catch { /* the mirror is only for the first paint */ }
}

/**
 * Adds the card "Motion" to the Accessibility settings, once: one switch that is saved as soon as it is pressed (like the choices of Privacy).
 * `getText(key)` gives the words of the language of the settings; the card is told again when the language changes (`data-lang-key`).
 */
export function mountMotionSetting({ document, config, saveConfig = async () => {}, getText = (key) => key, storage = globalThis.localStorage }) {
  const section = document.getElementById('accessibility-section');
  const wrap = section?.querySelector('.pz');
  applyMotionPreference({ document, storage, value: config.reduceMotion });
  if (!wrap || document.getElementById('reduce-motion-card')) return;
  const card = document.createElement('section');
  card.id = 'reduce-motion-card';
  card.className = 'pz-card';
  card.innerHTML = `
    <div class="pz-head"><h3 data-lang-key="motionCardTitle"></h3></div>
    <div class="pz-row">
      <div class="pz-text">
        <label for="reduce-motion-toggle" class="pz-label" data-lang-key="reduceMotion"></label>
        <p class="pz-sub text-[var(--text-secondary)]" data-lang-key="reduceMotionDesc"></p>
      </div>
      <div class="relative inline-block w-12 h-6 select-none transition duration-200 ease-in pz-toggle">
        <input type="checkbox" id="reduce-motion-toggle" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
        <label for="reduce-motion-toggle" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
      </div>
    </div>`;
  for (const node of card.querySelectorAll('[data-lang-key]')) node.textContent = getText(node.dataset.langKey);
  const input = card.querySelector('#reduce-motion-toggle');
  input.checked = normalizeReduceMotion(config.reduceMotion) === 'on';
  input.addEventListener('change', async () => {
    config.reduceMotion = input.checked ? 'on' : 'system';
    applyMotionPreference({ document, storage, value: config.reduceMotion });
    try { await saveConfig(); } catch (error) { console.warn('Saving the choice of reduced motion failed.', error); }
  });
  wrap.append(card);
}

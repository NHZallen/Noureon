// The row above the Extensions entry of the left menu where the usage rings of the providers stand side by side (OpenCode Go: opencode-quota/, OpenRouter:
// openrouter-ring.js). The row is made by the first ring that asks for it and stays above the Extensions entry, which is made by another part of the page, a
// moment later. An empty row (no ring is shown) takes no room (styles/opencode-quota.css).

export const QUOTA_ROW_ID = 'provider-quota-row';
const EXTENSIONS_ID = 'open-cli-store-btn';

export function getQuotaRow(document) {
  const list = document.querySelector('#sidebar .overflow-y-auto');
  if (!list) return null;
  let row = document.getElementById(QUOTA_ROW_ID);
  if (!row) {
    row = document.createElement('div');
    row.id = QUOTA_ROW_ID;
    row.className = 'oq-row';
  }
  const place = () => {
    const entry = document.getElementById(EXTENSIONS_ID);
    const before = entry && entry.parentNode === list ? entry : list.firstChild;
    if (before === row || (row.parentNode === list && row.nextSibling === before)) return;
    list.insertBefore(row, before);
  };
  place();
  const win = document.defaultView;
  if (!row.dataset.watched && typeof win?.MutationObserver === 'function') {
    row.dataset.watched = 'true';
    new win.MutationObserver(() => place()).observe(list, { childList: true });
  }
  return row;
}

// ----- the panel beside the rings: a tap on a ring opens it with the words of that ring (what is left, when it starts again, what was spent), a tap on the same ring
// closes it, a tap on the other ring changes what it says. Only one is open. It opens and closes by growing and shrinking (a grid whose tracks go from 0fr to 1fr, so the
// width and the height both move; styles/opencode-quota.css); the words stay while it closes. `lines` is [{ name, value, sub }].

export const QUOTA_PANEL_ID = 'provider-quota-panel';
const panels = new WeakMap();

export function getQuotaPanel(document) {
  const row = getQuotaRow(document);
  if (!row) return null;
  if (panels.has(row)) return panels.get(row);
  const panel = document.createElement('div');
  panel.id = QUOTA_PANEL_ID;
  panel.className = 'oq-panel';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = '<div class="oq-panel-clip"><div class="oq-panel-inner"></div></div>';
  row.append(panel);
  const clip = panel.querySelector('.oq-panel-clip');
  const inner = panel.querySelector('.oq-panel-inner');
  let owner = null;

  const mark = () => {
    panel.classList.toggle('is-open', owner !== null);
    panel.setAttribute('aria-hidden', owner === null ? 'true' : 'false');
    for (const button of row.querySelectorAll('.oq-entry')) {
      button.classList.toggle('is-open', button.id === owner);
      button.setAttribute('aria-expanded', button.id === owner ? 'true' : 'false');
      button.setAttribute('aria-controls', QUOTA_PANEL_ID);
    }
  };
  const fill = (lines) => {
    inner.replaceChildren(...lines.map(({ name, value, sub }) => {
      const line = document.createElement('div');
      line.className = 'oq-pl';
      const top = document.createElement('div');
      top.className = 'oq-pl-top';
      const nameElement = document.createElement('span');
      nameElement.className = 'oq-pl-name';
      nameElement.textContent = name;
      const valueElement = document.createElement('span');
      valueElement.className = 'oq-pl-val';
      valueElement.textContent = value;
      top.append(nameElement, valueElement);
      line.append(top);
      if (sub) {
        const subElement = document.createElement('div');
        subElement.className = 'oq-pl-sub';
        subElement.textContent = sub;
        line.append(subElement);
      }
      return line;
    }));
  };

  const controller = {
    owner: () => owner,
    isOpen: () => owner !== null,
    open(id, lines) {
      const switching = owner !== null && owner !== id;
      const from = clip.offsetHeight;
      owner = id;
      fill(lines);
      mark();
      // Already open for the other ring: the words change, and the panel grows or shrinks to them (and they fade in) instead of jumping.
      if (switching) {
        const to = inner.offsetHeight;
        if (typeof clip.animate === 'function' && from > 0 && to > 0 && from !== to) clip.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        if (typeof inner.animate === 'function') inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
    },
    close() { owner = null; mark(); },
    /** Opens for `id`, or closes when it is open for `id` already. Resolves true when it is open now. */
    toggle(id, lines) {
      if (owner === id) controller.close();
      else controller.open(id, lines);
      return owner === id;
    },
    /** New words for the ring that has the panel (a new answer came); nothing when the panel is closed or is another ring's. */
    update(id, lines) { if (owner === id) fill(lines); },
    /** The ring is gone (no key, no answer): its panel closes. */
    release(id) { if (owner === id) controller.close(); }
  };
  panels.set(row, controller);
  return controller;
}

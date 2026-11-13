// Long settings pages on a phone show their cards as a short list of rows (the title of each card and an arrow); a tap opens that card alone as a page of its own, with its title at the
// top, and the arrow at the top goes back to the list (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §20). It is the way the settings of the big vendors are laid out.
// Only the stylesheet changes what is on the screen (the `data-cp` and `data-cp-page` of the section, in settings-card-pages.css), so a card that is drawn again (the Privacy page draws
// itself again when the language changes) keeps working. A computer sees every card on the page as before.

import { onSettingsSectionBack } from './settings-section-back.js';

const SECTIONS = new Set(['model-management-section', 'privacy-section']);

export function mountCardPages({ document, window, section }) {
  if (!section || !SECTIONS.has(section.id) || section.dataset.cp === 'on') return;
  section.dataset.cp = 'on';
  let open = -1;
  let rootTitle = '';
  const cards = () => [...section.querySelectorAll('.pz > .pz-card')];
  const titleNode = () => document.getElementById('settings-mobile-title');

  // The marks follow the cards, which may have been drawn again: the one that is open, and the rows that can be pressed.
  function apply() {
    const list = cards();
    if (open >= list.length) open = -1;
    list.forEach((card, index) => {
      card.classList.toggle('cp-open', index === open);
      const head = card.querySelector(':scope > .pz-head');
      if (head && !head.hasAttribute('role')) { head.setAttribute('role', 'button'); head.tabIndex = 0; }
    });
    section.dataset.cpPage = open >= 0 ? 'open' : '';
  }

  function openCard(index) {
    const card = cards()[index];
    if (!card) return;
    rootTitle = titleNode()?.textContent || rootTitle;
    open = index;
    apply();
    if (titleNode()) titleNode().textContent = card.querySelector(':scope > .pz-head')?.textContent.trim() || rootTitle;
    const scroller = section.closest('.scroll-area') || section.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }

  const back = () => {
    if (open < 0) return false;
    open = -1;
    apply();
    if (titleNode() && rootTitle) titleNode().textContent = rootTitle;
    return true;
  };

  const pressed = (event) => {
    if (open >= 0 || (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ')) return;
    const head = event.target.closest?.('.pz > .pz-card > .pz-head');
    if (!head) return;
    event.preventDefault?.();
    openCard(cards().indexOf(head.parentElement));
  };
  section.addEventListener('click', pressed);
  section.addEventListener('keydown', pressed);
  const Observer = window?.MutationObserver;
  if (Observer) {
    // Cards are drawn again inside the page (the speech card after a tap, the Privacy page after a language change): a card that replaces the open one has no mark, and every
    // other card is hidden while a page is open, so the screen would be blank. The whole subtree is watched; `apply` only changes attributes, so it does not call itself.
    new Observer(apply).observe(section, { childList: true, subtree: true });
    new Observer(() => { if (!section.classList.contains('active') && open >= 0) { open = -1; apply(); } }).observe(section, { attributes: true, attributeFilter: ['class'] });
  }
  onSettingsSectionBack(section.id, back);
  apply();
}

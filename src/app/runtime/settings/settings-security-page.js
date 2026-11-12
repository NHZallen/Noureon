// The security page of the settings, beside the user page (settings-sync-vault-controls.js builds both): its entry in the list of parts, its page, and the
// show/hide button of its password boxes.

import { buildSecuritySectionMarkup } from './settings-user-section-markup.js';
import { mountSecurityPages } from './settings-security-pages.js';

/** The entry and the page of security and sign-in right after the user page's. Returns the page. */
export function mountSecurityPage({ document, text, userNav, userSection }) {
  const nav = document.getElementById('security-section-nav') || document.createElement('li');
  nav.id = 'security-section-nav';
  nav.className = 'settings-nav-item p-3 rounded-md';
  nav.dataset.section = 'security';
  nav.dataset.langKey = 'securitySettings';
  nav.textContent = text('securitySettings', '安全性與登入');
  if (!nav.parentNode) userNav.after(nav);
  const section = document.getElementById('security-section') || document.createElement('div');
  section.id = 'security-section';
  section.className = 'settings-section';
  section.innerHTML = buildSecuritySectionMarkup(text);
  if (!section.parentNode) userSection.after(section);
  mountSecurityPages({ document, window: document.defaultView, text, section });
  return section;
}

/** The click of the show/hide button of a password box: turns the box between dots and text and says what the button does now. */
export const togglePasswordEye = (event, text) => {
  const eye = event.target.closest?.('[data-us-eye]');
  const input = eye?.parentElement?.querySelector('input');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  const label = show ? text('userHidePassword', '隱藏密碼') : text('userShowPassword', '顯示密碼');
  eye.setAttribute('aria-pressed', String(show));
  eye.setAttribute('aria-label', label);
  eye.title = label;
};

import { renderComposerToolIcon } from '../../composer-tool-icons.js';

export function renderModelCouncilMenuItem(button, { label, description }) {
  button.innerHTML = `
    ${renderComposerToolIcon('modelCouncil')}
    <span class="composer-menu-copy"><span class="composer-menu-label"></span><span class="composer-menu-description"></span></span>
  `;
  button.querySelector('.composer-menu-label').textContent = label;
  button.querySelector('.composer-menu-description').textContent = description;
}

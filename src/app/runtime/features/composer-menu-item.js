export function renderModelCouncilMenuItem(button, { label, description }) {
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
    <span class="composer-menu-copy"><span class="composer-menu-label"></span><span class="composer-menu-description"></span></span>
  `;
  button.querySelector('.composer-menu-label').textContent = label;
  button.querySelector('.composer-menu-description').textContent = description;
}

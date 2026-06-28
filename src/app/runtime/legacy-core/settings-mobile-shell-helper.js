import {
  SETTINGS_MOBILE_ICON_MAP,
  getSettingsMobileGroups as getSettingsMobileGroupsBase
} from '../../legacy-runtime/features/settings-mobile-metadata.js';

const SETTINGS_MOBILE_VIEW_TRANSITION_MS = 280;

const requiredDependencies = [
  'window',
  'document',
  'elements',
  'escapeHTML',
  'getSettingsText',
  'handleLogout',
  'setTimeout',
  'clearTimeout'
];

function assertRequiredDependencies(dependencies) {
  const missing = requiredDependencies.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new TypeError(`createSettingsMobileShellHelper missing dependencies: ${missing.join(', ')}`);
  }
}

export function createSettingsMobileShellHelper(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    window,
    document,
    elements: ALL_ELEMENTS,
    escapeHTML,
    getSettingsText,
    handleLogout,
    setTimeout,
    clearTimeout
  } = dependencies;

  let settingsMobileViewTransitionTimer = null;

  const isMobileSettingsViewport = () => window.matchMedia('(max-width: 768px)').matches;
  const getSettingsMobileGroups = () => getSettingsMobileGroupsBase(getSettingsText);

  const renderSettingsMobileList = () => {
    const settingsMobileList = document.getElementById('settings-mobile-list');
    if (!settingsMobileList) return;
    settingsMobileList.innerHTML = getSettingsMobileGroups().map(group => `
        <section class="settings-mobile-group">
            <h3 class="settings-mobile-group-title">${escapeHTML(group.title)}</h3>
            <div class="settings-mobile-card">
                ${group.items.map(item => `
                    <button type="button" class="settings-mobile-list-item settings-nav-item" data-section="${escapeHTML(item.section)}" data-mobile-title="${escapeHTML(item.label)}">
                        <span class="settings-mobile-row-icon">${SETTINGS_MOBILE_ICON_MAP[item.section] || SETTINGS_MOBILE_ICON_MAP.about}</span>
                        <span class="settings-mobile-row-label">${escapeHTML(item.label)}</span>
                        <span class="settings-mobile-chevron" aria-hidden="true">&rsaquo;</span>
                    </button>
                `).join('')}
            </div>
        </section>
    `).join('') + `
        <section class="settings-mobile-group settings-mobile-logout-group">
            <div class="settings-mobile-card">
                <button type="button" id="settings-mobile-logout-btn" class="settings-mobile-list-item settings-mobile-list-item-danger">
                    <span class="settings-mobile-row-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path></svg>
                    </span>
                    <span class="settings-mobile-row-label">${escapeHTML(getSettingsText('logout', '登出'))}</span>
                </button>
            </div>
        </section>
    `;
    settingsMobileList.querySelector('#settings-mobile-logout-btn')?.addEventListener('click', handleLogout);
  };

  const ensureSettingsMobileShell = () => {
    const settingsBody = ALL_ELEMENTS.settingsModal?.querySelector('.flex.flex-1.overflow-hidden');
    if (!settingsBody || document.getElementById('settings-mobile-header')) return;
    const mobileHeader = document.createElement('div');
    mobileHeader.id = 'settings-mobile-header';
    mobileHeader.innerHTML = `
        <button type="button" id="settings-mobile-back-btn" aria-label="${escapeHTML(getSettingsText('back', 'Back'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
        <h2 id="settings-mobile-title">${escapeHTML(getSettingsText('settings', '設定'))}</h2>
    `;
    const mobileList = document.createElement('div');
    mobileList.id = 'settings-mobile-list';
    settingsBody.prepend(mobileList);
    settingsBody.prepend(mobileHeader);
    const settingsMobileBackBtn = document.getElementById('settings-mobile-back-btn');
    settingsMobileBackBtn.addEventListener('click', () => showSettingsMobileList());
    mobileList.addEventListener('click', (event) => {
      const item = event.target.closest('.settings-mobile-list-item');
      if (!item?.dataset.section) return;
      openSettingsMobileSection(item.dataset.section);
    });
  };

  const clearSettingsMobileViewTransition = () => {
    if (!settingsMobileViewTransitionTimer) return;
    clearTimeout(settingsMobileViewTransitionTimer);
    settingsMobileViewTransitionTimer = null;
  };

  const showSettingsMobileList = ({ animate = true } = {}) => {
    ensureSettingsMobileShell();
    renderSettingsMobileList();
    const settingsModal = ALL_ELEMENTS.settingsModal;
    const finishReturn = () => {
      settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
      document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '設定');
      document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
      settingsMobileViewTransitionTimer = null;
    };
    clearSettingsMobileViewTransition();
    if (animate && isMobileSettingsViewport() && settingsModal.classList.contains('settings-mobile-detail-open')) {
      settingsModal.classList.add('settings-mobile-returning');
      document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '設定');
      settingsMobileViewTransitionTimer = setTimeout(finishReturn, SETTINGS_MOBILE_VIEW_TRANSITION_MS);
      return;
    }
    finishReturn();
    document.getElementById('settings-mobile-title').textContent = getSettingsText('settings', '設定');
    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
  };

  const openSettingsMobileSection = (sectionName) => {
    ensureSettingsMobileShell();
    clearSettingsMobileViewTransition();
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (!targetSection) return;
    ALL_ELEMENTS.settingsModal.classList.remove('settings-mobile-returning');
    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
    targetSection.classList.add('active');
    const listItem = Array.from(document.querySelectorAll('#settings-mobile-list [data-section]')).find(item => item.dataset.section === sectionName);
    document.getElementById('settings-mobile-title').textContent = listItem?.dataset.mobileTitle || sectionName;
    ALL_ELEMENTS.settingsModal.classList.add('settings-mobile-detail-open');
  };

  return {
    ensureSettingsMobileShell,
    renderSettingsMobileList,
    clearSettingsMobileViewTransition,
    showSettingsMobileList,
    openSettingsMobileSection,
    isMobileSettingsViewport,
    getSettingsMobileGroups,
    settingsMobileViewTransitionMs: SETTINGS_MOBILE_VIEW_TRANSITION_MS
  };
}

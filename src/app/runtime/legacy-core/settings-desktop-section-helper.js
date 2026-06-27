const requiredDependencies = [
  'document',
  'elements',
  'isMobileSettingsViewport',
  'showSettingsMobileList',
  'clearSettingsMobileViewTransition'
];

function assertRequiredDependencies(dependencies) {
  const missing = requiredDependencies.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new TypeError(`createSettingsDesktopSectionHelper missing dependencies: ${missing.join(', ')}`);
  }
}

export function createSettingsDesktopSectionHelper(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    document,
    elements: ALL_ELEMENTS,
    isMobileSettingsViewport,
    showSettingsMobileList,
    clearSettingsMobileViewTransition
  } = dependencies;

  const getNavItems = () => Array.from(ALL_ELEMENTS.settingsNav.querySelectorAll('.settings-nav-item'));

  const activateDesktopSettingsSection = (item, navItems = getNavItems()) => {
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const sectionId = item.dataset.section + '-section';
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
  };

  const bindDesktopSettingsSections = () => {
    const navItems = getNavItems();
    navItems.forEach(item => {
      if (item.dataset.settingsDesktopBound === 'true') return;
      item.dataset.settingsDesktopBound = 'true';
      item.addEventListener('click', () => {
        activateDesktopSettingsSection(item, navItems);
      });
    });
    return navItems;
  };

  const syncSettingsSectionForViewport = (navItems = bindDesktopSettingsSections()) => {
    if (isMobileSettingsViewport()) {
      showSettingsMobileList({ animate: false });
      return;
    }
    clearSettingsMobileViewTransition();
    ALL_ELEMENTS.settingsModal.classList.remove('settings-mobile-detail-open', 'settings-mobile-returning');
    const activeNavItem = ALL_ELEMENTS.settingsNav.querySelector('.settings-nav-item.active') || ALL_ELEMENTS.settingsNav.querySelector('.settings-nav-item');
    if (activeNavItem) {
      navItems.forEach(i => i.classList.toggle('active', i === activeNavItem));
      document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
      document.getElementById(`${activeNavItem.dataset.section}-section`)?.classList.add('active');
    }
  };

  return {
    activateDesktopSettingsSection,
    bindDesktopSettingsSections,
    syncSettingsSectionForViewport
  };
}

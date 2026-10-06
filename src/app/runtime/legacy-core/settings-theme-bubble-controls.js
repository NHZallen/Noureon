const requiredDependencies = [
  'window',
  'document',
  'elements',
  'config',
  'userBubbleColors',
  'saveConfig'
];

function assertRequiredDependencies(dependencies) {
  const missing = requiredDependencies.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new TypeError(`createSettingsThemeBubbleControls missing dependencies: ${missing.join(', ')}`);
  }
}

function getColorName(color) {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

const DEFAULT_APPEARANCE_MODE = 'light';

export function createSettingsThemeBubbleControls(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    window,
    document,
    elements: ALL_ELEMENTS,
    config,
    userBubbleColors: USER_BUBBLE_COLORS,
    saveConfig
  } = dependencies;

  const setUserBubbleColor = () => {
    const root = document.documentElement;
    const mode = DEFAULT_APPEARANCE_MODE;
    const colors = USER_BUBBLE_COLORS[config.userBubbleColor] || USER_BUBBLE_COLORS.default;
    const hexColor = colors[mode];
    root.style.setProperty('--user-bubble-bg', hexColor);
  };

  const renderBubbleColorDropdown = ({
    container,
    colorMap,
    configKey,
    applyColor,
    renderDropdown
  }) => {
    container.innerHTML = '';
    const currentColor = config[configKey];
    const currentName = getColorName(currentColor);
    const currentHex = colorMap[currentColor][DEFAULT_APPEARANCE_MODE];
    const btn = document.createElement('button');
    btn.className = 'color-dropdown-btn';
    btn.dataset.color = currentColor;
    btn.innerHTML = `
        <div class="color-preview" style="background-color: ${currentHex};"></div>
        <span>${currentName}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    const menu = document.createElement('div');
    menu.className = 'color-dropdown-menu';
    Object.keys(colorMap).forEach(color => {
      const option = document.createElement('div');
      option.className = 'color-option';
      option.dataset.color = color;
      const preview = document.createElement('div');
      preview.className = 'color-preview';
      preview.style.backgroundColor = colorMap[color][DEFAULT_APPEARANCE_MODE];
      const name = getColorName(color);
      option.appendChild(preview);
      option.appendChild(document.createTextNode(name));
      option.addEventListener('click', () => {
        config[configKey] = color;
        renderDropdown();
        applyColor();
        menu.classList.remove('show');
      });
      menu.appendChild(option);
    });
    btn.addEventListener('click', () => {
      menu.classList.toggle('show');
      const rect = btn.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const roomBelow = window.innerHeight - rect.bottom;
      const roomAbove = rect.top;
      // Open upward only when it does not fit below and there is more room above; the gap matches the CSS default.
      if (menuRect.height > roomBelow && roomAbove > roomBelow) {
        menu.style.top = 'auto';
        menu.style.bottom = 'calc(100% + 0.45rem)';
      } else {
        menu.style.top = 'calc(100% + 0.45rem)';
        menu.style.bottom = 'auto';
      }
    });
    container.appendChild(btn);
    container.appendChild(menu);
  };

  const renderUserBubbleColorDropdown = () => {
    renderBubbleColorDropdown({
      container: ALL_ELEMENTS.userBubbleColorDropdown,
      colorMap: USER_BUBBLE_COLORS,
      configKey: 'userBubbleColor',
      applyColor: setUserBubbleColor,
      renderDropdown: renderUserBubbleColorDropdown
    });
  };

  const updateThemeButtons = () => {};

  const setTheme = async () => {
    delete config.theme;
    setUserBubbleColor();
    await saveConfig();
    if (!ALL_ELEMENTS.settingsModal.classList.contains('hidden')) {
      renderUserBubbleColorDropdown();
    }
  };

  return {
    setUserBubbleColor,
    renderUserBubbleColorDropdown,
    renderBubbleColorDropdown,
    setTheme,
    updateThemeButtons
  };
}

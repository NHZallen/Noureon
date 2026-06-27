const requiredDependencies = [
  'window',
  'document',
  'elements',
  'config',
  'aiBubbleColors',
  'userBubbleColors',
  'hexToRgba',
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

export function createSettingsThemeBubbleControls(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    window,
    document,
    elements: ALL_ELEMENTS,
    config,
    aiBubbleColors: AI_BUBBLE_COLORS,
    userBubbleColors: USER_BUBBLE_COLORS,
    hexToRgba,
    saveConfig
  } = dependencies;

  const setAiBubbleColor = () => {
    const root = document.documentElement;
    const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
    const mode = config.theme;
    const colors = AI_BUBBLE_COLORS[config.aiBubbleColor] || AI_BUBBLE_COLORS.default;
    const hexColor = colors[mode];
    if (isWallpaperActive) {
      const rgbaColor = hexToRgba(hexColor, 0.75);
      root.style.setProperty('--ai-bubble-bg', rgbaColor);
    } else {
      root.style.setProperty('--ai-bubble-bg', 'transparent');
    }
  };

  const setUserBubbleColor = () => {
    const root = document.documentElement;
    const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
    const mode = config.theme;
    const colors = USER_BUBBLE_COLORS[config.userBubbleColor] || USER_BUBBLE_COLORS.default;
    const hexColor = colors[mode];
    if (isWallpaperActive) {
      const rgbaColor = hexToRgba(hexColor, 0.7);
      root.style.setProperty('--user-bubble-bg', rgbaColor);
    } else {
      root.style.setProperty('--user-bubble-bg', hexColor);
    }
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
    const currentHex = colorMap[currentColor][config.theme];
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
      preview.style.backgroundColor = colorMap[color][config.theme];
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
      if (rect.bottom + menuRect.height > window.innerHeight) {
        menu.style.top = 'auto';
        menu.style.bottom = '100%';
      } else {
        menu.style.top = '100%';
        menu.style.bottom = 'auto';
      }
    });
    container.appendChild(btn);
    container.appendChild(menu);
  };

  const renderAiBubbleColorDropdown = () => {
    renderBubbleColorDropdown({
      container: ALL_ELEMENTS.aiBubbleColorDropdown,
      colorMap: AI_BUBBLE_COLORS,
      configKey: 'aiBubbleColor',
      applyColor: setAiBubbleColor,
      renderDropdown: renderAiBubbleColorDropdown
    });
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

  const updateThemeButtons = () => {
    ALL_ELEMENTS.themeDarkBtn.classList.remove('active');
    ALL_ELEMENTS.themeLightBtn.classList.remove('active');
    if (config.theme === 'dark') {
      ALL_ELEMENTS.themeDarkBtn.classList.add('active');
    } else {
      ALL_ELEMENTS.themeLightBtn.classList.add('active');
    }
  };

  const setTheme = async (theme) => {
    if (document.body.classList.contains('custom-wallpaper-active')) {
      return;
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
    config.theme = theme;
    setAiBubbleColor();
    setUserBubbleColor();
    await saveConfig();
    updateThemeButtons();
    if (!ALL_ELEMENTS.settingsModal.classList.contains('hidden')) {
      renderAiBubbleColorDropdown();
      renderUserBubbleColorDropdown();
    }
  };

  return {
    setAiBubbleColor,
    setUserBubbleColor,
    renderAiBubbleColorDropdown,
    renderUserBubbleColorDropdown,
    renderBubbleColorDropdown,
    setTheme,
    updateThemeButtons
  };
}

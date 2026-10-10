// What is left of the old theme and bubble settings: the theme of an earlier version is dropped from the settings, and the colour of a
// message bubble is no longer a setting (it follows the accent, see --user-bubble-bg in src/styles/tokens.css).
const requiredDependencies = [
  'config',
  'saveConfig'
];

function assertRequiredDependencies(dependencies) {
  const missing = requiredDependencies.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new TypeError(`createSettingsThemeBubbleControls missing dependencies: ${missing.join(', ')}`);
  }
}

export function createSettingsThemeBubbleControls(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const { config, saveConfig } = dependencies;

  const updateThemeButtons = () => {};

  const setTheme = async () => {
    delete config.theme;
    await saveConfig();
  };

  return {
    setTheme,
    updateThemeButtons
  };
}

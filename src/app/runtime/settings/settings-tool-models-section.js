// The "models a text model may call" tab of the settings, next to the Permissions tab (settings-permissions-section.js, which it follows):
// the picture model a text model draws with. What is drawn is ui/tool-models/tool-models-view.js; the choice is saved as soon as it is made.

import { MODELS, getProviderLabel, modelGeneratesImages } from '../shell/model-registry.js';
import { getImageToolModel, setImageToolModel } from '../tool-models/tool-models-state.js';
import { toolModelText } from '../tool-models/tool-models-texts.js';
import { renderToolModelsView } from '../../ui/tool-models/tool-models-view.js';

const SECTION_ID = 'tool-models-section';
const NAV_ID = 'tool-models-section-nav';
const languageBound = new WeakSet();

/** Adds the tab (and its section) once, and draws it in the language of the page. */
export function ensureToolModelsSettingsSection({ document, elements, config, saveConfig = async () => {} }) {
  const nav = elements.settingsNav || document.getElementById('settings-nav');
  const anchorNav = document.getElementById('permissions-section-nav');
  const anchorSection = document.getElementById('permissions-section');
  if (!nav || !anchorNav || !anchorSection) return;

  let language = config.uiLanguage;
  if (!document.getElementById(NAV_ID)) {
    const item = document.createElement('li');
    item.className = 'settings-nav-item p-3 rounded-md';
    item.id = NAV_ID;
    item.dataset.section = 'tool-models';
    item.dataset.langKey = 'toolModels';
    item.textContent = toolModelText(language, 'nav');
    anchorNav.after(item);
  }
  let section = document.getElementById(SECTION_ID);
  if (!section) {
    section = document.createElement('div');
    section.className = 'settings-section';
    section.id = SECTION_ID;
    anchorSection.after(section);
  }

  const imageModels = MODELS.filter(modelGeneratesImages).map((model) => ({ id: model.id, provider: model.provider, name: model.name, providerLabel: getProviderLabel(model.provider) }));
  const draw = () => {
    // (A page that is only a stand-in for a document, as in some tests, has nothing to draw into.)
    if (typeof section.replaceChildren !== 'function') return;
    renderToolModelsView({
      document,
      root: section,
      getLanguage: () => language,
      models: imageModels,
      getImageModel: () => getImageToolModel(config),
      setImageModel: (model) => setImageToolModel(config, model),
      hasKey: (provider) => Boolean(config.apiKeys?.[provider]),
      save: () => saveConfig().catch((error) => console.warn('Saving the models a text model may call failed.', error))
    });
  };
  draw();
  // The language menu applies at once while the settings stay open.
  const languageSelect = elements.uiLanguageSelect;
  if (languageSelect?.addEventListener && !languageBound.has(languageSelect)) {
    languageBound.add(languageSelect);
    languageSelect.addEventListener('change', (event) => {
      language = event.target.value;
      const navItem = document.getElementById(NAV_ID);
      if (navItem) navItem.textContent = toolModelText(language, 'nav');
      draw();
    });
  }
}

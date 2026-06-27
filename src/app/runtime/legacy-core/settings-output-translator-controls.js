import { getOutputModeSettingsText } from '../../legacy-runtime/features/output-mode-settings-text.js';

const REQUIRED_DEPENDENCIES = [
  'document',
  'elements',
  'config',
  'i18n',
  'getOutputMode',
  'getCouncilTranslatorCandidates',
  'getSingleTranslatorCandidates',
  'getProviderLabel',
  'getModelPriceLabel',
  'modelSupportsVision',
  'modelSupportsDocumentUpload',
  'escapeHTML'
];

function assertRequiredDependencies(dependencies) {
  const missing = REQUIRED_DEPENDENCIES.filter((key) => dependencies[key] == null);
  if (missing.length > 0) {
    throw new Error(`createSettingsOutputTranslatorControls missing dependencies: ${missing.join(', ')}`);
  }
}

export function createSettingsOutputTranslatorControls(dependencies = {}) {
  assertRequiredDependencies(dependencies);

  const {
    document,
    elements,
    config,
    i18n,
    getOutputMode,
    getCouncilTranslatorCandidates,
    getSingleTranslatorCandidates,
    getProviderLabel,
    getModelPriceLabel,
    modelSupportsVision,
    modelSupportsDocumentUpload,
    escapeHTML
  } = dependencies;

  const ensureCouncilTranslatorSettingsControls = () => {
    if (!document.getElementById('nvidia-api-key-input')) {
      const openrouterInput = document.getElementById('openrouter-api-key-input-all');
      const openrouterBlock = openrouterInput?.closest('div');
      if (openrouterBlock) {
        openrouterBlock.insertAdjacentHTML('afterend', `
                <div>
                    <label for="step-plan-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="stepPlanApiKey">Step Plan API Key</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="stepPlanApiDesc">Enable StepFun Step Plan reasoning models.</p>
                    <input type="password" id="step-plan-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="sk-..." data-lang-key-placeholder="stepPlanApiPlaceholder">
                </div>
                <div>
                    <label for="nvidia-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="nvidiaApiKey">NVIDIA API Key</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="nvidiaApiDesc">Enable NVIDIA free models.</p>
                    <input type="password" id="nvidia-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="nvapi-..." data-lang-key-placeholder="nvidiaApiPlaceholder">
                </div>
                <div>
                    <label for="tavily-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="tavilyApiKey">Tavily API Key</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilyApiDesc">Used for OpenRouter and NVIDIA web search.</p>
                    <input type="password" id="tavily-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="tvly-..." data-lang-key-placeholder="tavilyApiPlaceholder">
                </div>
                <div>
                    <label for="tavily-search-depth-select" class="block text-sm font-medium mb-1" data-lang-key="tavilySearchDepth">Tavily search depth</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilySearchDepthDesc">Choose basic for lower cost, or advanced for deeper searches.</p>
                    <select id="tavily-search-depth-select" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]">
                        <option value="basic" data-lang-key="tavilySearchBasic">Basic</option>
                        <option value="advanced" data-lang-key="tavilySearchAdvanced">Advanced</option>
                    </select>
                </div>
                <div>
                    <label for="council-translator-model-select" class="block text-sm font-medium mb-1" data-lang-key="councilTranslatorModel">Council document translation</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="councilTranslatorModelDesc">Only translates attachments or documents that council members cannot read directly.</p>
                    <input type="hidden" id="council-translator-model-select">
                    <div class="translator-model-picker" data-translator-picker="councilTranslatorModelId"></div>
                </div>
                <div>
                    <label for="single-document-translator-model-select" class="block text-sm font-medium mb-1" data-lang-key="singleDocumentTranslatorModel">單模型文件轉譯模型</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="singleDocumentTranslatorModelDesc">選擇單模型模式下，附件或文件無法直接讀取時使用的轉譯模型。</p>
                    <input type="hidden" id="single-document-translator-model-select">
                    <div class="translator-model-picker" data-translator-picker="singleDocumentTranslatorModelId"></div>
                </div>
                
            `);
      }
    }
    if (!document.getElementById('tavily-api-key-input')) {
      const nvidiaInput = document.getElementById('nvidia-api-key-input');
      const nvidiaBlock = nvidiaInput?.closest('div');
      if (nvidiaBlock) {
        nvidiaBlock.insertAdjacentHTML('afterend', `
                <div>
                    <label for="tavily-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="tavilyApiKey">Tavily API Key</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilyApiDesc">Used for OpenRouter and NVIDIA web search.</p>
                    <input type="password" id="tavily-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="tvly-..." data-lang-key-placeholder="tavilyApiPlaceholder">
                </div>
            `);
      }
    }
    if (!document.getElementById('tavily-search-depth-select')) {
      const tavilyInput = document.getElementById('tavily-api-key-input');
      const tavilyBlock = tavilyInput?.closest('div');
      if (tavilyBlock) {
        tavilyBlock.insertAdjacentHTML('afterend', `
                <div>
                    <label for="tavily-search-depth-select" class="block text-sm font-medium mb-1" data-lang-key="tavilySearchDepth">Tavily search depth</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilySearchDepthDesc">Choose basic for lower cost, or advanced for deeper searches.</p>
                    <select id="tavily-search-depth-select" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]">
                        <option value="basic" data-lang-key="tavilySearchBasic">Basic</option>
                        <option value="advanced" data-lang-key="tavilySearchAdvanced">Advanced</option>
                    </select>
                </div>
            `);
      }
    }
    if (!document.getElementById('step-plan-api-key-input')) {
      const openrouterInput = document.getElementById('openrouter-api-key-input-all');
      const openrouterBlock = openrouterInput?.closest('div');
      if (openrouterBlock) {
        openrouterBlock.insertAdjacentHTML('afterend', `
                <div>
                    <label for="step-plan-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="stepPlanApiKey">Step Plan API Key</label>
                    <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="stepPlanApiDesc">Enable StepFun Step Plan reasoning models.</p>
                    <input type="password" id="step-plan-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="sk-..." data-lang-key-placeholder="stepPlanApiPlaceholder">
                </div>
            `);
      }
    }
    elements.nvidiaApiKeyInput = document.getElementById('nvidia-api-key-input');
    elements.stepPlanApiKeyInput = document.getElementById('step-plan-api-key-input');
    elements.tavilyApiKeyInput = document.getElementById('tavily-api-key-input');
    elements.tavilySearchDepthSelect = document.getElementById('tavily-search-depth-select');
    elements.councilTranslatorModelSelect = document.getElementById('council-translator-model-select');
    elements.singleDocumentTranslatorModelSelect = document.getElementById('single-document-translator-model-select');
  };

  const renderTranslatorModelPicker = ({ input, pickerKey, configKey, candidates, emptyText }) => {
    const picker = document.querySelector(`[data-translator-picker="${pickerKey}"]`);
    if (!input || !picker) return;
    const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
    if (candidates.length === 0) {
      input.value = '';
      input.disabled = true;
      config[configKey] = null;
      picker.innerHTML = `
            <button type="button" class="translator-picker-button" disabled>
                <span>${escapeHTML(emptyText)}</span>
            </button>
        `;
      return;
    }
    input.disabled = false;
    if (!candidates.some(model => model.id === config[configKey])) {
      config[configKey] = candidates[0].id;
    }
    input.value = config[configKey] || '';
    const selectedModel = candidates.find(model => model.id === config[configKey]) || candidates[0];
    const featureLabels = (model) => [
      modelSupportsVision(model) ? (translations.vision || '視覺') : '',
      modelSupportsDocumentUpload(model) ? (translations.document || '文件') : ''
    ].filter(Boolean);
    const optionHTML = candidates.map(model => {
      const selected = model.id === selectedModel.id;
      return `
            <button type="button" class="translator-picker-option ${selected ? 'selected' : ''}" data-translator-option="${escapeHTML(model.id)}">
                <span class="translator-picker-option-main">
                    <strong>${escapeHTML(model.name)}</strong>
                    <small>${escapeHTML(getProviderLabel(model.provider))} · ${escapeHTML(getModelPriceLabel(model))}</small>
                </span>
                <span class="translator-picker-option-chips">
                    ${featureLabels(model).map(label => `<span>${escapeHTML(label)}</span>`).join('')}
                </span>
            </button>
        `;
    }).join('');
    picker.innerHTML = `
        <button type="button" class="translator-picker-button" data-translator-picker-button="${pickerKey}" aria-expanded="false">
            <span class="translator-picker-current">
                <strong>${escapeHTML(selectedModel.name)}</strong>
                <small>${escapeHTML(getProviderLabel(selectedModel.provider))} · ${escapeHTML(getModelPriceLabel(selectedModel))}</small>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="translator-picker-menu" data-translator-picker-menu="${pickerKey}" hidden>
            ${optionHTML}
        </div>
    `;
    picker.querySelector('[data-translator-picker-button]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = picker.querySelector('[data-translator-picker-menu]');
      const isOpen = !menu.hasAttribute('hidden');
      document.querySelectorAll('.translator-picker-menu').forEach(item => item.setAttribute('hidden', ''));
      document.querySelectorAll('[data-translator-picker-button]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      if (!isOpen) {
        menu.removeAttribute('hidden');
        picker.querySelector('[data-translator-picker-button]')?.setAttribute('aria-expanded', 'true');
      }
    });
    picker.querySelectorAll('[data-translator-option]').forEach(option => {
      option.addEventListener('click', () => {
        config[configKey] = option.dataset.translatorOption;
        input.value = config[configKey];
        renderTranslatorModelPickers();
      });
    });
  };

  const renderTranslatorModelPickers = () => {
    const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
    renderTranslatorModelPicker({
      input: elements.councilTranslatorModelSelect,
      pickerKey: 'councilTranslatorModelId',
      configKey: 'councilTranslatorModelId',
      candidates: getCouncilTranslatorCandidates(),
      emptyText: translations.noCouncilTranslatorModels || '沒有可用的評議翻譯模型'
    });
    renderTranslatorModelPicker({
      input: elements.singleDocumentTranslatorModelSelect,
      pickerKey: 'singleDocumentTranslatorModelId',
      configKey: 'singleDocumentTranslatorModelId',
      candidates: getSingleTranslatorCandidates(),
      emptyText: translations.noSingleTranslatorModels || '沒有可用的單模型翻譯模型'
    });

    if (!document.__translatorPickerOutsideHandlerBound) {
      document.__translatorPickerOutsideHandlerBound = true;
      document.addEventListener('click', (event) => {
        if (event.target.closest('.translator-model-picker')) return;
        document.querySelectorAll('.translator-picker-menu').forEach(item => item.setAttribute('hidden', ''));
        document.querySelectorAll('[data-translator-picker-button]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      });
    }
  };

  const syncOutputModeSettingsControls = () => {
    if (!elements.outputModeSelect) return;
    const row = document.getElementById('output-mode-setting-row');
    if (!row) return;
    const value = elements.outputModeSelect.value === 'realtime' ? 'realtime' : 'typewriter';
    row.querySelectorAll('[data-output-mode-option]').forEach(button => {
      const isActive = button.dataset.outputModeOption === value;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-checked', String(isActive));
    });
  };

  const ensureOutputModeSettingsControls = () => {
    const section = document.getElementById('accessibility-section');
    if (!section) return;
    let row = document.getElementById('output-mode-setting-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'output-mode-setting-row';
      row.className = 'mt-4';
      const anchor = section.querySelector('#auto-web-search-toggle-switch')?.closest('.flex.items-center.justify-between');
      if (anchor) {
        anchor.after(row);
      } else {
        section.appendChild(row);
      }
    }
    if (!row.querySelector('.custom-output-mode-select')) {
      row.innerHTML = `
            <div id="output-mode-label" class="block text-sm font-medium mb-1"></div>
            <p class="text-xs text-[var(--text-secondary)] mb-2"></p>
            <input type="hidden" id="output-mode-select" value="${escapeHTML(getOutputMode())}">
            <div class="custom-output-mode-select" role="radiogroup" aria-labelledby="output-mode-label">
                <button type="button" class="custom-output-mode-option" data-output-mode-option="typewriter" role="radio" aria-checked="false"></button>
                <button type="button" class="custom-output-mode-option" data-output-mode-option="realtime" role="radio" aria-checked="false"></button>
            </div>
        `;
    }
    const text = getOutputModeSettingsText(config.uiLanguage);
    row.querySelector('#output-mode-label').textContent = text.title;
    row.querySelector('p').textContent = text.desc;
    elements.outputModeSelect = row.querySelector('#output-mode-select');
    row.querySelector('[data-output-mode-option="typewriter"]').textContent = text.typewriter;
    row.querySelector('[data-output-mode-option="realtime"]').textContent = text.realtime;
    row.querySelectorAll('[data-output-mode-option]').forEach(button => {
      if (button.dataset.outputModeBound === 'true') return;
      button.dataset.outputModeBound = 'true';
      button.addEventListener('click', () => {
        elements.outputModeSelect.value = button.dataset.outputModeOption === 'realtime' ? 'realtime' : 'typewriter';
        syncOutputModeSettingsControls();
        elements.outputModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    syncOutputModeSettingsControls();
  };

  return {
    ensureCouncilTranslatorSettingsControls,
    ensureOutputModeSettingsControls,
    renderTranslatorModelPicker,
    renderTranslatorModelPickers,
    syncOutputModeSettingsControls
  };
}

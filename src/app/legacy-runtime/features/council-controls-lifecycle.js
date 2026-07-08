export function createCouncilControlsLifecycle(deps) {
  const {
    closeAllPopovers = () => {},
    councilMaxModels = 4,
    document,
    escapeHTML = (value) => String(value ?? ''),
    formatCouncilModelSummary = () => '',
    getActiveConversation = () => null,
    getConfig = () => ({}),
    getCouncilModelList = () => [],
    getCouncilRuntimeTexts = () => ({}),
    getCouncilTexts = () => ({}),
    getCouncilValidation = () => ({ ok: false, message: '' }),
    getI18n = () => ({}),
    getFileInputContainer = () => undefined,
    getIsCouncilRunning = () => false,
    getModelApiId = (model) => model?.id || '',
    getModelFamilyKey = (model) => model?.id || '',
    getModelFamilyName = (model) => model?.name || '',
    getModelPriceLabel = () => '',
    getModelsByIds = () => [],
    getProviderLabel = (provider) => provider || '',
    hasCouncilWebSearchAccess = () => false,
    modelSupportsDocumentUpload = () => false,
    modelSupportsVision = () => false,
    modelSupportsWebSearch = () => false,
    models = [],
    normalizeConversationModel = () => null,
    normalizeCouncilConfig = (value) => value,
    persistCouncilConfig = async () => {},
    renderInputIndicators = () => {},
    requestFrame = (callback) => callback(),
    saveAppData = async () => {},
    seedCouncilParticipants = () => {},
    showNotification = () => {}
  } = deps || {};

  const renderCouncilControls = () => {
    const fileInputContainer = getFileInputContainer();
    const inputControls = fileInputContainer?.parentElement;
    if (!inputControls) return;

    let container = document.getElementById('model-council-control');
    const existingPopover = container?.querySelector('#model-council-popover');
    const wasVisible = existingPopover?.classList.contains('visible') || false;
    const existingScrollArea = existingPopover?.querySelector('.council-popover-scroll-area');
    const previousScrollTop = wasVisible ? (existingScrollArea?.scrollTop || 0) : 0;
    const previousModelSearch = wasVisible
      ? (existingPopover?.querySelector('[data-council-model-search]')?.value || '')
      : '';

    if (!container) {
      container = document.createElement('div');
      container.id = 'model-council-control';
    }
    if (container.parentElement !== inputControls || container.previousElementSibling !== fileInputContainer) {
      fileInputContainer.insertAdjacentElement('afterend', container);
    }

    const conversation = getActiveConversation();
    if (!conversation) {
      container.innerHTML = '';
      return;
    }
    conversation.council = normalizeCouncilConfig(conversation.council);
    const config = getConfig();
    if (config.isLearningMode && !conversation.council.enabled) {
      container.innerHTML = '';
      return;
    }

    const i18n = getI18n();
    const texts = getCouncilTexts();
    const runtimeTexts = getCouncilRuntimeTexts();
    const validation = getCouncilValidation(conversation);
    const modelList = getCouncilModelList(conversation);
    const selectedParticipants = getModelsByIds(conversation.council.participantModelIds);
    const synthesizer = models.find((model) => model.id === conversation.council.synthesizerModelId);
    const participantSummary = formatCouncilModelSummary(selectedParticipants, 2);
    const isLocked = getIsCouncilRunning() && conversation.council.enabled;
    const supportsCouncilSearch = hasCouncilWebSearchAccess(
      synthesizer || normalizeConversationModel(conversation)
    );
    const language = config.uiLanguage;
    const languageText = i18n[language] || {};
    const labels = {
      ability: language === 'en' ? 'Capabilities' : '能力',
      document: language === 'en' ? 'Documents' : '文件',
      done: languageText.done || languageText.confirm || '完成',
      noExtraAbility: language === 'en' ? 'Text / file' : '文字 / 文件',
      price: language === 'en' ? 'Price' : '價格',
      provider: language === 'en' ? 'Provider' : '供應商',
      providerCount: language === 'en' ? 'providers' : '供應商',
      search: languageText.search || '搜尋',
      searchModels: language === 'en' ? 'Search models' : '搜尋模型',
      vision: language === 'en' ? 'Vision' : '視覺'
    };
    const statusText = conversation.council.enabled
      ? (validation.ok
        ? `${texts.ready} · ${selectedParticipants.length} · ${synthesizer?.name || texts.selectSynthesizer}`
        : validation.message)
      : texts.disabled;
    const searchDisabled = isLocked || conversation.archived || !supportsCouncilSearch;
    const listSeparator = ' · ';
    const localizedCouncilLabels = {
      'zh-TW': {
        ability: '能力',
        document: '文件',
        noExtraAbility: '文字 / 檔案',
        price: '價格',
        provider: '供應商',
        providerCount: '個供應商',
        search: '搜尋',
        searchModels: '搜尋模型',
        vision: '視覺'
      },
      en: {
        ability: 'Capabilities',
        document: 'Documents',
        noExtraAbility: 'Text / file',
        price: 'Price',
        provider: 'Provider',
        providerCount: 'providers',
        search: 'Search',
        searchModels: 'Search models',
        vision: 'Vision'
      },
      fr: {
        ability: 'Capacités',
        document: 'Documents',
        noExtraAbility: 'Texte / fichier',
        price: 'Prix',
        provider: 'Fournisseur',
        providerCount: 'fournisseurs',
        search: 'Rechercher',
        searchModels: 'Rechercher des modèles',
        vision: 'Vision'
      }
    };
    const searchTitle = supportsCouncilSearch
      ? (conversation.isWebSearchEnabled ? runtimeTexts.searchEnabledNote : (languageText.search || 'Search'))
      : (languageText.webSearchNotAvailable || 'Web search is not available for this model.');
    Object.assign(labels, localizedCouncilLabels[language] || localizedCouncilLabels['zh-TW'], {
      done: languageText.done || languageText.confirm || localizedCouncilLabels[language]?.done || 'Done',
      search: languageText.search || localizedCouncilLabels[language]?.search || localizedCouncilLabels['zh-TW'].search
    });

    const makeModelTooltip = (model) => {
      const abilities = [
        labels.noExtraAbility,
        modelSupportsVision(model) ? labels.vision : '',
        modelSupportsDocumentUpload(model) ? labels.document : '',
        modelSupportsWebSearch(model) ? labels.search : ''
      ].filter(Boolean).join(' · ');
      return `${model.name}\n${labels.provider}: ${getProviderLabel(model.provider)}\n${labels.ability}: ${abilities}\n${labels.price}: ${getModelPriceLabel(model)}`;
    };
    const renderModelMeta = (model) => `
      <span class="council-model-badges">
        ${modelSupportsVision(model) ? `<span class="council-capability-badge" title="${escapeHTML(labels.vision)}"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>${escapeHTML(labels.vision)}</span>` : ''}
        ${modelSupportsDocumentUpload(model) ? `<span class="council-capability-badge">${escapeHTML(labels.document)}</span>` : ''}
        ${modelSupportsWebSearch(model) ? `<span class="council-capability-badge">${escapeHTML(labels.search)}</span>` : ''}
      </span>
      <small>${escapeHTML(getProviderLabel(model.provider))} · ${escapeHTML(labels.price)}: ${escapeHTML(getModelPriceLabel(model))}</small>
    `;
    const groups = Array.from(modelList.reduce((map, model) => {
      const key = getModelFamilyKey(model);
      if (!map.has(key)) map.set(key, { key, name: getModelFamilyName(model) || model.name, variants: [] });
      map.get(key).variants.push(model);
      return map;
    }, new Map()).values())
      .map((group) => ({
        ...group,
        variants: group.variants.sort((a, b) => {
          const providerCompare = getProviderLabel(a.provider).localeCompare(getProviderLabel(b.provider));
          return providerCompare || a.name.localeCompare(b.name);
        })
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const renderRow = (model, type) => {
      const participant = type === 'participant';
      const checked = conversation.council.participantModelIds.includes(model.id);
      const selected = participant ? checked : conversation.council.synthesizerModelId === model.id;
      const maxed = participant && !checked
        && conversation.council.participantModelIds.length >= councilMaxModels;
      const disabled = isLocked || maxed;
      const searchText = `${model.name} ${getProviderLabel(model.provider)} ${getModelApiId(model)}`.toLowerCase();
      return `
        <label class="council-model-row ${selected ? 'selected' : ''} ${disabled ? 'is-disabled' : ''}" title="${escapeHTML(makeModelTooltip(model))}" data-council-search-text="${escapeHTML(searchText)}">
          <input type="${participant ? 'checkbox' : 'radio'}" ${participant ? '' : 'name="council-synthesizer"'} ${participant ? `data-council-participant="${escapeHTML(model.id)}"` : `data-council-synthesizer="${escapeHTML(model.id)}"`} ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
          <span><strong>${escapeHTML(model.name)}</strong>${renderModelMeta(model)}</span>
        </label>
      `;
    };
    const renderGroups = (type) => groups.map((group) => {
      if (group.variants.length === 1) return renderRow(group.variants[0], type);
      const providerNames = group.variants.map((model) => getProviderLabel(model.provider)).join(' · ');
      return `
        <div class="council-model-group" data-council-group-search-text="${escapeHTML(`${group.name} ${providerNames}`.toLowerCase())}">
          <div class="council-model-family-row">
            <span><strong>${escapeHTML(group.name)}</strong><small>${escapeHTML(String(group.variants.length))} ${escapeHTML(labels.providerCount)}</small></span>
            <span class="council-family-provider-list">${escapeHTML(providerNames)}</span>
          </div>
          <div class="council-provider-variant-list">${group.variants.map((model) => renderRow(model, type)).join('')}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="model-council-bar ${conversation.council.enabled ? 'is-enabled' : ''} ${isLocked ? 'is-locked' : ''}">
        <button type="button" id="model-council-toggle-btn" class="model-council-toggle" aria-expanded="${wasVisible ? 'true' : 'false'}" title="${escapeHTML(statusText)}">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>
          <span class="council-toggle-label">${texts.title}</span>
          ${participantSummary ? `<span class="council-toggle-models">${escapeHTML(participantSummary)}</span>` : ''}
          <span class="model-council-dot ${conversation.council.enabled ? (validation.ok ? 'ready' : 'warning') : 'off'}" aria-hidden="true"></span>
        </button>
        <div id="model-council-popover" class="popover model-council-popover ${wasVisible ? 'visible' : ''}">
          <div class="council-popover-sticky-controls">
            <div class="council-popover-header">
              <div><h3 class="council-popover-title">${texts.title}</h3><p class="model-council-status ${validation.ok || !conversation.council.enabled ? '' : 'warning'}">${escapeHTML(statusText)}</p></div>
              <button type="button" id="model-council-close-btn" class="council-popover-close" title="${escapeHTML(labels.done)}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="council-popover-header compact council-config-row">
              <div class="council-mode-cluster">
                <button type="button" id="model-council-enabled" class="council-enable-pill ${conversation.council.enabled ? 'is-active' : ''}" aria-pressed="${conversation.council.enabled ? 'true' : 'false'}" ${isLocked ? 'disabled' : ''}>${texts.enable}</button>
                <div class="council-mode-tabs">
                  <button type="button" class="${conversation.council.mode === 'consensus' ? 'active' : ''}" data-council-mode="consensus" ${isLocked ? 'disabled' : ''}>${texts.consensus}</button>
                  <button type="button" class="${conversation.council.mode === 'deliberation' ? 'active' : ''}" data-council-mode="deliberation" ${isLocked ? 'disabled' : ''}>${texts.deliberation}</button>
                </div>
              </div>
              <div class="council-action-cluster">
                <button type="button" id="model-council-search-toggle" class="council-search-toggle ${conversation.isWebSearchEnabled ? 'is-active' : ''}" aria-pressed="${conversation.isWebSearchEnabled ? 'true' : 'false'}" title="${escapeHTML(searchTitle)}" ${searchDisabled ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><span>${escapeHTML(labels.search)}</span></button>
                <label class="council-model-search-field" title="${escapeHTML(labels.searchModels)}"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg><input type="search" data-council-model-search value="${escapeHTML(previousModelSearch)}" placeholder="${escapeHTML(labels.searchModels)}" aria-label="${escapeHTML(labels.searchModels)}" autocomplete="off"></label>
              </div>
            </div>
            ${isLocked ? `<p class="council-search-note is-locked">${escapeHTML(runtimeTexts.councilLocked)}</p>` : ''}
          </div>
          <div class="council-popover-scroll-area">
            <div class="council-section"><div class="council-section-title">${texts.participants} (${selectedParticipants.length}/${councilMaxModels})</div><div class="council-model-list">${renderGroups('participant')}</div></div>
            <div class="council-section"><div class="council-section-title">${texts.synthesizer}</div><div class="council-model-list">${renderGroups('synthesizer')}</div></div>
            <div class="council-popover-bottom">
              <label class="council-raw-row"><input type="checkbox" id="model-council-show-raw" ${conversation.council.showRawResponses ? 'checked' : ''} ${isLocked ? 'disabled' : ''}><span>${texts.rawNotes}</span></label>
              <label class="council-raw-row"><input type="checkbox" id="model-council-show-comparison" ${conversation.council.showComparisonTable ? 'checked' : ''} ${isLocked ? 'disabled' : ''}><span>${runtimeTexts.comparisonToggle}</span></label>
              <p class="council-validation ${validation.ok || !conversation.council.enabled ? '' : 'warning'}">${escapeHTML(conversation.council.enabled ? validation.message : texts.required)}</p>
              <div class="council-popover-footer"><button type="button" id="model-council-done-btn" class="council-done-btn">${escapeHTML(labels.done)}</button></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const popover = container.querySelector('#model-council-popover');
    const scrollArea = container.querySelector('.council-popover-scroll-area');
    const toggleButton = container.querySelector('#model-council-toggle-btn');
    const updateStickyOffset = () => {
      const stickyControls = popover.querySelector('.council-popover-sticky-controls');
      popover.style.setProperty('--council-sticky-offset', `${stickyControls?.offsetHeight || 0}px`);
    };
    requestFrame(updateStickyOffset);
    if (wasVisible) requestFrame(() => {
      if (scrollArea) scrollArea.scrollTop = previousScrollTop;
      updateStickyOffset();
    });

    const closePopover = () => {
      popover.classList.remove('visible');
      toggleButton.setAttribute('aria-expanded', 'false');
    };
    const searchInput = container.querySelector('[data-council-model-search]');
    const applySearch = () => {
      const query = (searchInput?.value || '').trim().toLowerCase();
      container.querySelectorAll('.council-model-list > .council-model-row[data-council-search-text]')
        .forEach((row) => { row.hidden = !!query && !(row.dataset.councilSearchText || '').includes(query); });
      container.querySelectorAll('.council-model-group').forEach((group) => {
        const groupMatches = !!query && (group.dataset.councilGroupSearchText || '').includes(query);
        let visible = false;
        group.querySelectorAll('.council-model-row[data-council-search-text]').forEach((row) => {
          const matches = !query || groupMatches || (row.dataset.councilSearchText || '').includes(query);
          row.hidden = !matches;
          visible ||= matches;
        });
        group.hidden = !!query && !groupMatches && !visible;
      });
    };
    searchInput?.addEventListener('input', applySearch);
    applySearch();
    toggleButton.addEventListener('click', () => {
      const visible = popover.classList.contains('visible');
      closeAllPopovers();
      popover.classList.toggle('visible', !visible);
      if (!visible) requestFrame(() => { if (scrollArea) scrollArea.scrollTop = 0; });
      toggleButton.setAttribute('aria-expanded', String(!visible));
    });
    container.querySelector('#model-council-close-btn').addEventListener('click', closePopover);
    container.querySelector('#model-council-done-btn').addEventListener('click', closePopover);
    container.querySelector('#model-council-enabled').addEventListener('click', async () => {
      if (getIsCouncilRunning()) {
        showNotification(runtimeTexts.councilLocked, 'warning');
        renderCouncilControls();
        return;
      }
      conversation.council.enabled = !conversation.council.enabled;
      if (conversation.council.enabled) seedCouncilParticipants(conversation);
      await persistCouncilConfig(conversation);
      renderCouncilControls();
      if (conversation.council.enabled && !conversation.isWebSearchEnabled) {
        showNotification(runtimeTexts.searchManualNotice, 'warning');
      }
    });
    container.querySelector('#model-council-search-toggle')?.addEventListener('click', async () => {
      if (getIsCouncilRunning()) {
        showNotification(runtimeTexts.councilLocked, 'warning');
        renderCouncilControls();
        return;
      }
      if (!supportsCouncilSearch || conversation.archived) {
        showNotification(languageText.webSearchNotAvailable || '當前模型不支援或無法使用聯網搜尋。', 'warning');
        return;
      }
      conversation.isWebSearchEnabled = !conversation.isWebSearchEnabled;
      await saveAppData();
      renderCouncilControls();
      renderInputIndicators();
    });
    container.querySelectorAll('[data-council-mode]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (getIsCouncilRunning()) {
          showNotification(runtimeTexts.councilLocked, 'warning');
          return;
        }
        conversation.council.mode = button.dataset.councilMode;
        await persistCouncilConfig(conversation);
        renderCouncilControls();
      });
    });
    container.querySelectorAll('[data-council-participant]').forEach((input) => {
      input.addEventListener('change', async () => {
        if (getIsCouncilRunning()) {
          showNotification(runtimeTexts.councilLocked, 'warning');
          renderCouncilControls();
          return;
        }
        const nextIds = new Set(conversation.council.participantModelIds);
        if (input.checked) {
          if (nextIds.size >= councilMaxModels) {
            showNotification(texts.tooMany, 'warning');
            renderCouncilControls();
            return;
          }
          nextIds.add(input.dataset.councilParticipant);
        } else {
          nextIds.delete(input.dataset.councilParticipant);
        }
        conversation.council.participantModelIds = Array.from(nextIds);
        await persistCouncilConfig(conversation);
      });
    });
    container.querySelectorAll('[data-council-synthesizer]').forEach((input) => {
      input.addEventListener('change', async () => {
        if (getIsCouncilRunning()) {
          showNotification(runtimeTexts.councilLocked, 'warning');
          renderCouncilControls();
          return;
        }
        if (!input.checked) return;
        conversation.council.synthesizerModelId = input.dataset.councilSynthesizer;
        await persistCouncilConfig(conversation);
      });
    });
    container.querySelector('#model-council-show-raw').addEventListener('change', async (event) => {
      if (getIsCouncilRunning()) {
        showNotification(runtimeTexts.councilLocked, 'warning');
        renderCouncilControls();
        return;
      }
      conversation.council.showRawResponses = event.target.checked;
      await persistCouncilConfig(conversation);
    });
    container.querySelector('#model-council-show-comparison').addEventListener('change', async (event) => {
      if (getIsCouncilRunning()) {
        showNotification(runtimeTexts.councilLocked, 'warning');
        renderCouncilControls();
        return;
      }
      conversation.council.showComparisonTable = event.target.checked;
      await persistCouncilConfig(conversation);
    });
  };

  return { renderCouncilControls };
}

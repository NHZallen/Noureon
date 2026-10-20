// The dialog that searches the conversations: the three ways to search (titles, contents, by meaning), the field with its magnifier, and
// the dialog kept within the part of the screen a phone's keyboard leaves visible.

export function setupConversationSearchModal({
    window, document, elements: ALL_ELEMENTS, i18n, config, toggleModal, performSearchAndRenderResults,
    scheduleAnimationFrame, scheduleTimeout, clearScheduledTimeout,
    // The dialog's stylesheet loads the first time it opens, not with the page; it opens plain if the sheet cannot be loaded.
    loadStyles = () => import('../../../styles/conversation-search.css'),
    logger = console
}) {
    let stylesLoaded = null;
    const ensureStyles = () => stylesLoaded ||= Promise.resolve().then(loadStyles).catch((error) => {
        stylesLoaded = null;
        logger?.warn?.('Loading the styles of the search failed.', error);
    });
    const searchToolbar = ALL_ELEMENTS.modalSearchInput.parentElement;
    const searchHeader = ALL_ELEMENTS.closeSearchModalBtn.parentElement;
    searchToolbar?.classList.add('conversation-search-toolbar');
    searchHeader?.classList.add('conversation-search-header');
    const closeSearchLabel = i18n[config.uiLanguage]?.close || '關閉';
    ALL_ELEMENTS.closeSearchModalBtn.setAttribute('aria-label', closeSearchLabel);
    ALL_ELEMENTS.closeSearchModalBtn.title = closeSearchLabel;
    ALL_ELEMENTS.closeSearchModalBtn.dataset.langKeyAria = 'close';
    ALL_ELEMENTS.closeSearchModalBtn.dataset.langKeyTitle = 'close';
    ALL_ELEMENTS.closeSearchModalBtn.innerHTML = `
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                        <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                    </svg>
                `;
    ALL_ELEMENTS.modalSearchScopeSelect.classList.add('conversation-search-native-select');
    const searchModes = [
        ['keyword-title', i18n[config.uiLanguage]?.searchScopeTitle || '標題', 'searchScopeTitle'],
        ['keyword-content', i18n[config.uiLanguage]?.searchScopeContent || '內容', 'searchScopeContent'],
        ['natural', i18n[config.uiLanguage]?.searchScopeNatural || '自然語意', 'searchScopeNatural']
    ];
    const searchModeControl = document.createElement('div');
    searchModeControl.className = 'conversation-search-mode-control';
    searchModeControl.setAttribute('aria-label', i18n[config.uiLanguage]?.searchConversations || '搜尋模式');
    searchModeControl.dataset.langKeyAria = 'searchConversations';
    const naturalSearchHint = document.createElement('p');
    naturalSearchHint.className = 'conversation-search-enter-hint';
    naturalSearchHint.textContent = i18n[config.uiLanguage]?.naturalSearchEnterHint || '按下 Enter 開始搜尋';
    naturalSearchHint.dataset.langKey = 'naturalSearchEnterHint';
    const syncSearchModeControl = () => {
        const isNaturalSearch = ALL_ELEMENTS.modalSearchScopeSelect.value === 'natural';
        searchModeControl.querySelectorAll('button').forEach((button) => {
            const isActive = button.dataset.scope === ALL_ELEMENTS.modalSearchScopeSelect.value;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        naturalSearchHint.classList.toggle('is-visible', isNaturalSearch);
        naturalSearchHint.setAttribute('aria-hidden', String(!isNaturalSearch));
    };
    searchModes.forEach(([value, label, labelKey]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.scope = value;
        button.dataset.langKey = labelKey;
        button.textContent = label;
        button.addEventListener('click', () => {
            if (ALL_ELEMENTS.modalSearchScopeSelect.value === value) return;
            ALL_ELEMENTS.modalSearchScopeSelect.value = value;
            syncSearchModeControl();
            if (value !== 'natural' || !ALL_ELEMENTS.modalSearchInput.value.trim()) {
                performSearchAndRenderResults();
            }
        });
        searchModeControl.appendChild(button);
    });
    searchToolbar?.insertBefore(searchModeControl, ALL_ELEMENTS.modalSearchInput);
    searchToolbar?.insertBefore(naturalSearchHint, ALL_ELEMENTS.modalSearchInput);
    const searchInputWrap = document.createElement('div');
    searchInputWrap.className = 'conversation-search-input-wrap';
    searchInputWrap.innerHTML = `
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                        <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"></circle>
                        <path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                    </svg>
                `;
    searchToolbar?.insertBefore(searchInputWrap, ALL_ELEMENTS.modalSearchInput);
    searchInputWrap.appendChild(ALL_ELEMENTS.modalSearchInput);
    syncSearchModeControl();
    const previousSearchViewportGeometry = {
        top: '',
        left: '',
        width: '',
        height: ''
    };
    const syncSearchViewport = () => {
        const visualViewport = window.visualViewport;
        const fallbackViewportWidth =
        Number(document.documentElement?.clientWidth)
        || Number(window.innerWidth)
        || 0;
        const fallbackViewportHeight =
        Number(document.documentElement?.clientHeight)
        || Number(window.innerHeight)
        || 0;
        const visibleViewportWidth = Number(visualViewport?.width) || fallbackViewportWidth;
        const visibleViewportHeight = Number(visualViewport?.height) || fallbackViewportHeight;
        const visibleViewportOffsetTop = Math.max(0, Number(visualViewport?.offsetTop) || 0);
        const visibleViewportOffsetLeft = Math.max(0, Number(visualViewport?.offsetLeft) || 0);
        const nextGeometry = {
            top: `${Math.round(visibleViewportOffsetTop)}px`,
            left: `${Math.round(visibleViewportOffsetLeft)}px`,
            width: `${Math.round(visibleViewportWidth)}px`,
            height: `${Math.round(visibleViewportHeight)}px`
        };
        Object.entries(nextGeometry).forEach(([property, value]) => {
            if (previousSearchViewportGeometry[property] === value) return;
            ALL_ELEMENTS.searchModal.style.setProperty(`--search-viewport-${property}`, value);
            previousSearchViewportGeometry[property] = value;
        });
    };
    let searchViewportSyncFrame = null;
    const queueSearchViewportSync = () => {
        if (typeof window.requestAnimationFrame !== 'function') {
            syncSearchViewport();
            return;
        }
        if (searchViewportSyncFrame !== null) return;
        searchViewportSyncFrame = window.requestAnimationFrame(() => {
            searchViewportSyncFrame = null;
            syncSearchViewport();
        });
    };
    syncSearchViewport();
    window.visualViewport?.addEventListener('resize', queueSearchViewportSync);
    window.visualViewport?.addEventListener('scroll', queueSearchViewportSync);
    ALL_ELEMENTS.openSearchBtn.addEventListener('click', () => ensureStyles().then(() => {
        syncSearchViewport();
        toggleModal(ALL_ELEMENTS.searchModal, true);
        ALL_ELEMENTS.openSearchBtn.classList.add('active'); // <-- ✨ 加上這一行
        ALL_ELEMENTS.modalSearchInput.value = '';
        performSearchAndRenderResults();
        scheduleAnimationFrame(() => {
            try {
                ALL_ELEMENTS.modalSearchInput.focus({ preventScroll: true });
            } catch {
                ALL_ELEMENTS.modalSearchInput.focus();
            }
            queueSearchViewportSync();
        });
    }));
    ALL_ELEMENTS.closeSearchModalBtn.addEventListener('click', () => {
        toggleModal(ALL_ELEMENTS.searchModal, false);
        ALL_ELEMENTS.openSearchBtn.classList.remove('active'); // <-- ✨ 加上這一行
    });
    ALL_ELEMENTS.performSearchBtn.addEventListener('click', performSearchAndRenderResults);
    ALL_ELEMENTS.modalSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearchAndRenderResults();
        }
    });
    ALL_ELEMENTS.modalSearchInput.addEventListener('focus', queueSearchViewportSync);
    let searchTypingTimer = null;
    ALL_ELEMENTS.modalSearchInput.addEventListener('input', () => {
        if (ALL_ELEMENTS.modalSearchScopeSelect.value === 'natural') return;
        clearScheduledTimeout(searchTypingTimer);
        searchTypingTimer = scheduleTimeout(performSearchAndRenderResults, 180);
    });
    ALL_ELEMENTS.modalSearchScopeSelect.addEventListener('change', () => {
        syncSearchModeControl();
        if (ALL_ELEMENTS.modalSearchScopeSelect.value !== 'natural') performSearchAndRenderResults();
    });
}

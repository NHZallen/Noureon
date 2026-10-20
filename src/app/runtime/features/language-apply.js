// Shows the page in a language: the words of the elements marked with data-lang-key (and its placeholder, title and aria forms), the
// settings' section titles, and the parts that write their own words drawn again when the language changes.

import { ensureLanguage, isLanguageLoaded } from '../../i18n/language-packs.js';

export function createLanguageApply({
    window, document, elements: ALL_ELEMENTS, i18n, legacyRuntimeContext, console,
    renderAstras, renderInputIndicators, renderCouncilControls, renderStore, renderTrash, renderPersonalMemoryList
}) {
    let lastAppliedLanguage = null;
    const applyLanguage = (lang) => {
        const resolvedLanguage = i18n[lang] ? lang : 'zh-TW';
        // The words of a language the page has not loaded yet (the text tables are cut by language, NOU-17) come first; the page stays in the language it shows meanwhile.
        if (!isLanguageLoaded(resolvedLanguage)) {
            ensureLanguage(resolvedLanguage).then(() => applyLanguage(resolvedLanguage), (error) => console.warn('The words of the language could not be loaded:', error));
            return;
        }
        const languageChanged = resolvedLanguage !== lastAppliedLanguage;
        lastAppliedLanguage = resolvedLanguage;
        // Kept for the next start: the page that shows while the app loads (and the one for a failed start) is written in it.
        try { localStorage.setItem('noureon_ui_language', resolvedLanguage); } catch { /* storage refused */ }
        const translations = i18n[resolvedLanguage];
        document.documentElement.lang = resolvedLanguage;
        document.documentElement.dir = 'ltr';
        document.querySelectorAll('[data-lang-key]').forEach(el => {
            const key = el.dataset.langKey;
            if (translations[key]) {
                el.textContent = translations[key];
            }
        });
        document.querySelectorAll('[data-lang-key-placeholder]').forEach(el => {
            const key = el.dataset.langKeyPlaceholder;
            if (translations[key]) {
                el.placeholder = translations[key];
            }
        });
        document.querySelectorAll('[data-lang-key-title]').forEach(el => {
            const key = el.dataset.langKeyTitle;
            if (translations[key]) {
                el.title = translations[key];
            }
        });
        document.querySelectorAll('[data-lang-key-aria]').forEach(el => {
            const key = el.dataset.langKeyAria;
            if (translations[key]) {
                el.setAttribute('aria-label', translations[key]);
            }
        });
        const replyLanguageLabels = {
            'zh-TW': translations.languageNameZhTW || 'Traditional Chinese',
            en: translations.languageNameEn || 'English',
            fr: translations.languageNameFr || 'French',
            ru: translations.languageNameRu || 'Russian',
            es: translations.languageNameEs || 'Spanish'
        };
        ALL_ELEMENTS.aiLanguageSelect?.querySelectorAll('option').forEach(option => {
            if (replyLanguageLabels[option.value]) {
                option.textContent = replyLanguageLabels[option.value];
            }
        });
        document.querySelectorAll('#settings-nav .settings-nav-item[data-section]').forEach(item => {
            const section = document.getElementById(`${item.dataset.section}-section`);
            const sectionTitleKey = item.dataset.langKey;
            if (section && translations[sectionTitleKey]) {
                section.dataset.sectionTitle = translations[sectionTitleKey];
            }
        });
        const mobileSettingsTitle = document.getElementById('settings-mobile-title');
        const activeSettingsItem = document.querySelector('#settings-nav .settings-nav-item.active');
        if (mobileSettingsTitle && activeSettingsItem) {
            const activeTitleKey = activeSettingsItem.dataset.langKey;
            const showsSectionTitle = ALL_ELEMENTS.settingsModal?.classList.contains('settings-mobile-detail-open');
            mobileSettingsTitle.textContent = (showsSectionTitle && translations[activeTitleKey]) || translations.settings || 'Settings';
        }
        if(ALL_ELEMENTS.loginLangLabel) {
            ALL_ELEMENTS.loginLangLabel.textContent = translations.currentLanguageName || '繁體中文';
        }
        legacyRuntimeContext.resolveBinding('input.updateInputState')();
        document.documentElement.lang = lang;
        // Noura names are localized when the list is built, not through data-lang-key, so the
        // sidebar and the active-Noura chip keep the old language until they are rebuilt.
        // Guarded so repeated applyLanguage calls with the same language stay free.
        // Pieces that fill their own words (the account part of the settings, the security check) listen and fill them again.
        if (languageChanged) window.dispatchEvent?.(new CustomEvent('astra:language-changed', { detail: { language: resolvedLanguage } }));
        if (languageChanged) {
            renderAstras();
            renderInputIndicators();
            // The council bar sits under the composer in every conversation and builds its
            // labels at render time, so it would otherwise stay in the previous language.
            renderCouncilControls();
            // These three also build their labels at render time and previously self-healed
            // only when reopened; rebuild them so a panel that is already open (or a remote
            // language change while the store is showing) switches immediately.
            renderStore();
            renderTrash();
            renderPersonalMemoryList();
        }
    };
    return applyLanguage;
}

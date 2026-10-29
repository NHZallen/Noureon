import { isLanguageLoaded, isLanguageSplit, onLanguageLoaded, readBeforeLoaded } from '../../../app/i18n/language-packs.js';
import login from './login.js';
import appUi from './app-ui.js';
import modelSwitcher from './model-switcher.js';
import settings from './settings.js';
import dialogs from './dialogs.js';
import planEditor from './plan-editor.js';
import menus from './menus.js';
import nourasStore from './nouras-store.js';
import dashboard from './dashboard.js';
import p2pSync from './p2p-sync.js';
import notifications from './notifications.js';
import modelDescriptions from './model-descriptions.js';
import officialNouras from './official-nouras.js';
import accountAndSyncPassword from './account-and-sync-password.js';
import memoryAndImport from './memory-and-import.js';
import chatActionsAndErrors from './chat-actions-and-errors.js';
import openai from './openai.js';

const parts = [
    login,
    appUi,
    modelSwitcher,
    settings,
    dialogs,
    planEditor,
    menus,
    nourasStore,
    dashboard,
    p2pSync,
    notifications,
    modelDescriptions,
    officialNouras,
    accountAndSyncPassword,
    memoryAndImport,
    chatActionsAndErrors,
    openai
];

const mergeLocale = (locale) => Object.assign({}, ...parts.map((part) => part[locale]));

// The texts of a language for the app (`i18n[language]`). In the browser build the parts are cut by language (NOU-17): the object is made empty and filled
// once the words of the language are loaded (src/app/i18n/language-packs.js); read before that, it loads them and says so once. Everywhere else
// (tests, the server, the scripts) the parts are whole and the object is full at once.
const localeTexts = (locale) => {
    const live = mergeLocale(locale);
    onLanguageLoaded(locale, () => Object.assign(live, mergeLocale(locale)));
    if (!isLanguageSplit) return live;
    return new Proxy(live, {
        get(target, property, receiver) {
            if (typeof property === 'string' && !isLanguageLoaded(locale)) readBeforeLoaded(locale, 'src/data/i18n');
            return Reflect.get(target, property, receiver);
        }
    });
};

export { parts, mergeLocale, localeTexts };

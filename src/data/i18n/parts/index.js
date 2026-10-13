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
    chatActionsAndErrors
];

const mergeLocale = (locale) => Object.assign({}, ...parts.map((part) => part[locale]));

export { parts, mergeLocale };

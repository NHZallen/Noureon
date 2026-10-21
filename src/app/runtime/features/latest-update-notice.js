// What is new since the version the person last saw (the dialog shown once after an update), and the version number in the settings.

import { compareVersions } from '../../legacy-runtime/features/version-compare.js';
import { localizeUpdateLogs } from '../../../data/update-logs/translations.js';
import { renderLatestUpdates } from '../../ui/updates/update-log-view.js';

export function createLatestUpdateNotice({
    document, elements: ALL_ELEMENTS, getConfig, i18n, updateLogs, productVersion, sanitizeTrustedHTML, toggleModal, saveConfig,
    // The window's stylesheet loads when it is shown, not with the page; it shows plain if the sheet cannot be loaded.
    loadStyles = () => import('../../../styles/update-log.css').catch((error) => console.warn('Loading the styles of the update notes failed.', error))
}) {
    const checkAndShowLatestUpdate = async () => {
        if (!getConfig().enableUpdateNotifications || typeof updateLogs === 'undefined' || updateLogs.length === 0) {
            return;
        }
        const lastSeenVersion = getConfig().lastSeenVersion || '0.0.0'; // 如果從未見過，則設為 '0.0.0'
        const newUpdates = updateLogs.filter(log => compareVersions(log.version, lastSeenVersion) > 0);
        if (newUpdates.length > 0) {
            newUpdates.sort((a, b) => compareVersions(b.version, a.version));
            const contentContainer = ALL_ELEMENTS.latestUpdateContent;
            const modalTitle = document.querySelector('#latest-update-modal h2');
            if (modalTitle) {
                modalTitle.textContent = i18n[getConfig().uiLanguage].newVersionsFound.replace('{count}', newUpdates.length);
            }
            // The notes are written in Traditional Chinese; the other languages are loaded as they are asked for (data/update-logs/translations.js).
            const [shown] = await Promise.all([localizeUpdateLogs(newUpdates, getConfig().uiLanguage), loadStyles()]);
            renderLatestUpdates({ document, container: contentContainer, logs: shown, sanitize: sanitizeTrustedHTML });
            toggleModal(ALL_ELEMENTS.latestUpdateModal, true);
            const latestVersionInLog = newUpdates[0].version; // 因為我們已經排序了，所以 newUpdates[0] 現在是最新版
            getConfig().lastSeenVersion = latestVersionInLog;
            await saveConfig();
        }
    };
    const updateDisplayedVersion = () => {
        // The number comes from the single product version source, not from the update log.
        // The surrounding label is translated separately via data-lang-key="versionNumber".
        const versionDisplayElement = document.getElementById('version-number-display');
        if (versionDisplayElement && productVersion) {
            versionDisplayElement.textContent = productVersion;
        }
    };
    return { checkAndShowLatestUpdate, updateDisplayedVersion };
}

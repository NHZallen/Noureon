const requiredDependencies = [
    'window', 'document', 'elements', 'legacyRuntimeContext', 'state',
    'runtimeConfigAccess', 'runtimeAppDataStore', 'runtimeDialogCoordinator',
    'i18n', 'models', 'getSensitiveApiKeys', 'mergeSensitiveApiKeys',
    'saveSensitiveConfig', 'saveConfig', 'saveAppData', 'renderAll', 'loadChat',
    'toggleModal', 'showNotification'
];

export function assertLegacyTransitionBusDependencies(dependencies) {
    const missing = requiredDependencies.filter(key => dependencies[key] == null);
    if (missing.length) {
        throw new TypeError(`createLegacyTransitionBusLifecycle missing dependencies: ${missing.join(', ')}`);
    }
}

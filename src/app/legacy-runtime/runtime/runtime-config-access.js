export function createRuntimeConfigAccess({
    getConfig,
    replaceConfig,
    syncConfig
} = {}) {
    const readConfig = () => getConfig?.();

    const syncCurrentConfig = (currentConfig) => {
        syncConfig?.(currentConfig);
        return currentConfig;
    };

    return {
        getConfig: readConfig,
        replaceConfig(nextConfig) {
            const replacedConfig = replaceConfig?.(nextConfig) ?? nextConfig;
            return syncCurrentConfig(replacedConfig);
        },
        mutateConfig(mutatorOrPatch) {
            const currentConfig = readConfig();
            if (!currentConfig) return currentConfig;
            if (typeof mutatorOrPatch === 'function') {
                mutatorOrPatch(currentConfig);
            } else if (mutatorOrPatch && typeof mutatorOrPatch === 'object') {
                Object.assign(currentConfig, mutatorOrPatch);
            }
            return syncCurrentConfig(currentConfig);
        },
        getUiLanguage() {
            return readConfig()?.uiLanguage;
        }
    };
}

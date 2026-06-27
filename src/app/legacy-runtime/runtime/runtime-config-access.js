export function createRuntimeConfigAccess({
    getConfig,
    replaceConfig
} = {}) {
    const readConfig = () => getConfig?.();

    return {
        getConfig: readConfig,
        replaceConfig(nextConfig) {
            return replaceConfig?.(nextConfig) ?? nextConfig;
        },
        mutateConfig(mutatorOrPatch) {
            const currentConfig = readConfig();
            if (!currentConfig) return currentConfig;
            if (typeof mutatorOrPatch === 'function') {
                mutatorOrPatch(currentConfig);
            } else if (mutatorOrPatch && typeof mutatorOrPatch === 'object') {
                Object.assign(currentConfig, mutatorOrPatch);
            }
            return currentConfig;
        },
        getUiLanguage() {
            return readConfig()?.uiLanguage;
        }
    };
}

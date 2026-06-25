export function createRuntimeConfigAccess({
    getConfig
} = {}) {
    return {
        getUiLanguage() {
            return getConfig?.()?.uiLanguage;
        }
    };
}

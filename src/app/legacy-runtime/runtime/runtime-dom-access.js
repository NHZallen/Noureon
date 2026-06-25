export function createRuntimeDomAccess({ getElements, logger } = {}) {
    const getOptionalElement = (key) => {
        const elements = getElements?.();
        return elements?.[key] ?? null;
    };

    const getRequiredElement = (key) => {
        const element = getOptionalElement(key);
        if (!element) {
            logger?.warn?.(`[runtime-dom-access] Missing required element: ${key}`);
        }
        return element ?? null;
    };

    return {
        getOptionalElement,
        getRequiredElement
    };
}

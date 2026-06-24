export function createRuntimeDialogCoordinator({
    showNotification,
    logger = console
} = {}) {
    return {
        showNotification(...args) {
            if (typeof showNotification !== 'function') {
                logger?.warn?.('[legacy-runtime] showNotification callback is not available');
                return undefined;
            }
            return showNotification(...args);
        }
    };
}

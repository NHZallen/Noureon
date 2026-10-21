// How the page asks a model (part of the settings and provider lifecycle, settings-auth-provider-lifecycle.js). The work is in
// model-request-engine.js, loaded the first time a model is asked, or before when the page is idle, so it is not in the startup files.
// Every function here is async and hands its arguments on to the engine's.

import { createLazyFunctions } from '../kernel/lazy-functions.js';

export function createModelRequestRuntime({
    loadEngine = () => import('./model-request-engine.js'),
    whenIdle = null,
    ...dependencies
}) {
    const { load, ...runtime } = createLazyFunctions(
        () => loadEngine().then(({ createModelRequestEngine }) => createModelRequestEngine(dependencies)),
        ['streamApiCall', 'runMemoryModel', 'buildSingleModelTranslatedRequestParts', 'fetchTavilySearchPacket',
            'streamCouncilApiCallWithRetry', 'runModelCouncil', 'callApiWithSchema', 'generateTitleAndSummary']
    );
    if (typeof whenIdle === 'function') {
        whenIdle(() => load().catch((error) => dependencies.console?.warn?.('Loading the model requests ahead failed.', error)));
    }
    return { ...runtime, prepareModelRequests: load };
}

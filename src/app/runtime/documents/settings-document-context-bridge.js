import { supportsNativeDocumentExtraction } from './document-extractors.js';

export function createSettingsDocumentContextBridge(dependencies) {
  let servicePromise = null;
  const getService = () => servicePromise ||= import('./document-runtime-service.js')
    .then(({ createDocumentRuntimeService }) => createDocumentRuntimeService(dependencies));
  return Object.freeze({
    supportsAttachment: supportsNativeDocumentExtraction,
    buildContext: async options => (await getService()).buildContext(options),
    indexTranscription: async options => (await getService()).indexTranscription(options),
    removeLinks: async filters => (await getService()).removeLinks(filters),
    cancelJob: async jobId => (await getService()).cancelJob(jobId),
    clear: async () => (await getService()).clear()
  });
}

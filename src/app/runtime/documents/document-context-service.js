import { createDocumentChunks } from './document-chunker.js';
import {
  base64ToBytes,
  extractNativeDocument,
  supportsNativeDocumentExtraction
} from './document-extractors.js';
import {
  createDocumentStorageKey,
  DOCUMENT_EXTRACTION_VERSION,
  sha256Hex
} from './document-schema.js';
import {
  DOCUMENT_UNTRUSTED_DATA_INSTRUCTION,
  formatRetrievedDocumentContext,
  retrieveDocumentChunks
} from './document-retrieval.js';
import { extractionContainsOcr } from './document-ocr-artifact.js';

const nowIso = now => new Date(now()).toISOString();
const randomId = cryptoProvider => cryptoProvider?.randomUUID?.() || `document-job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const isStorageQuotaError = error => error?.name === 'QuotaExceededError'
  || /quota|storage.*full|disk.*full/i.test(String(error?.message || ''));
const detectDocumentLanguage = text => {
  const sample = String(text || '').slice(0, 10000);
  if (/[぀-ヿ]/u.test(sample)) return 'ja';
  if (/[가-힯]/u.test(sample)) return 'ko';
  if (/[㐀-鿿]/u.test(sample)) return 'zh';
  return /[A-Za-z]/u.test(sample) ? 'en' : 'und';
};

export function createDocumentContextService({
  index,
  persistence = null,
  embeddingClient = null,
  isSemanticSearchEnabled = () => true,
  ocrPage = null,
  readSyncedOcrExtraction = null,
  writeSyncedOcrExtraction = null,
  onAttachmentMetadataUpdated = async () => {},
  getUserId = () => 'local-user',
  getConversation = () => null,
  cryptoProvider = globalThis.crypto,
  now = () => Date.now(),
  extractionVersion = DOCUMENT_EXTRACTION_VERSION,
  maximumChunkTokens = 800,
  overlapTokens = 100,
  retrievalConfig = {},
  logger = console
} = {}) {
  if (!index?.putDocument || !index?.putLink || !index?.getDocuments) {
    throw new TypeError('Document context service requires a document index store.');
  }
  let readyPromise = null;
  const activeJobs = new Map();
  const activeControllers = new Map();

  const ensureReady = () => readyPromise ||= Promise.resolve(persistence?.load?.()).catch(error => {
    logger.warn('Document index could not load; continuing with an empty index.', error);
    return null;
  });
  const persist = async () => persistence?.save?.();

  async function indexAttachment({
    inlineData,
    conversationId,
    messageId = null,
    scopeType = 'conversation',
    signal
  } = {}) {
    await ensureReady();
    if (!inlineData?.data) throw new TypeError('Document indexing requires inline attachment bytes.');
    const userId = String(getUserId() || 'local-user');
    const bytes = base64ToBytes(inlineData.data);
    const documentHash = await sha256Hex(bytes, cryptoProvider);
    const storageKey = createDocumentStorageKey({ userId, documentHash, extractionVersion });
    index.putLink({
      userId,
      conversationId,
      messageId,
      documentHash,
      scopeType,
      scopeId: conversationId,
      createdAt: nowIso(now)
    });
    const existing = index.getDocument(storageKey);
    if (existing?.indexStatus === 'ready' && existing.documentHash === documentHash) {
      await persist();
      return { indexed: false, reason: 'ready', document: existing };
    }
    if (activeJobs.has(storageKey)) return activeJobs.get(storageKey);

    const resumableJob = index.getJobs().find(job => job.storageKey === storageKey
      && ['pending', 'failed', 'extracting', 'chunking', 'embedding'].includes(job.status));
    const jobId = resumableJob?.jobId || randomId(cryptoProvider);
    const baseJob = {
      ...(resumableJob || {}),
      jobId,
      storageKey,
      userId,
      documentHash,
      conversationId,
      startedAt: nowIso(now),
      updatedAt: nowIso(now),
      completedSteps: [],
      retryCount: resumableJob ? Number(resumableJob.retryCount || 0) + 1 : 0,
      lastError: null,
      cancelRequested: false,
      status: 'pending'
    };
    index.putJob(baseJob);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const jobSignal = controller?.signal || signal;
    if (signal && controller) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    if (controller) activeControllers.set(jobId, controller);

    const run = (async () => {
      const updateJob = (status, extra = {}) => {
        const current = index.getJob(jobId) || baseJob;
        index.putJob({ ...current, ...extra, status, updatedAt: nowIso(now) });
      };
      try {
        if (jobSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
        updateJob('extracting');
        let extraction = null;
        if (inlineData.documentOcrArtifact && typeof readSyncedOcrExtraction === 'function') {
          const restored = await readSyncedOcrExtraction({ artifact: inlineData.documentOcrArtifact, documentHash });
          if (restored?.locked) {
            updateJob('pending', { lastError: 'sync-vault-locked' });
            await persist();
            return { indexed: false, reason: 'sync-vault-locked', documentHash, storageKey };
          }
          if (restored?.extraction) extraction = restored.extraction;
        }
        extraction ||= await extractNativeDocument({
            mimeType: inlineData.mimeType,
            name: inlineData.name,
            data: inlineData.data,
            ocrPage,
            signal: jobSignal,
            resumeState: baseJob.checkpoint || null,
            onCheckpoint: async checkpoint => {
              updateJob('extracting', { checkpoint });
              await persist();
            }
          });
        if (!extraction.supported) {
          updateJob('failed', { lastError: 'unsupported-format' });
          await persist();
          return { indexed: false, reason: 'unsupported-format', documentHash, storageKey };
        }
        if (!inlineData.documentOcrArtifact && extractionContainsOcr(extraction) && typeof writeSyncedOcrExtraction === 'function') {
          const artifact = await writeSyncedOcrExtraction({ documentHash, extraction });
          if (artifact) {
            inlineData.documentOcrArtifact = artifact;
            await onAttachmentMetadataUpdated({ inlineData, documentHash });
          }
        }
        updateJob('chunking', { completedSteps: ['extraction'] });
        const language = detectDocumentLanguage(extraction.sections.map(section => section.text || '').join('\n'));
        const chunks = (await createDocumentChunks({
          documentHash,
          sections: extraction.sections,
          extractionVersion,
          maximumTokens: maximumChunkTokens,
          overlapTokens,
          cryptoProvider
        })).map(chunk => ({
          ...chunk,
          parserName: extraction.method,
          parserVersion: extractionVersion,
          language,
          indexStatus: 'ready'
        }));
        if (jobSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
        let embeddedChunks = chunks;
        if (embeddingClient?.embedDocumentChunk && isSemanticSearchEnabled()) {
          updateJob('embedding', { completedSteps: ['extraction', 'chunking'] });
          const checkpointChunks = Array.isArray(baseJob.checkpoint?.embeddedChunks)
            ? baseJob.checkpoint.embeddedChunks
            : [];
          const resumableChunks = checkpointChunks.every((chunk, indexValue) => chunk.chunkId === chunks[indexValue]?.chunkId)
            ? checkpointChunks
            : [];
          embeddedChunks = [...resumableChunks];
          for (let chunkIndex = embeddedChunks.length; chunkIndex < chunks.length; chunkIndex += 1) {
            const chunk = chunks[chunkIndex];
            if (jobSignal?.aborted || index.getJob(jobId)?.cancelRequested) {
              throw new DOMException('Aborted', 'AbortError');
            }
            let vector = null;
            try {
              vector = await embeddingClient.embedDocumentChunk({
                name: inlineData.name,
                sourceLocator: chunk.sourceLocator,
                text: chunk.text,
                signal: jobSignal
              });
            } catch (error) {
              if (error?.name === 'AbortError' || jobSignal?.aborted) throw error;
              logger.warn('Document semantic indexing failed for a chunk; keyword retrieval remains available.', error);
            }
            embeddedChunks.push({ ...chunk, vector });
            if (embeddedChunks.length % 5 === 0 || embeddedChunks.length === chunks.length) {
              updateJob('embedding', {
                completedSteps: ['extraction', 'chunking'],
                checkpoint: { ...(baseJob.checkpoint || {}), embeddedChunks: [...embeddedChunks] }
              });
              await persist();
            }
          }
        }
        const contentHash = await sha256Hex(embeddedChunks.map(chunk => chunk.contentHash).join(''), cryptoProvider);
        const document = {
          documentId: storageKey,
          storageKey,
          userId,
          documentHash,
          contentHash,
          extractionVersion,
          name: inlineData.name || 'document',
          mimeType: inlineData.mimeType || 'application/octet-stream',
          size: inlineData.size || bytes.byteLength,
          extractionMethod: extraction.method,
          parserName: extraction.method,
          parserVersion: extractionVersion,
          language,
          pages: extraction.pages || [],
          totalPages: extraction.totalPages || null,
          warnings: extraction.warnings || [],
          partial: Boolean(extraction.partial),
          processedPages: extraction.processedPages || null,
          indexStatus: 'ready',
          chunkCount: embeddedChunks.length,
          chunks: embeddedChunks,
          createdAt: existing?.createdAt || nowIso(now),
          updatedAt: nowIso(now)
        };
        index.putDocument(document);
        updateJob('ready', { completedSteps: ['extraction', 'chunking', ...(embeddingClient ? ['embedding'] : [])], checkpoint: null });
        try {
          await persist();
        } catch (error) {
          if (existing) index.putDocument(existing);
          else index.removeDocument(storageKey);
          throw error;
        }
        return { indexed: true, document };
      } catch (error) {
        const cancelled = error?.name === 'AbortError';
        const quotaExceeded = isStorageQuotaError(error);
        updateJob(cancelled ? 'pending' : 'failed', {
          lastError: cancelled ? 'cancelled' : quotaExceeded ? 'storage-quota-exceeded' : String(error?.message || error)
        });
        try { await persist(); } catch (persistError) {
          logger.warn('Document job state could not be persisted.', persistError);
        }
        if (cancelled) throw error;
        return { indexed: false, reason: quotaExceeded ? 'storage-quota-exceeded' : 'failed', error, documentHash, storageKey };
      } finally {
        activeJobs.delete(storageKey);
        activeControllers.delete(jobId);
      }
    })();
    activeJobs.set(storageKey, run);
    return run;
  }

  async function indexParts(parts = [], options = {}) {
    const results = [];
    for (const part of parts) {
      if (!part?.inlineData) continue;
      results.push(await indexAttachment({ inlineData: part.inlineData, ...options }));
    }
    return results;
  }

  async function indexTranscription({
    inlineData,
    text,
    conversationId,
    messageId = null,
    scopeType = 'conversation',
    signal
  } = {}) {
    await ensureReady();
    if (!inlineData?.data) throw new TypeError('Document transcription indexing requires attachment bytes.');
    if (!String(text || '').trim()) throw new TypeError('Document transcription indexing requires transcribed text.');
    const userId = String(getUserId() || 'local-user');
    const bytes = base64ToBytes(inlineData.data);
    const documentHash = await sha256Hex(bytes, cryptoProvider);
    const storageKey = createDocumentStorageKey({ userId, documentHash, extractionVersion });
    index.putLink({
      userId, conversationId, messageId, documentHash, scopeType, scopeId: conversationId, createdAt: nowIso(now)
    });
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const extraction = {
      supported: true,
      method: 'model-transcription',
      warnings: ['model-transcription-confidence-unavailable'],
      sections: [{
        chunkType: 'prose',
        text: lines.join('\n'),
        sourceLocator: { type: 'text', lineStart: 1, lineEnd: Math.max(1, lines.length) }
      }]
    };
    const language = detectDocumentLanguage(extraction.sections[0].text);
    const chunks = (await createDocumentChunks({
      documentHash,
      sections: extraction.sections,
      extractionVersion,
      maximumTokens: maximumChunkTokens,
      overlapTokens,
      cryptoProvider
    })).map(chunk => ({
      ...chunk,
      parserName: extraction.method,
      parserVersion: extractionVersion,
      language,
      indexStatus: 'ready'
    }));
    const embeddedChunks = [];
    for (const chunk of chunks) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let vector = null;
      if (embeddingClient?.embedDocumentChunk && isSemanticSearchEnabled()) {
        try {
          vector = await embeddingClient.embedDocumentChunk({
            name: inlineData.name,
            sourceLocator: chunk.sourceLocator,
            text: chunk.text,
            signal
          });
        } catch (error) {
          if (error?.name === 'AbortError' || signal?.aborted) throw error;
          logger.warn('Transcribed document semantic indexing failed; keyword retrieval remains available.', error);
        }
      }
      embeddedChunks.push({ ...chunk, vector });
    }
    const contentHash = await sha256Hex(embeddedChunks.map(chunk => chunk.contentHash).join(''), cryptoProvider);
    const existing = index.getDocument(storageKey);
    const documentRecord = {
      documentId: storageKey,
      storageKey,
      userId,
      documentHash,
      contentHash,
      extractionVersion,
      name: inlineData.name || 'document',
      mimeType: inlineData.mimeType || 'application/octet-stream',
      size: inlineData.size || bytes.byteLength,
      extractionMethod: extraction.method,
      parserName: extraction.method,
      parserVersion: extractionVersion,
      language,
      warnings: extraction.warnings,
      partial: false,
      indexStatus: 'ready',
      chunkCount: embeddedChunks.length,
      chunks: embeddedChunks,
      createdAt: existing?.createdAt || nowIso(now),
      updatedAt: nowIso(now)
    };
    index.putDocument(documentRecord);
    if (!inlineData.documentOcrArtifact && typeof writeSyncedOcrExtraction === 'function') {
      const artifact = await writeSyncedOcrExtraction({ documentHash, extraction });
      if (artifact) {
        inlineData.documentOcrArtifact = artifact;
        await onAttachmentMetadataUpdated({ inlineData, documentHash });
      }
    }
    try {
      await persist();
    } catch (error) {
      if (existing) index.putDocument(existing);
      else index.removeDocument(storageKey);
      return {
        indexed: false,
        reason: isStorageQuotaError(error) ? 'storage-quota-exceeded' : 'failed',
        error,
        documentHash,
        storageKey
      };
    }
    return { indexed: true, document: documentRecord };
  }

  async function retrieve({ query, conversationId, signal, includeGlobal = false } = {}) {
    await ensureReady();
    const userId = String(getUserId() || 'local-user');
    let queryVector = null;
    if (embeddingClient?.embedDocumentQuery && isSemanticSearchEnabled()) {
      try {
        queryVector = await embeddingClient.embedDocumentQuery(query, { signal });
      } catch (error) {
        logger.warn('Document semantic query failed; using keyword retrieval.', error);
      }
    }
    return retrieveDocumentChunks({
      index,
      userId,
      conversationId,
      query,
      queryVector,
      includeGlobal,
      config: retrievalConfig
    });
  }

  async function buildContext({
    parts = [],
    query = '',
    conversationId,
    messageId = null,
    scopeType = 'conversation',
    signal,
    retrieveContext = true
  } = {}) {
    const indexResults = await indexParts(parts, { conversationId, messageId, scopeType, signal });
    const indexFailures = indexResults.filter(result => !result?.document
      && !['ready'].includes(result?.reason));
    if (!retrieveContext) {
      return { chunks: [], tokenCount: 0, documentCount: 0, lowConfidence: indexFailures.length > 0, indexFailures, indexResults, text: '', systemInstruction: DOCUMENT_UNTRUSTED_DATA_INSTRUCTION };
    }
    const result = await retrieve({ query, conversationId, signal });
    return {
      ...result,
      indexResults,
      indexFailures,
      lowConfidence: result.lowConfidence || indexFailures.length > 0,
      text: formatRetrievedDocumentContext(result),
      coverageBatchTexts: (result.coverageBatches || []).map(chunks => formatRetrievedDocumentContext({ chunks })),
      systemInstruction: DOCUMENT_UNTRUSTED_DATA_INSTRUCTION
    };
  }

  async function removeLinks(filters) {
    await ensureReady();
    const userId = String(getUserId() || 'local-user');
    const affected = index.getLinks({ userId, ...filters });
    index.removeLink({ userId, ...filters });
    for (const link of affected) {
      if (index.countReferences({ userId, documentHash: link.documentHash }) > 0) continue;
      for (const document of index.getDocuments()) {
        if (document.userId === userId && document.documentHash === link.documentHash) {
          index.removeDocument(document.storageKey);
        }
      }
    }
    await persist();
  }

  return {
    supportsAttachment: inlineData => supportsNativeDocumentExtraction(inlineData),
    ensureReady,
    indexAttachment,
    indexTranscription,
    indexParts,
    retrieve,
    buildContext,
    removeLinks,
    cancelJob: async jobId => {
      await ensureReady();
      const job = index.getJob(jobId);
      if (!job) return false;
      index.putJob({ ...job, cancelRequested: true, updatedAt: nowIso(now) });
      activeControllers.get(jobId)?.abort();
      await persist();
      return true;
    },
    clear: async () => {
      index.clear();
      await persistence?.clear?.();
    }
  };
}

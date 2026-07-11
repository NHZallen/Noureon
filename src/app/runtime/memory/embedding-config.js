export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_SCHEMA_VERSION = 1;

export function isEmbeddingIndexCompatible(record = {}) {
  return record.embeddingModel === EMBEDDING_MODEL
    && record.embeddingDimensions === EMBEDDING_DIMENSIONS
    && record.embeddingSchemaVersion === EMBEDDING_SCHEMA_VERSION;
}

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_SCHEMA_VERSION,
  isEmbeddingIndexCompatible
} from '../src/app/runtime/memory/embedding-config.js';

test('uses Gemini Embedding 2 with a versioned 768-dimension local index', () => {
  assert.equal(EMBEDDING_MODEL, 'gemini-embedding-2');
  assert.equal(EMBEDDING_DIMENSIONS, 768);
  assert.equal(EMBEDDING_SCHEMA_VERSION, 1);
});

test('accepts only index records made with the active embedding configuration', () => {
  const compatible = {
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    embeddingSchemaVersion: EMBEDDING_SCHEMA_VERSION
  };

  assert.equal(isEmbeddingIndexCompatible(compatible), true);
  assert.equal(isEmbeddingIndexCompatible({ ...compatible, embeddingModel: 'gemini-embedding-001' }), false);
  assert.equal(isEmbeddingIndexCompatible({ ...compatible, embeddingDimensions: 3072 }), false);
  assert.equal(isEmbeddingIndexCompatible({ ...compatible, embeddingSchemaVersion: 2 }), false);
});

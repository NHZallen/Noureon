export const EXTERNAL_DATA_LIMITS = Object.freeze({
  maxArchiveBytes: 10 * 1024 * 1024,
  maxFiles: 256,
  maxJsonFileBytes: 2 * 1024 * 1024,
  maxTotalJsonBytes: 8 * 1024 * 1024,
  maxZipEntryBytes: 16 * 1024 * 1024,
  maxZipExpandedBytes: 64 * 1024 * 1024,
  maxDepth: 24,
  maxNodes: 100_000,
  maxArrayItems: 5_000,
  maxStringBytes: 1024 * 1024
});

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const textEncoder = new TextEncoder();

export class ExternalDataValidationError extends Error {
  constructor(message, { code = 'INVALID_EXTERNAL_DATA', path = '$' } = {}) {
    super(message);
    this.name = 'ExternalDataValidationError';
    this.code = code;
    this.path = path;
  }
}

const fail = (message, options) => {
  throw new ExternalDataValidationError(message, options);
};

const isPlainRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const byteLength = (value) => textEncoder.encode(value).byteLength;

function requireString(value, path, { min = 0, max = 128, trim = false, nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string') fail(`${path} must be a string`, { path });
  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || normalized.length > max) {
    fail(`${path} length is outside the allowed range`, { code: 'FIELD_SIZE_LIMIT', path });
  }
  return normalized;
}

export function sanitizeExternalJson(value, options = {}) {
  const limits = { ...EXTERNAL_DATA_LIMITS, ...options };
  let nodes = 0;

  const visit = (current, path, depth) => {
    nodes += 1;
    if (nodes > limits.maxNodes) fail('External data has too many values', { code: 'NODE_LIMIT', path });
    if (depth > limits.maxDepth) fail('External data is nested too deeply', { code: 'DEPTH_LIMIT', path });

    if (current == null || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail(`${path} must contain a finite number`, { path });
      return current;
    }
    if (typeof current === 'string') {
      if (byteLength(current) > limits.maxStringBytes) {
        fail(`${path} string is too large`, { code: 'FIELD_SIZE_LIMIT', path });
      }
      return current;
    }
    if (Array.isArray(current)) {
      if (current.length > limits.maxArrayItems) {
        fail(`${path} has too many items`, { code: 'ARRAY_LIMIT', path });
      }
      return current.map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
    }
    if (!isPlainRecord(current)) fail(`${path} must be a plain object`, { path });

    const output = Object.create(null);
    for (const [key, child] of Object.entries(current)) {
      if (DANGEROUS_KEYS.has(key)) {
        fail(`${path} contains a forbidden key`, { code: 'FORBIDDEN_KEY', path: `${path}.${key}` });
      }
      output[key] = visit(child, `${path}.${key}`, depth + 1);
    }
    return output;
  };

  return visit(value, '$', 0);
}

export function validateExternalAstra(value) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail('Noura must be an object');

  return {
    id: requireString(source.id, '$.id', { min: 1, max: 128, trim: true }),
    name: requireString(source.name, '$.name', { min: 1, max: 80, trim: true }),
    description: requireString(source.description ?? '', '$.description', { max: 2_000 }),
    instructions: requireString(source.instructions ?? '', '$.instructions', { max: 50_000 }),
    avatarUrl: requireString(source.avatarUrl, '$.avatarUrl', { max: 2 * 1024 * 1024, nullable: true }),
    officialId: null
  };
}

export function validateExternalConversation(value) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail('Conversation must be an object');

  source.id = requireString(source.id, '$.id', { min: 1, max: 128, trim: true });
  source.title = requireString(source.title ?? '', '$.title', { max: 500 });
  source.summary = requireString(source.summary ?? '', '$.summary', { max: 20_000 });
  if (source.messages != null && !Array.isArray(source.messages)) {
    fail('$.messages must be an array', { path: '$.messages' });
  }
  if (source.folderId != null) source.folderId = requireString(source.folderId, '$.folderId', { max: 128 });
  if (source.astrasId != null) source.astrasId = requireString(source.astrasId, '$.astrasId', { max: 128 });
  return source;
}

export function validateExternalFolder(value) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail('Folder must be an object');
  if (!Array.isArray(source.conversationIds)) {
    fail('$.conversationIds must be an array', { path: '$.conversationIds' });
  }

  return {
    name: requireString(source.name, '$.name', { min: 1, max: 120, trim: true }),
    color: requireString(source.color ?? '', '$.color', { max: 64 }),
    icon: requireString(source.icon ?? 'default', '$.icon', { max: 64 }),
    textColor: requireString(source.textColor ?? '', '$.textColor', { max: 64 }),
    conversationIds: source.conversationIds.map((id, index) => (
      requireString(id, `$.conversationIds[${index}]`, { min: 1, max: 128 })
    ))
  };
}

export function parseExternalJson(text, { path = '$', maxBytes = EXTERNAL_DATA_LIMITS.maxJsonFileBytes } = {}) {
  if (typeof text !== 'string') fail(`${path} must be text`, { path });
  const size = byteLength(text);
  if (size > maxBytes) fail(`${path} exceeds the JSON size limit`, { code: 'JSON_SIZE_LIMIT', path });
  try {
    return { value: JSON.parse(text), size };
  } catch {
    fail(`${path} is not valid JSON`, { code: 'INVALID_JSON', path });
  }
}

export function validateZipFileCount(zip, limits = EXTERNAL_DATA_LIMITS) {
  const files = zip?.files || {};
  const entries = Object.entries(files).filter(([, entry]) => !entry?.dir);
  if (entries.length > limits.maxFiles) {
    fail('Archive contains too many files', { code: 'ZIP_FILE_LIMIT' });
  }
  let expandedBytes = 0;
  for (const [name, entry] of entries) {
    const normalizedName = String(name).replaceAll('\\', '/');
    if (normalizedName.startsWith('/') || normalizedName.split('/').includes('..')) {
      fail('Archive contains an unsafe path', { code: 'ZIP_PATH', path: name });
    }
    const uncompressedSize = Number(entry?._data?.uncompressedSize);
    if (Number.isFinite(uncompressedSize) && uncompressedSize >= 0) {
      if (uncompressedSize > limits.maxZipEntryBytes) {
        fail('Archive entry exceeds the size limit', { code: 'ZIP_ENTRY_SIZE', path: name });
      }
      expandedBytes += uncompressedSize;
      if (expandedBytes > limits.maxZipExpandedBytes) {
        fail('Archive expanded size exceeds the limit', { code: 'ZIP_EXPANDED_SIZE' });
      }
    }
  }
  return entries.length;
}

function validateBackupConversation(value, index) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail(`$.conversations[${index}] must be an object`);
  source.id = requireString(source.id, `$.conversations[${index}].id`, { min: 1, max: 128, trim: true });
  source.title = requireString(source.title ?? '', `$.conversations[${index}].title`, { max: 500 });
  source.summary = requireString(source.summary ?? '', `$.conversations[${index}].summary`, { max: 20_000 });
  source.messages ??= [];
  if (!Array.isArray(source.messages)) {
    fail(`$.conversations[${index}].messages must be an array`, { path: `$.conversations[${index}].messages` });
  }
  source.messages.forEach((message, messageIndex) => {
    if (!isPlainRecord(message)) {
      fail('Backup message must be an object', { path: `$.conversations[${index}].messages[${messageIndex}]` });
    }
    if (message.parts != null && !Array.isArray(message.parts)) {
      fail('Backup message parts must be an array', { path: `$.conversations[${index}].messages[${messageIndex}].parts` });
    }
  });
  return source;
}

function validateBackupFolder(value, index) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail(`$.folders[${index}] must be an object`);
  source.id = requireString(source.id, `$.folders[${index}].id`, { min: 1, max: 128, trim: true });
  source.name = requireString(source.name ?? 'Folder', `$.folders[${index}].name`, { min: 1, max: 120, trim: true });
  source.conversationIds ??= [];
  if (!Array.isArray(source.conversationIds)) {
    fail(`$.folders[${index}].conversationIds must be an array`, { path: `$.folders[${index}].conversationIds` });
  }
  source.conversationIds = source.conversationIds.map((id, idIndex) => (
    requireString(id, `$.folders[${index}].conversationIds[${idIndex}]`, { min: 1, max: 128 })
  ));
  return source;
}

function validateBackupAstra(value, index) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail(`$.astras[${index}] must be an object`);
  source.id = requireString(source.id, `$.astras[${index}].id`, { min: 1, max: 128, trim: true });
  source.name = requireString(source.name ?? 'Noura', `$.astras[${index}].name`, { min: 1, max: 80, trim: true });
  source.description = requireString(source.description ?? '', `$.astras[${index}].description`, { max: 2_000 });
  source.instructions = requireString(source.instructions ?? '', `$.astras[${index}].instructions`, { max: 50_000 });
  if (source.avatarUrl != null) {
    source.avatarUrl = requireString(source.avatarUrl, `$.astras[${index}].avatarUrl`, { max: 2 * 1024 * 1024 });
  }
  if (source._avatarZipRef != null) {
    source._avatarZipRef = requireString(source._avatarZipRef, `$.astras[${index}]._avatarZipRef`, { max: 512 });
  }
  return source;
}

export function validateExternalBackup(value) {
  const source = sanitizeExternalJson(value);
  if (!isPlainRecord(source)) fail('Backup root must be an object');

  for (const key of ['conversations', 'folders', 'astras', 'personalMemories']) {
    if (source[key] != null && !Array.isArray(source[key])) {
      fail(`$.${key} must be an array`, { path: `$.${key}` });
    }
  }
  for (const key of ['settings', 'apiKeys', 'backup_identity']) {
    if (source[key] != null && !isPlainRecord(source[key])) {
      fail(`$.${key} must be an object`, { path: `$.${key}` });
    }
  }
  if (source.apiKeys) {
    for (const [provider, apiKey] of Object.entries(source.apiKeys)) {
      requireString(apiKey, `$.apiKeys.${provider}`, { max: 16_384 });
    }
  }

  return {
    backup_identity: source.backup_identity || null,
    conversations: (source.conversations || []).map(validateBackupConversation),
    folders: (source.folders || []).map(validateBackupFolder),
    astras: (source.astras || []).map(validateBackupAstra),
    personalMemories: source.personalMemories || [],
    settings: source.settings || null,
    apiKeys: source.apiKeys || null
  };
}

export function validateExternalAuthBackup(value) {
  const source = sanitizeExternalJson(value);
  const backup = validateExternalBackup(source);
  if (!isPlainRecord(source.backup_identity)) {
    fail('$.backup_identity must be an object', { path: '$.backup_identity' });
  }
  backup.backup_identity = {
    ...source.backup_identity,
    username: requireString(source.backup_identity.username, '$.backup_identity.username', {
      min: 1,
      max: 128,
      trim: true
    })
  };
  if (source.user_credentials != null && !isPlainRecord(source.user_credentials)) {
    fail('$.user_credentials must be an object', { path: '$.user_credentials' });
  }
  backup.user_credentials = source.user_credentials
    ? {
        passwordHash: requireString(source.user_credentials.passwordHash ?? '', '$.user_credentials.passwordHash', {
          max: 2_048
        })
      }
    : null;
  return backup;
}

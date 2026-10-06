// The workspace stored as one record per conversation ("WS2"), instead of one record holding every conversation.
//
// Why: the old format is a single item, so every save turned ALL conversations into one string and wrote it again, however little had
// changed (docs/superpowers/specs/2026-10-06-split-storage-design.md). Here a save serializes the conversations one at a time, compares each
// to the fingerprint kept in the index, and writes only what changed, together with the index, in one atomic transaction.
//
// The module is pure: it is given a storage object (the storage adapter, or a fake in the tests) and knows nothing about the page, the
// current user or the sync code. The old item is only ever READ here (migrateFromLegacy / mergeStaleLegacy); it is never changed or deleted.
//
// Records (prefix chatWS2:<encoded user>:):
//   meta          the index: the order of the conversations, the fingerprint and size of every record, where the data came from
//   conv:<id>     one conversation as JSON
//   shared        everything else except the conversations and the memory state (folders, astras, personal memories, ...)
//   memory        the memory state (it can be large, so it is a record of its own)
//   failed        a marker left by a migration that did not pass its check
//   disabled      a marker that makes the app ignore this format and use the old item (the way back)

export const WS2_VERSION = 2;

const LOAD_BATCH_SIZE = 16;

export class WorkspaceStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorkspaceStoreError';
    this.code = code;
    this.details = details;
  }
}

// Two 32-bit lanes folded to 53 bits: enough to tell "changed" from "unchanged" (it is not a security hash). A wrong "unchanged" costs one
// skipped write, which the next change to that conversation repairs. About 170 ms for 46 million characters.
function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const length = text.length;
  let index = 0;
  for (; index + 3 < length; index += 4) {
    const a = text.charCodeAt(index) | (text.charCodeAt(index + 1) << 16);
    const b = text.charCodeAt(index + 2) | (text.charCodeAt(index + 3) << 16);
    h1 = Math.imul(h1 ^ a, 2654435761);
    h1 = (h1 << 13) | (h1 >>> 19);
    h2 = Math.imul(h2 ^ b, 1597334677);
    h2 = (h2 << 11) | (h2 >>> 21);
  }
  for (; index < length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function fingerprintText(text) {
  const value = String(text);
  return `${value.length.toString(36)}.${hashText(value).toString(36)}`;
}

export function getWorkspaceV2Keys(username) {
  if (typeof username !== 'string' || !username) throw new TypeError('The split workspace needs a user name.');
  // The encoded name cannot contain ":", so the prefix of one user is never the start of another user's prefix.
  const prefix = `chatWS2:${encodeURIComponent(username)}:`;
  return {
    prefix,
    meta: `${prefix}meta`,
    shared: `${prefix}shared`,
    memory: `${prefix}memory`,
    failed: `${prefix}failed`,
    disabled: `${prefix}disabled`,
    conversation: id => `${prefix}conv:${id}`
  };
}

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parseJson(text) {
  if (typeof text !== 'string') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function indexConversations(conversations) {
  const ids = [];
  const seen = new Set();
  for (const [position, conversation] of conversations.entries()) {
    const id = conversation?.id;
    if (typeof id !== 'string' || !id) {
      throw new WorkspaceStoreError('unindexable-conversation', `Conversation ${position} has no usable id.`, { position });
    }
    if (seen.has(id)) {
      throw new WorkspaceStoreError('unindexable-conversation', `Conversation id ${id} appears twice.`, { id });
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function splitWorkspace(workspace) {
  const { conversations: rawConversations, memoryState, ...rest } = isPlainObject(workspace) ? workspace : {};
  const conversations = Array.isArray(rawConversations) ? rawConversations : [];
  return { conversations, memoryState, shared: rest };
}

function serialize(value, what) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new WorkspaceStoreError('unserializable', `${what} cannot be turned into JSON: ${error?.message || error}`);
  }
}

const sameList = (left, right) => left.length === right.length && left.every((item, index) => item === right[index]);

function validateMeta(meta) {
  if (!isPlainObject(meta)) return 'meta-not-an-object';
  if (meta.version !== WS2_VERSION) return meta.version > WS2_VERSION ? 'unsupported-version' : 'meta-version';
  if (!Array.isArray(meta.order) || meta.order.some(id => typeof id !== 'string' || !id)) return 'meta-order';
  if (new Set(meta.order).size !== meta.order.length) return 'meta-order-duplicates';
  if (!isPlainObject(meta.conversations)) return 'meta-conversations';
  for (const id of meta.order) {
    if (!isPlainObject(meta.conversations[id]) || typeof meta.conversations[id].fp !== 'string') return 'meta-entry';
  }
  if (!isPlainObject(meta.shared) || typeof meta.shared.fp !== 'string') return 'meta-shared';
  if (meta.memory !== null && (!isPlainObject(meta.memory) || typeof meta.memory.fp !== 'string')) return 'meta-memory';
  return null;
}

export function createWorkspaceStoreV2({
  storage,
  username,
  now = () => new Date().toISOString(),
  logger = console
} = {}) {
  for (const method of ['getItem', 'applyAtomic', 'getKeys']) {
    if (typeof storage?.[method] !== 'function') throw new TypeError(`The split workspace needs storage.${method}.`);
  }
  const keys = getWorkspaceV2Keys(username);
  const readMany = typeof storage.readItems === 'function'
    ? names => storage.readItems(names)
    : names => Promise.all(names.map(name => storage.getItem(name)));

  // One operation at a time on this store, and an operation that failed does not stop the ones after it.
  let chain = Promise.resolve();
  const exclusive = operation => {
    const result = chain.then(operation, operation);
    chain = result.catch(() => {});
    return result;
  };

  // Records that could not be read at the last load: a save keeps them (and their index entries) instead of treating them as deleted.
  let unreadable = new Set();

  async function readMeta() {
    const raw = await storage.getItem(keys.meta);
    if (raw == null) return { state: 'absent' };
    const parsed = parseJson(raw);
    if (!parsed.ok) return { state: 'corrupt', reason: 'meta-not-json' };
    const problem = validateMeta(parsed.value);
    if (problem) return { state: problem === 'unsupported-version' ? 'unsupported' : 'corrupt', reason: problem };
    return { state: 'ok', meta: parsed.value };
  }

  async function readAllRecords(meta) {
    const records = { conversations: new Map(), problems: [] };
    for (let start = 0; start < meta.order.length; start += LOAD_BATCH_SIZE) {
      const ids = meta.order.slice(start, start + LOAD_BATCH_SIZE);
      const values = await readMany(ids.map(id => keys.conversation(id)));
      ids.forEach((id, offset) => {
        const raw = values[offset];
        if (raw == null) {
          records.problems.push({ id, reason: 'missing' });
          return;
        }
        const parsed = parseJson(raw);
        if (!parsed.ok || !isPlainObject(parsed.value)) {
          records.problems.push({ id, reason: 'unreadable' });
          return;
        }
        if (fingerprintText(raw) !== meta.conversations[id].fp) records.problems.push({ id, reason: 'fingerprint-changed', usable: true });
        records.conversations.set(id, parsed.value);
      });
    }
    return records;
  }

  function load() {
    return exclusive(async () => {
      const result = await readMeta();
      if (result.state !== 'ok') {
        unreadable = new Set();
        return result;
      }
      const { meta } = result;
      const [sharedRaw, memoryRaw] = await readMany([keys.shared, keys.memory]);
      const shared = parseJson(sharedRaw);
      if (!shared.ok || !isPlainObject(shared.value)) return { state: 'corrupt', reason: 'shared-unreadable' };
      let memoryState;
      if (meta.memory !== null) {
        const memory = parseJson(memoryRaw);
        if (!memory.ok) return { state: 'corrupt', reason: 'memory-unreadable' };
        memoryState = memory.value;
      }
      const { conversations, problems } = await readAllRecords(meta);
      const lost = problems.filter(problem => !problem.usable);
      const warnings = problems.filter(problem => problem.usable);
      unreadable = new Set(lost.map(problem => problem.id));
      const workspace = {
        conversations: meta.order.filter(id => conversations.has(id)).map(id => conversations.get(id)),
        ...shared.value
      };
      if (meta.memory !== null) workspace.memoryState = memoryState;
      return { state: lost.length ? 'degraded' : 'ready', workspace, meta, problems: lost, warnings };
    });
  }

  function save(snapshot, { conversationIds = null } = {}) {
    return exclusive(async () => {
      const current = await readMeta();
      if (current.state === 'corrupt' || current.state === 'unsupported') {
        throw new WorkspaceStoreError('corrupt-meta', `The split workspace index cannot be used (${current.reason}); nothing was written.`, { reason: current.reason });
      }
      const previous = current.state === 'ok' ? current.meta : null;
      const { conversations, memoryState, shared } = splitWorkspace(snapshot);
      const ids = indexConversations(conversations);
      const hinted = Array.isArray(conversationIds) ? new Set(conversationIds) : null;

      const puts = [];
      const removes = [];
      const entries = {};
      let written = 0;
      for (const [position, conversation] of conversations.entries()) {
        const id = ids[position];
        const known = previous?.conversations[id];
        if (known && hinted && !hinted.has(id)) {
          entries[id] = known;
          continue;
        }
        const json = serialize(conversation, `Conversation ${id}`);
        const fp = fingerprintText(json);
        if (known && known.fp === fp) {
          entries[id] = known;
          continue;
        }
        puts.push({ key: keys.conversation(id), value: json });
        entries[id] = { fp, size: json.length, updatedAt: conversation.lastUpdatedAt || conversation.createdAt || null };
        written += 1;
      }

      // A record that could not be read last time is not a deleted conversation: keep it, at the end of the order.
      const order = [...ids];
      const present = new Set(ids);
      let removed = 0;
      for (const id of previous?.order || []) {
        if (present.has(id)) continue;
        if (unreadable.has(id)) {
          entries[id] = previous.conversations[id];
          order.push(id);
        } else {
          removes.push(keys.conversation(id));
          removed += 1;
        }
      }

      const sharedJson = serialize(shared, 'The shared workspace data');
      const sharedEntry = { fp: fingerprintText(sharedJson), size: sharedJson.length };
      const sharedChanged = !previous || previous.shared.fp !== sharedEntry.fp;
      if (sharedChanged) puts.push({ key: keys.shared, value: sharedJson });

      let memoryEntry = null;
      let memoryChanged = false;
      if (memoryState !== undefined) {
        const memoryJson = serialize(memoryState, 'The memory state');
        memoryEntry = { fp: fingerprintText(memoryJson), size: memoryJson.length };
        memoryChanged = !previous || previous.memory === null || previous.memory.fp !== memoryEntry.fp;
        if (memoryChanged) puts.push({ key: keys.memory, value: memoryJson });
      } else if (previous && previous.memory !== null) {
        removes.push(keys.memory);
        memoryChanged = true;
      }

      const orderChanged = !previous || !sameList(previous.order, order);
      if (previous && puts.length === 0 && removes.length === 0 && !orderChanged) {
        return { written: 0, removed: 0, shared: false, memory: false, skipped: ids.length };
      }
      const meta = {
        ...(previous || { createdAt: now(), migratedFrom: null }),
        version: WS2_VERSION,
        savedAt: now(),
        order,
        conversations: entries,
        shared: sharedEntry,
        memory: memoryEntry
      };
      puts.push({ key: keys.meta, value: JSON.stringify(meta) });
      await storage.applyAtomic({ puts, removes });
      return { written, removed, shared: sharedChanged, memory: memoryChanged, skipped: ids.length - written };
    });
  }

  async function readLegacy(legacyKey) {
    const raw = await storage.getItem(legacyKey);
    if (raw == null) return { state: 'no-legacy' };
    const parsed = parseJson(raw);
    if (!parsed.ok || !isPlainObject(parsed.value)) return { state: 'legacy-unreadable' };
    return { state: 'ok', raw, workspace: parsed.value };
  }

  const countMessages = conversations => conversations.reduce((sum, conversation) => (
    sum + (Array.isArray(conversation?.messages) ? conversation.messages.length : 0)
  ), 0);

  async function readFailure() {
    const parsed = parseJson(await storage.getItem(keys.failed));
    return parsed.ok && isPlainObject(parsed.value) ? parsed.value : null;
  }

  async function recordFailure(reason, details = {}) {
    const attempts = ((await readFailure())?.attempts || 0) + 1;
    try {
      await storage.applyAtomic({
        puts: [{ key: keys.failed, value: JSON.stringify({ reason, attempts, at: now(), ...details }) }]
      });
    } catch (error) {
      logger.warn?.('The split workspace could not record why its migration failed.', error);
    }
    return attempts;
  }

  // Copies the old single item into records. The old item is not touched. The new records and the index are written in ONE transaction,
  // then read back and compared; if anything is off, they are all removed again and the app keeps using the old item.
  function migrateFromLegacy({ legacyKey } = {}) {
    return exclusive(async () => {
      if ((await readMeta()).state !== 'absent') return { state: 'already-migrated' };
      const legacy = await readLegacy(legacyKey);
      if (legacy.state !== 'ok') return { state: legacy.state };

      const { conversations, memoryState, shared } = splitWorkspace(legacy.workspace);
      let ids;
      try {
        ids = indexConversations(conversations);
      } catch (error) {
        if (error instanceof WorkspaceStoreError) {
          const attempts = await recordFailure(error.code, error.details);
          return { state: 'unindexable', reason: error.message, attempts };
        }
        throw error;
      }

      let puts;
      const entries = {};
      const baseline = {};
      try {
        puts = conversations.map((conversation, position) => {
          const json = serialize(conversation, `Conversation ${ids[position]}`);
          const fp = fingerprintText(json);
          entries[ids[position]] = { fp, size: json.length, updatedAt: conversation.lastUpdatedAt || conversation.createdAt || null };
          baseline[ids[position]] = fp;
          return { key: keys.conversation(ids[position]), value: json };
        });
        const sharedJson = serialize(shared, 'The shared workspace data');
        puts.push({ key: keys.shared, value: sharedJson });
        let memoryEntry = null;
        if (memoryState !== undefined) {
          const memoryJson = serialize(memoryState, 'The memory state');
          memoryEntry = { fp: fingerprintText(memoryJson), size: memoryJson.length };
          puts.push({ key: keys.memory, value: memoryJson });
        }
        const messageCount = countMessages(conversations);
        const meta = {
          version: WS2_VERSION,
          createdAt: now(),
          savedAt: now(),
          order: ids,
          conversations: entries,
          shared: { fp: fingerprintText(sharedJson), size: sharedJson.length },
          memory: memoryEntry,
          migratedFrom: {
            key: legacyKey,
            bytes: legacy.raw.length,
            fingerprint: fingerprintText(legacy.raw),
            conversationCount: ids.length,
            messageCount,
            conversations: baseline,
            at: now()
          }
        };
        puts.push({ key: keys.meta, value: JSON.stringify(meta) });
        await storage.applyAtomic({ puts, removes: [keys.failed] });
        const verified = await verifyWritten(meta, puts);
        if (!verified.ok) throw new WorkspaceStoreError('verification-failed', verified.reason);
        return { state: 'migrated', conversations: ids.length, messages: messageCount, bytes: legacy.raw.length };
      } catch (error) {
        // Nothing may stay of a migration that did not pass: the index goes first, so even a failure of this cleanup leaves no "meta".
        try {
          await storage.applyAtomic({ removes: [keys.meta, keys.shared, keys.memory, ...ids.map(id => keys.conversation(id))] });
        } catch (cleanupError) {
          logger.warn?.('The split workspace could not remove a migration that failed its check.', cleanupError);
        }
        const attempts = await recordFailure(error?.code || 'write-failed', { message: String(error?.message || error) });
        return { state: 'failed', reason: error?.code || 'write-failed', message: String(error?.message || error), attempts };
      }
    });
  }

  async function verifyWritten(meta, puts) {
    const byKey = new Map(puts.map(entry => [entry.key, entry.value]));
    const names = [...byKey.keys()];
    let messages = 0;
    for (let start = 0; start < names.length; start += LOAD_BATCH_SIZE) {
      const batch = names.slice(start, start + LOAD_BATCH_SIZE);
      const values = await readMany(batch);
      for (const [offset, name] of batch.entries()) {
        const stored = values[offset];
        if (stored !== byKey.get(name)) return { ok: false, reason: `${name} does not read back as written` };
        if (name.startsWith(`${keys.prefix}conv:`)) {
          const parsed = parseJson(stored);
          if (!parsed.ok) return { ok: false, reason: `${name} does not parse` };
          messages += Array.isArray(parsed.value.messages) ? parsed.value.messages.length : 0;
        }
      }
    }
    if (messages !== meta.migratedFrom.messageCount) return { ok: false, reason: 'the message count differs from the old data' };
    return { ok: true };
  }

  // After the migration an older tab (not reloaded since the new version was deployed) may still write the old item. What it created or
  // changed since is merged in: a conversation is added when it is new there, replaced when it was changed there AND is newer than ours.
  // A conversation deleted here is not brought back, and a deletion made there is not copied.
  function mergeStaleLegacy({ legacyKey } = {}) {
    return exclusive(async () => {
      const current = await readMeta();
      if (current.state !== 'ok' || !current.meta.migratedFrom) return { state: 'not-migrated' };
      const { meta } = current;
      const legacy = await readLegacy(legacyKey);
      if (legacy.state !== 'ok') return { state: legacy.state };
      const currentFingerprint = fingerprintText(legacy.raw);
      if (currentFingerprint === meta.migratedFrom.fingerprint) return { state: 'unchanged' };

      const { conversations } = splitWorkspace(legacy.workspace);
      const ids = indexConversations(conversations);
      const puts = [];
      const entries = { ...meta.conversations };
      const baseline = {};
      const order = [...meta.order];
      const added = [];
      const replaced = [];
      for (const [position, conversation] of conversations.entries()) {
        const id = ids[position];
        const json = serialize(conversation, `Conversation ${id}`);
        const fp = fingerprintText(json);
        baseline[id] = fp;
        const before = meta.migratedFrom.conversations[id];
        if (before === fp) continue;
        const updatedAt = conversation.lastUpdatedAt || conversation.createdAt || null;
        if (before === undefined) {
          if (entries[id]) continue;
          puts.push({ key: keys.conversation(id), value: json });
          entries[id] = { fp, size: json.length, updatedAt };
          order.unshift(id);
          added.push(id);
        } else if (entries[id] && Date.parse(updatedAt || '') > Date.parse(entries[id].updatedAt || '')) {
          puts.push({ key: keys.conversation(id), value: json });
          entries[id] = { fp, size: json.length, updatedAt };
          replaced.push(id);
        }
      }
      const next = {
        ...meta,
        savedAt: now(),
        order,
        conversations: entries,
        migratedFrom: { ...meta.migratedFrom, fingerprint: currentFingerprint, conversations: baseline, mergedAt: now() }
      };
      puts.push({ key: keys.meta, value: JSON.stringify(next) });
      await storage.applyAtomic({ puts });
      return { state: 'merged', added, replaced };
    });
  }

  // Records that the index does not know (orphans) and records the index lists but the storage lacks (missing). Reporting only.
  function checkIntegrity() {
    return exclusive(async () => {
      const result = await readMeta();
      if (result.state !== 'ok') return { state: result.state, missing: [], orphans: [] };
      const stored = new Set((await storage.getKeys()).filter(name => String(name).startsWith(`${keys.prefix}conv:`)));
      const expected = new Set(result.meta.order.map(id => keys.conversation(id)));
      return {
        state: 'ok',
        missing: result.meta.order.filter(id => !stored.has(keys.conversation(id))),
        orphans: [...stored].filter(name => !expected.has(name))
      };
    });
  }

  async function getUsage() {
    const result = await readMeta();
    if (result.state !== 'ok') return { conversations: 0, bytes: 0 };
    const { meta } = result;
    const bytes = meta.order.reduce((sum, id) => sum + (meta.conversations[id].size || 0), 0)
      + (meta.shared.size || 0) + (meta.memory?.size || 0);
    return { conversations: meta.order.length, bytes };
  }

  // The marker that sends the app back to the old item, and the one that records a failed migration.
  const setDisabled = disabled => exclusive(() => (disabled
    ? storage.applyAtomic({ puts: [{ key: keys.disabled, value: now() }] })
    : storage.applyAtomic({ removes: [keys.disabled] })));
  const isDisabled = async () => (await storage.getItem(keys.disabled)) != null;

  function removeAll() {
    return exclusive(async () => {
      if (typeof storage.removeItemsByPrefix === 'function') await storage.removeItemsByPrefix(keys.prefix);
      else await storage.applyAtomic({ removes: (await storage.getKeys()).filter(name => String(name).startsWith(keys.prefix)) });
      unreadable = new Set();
    });
  }

  return {
    keys,
    load,
    save,
    migrateFromLegacy,
    mergeStaleLegacy,
    checkIntegrity,
    getUsage,
    getMigrationFailure: readFailure,
    setDisabled,
    isDisabled,
    removeAll
  };
}

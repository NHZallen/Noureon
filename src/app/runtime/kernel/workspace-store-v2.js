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
//   conv:<id>     one conversation as JSON (its large attachments replaced by a short marker, see below)
//   att:<id>      one attachment: the base64 text of a file a person sent, named by a hash of its content (a file used twice is stored once)
//   shared        everything else except the conversations and the memory state (folders, astras, personal memories, ...)
//   memory        the memory state (it can be large, so it is a record of its own)
//   failed        a marker left by a migration that did not pass its check
//   disabled      a marker that makes the app ignore this format and use the old item (the way back)

export const WS2_VERSION = 2;

const LOAD_BATCH_SIZE = 16;
const ATTACHMENT_BATCH_SIZE = 4;

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
function hashLanes(text) {
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
  return [h1 >>> 0, h2 >>> 0];
}

function hashText(text) {
  const [h1, h2] = hashLanes(text);
  return 4294967296 * (2097151 & h2) + h1;
}

// An attachment is named by its length and both 32-bit lanes (64 bits): two different files with the same name are not a case to plan for.
function attachmentIdOf(data) {
  const [h1, h2] = hashLanes(data);
  return `${data.length.toString(36)}.${h1.toString(36)}.${h2.toString(36)}`;
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
    conversation: id => `${prefix}conv:${id}`,
    attachment: id => `${prefix}att:${id}`
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

// Attachments are the bulk of a big workspace: one photo is a megabyte of base64. Kept inside the conversation they made every record a
// huge string that had to be read, parsed and thrown away again at each start. Here every string under a key "data" that sits in an object
// with a "mimeType" (the shape of a file in a message: parts[].inlineData) and is at least this long is moved out into a record of its own.
const ATTACHMENT_MIN_LENGTH = 32768;
const ATTACHMENT_MARKER = '__att';

// A file is hashed once: the name is remembered against the object that holds it, and used again as long as that object still holds the very
// same string (comparing a string with itself is instant). Loading fills it in without hashing, so saving a workspace whose files did not
// change costs nothing for them.
const knownAttachmentIds = new WeakMap();

function encodeConversation(conversation, what) {
  const attachments = new Map();
  let json;
  try {
    json = JSON.stringify(conversation, function replacer(key, value) {
      if (key === 'data' && typeof value === 'string' && value.length >= ATTACHMENT_MIN_LENGTH && typeof this?.mimeType === 'string') {
        const known = knownAttachmentIds.get(this);
        let id;
        if (known && known.data === value) {
          id = known.id;
        } else {
          id = attachmentIdOf(value);
          knownAttachmentIds.set(this, { data: value, id });
        }
        attachments.set(id, value);
        return { [ATTACHMENT_MARKER]: id };
      }
      return value;
    });
  } catch (error) {
    throw new WorkspaceStoreError('unserializable', `${what} cannot be turned into JSON: ${error?.message || error}`);
  }
  return { json, attachments };
}

// Puts the attachments back where their markers are. Returns the ids that could not be found.
function hydrateConversation(value, attachments) {
  const missing = [];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    for (const key of Array.isArray(node) ? node.keys() : Object.keys(node)) {
      const child = node[key];
      if (isPlainObject(child) && typeof child[ATTACHMENT_MARKER] === 'string' && Object.keys(child).length === 1) {
        const data = attachments.get(child[ATTACHMENT_MARKER]);
        if (typeof data === 'string') {
          node[key] = data;
          knownAttachmentIds.set(node, { data, id: child[ATTACHMENT_MARKER] });
        } else {
          missing.push(child[ATTACHMENT_MARKER]);
        }
      } else {
        walk(child);
      }
    }
  };
  walk(value);
  return missing;
}

// What the index says about attachments after a change: which are still referenced (with their sizes), and which records to remove.
function planAttachments({ entries, previous, added }) {
  const referenced = new Set();
  for (const entry of Object.values(entries)) for (const id of entry.atts || []) referenced.add(id);
  const index = {};
  for (const id of referenced) index[id] = added.get(id)?.length ?? previous[id] ?? 0;
  const removed = Object.keys(previous).filter(id => !referenced.has(id));
  return { index, removed };
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
  if (meta.attachments !== undefined && !isPlainObject(meta.attachments)) return 'meta-attachments';
  for (const id of meta.order) {
    const atts = meta.conversations[id].atts;
    if (atts !== undefined && (!Array.isArray(atts) || atts.some(item => typeof item !== 'string'))) return 'meta-entry';
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

  // Reads the attachments a conversation needs (those already read for another conversation are reused, so one file is one string in memory).
  async function readAttachments(ids, cache) {
    const wanted = ids.filter(id => !cache.has(id));
    for (let start = 0; start < wanted.length; start += ATTACHMENT_BATCH_SIZE) {
      const batch = wanted.slice(start, start + ATTACHMENT_BATCH_SIZE);
      const values = await readMany(batch.map(id => keys.attachment(id)));
      batch.forEach((id, offset) => {
        if (typeof values[offset] === 'string') cache.set(id, values[offset]);
      });
    }
  }

  // The conversation as the app uses it: parsed, with its attachments back in place. { ok: false, reason } when it cannot be completed.
  async function hydrateRecord(meta, id, raw, cache) {
    const parsed = parseJson(raw);
    if (!parsed.ok || !isPlainObject(parsed.value)) return { ok: false, reason: 'unreadable' };
    const atts = meta.conversations[id].atts || [];
    if (atts.length) {
      await readAttachments(atts, cache);
      if (hydrateConversation(parsed.value, cache).length) return { ok: false, reason: 'attachment-missing' };
    }
    return { ok: true, value: parsed.value };
  }

  async function readAllRecords(meta) {
    const records = { conversations: new Map(), problems: [] };
    const cache = new Map();
    for (let start = 0; start < meta.order.length; start += LOAD_BATCH_SIZE) {
      const ids = meta.order.slice(start, start + LOAD_BATCH_SIZE);
      const values = await readMany(ids.map(id => keys.conversation(id)));
      for (const [offset, id] of ids.entries()) {
        const raw = values[offset];
        if (raw == null) {
          records.problems.push({ id, reason: 'missing' });
          continue;
        }
        const hydrated = await hydrateRecord(meta, id, raw, cache);
        if (!hydrated.ok) {
          records.problems.push({ id, reason: hydrated.reason });
          continue;
        }
        if (fingerprintText(raw) !== meta.conversations[id].fp) records.problems.push({ id, reason: 'fingerprint-changed', usable: true });
        records.conversations.set(id, hydrated.value);
      }
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

  // beforeWrite(plan) runs inside the same exclusive section, after the changes are known and before anything is written. It may return
  // { skip: true } to write nothing, or { extraPuts } to write more records in the SAME transaction (the cloud sync journal, which must
  // never disagree with the conversations it describes). plan.readPrevious* give what is stored now, for working out what changed.
  function save(snapshot, { conversationIds = null, beforeWrite = null } = {}) {
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
      const changedIds = [];
      const added = new Map();
      for (const [position, conversation] of conversations.entries()) {
        const id = ids[position];
        const known = previous?.conversations[id];
        if (known && hinted && !hinted.has(id)) {
          entries[id] = known;
          continue;
        }
        const { json, attachments } = encodeConversation(conversation, `Conversation ${id}`);
        const fp = fingerprintText(json);
        if (known && known.fp === fp) {
          entries[id] = known;
          continue;
        }
        puts.push({ key: keys.conversation(id), value: json });
        const atts = [...attachments.keys()];
        entries[id] = { fp, size: json.length, updatedAt: conversation.lastUpdatedAt || conversation.createdAt || null, ...(atts.length ? { atts } : {}) };
        for (const [attachmentId, data] of attachments) added.set(attachmentId, data);
        changedIds.push(id);
      }

      // A record that could not be read last time is not a deleted conversation: keep it, at the end of the order.
      const order = [...ids];
      const present = new Set(ids);
      const removedIds = [];
      for (const id of previous?.order || []) {
        if (present.has(id)) continue;
        if (unreadable.has(id)) {
          entries[id] = previous.conversations[id];
          order.push(id);
        } else {
          removes.push(keys.conversation(id));
          removedIds.push(id);
        }
      }

      // New attachments get a record; attachments no conversation refers to any more lose theirs.
      const previousAttachments = previous?.attachments || {};
      const attachmentPlan = planAttachments({ entries, previous: previousAttachments, added });
      let attachmentsWritten = 0;
      for (const [attachmentId, data] of added) {
        if (attachmentId in previousAttachments) continue;
        puts.push({ key: keys.attachment(attachmentId), value: data });
        attachmentsWritten += 1;
      }
      for (const attachmentId of attachmentPlan.removed) removes.push(keys.attachment(attachmentId));

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
      const unchanged = Boolean(previous) && puts.length === 0 && removes.length === 0 && !orderChanged;
      const stats = () => ({
        written: changedIds.length,
        removed: removedIds.length,
        shared: sharedChanged,
        memory: memoryChanged,
        skipped: ids.length - changedIds.length,
        attachments: attachmentsWritten
      });

      let extraPuts = [];
      if (beforeWrite) {
        const plan = {
          unchanged,
          hadPrevious: Boolean(previous),
          changedConversationIds: [...changedIds],
          removedConversationIds: [...removedIds],
          sharedChanged,
          memoryChanged,
          readPreviousConversations: async wanted => {
            const found = new Map();
            const cache = new Map();
            const known = (wanted || []).filter(id => previous?.conversations[id]);
            for (let start = 0; start < known.length; start += LOAD_BATCH_SIZE) {
              const batch = known.slice(start, start + LOAD_BATCH_SIZE);
              const values = await readMany(batch.map(id => keys.conversation(id)));
              for (const [offset, id] of batch.entries()) {
                const hydrated = await hydrateRecord(previous, id, values[offset], cache);
                if (hydrated.ok) found.set(id, hydrated.value);
              }
            }
            return found;
          },
          readPreviousShared: async () => {
            const parsed = parseJson(await storage.getItem(keys.shared));
            return parsed.ok && isPlainObject(parsed.value) ? parsed.value : null;
          }
        };
        const decision = (await beforeWrite(plan)) || {};
        if (decision.skip) return { ...stats(), wrote: false };
        extraPuts = Array.isArray(decision.extraPuts) ? decision.extraPuts : [];
      }
      if (unchanged && extraPuts.length === 0) return { ...stats(), wrote: false };

      if (unchanged) {
        await storage.applyAtomic({ puts: extraPuts, removes: [] });
        return { ...stats(), wrote: true };
      }
      const meta = {
        ...(previous || { createdAt: now(), migratedFrom: null }),
        version: WS2_VERSION,
        savedAt: now(),
        order,
        conversations: entries,
        shared: sharedEntry,
        memory: memoryEntry,
        attachments: attachmentPlan.index
      };
      await storage.applyAtomic({ puts: [...puts, { key: keys.meta, value: JSON.stringify(meta) }, ...extraPuts], removes });
      return { ...stats(), wrote: true };
    });
  }

  // Applies transform(value, { kind, id }) to every record (each conversation, the shared data, the memory state), one at a time, and writes
  // back only the ones it changed (transform changes the value in place and returns true). For repairs that must touch old data without
  // holding all of it in memory.
  function rewrite({ transform, beforeWrite = null } = {}) {
    return exclusive(async () => {
      const current = await readMeta();
      if (current.state !== 'ok') return { changed: false, state: current.state };
      const { meta } = current;
      const puts = [];
      const entries = { ...meta.conversations };
      const changedConversationIds = [];
      for (let start = 0; start < meta.order.length; start += LOAD_BATCH_SIZE) {
        const batch = meta.order.slice(start, start + LOAD_BATCH_SIZE);
        const values = await readMany(batch.map(id => keys.conversation(id)));
        for (const [offset, id] of batch.entries()) {
          const parsed = parseJson(values[offset]);
          if (!parsed.ok || !isPlainObject(parsed.value)) continue;
          if (!(await transform(parsed.value, { kind: 'conversation', id }))) continue;
          const json = serialize(parsed.value, `Conversation ${id}`);
          puts.push({ key: keys.conversation(id), value: json });
          entries[id] = { ...meta.conversations[id], fp: fingerprintText(json), size: json.length, updatedAt: parsed.value.lastUpdatedAt || parsed.value.createdAt || null };
          changedConversationIds.push(id);
        }
      }
      let sharedEntry = meta.shared;
      let sharedChanged = false;
      const sharedParsed = parseJson(await storage.getItem(keys.shared));
      if (sharedParsed.ok && isPlainObject(sharedParsed.value) && await transform(sharedParsed.value, { kind: 'shared' })) {
        const json = serialize(sharedParsed.value, 'The shared workspace data');
        puts.push({ key: keys.shared, value: json });
        sharedEntry = { fp: fingerprintText(json), size: json.length };
        sharedChanged = true;
      }
      let memoryEntry = meta.memory;
      let memoryChanged = false;
      if (meta.memory !== null) {
        const memoryParsed = parseJson(await storage.getItem(keys.memory));
        if (memoryParsed.ok && await transform(memoryParsed.value, { kind: 'memory' })) {
          const json = serialize(memoryParsed.value, 'The memory state');
          puts.push({ key: keys.memory, value: json });
          memoryEntry = { fp: fingerprintText(json), size: json.length };
          memoryChanged = true;
        }
      }
      if (puts.length === 0) return { changed: false, state: 'ok' };
      const result = { changed: true, state: 'ok', changedConversationIds, sharedChanged, memoryChanged };
      const decision = (beforeWrite && (await beforeWrite(result))) || {};
      const next = { ...meta, savedAt: now(), conversations: entries, shared: sharedEntry, memory: memoryEntry };
      await storage.applyAtomic({
        puts: [...puts, { key: keys.meta, value: JSON.stringify(next) }, ...(Array.isArray(decision.extraPuts) ? decision.extraPuts : [])],
        removes: []
      });
      return result;
    });
  }

  // Only the memory state (the cloud memory sync needs nothing else, and must not load the conversations for it).
  async function readMemoryState() {
    const current = await readMeta();
    if (current.state !== 'ok') return { state: current.state };
    if (current.meta.memory === null) return { state: 'ok', memoryState: undefined };
    const parsed = parseJson(await storage.getItem(keys.memory));
    return parsed.ok ? { state: 'ok', memoryState: parsed.value } : { state: 'corrupt', reason: 'memory-unreadable' };
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
      const added = new Map();
      try {
        puts = conversations.map((conversation, position) => {
          const { json, attachments } = encodeConversation(conversation, `Conversation ${ids[position]}`);
          const fp = fingerprintText(json);
          const atts = [...attachments.keys()];
          entries[ids[position]] = { fp, size: json.length, updatedAt: conversation.lastUpdatedAt || conversation.createdAt || null, ...(atts.length ? { atts } : {}) };
          for (const [attachmentId, data] of attachments) added.set(attachmentId, data);
          baseline[ids[position]] = fp;
          return { key: keys.conversation(ids[position]), value: json };
        });
        for (const [attachmentId, data] of added) puts.push({ key: keys.attachment(attachmentId), value: data });
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
          attachments: planAttachments({ entries, previous: {}, added }).index,
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
          await storage.applyAtomic({ removes: [keys.meta, keys.shared, keys.memory, ...ids.map(id => keys.conversation(id)), ...[...added.keys()].map(id => keys.attachment(id))] });
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
      const newAttachments = new Map();
      for (const [position, conversation] of conversations.entries()) {
        const id = ids[position];
        const { json, attachments } = encodeConversation(conversation, `Conversation ${id}`);
        const fp = fingerprintText(json);
        const atts = [...attachments.keys()];
        const entryFor = updatedAt => ({ fp, size: json.length, updatedAt, ...(atts.length ? { atts } : {}) });
        baseline[id] = fp;
        const before = meta.migratedFrom.conversations[id];
        if (before === fp) continue;
        const updatedAt = conversation.lastUpdatedAt || conversation.createdAt || null;
        if (before === undefined) {
          if (entries[id]) continue;
          puts.push({ key: keys.conversation(id), value: json });
          entries[id] = entryFor(updatedAt);
          for (const [attachmentId, data] of attachments) newAttachments.set(attachmentId, data);
          order.unshift(id);
          added.push(id);
        } else if (entries[id] && Date.parse(updatedAt || '') > Date.parse(entries[id].updatedAt || '')) {
          puts.push({ key: keys.conversation(id), value: json });
          entries[id] = entryFor(updatedAt);
          for (const [attachmentId, data] of attachments) newAttachments.set(attachmentId, data);
          replaced.push(id);
        }
      }
      const previousAttachments = meta.attachments || {};
      const attachmentPlan = planAttachments({ entries, previous: previousAttachments, added: newAttachments });
      for (const [attachmentId, data] of newAttachments) {
        if (!(attachmentId in previousAttachments)) puts.push({ key: keys.attachment(attachmentId), value: data });
      }
      const next = {
        ...meta,
        savedAt: now(),
        order,
        conversations: entries,
        attachments: attachmentPlan.index,
        migratedFrom: { ...meta.migratedFrom, fingerprint: currentFingerprint, conversations: baseline, mergedAt: now() }
      };
      puts.push({ key: keys.meta, value: JSON.stringify(next) });
      await storage.applyAtomic({ puts, removes: attachmentPlan.removed.map(id => keys.attachment(id)) });
      return { state: 'merged', added, replaced };
    });
  }

  // Records that the index does not know (orphans) and records the index lists but the storage lacks (missing). Reporting only.
  function checkIntegrity() {
    return exclusive(async () => {
      const result = await readMeta();
      if (result.state !== 'ok') return { state: result.state, missing: [], orphans: [], missingAttachments: [] };
      const { meta } = result;
      const stored = new Set((await storage.getKeys()).filter(name => String(name).startsWith(keys.prefix)));
      const expected = new Set(meta.order.map(id => keys.conversation(id)));
      const expectedAttachments = new Set(Object.keys(meta.attachments || {}).map(id => keys.attachment(id)));
      return {
        state: 'ok',
        missing: meta.order.filter(id => !stored.has(keys.conversation(id))),
        orphans: [...stored].filter(name => (name.startsWith(`${keys.prefix}conv:`) && !expected.has(name)) || (name.startsWith(`${keys.prefix}att:`) && !expectedAttachments.has(name))),
        missingAttachments: [...expectedAttachments].filter(name => !stored.has(name))
      };
    });
  }

  // The way back: writes the whole workspace into the old single item and sets the "disabled" marker, in ONE transaction, after reading it
  // all back from the split records. The split records stay (nothing is deleted), so the move can be undone by asking for the split
  // storage again, which clears them and migrates the old item afresh. A workspace with a record that cannot be read is not exported (the
  // old item would lose it); allowDamaged overrides that.
  function exportToLegacy({ legacyKey, allowDamaged = false } = {}) {
    return exclusive(async () => {
      if (!legacyKey) throw new TypeError('exportToLegacy needs the key of the old item.');
      const result = await readMeta();
      if (result.state !== 'ok') return { state: result.state };
      const { meta } = result;
      const [sharedRaw, memoryRaw] = await readMany([keys.shared, keys.memory]);
      const shared = parseJson(sharedRaw);
      if (!shared.ok || !isPlainObject(shared.value)) return { state: 'corrupt', reason: 'shared-unreadable' };
      const workspace = { conversations: [], ...shared.value };
      if (meta.memory !== null) {
        const memory = parseJson(memoryRaw);
        if (!memory.ok) return { state: 'corrupt', reason: 'memory-unreadable' };
        workspace.memoryState = memory.value;
      }
      const { conversations, problems } = await readAllRecords(meta);
      const lost = problems.filter(problem => !problem.usable);
      if (lost.length && !allowDamaged) return { state: 'degraded', problems: lost };
      workspace.conversations = meta.order.filter(id => conversations.has(id)).map(id => conversations.get(id));
      const json = JSON.stringify(workspace);
      await storage.applyAtomic({ puts: [{ key: legacyKey, value: json }, { key: keys.disabled, value: now() }] });
      if ((await storage.getItem(legacyKey)) !== json) {
        await storage.applyAtomic({ removes: [keys.disabled] });
        return { state: 'failed', reason: 'the old item does not read back as written' };
      }
      return { state: 'exported', conversations: workspace.conversations.length, bytes: json.length, skipped: lost.length };
    });
  }

  async function getUsage() {
    const result = await readMeta();
    if (result.state !== 'ok') return { conversations: 0, bytes: 0 };
    const { meta } = result;
    const bytes = meta.order.reduce((sum, id) => sum + (meta.conversations[id].size || 0), 0)
      + Object.values(meta.attachments || {}).reduce((sum, size) => sum + (size || 0), 0)
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
    rewrite,
    readMemoryState,
    migrateFromLegacy,
    mergeStaleLegacy,
    exportToLegacy,
    checkIntegrity,
    getUsage,
    getMigrationFailure: readFailure,
    setDisabled,
    isDisabled,
    removeAll
  };
}

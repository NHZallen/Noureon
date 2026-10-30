// The periodic tidy of the notebook (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.7): two layers. The first is the program alone, no model: what ran out is
// archived, what nobody used fades, notes that say the same are merged, the first page is brought back inside its rules. The second is for what only a reading can tell: a few
// SUSPECT GROUPS (notes with the same words that may say the same or contradict each other) are given to the cheap model, one group at a time, and its answer is checked by the
// program before it is applied (only notes of the group, the later one wins, a locked note is never touched, a merged sentence may only hold what the notes held). Shared by the
// page and the server: no window, no document, no browser storage.

import { LIMITS, isActive } from './notes.js';
import { expire, fade } from './lifecycle.js';
import { reconcileStanding } from './standing.js';
import { jaccard, overlapCoefficient, termSet } from './tokenize.js';
import { later } from './supersede.js';

const DAY = 24 * 60 * 60 * 1000;
const SAME = 0.85;
const GROUP_OVERLAP = 0.5;
const MAX_GROUP = 5;
const MERGE_COVERAGE = 0.8;

/** When the tidy is due: some notes changed since the last one, or the notebook is nearly full, or a week has passed (and there is something to tidy). */
export function shouldConsolidate({ notes, lastRunAt = null, changedSince = 0, now = () => new Date().toISOString() }) {
  const active = notes.filter(isActive).length;
  if (!active) return false;
  if (changedSince >= 20) return true;
  if (active > LIMITS.maxActive * 0.8) return true;
  return !lastRunAt || Date.parse(now()) - Date.parse(lastRunAt) > 7 * DAY;
}

const wordsOf = (note) => termSet(note.text, note.keywords);

/** Two notes that say the same: the later one's text stays, the sightings add up, the sources are joined. */
function merge(keep, other, now) {
  const first = Date.parse(keep.observedAt) >= Date.parse(other.observedAt) ? keep : other;
  const second = first === keep ? other : keep;
  return {
    ...first,
    evidenceCount: first.evidenceCount + second.evidenceCount,
    observedAt: later(first.observedAt, second.observedAt),
    standing: first.standing || second.standing,
    locked: first.locked || second.locked,
    keywords: [...new Set([...first.keywords, ...second.keywords])].slice(0, LIMITS.maxKeywords),
    lastUsedAt: later(first.lastUsedAt, second.lastUsedAt) || null,
    recallCount: first.recallCount + second.recallCount,
    updatedAt: now(),
    source: { ...first.source, seen: [...new Set([...(first.source.seen || []), ...(second.source.seen || [])])].slice(-10), messageIds: [...new Set([...first.source.messageIds, ...second.source.messageIds])].slice(-20) }
  };
}

/**
 * The first layer. Returns { notes, actions: [{ type: 'expire' | 'fade' | 'merge' | 'standing', ids }] }; no model is called.
 * A locked note is not merged into another (the person made it so).
 */
export function layerOne(notes, now = () => new Date().toISOString()) {
  const actions = [];
  const expired = expire(notes, now);
  if (expired.changed.length) actions.push({ type: 'expire', ids: expired.changed });
  const faded = fade(expired.notes, now);
  if (faded.changed.length) actions.push({ type: 'fade', ids: faded.changed });
  let next = faded.notes;
  const dropped = new Set();
  const active = next.filter((note) => isActive(note) && !note.locked);
  for (let left = 0; left < active.length; left += 1) {
    if (dropped.has(active[left].id)) continue;
    for (let right = left + 1; right < active.length; right += 1) {
      if (dropped.has(active[right].id)) continue;
      if (jaccard(wordsOf(active[left]), wordsOf(active[right])) < SAME) continue;
      const merged = merge(active[left], active[right], now);
      const loser = merged.id === active[left].id ? active[right] : active[left];
      next = next.filter((note) => note.id !== loser.id).map((note) => (note.id === merged.id ? merged : note));
      dropped.add(loser.id);
      active[left] = merged.id === active[left].id ? merged : active[left];
      actions.push({ type: 'merge', ids: [merged.id, loser.id] });
    }
  }
  const standing = reconcileStanding(next);
  if (standing.promoted.length || standing.demoted.length) actions.push({ type: 'standing', ids: [...standing.promoted, ...standing.demoted] });
  return { notes: standing.notes, actions };
}

/**
 * The groups of notes that may say the same or contradict each other: of the same kind, with many words in common but not the same. Groups of two to five. Locked notes are
 * left out. Returns [[note, …], …].
 */
export function suspectGroups(notes, { maxGroups = 6 } = {}) {
  const active = notes.filter((note) => isActive(note) && !note.locked);
  const used = new Set();
  const groups = [];
  for (let first = 0; first < active.length && groups.length < maxGroups; first += 1) {
    if (used.has(active[first].id)) continue;
    const group = [active[first]];
    for (let second = first + 1; second < active.length && group.length < MAX_GROUP; second += 1) {
      if (used.has(active[second].id) || active[second].kind !== active[first].kind) continue;
      if (overlapCoefficient(wordsOf(active[first]), wordsOf(active[second])) >= GROUP_OVERLAP) group.push(active[second]);
    }
    if (group.length >= 2) {
      group.forEach((note) => used.add(note.id));
      groups.push(group);
    }
  }
  return groups;
}

/**
 * Checks what the model answered for a group: `ops` is [{ type: 'merge', ids: [...], text, keywords }, { type: 'supersede', keep, drop }, { type: 'keep' }]. Returns
 * { ok: true, ops: [the ones that pass] } with `rejected` for the rest and why.
 */
export function checkGroupOps(group, ops) {
  const byId = new Map(group.map((note) => [note.id, note]));
  const pass = [];
  const rejected = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op?.type === 'keep') continue;
    if (op?.type === 'supersede') {
      const keep = byId.get(op.keep);
      const drop = byId.get(op.drop);
      if (!keep || !drop || keep.id === drop.id) rejected.push({ op, why: 'not_in_group' });
      else if (keep.locked || drop.locked) rejected.push({ op, why: 'locked' });
      // The later one wins, whatever the model says.
      else pass.push(Date.parse(keep.observedAt) >= Date.parse(drop.observedAt) ? { type: 'supersede', keep: keep.id, drop: drop.id } : { type: 'supersede', keep: drop.id, drop: keep.id });
      continue;
    }
    if (op?.type === 'merge') {
      const members = (op.ids || []).map((id) => byId.get(id));
      if (members.length < 2 || members.some((note) => !note)) rejected.push({ op, why: 'not_in_group' });
      else if (members.some((note) => note.locked)) rejected.push({ op, why: 'locked' });
      else {
        const text = String(op.text || '').replace(/\s+/g, ' ').trim();
        const held = termSet(...members.map((note) => note.text), ...members.flatMap((note) => note.keywords));
        const said = [...termSet(text)];
        const covered = said.length ? said.filter((term) => held.has(term)).length / said.length : 0;
        if (!text || text.length > LIMITS.maxText || covered < MERGE_COVERAGE) rejected.push({ op, why: 'adds_something' });
        else pass.push({ type: 'merge', ids: members.map((note) => note.id), text, keywords: op.keywords });
      }
      continue;
    }
    rejected.push({ op, why: 'unknown' });
  }
  return { ok: true, ops: pass, rejected };
}

/** Applies the ops that passed: a merge makes one note (the newest of them, with the new text), a supersede drops the older. Returns { notes, actions }. */
export function applyGroupOps(notes, ops, now = () => new Date().toISOString()) {
  let next = notes;
  const actions = [];
  for (const op of ops) {
    if (op.type === 'supersede') {
      const keep = next.find((note) => note.id === op.keep);
      const drop = next.find((note) => note.id === op.drop);
      if (!keep || !drop) continue;
      const merged = { ...merge(keep, drop, now), text: keep.text };
      next = next.filter((note) => note.id !== drop.id).map((note) => (note.id === keep.id ? merged : note));
      actions.push({ type: 'supersede', ids: [keep.id, drop.id] });
    } else if (op.type === 'merge') {
      const members = op.ids.map((id) => next.find((note) => note.id === id)).filter(Boolean);
      if (members.length < 2) continue;
      const newest = members.reduce((best, note) => (Date.parse(note.observedAt) > Date.parse(best.observedAt) ? note : best), members[0]);
      let combined = newest;
      for (const note of members) if (note.id !== newest.id) combined = merge(combined, note, now);
      combined = { ...combined, text: op.text, keywords: op.keywords && op.keywords.length ? op.keywords : combined.keywords };
      const gone = new Set(members.filter((note) => note.id !== newest.id).map((note) => note.id));
      next = next.filter((note) => !gone.has(note.id)).map((note) => (note.id === newest.id ? combined : note));
      actions.push({ type: 'merge', ids: members.map((note) => note.id) });
    }
  }
  return { notes: next, actions };
}

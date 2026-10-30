// The offline check of the memory (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §10): `node scripts/memory-eval.mjs`.
//
// What it measures without any model (so that it also runs in the tests): the RATE OF OVER-REFERENCE (questions that have nothing to do with the notebook must bring no slip),
// the RATE OF HITS (questions that clearly bear on a note must bring it) and what the check of writes says about scripted requests (made-up words, words only the assistant said,
// a pasted text that gives orders, a secret, an order to the assistant, the same fact twice). The cases are in scripts/memory-eval-cases.json: add yours there.
//
// The run with a real model (`--live`, with the key of the person who runs it: how often a model writes what it should and nothing else) comes with the tools in P4
// (src/data/memory-tool.js), because it needs the words that tell the model what to write.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPrefetch } from '../src/app/runtime/memory-notes/inject.js';
import { createNote } from '../src/app/runtime/memory-notes/notes.js';
import { applyWrite } from '../src/app/runtime/memory-notes/write-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const loadCases = () => JSON.parse(readFileSync(join(HERE, 'memory-eval-cases.json'), 'utf8'));

const NOW = '2026-10-30T00:00:00.000Z';
const noteOf = (raw) => ({ ...createNote({ id: raw.id, text: raw.text, keywords: raw.keywords, kind: raw.kind, source: { conversationId: 'fixture', messageIds: [`fixture-${raw.id}`], quote: 'fixture', seen: ['fixture|2026-10-01'] }, observedAt: '2026-10-01T00:00:00.000Z', now: () => NOW }), standing: raw.standing === true, surface: raw.surface || 'normal', evidenceCount: raw.evidenceCount || 1 });

/** Runs the cases that need no model. Returns { overReference, hitRate, failures, writes }. */
export function runDeterministic(cases = loadCases()) {
  const notes = cases.notes.map(noteOf);
  const failures = [];
  let over = 0;
  for (const question of cases.neutral) {
    const slip = buildPrefetch({ notes, question });
    if (slip.noteIds.length) {
      over += 1;
      failures.push({ kind: 'over-reference', question, brought: slip.noteIds });
    }
  }
  let hits = 0;
  for (const item of cases.recall) {
    const slip = buildPrefetch({ notes, question: item.question });
    if (slip.noteIds.includes(item.expect)) hits += 1;
    else failures.push({ kind: 'missed', question: item.question, expected: item.expect, brought: slip.noteIds });
  }
  const writes = [];
  let counter = 0;
  for (const item of cases.writes) {
    const have = (item.notes || []).map((id) => notes.find((note) => note.id === id)).filter(Boolean);
    const result = applyWrite({ notes: have, request: item.request, context: { conversationId: 'eval', messages: item.messages, who: 'tool', createId: () => `eval-${(counter += 1)}`, now: () => NOW } });
    const got = result.ok ? result.action : result.code;
    writes.push({ id: item.id, expected: item.expect, got });
    if (got !== item.expect) failures.push({ kind: 'write', id: item.id, expected: item.expect, got });
  }
  return {
    overReference: cases.neutral.length ? over / cases.neutral.length : 0,
    hitRate: cases.recall.length ? hits / cases.recall.length : 1,
    neutral: cases.neutral.length,
    recall: cases.recall.length,
    failures,
    writes
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes('--live')) {
    console.error('The run with a real model comes with the tools of memory (P4): src/data/memory-tool.js.');
    process.exit(2);
  }
  const result = runDeterministic();
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  console.log(`Over-reference (a slip for a question about nothing): ${percent(result.overReference)} of ${result.neutral} questions (the goal is 0%)`);
  console.log(`Hits (the slip brings the note the question is about): ${percent(result.hitRate)} of ${result.recall} questions`);
  console.log(`Checks of writes: ${result.writes.filter((write) => write.expected === write.got).length} of ${result.writes.length} as expected`);
  for (const failure of result.failures) console.log(' ✗', JSON.stringify(failure));
  process.exit(result.failures.length ? 1 : 0);
}

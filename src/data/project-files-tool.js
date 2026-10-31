// How the model of a reply looks into the files of a project by itself (docs/superpowers/specs/2026-10-31-projects-design.md, §16): two tools, `search_project_files` and `read_project_file`,
// in the same form as `load_skill` and `search_memory` (see combine-loaders.js). Nothing of the files is put in front of the model at the start: it is told their names (a list in the
// instructions) and takes what it needs. The text of a file comes from `readText(entry)` (the page reads its own copy, the server reads the file from the person's cloud storage); it is read
// the first time a call needs it and kept for the reply. The search is the BM25 of the memory (memory-notes/bm25.js) over passages of about nine hundred characters.
// Pure functions, shared by the page and the server: no window, no document, no browser storage.

import { createBm25Index } from '../app/runtime/memory-notes/bm25.js';
import { terms } from '../app/runtime/memory-notes/tokenize.js';
import { sandboxText } from '../app/runtime/sandbox/sandbox-texts.js';

export const SEARCH_PROJECT_FILES_TOOL = Object.freeze({
  name: 'search_project_files',
  description: 'Look through the files of this project (its sources) for passages about something. Call it whenever the answer may be in them: the user mentions a file, a document, a report, "the data", or asks about something the project is about. It gives the best passages with the file they come from and where. For the whole of a file, or more around a passage, use read_project_file. Do not say that you searched.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 300, description: 'What to look for, in a few words, in the language the files are most likely written in.' },
      file: { type: 'string', maxLength: 200, description: 'Only look in this file (its name, as in the list of project files). Leave it out to look in all of them.' },
      k: { type: 'integer', minimum: 1, maximum: 10, description: 'How many passages at most (6 when omitted).' }
    },
    required: ['query']
  })
});

export const READ_PROJECT_FILE_TOOL = Object.freeze({
  name: 'read_project_file',
  description: 'Read a part of one file of this project. "start" is the character where to begin (0 is the beginning, and the passages of the search say where they are), "length" how many characters (up to 12000). The answer says where the next part begins, so a long file is read part by part. Do not say that you read it unless the user asked.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      file: { type: 'string', maxLength: 200, description: 'The name of the file, as in the list of project files.' },
      start: { type: 'integer', minimum: 0, description: 'The character to begin at (0 when omitted).' },
      length: { type: 'integer', minimum: 200, maximum: 12000, description: 'How many characters (8000 when omitted).' }
    },
    required: ['file']
  })
});

export const MAX_PROJECT_FILE_CALLS = 14;
export const PASSAGE_CHARS = 900;
const OVERLAP = 120;
const NAMES = new Set([SEARCH_PROJECT_FILES_TOOL.name, READ_PROJECT_FILE_TOOL.name]);
export const isProjectFilesToolName = (name) => NAMES.has(name);
/** The most characters of one file the search looks at (the rest of a very long file is still read with read_project_file). */
export const SEARCHED_CHARS_MAX = 2_000_000;

const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

/** The text cut into passages of about `size` characters, at the end of a line or a sentence when there is one near: [{ start, end, text }]. */
export function passagesOf(text, { size = PASSAGE_CHARS, overlap = OVERLAP } = {}) {
  const source = String(text ?? '');
  const out = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + size);
    if (end < source.length) {
      const window = source.slice(start + Math.floor(size * 0.6), end);
      const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('。'), window.lastIndexOf('. '), window.lastIndexOf('！'), window.lastIndexOf('？'));
      if (cut >= 0) end = start + Math.floor(size * 0.6) + cut + 1;
    }
    const piece = source.slice(start, end);
    if (piece.trim()) out.push({ start, end, text: piece });
    if (end >= source.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

/** The list of the files of the project as the instructions tell it: a line for each file, with what it is. */
export function projectFilesListText(entries) {
  return entries.map((entry) => `- ${entry.name} (${entry.kindText || entry.kind}${entry.size ? `, ${entry.size >= 1048576 ? `${(entry.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(entry.size / 1024))} KB`}` : ''})`).join('\n');
}

/**
 * `entries`: [{ id, name, kind, size }] (the files that can be looked into; `id` is unique). `readText(entry)` resolves the text of a file ('' when it has none, as a scan; it may throw).
 * `onUsed({ files })` is told which files a search or a read brought something from. `language` is the language of the rows of the step list.
 */
export function createProjectFilesLoader({ entries, readText, language = 'zh-TW', maxCalls = MAX_PROJECT_FILE_CALLS, onUsed = null }) {
  const files = entries.map((entry) => ({ ...entry }));
  const texts = new Map();
  let calls = 0;
  let lastOutcome = null;
  let index = null;
  let indexed = null;

  const load = async (entry) => {
    if (!texts.has(entry.id)) {
      texts.set(entry.id, (async () => {
        try {
          return String(await readText(entry) ?? '');
        } catch {
          return null;
        }
      })());
    }
    return texts.get(entry.id);
  };

  // The file a call names: its name as it is in the list, else (when only one) a name that holds the words, else (when only one file exists) that one.
  const resolve = (name) => {
    const wanted = clean(name, 200).toLowerCase();
    if (!wanted) return files.length === 1 ? files[0] : null;
    const exact = files.find((entry) => entry.name.toLowerCase() === wanted);
    if (exact) return exact;
    const near = files.filter((entry) => entry.name.toLowerCase().includes(wanted) || wanted.includes(entry.name.toLowerCase()));
    return near.length === 1 ? near[0] : null;
  };
  const listText = () => files.map((entry) => entry.name).join(', ');

  async function buildIndex() {
    if (index) return index;
    indexed ||= (async () => {
      const documents = [];
      const passages = [];
      let budget = SEARCHED_CHARS_MAX;
      for (const entry of files) {
        const text = await load(entry);
        if (!text || budget <= 0) continue;
        const slice = text.slice(0, budget);
        budget -= slice.length;
        for (const passage of passagesOf(slice)) {
          const id = passages.length;
          passages.push({ file: entry, ...passage });
          documents.push({ id, terms: terms(`${entry.name} ${passage.text}`) });
        }
      }
      index = { bm25: createBm25Index(documents), passages };
      return index;
    })();
    return indexed;
  }

  async function unreadable() {
    const out = [];
    for (const entry of files) {
      const text = await load(entry);
      if (!text) out.push(entry.name);
    }
    return out;
  }

  async function search(call) {
    const query = clean(call?.args?.query, 300);
    if (!query) return 'The call had no "query": say in a few words what to look for.';
    if (calls >= maxCalls) return `The limit of ${maxCalls} looks into the project files per reply is reached. Go on with what you have.`;
    calls += 1;
    const limit = Math.min(10, Math.max(1, Math.floor(Number(call?.args?.k) || 6)));
    const only = call?.args?.file ? resolve(call.args.file) : null;
    if (call?.args?.file && !only) return `There is no such file. The files of the project: ${listText()}.`;
    const { bm25, passages } = await buildIndex();
    const queryTerms = terms(query);
    const hits = bm25.search(queryTerms, { limit: limit * 4, minNorm: 0.04 })
      .map((hit) => passages[hit.id])
      .filter((passage) => !only || passage.file.id === only.id)
      .slice(0, limit);
    lastOutcome = { key: 'projectFilesSearching', count: hits.length };
    if (hits.length) onUsed?.({ files: [...new Set(hits.map((hit) => hit.file.name))] });
    const empty = await unreadable();
    if (!hits.length) {
      return `Nothing in the project files matches that. The files: ${listText()}.${empty.length ? ` No text could be read from: ${empty.join(', ')} (a scan or a picture).` : ''} You may read a file from its start with read_project_file, or go on without.`;
    }
    return JSON.stringify({
      note: 'Passages of the files of the project. Use read_project_file with the "start" of a passage to read more around it.',
      passages: hits.map((hit) => ({ file: hit.file.name, start: hit.start, end: hit.end, text: hit.text.trim() })),
      ...(empty.length ? { no_text: empty } : {})
    });
  }

  async function read(call) {
    if (calls >= maxCalls) return `The limit of ${maxCalls} looks into the project files per reply is reached. Go on with what you have.`;
    const entry = resolve(call?.args?.file);
    if (!entry) return `There is no such file. The files of the project: ${listText()}.`;
    calls += 1;
    const text = await load(entry);
    if (text === null) {
      lastOutcome = { key: 'projectFilesReading', count: 0 };
      return `The file "${entry.name}" could not be read now. Go on without it.`;
    }
    if (!text.trim()) {
      lastOutcome = { key: 'projectFilesReading', count: 0 };
      return `No text could be read from "${entry.name}" (it may be a scan or a picture).`;
    }
    const start = Math.min(text.length, Math.max(0, Math.floor(Number(call?.args?.start) || 0)));
    const length = Math.min(12000, Math.max(200, Math.floor(Number(call?.args?.length) || 8000)));
    const end = Math.min(text.length, start + length);
    lastOutcome = { key: 'projectFilesReading', count: 1 };
    onUsed?.({ files: [entry.name] });
    return JSON.stringify({ file: entry.name, start, end, total: text.length, ...(end < text.length ? { next: end } : { next: null }), text: text.slice(start, end) });
  }

  return {
    get list() { return []; },
    instruction: '',
    get used() { return calls; },
    get tools() {
      if (!files.length || calls >= maxCalls) return [];
      return [SEARCH_PROJECT_FILES_TOOL, READ_PROJECT_FILE_TOOL];
    },
    handles: (name) => isProjectFilesToolName(name),
    noteFor: (call) => ({ name: call?.name }),
    outcome() {
      const outcome = lastOutcome;
      lastOutcome = null;
      return outcome;
    },
    stepEvent: (call, lang = language) => {
      const key = call?.name === READ_PROJECT_FILE_TOOL.name ? 'projectFilesReading' : 'projectFilesSearching';
      return { type: 'memory', event: 'call', tool: call?.name, key, label: sandboxText(lang, key) };
    },
    async run(call) {
      return call?.name === READ_PROJECT_FILE_TOOL.name ? read(call) : search(call);
    }
  };
}

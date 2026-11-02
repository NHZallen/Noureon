// How the model of a reply looks into the files of a project by itself (docs/superpowers/specs/2026-10-31-projects-design.md, §16): two tools, `search_project_files` and `read_project_file`,
// in the same form as `load_skill` and `search_memory` (see combine-loaders.js). Nothing of the files is put in front of the model at the start: it is told their names (a list in the
// instructions) and takes what it needs. The text of a file comes from `readText(entry)` (the page reads its own copy, the server reads the file from the person's cloud storage); it is read
// the first time a call needs it and kept for the reply. The search is the BM25 of the memory (memory-notes/bm25.js) over passages of about nine hundred characters.
// Pure functions, shared by the page and the server: no window, no document, no browser storage.

import { createBm25Index } from '../app/runtime/memory-notes/bm25.js';
import { terms } from '../app/runtime/memory-notes/tokenize.js';
import { fuseRanks, textHash } from '../app/runtime/memory-notes/vector-math.js';
import { formatTime, mediaPieceHash, placeOfPiece, suffixInfo, suffixOfPieceId } from './project-media.js';
import { pieceIdOf, sourceOfPieceId } from './project-piece-id.js';

export { PIECE_PREFIX, pieceIdOf, sourceOfPieceId } from './project-piece-id.js';
export { mediaPieceHash } from './project-media.js';
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

export const VIEW_PROJECT_FILE_TOOL = Object.freeze({
  name: 'view_project_file',
  description: 'Look at the pictures, the videos and the scanned documents of this project: what you ask for is shown to you with the answer. Use it for a file that search_project_files named, or when the question is about what such a file shows. A picture: give its name. A video: give its name and, when the search said where, "at" (the second to look from; you are shown 4 frames over the next 30 seconds; without "at", 4 frames over the whole video). A scanned document: give its name and the "page". Give one name in "file", or up to 4 pictures in "files" to compare or to find the right one; look only at what the question needs. A recording cannot be looked at. Do not say that you looked unless the user asked.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      file: { type: 'string', maxLength: 200, description: 'The name of the file, as in the list of project files or in the result of the search.' },
      files: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 200 }, description: 'The names of up to 4 pictures to look at together (instead of "file").' },
      at: { type: 'number', minimum: 0, description: 'A video: the second to look from.' },
      page: { type: 'integer', minimum: 1, description: 'A scanned document: the page to look at.' }
    }
  })
});

/**
 * What one reply may look at with view_project_file. The model is shown small copies (a few hundred KB at most), and every round of the reply sends the pictures of the earlier rounds again, so what
 * counts is the size of the copies and how many there are, not the size of the originals: up to PROJECT_VIEW_PICTURES_PER_CALL a call, PROJECT_VIEW_PICTURES_MAX a reply, and
 * PROJECT_VIEW_CHARS_MAX characters (base64) of copies together.
 */
export const PROJECT_VIEW_PICTURES_PER_CALL = 4;
/** The most pictures one call may bring back (a video is 4 frames). */
export const PROJECT_VIEW_IMAGES_PER_CALL = 8;
export const PROJECT_VIEW_PICTURES_MAX = 24;
export const PROJECT_VIEW_CHARS_MAX = 6_000_000;
export const MAX_PROJECT_FILE_CALLS = 14;
/** The calls of view_project_file a reply may make (apart from the searches and reads above: the pictures have their own limits, PROJECT_VIEW_*). */
export const MAX_PROJECT_VIEW_CALLS = 12;
export const PASSAGE_CHARS = 900;
const OVERLAP = 120;
/** How many places of one file a search tells (the windows of a video or a recording that match best). */
const MAX_PLACES_PER_FILE = 3;
const NAMES = new Set([SEARCH_PROJECT_FILES_TOOL.name, READ_PROJECT_FILE_TOOL.name, VIEW_PROJECT_FILE_TOOL.name]);
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

/**
 * The passages of the files of one project as the search and the vectors both see them: `files` is [{ id, name, text }], read in order up to `budget` characters. Each is
 * { file, number, id (the piece id), start, end, text }. One function for both, so that a vector found for a passage is the vector of the very passage the search shows.
 */
export function projectPassages(files, { budget = SEARCHED_CHARS_MAX } = {}) {
  const out = [];
  let left = budget;
  for (const file of files) {
    const text = String(file.text ?? '');
    if (!text || left <= 0) continue;
    const slice = text.slice(0, left);
    left -= slice.length;
    passagesOf(slice).forEach((passage, number) => out.push({ file, number, id: pieceIdOf(file.id, number), ...passage }));
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
 * `vectorSearch(query, { fileIds, limit })` (optional) resolves [{ id, hash, cosine }] (the nearest in meaning, as piece ids; any failure is []): with it a search puts what the keywords
 * find and what the vectors find together; without it, or when it finds nothing, the keywords are used alone.
 * `mediaEntries`: [{ id, name, kind: 'image' | 'video' | 'audio' | 'scan', size, fileHash, duration?, pages?, attached }], the files that have no text. A search finds them by their names and, with the
 * vectors, by what they show or say (the place is in the piece id: the second a window of a video or a recording starts, the page of a scan).
 * `linkEntries`: [{ id, name, url }], the web pages of the project: they are not searched (nothing of them is kept); read_project_file fetches the page when asked, with `readLink(entry)` (resolves its text; throws
 * an error with `code: 'noReader'` when no key of a reading service is there). `canView` (the model can see pictures) and `viewMedia(entry, { at, page })` (resolves { mimeType, data (base64) } of a small copy of a picture, an array of them for the frames of a video, or null: the
 * page and the server each make it) give the model the tool view_project_file.
 */
export function createProjectFilesLoader({ entries, linkEntries = [], readLink = null, readText, language = 'zh-TW', maxCalls = MAX_PROJECT_FILE_CALLS, onUsed = null, vectorSearch = null, mediaEntries = [], canView = false, viewMedia = null }) {
  const files = entries.map((entry) => ({ ...entry }));
  const links = (Array.isArray(linkEntries) ? linkEntries : []).filter((entry) => entry?.url).map((entry) => ({ ...entry }));
  const linkTexts = new Map();
  // The pictures, videos, recordings and scans of the project: [{ id, name, kind, size, fileHash, attached }] (`attached`: it went with the message of this reply). They have no text: a search finds them
  // by their name and, with the vectors, by what they show or say; it says which they are, where in them, and whether the model has them in front of it.
  const media = Array.isArray(mediaEntries) ? mediaEntries : [];
  for (const entry of media) entry.kind ||= 'image';
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
  const listText = () => [...files, ...links].map((entry) => entry.name).join(', ');
  const resolveLink = (name) => {
    const wanted = clean(name, 200).toLowerCase();
    if (!wanted) return !files.length && links.length === 1 ? links[0] : null;
    const exact = links.find((entry) => entry.name.toLowerCase() === wanted || entry.url.toLowerCase() === wanted);
    if (exact) return exact;
    const near = links.filter((entry) => entry.name.toLowerCase().includes(wanted) || wanted.includes(entry.name.toLowerCase()) || entry.url.toLowerCase().includes(wanted));
    return near.length === 1 ? near[0] : null;
  };
  // The page of a web address, fetched when it is asked for and kept for the reply: { text } or { error: 'noReader' | 'failed' }.
  const loadLink = (entry) => {
    if (!linkTexts.has(entry.id)) {
      linkTexts.set(entry.id, (async () => {
        if (typeof readLink !== 'function') return { error: 'noReader' };
        try {
          return { text: String(await readLink(entry) ?? '') };
        } catch (error) {
          return { error: error?.code === 'noReader' ? 'noReader' : 'failed' };
        }
      })());
    }
    return linkTexts.get(entry.id);
  };
  const resolveMedia = (name) => {
    const wanted = clean(name, 200).toLowerCase();
    return wanted ? media.find((entry) => entry.name.toLowerCase() === wanted) || null : null;
  };
  // The picture a call names: its name as it is in the list, else (when only one) a name that holds the words, else (when it is the only picture) that one.
  const resolvePicture = (name) => {
    const wanted = clean(name, 200).toLowerCase();
    if (!wanted) return media.length === 1 ? media[0] : null;
    const near = media.filter((entry) => entry.name.toLowerCase().includes(wanted) || wanted.includes(entry.name.toLowerCase()));
    return resolveMedia(name) || (near.length === 1 ? near[0] : null);
  };
  let viewCalls = 0;
  let viewedCount = 0;
  let viewedChars = 0;
  const viewed = new Set();

  async function buildIndex() {
    if (index) return index;
    indexed ||= (async () => {
      const readable = [];
      for (const entry of files) {
        const text = await load(entry);
        if (text) readable.push({ id: entry.id, name: entry.name, text, entry });
      }
      const documents = [];
      const passages = projectPassages(readable).map((passage, position) => {
        documents.push({ id: position, terms: terms(`${passage.file.name} ${passage.text}`) });
        return { ...passage, file: passage.file.entry };
      });
      index = { bm25: createBm25Index(documents), passages, byPiece: new Map(passages.map((passage, position) => [passage.id, position])) };
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
    const onlyPicture = call?.args?.file ? resolveMedia(call.args.file) : null;
    if (call?.args?.file && !resolveMedia(call.args.file) && !resolve(call.args.file) && resolveLink(call.args.file)) return `"${resolveLink(call.args.file).name}" is a web page: web pages are not searched. Read it with read_project_file.`;
    const only = call?.args?.file && !onlyPicture ? resolve(call.args.file) : null;
    if (call?.args?.file && !only && !onlyPicture) return `There is no such file. The files of the project: ${[listText(), ...media.map((entry) => entry.name)].filter(Boolean).join(', ')}.`;
    const { bm25, passages, byPiece } = await buildIndex();
    const queryTerms = terms(query);
    const byKeywords = onlyPicture ? [] : bm25.search(queryTerms, { limit: limit * 4, minNorm: 0.04 })
      .map((hit) => hit.id)
      .filter((position) => !only || passages[position].file.id === only.id);
    // What the vectors find: only a vector of the very text that is there now counts (the hash), and only in the files asked about.
    let byMeaning = [];
    let mediaByMeaning = [];
    const places = new Map();
    if (vectorSearch) {
      try {
        const pool = onlyPicture ? [onlyPicture] : only ? [only] : [...files, ...media];
        const matches = await vectorSearch(query, { fileIds: pool.map((entry) => entry.id), limit: limit * 6 });
        const list = Array.isArray(matches) ? matches : [];
        byMeaning = list
          .map((hit) => ({ position: byPiece.get(hit.id), hash: hit.hash }))
          .filter((hit) => hit.position !== undefined && textHash(passages[hit.position].text) === hit.hash && (!only || passages[hit.position].file.id === only.id))
          .map((hit) => hit.position);
        // A piece of a file counts only when the vector is the one of the very part of the very file that is there now (the hash), and of the kind the file is.
        const wanted = new Map(media.filter((entry) => !onlyPicture || entry.id === onlyPicture.id).map((entry) => [entry.id, entry]));
        for (const hit of list) {
          const entry = wanted.get(sourceOfPieceId(hit.id));
          if (!entry) continue;
          const suffix = suffixOfPieceId(hit.id);
          const info = suffixInfo(suffix);
          if (entry.kind === 'image' ? suffix !== '0' : info.kind !== entry.kind) continue;
          if (mediaPieceHash(entry.fileHash, suffix) !== hit.hash) continue;
          if (!places.has(entry.id)) { places.set(entry.id, []); mediaByMeaning.push(entry.id); }
          const place = placeOfPiece(hit.id, entry.kind, entry.duration);
          if (place && places.get(entry.id).length < MAX_PLACES_PER_FILE) places.get(entry.id).push(place);
        }
      } catch {
        byMeaning = [];
        mediaByMeaning = [];
      }
    }
    const order = byMeaning.length ? fuseRanks([byKeywords, byMeaning], { limit }) : byKeywords.slice(0, limit);
    const hits = order.map((position) => passages[position]);
    // The other files: by the words of their names, and (with the vectors) by what they show or say.
    const mediaByName = media
      .filter((entry) => !only && (!onlyPicture || entry.id === onlyPicture.id))
      .map((entry) => ({ id: entry.id, shared: terms(entry.name.replace(/[._()[\]-]+/g, ' ')).filter((term) => queryTerms.includes(term)).length }))
      .filter((entry) => entry.shared > 0)
      .sort((left, right) => right.shared - left.shared)
      .map((entry) => entry.id);
    const mediaOrder = mediaByMeaning.length || mediaByName.length ? fuseRanks([mediaByName, mediaByMeaning], { limit: Math.min(4, limit) }) : [];
    const found = mediaOrder.map((id) => media.find((entry) => entry.id === id)).filter(Boolean);
    const how = byMeaning.length || mediaByMeaning.length ? 'keywords and meaning' : 'keywords';
    lastOutcome = { key: 'projectFilesSearching', count: hits.length + found.length };
    if (hits.length || found.length) onUsed?.({ files: [...new Set([...hits.map((hit) => hit.file.name), ...found.map((entry) => entry.name)])] });
    const empty = await unreadable();
    if (!hits.length && !found.length) {
      return `Nothing in the project files matches that. The files: ${[listText(), ...media.map((entry) => entry.name)].filter(Boolean).join(', ')}.${empty.length ? ` No text could be read from: ${empty.join(', ')} (a scan or a picture).` : ''} You may read a file from its start with read_project_file, or go on without.`;
    }
    const sees = canView && viewMedia;
    const anyAudio = found.some((entry) => entry.kind === 'audio');
    const anyLook = found.some((entry) => entry.kind !== 'audio');
    return JSON.stringify({
      note: 'Passages of the files of the project. Use read_project_file with the "start" of a passage to read more around it.',
      search: how,
      passages: hits.map((hit) => ({ file: hit.file.name, start: hit.start, end: hit.end, text: hit.text.trim() })),
      ...(found.length ? {
        media: found.map((entry) => ({
          file: entry.name, kind: entry.kind,
          ...(places.get(entry.id)?.length ? { where: places.get(entry.id).map((place) => (place.page ? { page: place.page } : { at: place.at, time: place.time })) } : {}),
          ...(entry.attached === true ? { in_this_message: true } : {})
        })),
        media_note: [
          anyLook ? (sees ? 'Files of the project that match, with where in them. Look at one with view_project_file (one at a time, only what the question needs: "at" for a video, "page" for a scan); one marked in_this_message is already in front of you.' : 'Files of the project that match, with where in them. You cannot look at pictures and videos in this reply: say which they are and where, and that you cannot see what they show.') : '',
          anyAudio ? 'A recording cannot be listened to: say which it is and where (the time) the match is, so that the person can listen there.' : ''
        ].filter(Boolean).join(' ')
      } : {}),
      ...(empty.length ? { no_text: empty } : {})
    });
  }

  async function view(call) {
    if (viewCalls >= MAX_PROJECT_VIEW_CALLS) return `The limit of ${MAX_PROJECT_VIEW_CALLS} calls to look at files per reply is reached. Answer with what you have, and say which files are left so that the person can ask again.`;
    if (!canView || !viewMedia) return 'You cannot look at pictures and videos in this reply.';
    const asked = (Array.isArray(call?.args?.files) && call.args.files.length ? call.args.files : [call?.args?.file]).filter((name) => typeof name === 'string' && name.trim());
    if (!asked.length) return `Say which file: give its name in "file". The pictures, videos and scans of the project: ${media.map((item) => item.name).join(', ') || '(none)'}.`;
    viewCalls += 1;
    const notes = [];
    const images = [];
    const names = [];
    const at = Number.isFinite(Number(call?.args?.at)) && call?.args?.at !== null && call?.args?.at !== '' ? Math.max(0, Number(call.args.at)) : null;
    const page = Number.isInteger(Number(call?.args?.page)) && Number(call?.args?.page) >= 1 ? Number(call.args.page) : null;
    for (const name of asked.slice(0, PROJECT_VIEW_PICTURES_PER_CALL)) {
      const entry = resolvePicture(name);
      if (!entry) { notes.push(`There is no such file as "${clean(name, 80)}" among the pictures, videos and scans.`); continue; }
      if (entry.kind === 'audio') { notes.push(`"${entry.name}" is a recording: you cannot listen to it. Say where in it the match is (the time), so that the person can listen there.`); continue; }
      if (entry.attached === true) { notes.push(`"${entry.name}" came with the message: it is already in front of you.`); continue; }
      if (entry.kind === 'scan' && page === null) { notes.push(`"${entry.name}" is a scanned document${entry.pages ? ` of ${entry.pages} pages` : ''}: say which page in "page".`); continue; }
      const place = entry.kind === 'video' ? at : entry.kind === 'scan' ? page : null;
      const key = `${entry.id}|${place ?? ''}`;
      if (viewed.has(key)) { notes.push(`"${entry.name}"${place !== null ? ` at ${entry.kind === 'scan' ? `page ${place}` : formatTime(place)}` : ''} was shown to you earlier in this reply.`); continue; }
      if (viewedCount >= PROJECT_VIEW_PICTURES_MAX) { notes.push(`You have looked at ${viewedCount} pictures in this reply, the most one reply can carry: "${entry.name}" and the others still to look at are left. Answer with what you have, and say which are left so that the person can ask again.`); break; }
      if (images.length >= PROJECT_VIEW_IMAGES_PER_CALL) { notes.push(`One call brings back at most ${PROJECT_VIEW_IMAGES_PER_CALL} pictures: ask again for "${entry.name}".`); break; }
      let shown = null;
      try {
        shown = await viewMedia(entry, { at: entry.kind === 'video' ? at : null, page: entry.kind === 'scan' ? page : null });
      } catch {
        shown = null;
      }
      const list = (Array.isArray(shown) ? shown : [shown]).filter((item) => item?.data);
      if (!list.length) { notes.push(`"${entry.name}" could not be shown now.`); continue; }
      let took = 0;
      for (const item of list) {
        if (viewedChars + item.data.length > PROJECT_VIEW_CHARS_MAX || viewedCount >= PROJECT_VIEW_PICTURES_MAX) { notes.push(`The pictures of this reply are as many as one reply can carry: the rest of "${entry.name}" and the others still to look at are left. Answer with what you have, and say which are left so that the person can ask again.`); break; }
        viewedCount += 1;
        viewedChars += item.data.length;
        took += 1;
        const label = entry.kind === 'video' && Number.isFinite(item.at) ? `${entry.name} @${formatTime(item.at)}` : entry.kind === 'scan' ? `${entry.name} p.${page}` : entry.name;
        images.push({ label, mimeType: item.mimeType, data: item.data });
      }
      if (took) { viewed.add(key); names.push(entry.name); }
      else break;
    }
    if (asked.length > PROJECT_VIEW_PICTURES_PER_CALL) notes.push(`Only the first ${PROJECT_VIEW_PICTURES_PER_CALL} were looked at: ask again for the others.`);
    lastOutcome = { key: 'projectFilesViewing', count: images.length };
    if (!images.length) return notes.join(' ');
    onUsed?.({ files: [...new Set(names)] });
    return { content: [`${images.length === 1 ? 'The picture follows' : 'The pictures follow, in this order'}: ${images.map((image) => `"${image.label}"`).join(', ')}.`, ...notes].join(' '), images };
  }

  async function read(call) {
    if (calls >= maxCalls) return `The limit of ${maxCalls} looks into the project files per reply is reached. Go on with what you have.`;
    const entry = resolve(call?.args?.file) || resolveLink(call?.args?.file);
    if (!entry) return `There is no such file. The files of the project: ${listText()}.`;
    calls += 1;
    // A web page: fetched now, from the address (it is read live, so it is as new as the page is).
    if (entry.url) {
      const page = await loadLink(entry);
      lastOutcome = { key: 'projectFilesReading', count: page.text ? 1 : 0 };
      if (page.error === 'noReader') return `The web page "${entry.name}" (${entry.url}) cannot be read: the person has no key of a reading service (Tavily or TinyFish) in the settings. Say so if the question needs it, and go on without it.`;
      if (page.error || !page.text.trim()) return `The web page "${entry.name}" (${entry.url}) could not be read now (the site may block readers, ask for a login, or have no text to read). Go on without it, or say so.`;
      const total = page.text.length;
      const start = Math.min(total, Math.max(0, Math.floor(Number(call?.args?.start) || 0)));
      const end = Math.min(total, start + Math.min(12000, Math.max(200, Math.floor(Number(call?.args?.length) || 8000))));
      onUsed?.({ files: [entry.name] });
      return JSON.stringify({ file: entry.name, url: entry.url, start, end, total, ...(end < total ? { next: end } : { next: null }), text: page.text.slice(start, end) });
    }
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
      const seeing = canView && Boolean(viewMedia) && media.some((entry) => entry.kind !== 'audio') && viewCalls < MAX_PROJECT_VIEW_CALLS;
      const open = calls < maxCalls;
      const list = [];
      if ((files.length || media.length) && open) list.push(SEARCH_PROJECT_FILES_TOOL);
      if ((files.length || links.length) && open) list.push(READ_PROJECT_FILE_TOOL);
      if (seeing) list.push(VIEW_PROJECT_FILE_TOOL);
      return list;
    },
    /** Which pictures went with the message of this reply (their ids): the rest are named in the search as not in front of the model. */
    setAttached(ids) {
      const set = new Set(ids || []);
      for (const entry of media) entry.attached = set.has(entry.id);
    },
    handles: (name) => isProjectFilesToolName(name),
    noteFor: (call) => ({ name: call?.name }),
    outcome() {
      const outcome = lastOutcome;
      lastOutcome = null;
      return outcome;
    },
    stepEvent: (call, lang = language) => {
      const key = call?.name === READ_PROJECT_FILE_TOOL.name ? 'projectFilesReading' : call?.name === VIEW_PROJECT_FILE_TOOL.name ? 'projectFilesViewing' : 'projectFilesSearching';
      return { type: 'memory', event: 'call', tool: call?.name, key, label: sandboxText(lang, key) };
    },
    async run(call) {
      return call?.name === READ_PROJECT_FILE_TOOL.name ? read(call) : call?.name === VIEW_PROJECT_FILE_TOOL.name ? view(call) : search(call);
    }
  };
}

// The files that come with an official skill (docs/superpowers/specs/2026-10-18-deck-style-replica-design.md, §3): they are part of the app, in
// src/data/official-skills/<name>/ (the server's image copies src), and listed in the skill's entry of skill-catalog.js. Only the files the entry lists are
// read, so nothing else of the folder reaches a sandbox.

import { readFile } from 'node:fs/promises';

import { getOfficialSkill } from '../src/data/skill-catalog.js';

const ROOT = new URL('../src/data/official-skills/', import.meta.url);
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]{1,200}$/;

/** The files of an official skill with their bytes: [{ path, size, kind, bytes }], or null when it has none (or one cannot be read). */
export async function readOfficialSkillFiles(name, { read = readFile } = {}) {
  const entry = getOfficialSkill(name);
  const listed = Array.isArray(entry?.files) ? entry.files : [];
  if (!listed.length) return null;
  try {
    return await Promise.all(listed.map(async (file) => {
      if (!SAFE_PATH.test(String(file.path))) throw new Error(`Not a path of the skill: ${file.path}`);
      const bytes = new Uint8Array(await read(new URL(`${entry.name}/${file.path}`, ROOT)));
      return { path: file.path, size: bytes.byteLength, kind: file.kind === 'script' || file.kind === 'binary' ? file.kind : 'text', bytes };
    }));
  } catch {
    return null;
  }
}

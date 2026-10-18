// The folders of skills with scripts, for a reply made with the browser's Python (docs/superpowers/specs/2026-10-18-deck-style-replica-design.md, §3): the
// server puts a skill's folder in its sandbox as /skills/<name>/ (read only); here the page writes the same files into the browser's Python, so a skill's
// instructions work the same in both. The files are written with Python itself (the sandbox page needs nothing new), and the packages the scripts import are
// loaded at the same time (the browser's Python loads a package only when the code it runs imports it).

import { isSkillName } from '../../../data/skill-format.js';

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]{1,200}$/;
const MODULE = /^\s*(?:import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*)|from\s+([A-Za-z_][\w.]*)\s+import\b)/gm;

const toBase64 = (bytes) => {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
};

/** The Python that writes one file of a skill, read only. */
export function writeFileCode(name, path, bytes) {
  if (!isSkillName(name) || !SAFE_PATH.test(String(path))) throw new Error(`Not a file of a skill: ${name}/${path}`);
  return [
    'import base64 as _b, os as _o',
    `_p = ${JSON.stringify(`/skills/${name}/${path}`)}`,
    '_o.makedirs(_o.path.dirname(_p), exist_ok=True)',
    'if _o.path.exists(_p): _o.chmod(_p, 0o644)',
    `with open(_p, "wb") as _f: _f.write(_b.b64decode(${JSON.stringify(toBase64(bytes))}))`,
    '_o.chmod(_p, 0o444)',
    'del _b, _o, _p, _f'
  ].join('\n');
}

/** The Python that loads what the scripts import (each on its own, so one that is not there does not stop the others), or '' when they import nothing. */
export function importsCode(files) {
  const decoder = new TextDecoder();
  const names = new Set();
  for (const file of files) {
    if (file.kind !== 'script' || !/\.py$/.test(file.path)) continue;
    for (const match of decoder.decode(file.bytes).matchAll(MODULE)) {
      for (const part of (match[1] || match[2]).split(',')) names.add(part.trim().split('.')[0]);
    }
  }
  return [...names].sort().map((name) => `try:\n    import ${name}\nexcept Exception:\n    pass`).join('\n');
}

/**
 * `lookup(name)` is the skill bridge's ({ name, body, files? }), `openFiles(name)` gives a skill's files with their bytes. Returns `lookup` (the same, and for a
 * skill with scripts it also gets the folder ready and says whether it can run: `canRun`), `include(skills)` (the skills asked for with "/", whose folders are
 * there from the start) and `attach(sandbox)` (the sandbox of the reply, which gets the folders when it is made and those loaded later at once).
 */
export function createLocalSkillFolders({ lookup, openFiles }) {
  const folders = new Map();
  let live = null;

  const write = async (sandbox, name, files) => {
    for (const file of files) await sandbox.run(writeFileCode(name, file.path, file.bytes));
    const imports = importsCode(files);
    if (imports) await sandbox.run(imports);
  };
  const take = async (name) => {
    if (folders.has(name)) return true;
    const files = await openFiles(name);
    if (!Array.isArray(files) || !files.some((file) => file.kind === 'script')) return false;
    folders.set(name, files);
    if (live) await write(live, name, files);
    return true;
  };

  return {
    async lookup(name) {
      const skill = await lookup(name);
      if (!skill?.files?.some((file) => file.kind === 'script')) return skill;
      try {
        return { ...skill, canRun: await take(name) };
      } catch {
        folders.delete(name);
        return { ...skill, canRun: false };
      }
    },
    async include(skills = []) {
      for (const skill of skills) {
        if (skill?.files?.some((file) => file.kind === 'script')) await take(skill.name).catch(() => folders.delete(skill.name));
      }
    },
    attach(sandbox) {
      return Object.assign(Object.create(sandbox), {
        async mount(files) {
          const result = await sandbox.mount(files);
          live = sandbox;
          for (const [name, list] of folders) await write(sandbox, name, list);
          return result;
        }
      });
    }
  };
}

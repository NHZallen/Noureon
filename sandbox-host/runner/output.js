// The files a step left in the output folder (on the host: the folder is mounted into the container), as the browser sandbox
// reports them: only what the step created or changed, within the limits, and no file of a blocked type.

import { lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS, isBlockedOutputName } from '../../public/sandbox/protocol.js';

/** Names (with folders, `a/b.txt`) of the regular files under `directory`; links are not followed and not listed. */
export function listFiles(directory, prefix = '') {
  let entries = [];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(directory, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      return [];
    }
    if (stat.isSymbolicLink()) return [];
    if (stat.isDirectory()) return listFiles(path, `${prefix}${name}/`);
    return stat.isFile() ? [`${prefix}${name}`] : [];
  });
}

/** Size and time of each file, to tell afterwards which a step made or changed. */
export function snapshotOutput(directory) {
  return new Map(listFiles(directory).map((name) => {
    const stat = lstatSync(join(directory, name));
    return [name, `${stat.size}:${Math.round(stat.mtimeMs)}`];
  }));
}

/** `limits`: { outputFileCount, outputFileBytes, outputTotalBytes } (the runner may allow more than the browser's sandbox does). */
export function collectOutput(directory, before = new Map(), limits = LIMITS) {
  const files = [];
  const skipped = [];
  let total = 0;
  for (const name of listFiles(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (before.get(name) === `${stat.size}:${Math.round(stat.mtimeMs)}`) continue;
    if (isBlockedOutputName(name)) skipped.push({ name, reason: 'blocked-type' });
    else if (files.length >= limits.outputFileCount) skipped.push({ name, reason: 'too-many-files' });
    else if (stat.size > limits.outputFileBytes) skipped.push({ name, reason: 'file-too-large', size: stat.size, limit: limits.outputFileBytes });
    else if (total + stat.size > limits.outputTotalBytes) skipped.push({ name, reason: 'total-too-large', size: stat.size, limit: limits.outputTotalBytes });
    else {
      const bytes = readFileSync(path);
      total += bytes.byteLength;
      files.push({ name, size: bytes.byteLength, data: bytes.toString('base64') });
    }
  }
  return { files, skipped };
}

/** The disk a folder takes (what is allocated, so that a file with holes in it is not counted for its length), links not followed; it stops counting once `cap` is passed. */
export function allocatedBytes(directory, cap = Infinity) {
  let total = 0;
  const pending = [directory];
  let seen = 0;
  while (pending.length > 0 && total <= cap && seen < 200_000) {
    const current = pending.pop();
    let names = [];
    try {
      names = readdirSync(current);
    } catch {
      continue;
    }
    for (const name of names) {
      seen += 1;
      const path = join(current, name);
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) pending.push(path);
      else if (stat.isFile()) total += typeof stat.blocks === 'number' ? stat.blocks * 512 : stat.size;
    }
  }
  return total;
}

/** Removes the files a step made or changed since `before` (a snapshotOutput), the ones it filled the disk with. */
export function removeChangedFiles(directory, before) {
  for (const name of listFiles(directory)) {
    try {
      const stat = lstatSync(join(directory, name));
      if (before.get(name) !== `${stat.size}:${Math.round(stat.mtimeMs)}`) rmSync(join(directory, name), { force: true });
    } catch {
      // Gone already.
    }
  }
}

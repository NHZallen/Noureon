// The files a step left in the output folder (on the host: the folder is mounted into the container), as the browser sandbox
// reports them: only what the step created or changed, within the limits, and no file of a blocked type.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
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

export function collectOutput(directory, before = new Map()) {
  const files = [];
  const skipped = [];
  let total = 0;
  for (const name of listFiles(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (before.get(name) === `${stat.size}:${Math.round(stat.mtimeMs)}`) continue;
    if (isBlockedOutputName(name)) skipped.push({ name, reason: 'blocked-type' });
    else if (files.length >= LIMITS.outputFileCount) skipped.push({ name, reason: 'too-many-files' });
    else if (stat.size > LIMITS.outputFileBytes) skipped.push({ name, reason: 'file-too-large', size: stat.size });
    else if (total + stat.size > LIMITS.outputTotalBytes) skipped.push({ name, reason: 'total-too-large', size: stat.size });
    else {
      const bytes = readFileSync(path);
      total += bytes.byteLength;
      files.push({ name, size: bytes.byteLength, data: bytes.toString('base64') });
    }
  }
  return { files, skipped };
}

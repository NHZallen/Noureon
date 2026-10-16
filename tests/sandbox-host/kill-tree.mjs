// Ends a process and everything it started, for the tests that run the program of the container (repl.py) as an ordinary process. In Docker the end of
// the container ends all of its processes; here the supervisor is only one process, and its worker (the Python of the steps, a program that may be in an
// endless loop on purpose) would be left running when the supervisor is killed: they piled up, a few for every test run, and slowed down the next ones.
import { readFileSync, readdirSync } from 'node:fs';

const parentOf = (pid) => {
  try {
    return Number(readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[1]);
  } catch {
    return 0;
  }
};

/** The processes started by `pid`, and by those, and so on (found before anything is killed, so none is lost when its parent is gone). */
export function descendantsOf(pid) {
  let entries = [];
  try {
    entries = readdirSync('/proc').filter((name) => /^\d+$/.test(name)).map(Number);
  } catch {
    return [];
  }
  const children = new Map();
  for (const entry of entries) {
    const parent = parentOf(entry);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(entry);
  }
  const found = [];
  const queue = [pid];
  while (queue.length) {
    for (const child of children.get(queue.shift()) || []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

export function killTree(pid, signal = 'SIGKILL') {
  for (const target of [...descendantsOf(pid), pid]) {
    try {
      process.kill(target, signal);
    } catch {
      // Gone already.
    }
  }
}

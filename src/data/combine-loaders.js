// One loader out of several (docs/superpowers/specs/2026-10-30-memory-redesign-design.md, §4.3): the skills, the connectors, the pictures and the memory each have a loader with the shape of the loader of
// skills (skill-tool.js); the loops of the replies see one object. The page combines the loader of skills with the one of the memory, the server all of them. Pure: shared by the page and the server.

import { availableSkillsInstruction } from './skill-tool.js';

/** One loader out of several: the loops that run a reply see one object with the shape of the loader of skills. Null ones are left out; none left gives null. */
export function combineLoaders(...loaders) {
  const parts = loaders.filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const owner = (name) => parts.find((part) => part.handles(name));
  return {
    get list() { return parts.flatMap((part) => part.list || []); },
    get instruction() { return parts.map((part) => (typeof part.instruction === 'string' ? part.instruction : availableSkillsInstruction(part.list))).filter(Boolean).join('\n\n'); },
    get used() { return parts.reduce((sum, part) => sum + (part.used || 0), 0); },
    get tools() { return parts.flatMap((part) => part.tools); },
    handles: (name) => parts.some((part) => part.handles(name)),
    noteFor: (call) => owner(call.name)?.noteFor(call) ?? null,
    stepEvent: (call, language) => owner(call.name)?.stepEvent?.(call, language) ?? null,
    outcome: (call) => owner(call.name)?.outcome?.(call) ?? null,
    run: (call) => owner(call.name).run(call)
  };
}

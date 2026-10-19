// What a message keeps of the council that made it (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.3): its members and stages, in the
// record at the head of the message (sandbox-run-block.js), so the saved message shows "3 members discussed · 1m 20s" and opens to the timeline.
// Used by the page and by the server.

import { formatSandboxRunBlock, liftSandboxRunBlock } from '../sandbox/sandbox-run-block.js';

/** Whether a message is a council's: it holds a council's record at its head, or it was sent to a council (a turn that is still going on has no record yet). */
export function messageIsCouncilTurn(message) {
  if (message?.metadata?.councilTurn) return true;
  if (message?.role !== 'model') return false;
  return (Array.isArray(message.parts) ? message.parts : []).some((part) => (
    typeof part?.text === 'string' && part.text.includes('"council"') && Boolean(liftSandboxRunBlock(part.text).run?.council)
  ));
}

/** The text with the council's record in the record at its head (made when there is none). `elapsedMs`: the whole council's time. */
export function withCouncilRecord(text, council, { elapsedMs = 0, madeHere = false } = {}) {
  if (!council) return String(text ?? '');
  const { run, text: rest } = liftSandboxRunBlock(String(text ?? ''));
  return `${formatSandboxRunBlock({
    status: 'done',
    steps: [],
    ...(run || {}),
    council,
    ...(elapsedMs > 0 ? { elapsedMs } : {}),
    ...(madeHere ? { madeHere: true } : {})
  })}${rest}`;
}

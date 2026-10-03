// The model's thinking while a reply is written, above the answer: a line that
// shimmers with "Thinking…" and the time, opening to the thinking as it streams
// when the reader opens it (folded until then), "Thinking · 12s ›" when the
// answer starts. Made with the same step
// list the Python runs use (ledger.js). What it collected is kept with the
// reply by the caller (the run record), so it is still there after a reload.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createLedger } from '../ledger/ledger.js';
import { keepEndInView } from '../motion/collapse-motion.js';
import { fillThinkingText } from './thinking-text.js';

const MAX_THOUGHT_CHARS = 12_000;

// `startOffsetMs`: it was thinking already when this page came in. `collapse(ms)`: the time it thought is told (by the server), not measured here.
export function createThinkingBlock({ document, host, before = null, language = 'zh-TW', now = () => Date.now(), startOffsetMs = 0 }) {
  const ledger = createLedger({ document, host, before });
  const row = ledger.addRow(sandboxText(language, 'thinkingLive'));
  // Folded while it thinks (the shimmering line says so); opened by the reader when they want to read along.
  row.enableBody(false);
  const pre = document.createElement('div');
  pre.className = 'ledger-thought';
  row.body.append(pre);
  const startedAt = now() - Math.max(0, startOffsetMs);
  let text = '';
  let toldMs = null;
  let kind = 'raw';
  let endedAt = null;

  const seconds = () => Math.max(1, Math.round((toldMs ?? ((endedAt ?? now()) - startedAt)) / 1000));
  return {
    add(chunk, chunkKind) {
      if (!chunk || endedAt !== null) return;
      if (chunkKind) kind = chunkKind;
      text = (text + chunk).slice(0, MAX_THOUGHT_CHARS);
      // Reading further up is never pulled down to the newest line.
      keepEndInView(pre, () => fillThinkingText(document, pre, text));
    },
    // The answer has started: the line says how long it thought and folds.
    collapse(ms = null) {
      if (endedAt !== null) return;
      endedAt = now();
      if (Number.isFinite(ms)) toldMs = ms;
      row.setLabel(sandboxText(language, kind === 'summary' ? 'thinkingDoneSummary' : 'thinkingDoneRaw', { s: seconds() }));
      row.finish('done');
      // The same line the saved reply shows: no tick, no timer, so drawing it again does not shift.
      row.node.classList.add('is-quiet');
      row.setOpen(false);
    },
    remove() { ledger.remove(); }
  };
}

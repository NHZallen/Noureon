// The model's thinking while a reply is written, above the answer: a line that
// shimmers with "Thinking…" and the time, open on the thinking as it streams,
// folded to "Thinking · 12s ›" when the answer starts. Made with the same step
// list the Python runs use (ledger.js). What it collected is kept with the
// reply by the caller (the run record), so it is still there after a reload.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { createLedger } from '../ledger/ledger.js';
import { fillThinkingText } from './thinking-text.js';

const MAX_THOUGHT_CHARS = 12_000;

export function createThinkingBlock({ document, host, before = null, language = 'zh-TW', now = () => Date.now() }) {
  const ledger = createLedger({ document, host, before });
  const row = ledger.addRow(sandboxText(language, 'thinkingLive'));
  row.enableBody(true);
  const pre = document.createElement('pre');
  pre.className = 'ledger-thought';
  row.body.append(pre);
  const startedAt = now();
  let text = '';
  let kind = 'raw';
  let endedAt = null;

  const seconds = () => Math.max(1, Math.round(((endedAt ?? now()) - startedAt) / 1000));
  return {
    add(chunk, chunkKind) {
      if (!chunk || endedAt !== null) return;
      if (chunkKind) kind = chunkKind;
      text = (text + chunk).slice(0, MAX_THOUGHT_CHARS);
      fillThinkingText(document, pre, text);
      pre.scrollTop = pre.scrollHeight;
    },
    // The answer has started: the line says how long it thought and folds.
    collapse() {
      if (endedAt !== null) return;
      endedAt = now();
      row.setLabel(sandboxText(language, kind === 'summary' ? 'thinkingDoneSummary' : 'thinkingDoneRaw', { s: seconds() }));
      row.finish('done');
      row.setOpen(false);
    },
    remove() { ledger.remove(); }
  };
}

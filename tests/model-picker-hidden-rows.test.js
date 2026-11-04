import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// A row, a group or the empty line that the search hides must really be hidden. The rows get their `display: flex` from a rule that has the id of the picker in it
// (`#model-council-control .mp-row`), which beats `.mp-row[hidden]`: the rows that did not fit stayed on the list, above the ones that did (found on 2026-11-04 searching "NVIDIA").

test('the hidden rows, groups and empty line of the model picker are hidden by rules as strong as the ones that show them', () => {
  const css = readFileSync(new URL('../src/styles/model-picker.css', import.meta.url), 'utf8');
  for (const part of ['mp-row', 'mp-group', 'mp-empty']) {
    assert.match(css, new RegExp(`#model-council-control \\.${part}\\[hidden\\][^{]*\\{[^}]*display: none`), `${part} hides under the id of the picker`);
  }
  assert.match(css, /#model-council-control \.mp-row \{[^}]*display: flex/, 'the rule that shows the rows is still the one this has to beat');
});

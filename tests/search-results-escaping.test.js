import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js', import.meta.url), 'utf8');

// Everything a person wrote (the title of a conversation, a line of a message) or an error message reaches `innerHTML` of the search results only
// through `highlightText` (which escapes) or `escapeHTML`; the plain title that is shown when it is not the title that matched is escaped first.
test('the search results put no raw title, message text or error message in innerHTML', () => {
  assert.match(source, /let titleHTML = escapeHTML\(conv\.title\);/);
  assert.match(source, /\$\{escapeHTML\(error\.message\)\}/);
  assert.doesNotMatch(source, /\$\{error\.message\}/);
  assert.doesNotMatch(source, /let titleHTML = conv\.title;/);
  assert.match(source, /titleHTML: highlightText\(conv\.title, allKeywordsQuery\)/);
  assert.match(source, /snippetHTML: highlightText\(bestSnippet, allKeywordsQuery\)/);
  assert.match(source, /snippetHTML = .*highlightText\(text\.substring\(start, end\), query\)/);
});

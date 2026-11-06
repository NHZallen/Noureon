import assert from 'node:assert/strict';
import test from 'node:test';

import { getProjectSourceAccess, setProjectSourceAccess } from '../src/app/runtime/projects/project-source-registry.js';
import { replySourcePanelOptions } from '../src/app/runtime/features/reply-sources-actions.js';

// The panel of the sources of a reply looks at, or has, the files of the project through what the projects part gave: without it the rows of the files are only names.

test('the options of the panel of the sources carry what looks at and has a file of the project only when the projects part has said how', () => {
  setProjectSourceAccess(null);
  const plain = replySourcePanelOptions({ window: {}, document: {}, language: 'en' });
  assert.equal('onOpenFile' in plain, false);
  const calls = [];
  setProjectSourceAccess({ preview: (name, row) => calls.push(['preview', name, row]), download: (name) => calls.push(['download', name]) });
  assert.ok(getProjectSourceAccess());
  const options = replySourcePanelOptions({ window: {}, document: {}, language: 'en' });
  options.onOpenFile('plan.pdf', 'row');
  options.onDownloadFile('plan.pdf');
  assert.deepEqual(calls, [['preview', 'plan.pdf', 'row'], ['download', 'plan.pdf']]);
  setProjectSourceAccess(null);
});

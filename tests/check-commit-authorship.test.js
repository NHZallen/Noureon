import test from 'node:test';
import assert from 'node:assert/strict';
import { findViolations, parseLog } from '../scripts/check-commit-authorship.mjs';

const clean = {
  sha: '0123456789abcdef',
  authorName: 'Allen Niu',
  authorEmail: '130979060+NHZallen@users.noreply.github.com',
  committerName: 'Allen Niu',
  committerEmail: '130979060+NHZallen@users.noreply.github.com',
  message: 'Fix the mobile composer layout\n\nMove the mic left of the send button.\n',
};

test('a normal commit passes', () => {
  assert.deepEqual(findViolations([clean]), []);
});

test('a commit made by the web interface of GitHub passes', () => {
  assert.deepEqual(
    findViolations([{ ...clean, committerName: 'GitHub', committerEmail: 'noreply@github.com' }]),
    [],
  );
});

test('an AI author or committer is rejected', () => {
  const byAuthor = findViolations([{ ...clean, authorName: 'Claude', authorEmail: 'noreply@anthropic.com' }]);
  assert.equal(byAuthor.length, 1);
  assert.match(byAuthor[0].problems[0], /author is an AI identity/);
  const byCommitter = findViolations([{ ...clean, committerName: 'Claude', committerEmail: 'noreply@anthropic.com' }]);
  assert.match(byCommitter[0].problems[0], /committer is an AI identity/);
});

test('assistant attribution in a message is rejected', () => {
  for (const tail of [
    'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>',
    'Claude-Session: https://claude.ai/code/session_x',
    'https://claude.ai/code/session_x',
    'Generated with [Claude Code](https://claude.com/claude-code)',
  ]) {
    const result = findViolations([{ ...clean, message: `${clean.message}\n${tail}\n` }]);
    assert.equal(result.length, 1, tail);
  }
});

test('a human co-author is allowed', () => {
  assert.deepEqual(
    findViolations([{ ...clean, message: `${clean.message}\nCo-Authored-By: Sun <sun@example.com>\n` }]),
    [],
  );
});

test('parseLog reads the git log format', () => {
  const log = ['abc', 'Allen Niu', 'a@x', 'Allen Niu', 'a@x', 'Subject\n\nBody'].join('\x1f') + '\x1e\n'
    + ['def', 'Sun', 's@x', 'Sun', 's@x', 'Another'].join('\x1f') + '\x1e\n';
  const commits = parseLog(log);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].sha, 'abc');
  assert.equal(commits[1].authorName, 'Sun');
  assert.equal(commits[0].message, 'Subject\n\nBody');
});

#!/usr/bin/env node
// Guards who a commit says it came from.
//
// Commits in this repository are made by the people who work on it. A commit must not name an AI
// assistant as its author or committer, and its message must not carry assistant attribution
// (a Co-Authored-By line for an assistant, a session link, a "generated with" footer).
// Only the commits of one push or pull request are checked (a range), never the old history.
//
// Usage: node scripts/check-commit-authorship.mjs <git revision range>   e.g. origin/staging..HEAD
//        node scripts/check-commit-authorship.mjs <single commit>
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AI_NAME = /\b(claude|anthropic|chatgpt|openai|copilot|gemini|codex|cursor)\b/i;
const AI_EMAIL = /@anthropic\.com\b|claude@|noreply@openai\.com|copilot@/i;
const AI_TRAILER = /^\s*co-authored-by:.*(claude|anthropic|chatgpt|openai|copilot|gemini|codex|cursor)/im;
const AI_SESSION = /^\s*claude-session\s*:/im;
const AI_LINK = /claude\.ai\/code|claude\.com\/claude-code/i;
const AI_FOOTER = /generated (with|by)[^\n]*(claude|chatgpt|copilot|codex|gemini)/i;

// Commits come in as { sha, authorName, authorEmail, committerName, committerEmail, message }.
export function findViolations(commits) {
  const violations = [];
  for (const commit of commits) {
    const short = String(commit.sha || '').slice(0, 8);
    const problems = [];
    for (const [role, name, email] of [
      ['author', commit.authorName, commit.authorEmail],
      ['committer', commit.committerName, commit.committerEmail],
    ]) {
      if (AI_NAME.test(name || '') || AI_EMAIL.test(email || '')) problems.push(`${role} is an AI identity (${name} <${email}>)`);
    }
    const message = commit.message || '';
    if (AI_TRAILER.test(message)) problems.push('message has a Co-Authored-By line for an AI assistant');
    if (AI_SESSION.test(message)) problems.push('message has a Claude-Session line');
    if (AI_LINK.test(message)) problems.push('message links to an AI session');
    if (AI_FOOTER.test(message)) problems.push('message has a "generated with" footer');
    if (problems.length) violations.push({ sha: short, problems });
  }
  return violations;
}

const SEPARATOR_FIELD = '\x1f';
const SEPARATOR_COMMIT = '\x1e';

export function parseLog(text) {
  return text
    .split(SEPARATOR_COMMIT)
    .map((chunk) => chunk.replace(/^\n+/, ''))
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [sha, authorName, authorEmail, committerName, committerEmail, message = ''] = chunk.split(SEPARATOR_FIELD);
      return { sha, authorName, authorEmail, committerName, committerEmail, message };
    });
}

function readCommits(range) {
  const format = ['%H', '%an', '%ae', '%cn', '%ce', '%B'].join(SEPARATOR_FIELD) + SEPARATOR_COMMIT;
  const isRange = range.includes('..');
  const args = isRange ? ['log', `--format=${format}`, range] : ['log', '-1', `--format=${format}`, range];
  return parseLog(execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function main() {
  const range = process.argv[2];
  if (!range) {
    console.error('Usage: node scripts/check-commit-authorship.mjs <git revision range or commit>');
    process.exit(2);
  }
  let commits;
  try {
    commits = readCommits(range);
  } catch {
    // The start of the range is not in this clone (a force push, a shallow fetch): check the newest commit only.
    const head = range.includes('..') ? range.split('..').pop() || 'HEAD' : range;
    commits = readCommits(head);
  }
  const violations = findViolations(commits);
  if (!violations.length) {
    console.log(`Commit authorship ok (${commits.length} commit${commits.length === 1 ? '' : 's'} checked).`);
    return;
  }
  console.error('Commit authorship check failed:');
  for (const { sha, problems } of violations) {
    for (const problem of problems) console.error(`  ${sha}: ${problem}`);
  }
  console.error('Commits must be made under the real author, with no assistant attribution in the message.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

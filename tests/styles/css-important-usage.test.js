import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

import { projectFile, readSource } from '../helpers/source-guards.js';

const allowedCategories = new Set([
  'required: accessibility',
  'required: third-party override',
  'required: mobile override',
  'required: regression override / legacy compatibility',
  'unknown: needs manual visual review'
]);

const documentedImportantUsage = {
  'src/styles/base.css': {
    max: 2,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/chat.css': {
    max: 14,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/input-polish.css': {
    max: 34,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/input.css': {
    max: 5,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/mobile.css': {
    max: 37,
    category: 'required: mobile override'
  },
  'src/styles/modals.css': {
    max: 11,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/model-council.css': {
    max: 15,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/personalization.css': {
    max: 88,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/regression-overrides.css': {
    max: 249,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/settings.css': {
    max: 270,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/settings-danger.css': {
    max: 26,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/settings-desktop.css': {
    max: 57,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/settings-mobile.css': {
    max: 137,
    category: 'required: mobile override'
  },
  'src/styles/settings-output-translator.css': {
    max: 61,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/settings-provider-management.css': {
    max: 51,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/settings-theme-bubble.css': {
    max: 57,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/sidebar.css': {
    max: 5,
    category: 'required: regression override / legacy compatibility'
  },
  'src/styles/typography.css': {
    max: 63,
    category: 'required: regression override / legacy compatibility'
  }
};

const importantAuditPattern =
  /important-audit:\s*(required: accessibility|required: third-party override|required: mobile override|required: regression override \/ legacy compatibility|unknown: needs manual visual review)\s+-\s+\S/i;

function listCssFiles(dir = projectFile('src', 'styles')) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listCssFiles(path);
    if (!path.endsWith('.css')) return [];
    return relative(projectFile(), path).replace(/\\/g, '/');
  });
}

function countImportant(source) {
  return (source.match(/!important/g) || []).length;
}

function fileImportantCounts() {
  return listCssFiles()
    .map((file) => ({ file, count: countImportant(readSource(file)) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}

test('CSS important usage is categorized, capped, and reported by file', () => {
  const counts = fileImportantCounts();
  const total = counts.reduce((sum, { count }) => sum + count, 0);

  console.log(
    [
      `CSS !important total: ${total}`,
      ...counts.map(({ file, count }) => `CSS !important ${count}: ${file}`)
    ].join('\n')
  );

  const undocumentedFiles = counts
    .map(({ file }) => file)
    .filter((file) => !documentedImportantUsage[file]);
  assert.deepEqual(
    undocumentedFiles,
    [],
    'CSS files with !important must be added to the documented exception map'
  );

  const staleDocumentedFiles = Object.keys(documentedImportantUsage).filter((file) => {
    const source = readSource(file);
    return countImportant(source) === 0 && documentedImportantUsage[file].max !== 0;
  });
  assert.deepEqual(
    staleDocumentedFiles,
    [],
    'Remove stale !important exceptions after a CSS file no longer needs them'
  );

  counts.forEach(({ file, count }) => {
    const entry = documentedImportantUsage[file];
    assert.ok(allowedCategories.has(entry.category), `${file} has an unknown !important category`);
    assert.ok(
      count <= entry.max,
      `${file} has ${count} !important rules, above documented cap ${entry.max}`
    );
  });
});

test('CSS files with remaining important rules include an explanatory audit comment', () => {
  fileImportantCounts().forEach(({ file }) => {
    const source = readSource(file);
    assert.match(
      source,
      importantAuditPattern,
      `${file} must explain why its remaining !important rules are still required`
    );
  });
});

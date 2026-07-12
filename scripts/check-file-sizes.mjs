import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const ignoredSourceDirectories = new Set(['node_modules', 'dist']);

const KiB = 1024;

function bytes(kib) {
  return Math.round(kib * KiB);
}

function formatBytes(value) {
  return `${(value / KiB).toFixed(1)} KB`;
}

function formatOptionalBytes(value) {
  return value == null ? '-' : formatBytes(value);
}

function normalizePath(filePath) {
  return relative(root, filePath).replace(/\\/g, '/');
}

function collectFiles(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (ignoredSourceDirectories.has(entry.name)) return [];
      return collectFiles(join(directory, entry.name), predicate);
    }
    if (!entry.isFile()) return [];
    const filePath = join(directory, entry.name);
    if (!predicate(filePath)) return [];
    return [{
      filePath,
      path: normalizePath(filePath),
      size: statSync(filePath).size
    }];
  });
}

function findFile(files, path) {
  return files.find((file) => file.path === path);
}

function topFiles(files, count) {
  return [...files].sort((a, b) => b.size - a.size).slice(0, count);
}

function buildBudgetItem({ label, file, transitionalLimit, v5Target, gzipSize, gzipTransitionalLimit, gzipV5Target }) {
  const overTransitional = file.size > transitionalLimit;
  const overTarget = v5Target != null && file.size > v5Target;
  const overGzipTransitional = gzipSize != null && gzipTransitionalLimit != null && gzipSize > gzipTransitionalLimit;
  const overGzipTarget = gzipSize != null && gzipV5Target != null && gzipSize > gzipV5Target;
  const status = overTransitional || overGzipTransitional
    ? 'FAIL'
    : (overTarget || overGzipTarget ? 'DEBT' : 'PASS');

  return {
    status,
    label,
    path: file.path,
    current: file.size,
    transitionalLimit,
    v5Target,
    gzipSize,
    gzipTransitionalLimit,
    gzipV5Target
  };
}

function printGroup(title, items) {
  const failed = items.filter((item) => item.status === 'FAIL');
  const debt = items.filter((item) => item.status === 'DEBT');
  const groupStatus = failed.length > 0 ? 'FAIL' : 'PASS';

  console.log(`\n## ${title}: ${groupStatus}`);
  for (const item of items) {
    const debtText = item.status === 'DEBT' ? ' (above target)' : '';
    const gzipText = item.gzipSize == null
      ? ''
      : ` | gzip ${formatBytes(item.gzipSize)} / transitional ${formatOptionalBytes(item.gzipTransitionalLimit)} / target ${formatOptionalBytes(item.gzipV5Target)}`;
    console.log(
      `${item.status.padEnd(4)} ${item.label}: ${formatBytes(item.current)} / transitional ${formatBytes(item.transitionalLimit)} / target ${formatOptionalBytes(item.v5Target)}${gzipText} | ${item.path}${debtText}`
    );
  }
  if (debt.length > 0) {
    console.log(`Debt owners: ${debt.map((item) => item.path).join(', ')}`);
  }
  return failed;
}

const sourceFiles = collectFiles(join(root, 'src'));
const cssFiles = sourceFiles.filter((file) => file.path.endsWith('.css'));
const testFiles = collectFiles(join(root, 'tests'), (filePath) => filePath.endsWith('.test.js'));
const distFiles = collectFiles(join(root, 'dist')).map((file) => ({
  ...file,
  gzipSize: gzipSync(readFileSync(file.filePath)).byteLength
}));

const runtimeBudgetDefinitions = [
  { label: 'legacy-core shell', path: 'src/app/runtime/legacy-core/legacy-core.js', transitionalLimit: bytes(83), v5Target: bytes(55) },
  { label: 'core-tail lifecycle', path: 'src/app/runtime/legacy-core/core-tail-lifecycle.js', transitionalLimit: bytes(75), v5Target: bytes(35) },
  { label: 'settings auth provider lifecycle', path: 'src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js', transitionalLimit: bytes(25), v5Target: bytes(16) },
  { label: 'submit input council lifecycle', path: 'src/app/runtime/legacy-core/submit-input-council-lifecycle.js', transitionalLimit: bytes(50), v5Target: bytes(30) },
  { label: 'app bootstrap lifecycle', path: 'src/app/runtime/features/app-bootstrap-lifecycle.js', transitionalLimit: bytes(60), v5Target: bytes(35) },
  { label: 'transition bus lifecycle', path: 'src/app/runtime/legacy-core/transition-bus-lifecycle.js', transitionalLimit: bytes(41), v5Target: bytes(24) }
];

const cssBudgetDefinitions = [
  { label: 'largest CSS file', file: topFiles(cssFiles, 1)[0], transitionalLimit: bytes(40), v5Target: bytes(24) },
  { label: 'personalization CSS', path: 'src/styles/personalization.css', transitionalLimit: bytes(40), v5Target: bytes(24) },
  { label: 'settings base CSS', path: 'src/styles/settings.css', transitionalLimit: bytes(32), v5Target: bytes(24) },
  { label: 'settings mobile CSS', path: 'src/styles/settings-mobile.css', transitionalLimit: bytes(18), v5Target: bytes(12) },
  { label: 'settings provider CSS', path: 'src/styles/settings-provider-management.css', transitionalLimit: bytes(10), v5Target: bytes(8) },
  { label: 'settings desktop CSS', path: 'src/styles/settings-desktop.css', transitionalLimit: bytes(10), v5Target: bytes(8) }
];

const testBudgetDefinitions = [
  { label: 'largest test file', file: topFiles(testFiles, 1)[0], transitionalLimit: bytes(260), v5Target: bytes(120) },
  { label: 'structure regressions', path: 'tests/structure-regressions.test.js', transitionalLimit: bytes(260), v5Target: bytes(120) },
  { label: 'settings lifecycle tests', path: 'tests/runtime-settings-auth-provider-lifecycle.test.js', transitionalLimit: bytes(70), v5Target: bytes(35) },
  { label: 'settings UI regressions', path: 'tests/ui/settings-regressions.test.js', transitionalLimit: bytes(50), v5Target: bytes(30) },
  { label: 'app data replacement tests', path: 'tests/runtime-app-data-replacements.test.js', transitionalLimit: bytes(40), v5Target: bytes(25) }
];

const buildJsFiles = distFiles.filter((file) => extname(file.filePath) === '.js');
const buildCssFiles = distFiles.filter((file) => extname(file.filePath) === '.css');
const legacyCoreChunk = buildJsFiles.find((file) => basename(file.filePath).startsWith('legacy-core-'));
const buildBudgetDefinitions = existsSync(join(root, 'dist'))
  ? [
      { label: 'largest JS chunk', file: topFiles(buildJsFiles, 1)[0], transitionalLimit: bytes(500), v5Target: bytes(300), gzipTransitionalLimit: bytes(150), gzipV5Target: bytes(110) },
      { label: 'legacy-core chunk', file: legacyCoreChunk, transitionalLimit: bytes(410), v5Target: bytes(260), gzipTransitionalLimit: bytes(125), gzipV5Target: bytes(75) },
      { label: 'largest CSS asset', file: topFiles(buildCssFiles, 1)[0], transitionalLimit: bytes(220), v5Target: bytes(160), gzipTransitionalLimit: bytes(40), gzipV5Target: bytes(28) }
    ]
  : [];

function resolveBudgetItems(definitions, files) {
  return definitions.flatMap((definition) => {
    const file = definition.file || findFile(files, definition.path);
    if (!file) return [];
    return buildBudgetItem({
      ...definition,
      file,
      gzipSize: definition.file?.gzipSize ?? file.gzipSize
    });
  });
}

const runtimeItems = resolveBudgetItems(runtimeBudgetDefinitions, sourceFiles);
const cssItems = resolveBudgetItems(cssBudgetDefinitions, cssFiles);
const testItems = resolveBudgetItems(testBudgetDefinitions, testFiles);
const buildItems = resolveBudgetItems(buildBudgetDefinitions, distFiles);

console.log('# Grouped size budget report');
console.log('Hard failures use transitional limits. Long-term targets are shown as debt and do not fail this gate yet.');
console.log('dist/ is ignored as review source and reported only as generated build output when present.');

const failures = [
  ...printGroup('Runtime source budgets', runtimeItems),
  ...printGroup('CSS budgets', cssItems),
  ...printGroup('Test file budgets', testItems),
  ...(buildItems.length > 0 ? printGroup('Build output budgets', buildItems) : [])
];

console.log('\n## Largest source files');
for (const file of topFiles(sourceFiles, 12)) {
  console.log(`${formatBytes(file.size).padStart(9)} | ${file.path}`);
}

if (failures.length > 0) {
  console.error(`\nFound ${failures.length} file(s) over transitional size limits.`);
  process.exit(1);
}

console.log('\nOK: all grouped size budgets are within transitional limits.');

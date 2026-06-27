import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();

const keyFiles = [
  'src/app/runtime/legacy-core/legacy-core.js',
  'src/app/runtime/legacy-core/core-tail-lifecycle.js',
  'src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js',
  'src/app/runtime/legacy-core/submit-input-council-lifecycle.js',
  'src/styles/settings.css',
  'src/styles/personalization.css'
];

function collectFiles(directory, predicate = () => true, { includeLines = true } = {}) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(filePath, predicate, { includeLines });
    if (!entry.isFile() || !predicate(filePath)) return [];
    const size = statSync(filePath).size;
    return [{
      filePath,
      size,
      lines: includeLines ? readFileSync(filePath, 'utf8').split(/\r?\n/).length : undefined
    }];
  });
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function printTable(title, files, { gzip = false } = {}) {
  console.log(`\n## ${title}`);
  if (files.length === 0) {
    console.log('(none)');
    return;
  }
  for (const file of files) {
    const rel = relative(root, file.filePath).replace(/\\/g, '/');
    const gzipText = gzip ? ` | gzip ${formatBytes(file.gzipSize)}` : '';
    const linesText = file.lines ? ` | ${file.lines} lines` : '';
    console.log(`${formatBytes(file.size).padStart(9)}${gzipText}${linesText} | ${rel}`);
  }
}

const sourceFiles = collectFiles(join(root, 'src'), (filePath) => !filePath.endsWith('.css'))
  .sort((a, b) => b.size - a.size);
const cssFiles = collectFiles(join(root, 'src'), (filePath) => filePath.endsWith('.css'))
  .sort((a, b) => b.size - a.size);
const testFiles = collectFiles(join(root, 'tests'), (filePath) => filePath.endsWith('.test.js'))
  .sort((a, b) => b.size - a.size);
const buildFiles = collectFiles(join(root, 'dist'), () => true, { includeLines: false })
  .map((file) => ({
    ...file,
    gzipSize: gzipSync(readFileSync(file.filePath)).byteLength
  }))
  .sort((a, b) => b.size - a.size);

console.log('# Refactor Baseline Report');
console.log(`Generated: ${new Date().toISOString()}`);

printTable('Largest source files', sourceFiles.slice(0, 12));
printTable('Largest CSS files', cssFiles.slice(0, 12));
printTable('Largest test files', testFiles.slice(0, 12));
printTable('Largest build outputs', buildFiles.slice(0, 12), { gzip: true });

console.log('\n## Key file sizes');
for (const file of keyFiles) {
  const filePath = join(root, file);
  if (!existsSync(filePath)) {
    console.log(`missing | ${file}`);
    continue;
  }
  const source = readFileSync(filePath, 'utf8');
  const stats = statSync(filePath);
  console.log(`${formatBytes(stats.size).padStart(9)} | ${source.split(/\r?\n/).length} lines | ${file}`);
}

console.log('\n## Test files');
console.log(`${testFiles.length} test files`);

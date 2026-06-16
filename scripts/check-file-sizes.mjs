import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const maxSourceFileBytes = 150 * 1024;
const ignoredDirectories = new Set(['node_modules', 'dist']);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) return [];
      return collectFiles(join(directory, entry.name));
    }
    if (!entry.isFile()) return [];
    const filePath = join(directory, entry.name);
    return [{ filePath, size: statSync(filePath).size }];
  });
}

const files = collectFiles(sourceRoot).sort((a, b) => b.size - a.size);
const oversized = files.filter((file) => file.size > maxSourceFileBytes);

console.log('Largest source files:');
files.slice(0, 12).forEach((file) => {
  const sizeKb = (file.size / 1024).toFixed(1).padStart(7, ' ');
  console.log(`${sizeKb} KB  ${relative(root, file.filePath)}`);
});

if (oversized.length > 0) {
  console.error(`\nFound ${oversized.length} source file(s) over ${(maxSourceFileBytes / 1024).toFixed(0)} KB.`);
  process.exit(1);
}

console.log(`\nOK: every source file is under ${(maxSourceFileBytes / 1024).toFixed(0)} KB.`);

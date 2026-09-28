// What the worker does with a loaded Pyodide: the folders, mounting input
// files, running code with captured output, and collecting what the code
// wrote to /output. Kept free of worker globals so tests can drive it with
// Pyodide in Node.

import { LIMITS, isBlockedOutputName } from './protocol.js';

export const FOLDERS = Object.freeze({ input: '/input', output: '/output', work: '/work', fonts: '/fonts' });

const ensureDirectory = (FS, path) => {
  try {
    FS.mkdirTree(path);
  } catch {
    // Already there.
  }
};

export function prepareFolders(pyodide) {
  Object.values(FOLDERS).forEach((path) => ensureDirectory(pyodide.FS, path));
  pyodide.runPython(`import os\nos.chdir(${JSON.stringify(FOLDERS.work)})`);
}

const removeTree = (FS, directory, keepDirectory = true) => {
  let entries = [];
  try {
    entries = FS.readdir(directory).filter((name) => name !== '.' && name !== '..');
  } catch {
    return;
  }
  for (const name of entries) {
    const path = `${directory}/${name}`;
    if (FS.isDir(FS.stat(path).mode)) removeTree(FS, path, false);
    else FS.unlink(path);
  }
  if (!keepDirectory) FS.rmdir(directory);
};

// Empties /output and /work for the next reply and goes back to /work.
// Loaded packages stay, which saves re-importing pandas or matplotlib.
export function clearFolders(pyodide) {
  removeTree(pyodide.FS, FOLDERS.output);
  removeTree(pyodide.FS, FOLDERS.work);
  prepareFolders(pyodide);
}

// A name the user's file keeps inside /input: its own name without folders
// or characters the file system cannot hold, and "(2)" etc. when taken.
export function safeFileName(name, taken = new Set()) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().replace(/^\.+/, '') || 'file';
  const clipped = base.length > 180 ? base.slice(base.length - 180) : base;
  if (!taken.has(clipped)) return clipped;
  const dot = clipped.lastIndexOf('.');
  const stem = dot > 0 ? clipped.slice(0, dot) : clipped;
  const extension = dot > 0 ? clipped.slice(dot) : '';
  for (let index = 2; ; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Replaces /input with the given files. Returns the names used and the ones
// skipped because they would pass the total size limit.
export function mountInputFiles(pyodide, files = []) {
  const { FS } = pyodide;
  for (const name of listFiles(FS, FOLDERS.input)) FS.unlink(`${FOLDERS.input}/${name}`);
  const taken = new Set();
  const mounted = [];
  const skipped = [];
  let total = 0;
  for (const file of files) {
    const bytes = file?.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file?.bytes || 0);
    if (total + bytes.byteLength > LIMITS.inputTotalBytes) {
      skipped.push(String(file?.name || ''));
      continue;
    }
    const name = safeFileName(file?.name, taken);
    taken.add(name);
    FS.writeFile(`${FOLDERS.input}/${name}`, bytes);
    total += bytes.byteLength;
    mounted.push({ name, size: bytes.byteLength });
  }
  return { mounted, skipped };
}

function listFiles(FS, directory, prefix = '') {
  let entries = [];
  try {
    entries = FS.readdir(directory).filter((name) => name !== '.' && name !== '..');
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = `${directory}/${name}`;
    const stat = FS.stat(path);
    if (FS.isDir(stat.mode)) return listFiles(FS, path, `${prefix}${name}/`);
    return FS.isFile(stat.mode) ? [`${prefix}${name}`] : [];
  });
}

// Size and modification time of everything in /output, to tell afterwards
// which files a run created or changed.
export function snapshotOutput(pyodide) {
  const { FS } = pyodide;
  return new Map(listFiles(FS, FOLDERS.output).map((name) => {
    const stat = FS.stat(`${FOLDERS.output}/${name}`);
    return [name, `${stat.size}:${Number(stat.mtime)}`];
  }));
}

// The files a run created or changed in /output, within the limits. Files
// over a limit, or of a blocked type, are listed in `skipped` with a reason.
export function collectOutput(pyodide, before = new Map()) {
  const { FS } = pyodide;
  const files = [];
  const skipped = [];
  let total = 0;
  for (const name of listFiles(FS, FOLDERS.output).sort()) {
    const path = `${FOLDERS.output}/${name}`;
    const stat = FS.stat(path);
    if (before.get(name) === `${stat.size}:${Number(stat.mtime)}`) continue;
    if (isBlockedOutputName(name)) {
      skipped.push({ name, reason: 'blocked-type' });
    } else if (files.length >= LIMITS.outputFileCount) {
      skipped.push({ name, reason: 'too-many-files' });
    } else if (stat.size > LIMITS.outputFileBytes) {
      skipped.push({ name, reason: 'file-too-large', size: stat.size });
    } else if (total + stat.size > LIMITS.outputTotalBytes) {
      skipped.push({ name, reason: 'total-too-large', size: stat.size });
    } else {
      const bytes = FS.readFile(path);
      total += bytes.byteLength;
      files.push({ name, size: bytes.byteLength, bytes });
    }
  }
  return { files, skipped };
}

// Collects text written to stdout or stderr, keeping at most `limit`
// characters and counting the rest.
export function createTextSink(limit = LIMITS.capturedTextChars) {
  const decoder = new TextDecoder();
  let text = '';
  let dropped = 0;
  const add = (chunk) => {
    const room = limit - text.length;
    if (room >= chunk.length) text += chunk;
    else {
      if (room > 0) text += chunk.slice(0, room);
      dropped += chunk.length - Math.max(room, 0);
    }
  };
  return {
    write(buffer) {
      add(decoder.decode(buffer, { stream: true }));
      return buffer.length;
    },
    finish() {
      add(decoder.decode());
      return { text, dropped };
    }
  };
}

// A Python traceback without Pyodide's own frames: from the first frame in
// the user's code (<exec>) on, or the last line when there is none.
export function trimTraceback(message = '') {
  const lines = String(message).replace(/\s+$/, '').split('\n');
  const first = lines.findIndex((line) => /^\s*File "<exec>"/.test(line));
  if (first === -1) return lines.filter((line) => line.trim()).slice(-1).join('\n');
  const header = lines[0].startsWith('Traceback') ? [lines[0]] : [];
  return [...header, ...lines.slice(first)].join('\n');
}

// Runs code in the given globals with stdout and stderr captured.
export async function runCode(pyodide, code, globals) {
  const stdout = createTextSink();
  const stderr = createTextSink();
  pyodide.setStdout({ write: (buffer) => stdout.write(buffer), isatty: false });
  pyodide.setStderr({ write: (buffer) => stderr.write(buffer), isatty: false });
  const started = Date.now();
  let error = null;
  try {
    await pyodide.runPythonAsync(code, { globals, filename: '<exec>' });
  } catch (caught) {
    error = trimTraceback(caught?.message || String(caught));
  } finally {
    // Anything still buffered in Python's streams is written out.
    try {
      pyodide.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()');
    } catch {
      // Nothing to flush.
    }
    pyodide.setStdout();
    pyodide.setStderr();
  }
  return { stdout: stdout.finish(), stderr: stderr.finish(), error, elapsedMs: Date.now() - started };
}

// Families for matplotlib, most preferred first: Latin, then the document
// language's CJK face, then the others.
const CJK_ORDER = Object.freeze({
  'zh-TW': ['Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR'],
  'zh-CN': ['Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR'],
  ja: ['Noto Sans JP', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans KR'],
  ko: ['Noto Sans KR', 'Noto Sans TC', 'Noto Sans SC', 'Noto Sans JP']
});

export function chartFontOrder(language = 'zh-TW') {
  const key = Object.keys(CJK_ORDER).find((code) => String(language).toLowerCase().startsWith(code.toLowerCase())) || 'zh-TW';
  return ['Inter', ...CJK_ORDER[key]];
}

// Registers fonts already written to /fonts with matplotlib and puts them
// first, so Chinese, Japanese and Korean labels do not turn into boxes.
// Without fonts, matplotlib keeps its defaults.
export function configureChartFonts(pyodide, fileNames, language) {
  const paths = fileNames.map((name) => `${FOLDERS.fonts}/${name}`);
  pyodide.runPython(`
import matplotlib
matplotlib.use("Agg")
from matplotlib import font_manager, rcParams
_names = {}
for _path in ${JSON.stringify(paths)}:
    font_manager.fontManager.addfont(_path)
    _names[font_manager.FontProperties(fname=_path).get_name()] = True
_order = [name for name in ${JSON.stringify(chartFontOrder(language))} if name in _names]
_order += [name for name in _names if name not in _order]
# A list of families (not the generic "sans-serif") makes matplotlib fall
# back from one family to the next for each missing glyph.
rcParams["font.family"] = _order + ["DejaVu Sans"]
rcParams["font.sans-serif"] = _order + [name for name in rcParams["font.sans-serif"] if name not in _order]
rcParams["axes.unicode_minus"] = False
# matplotlib's own glyph fallback warns about float positions; not the code's doing.
import warnings
warnings.filterwarnings("ignore", message="The [xy] parameter as float")
del _names, _order
`);
}

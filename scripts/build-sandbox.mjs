// Builds the files the Python sandbox (public/sandbox/) loads besides its
// own code: the Pyodide loader, a lock file that adds the pure-Python wheels
// Pyodide does not ship (downloaded from PyPI and checked against pinned
// hashes), and the hashes the sandbox's service worker checks the Pyodide
// core files against. Run it after changing the Pyodide version or a wheel:
//
//   node scripts/build-sandbox.mjs
//
// The output is committed, so builds and deploys do not reach PyPI.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PYODIDE_VERSION, WHEEL_ORIGIN_PLACEHOLDER } from '../public/sandbox/protocol.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pyodideDirectory = join(root, 'node_modules/pyodide');
const outputDirectory = join(root, 'public/sandbox/pyodide');
const wheelDirectory = join(root, 'public/sandbox/wheels');

// Pure-Python packages for Office files and PDFs. `depends` uses the lock
// file's package names; `imports` lets loadPackagesFromImports find them.
const WHEELS = [
  {
    name: 'python-docx', version: '1.2.0', imports: ['docx'], depends: ['lxml', 'typing-extensions'],
    url: 'https://files.pythonhosted.org/packages/d0/00/1e03a4989fa5795da308cd774f05b704ace555a70f9bf9d3be057b680bcf/python_docx-1.2.0-py3-none-any.whl',
    sha256: '3fd478f3250fbbbfd3b94fe1e985955737c145627498896a8a6bf81f4baf66c7'
  },
  {
    name: 'python-pptx', version: '1.0.2', imports: ['pptx'], depends: ['lxml', 'pillow', 'xlsxwriter', 'typing-extensions'],
    url: 'https://files.pythonhosted.org/packages/d9/4f/00be2196329ebbff56ce564aa94efb0fbc828d00de250b1980de1a34ab49/python_pptx-1.0.2-py3-none-any.whl',
    sha256: '160838e0b8565a8b1f67947675886e9fea18aa5e795db7ae531606d68e785cba'
  },
  {
    name: 'openpyxl', version: '3.1.5', imports: ['openpyxl'], depends: ['et-xmlfile'],
    url: 'https://files.pythonhosted.org/packages/c0/da/977ded879c29cbd04de313843e76868e6e13408a94ed6b987245dc7c8506/openpyxl-3.1.5-py2.py3-none-any.whl',
    sha256: '5282c12b107bffeef825f4617dc029afaf41d0ea60823bbb665ef3079dc79de2'
  },
  {
    name: 'et-xmlfile', version: '2.0.0', imports: ['et_xmlfile'], depends: [],
    url: 'https://files.pythonhosted.org/packages/c1/8b/5fe2cc11fee489817272089c4203e679c63b570a5aaeb18d852ae3cbba6a/et_xmlfile-2.0.0-py3-none-any.whl',
    sha256: '7a91720bc756843502c3b7504c77b8fe44217c85c537d85037f0f536151b2caa'
  },
  {
    name: 'xlsxwriter', version: '3.2.9', imports: ['xlsxwriter'], depends: [],
    url: 'https://files.pythonhosted.org/packages/3a/0c/3662f4a66880196a590b202f0db82d919dd2f89e99a27fadef91c4a33d41/xlsxwriter-3.2.9-py3-none-any.whl',
    sha256: '9a5db42bc5dff014806c58a20b9eae7322a134abb6fce3c92c181bfb275ec5b3'
  },
  {
    name: 'fpdf2', version: '2.8.8', imports: ['fpdf'], depends: ['defusedxml', 'pillow', 'fonttools'],
    url: 'https://files.pythonhosted.org/packages/f5/be/af012eda9507494f28b99b077423806c43a11573eb6225dd46f19ae2d263/fpdf2-2.8.8-py3-none-any.whl',
    sha256: '3557a478fc577a929c94aace9666aed4dcc432b5ab6764232e6a59f1ccd75f17'
  },
  {
    name: 'defusedxml', version: '0.7.1', imports: ['defusedxml'], depends: [],
    url: 'https://files.pythonhosted.org/packages/07/6c/aa3f2f849e01cb6a001cd8554a88d4c77c5c1a31c95bdf1cf9301e6d9ef4/defusedxml-0.7.1-py2.py3-none-any.whl',
    sha256: 'a352e7e428770286cc899e2542b6cdaedb2b4953ff269a210103ec58f6198a61'
  },
  {
    name: 'reportlab', version: '5.0.1', imports: ['reportlab'], depends: ['pillow', 'charset-normalizer'],
    url: 'https://files.pythonhosted.org/packages/db/cb/dacbc268cb68d0428ea2cbd85266195a9ab3e677449589ddae59bd7542ac/reportlab-5.0.1-py3-none-any.whl',
    sha256: '1c36e6bb0e71780c72331eba60da7f602e8d4389a8723825af71342e49d791e8'
  },
  {
    name: 'pypdf', version: '6.19.0', imports: ['pypdf'], depends: [],
    url: 'https://files.pythonhosted.org/packages/3c/2c/c43c03eaf630435f023f1dc61ec4a4a78951ad5530a62c71cc89bde307b7/pypdf-6.19.0-py3-none-any.whl',
    sha256: '7e5d6e730e7dae87d560a2cee218b852f6498c8be61966f3cd02ead971e48d14'
  }
];

// Core files fetched from the CDN; their hashes are checked before use.
const CORE_FILES = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip'];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileName = (url) => url.slice(url.lastIndexOf('/') + 1);

const installed = JSON.parse(readFileSync(join(pyodideDirectory, 'package.json'), 'utf8')).version;
if (installed !== PYODIDE_VERSION) {
  throw new Error(`node_modules/pyodide is ${installed}; public/sandbox/protocol.js expects ${PYODIDE_VERSION}.`);
}

mkdirSync(outputDirectory, { recursive: true });
mkdirSync(wheelDirectory, { recursive: true });

const lock = JSON.parse(readFileSync(join(pyodideDirectory, 'pyodide-lock.json'), 'utf8'));
for (const wheel of WHEELS) {
  if (lock.packages[wheel.name]) throw new Error(`${wheel.name} is already in Pyodide's lock file; drop it from WHEELS.`);
  for (const dependency of wheel.depends) {
    if (!lock.packages[dependency] && !WHEELS.some((entry) => entry.name === dependency)) {
      throw new Error(`${wheel.name} depends on ${dependency}, which is not available.`);
    }
  }
  const target = join(wheelDirectory, fileName(wheel.url));
  let bytes = existsSync(target) ? readFileSync(target) : null;
  if (!bytes || sha256(bytes) !== wheel.sha256) {
    const response = await fetch(wheel.url);
    if (!response.ok) throw new Error(`Downloading ${wheel.url} failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== wheel.sha256) throw new Error(`${fileName(wheel.url)} does not match its pinned hash.`);
    writeFileSync(target, bytes);
  }
  lock.packages[wheel.name] = {
    name: wheel.name,
    version: wheel.version,
    file_name: `${WHEEL_ORIGIN_PLACEHOLDER}/sandbox/wheels/${fileName(wheel.url)}`,
    install_dir: 'site',
    sha256: wheel.sha256,
    package_type: 'package',
    imports: wheel.imports,
    depends: wheel.depends,
    unvendored_tests: false,
    tool: {}
  };
}

// Wheels no longer listed are removed so they are not deployed.
const wanted = new Set(WHEELS.map((wheel) => fileName(wheel.url)));
for (const file of readdirSync(wheelDirectory)) {
  if (!wanted.has(file)) rmSync(join(wheelDirectory, file));
}

writeFileSync(join(outputDirectory, 'pyodide-lock.json'), `${JSON.stringify(lock)}\n`);
// The source map is not deployed, so its comment is dropped.
const loader = readFileSync(join(pyodideDirectory, 'pyodide.mjs'), 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
writeFileSync(join(outputDirectory, 'pyodide.mjs'), loader);
const core = Object.fromEntries(CORE_FILES.map((file) => [file, sha256(readFileSync(join(pyodideDirectory, file)))]));
writeFileSync(join(outputDirectory, 'integrity.json'), `${JSON.stringify({ version: PYODIDE_VERSION, core }, null, 2)}\n`);

console.log(`Pyodide ${PYODIDE_VERSION}: lock file with ${WHEELS.length} added wheels, loader and core hashes written.`);

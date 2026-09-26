// Extension-driven registry for model-authored downloadable files. The
// extension is the single source of truth for a file's type: the block
// protocol never trusts a separately declared MIME type.

const TEXT_MIME = 'text/plain;charset=utf-8';

const RICH_TYPES = Object.freeze({
  docx: {
    family: 'word',
    generator: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  xlsx: {
    family: 'excel',
    generator: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  pptx: {
    family: 'powerpoint',
    generator: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  },
  pdf: {
    family: 'pdf',
    generator: 'pdf',
    mime: 'application/pdf'
  }
});

const TEXT_TYPES = Object.freeze({
  txt: { family: 'text', mime: TEXT_MIME },
  text: { family: 'text', mime: TEXT_MIME },
  log: { family: 'text', mime: TEXT_MIME },
  md: { family: 'markdown', mime: 'text/markdown;charset=utf-8' },
  markdown: { family: 'markdown', mime: 'text/markdown;charset=utf-8' },
  csv: { family: 'csv', mime: 'text/csv;charset=utf-8', bom: true },
  tsv: { family: 'csv', mime: 'text/tab-separated-values;charset=utf-8', bom: true },
  json: { family: 'data', mime: 'application/json;charset=utf-8', language: 'JSON' },
  jsonl: { family: 'data', mime: 'application/jsonl;charset=utf-8', language: 'JSON Lines' },
  xml: { family: 'data', mime: 'application/xml;charset=utf-8', language: 'XML' },
  yaml: { family: 'data', mime: 'application/yaml;charset=utf-8', language: 'YAML' },
  yml: { family: 'data', mime: 'application/yaml;charset=utf-8', language: 'YAML' },
  toml: { family: 'data', mime: TEXT_MIME, language: 'TOML' },
  ini: { family: 'data', mime: TEXT_MIME, language: 'INI' },
  cfg: { family: 'data', mime: TEXT_MIME, language: 'Config' },
  conf: { family: 'data', mime: TEXT_MIME, language: 'Config' },
  env: { family: 'data', mime: TEXT_MIME, language: 'Env' },
  properties: { family: 'data', mime: TEXT_MIME, language: 'Properties' },
  html: { family: 'web', mime: 'text/html;charset=utf-8', language: 'HTML' },
  htm: { family: 'web', mime: 'text/html;charset=utf-8', language: 'HTML' },
  css: { family: 'web', mime: 'text/css;charset=utf-8', language: 'CSS' },
  scss: { family: 'web', mime: TEXT_MIME, language: 'SCSS' },
  less: { family: 'web', mime: TEXT_MIME, language: 'Less' },
  svg: { family: 'web', mime: 'image/svg+xml;charset=utf-8', language: 'SVG' },
  ics: { family: 'calendar', mime: 'text/calendar;charset=utf-8', crlf: true },
  vcf: { family: 'contact', mime: 'text/vcard;charset=utf-8', crlf: true },
  srt: { family: 'subtitle', mime: 'application/x-subrip;charset=utf-8' },
  vtt: { family: 'subtitle', mime: 'text/vtt;charset=utf-8' },
  tex: { family: 'code', mime: TEXT_MIME, language: 'LaTeX' },
  bib: { family: 'code', mime: TEXT_MIME, language: 'BibTeX' },
  rtf: { family: 'text', mime: 'application/rtf' },
  sql: { family: 'code', mime: 'application/sql;charset=utf-8', language: 'SQL' },
  js: { family: 'code', mime: 'text/javascript;charset=utf-8', language: 'JavaScript', script: true },
  mjs: { family: 'code', mime: 'text/javascript;charset=utf-8', language: 'JavaScript' },
  cjs: { family: 'code', mime: 'text/javascript;charset=utf-8', language: 'JavaScript' },
  jsx: { family: 'code', mime: TEXT_MIME, language: 'JSX' },
  ts: { family: 'code', mime: TEXT_MIME, language: 'TypeScript' },
  tsx: { family: 'code', mime: TEXT_MIME, language: 'TSX' },
  vue: { family: 'code', mime: TEXT_MIME, language: 'Vue' },
  svelte: { family: 'code', mime: TEXT_MIME, language: 'Svelte' },
  py: { family: 'code', mime: TEXT_MIME, language: 'Python', script: true },
  pyw: { family: 'code', mime: TEXT_MIME, language: 'Python', script: true },
  ipynb: { family: 'data', mime: 'application/x-ipynb+json;charset=utf-8', language: 'Jupyter' },
  r: { family: 'code', mime: TEXT_MIME, language: 'R' },
  java: { family: 'code', mime: TEXT_MIME, language: 'Java' },
  kt: { family: 'code', mime: TEXT_MIME, language: 'Kotlin' },
  kts: { family: 'code', mime: TEXT_MIME, language: 'Kotlin' },
  scala: { family: 'code', mime: TEXT_MIME, language: 'Scala' },
  groovy: { family: 'code', mime: TEXT_MIME, language: 'Groovy' },
  gradle: { family: 'code', mime: TEXT_MIME, language: 'Gradle' },
  c: { family: 'code', mime: TEXT_MIME, language: 'C' },
  h: { family: 'code', mime: TEXT_MIME, language: 'C' },
  cpp: { family: 'code', mime: TEXT_MIME, language: 'C++' },
  cc: { family: 'code', mime: TEXT_MIME, language: 'C++' },
  cxx: { family: 'code', mime: TEXT_MIME, language: 'C++' },
  hpp: { family: 'code', mime: TEXT_MIME, language: 'C++' },
  cs: { family: 'code', mime: TEXT_MIME, language: 'C#' },
  fs: { family: 'code', mime: TEXT_MIME, language: 'F#' },
  vb: { family: 'code', mime: TEXT_MIME, language: 'Visual Basic' },
  go: { family: 'code', mime: TEXT_MIME, language: 'Go' },
  rs: { family: 'code', mime: TEXT_MIME, language: 'Rust' },
  rb: { family: 'code', mime: TEXT_MIME, language: 'Ruby', script: true },
  php: { family: 'code', mime: TEXT_MIME, language: 'PHP' },
  pl: { family: 'code', mime: TEXT_MIME, language: 'Perl', script: true },
  lua: { family: 'code', mime: TEXT_MIME, language: 'Lua' },
  swift: { family: 'code', mime: TEXT_MIME, language: 'Swift' },
  m: { family: 'code', mime: TEXT_MIME, language: 'Objective-C / MATLAB' },
  dart: { family: 'code', mime: TEXT_MIME, language: 'Dart' },
  ex: { family: 'code', mime: TEXT_MIME, language: 'Elixir' },
  exs: { family: 'code', mime: TEXT_MIME, language: 'Elixir' },
  erl: { family: 'code', mime: TEXT_MIME, language: 'Erlang' },
  hs: { family: 'code', mime: TEXT_MIME, language: 'Haskell' },
  clj: { family: 'code', mime: TEXT_MIME, language: 'Clojure' },
  jl: { family: 'code', mime: TEXT_MIME, language: 'Julia' },
  sol: { family: 'code', mime: TEXT_MIME, language: 'Solidity' },
  graphql: { family: 'code', mime: TEXT_MIME, language: 'GraphQL' },
  proto: { family: 'code', mime: TEXT_MIME, language: 'Protocol Buffers' },
  dockerfile: { family: 'code', mime: TEXT_MIME, language: 'Dockerfile' },
  makefile: { family: 'code', mime: TEXT_MIME, language: 'Makefile' },
  sh: { family: 'code', mime: TEXT_MIME, language: 'Shell', script: true },
  bash: { family: 'code', mime: TEXT_MIME, language: 'Bash', script: true },
  zsh: { family: 'code', mime: TEXT_MIME, language: 'Zsh', script: true },
  fish: { family: 'code', mime: TEXT_MIME, language: 'Fish', script: true },
  command: { family: 'code', mime: TEXT_MIME, language: 'Shell', script: true },
  ps1: { family: 'code', mime: TEXT_MIME, language: 'PowerShell', script: true, crlf: true },
  psm1: { family: 'code', mime: TEXT_MIME, language: 'PowerShell', script: true, crlf: true },
  bat: { family: 'code', mime: TEXT_MIME, language: 'Batch', script: true, crlf: true },
  cmd: { family: 'code', mime: TEXT_MIME, language: 'Batch', script: true, crlf: true },
  vbs: { family: 'code', mime: TEXT_MIME, language: 'VBScript', script: true, crlf: true },
  wsf: { family: 'code', mime: TEXT_MIME, language: 'Windows Script', script: true, crlf: true },
  applescript: { family: 'code', mime: TEXT_MIME, language: 'AppleScript', script: true },
  desktop: { family: 'code', mime: TEXT_MIME, language: 'Desktop Entry', script: true }
});

// Executables, installers, shortcuts, registry files, and macro-enabled Office
// documents are never produced, regardless of what the model asks for.
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'com', 'scr', 'pif', 'cpl', 'msc', 'msi', 'msp', 'mst', 'dll', 'sys', 'drv', 'ocx',
  'lnk', 'url', 'scf', 'inf', 'reg', 'hta', 'jar', 'jnlp', 'gadget', 'application', 'appref-ms',
  'vbe', 'jse', 'wsc', 'wsh', 'ws', 'msh', 'msh1', 'msh2', 'mshxml', 'psc1', 'psd1', 'ps1xml', 'ps2', 'ps2xml',
  'settingcontent-ms', 'library-ms', 'search-ms', 'searchconnector-ms', 'diagcab', 'xll', 'xlam', 'ppam',
  'app', 'apk', 'ipa', 'aab', 'xapk', 'deb', 'rpm', 'dmg', 'pkg', 'mpkg', 'iso', 'img', 'vhd', 'vhdx',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlsb', 'pptm', 'potm', 'ppsm', 'sldm',
  // Archives are binary; a model can only stream text, so an authored archive
  // would always be corrupt. Multi-file bundles are built by the app instead.
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'cab'
]);

const EXTENSIONLESS_CODE_NAMES = Object.freeze({
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gemfile: 'rb',
  rakefile: 'rb',
  procfile: 'txt',
  license: 'txt',
  readme: 'md',
  changelog: 'md'
});

export const FILE_GENERATOR_KINDS = Object.freeze(['text', 'docx', 'xlsx', 'pptx', 'pdf']);

// Rich generators become available one phase at a time. The authoring guidance
// only advertises formats whose generator is present, so a model is never
// taught to emit a block the app cannot turn into a file.
const AVAILABLE_RICH_GENERATORS = new Set(['docx']);

export function isGeneratorAvailable(generator) {
  return generator === 'text' || AVAILABLE_RICH_GENERATORS.has(generator);
}

export function getFileExtension(fileName = '') {
  const name = String(fileName || '').trim();
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) return '';
  return name.slice(lastDot + 1).toLowerCase();
}

export function resolveFileType(fileName = '') {
  const name = String(fileName || '').trim();
  const extension = getFileExtension(name);

  if (!extension) {
    const aliased = EXTENSIONLESS_CODE_NAMES[name.toLowerCase()];
    const aliasedType = aliased ? TEXT_TYPES[aliased] : null;
    return {
      extension: '',
      generator: 'text',
      policy: 'allow',
      ...(aliasedType || { family: 'text', mime: TEXT_MIME })
    };
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    return { extension, family: 'blocked', generator: null, mime: '', policy: 'block' };
  }

  if (RICH_TYPES[extension]) {
    return { extension, policy: 'allow', ...RICH_TYPES[extension] };
  }

  const textType = TEXT_TYPES[extension];
  if (textType) {
    return {
      extension,
      generator: 'text',
      policy: textType.script ? 'warn' : 'allow',
      ...textType
    };
  }

  // Unknown extensions are delivered as plain UTF-8 text: the content came
  // from a text stream, so there is nothing binary to misinterpret.
  return { extension, family: 'text', generator: 'text', mime: TEXT_MIME, policy: 'allow' };
}

export function isKnownFileExtension(extension = '') {
  const normalized = String(extension || '').toLowerCase();
  return Boolean(RICH_TYPES[normalized] || TEXT_TYPES[normalized] || BLOCKED_EXTENSIONS.has(normalized));
}

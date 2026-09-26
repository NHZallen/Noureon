// Text-family files are the block content itself, with three corrections:
// Windows-sensitive formats get CRLF line endings, CSV/TSV get a UTF-8 BOM so
// Excel detects the encoding, and spreadsheet cells that would execute as
// formulas are neutralized.

const UTF8_BOM = '﻿';
const NUMERIC_CELL = /^[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?%?$/;
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      wasQuoted = true;
    } else if (char === delimiter) {
      row.push({ value: field, quoted: wasQuoted });
      field = '';
      wasQuoted = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push({ value: field, quoted: wasQuoted });
      rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
    } else {
      field += char;
    }
  }
  if (field !== '' || wasQuoted || row.length > 0) {
    row.push({ value: field, quoted: wasQuoted });
    rows.push(row);
  }
  return rows;
}

// OWASP CSV-injection guidance: prefix a single quote to any cell that a
// spreadsheet would evaluate. Plain numbers such as "-12.5" or "+3%" are data,
// not formulas, and stay untouched.
export function neutralizeSpreadsheetCell(value) {
  const text = String(value ?? '');
  if (!FORMULA_TRIGGER.test(text)) return text;
  if (NUMERIC_CELL.test(text.trim())) return text;
  if (text.length === 1 && (text === '-' || text === '+')) return text;
  return `'${text}`;
}

function serializeField({ value, quoted }, delimiter) {
  const needsQuotes = quoted || value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value);
  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value;
}

export function sanitizeDelimitedText(text, delimiter = ',') {
  const rows = parseDelimited(text, delimiter);
  return rows
    .map((row) => row
      .map((field) => serializeField({ ...field, value: neutralizeSpreadsheetCell(field.value) }, delimiter))
      .join(delimiter))
    .join('\r\n');
}

export function buildTextFileContent(descriptor) {
  let content = String(descriptor.content ?? '');
  if (descriptor.extension === 'csv') {
    content = sanitizeDelimitedText(content, ',');
  } else if (descriptor.extension === 'tsv') {
    content = sanitizeDelimitedText(content, '\t');
  } else if (descriptor.crlf) {
    content = content.replace(/\r?\n/g, '\r\n');
  }
  if (content && !content.endsWith('\n') && descriptor.family !== 'csv') {
    content += descriptor.crlf ? '\r\n' : '\n';
  }
  return descriptor.bom ? `${UTF8_BOM}${content}` : content;
}

export async function generateTextFile(descriptor) {
  return new Blob([buildTextFileContent(descriptor)], { type: descriptor.mime || 'text/plain;charset=utf-8' });
}

#!/usr/bin/env node
// Tries models of Google's own Gemini API (not OpenRouter, not OpenCode) with a real key, one check at a time, and says what came back (status, time, the answer, the tokens).
// The key is read from the environment and never printed.
//
//   GEMINI_API_KEY=... node scripts/gemini-probe.mjs                                   (gemini-4-carbon and gemini-4-hydrogen, every check)
//   GEMINI_API_KEY=... node scripts/gemini-probe.mjs --model gemini-4-carbon           (one id, or several with a comma)
//   GEMINI_API_KEY=... node scripts/gemini-probe.mjs --only info,basic,thinking         (some checks only)
//   GEMINI_API_KEY=... node scripts/gemini-probe.mjs --only video --video ./clip.mp4     (a video of your own instead of the made one)
//   GEMINI_API_KEY=... node scripts/gemini-probe.mjs --out gemini-probe-result.json      (also keeps every line as JSON, default: gemini-probe-result.json)
//
// Checks: list (is the id in the list of the service, and the ids that look like it when it is not), info (what the service says of the model: the limits of tokens in and out, the methods,
// whether it thinks; free), basic, stream (the lines of the stream and the time of the first one), tool (a function call and the answer to its result sent back, the part of the call kept as it
// came), params (temperature, topP, topK accepted or refused), vision (a red picture), video (a short clip, made with ffmpeg when it is installed), pdf (a one-page PDF with a secret word),
// pdfimage (a PDF whose only picture holds the word), audio (a short sound: whether it is accepted), thinking (each depth the app can ask for, minimal, low, medium, high: how many tokens it
// used, and whether a budget of 0 turns thinking off), shown (the summaries of the thinking, asked with includeThoughts), search (the Google search tool: whether the answer is grounded),
// maxout (the most a reply may write: asked for far too much, and what the service says is read).
// A 429 now and then is the limit of the key, not the model.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : ''; };
const key = String(process.env.GEMINI_API_KEY || '').trim();
if (!key) {
  console.error('Set GEMINI_API_KEY first:  GEMINI_API_KEY=... node scripts/gemini-probe.mjs');
  process.exit(1);
}
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const models = (option('--model') || 'gemini-4-carbon,gemini-4-hydrogen').split(',').map((id) => id.trim().replace(/^models\//, '')).filter(Boolean);
const ALL = ['list', 'info', 'basic', 'stream', 'tool', 'params', 'vision', 'video', 'pdf', 'pdfimage', 'audio', 'thinking', 'shown', 'search', 'maxout'];
const checks = option('--only') ? option('--only').split(',') : ALL;
const outFile = option('--out') || 'gemini-probe-result.json';
const results = [];

const redact = (text) => String(text).split(key).join('***');
const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };

// A solid red 64x64 PNG, made here so no file is needed.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
const makePng = (pixel = [220, 20, 20]) => {
  const size = 64;
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => pixel).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
};

// A one-page PDF with a line of text (a real text layer), made here: the offsets of the cross-reference table are counted as it is built.
const makePdf = (line) => {
  const stream = `BT /F1 20 Tf 72 700 Td (${line}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => { const at = out.length; out += `${index + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};
// A PDF whose only content is a picture (a red square with no text layer): the word is not in any text, so a model that reads it has to look.
const makeImagePdf = () => {
  const raw = Buffer.alloc(64 * 64 * 3);
  for (let i = 0; i < raw.length; i += 3) { raw[i] = 200; raw[i + 1] = 30; raw[i + 2] = 30; }
  const data = deflateSync(raw);
  const content = 'q 160 0 0 160 20 20 cm /Im0 Do Q';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>'),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')])
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const piece = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(piece);
    length += piece.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
};

// One second of a 440 Hz tone as a WAV file (16-bit, 16 kHz, mono).
const makeWav = () => {
  const rate = 16000;
  const samples = rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

const getVideo = () => {
  const given = option('--video');
  if (given) return readFileSync(given);
  const dir = mkdtempSync(join(tmpdir(), 'gemini-probe-'));
  const file = join(dir, 'clip.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2:r=10', '-pix_fmt', 'yuv420p', file]);
  return readFileSync(file);
};

const call = async (model, body, { stream = false } = {}) => {
  const started = Date.now();
  const url = `${BASE}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  if (!stream) {
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, ms: Date.now() - started, json, text };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let first = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!first) first = Date.now() - started;
    raw += decoder.decode(value, { stream: true });
  }
  return { status: response.status, ms: Date.now() - started, firstMs: first, text: raw };
};

const partsOf = (result) => result.json?.candidates?.[0]?.content?.parts || [];
const usageOf = (result) => {
  const usage = result.json?.usageMetadata;
  return usage ? `tokens in ${usage.promptTokenCount ?? '?'} out ${usage.candidatesTokenCount ?? '?'} thinking ${usage.thoughtsTokenCount ?? 0}` : '';
};
const answerOf = (result) => {
  if (result.status !== 200) return `${result.status} ${redact(result.json?.error?.message || result.text).slice(0, 300)}`;
  const parts = partsOf(result);
  if (!parts.length) return `(no parts) finish ${result.json?.candidates?.[0]?.finishReason || '?'} ${redact(result.text).slice(0, 200)}`;
  const calls = parts.filter((part) => part.functionCall).map((part) => `${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`).join(' ');
  const text = parts.filter((part) => part.text && !part.thought).map((part) => part.text).join('').trim().slice(0, 300);
  const thought = parts.filter((part) => part.thought).map((part) => part.text || '').join('');
  return `${calls ? `CALL ${calls}  ` : ''}${text}${thought ? `  [thought summary ${thought.length} chars]` : ''}  ${usageOf(result)}`;
};
const report = (model, check, ok, detail) => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${model}  ${check}  ${redact(detail)}`;
  console.log(line);
  results.push({ model, check, ok, detail: redact(detail) });
};
const user = (...parts) => ({ role: 'user', parts });
const text = (value) => ({ text: value });
const cfg = (extra = {}) => ({ generationConfig: { maxOutputTokens: 800, ...extra } });

const TOOL = { functionDeclarations: [{ name: 'get_time', description: 'Get the current time in a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }] };

const run = async (model, check) => {
  if (check === 'list') {
    const response = await fetch(`${BASE}/models?pageSize=1000`, { headers });
    const json = await response.json().catch(() => null);
    const ids = (json?.models || []).map((entry) => String(entry.name || '').replace(/^models\//, ''));
    const words = model.split(/[-.]/).filter((word) => word.length > 1);
    const near = ids.filter((id) => words.some((word) => id.toLowerCase().includes(word.toLowerCase()))).slice(0, 30);
    return report(model, check, ids.includes(model), ids.includes(model) ? 'listed' : `not listed (${response.status}); close ids: ${near.join(', ') || '(none)'}`);
  }
  if (check === 'info') {
    const response = await fetch(`${BASE}/models/${model}`, { headers });
    const json = await response.json().catch(() => null);
    if (!response.ok) return report(model, check, false, `${response.status} ${json?.error?.message || ''}`);
    return report(model, check, true, `${json.displayName || ''}  in ${json.inputTokenLimit ?? '?'}  out ${json.outputTokenLimit ?? '?'}  thinking ${json.thinking ?? '?'}  methods ${(json.supportedGenerationMethods || []).join(',')}  temp ${json.temperature ?? '?'}/${json.maxTemperature ?? '?'}  topP ${json.topP ?? '?'} topK ${json.topK ?? '?'}  version ${json.version || ''}`);
  }
  if (check === 'basic') {
    const result = await call(model, { contents: [user(text('Reply with the single word PONG and nothing else.'))], ...cfg() });
    return report(model, check, result.status === 200 && /PONG/i.test(JSON.stringify(partsOf(result))), `${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'stream') {
    const result = await call(model, { contents: [user(text('Count from 1 to 5 in words, separated by commas.'))], ...cfg() }, { stream: true });
    const events = result.text.split('\n').filter((line) => line.startsWith('data:')).length;
    const last = result.text.split('\n').filter((line) => line.startsWith('data:')).pop() || '';
    let usage = '';
    try { usage = usageOf({ json: JSON.parse(last.slice(5)) }); } catch { /* the last line is not the usage */ }
    return report(model, check, result.status === 200 && events > 0, `${result.ms}ms, first ${result.firstMs}ms, ${events} events  ${usage}  ${result.status !== 200 ? redact(result.text).slice(0, 300) : ''}`);
  }
  if (check === 'tool') {
    const first = await call(model, { contents: [user(text('What time is it in Taipei? Use the tool.'))], tools: [TOOL], ...cfg() });
    const callPart = partsOf(first).find((part) => part.functionCall);
    if (!callPart) return report(model, check, false, `no call: ${answerOf(first)}`);
    // The part of the call goes back as it came (Gemini 3 and later keep a signature in it).
    const second = await call(model, {
      contents: [user(text('What time is it in Taipei? Use the tool.')), { role: 'model', parts: partsOf(first) }, user({ functionResponse: { name: callPart.functionCall.name, response: { time: '14:07' } } })],
      tools: [TOOL], ...cfg()
    });
    const signature = Boolean(callPart.thoughtSignature);
    return report(model, check, second.status === 200 && /14[:.]?07|2:07/.test(JSON.stringify(partsOf(second))), `call ${callPart.functionCall.name}(${JSON.stringify(callPart.functionCall.args)}) signature ${signature} ; then ${answerOf(second)}`);
  }
  if (check === 'params') {
    const lines = [];
    for (const [label, config] of [['temperature 0.2', { temperature: 0.2 }], ['topP 0.5', { topP: 0.5 }], ['topK 20', { topK: 20 }], ['maxOutputTokens 4000', { maxOutputTokens: 4000 }]]) {
      const result = await call(model, { contents: [user(text('Say hi in one short sentence.'))], generationConfig: config });
      lines.push(`${label}: ${result.status === 200 ? 'ok' : `${result.status} ${redact(result.json?.error?.message || '').slice(0, 120)}`}`);
    }
    return report(model, check, true, lines.join('  |  '));
  }
  if (check === 'vision') {
    const result = await call(model, { contents: [user(text('What colour is this picture? One word.'), { inlineData: { mimeType: 'image/png', data: makePng().toString('base64') } })], ...cfg() });
    return report(model, check, result.status === 200 && /red/i.test(JSON.stringify(partsOf(result))), `${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'video') {
    let clip;
    try { clip = getVideo(); } catch (error) { return report(model, check, false, `no video (install ffmpeg or give --video): ${error.message}`); }
    const result = await call(model, { contents: [user(text('What colour is this video? One word.'), { inlineData: { mimeType: 'video/mp4', data: clip.toString('base64') } })], ...cfg() });
    return report(model, check, result.status === 200 && /blue/i.test(JSON.stringify(partsOf(result))), `${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'pdf') {
    const result = await call(model, { contents: [user(text('What is the secret word in this document? Answer with the word only.'), { inlineData: { mimeType: 'application/pdf', data: makePdf('The secret word is MANGO').toString('base64') } })], ...cfg() });
    return report(model, check, result.status === 200 && /MANGO/i.test(JSON.stringify(partsOf(result))), `${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'pdfimage') {
    const result = await call(model, { contents: [user(text('This PDF has one picture and no text. What colour is the square? One word.'), { inlineData: { mimeType: 'application/pdf', data: makeImagePdf().toString('base64') } })], ...cfg() });
    return report(model, check, result.status === 200 && /red/i.test(JSON.stringify(partsOf(result))), `${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'audio') {
    const result = await call(model, { contents: [user(text('Is this sound speech, a tone, or silence? One word.'), { inlineData: { mimeType: 'audio/wav', data: makeWav().toString('base64') } })], ...cfg() });
    return report(model, check, result.status === 200 && /tone|beep|sine|hum|note/i.test(JSON.stringify(partsOf(result))), `accepted: ${result.status === 200}  ${result.ms}ms ${answerOf(result)}`);
  }
  if (check === 'thinking') {
    const question = 'A bat and a ball cost 1.10 together; the bat costs 1.00 more than the ball. How much is the ball? Answer with the number only.';
    const lines = [];
    for (const level of ['minimal', 'low', 'medium', 'high']) {
      const result = await call(model, { contents: [user(text(question))], generationConfig: { maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: level } } });
      lines.push(`${level}: ${result.status === 200 ? usageOf(result) : `${result.status} ${redact(result.json?.error?.message || '').slice(0, 140)}`}`);
    }
    // A budget of 0 is the way to turn thinking off for the models that take it (the models of the 3 and later line may refuse it: then it cannot be turned off).
    const off = await call(model, { contents: [user(text(question))], generationConfig: { maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 } } });
    lines.push(`budget 0: ${off.status === 200 ? usageOf(off) : `${off.status} ${redact(off.json?.error?.message || '').slice(0, 140)}`}`);
    const plain = await call(model, { contents: [user(text(question))], generationConfig: { maxOutputTokens: 4000 } });
    lines.push(`default: ${plain.status === 200 ? usageOf(plain) : plain.status}`);
    return report(model, check, true, lines.join('  |  '));
  }
  if (check === 'shown') {
    const question = 'Think about it first: is 391 a prime number? Answer yes or no.';
    const asked = await call(model, { contents: [user(text(question))], generationConfig: { maxOutputTokens: 4000, thinkingConfig: { includeThoughts: true } } }, { stream: true });
    const lines = asked.text.split('\n').filter((line) => line.startsWith('data:'));
    let thought = 0; let answer = 0;
    for (const line of lines) {
      try { for (const part of JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []) { if (part.thought) thought += String(part.text || '').length; else answer += String(part.text || '').length; } } catch { /* a line that is not JSON */ }
    }
    return report(model, check, asked.status === 200, `includeThoughts: ${thought} chars of summary, ${answer} chars of answer, ${lines.length} events${asked.status !== 200 ? `  ${redact(asked.text).slice(0, 200)}` : ''}`);
  }
  if (check === 'search') {
    const result = await call(model, { contents: [user(text('What is the current version of Node.js LTS? Search the web and answer in one line.'))], tools: [{ googleSearch: {} }], ...cfg({ maxOutputTokens: 1500 }) });
    const grounded = Boolean(result.json?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length);
    return report(model, check, result.status === 200 && grounded, `grounded ${grounded}  ${answerOf(result)}`);
  }
  if (check === 'maxout') {
    const result = await call(model, { contents: [user(text('Say hi.'))], generationConfig: { maxOutputTokens: 10000000 } });
    return report(model, check, true, result.status === 200 ? 'accepted a huge maxOutputTokens (the service caps it itself)' : `${result.status} ${redact(result.json?.error?.message || result.text).slice(0, 300)}`);
  }
  return report(model, check, false, 'unknown check');
};

for (const model of models) {
  console.log(`\n=== ${model}`);
  for (const check of checks) {
    try {
      await run(model, check);
    } catch (error) {
      report(model, check, false, `error: ${error.message}`);
    }
  }
}
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nThe lines are kept in ${outFile} (no key in it).`);

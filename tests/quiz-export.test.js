import assert from 'node:assert/strict';
import test from 'node:test';

import JSZip from 'jszip';
import { Window } from 'happy-dom';

import { parseQuiz } from '../src/data/quiz-schema.js';
import { resolveFileType } from '../src/app/ui/files/file-type-registry.js';
import { QUIZ_FILE_KINDS, downloadQuizFile, quizCsv, quizDescriptor, quizFileName, quizJson, quizMarkdown, quizRows, quizSheetSpec } from '../src/app/ui/quiz/quiz-export.js';
import { hydrateQuizCards, memoryStore } from '../src/app/ui/quiz/quiz-card.js';

const SOURCE = {
  title: '光合作用: 2 題/測驗',
  questions: [
    { type: 'single', question: '氧氣主要來自哪一個分子？', options: [{ text: '二氧化碳', why: '碳的來源。' }, { text: '水', why: '水被光解。' }, { text: '葡萄糖', why: '是產物。' }], answer: 1, explanation: '1941 年用重氧證明。', hint: '想想光拆開什麼。' },
    { type: 'multi', question: 'Which are gases, "really"?', options: [{ text: 'Oxygen', why: 'A gas.' }, { text: 'Iron', why: 'A metal.' }, { text: 'Nitrogen, N₂', why: 'A gas.' }], answer: [0, 2], explanation: '' }
  ]
};
const quiz = parseQuiz(JSON.stringify(SOURCE)).quiz;

test('the paper has the questions and the options in their order and no answers; the same with the answers has the answer, the reasons and what is good to know', () => {
  const paper = quizMarkdown(quiz, 'zh-TW');
  assert.match(paper, /^# 光合作用: 2 題\/測驗/);
  assert.match(paper, /姓名: _+\s+日期: _+\s+分數: _+ \/ 2/);
  assert.match(paper, /\*\*1\. 氧氣主要來自哪一個分子？\*\*/);
  assert.match(paper, /A\. 二氧化碳\n\nB\. 水\n\nC\. 葡萄糖/);
  assert.match(paper, /\*\*2\. Which are gases, "really"\?\*\* （複選，共 2 個答案）/);
  for (const secret of ['水被光解', '1941', '答案:', '是產物', '解答']) assert.equal(paper.includes(secret), false, `the paper must not show "${secret}"`);
  const key = quizMarkdown(quiz, 'zh-TW', { withAnswers: true });
  assert.match(key, /\*\*答案: B\*\*/);
  assert.match(key, /\*\*答案: A, C\*\*/);
  assert.match(key, /- A: 碳的來源。\n- B: 水被光解。\n- C: 是產物。/);
  assert.match(key, /補充說明: 1941 年用重氧證明。/);
  assert.equal(key.includes('補充說明: \n'), false, 'no empty line for a question without one');
  assert.match(quizMarkdown(quiz, 'en'), /Name: _+\s+Date: _+\s+Score: _+ \/ 2/);
  assert.match(quizMarkdown(quiz, 'en'), /\(choose 2\)/);
});

test('one row for each question, in the language of the page, with the letters of the answer; a CSV that Excel reads (quotes doubled, lines kept)', () => {
  const { header, rows } = quizRows(quiz, 'en');
  assert.deepEqual(header, ['#', 'Type', 'Question', 'A', 'B', 'C', 'Answer', 'Good to know', 'Why each option']);
  assert.deepEqual(rows[0].slice(0, 7), [1, 'Single choice', '氧氣主要來自哪一個分子？', '二氧化碳', '水', '葡萄糖', 'B']);
  assert.equal(rows[1][1], 'Multiple choice');
  assert.equal(rows[1][6], 'A, C');
  assert.equal(rows[0][8], 'A: 碳的來源。\nB: 水被光解。\nC: 是產物。');
  const csv = quizCsv(quiz, 'en');
  const lines = csv.split('\n');
  assert.equal(lines[0], '#,Type,Question,A,B,C,Answer,Good to know,Why each option');
  assert.match(csv, /"Which are gases, ""really""\?"/);
  assert.match(csv, /"Nitrogen, N₂"/);
  assert.match(csv, /"A: 碳的來源。\nB: 水被光解。\nC: 是產物。"/, 'a cell with line breaks is quoted');
  const sheet = JSON.parse(quizSheetSpec(quiz, 'zh-TW'));
  assert.equal(sheet.sheets[0].name, '題目');
  assert.equal(sheet.sheets[0].columns.length, 9);
  assert.equal(sheet.sheets[0].rows.length, 2);
  assert.equal(sheet.sheets[0].freeze, 1);
});

test('the JSON is the quiz as the model writes it: it reads back as the same quiz', () => {
  const again = parseQuiz(quizJson(quiz));
  assert.equal(again.ok, true);
  assert.deepEqual(again.quiz, quiz);
  const written = JSON.parse(quizJson(quiz));
  assert.equal(written.questions[0].answer, 1, 'one number for a single-choice question');
  assert.deepEqual(written.questions[1].answer, [0, 2]);
  assert.equal('hint' in written.questions[1], false);
});

test('the name of a file is safe and says what it is', () => {
  const paperPdf = QUIZ_FILE_KINDS.find((kind) => kind.id === 'paper-pdf');
  const keyDocx = QUIZ_FILE_KINDS.find((kind) => kind.id === 'key-docx');
  const json = QUIZ_FILE_KINDS.find((kind) => kind.id === 'quiz-json');
  assert.match(quizFileName(quiz, 'zh-TW', paperPdf), /考卷\.pdf$/);
  assert.match(quizFileName(quiz, 'en', keyDocx), /answers\.docx$/);
  assert.match(quizFileName(quiz, 'en', json), /\.json$/);
  assert.equal(/[\\/:*?"<>|]/.test(quizFileName(quiz, 'en', paperPdf)), false);
  assert.equal(quizFileName({ ...quiz, title: '' }, 'en', json), 'Quiz.json');
});

// What the generators of the page make, looked at as files.
async function downloaded(kindId, language = 'en') {
  const window = new Window({ url: 'https://example.test/' });
  const captured = [];
  window.URL.createObjectURL = (blob) => { captured.push(blob); return 'blob:test'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() { captured.push(this.download); };
  const done = await downloadQuizFile({ quiz, language, kindId, window, document: window.document });
  return { done, blob: captured.find((item) => item?.size !== undefined), fileName: captured.find((item) => typeof item === 'string') };
}

test('the files are really made by the generators of the page: Word, Excel, CSV and JSON have what they should', async () => {
  const docx = await downloaded('key-docx');
  assert.equal(docx.done.result, 'downloaded');
  assert.match(docx.fileName, /answers\.docx$/);
  const word = await JSZip.loadAsync(await docx.blob.arrayBuffer());
  const text = await word.file('word/document.xml').async('string');
  assert.match(text, /Answer: B/);
  assert.match(text, /水被光解/);

  const xlsx = await downloaded('sheet-xlsx');
  const book = await JSZip.loadAsync(await xlsx.blob.arrayBuffer());
  const strings = await book.file('xl/sharedStrings.xml').async('string');
  assert.match(strings, /Which are gases/);
  assert.match(strings, /Why each option/);

  const csv = await downloaded('sheet-csv');
  assert.match(csv.fileName, /\.csv$/);
  const csvBytes = new Uint8Array(await csv.blob.arrayBuffer());
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xEF, 0xBB, 0xBF], 'a mark that tells Excel it is UTF-8');
  assert.match(new TextDecoder().decode(csvBytes), /Why each option/);

  const json = await downloaded('quiz-json');
  assert.deepEqual(parseQuiz(await json.blob.text()).quiz, quiz);
  await assert.rejects(downloadQuizFile({ quiz, language: 'en', kindId: 'nope', window: new Window(), document: new Window().document }), /unknown file kind/);
});

test('a PDF is made by the PDF generator from the same text as the Word file (the generator itself needs a browser)', () => {
  const paper = quizDescriptor(quiz, 'en', 'paper-pdf', resolveFileType);
  assert.equal(paper.generator, 'pdf');
  assert.equal(paper.mime, 'application/pdf');
  assert.match(paper.name, /paper\.pdf$/);
  assert.equal(paper.content, quizMarkdown(quiz, 'en'));
  assert.equal(paper.content.includes('水被光解'), false, 'the paper holds no answer');
  const key = quizDescriptor(quiz, 'en', 'key-pdf', resolveFileType);
  assert.equal(key.content, quizMarkdown(quiz, 'en', { withAnswers: true }));
  assert.equal(quizDescriptor(quiz, 'en', 'sheet-xlsx', resolveFileType).generator, 'xlsx');
  assert.equal(quizDescriptor(quiz, 'en', 'sheet-csv', resolveFileType).generator, 'text');
  assert.equal(quizDescriptor(quiz, 'en', 'paper-docx', resolveFileType).generator, 'docx');
  assert.throws(() => quizDescriptor(quiz, 'en', 'nope', resolveFileType), /unknown file kind/);
});

// The menu of the card.
const click = (node) => node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const make = (download) => {
  memoryStore.clear();
  const window = new Window({ url: 'https://example.test/' });
  window.document.body.innerHTML = `<div class="quiz-card" data-quiz="${encodeURIComponent(JSON.stringify(SOURCE))}"></div>`;
  hydrateQuizCards({ root: window.document, language: 'en', download });
  return { window, card: window.document.querySelector('.quiz-card') };
};

test('the menu of the card lists the files, asks for the one chosen, tells while it is made and when it failed, and closes on Escape', async () => {
  const asked = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { window, card } = make(async (options) => { asked.push(options.kindId); await gate; return { name: 'x.docx', result: 'downloaded' }; });
  assert.equal(card.querySelector('.quiz-menu'), null);
  click(card.querySelector('[data-focus="more-tool"]'));
  const items = [...card.querySelectorAll('.quiz-menu [role="menuitem"]')];
  assert.deepEqual(items.map((item) => item.querySelector('small').textContent), ['.docx', '.pdf', '.docx', '.pdf', '.xlsx', '.csv', '.json']);
  assert.deepEqual([...card.querySelectorAll('.quiz-menu h4')].map((item) => item.firstChild.textContent.trim()), ['Paper', 'Answer key', 'Data']);
  click(items[2]);
  assert.deepEqual(asked, ['key-docx']);
  assert.equal(card.querySelector('.quiz-menu'), null, 'the menu closes');
  assert.match(card.querySelector('.quiz-toast').textContent, /Making the file/);
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(card.querySelector('.quiz-toast'), null);

  const failing = make(async () => { throw new Error('no font'); });
  click(failing.card.querySelector('[data-focus="more-tool"]'));
  click(failing.card.querySelector('.quiz-menu [role="menuitem"]'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(failing.card.querySelector('.quiz-toast').textContent, /could not be made: no font/);

  const tapped = make(async () => ({ name: 'Quiz paper.pdf', result: 'needs-tap' }));
  click(tapped.card.querySelector('[data-focus="more-tool"]'));
  click(tapped.card.querySelector('.quiz-menu [role="menuitem"]'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(tapped.card.querySelector('.quiz-toast').textContent, /Tap once more to save “Quiz paper\.pdf”/);

  // Escape closes the menu; a tap outside it closes it too.
  const closing = make();
  click(closing.card.querySelector('[data-focus="more-tool"]'));
  assert.ok(closing.card.querySelector('.quiz-menu'));
  closing.card.querySelector('[data-focus="more-tool"]').dispatchEvent(new closing.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(closing.card.querySelector('.quiz-menu'), null);
  click(closing.card.querySelector('[data-focus="more-tool"]'));
  closing.window.document.body.dispatchEvent(new closing.window.Event('pointerdown', { bubbles: true }));
  assert.equal(closing.card.querySelector('.quiz-menu'), null);
  window.close?.();
});

test('the card can be enlarged to a layer over the whole window and back; the end of the quiz has its own download button', () => {
  const { window, card } = make();
  const document = window.document;
  assert.equal(document.querySelector('.quiz-overlay'), null);
  click(card.querySelector('[data-focus="expand"]'));
  const layer = document.querySelector('.quiz-overlay');
  assert.ok(layer, 'a layer on the page, outside the chat');
  const big = layer.querySelector('.quiz-card.is-expanded');
  assert.equal(big.getAttribute('role'), 'dialog');
  assert.equal(big.getAttribute('aria-modal'), 'true');
  assert.equal(big.querySelector('.quiz-question').textContent, card.querySelector('.quiz-question').textContent, 'the same question');
  // Both show the same session: an answer given in the big card is in the small one.
  const option = [...big.querySelectorAll('[data-option]')].find((button) => button.textContent.includes('水'));
  click(option);
  click(big.querySelector('[data-focus="primary"]'));
  assert.ok(big.querySelector('.quiz-band'));
  assert.ok(card.querySelector('.quiz-band'));
  big.querySelector('[data-focus="expand"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('.quiz-overlay'), null, 'Escape closes it');
  click(card.querySelector('[data-focus="expand"]'));
  assert.ok(document.querySelector('.quiz-overlay'));
  click(document.querySelector('.quiz-overlay [data-focus="expand"]'));
  assert.equal(document.querySelector('.quiz-overlay'), null, 'the same button closes it');
  // Through the quiz to the end.
  const pick = (text) => [...card.querySelectorAll('[data-option]')].find((button) => button.textContent.includes(text));
  const primary = () => card.querySelector('[data-focus="primary"]');
  click(primary());
  click(pick('Oxygen')); click(pick('Nitrogen')); click(primary()); click(primary());
  assert.equal(card.dataset.phase, 'done');
  click(card.querySelector('[data-focus="download"]'));
  assert.ok(card.querySelector('.quiz-menu.is-dock'));
  assert.equal(card.querySelectorAll('.quiz-menu [role="menuitem"]').length, 7);
});

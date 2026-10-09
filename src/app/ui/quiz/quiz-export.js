// The files of a quiz (docs/superpowers/specs/2026-10-09-quiz-card-design.md, §7): a paper for a person to write on (questions only), the same with the answers and the reason of every option,
// a spreadsheet and a CSV (one row for each question), and the quiz itself as JSON (which can be pasted into the chat to make the card again). The page makes them from the quiz of the card,
// with the generators the files of a reply already use (ui/files), so the model is not asked and the file is the card's own content. The options are in the order the quiz gives them.
// Loaded when the first file is asked for.

import { sanitizeFileName } from '../files/file-name-policy.js';
import { quizText } from './quiz-texts.js';

const LETTERS = 'ABCDEF';
const typeKey = { single: 'quizTypeSingle', multi: 'quizTypeMulti', truefalse: 'quizTypeTrueFalse' };

/** The kinds of file the menu offers: [id, extension, which text]. */
export const QUIZ_FILE_KINDS = Object.freeze([
  { id: 'paper-docx', extension: 'docx', version: 'paper' },
  { id: 'paper-pdf', extension: 'pdf', version: 'paper' },
  { id: 'key-docx', extension: 'docx', version: 'key' },
  { id: 'key-pdf', extension: 'pdf', version: 'key' },
  { id: 'sheet-xlsx', extension: 'xlsx', version: 'sheet' },
  { id: 'sheet-csv', extension: 'csv', version: 'csv' },
  { id: 'quiz-json', extension: 'json', version: 'json' }
]);

const letters = (indexes) => indexes.map((index) => LETTERS[index]).join(', ');

/** The text of a paper (`withAnswers` false) or of the same with the answers: Markdown, which the document generators turn into Word and PDF. */
export function quizMarkdown(quiz, language, { withAnswers = false } = {}) {
  const t = (key, values) => quizText(language, key, values);
  const lines = [`# ${quiz.title || t('quizTitle')}`, ''];
  if (!withAnswers) lines.push(`${t('quizPaperName')}: ________________    ${t('quizPaperDate')}: ____________    ${t('quizPaperScore')}: ______ / ${quiz.questions.length}`, '');
  else lines.push(`${t('quizKeyTitle')} · ${t('quizPaperScore')}: ______ / ${quiz.questions.length}`, '');
  quiz.questions.forEach((question, number) => {
    const tag = question.type === 'multi' ? ` ${t('quizMultiTag', { count: question.answer.length })}` : '';
    lines.push(`**${number + 1}. ${question.question}**${tag}`, '');
    question.options.forEach((option, index) => lines.push(`${LETTERS[index]}. ${option.text}`, ''));
    if (withAnswers) {
      lines.push(`**${t('quizAnswerWord')}: ${letters(question.answer)}**`, '');
      const notes = question.options.filter((option) => option.why);
      if (notes.length) {
        notes.forEach((option) => lines.push(`- ${LETTERS[question.options.indexOf(option)]}: ${option.why}`));
        lines.push('');
      }
      if (question.explanation) lines.push(`${t('quizExtra')}: ${question.explanation}`, '');
    }
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

/** One row for each question: the number, the kind, the question, the options, the answer, what is good to know, and the reason of each option. */
export function quizRows(quiz, language) {
  const t = (key) => quizText(language, key);
  const width = Math.max(...quiz.questions.map((question) => question.options.length));
  const header = ['#', t('quizColumnType'), t('quizColumnQuestion'), ...Array.from({ length: width }, (_, index) => LETTERS[index]), t('quizAnswerWord'), t('quizExtra'), t('quizColumnWhy')];
  const rows = quiz.questions.map((question, number) => [
    number + 1,
    t(typeKey[question.type]),
    question.question,
    ...Array.from({ length: width }, (_, index) => question.options[index]?.text || ''),
    letters(question.answer),
    question.explanation,
    question.options.map((option, index) => (option.why ? `${LETTERS[index]}: ${option.why}` : '')).filter(Boolean).join('\n')
  ]);
  return { header, rows };
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function quizCsv(quiz, language) {
  const { header, rows } = quizRows(quiz, language);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

/** The spreadsheet in the form the spreadsheet generator reads (JSON of sheets). */
export function quizSheetSpec(quiz, language) {
  const { header, rows } = quizRows(quiz, language);
  return JSON.stringify({ sheets: [{ name: quizText(language, 'quizSheetName'), columns: header, rows, freeze: 1, autoFilter: true }] });
}

/** The quiz as it is written in a ```quiz block, so it can be pasted into a chat again. */
export function quizJson(quiz) {
  return `${JSON.stringify({
    title: quiz.title,
    questions: quiz.questions.map((question) => ({
      type: question.type,
      question: question.question,
      options: question.options.map((option) => ({ text: option.text, why: option.why })),
      answer: question.type === 'multi' ? question.answer : question.answer[0],
      explanation: question.explanation,
      ...(question.hint ? { hint: question.hint } : {})
    }))
  }, null, 2)}\n`;
}

/** The name of a file: the title of the quiz, what the version is, the extension. */
export function quizFileName(quiz, language, kind) {
  const suffix = { paper: quizText(language, 'quizFilePaper'), key: quizText(language, 'quizFileKey'), sheet: '', csv: '', json: '' }[kind.version];
  const base = `${quiz.title || quizText(language, 'quizTitle')}${suffix ? ` ${suffix}` : ''}`;
  return sanitizeFileName(`${base}.${kind.extension}`, { fallbackBaseName: 'quiz' });
}

/** What the file generators are given for a kind of file: the type from the name, and the content. */
export function quizDescriptor(quiz, language, kindId, resolveFileType) {
  const kind = QUIZ_FILE_KINDS.find((item) => item.id === kindId);
  if (!kind) throw new Error('unknown file kind');
  const name = quizFileName(quiz, language, kind);
  return descriptorFor(quiz, language, kind, name, resolveFileType);
}

function descriptorFor(quiz, language, kind, name, resolveFileType) {
  const content = {
    paper: () => quizMarkdown(quiz, language),
    key: () => quizMarkdown(quiz, language, { withAnswers: true }),
    sheet: () => quizSheetSpec(quiz, language),
    csv: () => quizCsv(quiz, language),
    json: () => quizJson(quiz)
  }[kind.version]();
  return { ...resolveFileType(name), id: `quiz-${kind.id}`, name, content };
}

/**
 * Makes one of the files and hands it to the person (a download, or the share sheet on a phone that needs it). Returns the result of `deliverFile`.
 * The generators and the delivery are loaded here, so a page that never asks for a file never loads them.
 */
export async function downloadQuizFile({ quiz, language, kindId, window, document }) {
  const kind = QUIZ_FILE_KINDS.find((item) => item.id === kindId);
  if (!kind) throw new Error('unknown file kind');
  const [{ generateFileBlob }, { resolveFileType }, { deliverFile }] = await Promise.all([
    import('../files/file-generators.js'),
    import('../files/file-type-registry.js'),
    import('../files/file-card-interactions.js')
  ]);
  const name = quizFileName(quiz, language, kind);
  const descriptor = descriptorFor(quiz, language, kind, name, resolveFileType);
  const blob = await generateFileBlob(descriptor, { language, document, window });
  return { name, result: await deliverFile({ window, document, blob, fileName: name }) };
}

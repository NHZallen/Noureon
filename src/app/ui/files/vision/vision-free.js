// The visual check of a deck Python drew freely (B5): what the model is asked,
// what it is asked to do about the problems, and the message that reports it.
// Decks from the design system keep their own check (vision-prompt.js).

import { visionText, VISION_TEXTS } from './vision-texts.js';

const LANGUAGE_NAMES = Object.freeze({ 'zh-TW': 'Traditional Chinese (Taiwan)', en: 'English', fr: 'French', ru: 'Russian', es: 'Spanish' });
const escapeMarkdown = (value) => String(value || '').replace(/[\\`*_{}[\]()#+.!|>~-]/g, '\\$&').replace(/\r?\n/g, ' ');

/** The text on each rendered slide, one line per slide, for the model. */
export function slideOutline(layout, limit = 24) {
  return layout.slides.slice(0, limit).map((slide) => {
    const words = slide.elements
      .filter((element) => element.type === 'text')
      .map((element) => element.paragraphs.map((paragraph) => paragraph.lines.map((line) => line.runs.map((run) => run.text).join('')).join(' ')).join(' / '))
      .filter(Boolean)
      .join(' | ');
    return `Slide ${slide.number}: ${words.slice(0, 300) || '(no text)'}`;
  }).join('\n');
}

export function buildFreeVisionPrompt({ file, layout, uiLanguage = 'zh-TW', checkedSlides = 24 }) {
  return `You are reviewing the rendered slides of a presentation ("${file.name}") that was made with Python code, for visual problems.

## Text on each slide
${slideOutline(layout, checkedSlides)}

## Images
The following contact sheets each show four slides, labelled with their slide numbers. They are drawn by an approximate preview, not by PowerPoint itself: ignore small differences in fonts, gradients, shadows and chart details. Only report what would look wrong in PowerPoint too.

## What to look for
Text that overflows its box, runs off the slide or overlaps other elements; text that is too small to read or too crowded; low contrast; unbalanced or empty layouts; awkward title breaks; misaligned or unevenly spaced elements; images stretched or badly cropped; charts with unreadable labels; inconsistent styling between similar slides. Report at most 10 problems, the most important first. Do not comment on content, wording or facts.

## Answer
JSON only:
{"issues":[{"slide":N,"category":"text|layout|image|chart|consistency","problem":"…","fix":"what to change in the code"}],"summary":"one or two sentences"}
Write problem, fix and summary in ${LANGUAGE_NAMES[uiLanguage] || LANGUAGE_NAMES.en}. Return {"issues":[],"summary":""} when nothing needs fixing.`;
}

/** The turn that asks the model to redo the file (sent with the contact sheets). */
export function buildFixRequest({ issues, file, uiLanguage = 'zh-TW' }) {
  const list = issues.map((issue) => `- Slide ${issue.slide} (${issue.category}): ${issue.problem} Suggested change: ${issue.fix}`).join('\n');
  return `A visual review of "${file.name}" found these problems (the images show how the slides looked):
${list}

Fix them now with run_python: change your code (or open /input/${file.name} with python-pptx) and save the corrected deck to /output/${file.name}, the same file name. Keep the content, facts and language, and leave everything that is not listed as it is. Then tell the user in one or two sentences, in ${LANGUAGE_NAMES[uiLanguage] || LANGUAGE_NAMES.en}, what you changed. Do not start a new topic.`;
}

/** The visible text of the reply that reports the check and carries the redone deck. */
export function buildFreeVisionResult({ result, language, checkedSlides, totalSlides, answer }) {
  const labels = VISION_TEXTS[language] || VISION_TEXTS.en;
  const lines = result.issues.map((issue) => {
    const page = visionText(language, 'slide', { number: issue.slide });
    const category = labels.categories[issue.category] || issue.category;
    const lead = language === 'zh-TW' ? `${page}（${category}）：` : `${page} (${category}): `;
    return `- ${lead}${escapeMarkdown(issue.problem)} → ${escapeMarkdown(issue.fix)}`;
  });
  const partial = checkedSlides < totalSlides ? `\n\n${visionText(language, 'partial', { count: checkedSlides })}` : '';
  const summary = result.summary ? `\n\n${escapeMarkdown(result.summary)}` : '';
  const reply = String(answer || '').trim();
  return `${visionText(language, 'freeHeading', { found: result.issues.length })}\n\n${lines.join('\n')}${summary}${partial}${reply ? `\n\n${reply}` : ''}`;
}

export function buildFreeVisionMetadata({ file, model, result, checkedSlides, totalSlides }) {
  return { sourceFileId: file.id, sourceFileName: file.name, model: model.name || model.id, issues: result.issues, applied: 0, skipped: [], free: true, checkedSlides, totalSlides };
}

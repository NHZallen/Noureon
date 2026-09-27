import { serializeDeckSpec } from '../design/spec-serializer.js';
import { VISION_TEXTS, visionText } from './vision-texts.js';

const escapeMarkdown = value => String(value || '').replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&').replace(/\r?\n/g, ' ');

export function buildVisionResult({ result, edits, renderedSlides, file, language, checkedSlides, totalSlides }) {
  const labels = VISION_TEXTS[language] || VISION_TEXTS.en;
  const fixedBySpec = new Set(edits.applied.map(({ edit }) => edit.specSlide));
  const globalFix = edits.applied.some(({ edit }) => edit.op === 'setDesign');
  const isFixed = issue => globalFix || fixedBySpec.has((renderedSlides[issue.slide - 1]?.sourceIndex ?? -1) + 1);
  const lines = result.issues.map(issue => {
    const fixed = isFixed(issue);
    const page = visionText(language, 'slide', { number: issue.slide });
    const category = labels.categories[issue.category] || issue.category;
    const lead = language === 'zh-TW' ? `${page}（${category}）：` : `${page} (${category}): `;
    return `- ${lead}${escapeMarkdown(issue.problem)}${fixed ? ` → ${escapeMarkdown(issue.fix)}` : ` ${labels.notFixed}`}`;
  });
  const fixed = result.issues.filter(isFixed).length;
  const heading = visionText(language, 'heading', { found: result.issues.length, fixed });
  const partial = checkedSlides < totalSlides ? `\n\n${visionText(language, 'partial', { count: checkedSlides })}` : '';
  return `${heading}\n\n${lines.join('\n')}${result.summary ? `\n\n${escapeMarkdown(result.summary)}` : ''}${partial}\n\n\`\`\`\`file ${file.name}\n${serializeDeckSpec(edits.spec)}\n\`\`\`\``;
}

export function buildVisionMetadata({ file, model, result, edits, checkedSlides, totalSlides }) {
  return { sourceFileId: file.id, sourceFileName: file.name, model: model.name || model.id,
    issues: result.issues, applied: edits.applied.length, skipped: edits.skipped, checkedSlides, totalSlides };
}

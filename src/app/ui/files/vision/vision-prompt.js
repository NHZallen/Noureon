import { parseRelaxedJson } from '../design/relaxed-json.js';

const LANGUAGE_NAMES = Object.freeze({ 'zh-TW': 'Traditional Chinese (Taiwan)', en: 'English', fr: 'French', ru: 'Russian', es: 'Spanish' });
const CATEGORIES = new Set(['text', 'layout', 'image', 'chart', 'consistency']);
const trimStrings = value => typeof value === 'string' ? value.slice(0, 300)
  : Array.isArray(value) ? value.map(trimStrings)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, trimStrings(part)])) : value;

export function buildVisionPrompt(spec, layout, { uiLanguage = 'zh-TW', deckDesign = 'auto', checkedSlides = 24 } = {}) {
  const slides = layout.slides.slice(0, checkedSlides).map(slide =>
    `Rendered slide ${slide.number} comes from spec slide ${slide.sourceIndex + 1}: ${JSON.stringify(trimStrings(spec.slides[slide.sourceIndex]))}`
  ).join('\n');
  const checks = (layout.issues || []).map(issue => JSON.stringify(issue)).join('\n') || 'None.';
  return `You are reviewing the rendered slides of a presentation for visual problems. You do not rewrite it.

## Deck
Title: ${spec.meta.title}; document language: ${spec.meta.language}; rendered slide count: ${layout.slides.length}; design mode: ${deckDesign === 'auto' ? 'AI adaptive' : `template "${deckDesign}"`}.

## Slide specification (numbered as rendered)
${slides}

## Automatic checks already run
${checks}

## Images
The following contact sheets each show four slides, labelled with their rendered slide numbers.

## What to look for
Awkward title breaks or a last line with one or two characters; text that is too small or crowded; unbalanced or crowded layouts; elements that look overlapped; badly cropped photos; unreadable charts; slides that should be split; inconsistent treatment of similar slides. Ignore image placeholders' grey frames and anything that looks fine.

## Rules for fixes
- Keep meaning, facts, numbers and language. Shorten wording instead of removing points.
- Use only the operations below, at most 20. specSlide is the ORIGINAL spec slide number, never the rendered slide number.
- setText: {"op":"setText","specSlide":M,"field":"title|subtitle|kicker|body|callout|takeaway|caption|quote|attribution|role|label|value|change|contact","value":"..."}
- setItemText: {"op":"setItemText","specSlide":M,"list":"bullets|items|cards|stats|steps|columns|images","item":0,"field":"text|title|body|label|value|note|heading|caption","value":"..."}; item is zero based.
- setLayout: {"op":"setLayout","specSlide":M,"layout":"one of the 17 existing layouts"}.
- splitSlide: {"op":"splitSlide","specSlide":M,"at":3}; only for list slides.
- setImage: {"op":"setImage","specSlide":M,"fit":"cover|contain","focus":"top|bottom|left|right|center"}; optional list:"images", item:0 for a gallery.
${deckDesign === 'auto' ? '- setDesign: {"op":"setDesign","key":"density|titleSize|typeScale","value":"valid design value"}; no other design parameters.' : '- Template mode: design parameters must not change.'}

## Answer
JSON only:
{"issues":[{"slide":N,"category":"text|layout|image|chart|consistency","problem":"…","fix":"…"}],"edits":[…operations…],"summary":"one or two sentences"}
Write problem, fix and summary in ${LANGUAGE_NAMES[uiLanguage] || LANGUAGE_NAMES.en}. Return {"issues":[],"edits":[],"summary":""} when nothing needs fixing.`;
}

export function parseVisionResponse(response, { requireEdits = true } = {}) {
  let source = String(response || '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(source);
  if (fenced) source = fenced[1];
  if (!source.startsWith('{')) source = source.slice(source.indexOf('{'));
  if (!source) throw new Error('invalid vision response');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === '\\') { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) { source = source.slice(0, index + 1); break; }
  }
  const { value } = parseRelaxedJson(source);
  if (!value || typeof value !== 'object' || !Array.isArray(value.issues) || (requireEdits && !Array.isArray(value.edits))) throw new Error('invalid vision response');
  const issues = value.issues.filter(issue => Number.isInteger(issue?.slide) && issue.slide > 0
    && CATEGORIES.has(issue.category) && typeof issue.problem === 'string' && typeof issue.fix === 'string');
  return { issues, edits: Array.isArray(value.edits) ? value.edits : [], summary: typeof value.summary === 'string' ? value.summary.slice(0, 1000) : '' };
}

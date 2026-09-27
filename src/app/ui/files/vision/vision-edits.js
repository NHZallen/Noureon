import { normalizeDocumentSpec, SLIDE_LAYOUTS, SPEC_LIMITS } from '../design/document-spec.js';
import { DESIGN_PARAMS } from '../design/design-params.js';
import { generatedText } from '../design/language.js';
import { serializeDeckSpec } from '../design/spec-serializer.js';

const TEXT_FIELDS = new Set(['title', 'subtitle', 'kicker', 'body', 'callout', 'takeaway', 'caption', 'quote', 'attribution', 'role', 'label', 'value', 'change', 'contact']);
const ITEM_FIELDS = Object.freeze({
  bullets: ['text'], items: ['text', 'title', 'description'], cards: ['title', 'body', 'label'],
  stats: ['value', 'label', 'note'], steps: ['title', 'body', 'label'],
  columns: ['heading', 'body'], images: ['caption']
});
const SPLIT_LISTS = Object.freeze({ bullets: 'bullets', agenda: 'items', cards: 'cards', stats: 'stats', timeline: 'steps', closing: 'bullets', table: 'rows' });
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const validText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;
const fieldLimit = field => field === 'title' ? SPEC_LIMITS.title : field === 'kicker' ? SPEC_LIMITS.kicker
  : field === 'value' ? 40 : field === 'change' ? 60 : ['label', 'heading', 'caption', 'note'].includes(field) ? 200 : SPEC_LIMITS.text;

function applyOne(spec, edit) {
  if (!isObject(edit) || typeof edit.op !== 'string') return false;
  if (edit.op === 'setDesign') {
    if (spec.preset || !['density', 'titleSize', 'typeScale'].includes(edit.key)) return false;
    const param = DESIGN_PARAMS.find(entry => entry.key === edit.key);
    if (!param || (param.type === 'enum' && !param.values.includes(edit.value))
      || (param.type === 'number' && (typeof edit.value !== 'number' || edit.value < param.min || edit.value > param.max))) return false;
    spec.design[edit.key] = edit.value;
    return true;
  }
  if (!Number.isInteger(edit.specSlide)) return false;
  const index = spec.slides.findIndex(slide => slide.sourceIndex === edit.specSlide - 1);
  if (index < 0) return false;
  const slide = spec.slides[index];
  if (edit.op === 'setText') {
    if (!TEXT_FIELDS.has(edit.field) || !Object.hasOwn(slide, edit.field) || !validText(edit.value, fieldLimit(edit.field))) return false;
    slide[edit.field] = edit.value.trim();
    return true;
  }
  if (edit.op === 'setItemText') {
    if (!Object.hasOwn(ITEM_FIELDS, edit.list) || !ITEM_FIELDS[edit.list].includes(edit.field)
      || !Number.isInteger(edit.item) || edit.item < 0) return false;
    const item = slide[edit.list]?.[edit.item];
    const field = edit.list === 'items' && edit.field === 'text' ? 'title' : edit.field;
    if (!isObject(item) || !Object.hasOwn(item, field) || !validText(edit.value, fieldLimit(field))) return false;
    item[field] = edit.value.trim();
    return true;
  }
  if (edit.op === 'setLayout') {
    if (!SLIDE_LAYOUTS.includes(edit.layout) || edit.layout === slide.layout) return false;
    const raw = JSON.parse(serializeDeckSpec({ ...spec, slides: [{ ...slide, layout: edit.layout }] }));
    const trial = normalizeDocumentSpec(raw, { uiLanguage: spec.meta.language });
    if (trial.slides.length !== 1 || trial.slides[0].layout !== edit.layout) return false;
    // Reject changes that discard existing text fields or items.
    const oldValues = Object.entries(slide).filter(([key, value]) => !['layout', 'background', 'trend', 'sourceIndex'].includes(key) && value != null);
    if (oldValues.some(([key, value]) => value && JSON.stringify(trial.slides[0][key]) !== JSON.stringify(value))) return false;
    slide.layout = edit.layout;
    return true;
  }
  if (edit.op === 'splitSlide') {
    const list = SPLIT_LISTS[slide.layout];
    const items = list === 'rows' ? slide.table?.rows : slide[list];
    if (!Array.isArray(items) || !Number.isInteger(edit.at) || edit.at < 1 || edit.at >= items.length
      || spec.slides.length >= SPEC_LIMITS.slides) return false;
    const next = structuredClone(slide);
    if (list === 'rows') {
      slide.table.rows = items.slice(0, edit.at);
      next.table.rows = items.slice(edit.at);
      slide.table.highlightRow = slide.table.highlightRow > edit.at ? null : slide.table.highlightRow;
      next.table.highlightRow = next.table.highlightRow > edit.at ? next.table.highlightRow - edit.at : null;
    } else {
      slide[list] = items.slice(0, edit.at);
      next[list] = items.slice(edit.at);
    }
    next.title = next.title ? `${next.title}${generatedText(spec.meta.language, 'continued')}` : '';
    next.notes = '';
    spec.slides.splice(index + 1, 0, next);
    return true;
  }
  if (edit.op === 'setImage') {
    const target = edit.list === 'images' && Number.isInteger(edit.item)
      ? slide.images?.[edit.item]?.image : edit.list == null ? slide.image : null;
    if (!target || (edit.fit != null && !['cover', 'contain'].includes(edit.fit))
      || (edit.focus != null && !['top', 'bottom', 'left', 'right', 'center'].includes(edit.focus))
      || (edit.fit == null && edit.focus == null)) return false;
    if (edit.fit) target.fit = edit.fit;
    if (edit.focus) target.focus = edit.focus;
    return true;
  }
  return false;
}

export function applyVisionEdits(original, edits = []) {
  const spec = structuredClone(original);
  spec.slides.forEach((slide, index) => { slide.sourceIndex = index; });
  const applied = [];
  const skipped = [];
  if (!Array.isArray(edits)) return { spec, applied, skipped: [{ reason: 'invalid-edits' }] };
  edits.forEach((edit, index) => {
    if (index >= 20) { skipped.push({ index, edit, reason: 'limit' }); return; }
    const snapshot = structuredClone(spec);
    try {
      if (applyOne(spec, edit)) applied.push({ index, edit });
      else skipped.push({ index, edit, reason: 'invalid' });
    } catch {
      Object.assign(spec, snapshot);
      skipped.push({ index, edit, reason: 'error' });
    }
  });
  return { spec: normalizeDocumentSpec(JSON.parse(serializeDeckSpec(spec)), { uiLanguage: spec.meta.language }), applied, skipped };
}

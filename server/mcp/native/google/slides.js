// Google Slides (https://developers.google.com/slides/api/reference/rest): reading the text of a presentation, making one, adding a slide, replacing text.

import { boolArg, enumArg, fit, idArg, idPart, textArg } from '../inputs.js';

const BASE = 'https://slides.googleapis.com/v1/presentations';
const link = (id) => `https://docs.google.com/presentation/d/${id}/edit`;

const runs = (text) => (text?.textElements || []).map((element) => element.textRun?.content || '').join('').replace(/\s+$/, '');

// The words on a slide: its text boxes, the cells of its tables and what is grouped in them.
function elementTexts(elements, out = []) {
  for (const element of elements || []) {
    if (element.shape?.text) {
      const text = runs(element.shape.text);
      if (text) out.push(text);
    } else if (element.table) {
      for (const row of element.table.tableRows || []) out.push((row.tableCells || []).map((cell) => runs(cell.text).replace(/\s+/g, ' ')).join('\t'));
    } else if (element.elementGroup) elementTexts(element.elementGroup.children, out);
  }
  return out;
}

const batch = (id, requests, call) => call('POST', `${BASE}/${idPart(id)}:batchUpdate`, { json: { requests } });
const LAYOUTS = ['TITLE_AND_BODY', 'TITLE_ONLY', 'BLANK'];

export const slidesTools = [
  {
    name: 'slides_get_presentation',
    description: 'Read the text of a Google Slides presentation, slide by slide (the title, the text boxes, the tables; not the pictures).',
    inputSchema: { type: 'object', properties: { presentation_id: { type: 'string', description: 'The id in the address: docs.google.com/presentation/d/<id>/edit' } }, required: ['presentation_id'] },
    async run(args, call) {
      const data = await call('GET', `${BASE}/${idPart(idArg(args, 'presentation_id'))}`);
      return fit({
        id: data.presentationId,
        title: data.title || '',
        link: link(data.presentationId),
        slides: (data.slides || []).map((slide, index) => ({ number: index + 1, slide_id: slide.objectId, text: elementTexts(slide.pageElements) }))
      }, 60_000);
    }
  },
  {
    name: 'slides_create_presentation',
    description: 'Create a new, empty Google Slides presentation in the user\'s Drive (it starts with one title slide). Add slides with slides_add_slide.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    async run(args, call) {
      const data = await call('POST', BASE, { json: { title: textArg(args, 'title', { required: true, max: 300 }) } });
      return { id: data.presentationId, title: data.title || '', link: link(data.presentationId), slide_ids: (data.slides || []).map((slide) => slide.objectId) };
    }
  },
  {
    name: 'slides_add_slide',
    description: 'Add a slide at the end of a presentation, with a title and a body text (the lines of the body are the points) in the layout chosen.',
    inputSchema: {
      type: 'object',
      properties: {
        presentation_id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string', description: 'The text under the title; one point to a line.' },
        layout: { type: 'string', enum: LAYOUTS, description: 'Default TITLE_AND_BODY. TITLE_ONLY has no body; BLANK has neither.' }
      },
      required: ['presentation_id']
    },
    async run(args, call) {
      const id = idArg(args, 'presentation_id');
      const layout = enumArg(args, 'layout', LAYOUTS, 'TITLE_AND_BODY');
      const title = textArg(args, 'title', { max: 500 });
      const body = textArg(args, 'body', { max: 20_000 });
      const suffix = Math.random().toString(36).slice(2, 10);
      const titleId = `title_${suffix}`;
      const bodyId = `body_${suffix}`;
      const hasTitle = layout !== 'BLANK';
      const hasBody = layout === 'TITLE_AND_BODY';
      const mappings = [
        ...(hasTitle ? [{ layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: titleId }] : []),
        ...(hasBody ? [{ layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyId }] : [])
      ];
      const slideId = `slide_${suffix}`;
      const requests = [{ createSlide: { objectId: slideId, slideLayoutReference: { predefinedLayout: layout }, ...(mappings.length ? { placeholderIdMappings: mappings } : {}) } }];
      if (title && hasTitle) requests.push({ insertText: { objectId: titleId, text: title } });
      if (body && hasBody) requests.push({ insertText: { objectId: bodyId, text: body } });
      await batch(id, requests, call);
      return { slide_id: slideId, link: link(id) };
    }
  },
  {
    name: 'slides_replace_text',
    description: 'Replace every place a text is found in the slides of a presentation with another text.',
    inputSchema: { type: 'object', properties: { presentation_id: { type: 'string' }, find: { type: 'string' }, replace_with: { type: 'string' }, match_case: { type: 'boolean' } }, required: ['presentation_id', 'find', 'replace_with'] },
    async run(args, call) {
      const data = await batch(idArg(args, 'presentation_id'), [{ replaceAllText: { containsText: { text: textArg(args, 'find', { required: true, max: 1000 }), matchCase: boolArg(args, 'match_case') }, replaceText: textArg(args, 'replace_with', { max: 20_000 }) } }], call);
      return { places_changed: data?.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0 };
    }
  }
];

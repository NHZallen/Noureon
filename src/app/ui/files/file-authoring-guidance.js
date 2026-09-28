import { describeDesignParameters } from './design/design-params.js';
import { DESIGN_PRESET_IDS, getPresetText } from './design/design-presets.js';
import { describeDocumentDesignParameters } from './design/document-design.js';
import { DOCUMENT_PRESET_IDS, getDocumentPresetText } from './design/document-presets.js';
import { isGeneratorAvailable } from './file-type-registry.js';

// Loaded on demand from stream-api-call.js. Keep the wording imperative and
// compact: this text is sent with every request that looks file-related.

const GENERAL_GUIDANCE = `# Downloadable file output

This app turns a special fenced block into a real downloadable file with a download button. You CAN deliver files this way, so never say you are unable to create or attach files.
Use a file block only when the user asks for a file, a download or an export, or names a file format. Otherwise answer normally.

Format: the opening line is four backticks, the word file, a space and the file name with its extension. The closing line is exactly four backticks on a line of its own, never three.
\`\`\`\`file descriptive-name.ext
(complete file content)
\`\`\`\`

Rules:
- The extension decides the file type. Give the file a descriptive name in the user's language, without folders.
- Output one block per file. For several files, output several blocks; the app offers a combined ZIP download. Never output ZIP, binary or base64 data.
- Put only the file content inside the block. Never wrap the block in another code fence, and do not repeat the content outside it.
- The block itself is the download link. Never write links to sandbox:, /mnt/data, file:// or attachment paths, and never ask the user to copy the text into a file themselves.
- Write one short sentence before the block and, when useful, a brief summary of the file after it.
- When revising a file the user already received, output the complete updated file again under the same name.
- Keep the file short enough to finish in this reply; never stop in the middle of a file.
- Executables, installers, shortcuts, macro-enabled Office files and archives cannot be produced.`;

const TEXT_GUIDANCE = `## Text and code files
Supported: .txt .md .csv .tsv .json .xml .yaml .html .css .svg .ics .vcf .srt .vtt .sql and source files such as .py .js .ts .java .c .cpp .cs .go .rs .rb .php .sh.
Write the exact file content.
- .csv: header row first, comma separated; quote fields that contain commas, quotes or line breaks; plain numbers without thousands separators.
- .ics: BEGIN:VCALENDAR, VERSION:2.0, PRODID, one VEVENT per event with UID, DTSTAMP, DTSTART and DTEND (UTC with Z, or with TZID).
- .json: valid JSON only, no comments.`;

const DOCX_GUIDANCE = `## Word documents (.docx)
Write the body as GitHub Markdown; the app converts it into a styled Word document. Optional front matter at the very top:
---
title: Document title
subtitle: Optional subtitle
author: Optional author
date: 2026-01-31
toc: true
orientation: portrait
pageSize: A4
header: Optional running header text
footer: Optional running footer text
---
- Structure with headings: ## for sections, ### for subsections. A single leading # heading becomes the title when front matter has none.
- Supported: paragraphs, **bold**, *italic*, ~~strike~~, \`code\`, links, bullet, numbered and task lists (nested), tables with column alignment, fenced code blocks, > quotes, --- dividers.
- Math: $inline$ and $$display$$ LaTeX become native, editable Word equations.
- Charts: a \`\`\`chart block inside the document becomes a figure.
- A line containing only \\pagebreak starts a new page. toc: true adds a linked table of contents.
- orientation: portrait or landscape. pageSize: A4, Letter, Legal, A3, A5 or B5.
- Images from the internet cannot be embedded; describe them in text instead.
- Write complete, final content. Never leave placeholders such as "[insert here]".`;

const PPTX_GUIDANCE = `## PowerPoint presentations (.pptx)
Write a JSON deck spec; the app lays it out on 16:9 slides with a professional design, native editable text, charts and tables, embedded fonts and speaker notes. Never write slide coordinates, colours or font sizes per slide.
Name the file .pptx, never .json: \`\`\`\`file launch-plan.pptx. The JSON goes directly inside the block, without a \`\`\`json fence.
{
  "title": "Deck title", "author": "Optional", "date": "Optional", "footer": "Optional",
  "design": { see "Design" below },
  "slides": [
    { "layout": "cover", "title": "…", "subtitle": "…", "kicker": "…" },
    { "layout": "bullets", "title": "…", "bullets": ["…", { "text": "…", "children": ["…"] }], "callout": "…", "notes": "What the speaker says" }
  ]
}
Layouts and their fields (every slide may also have "title", "kicker", "notes", "source"):
- cover: subtitle, image · agenda: items [] · section: subtitle, number · closing: subtitle, bullets [], contact
- bullets: bullets [], body, callout · split: bullets [] or body, image, imageSide ("left"/"right") · image: image, caption
- twoColumn / comparison: columns [{ heading, items [], body, highlight: true }] (comparison: 2–3 columns)
- cards: cards [{ icon, label, title, body }] (2–4) · stats: stats [{ value, label, change, note, icon }] (2–4) · bigNumber: value, label, body, change
- timeline: steps [{ label, title, body, icon }] (2–6) · quote: quote, attribution, role, image · gallery: images [{ image, caption }]
- table: table { columns [], rows [[]], align ["left","right"…], highlightRow } · chart: chart (same schema as a \`\`\`chart block), takeaway
Rules:
- One idea per slide. Titles state the takeaway in at most two lines; bullets are short phrases, about 3–6 per slide. Longer lists continue onto a new slide automatically.
- Use **bold** inside text for the key words to emphasise; no other Markdown inside strings.
- Icons: package, globe, gauge, chart-bar, chart-line, trending-up, trending-down, users, user, target, rocket, lightbulb, shield, lock, clock, calendar, check, star, heart, leaf, building, map-pin, mail, settings, cpu, database, cloud, code, book, coins, handshake, sparkles.
- Images: "upload:1" is the first image the user attached to this conversation, "upload:2" the second. For any other picture write { "placeholder": "what the photo should show" }; the user replaces it in PowerPoint. Never use web URLs.
- Put what the presenter should say in "notes". Write every text in the language the user writes in.
- Output valid JSON. If you cannot, write Markdown instead: # Deck title, ## one slide each, - bullets, tables, \`\`\`chart blocks, > quotes, ![alt](upload:1), and a paragraph starting "Notes:" for speaker notes.`;

// What each design parameter does, for a model choosing them itself.
const DESIGN_PARAMETER_NOTES = `Meaning:
- mode: light or dark slides. background: neutral white/black, warm paper, cool grey, tinted with the accent, or the accent itself as the slide colour. accent: main colour; accent2: optional second colour (null derives one). colorUse: how much colour appears.
- fonts: modern (Inter), tight (Inter Tight, mono labels), geometric (Manrope), condensed (Oswald headings), editorial (Playfair Display), modernSerif (Instrument Serif), consulting (Source Serif + Source Sans), classical (Cormorant Garamond), kai (handwritten Chinese), rounded (Nunito), plex (IBM Plex), book (Source Serif throughout), garamond (Cormorant Garamond headings, serif body), office (Aptos/Calibri, no embedded fonts: only for files that must be edited anywhere).
- headingWeight, headingCase (upper = all caps for Latin and Cyrillic), tracking, typeScale (ratio between sizes), titleSize, density (whitespace), align (titles left or centred).
- cover: type, split (colour panel and image), bleed (full-slide image), band, frame. section: number (big numeral), field (full colour slide), split, rule.
- imageShape: bleed, inset, rounded, arch, circle. motifs (up to two): rules, meta (corner labels), grid, shapes, glow, frame, blob.
- labels (kicker style), numbers, bullets, cards, radius (points), icons (none, line, badge), chart (accent shades, duo = one highlight and grey, categorical), imagery (how many image frames).
Text colours are adjusted automatically to meet contrast, so any accent works.`;

/**
 * The design part of the presentation guidance. `deckDesign` is what the
 * user chose in the composer before asking: a preset id, or "auto" (the
 * default) for AI-adaptive design, where the model sets every parameter.
 */
function presentationDesignGuidance(deckDesign) {
  if (DESIGN_PRESET_IDS.includes(deckDesign)) {
    return `Design: the user chose the "${deckDesign}" template (${getPresetText(deckDesign, 'en').feature}). Write "design": { "preset": "${deckDesign}" } with no other design keys, even if earlier files in this conversation used another design: the app applies the template as designed. Only when the user's latest message asks for different colours, add "accent" (and "accent2") as "#RRGGBB". Other design changes (fonts, dark or light, layout, decoration) are not possible with a template: say so briefly and suggest switching "Design" to AI adaptive.`;
  }
  return [
    'Design (AI adaptive, the user\'s choice): set every design parameter yourself for this content, audience and purpose, and write the complete "design" object with all of these keys. Presets are only starting points; combine and change freely. Follow any style the user asks for (colours, dark or light, formal or playful).',
    describeDesignParameters(),
    DESIGN_PARAMETER_NOTES,
    `Presets for reference (you may add "preset" as a base and override keys): ${DESIGN_PRESET_IDS.join(', ')}.`
  ].join('\n');
}

const DOCUMENT_DESIGN_NOTES = `Meaning:
- accent, accent2: colours as "#RRGGBB"; text colours are adjusted for contrast automatically. headingColor: accent or text (black).
- fonts: modern (Inter), tight (Inter Tight), geometric (Manrope), book (Source Serif body and headings), garamond (Cormorant Garamond headings, serif body), consulting (Source Serif + Source Sans), editorial (Playfair Display headings), classical, kai (handwritten Chinese), rounded (Nunito), plex (IBM Plex), office (Aptos/Calibri, no embedded fonts: only when the file must be edited on any computer).
- headingWeight, headingCase (upper or smallcaps for Latin and Cyrillic), tracking (letter spacing of titles), typeScale (ratio between heading sizes; 1 keeps every heading at body size, as APA does).
- headings: plain, rule (line under section headings), bar (colour bar beside them), shaded (section headings on a colour band), centered (APA: centred section headings).
- cover: none (title at the top of page 1), block (title block with a vertical rule), page (typographic cover page), band (colour band cover), shapes (geometric colour blocks), title (APA title page). titleAlign: left or center.
- bodySize in points, lineSpacing in lines (1.15 normal, 1.5 airy, 2 double), paragraphSpacing in points after each paragraph, paragraphs: spaced or indented (first-line indent, no space between).
- tables: grid, lines (horizontal rules only), shaded (tinted header, banded rows). margins: narrow, normal, wide. pageNumber: footer or header (top right).`;

/**
 * The design part of the Word guidance. `documentDesign` is the choice made
 * in the composer's Design picker: a template id or "auto" (the default).
 */
function documentDesignGuidance(documentDesign) {
  if (DOCUMENT_PRESET_IDS.includes(documentDesign)) {
    return `Design: the user chose the "${documentDesign}" document template for Word and PDF (${getDocumentPresetText(documentDesign, 'en').feature}). Add "template: ${documentDesign}" to the front matter and no other design keys, even if earlier files in this conversation used another design. Only when the user's latest message asks for different colours, add "accent" (and "accent2") as "#RRGGBB". Other design changes are not possible with a template: say so briefly and suggest switching "Design" to AI adaptive.`;
  }
  return [
    'Design (AI adaptive, the user\'s choice): choose the document design yourself for this content, audience and purpose, and write every one of these keys in the front matter (one "key: value" line each). Follow any style the user asks for.',
    describeDocumentDesignParameters(),
    DOCUMENT_DESIGN_NOTES,
    `Templates for reference (you may add "template: <id>" as a base and override keys): ${DOCUMENT_PRESET_IDS.join(', ')}.`
  ].join('\n');
}

const XLSX_GUIDANCE = `## Excel workbooks (.xlsx)
Write a JSON workbook; the app writes a styled Excel file (coloured header row, banded rows, filters, frozen header, fitted column widths).
When the user wants Excel or a spreadsheet, name the file .xlsx, never .json: \`\`\`\`file budget.xlsx. The JSON goes directly inside the block, without a \`\`\`json fence.
{
  "accent": "#RRGGBB (optional header colour that suits the content)",
  "sheets": [
    { "name": "Sheet name (max 31 characters)",
      "columns": [ { "header": "Item" }, { "header": "Amount", "format": "integer" }, { "header": "Share", "format": "percent" } ],
      "rows": [ ["Rent", 1200, 0.4], ["Total", { "formula": "SUM(B2:B3)" }, { "formula": "SUM(C2:C3)" }] ],
      "freeze": "B2", "merges": ["A5:B5"] }
  ]
}
- Row 1 is the header row, so the first data row is row 2: write formula references for that layout.
- Write numbers as JSON numbers without thousands separators; percentages as fractions (0.125 for 12.5%); dates as "YYYY-MM-DD".
- Column "format": text, integer, decimal, percent, date, datetime, or a currency code (TWD, USD, EUR, JPY, CNY, GBP, HKD, KRW, RUB, SGD), or an Excel format string. A cell may override it with its own "format".
- Formulas only through "formula" (without "="), e.g. { "formula": "AVERAGE(B2:B9)" }; other sheets as 'Sheet name'!B2. Text is never a formula. No external data functions (WEBSERVICE, FILTERXML, RTD) or other workbooks.
- A cell may be { "value": …, "bold": true, "fill": "#RRGGBB", "color": "#RRGGBB", "align": "center", "wrap": true }. A last row labelled "Total" (or 合計 and so on) is styled as the total.
- "freeze" defaults to the header row; "autoFilter": false turns the filter off. Several sheets for separate tables.
- Native Excel charts: a sheet may have "charts": [{ "type": "column", "title": "Sales by market", "x": "Market", "y": ["2024", "2025"] }]. "x" is the category column and "y" the value columns (header or letter). Types: column, horizontalBar, line, area, pie, doughnut, scatter (x and y numeric), radar; "stacked": true for column, horizontalBar, line or area. Charts use every data row except a final total row ("rows": "2:9" to choose), follow edits in Excel, and are placed beside the table (or at "anchor": "H2"). Add a chart when the user asks for one or the data is a clear comparison or trend.
- Keep one table per sheet with one header row; put notes in the reply, not in extra rows. Write every value the user needs; never leave placeholder rows.`;

// PDFs are written like Word documents and share their design, so this
// section only names the differences.
const PDF_GUIDANCE = `## PDF documents (.pdf)
Write a PDF exactly like a Word document: the same Markdown body, front matter and design keys (including the design rules above). The app lays it out with the same template, embeds every font, and adds bookmarks for the sections.
- toc: true adds a table of contents with page numbers.
- Use .pdf when the user asks for PDF, a fixed layout, or a file to print or send; use .docx when they will edit it.
- Math: $$display$$ LaTeX is typeset; $inline$ formulas become text with superscripts and subscripts, so keep inline formulas simple and put fractions, matrices and long expressions in $$…$$.`;

const RICH_GUIDANCE = Object.freeze({
  docx: ({ documentDesign }) => `${DOCX_GUIDANCE}\n${documentDesignGuidance(documentDesign)}`,
  pdf: () => PDF_GUIDANCE,
  xlsx: () => XLSX_GUIDANCE,
  pptx: ({ deckDesign }) => `${PPTX_GUIDANCE}\n${presentationDesignGuidance(deckDesign)}`
});

export async function getFileAuthoringGuidance({ deckDesign = 'auto', documentDesign = 'auto' } = {}) {
  const sections = [GENERAL_GUIDANCE, TEXT_GUIDANCE];
  for (const [generator, guidance] of Object.entries(RICH_GUIDANCE)) {
    if (isGeneratorAvailable(generator)) sections.push(guidance({ deckDesign, documentDesign }));
  }
  return sections.join('\n\n');
}

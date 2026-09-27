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
{
  "title": "Deck title", "author": "Optional", "date": "Optional", "footer": "Optional",
  "preset": "consulting",
  "design": { "accent": "#1F6FEB" },
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
- Presets: keynote, whitespace, consulting, swiss, editorial, softlight, ainative, poster, neon, noir, readout, lecture, material, bauhaus, classic, humane, playful, carbon, brandbook, office. Pick the one that suits the topic and audience; "design" may override accent, accent2, mode (light/dark) or fonts only when the user asks for it.
- One idea per slide. Titles state the takeaway in at most two lines; bullets are short phrases, about 3–6 per slide. Longer lists continue onto a new slide automatically.
- Use **bold** inside text for the key words to emphasise; no other Markdown inside strings.
- Icons: package, globe, gauge, chart-bar, chart-line, trending-up, trending-down, users, user, target, rocket, lightbulb, shield, lock, clock, calendar, check, star, heart, leaf, building, map-pin, mail, settings, cpu, database, cloud, code, book, coins, handshake, sparkles.
- Images: "upload:1" is the first image the user attached to this conversation, "upload:2" the second. For any other picture write { "placeholder": "what the photo should show" }; the user replaces it in PowerPoint. Never use web URLs.
- Put what the presenter should say in "notes". Write every text in the language the user writes in.
- Output valid JSON. If you cannot, write Markdown instead: # Deck title, ## one slide each, - bullets, tables, \`\`\`chart blocks, > quotes, ![alt](upload:1), and a paragraph starting "Notes:" for speaker notes.`;

const RICH_GUIDANCE = Object.freeze({
  docx: DOCX_GUIDANCE,
  pptx: PPTX_GUIDANCE
});

export async function getFileAuthoringGuidance() {
  const sections = [GENERAL_GUIDANCE, TEXT_GUIDANCE];
  for (const [generator, guidance] of Object.entries(RICH_GUIDANCE)) {
    if (isGeneratorAvailable(generator)) sections.push(guidance);
  }
  return sections.join('\n\n');
}

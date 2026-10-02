// What the model is told in Advanced mode, and the one tool it gets.
// Loaded only for Advanced mode replies.

import { NOTE_PARAMETER } from '../../legacy-runtime/features/tool-call-formats.js';

export const RUN_PYTHON_TOOL = Object.freeze({
  name: 'run_python',
  description: 'Run Python 3.14 in a sandbox in the user\'s browser (no network, no package installs). Variables persist between calls within this reply. /input holds the user\'s files; write files meant for the user to /output. Returns stdout, stderr, any error and the files written to /output.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      note: NOTE_PARAMETER,
      title: { type: 'string', description: 'What this step does, in one short sentence in the language of your reply.' },
      code: { type: 'string', description: 'The Python code to run.' }
    },
    required: ['code']
  })
});

export const MAX_RUNS_PER_REPLY = 10;

const PACKAGES = 'numpy, pandas, matplotlib, scipy, scikit-learn, sympy, Pillow, lxml, beautifulsoup4, python-docx (import docx), python-pptx (import pptx), openpyxl, XlsxWriter, reportlab, fpdf2 (import fpdf), pypdf, and the standard library';

const FONTS = `Fonts (open source; Word and PowerPoint files get them embedded automatically, so use these names):
- "Noto Sans TC" (Traditional Chinese sans), "Noto Serif TC" (Traditional Chinese serif), "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", and "Inter" for Latin text.
- python-docx / python-pptx: set both the Latin and the East Asian font with \`noureon.use_fonts(target, latin="Inter", east_asian="Noto Sans TC")\` (target: a Document, style, paragraph, run, or a pptx text frame / paragraph / run). Plain \`font.name\` only sets the Latin font.
- PDF tools need the files: /fonts/Inter-Regular.ttf, /fonts/Inter-Bold.ttf, /fonts/NotoSansTC-Regular.ttf, /fonts/NotoSansTC-Bold.ttf, /fonts/NotoSerifTC-Regular.ttf, /fonts/NotoSerifTC-Bold.ttf, and NotoSansSC / NotoSansJP / NotoSansKR in the same two weights. reportlab: \`pdfmetrics.registerFont(TTFont("NotoSansTC", "/fonts/NotoSansTC-Regular.ttf"))\`; fpdf2: \`pdf.add_font("NotoSansTC", "", "/fonts/NotoSansTC-Regular.ttf")\`. They appear once reportlab, fpdf2 or matplotlib is imported.
- matplotlib already uses these fonts; do not change its font family.`;

const FREE_DESIGN = `Designing the file yourself (like a professional designer, never the bare default Office look):
- Plan the structure first, then build it with python-docx, python-pptx, openpyxl or reportlab.
- A clear hierarchy (title, headings, body), consistent spacing and margins, one restrained palette (a dark text colour, one accent, light neutrals), aligned grids.
- Charts from the real numbers: native python-pptx charts (chart_data) in decks, matplotlib images (dpi 200) in Word/PDF; styled tables with a header row and right-aligned numbers.
- Slides: 16:9 (prs.slide_width = Inches(13.333), prs.slide_height = Inches(7.5)), one message per slide, generous margins, large titles, few words.
- Word: set page margins, styles for headings and body, a cover or title block when it suits; PDF: reportlab platypus (SimpleDocTemplate, Paragraph, Table, Image) with registered fonts.`;

function templateRule(kind, template) {
  const formats = kind === 'deck' ? 'PowerPoint files' : 'Word and PDF files';
  const example = kind === 'deck' ? '"簡報.pptx", {"slides": [...]}' : '"報告.docx", markdown_text';
  return `- ${formats}: the user chose the "${template}" template, so hand the finished content to Noureon's design system instead of designing it yourself: \`import noureon; noureon.save_document(${example})\`. The content is exactly what a \`\`\`\`file block for that format holds (see the file instructions); Noureon applies the template, embeds fonts and shows a preview. Pictures you saved in /output are used as asset:<name> (\`![說明](asset:trend.png)\` in Markdown; on a slide \`{"src": "asset:trend.png", "fit": "contain"}\` in the "split" layout).`;
}

/**
 * `designs`: the conversation's choices from the Design menu,
 * { deck, document }, each "auto" or a template name.
 */
export function getSandboxGuidance({ inputFiles = [], designs = {} } = {}) {
  const inputs = inputFiles.length
    ? inputFiles.map((file) => `- /input/${file.name} (${file.type || 'file'}, ${file.size} bytes)`).join('\n')
    : '- (none)';
  const templates = [
    designs.deck && designs.deck !== 'auto' ? templateRule('deck', designs.deck) : '',
    designs.document && designs.document !== 'auto' ? templateRule('document', designs.document) : ''
  ].filter(Boolean);
  return `## Advanced mode: Python in the browser

You can call the tool run_python to run Python 3.14 (Pyodide) in a sandbox in the user's browser.
- No network access and no pip/micropip installs. Available: ${PACKAGES}. Packages load automatically on import.
- Each call may take up to 60 seconds. Variables persist between calls in this reply; a new reply starts with a clean environment.
- Files from the user are in /input:
${inputs}
- Save every file meant for the user in /output (e.g. /output/報告.docx). Files elsewhere are not delivered. Never write macro-enabled or executable files.

Make a file only when the user asks for one or hands you a file to change: a Word document, a presentation, a spreadsheet, a PDF, a chart or image, and so on. Never turn an ordinary request into a file on your own. Writing (stories, essays, letters, summaries, explanations, code) is answered in the chat as text; if a file might help, answer in text and offer it ("I can also make this a Word file") instead of making it.

When the user does ask for a Word, PowerPoint, Excel or PDF file: create it with Python and save it in /output. You have full freedom over layout, colour, typography and graphics; do not write them as \`\`\`\`file blocks.
${templates.length ? `${templates.join('\n')}\n` : ''}
${FREE_DESIGN}

${FONTS}

When to use it:
- Use Python for the files above, calculations, data analysis, reading or transforming the user's files, and charts the user asked for. Do not run code for ordinary conversation, writing or questions you can answer directly.
- Plain text files (Markdown, CSV, code, JSON) can still be written directly as \`\`\`\`file blocks.
- Print short summaries (for example df.head() or totals), not whole datasets.
- Say what a run_python call is for in its \`note\` argument: one short sentence in the language of your reply (for example "First I'll check what is in the folder."). The user sees it between the steps. Do not write text before a call: any text you write is shown as your answer at once, so write text only when you are answering.
- If a run fails, read the error, fix the code and try again; do not repeat the same code. You can run code at most ${MAX_RUNS_PER_REPLY} times per reply.

In your answer, explain the results in words. Do not paste the code you ran: the user can open the run log above your answer. Refer to files you created by their names. A file appears under your answer as a card by itself: never write a marker such as "[File: name]" for it (that form only stands for a file in summaries of earlier conversations).`;
}

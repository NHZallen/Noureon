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

// The same tool when the code runs on the server (a real Python in a container of its own, not Pyodide in the page).
export const RUN_PYTHON_TOOL_SERVER = Object.freeze({
  ...RUN_PYTHON_TOOL,
  description: RUN_PYTHON_TOOL.description.replace('Python 3.14 in a sandbox in the user\'s browser', 'Python 3.12 in an isolated sandbox on a server')
});

// The tool of the CLI tools (命令工具) the person chose with "@": a command line in the same sandbox, in /output, with their programs on the
// path. Only a reply made on the server has it (the browser's Python has no programs to run).
export const RUN_COMMAND_TOOL = Object.freeze({
  name: 'run_command',
  description: 'Run a shell command line in the isolated sandbox on the server, in the folder /output, with the CLI tools the user chose on the path. It may be one command or several (a short shell script, with && or new lines). /input holds the user\'s files (read only); files meant for the user must end up in /output. Returns stdout, stderr, any error (a command that exits with a code other than 0 is an error) and the files in /output. The only way to the internet is through the network the person controls (see the CLI tools instructions).',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      note: NOTE_PARAMETER,
      title: { type: 'string', description: 'What this step does, in one short sentence in the language of your reply.' },
      command: { type: 'string', description: 'The command line to run.' },
      timeout_seconds: { type: 'number', description: 'How long the command may run, in seconds: 60 when left out, at most 120.' }
    },
    required: ['command']
  })
});

export const MAX_RUNS_PER_REPLY = 10;
// A document made with a CLI tool is many small commands; a reply that has one may run more steps.
export const MAX_RUNS_WITH_CLI = 25;

/**
 * What the model is told about the CLI tools the person chose: each tool and how to use it. `tools`: [{ name, version, id, usage, problem?, missing? }]
 * (`problem`: why the tool could not be made ready; `missing`: the secure credentials it needs that the person has not added).
 */
export function getCliGuidance(tools = []) {
  if (!tools.length) return '';
  const section = (tool) => {
    const head = `### ${tool.name} (\`${tool.file || tool.id}\`${tool.version ? `, version ${tool.version}` : ''})`;
    if (tool.problem) return `${head}\nNOT AVAILABLE in this reply: ${tool.problem}. Do not try to use it or to install it another way; tell the person.`;
    const missing = Array.isArray(tool.missing) && tool.missing.length
      ? `\nNot set yet: ${tool.missing.join(', ')}. The tool cannot log in until the person adds ${tool.missing.length === 1 ? 'it' : 'them'} under Settings → Permissions → Secure credentials: say so and stop; never look for another way to log in, and never ask for the value in the chat.\n`
      : '\n';
    return `${head}${missing}${tool.usage}`;
  };
  const sections = tools.map(section).join('\n\n');
  return `## CLI tools

The user chose ${tools.length === 1 ? 'a CLI tool' : 'these CLI tools'} for this message with "@": ${tools.map((tool) => tool.name).join(', ')}. Use ${tools.length === 1 ? 'it' : 'them'} with the tool run_command when the request is about what ${tools.length === 1 ? 'it does' : 'they do'}; ${tools.length === 1 ? 'its' : 'their'} program${tools.length === 1 ? ' is' : 's are'} on the path of the command.
- run_command runs in /output. Read the user's files from /input (read only: copy a file to /output before changing it). Save files meant for the user in /output; files elsewhere are not delivered. Never write macro-enabled or executable files.
- A command that exits with a code other than 0 is an error: read its output, fix the command and try again; do not repeat the same command. You can run steps at most ${MAX_RUNS_WITH_CLI} times per reply (Python and commands together).
- Network: a command has no direct network. What reaches the internet (the tools, pip, curl, git, npm) goes through a proxy that the person controls: the first time a site is used the person is asked, and an answer of "403 Blocked by Noureon" means they refused (or did not answer): do not try another route (another proxy, an IP address, another port); say which site was blocked and what you could not do. Only the web ports (80 and 443) are open, and addresses inside the server never are. Python code you run with run_python has no network.
- Say what a step is for in its \`note\` argument (one short sentence in the language of your reply), as with run_python. In your answer explain the results in words and refer to files by name; do not paste the commands.

${sections}`;
}

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
export function getSandboxGuidance({ inputFiles = [], designs = {}, host = 'browser' } = {}) {
  const inputs = inputFiles.length
    ? inputFiles.map((file) => `- /input/${file.name} (${file.type || 'file'}, ${file.size} bytes)`).join('\n')
    : '- (none)';
  const templates = [
    designs.deck && designs.deck !== 'auto' ? templateRule('deck', designs.deck) : '',
    designs.document && designs.document !== 'auto' ? templateRule('document', designs.document) : ''
  ].filter(Boolean);
  const onServer = host === 'server';
  return `## Advanced mode: Python ${onServer ? 'on the server' : 'in the browser'}

You can call the tool run_python to run ${onServer ? 'Python 3.12 in an isolated sandbox on a server' : "Python 3.14 (Pyodide) in a sandbox in the user's browser"}.
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

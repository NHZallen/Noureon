// What the model is told in Advanced mode, and the one tool it gets.
// Loaded only for Advanced mode replies.

export const RUN_PYTHON_TOOL = Object.freeze({
  name: 'run_python',
  description: 'Run Python 3.14 in a sandbox in the user\'s browser (no network, no package installs). Variables persist between calls within this reply. /input holds the user\'s files; write files meant for the user to /output. Returns stdout, stderr, any error and the files written to /output.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      title: { type: 'string', description: 'What this step does, in one short sentence in the language of your reply.' },
      code: { type: 'string', description: 'The Python code to run.' }
    },
    required: ['code']
  })
});

export const MAX_RUNS_PER_REPLY = 10;

const PACKAGES = 'numpy, pandas, matplotlib, scipy, scikit-learn, sympy, Pillow, lxml, beautifulsoup4, python-docx (import docx), python-pptx (import pptx), openpyxl, XlsxWriter, fpdf2 (import fpdf), pypdf, and the standard library';

export function getSandboxGuidance({ inputFiles = [] } = {}) {
  const inputs = inputFiles.length
    ? inputFiles.map((file) => `- /input/${file.name} (${file.type || 'file'}, ${file.size} bytes)`).join('\n')
    : '- (none)';
  return `## Advanced mode: Python in the browser

You can call the tool run_python to run Python 3.14 (Pyodide) in a sandbox in the user's browser.
- No network access and no pip/micropip installs. Available: ${PACKAGES}. Packages load automatically on import.
- Each call may take up to 60 seconds. Variables persist between calls in this reply; a new reply starts with a clean environment.
- Files from the user are in /input:
${inputs}
- Save every file meant for the user in /output (e.g. /output/report.xlsx). Files elsewhere are not delivered. Never write macro-enabled or executable files.
- matplotlib already uses fonts that cover Chinese, Japanese and Korean; do not change the font family. Save charts with plt.savefig('/output/<name>.png', dpi=150, bbox_inches='tight').

Word, PowerPoint, Excel and PDF files:
- Compute in Python, then hand the finished content to Noureon's design system: \`import noureon; noureon.save_document("報告.docx", content)\`. \`content\` is exactly what a \`\`\`\`file block for that format holds (Markdown text, or a dict / list for the JSON form, as described in the file instructions). Noureon lays it out with the design chosen in the chat, embeds the fonts and shows a preview; the file appears after your answer.
- Put computed numbers into native charts (a \`\`\`chart block in Word/PDF Markdown, the chart fields of a slide or sheet) so they stay editable in Office.
- For a picture only matplotlib can draw, save it to /output (e.g. /output/trend.png) and refer to it as asset:trend.png: \`![Trend](asset:trend.png)\` in Word/PDF Markdown, or on a slide an image \`{"src": "asset:trend.png", "fit": "contain"}\` in the "split" layout (the "image" layout is a full-bleed photo and crops charts).
- Use python-docx, python-pptx, openpyxl or fpdf2 directly only for what the design system cannot do (for example editing a file the user uploaded, or merging PDFs); save the result in /output.

When to use it:
- Use Python for calculations, data analysis, reading or transforming the user's files, and charts or files that need exact numbers. Do not run code for ordinary conversation or plain writing.
- A document that is only text can still be written directly as a \`\`\`\`file block, which is faster.
- Print short summaries (for example df.head() or totals), not whole datasets.
- If a run fails, read the error, fix the code and try again; do not repeat the same code. You can run code at most ${MAX_RUNS_PER_REPLY} times per reply.

In your answer, explain the results in words. Do not paste the code you ran: the user can open the run log above your answer. Refer to files you created by their names.`;
}

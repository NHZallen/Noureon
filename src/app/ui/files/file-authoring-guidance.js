import { isGeneratorAvailable } from './file-type-registry.js';

// Loaded on demand from stream-api-call.js. Keep the wording imperative and
// compact: this text is sent with every request that looks file-related.

const GENERAL_GUIDANCE = `# Downloadable file output

This app turns a special fenced block into a real downloadable file with a download button. You CAN deliver files this way, so never say you are unable to create or attach files.
Use a file block only when the user asks for a file, a download or an export, or names a file format. Otherwise answer normally.

Format: the opening line is four backticks, the word file, a space and the file name with its extension. The closing line is four backticks.
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

const RICH_GUIDANCE_LOADERS = Object.freeze({});

export async function getFileAuthoringGuidance() {
  const sections = [GENERAL_GUIDANCE, TEXT_GUIDANCE];
  for (const [generator, load] of Object.entries(RICH_GUIDANCE_LOADERS)) {
    if (isGeneratorAvailable(generator)) sections.push(await load());
  }
  return sections.join('\n\n');
}

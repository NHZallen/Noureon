// PRIVACY.md is made from the English privacy policy of src/data/legal/en.js, so the file in the repository, the page noureon.com/privacy and the
// settings never say different things. Run `node scripts/generate-privacy-md.mjs` after changing the policy (tests/legal-texts.test.js checks the file is current).

import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { LEGAL } from '../src/data/legal/index.js';

export function renderPrivacyMarkdown(doc = LEGAL.en.privacy) {
  const blocks = (list) => list.map((block) => (Array.isArray(block) ? block.map((item) => `- ${item}`).join('\n') : block)).join('\n\n');
  return `${[
    '# Privacy',
    `_${doc.updated}_`,
    '> This file is made from `src/data/legal/en.js` (`node scripts/generate-privacy-md.mjs`). The same text, in five languages, is published at https://noureon.com/privacy.',
    doc.intro.join('\n\n'),
    ...doc.sections.map((section) => `## ${section.h}\n\n${blocks(section.blocks)}`)
  ].join('\n\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(new URL('../PRIVACY.md', import.meta.url), renderPrivacyMarkdown());
  console.log('PRIVACY.md written');
}

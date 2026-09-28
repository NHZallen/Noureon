// Builds the font files generated documents embed (src/assets/fonts/).
//
// Sources are the SIL OFL fonts in the Google Fonts repository at a pinned
// commit. Each is reduced to the characters documents need, keeping variable
// axes so any weight can still be pinned when a file is generated:
//   - Latin faces: Latin, Latin-1, Latin Extended, Cyrillic, punctuation,
//     currency, arrows and the shapes used for trend marks;
//   - Traditional Chinese faces: the Big5 common set (level 1, about 5,400
//     characters) plus Big5 symbols, CJK punctuation and full-width forms.
//     Rarer characters fall back to the reader's system font.
//   - for PDFs only, which must carry every glyph: Simplified Chinese (GB 2312
//     level 1), Japanese (kana and JIS level 1 kanji), Korean (KS X 1001
//     hangul) and the monochrome Noto Emoji.
//
// Downloads are cached in node_modules/.cache/noureon-fonts. Run with
// `node scripts/build-fonts.mjs`; commit the files it writes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFontSubsetter, readFontInfo } from '../src/app/ui/files/generators/font-embedding.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'src/assets/fonts');
const cacheDirectory = join(root, 'node_modules/.cache/noureon-fonts');
const COMMIT = '23e54b51ddffbc7713c583748e3bd86f62b1fa4a';

const LATIN = 'latin';
const CJK = 'cjk';
const SC = 'sc';
const JP = 'jp';
const KR = 'kr';
const EMOJI = 'emoji';

// output file, repository path, character set
const FONTS = [
  ['inter.ttf', 'ofl/inter/Inter[opsz,wght].ttf', LATIN],
  ['inter-tight.ttf', 'ofl/intertight/InterTight[wght].ttf', LATIN],
  ['manrope.ttf', 'ofl/manrope/Manrope[wght].ttf', LATIN],
  ['oswald.ttf', 'ofl/oswald/Oswald[wght].ttf', LATIN],
  ['playfair-display.ttf', 'ofl/playfairdisplay/PlayfairDisplay[wght].ttf', LATIN],
  ['instrument-serif.ttf', 'ofl/instrumentserif/InstrumentSerif-Regular.ttf', LATIN],
  ['source-serif-4.ttf', 'ofl/sourceserif4/SourceSerif4[opsz,wght].ttf', LATIN],
  ['source-sans-3.ttf', 'ofl/sourcesans3/SourceSans3[wght].ttf', LATIN],
  ['cormorant-garamond.ttf', 'ofl/cormorantgaramond/CormorantGaramond[wght].ttf', LATIN],
  ['lora.ttf', 'ofl/lora/Lora[wght].ttf', LATIN],
  ['nunito.ttf', 'ofl/nunito/Nunito[wght].ttf', LATIN],
  ['ibm-plex-sans.ttf', 'ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf', LATIN],
  ['ibm-plex-mono-regular.ttf', 'ofl/ibmplexmono/IBMPlexMono-Regular.ttf', LATIN],
  ['ibm-plex-mono-medium.ttf', 'ofl/ibmplexmono/IBMPlexMono-Medium.ttf', LATIN],
  ['ibm-plex-mono-bold.ttf', 'ofl/ibmplexmono/IBMPlexMono-Bold.ttf', LATIN],
  ['noto-sans-tc.ttf', 'ofl/notosanstc/NotoSansTC[wght].ttf', CJK],
  ['noto-serif-tc.ttf', 'ofl/notoseriftc/NotoSerifTC[wght].ttf', CJK],
  ['cactus-classical-serif.ttf', 'ofl/cactusclassicalserif/CactusClassicalSerif-Regular.ttf', CJK],
  ['lxgw-wenkai-tc-regular.ttf', 'ofl/lxgwwenkaitc/LXGWWenKaiTC-Regular.ttf', CJK],
  ['lxgw-wenkai-tc-bold.ttf', 'ofl/lxgwwenkaitc/LXGWWenKaiTC-Bold.ttf', CJK],
  ['huninn.ttf', 'ofl/huninn/Huninn-Regular.ttf', CJK],
  // PDF only: a PDF must carry every glyph it shows, while Word and
  // PowerPoint use the fonts Windows installs for these scripts.
  ['noto-sans-sc.ttf', 'ofl/notosanssc/NotoSansSC[wght].ttf', SC],
  ['noto-sans-jp.ttf', 'ofl/notosansjp/NotoSansJP[wght].ttf', JP],
  ['noto-sans-kr.ttf', 'ofl/notosanskr/NotoSansKR[wght].ttf', KR],
  ['noto-emoji.ttf', 'ofl/notoemoji/NotoEmoji[wght].ttf', EMOJI]
];

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => String.fromCodePoint(from + index)).join('');

const SHARED = [
  range(0x20, 0x7E), range(0xA0, 0xFF), range(0x2000, 0x206F), range(0x20A0, 0x20CF),
  range(0x2100, 0x214F), range(0x2190, 0x21FF), range(0x2212, 0x2212), range(0x2264, 0x2265),
  range(0x25A0, 0x25FF)
].join('');

const TRAIL_BYTES = {
  big5: [...range(0x40, 0x7E), ...range(0xA1, 0xFE)],
  gbk: [...range(0xA1, 0xFE)],
  'euc-kr': [...range(0xA1, 0xFE)],
  shift_jis: [...range(0x40, 0x7E), ...range(0x80, 0xFC)]
};

const big5Characters = (from, to) => doubleByteCharacters('big5', from, to);

// The characters of a legacy double-byte character set range, which is how
// national standards define their common characters.
function doubleByteCharacters(encoding, from, to) {
  const decoder = new TextDecoder(encoding);
  const trails = TRAIL_BYTES[encoding].map((char) => char.codePointAt(0));
  let output = '';
  for (let lead = from >> 8; lead <= to >> 8; lead += 1) {
    for (const trail of trails) {
      const code = (lead << 8) | trail;
      if (code < from || code > to) continue;
      const char = decoder.decode(new Uint8Array([lead, trail]));
      if (char && char.codePointAt(0) !== 0xFFFD) output += char;
    }
  }
  return output;
}

const CJK_SHARED = SHARED + range(0x3000, 0x303F) + range(0xFF01, 0xFF5E);

const CHARACTER_SETS = {
  [LATIN]: SHARED + range(0x100, 0x24F) + range(0x400, 0x52F),
  [CJK]: CJK_SHARED + big5Characters(0xA140, 0xA3BF) + big5Characters(0xA440, 0xC67E),
  // GB 2312 symbols and level 1 hanzi (3,755 characters).
  [SC]: CJK_SHARED + doubleByteCharacters('gbk', 0xA1A1, 0xA9FE) + doubleByteCharacters('gbk', 0xB0A1, 0xD7FE),
  // Kana and JIS X 0208 symbols and level 1 kanji (2,965 characters).
  [JP]: CJK_SHARED + range(0x3040, 0x30FF) + range(0x31F0, 0x31FF) + range(0xFF61, 0xFF9F)
    + doubleByteCharacters('shift_jis', 0x8140, 0x84BE) + doubleByteCharacters('shift_jis', 0x889F, 0x9872),
  // Hangul jamo, KS X 1001 symbols and its 2,350 hangul syllables.
  [KR]: CJK_SHARED + range(0x1100, 0x11FF) + range(0x3130, 0x318F)
    + doubleByteCharacters('euc-kr', 0xA1A1, 0xA2FE) + doubleByteCharacters('euc-kr', 0xB0A1, 0xC8FE),
  // Emoji and the symbols emoji sequences are built from.
  [EMOJI]: range(0x20, 0x7E) + '©®‍⃣™ℹ〰〽㊗㊙︎️'
    + range(0x2190, 0x21FF) + range(0x2300, 0x23FF) + range(0x24C2, 0x24C2) + range(0x25A0, 0x27BF)
    + range(0x2900, 0x297F) + range(0x2B00, 0x2BFF) + range(0x1F000, 0x1FAFF) + range(0xE0020, 0xE007F)
};

async function download(path) {
  const target = join(cacheDirectory, COMMIT, path.replace(/[[\]]/g, '_'));
  if (existsSync(target)) return readFileSync(target);
  const url = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/${path.replace(/\[/g, '%5B').replace(/\]/g, '%5D')}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return bytes;
}

const subsetter = await createFontSubsetter(readFileSync(join(root, 'node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm')));
mkdirSync(outputDirectory, { recursive: true });

const licenses = new Map();
const rows = [];
for (const [file, path, set] of FONTS) {
  const source = await download(path);
  const output = subsetter.subset(source, CHARACTER_SETS[set]);
  writeFileSync(join(outputDirectory, file), output);
  const info = readFontInfo(output);
  rows.push(`${file.padEnd(30)} ${info.family.padEnd(24)} ${(source.length / 1e6).toFixed(2).padStart(6)} MB -> ${(output.length / 1e6).toFixed(2).padStart(5)} MB  sha256:${createHash('sha256').update(output).digest('hex').slice(0, 12)}`);
  const licensePath = `${path.slice(0, path.lastIndexOf('/'))}/OFL.txt`;
  if (!licenses.has(licensePath)) licenses.set(licensePath, { families: new Set(), text: (await download(licensePath)).toString('utf8') });
  licenses.get(licensePath).families.add(info.family);
}

const licenseText = [
  'Fonts embedded in generated documents',
  `Source: https://github.com/google/fonts at ${COMMIT}, reduced to the characters documents use (scripts/build-fonts.mjs).`,
  'All are licensed under the SIL Open Font License 1.1.',
  ''
];
for (const [path, { families, text }] of licenses) {
  licenseText.push('='.repeat(78), `${[...families].join(', ')} (${path})`, '='.repeat(78), text.trim(), '');
}
writeFileSync(join(outputDirectory, 'LICENSES.txt'), `${licenseText.join('\n')}\n`);
console.log(rows.join('\n'));
